import { existsSync } from 'node:fs'
import path from 'node:path'

import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryRoot = path.resolve('.')
const chromeExecutable = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const describeWithChrome = existsSync(chromeExecutable) ? describe : describe.skip
// Keep the Vite config hash stable so the isolated optimizer cache can be
// reused across release-gate runs. Vite will select the next free port when
// this preferred port is occupied by another local process.
const UPDATE_SECTION_VITE_PORT = 41_730
const UPDATE_SECTION_VITE_CACHE_DIR = path.join(repositoryRoot, '.runtime', '.cache', 'update-section-vite-v2')
const UPDATE_SECTION_WORKFLOW_FIXTURE = path.join(repositoryRoot, 'scripts', 'browser-fixtures', 'update-workflow-store.ts')
const UPDATE_SECTION_ICON_FIXTURE = path.join(repositoryRoot, 'scripts', 'browser-fixtures', 'update-icons.tsx')
// The full desktop suite exercises native workers and PowerShell processes at
// the same time. On a clean Windows checkout Vite may also rebuild its React
// dependency cache before the first page can execute; allow that cold start
// without hiding assertion failures in the interaction itself.
// The first Vite transform of the full renderer graph can exceed three minutes
// on a clean Windows release checkout. This is a cold-start budget, not an
// assertion retry: once the page is ready every interaction remains bounded by
// Playwright's normal locator/function timeouts.
const COLD_BROWSER_INTERACTION_TIMEOUT_MS = 600_000
const VITE_SERVER_HOOK_TIMEOUT_MS = 600_000

describeWithChrome('UpdateSection browser interactions', () => {
  let server: ViteDevServer
  let browser: Browser
  let pageUrl: string

  beforeAll(async () => {
    server = await createServer({
      root: repositoryRoot,
      configFile: false,
      plugins: [
        {
          name: 'update-section-workflow-store-fixture',
          enforce: 'pre',
          resolveId(source) {
            const normalized = source.replaceAll('\\\\', '/').split('?')[0]
            if (source === 'lucide-react') return UPDATE_SECTION_ICON_FIXTURE
            return /[\\/]stores[\\/]workflow-store(?:\.ts)?$/u.test(normalized)
              ? UPDATE_SECTION_WORKFLOW_FIXTURE
              : undefined
          },
        },
        react(),
      ],
      optimizeDeps: {
        noDiscovery: true,
        holdUntilCrawlEnd: false,
        include: [
          'react',
          'react-dom/client',
          'react/jsx-dev-runtime',
        ],
      },
      // Keep this fixture's optimizer metadata isolated from the other script
      // browser suites. Discovery of the desktop index caused a clean run to
      // rebuild hundreds of unrelated dependencies before the first button
      // could render.
      cacheDir: UPDATE_SECTION_VITE_CACHE_DIR,
      server: { host: '127.0.0.1', port: UPDATE_SECTION_VITE_PORT, strictPort: false },
      appType: 'spa',
    })
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') throw new Error('Unable to determine browser harness address')
    pageUrl = `http://127.0.0.1:${address.port}/scripts/browser-fixtures/update-section-harness.html`
    browser = await chromium.launch({ executablePath: chromeExecutable, headless: true })
    // Prime the full browser module graph before the first assertion. On a
    // Windows cold cache the first Vite transform can take several minutes;
    // doing it in the suite hook keeps that bounded cost out of one locator
    // timeout and makes parallel root runs deterministic.
    const warmup = await browser.newPage()
    try {
      await warmup.goto(pageUrl, { timeout: COLD_BROWSER_INTERACTION_TIMEOUT_MS })
      await warmup.getByRole('button', { name: '立即重启更新' }).waitFor({ timeout: COLD_BROWSER_INTERACTION_TIMEOUT_MS })
    } finally {
      await warmup.close()
    }
  }, VITE_SERVER_HOOK_TIMEOUT_MS)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  }, VITE_SERVER_HOOK_TIMEOUT_MS)

  async function openHarness(): Promise<Page> {
    const page = await browser.newPage()
    await page.goto(pageUrl, { timeout: COLD_BROWSER_INTERACTION_TIMEOUT_MS })
    await page.getByRole('button', { name: '立即重启更新' }).waitFor()
    return page
  }

  it('requires an explicit save-or-discard decision before restarting an update with dirty tabs', async () => {
    const page = await openHarness()

    await page.getByRole('button', { name: '立即重启更新' }).click()
    expect(await page.getByText('请先处理未保存的修改').isVisible()).toBe(true)
    expect(await page.evaluate(() => window.__updateHarness.installCalls)).toBe(0)

    await page.getByRole('button', { name: '返回保存' }).click()
    expect(await page.evaluate(() => window.__updateHarness.installCalls)).toBe(0)

    await page.getByRole('button', { name: '立即重启更新' }).click()
    await page.getByRole('button', { name: '放弃修改并重启更新' }).click()
    await page.waitForFunction(() => window.__updateHarness.installCalls === 1)
    expect(await page.evaluate(() => window.__updateHarness.installCalls)).toBe(1)
    await page.close()
  }, COLD_BROWSER_INTERACTION_TIMEOUT_MS)

  it.each(['running', 'paused', 'waiting', 'completed', 'failed'] as const)(
    'blocks restarting an update while a %s workflow may still have unpersisted results',
    async (status) => {
      const page = await openHarness()
      await page.evaluate((nextStatus) => {
        window.__updateHarness.setActiveWorkflowStatuses([nextStatus])
      }, status)

      await page.getByRole('button', { name: '立即重启更新' }).click()

      expect(await page.getByText('创作任务尚未结束，暂不能更新').isVisible()).toBe(true)
      expect(await page.getByText(/结果可能尚未完整写入项目/).isVisible()).toBe(true)
      expect(await page.evaluate(() => window.__updateHarness.installCalls)).toBe(0)
      expect(await page.getByText('请先处理未保存的修改').count()).toBe(0)
      await page.close()
    },
    COLD_BROWSER_INTERACTION_TIMEOUT_MS,
  )

  it('rechecks workflows before the final discard-and-install action', async () => {
    const page = await openHarness()

    await page.getByRole('button', { name: '立即重启更新' }).click()
    expect(await page.getByText('请先处理未保存的修改').isVisible()).toBe(true)

    await page.evaluate(() => {
      window.__updateHarness.setActiveWorkflowStatuses(['running'])
    })
    await page.getByRole('button', { name: '放弃修改并重启更新' }).click()

    expect(await page.getByText('创作任务尚未结束，暂不能更新').isVisible()).toBe(true)
    expect(await page.evaluate(() => window.__updateHarness.installCalls)).toBe(0)
    await page.close()
  }, COLD_BROWSER_INTERACTION_TIMEOUT_MS)

  it('does not recheck after download and offers an explicit seven-day later action', async () => {
    const page = await openHarness()

    expect(await page.getByRole('button', { name: '检查更新' }).isDisabled()).toBe(true)
    await page.getByRole('button', { name: '稍后（7天后提醒）', exact: true }).click()
    await page.waitForFunction(() => window.__updateHarness.deferCalls.includes(7))

    expect(await page.evaluate(() => window.__updateHarness.checkCalls)).toBe(0)
    expect(await page.evaluate(() => window.__updateHarness.deferCalls)).toEqual([7])
    expect(await page.getByText('更新已准备就绪').count()).toBe(0)
    await page.close()
  }, COLD_BROWSER_INTERACTION_TIMEOUT_MS)

  it('uses the visible thirty-day action to postpone a downloaded update', async () => {
    const page = await openHarness()

    await page.getByRole('button', { name: '30 天后提醒', exact: true }).click()
    await page.waitForFunction(() => window.__updateHarness.deferCalls.includes(30))

    expect(await page.evaluate(() => window.__updateHarness.deferCalls)).toEqual([30])
    expect(await page.getByText('更新已准备就绪').count()).toBe(0)
    await page.close()
  }, COLD_BROWSER_INTERACTION_TIMEOUT_MS)

  it('treats closing the update card as a seven-day reminder postponement', async () => {
    const page = await openHarness()

    await page.getByRole('button', { name: '关闭并在 7 天后提醒' }).click()
    await page.waitForFunction(() => window.__updateHarness.deferCalls.includes(7))

    expect(await page.evaluate(() => window.__updateHarness.deferCalls)).toEqual([7])
    expect(await page.getByText('更新已准备就绪').count()).toBe(0)
    await page.close()
  }, COLD_BROWSER_INTERACTION_TIMEOUT_MS)

  it('keeps the official homepage beside the update action and invokes its fixed no-argument intent', async () => {
    const page = await openHarness()
    const actionGroup = page.getByTestId('update-entry-actions')

    expect((await actionGroup.getByRole('button').allTextContents()).map(label => label.trim()))
      .toEqual(['官方主页', '检查更新'])
    expect(await actionGroup.evaluate((element) => {
      const [homepage, update] = Array.from(element.querySelectorAll('button'))
      if (!homepage || !update) return false
      const homepageBox = homepage.getBoundingClientRect()
      const updateBox = update.getBoundingClientRect()
      return homepageBox.right <= updateBox.left && Math.abs(homepageBox.top - updateBox.top) < 1
    })).toBe(true)

    await page.getByRole('button', { name: '官方主页' }).click()
    await page.waitForFunction(() => {
      const harness = (window as unknown as { __updateHarness: { officialHomepageRequests: unknown[] } }).__updateHarness
      return harness.officialHomepageRequests.length === 1
    })

    expect(await page.evaluate(() => (
      (window as unknown as { __updateHarness: { officialHomepageRequests: unknown[] } }).__updateHarness.officialHomepageRequests
    ))).toEqual([{ channel: 'official-homepage:open', args: [] }])
    await page.close()
  }, COLD_BROWSER_INTERACTION_TIMEOUT_MS)

  it('uses English homepage copy and shows a localized error when its trusted intent fails', async () => {
    const page = await openHarness()

    await page.evaluate(() => {
      const harness = (window as unknown as {
        __updateHarness: {
          setLocale: (locale: 'en-US') => void
          setOfficialHomepageFailure: (shouldFail: boolean) => void
        }
      }).__updateHarness
      harness.setLocale('en-US')
      harness.setOfficialHomepageFailure(true)
    })

    await page.getByRole('button', { name: 'Official Website' }).click()
    expect(await page.getByText('Unable to open the official homepage. Please try again later.').isVisible()).toBe(true)
    await page.close()
  }, COLD_BROWSER_INTERACTION_TIMEOUT_MS)
})
