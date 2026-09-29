import { afterEach, describe, expect, it } from 'vitest'

import {
  claimReleaseDesktopSmokeInvocation,
  parseReleaseDesktopSmokeInvocation,
  releaseDesktopSmokeWasRequested,
  validatePackagedDesktopSmokeObservation,
} from '../release-desktop-smoke'

const previousSmoke = process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE
const previousToken = process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN
const previousArgv = [...process.argv]

function smokeEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.AI_NOVEL_RELEASE_DESKTOP_SMOKE
  delete environment.AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN
  Object.assign(environment, overrides)
  return environment
}

afterEach(() => {
  if (previousSmoke === undefined) delete process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE
  else process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE = previousSmoke
  if (previousToken === undefined) delete process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN
  else process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN = previousToken
  process.argv.splice(0, process.argv.length, ...previousArgv)
})

describe('packaged desktop startup smoke', () => {
  it('requires one matching environment and CLI token', () => {
    const token = 'a'.repeat(32)
    const args = ['InkWeaver', `--ai-novel-release-desktop-smoke=${token}`]
    const env = smokeEnv({
      AI_NOVEL_RELEASE_DESKTOP_SMOKE: '1',
      AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN: token,
    })

    expect(releaseDesktopSmokeWasRequested(args)).toBe(true)
    expect(parseReleaseDesktopSmokeInvocation(args, env)).toEqual({ token })
    expect(parseReleaseDesktopSmokeInvocation(args, smokeEnv())).toBeUndefined()
    expect(parseReleaseDesktopSmokeInvocation([...args, args[1]!], env)).toBeUndefined()
    expect(parseReleaseDesktopSmokeInvocation(args, smokeEnv({
      AI_NOVEL_RELEASE_DESKTOP_SMOKE: '1',
      AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN: 'b'.repeat(32),
    }))).toBeUndefined()
  })

  it('claims the one-time desktop startup request only once', () => {
    const token = 'c'.repeat(32)
    process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE = '1'
    process.env.AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN = token
    process.argv.push(`--ai-novel-release-desktop-smoke=${token}`)

    expect(claimReleaseDesktopSmokeInvocation()).toEqual({ token })
    expect(claimReleaseDesktopSmokeInvocation()).toBeUndefined()
  })

  it('requires a loaded packaged URL, visible window, preload bridge, and rendered app root', () => {
    const expectedUrl = 'file:///opt/InkWeaver/resources/app/dist/index.html'
    const observation = {
      url: expectedUrl,
      expectedUrl,
      windowReady: true,
      rendererLoaded: true,
      preloadApiReady: true,
      appRootReady: true,
    }

    expect(validatePackagedDesktopSmokeObservation(observation)).toMatchObject({
      schemaVersion: 1,
      kind: 'packaged-desktop-smoke',
      windowReady: true,
      rendererLoaded: true,
      preloadApiReady: true,
      appRootReady: true,
    })
    expect(() => validatePackagedDesktopSmokeObservation({ ...observation, preloadApiReady: false })).toThrow(/preload bridge/)
    expect(() => validatePackagedDesktopSmokeObservation({ ...observation, url: 'http://127.0.0.1:5173/' })).toThrow(/packaged renderer URL/)
    expect(() => validatePackagedDesktopSmokeObservation({ ...observation, appRootReady: false })).toThrow(/application root/)
  })
})
