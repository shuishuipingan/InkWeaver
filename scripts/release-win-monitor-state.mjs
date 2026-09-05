/* eslint-env node */

const MONITOR_STATE_POLL_INTERVAL_MS = 100

// A completion acknowledgement is emitted only after the monitor has drained
// the Job Object, sampled desktop windows through the required quiet interval,
// and published the final status. On Windows, those synchronous snapshots can
// exceed the shorter control/readiness budget under an active desktop.
export const MONITOR_STEP_COMPLETION_TIMEOUT_MS = 30_000

function delay(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}

export async function waitForMonitorState(
  states,
  timeoutMilliseconds,
  step = '',
  {
    readStatus,
    getMonitorExitCode = () => undefined,
    getMonitorSpawnError = () => undefined,
    sleep = delay,
  } = {},
) {
  if (!Array.isArray(states) || states.length === 0) {
    throw new Error('Monitor state wait requires at least one expected state')
  }
  if (typeof readStatus !== 'function') {
    throw new Error('Monitor state wait requires a status reader')
  }
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds < 1) {
    throw new Error('Monitor state wait requires a positive timeout')
  }

  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    const status = readStatus()
    if (status?.state === 'failed') {
      throw new Error(status.failure || `Windows release monitor failed during "${status.step}"`)
    }
    if (status && states.includes(status.state) && (!step || status.step === step)) {
      return status
    }
    const monitorExitCode = getMonitorExitCode()
    if (monitorExitCode !== null && monitorExitCode !== undefined) {
      throw new Error(`Windows release monitor exited unexpectedly with code ${monitorExitCode}`)
    }
    const monitorSpawnError = getMonitorSpawnError()
    if (monitorSpawnError) {
      throw monitorSpawnError
    }
    await sleep(MONITOR_STATE_POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for Windows release monitor state: ${states.join(', ')}`)
}
