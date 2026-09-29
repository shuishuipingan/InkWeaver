const RELEASE_DESKTOP_SMOKE_ARGUMENT_PREFIX = '--ai-novel-release-desktop-smoke='

export interface ReleaseDesktopSmokeInvocation {
  token: string
}

export interface PackagedDesktopSmokeObservation {
  url: string
  expectedUrl: string
  windowReady: boolean
  rendererLoaded: boolean
  preloadApiReady: boolean
  appRootReady: boolean
}

export interface PackagedDesktopSmokeEvidence {
  schemaVersion: 1
  kind: 'packaged-desktop-smoke'
  windowReady: true
  rendererLoaded: true
  preloadApiReady: true
  appRootReady: true
}

let claimedToken: string | undefined

export function releaseDesktopSmokeWasRequested(args: readonly string[] = process.argv): boolean {
  return args.some(argument => argument.startsWith(RELEASE_DESKTOP_SMOKE_ARGUMENT_PREFIX))
}

export function parseReleaseDesktopSmokeInvocation(
  args: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): ReleaseDesktopSmokeInvocation | undefined {
  const matches = args.filter(argument => argument.startsWith(RELEASE_DESKTOP_SMOKE_ARGUMENT_PREFIX))
  if (matches.length !== 1 || env.AI_NOVEL_RELEASE_DESKTOP_SMOKE !== '1') return undefined
  const token = matches[0]!.slice(RELEASE_DESKTOP_SMOKE_ARGUMENT_PREFIX.length)
  if (!/^[a-f0-9]{32,128}$/i.test(token) || env.AI_NOVEL_RELEASE_DESKTOP_SMOKE_TOKEN !== token) return undefined
  return { token }
}

export function claimReleaseDesktopSmokeInvocation(
  args: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): ReleaseDesktopSmokeInvocation | undefined {
  const invocation = parseReleaseDesktopSmokeInvocation(args, env)
  if (!invocation || claimedToken !== undefined) return undefined
  claimedToken = invocation.token
  return invocation
}

export function validatePackagedDesktopSmokeObservation(
  observation: PackagedDesktopSmokeObservation,
): PackagedDesktopSmokeEvidence {
  if (!observation || typeof observation !== 'object') throw new Error('Packaged desktop smoke returned no readiness observation')
  if (
    typeof observation.expectedUrl !== 'string'
    || !observation.expectedUrl.startsWith('file://')
    || observation.url !== observation.expectedUrl
  ) {
    throw new Error('Packaged desktop smoke did not load the packaged renderer URL')
  }
  if (observation.windowReady !== true) throw new Error('Packaged desktop smoke window did not become visible')
  if (observation.rendererLoaded !== true) throw new Error('Packaged desktop smoke renderer did not finish loading')
  if (observation.preloadApiReady !== true) throw new Error('Packaged desktop smoke preload bridge did not load')
  if (observation.appRootReady !== true) throw new Error('Packaged desktop smoke application root did not render')

  return {
    schemaVersion: 1,
    kind: 'packaged-desktop-smoke',
    windowReady: true,
    rendererLoaded: true,
    preloadApiReady: true,
    appRootReady: true,
  }
}
