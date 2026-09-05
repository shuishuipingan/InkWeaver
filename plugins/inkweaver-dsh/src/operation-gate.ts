import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { INKWEAVER_PROJECT_DIRECTORY } from './identity.ts'

const OPERATION_GATE_SUFFIX = '.operation-lock'
const OWNER_MARKER = '.owner'

/** Stable failure raised when another compliant InkWeaver operation owns the workspace gate. */
export class InkWeaverOperationGateError extends Error {
  readonly code = 'WRITE_LOCKED' as const

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InkWeaverOperationGateError'
  }
}

function isAlreadyPresent(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'EEXIST'
}

interface GateLease {
  readonly path: string
  readonly ownerToken: string
  readonly device: bigint
  readonly inode: bigint
}

async function requireOwnedGate(lease: GateLease): Promise<void> {
  const directory = await lstat(lease.path, { bigint: true })
  if (!directory.isDirectory() || directory.isSymbolicLink()
    || directory.dev !== lease.device || directory.ino !== lease.inode) {
    throw new InkWeaverOperationGateError('InkWeaver project operation gate changed identity; replacement left untouched')
  }
  const markerPath = join(lease.path, OWNER_MARKER)
  const markerBefore = await lstat(markerPath, { bigint: true })
  if (!markerBefore.isFile() || markerBefore.isSymbolicLink()) {
    throw new InkWeaverOperationGateError('InkWeaver project operation gate owner marker is invalid')
  }
  const handle = await open(markerPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || opened.dev !== markerBefore.dev || opened.ino !== markerBefore.ino) {
      throw new InkWeaverOperationGateError('InkWeaver project operation gate owner marker changed identity')
    }
    if ((await handle.readFile('utf8')) !== lease.ownerToken) {
      throw new InkWeaverOperationGateError('InkWeaver project operation gate ownership changed')
    }
  } finally {
    await handle.close()
  }
  const directoryAfter = await lstat(lease.path, { bigint: true })
  if (!directoryAfter.isDirectory() || directoryAfter.isSymbolicLink()
    || directoryAfter.dev !== lease.device || directoryAfter.ino !== lease.inode) {
    throw new InkWeaverOperationGateError('InkWeaver project operation gate changed during release verification')
  }
}

async function releaseOwnedGate(lease: GateLease): Promise<void> {
  try {
    await requireOwnedGate(lease)
    await rm(join(lease.path, OWNER_MARKER))
    await rmdir(lease.path)
  } catch (cause) {
    if (cause instanceof InkWeaverOperationGateError) throw cause
    throw new InkWeaverOperationGateError(
      'InkWeaver project operation gate could not be released; inspect it before retrying',
      { cause },
    )
  }
}

/**
 * Serialize compliant project open/initialization/import operations for one workspace.
 *
 * Atomic directory creation is the portable cross-process acquisition primitive. The gate is
 * a sibling of `.inkweaver` containing a high-entropy ownership marker. Release verifies the
 * captured directory and marker identities, then uses only leaf removal and non-recursive
 * `rmdir`. A crash or observable replacement leaves the workspace fail-closed for inspection.
 */
export async function withInkWeaverOperationGate<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const gate = join(root, `${INKWEAVER_PROJECT_DIRECTORY}${OPERATION_GATE_SUFFIX}`)
  const ownerToken = randomUUID()
  try {
    await mkdir(gate, { mode: 0o700 })
  } catch (cause) {
    if (isAlreadyPresent(cause)) {
      throw new InkWeaverOperationGateError('another InkWeaver project operation is in progress', { cause })
    }
    throw new InkWeaverOperationGateError('InkWeaver project operation gate could not be acquired', { cause })
  }
  let lease: GateLease
  try {
    const identity = await lstat(gate, { bigint: true })
    if (!identity.isDirectory() || identity.isSymbolicLink()) {
      throw new InkWeaverOperationGateError('InkWeaver project operation gate must be a real directory')
    }
    await writeFile(join(gate, OWNER_MARKER), ownerToken, { flag: 'wx', mode: 0o600 })
    lease = { path: gate, ownerToken, device: identity.dev, inode: identity.ino }
  } catch (cause) {
    if (cause instanceof InkWeaverOperationGateError) throw cause
    throw new InkWeaverOperationGateError('InkWeaver project operation gate ownership could not be established', { cause })
  }

  let result: T
  let failure: unknown
  try {
    result = await operation()
  } catch (cause) {
    failure = cause
  }

  try {
    await releaseOwnedGate(lease)
  } catch (cause) {
    const release = cause instanceof InkWeaverOperationGateError
      ? cause
      : new InkWeaverOperationGateError('InkWeaver project operation gate release failed', { cause })
    if (failure !== undefined) {
      throw new InkWeaverOperationGateError('InkWeaver operation failed and its gate could not be safely released', {
        cause: new AggregateError([failure, release]),
      })
    }
    throw release
  }
  if (failure !== undefined) throw failure
  return result!
}
