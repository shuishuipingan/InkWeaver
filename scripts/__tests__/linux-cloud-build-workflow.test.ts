import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'linux-cloud-build.yml')
const buildScriptPath = path.join(repositoryRoot, 'scripts', 'build-linux-package-container.sh')
const smokeScriptPath = path.join(repositoryRoot, 'scripts', 'smoke-linux-packages.mjs')

describe('Linux x64 desktop qualification workflow', () => {
  it('uses immutable release inputs, a pinned Ubuntu build image, and all required test and package gates', () => {
    expect(existsSync(workflowPath)).toBe(true)
    const workflow = readFileSync(workflowPath, 'utf8')
    const buildScript = readFileSync(buildScriptPath, 'utf8')
    const smokeScript = readFileSync(smokeScriptPath, 'utf8')

    expect(workflow).toContain('workflow_dispatch:')
    for (const input of ['expected_sha', 'release_tag', 'release_version', 'profile_path']) {
      expect(workflow).toContain(`      ${input}:`)
    }
    expect(workflow).toContain('runs-on: ubuntu-24.04')
    expect(buildScript).toContain('829f6df217bcbae2b371026e81711d1a787c61b2967ad09d015063663ebafbf7')
    expect(buildScript).toContain('docker run --rm --interactive --platform')
    expect(buildScript).toContain('corepack enable --install-directory /usr/local/bin')
    expect(buildScript).toContain('export CI=true')
    expect(buildScript).toContain('ca-certificates')
    expect(buildScript).toContain('SSL_CERT_FILE=/host-ca-certificates.crt')
    expect(buildScript).toContain('pnpm run build:linux:artifacts')
    expect(workflow).toContain('pnpm run test:browser')
    expect(workflow).toContain('pnpm test')
    expect(workflow).toContain('scripts/smoke-linux-packages.mjs')
    for (const image of ['ubuntu:22.04', 'debian:13-slim', 'fedora:44']) {
      expect(smokeScript).toContain(image)
    }
    expect(smokeScript).toContain('--appimage-extract-and-run')
    expect(workflow).toContain('release-evidence-v2.mjs finalize --platform linux-x64')
    expect(workflow).toContain('release-evidence-v2.mjs verify-bundle --platform linux-x64')
    expect(workflow).toContain('project-legacy-qualification.mjs --platform linux-x64')
    expect(workflow).toContain('finalize-legacy-qualification.mjs --platform linux-x64')
    expect(workflow).toContain('name: qualified-linux-x64')
    expect(workflow).toContain('path: .release-qualified/linux-x64')
    expect(workflow).toContain("--workflow-path '.github/workflows/linux-cloud-build.yml'")
    expect(workflow).toContain("--workflow-name 'Linux x64 cloud package qualification'")
    expect(workflow).toContain('dispatch_inputs=')
    expect(workflow).toContain('--dispatch-inputs-json "$dispatch_inputs"')
  })

  it('installs the rpm builder before packaging the rpm target', () => {
    const buildScript = readFileSync(buildScriptPath, 'utf8')

    expect(buildScript).toMatch(/apt-get install[^\r\n]*\brpm\b/)
  })

  it('returns container-built release files to the host runner before qualification writes', () => {
    const buildScript = readFileSync(buildScriptPath, 'utf8')

    expect(buildScript).toContain('--env HOST_UID=')
    expect(buildScript).toContain('--env HOST_GID=')
    expect(buildScript).toContain('chown -R "$HOST_UID:$HOST_GID" release')
  })
})
