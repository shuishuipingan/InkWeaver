import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'

export const DSH_PACKAGE_NAME = '@shuishuipingan/inkweaver-dsh'
export const DSH_RECEIPT_METADATA_PATH = 'qualification/dsh-release-receipt.json'
export const DSH_PRESET_IDS = Object.freeze(['inkweaver', 'inkweaver-v2'])

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function dshVersionPart(version) {
  assert(typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version), 'DSH release version is invalid')
  return version
}

export function dshTarballName(version) {
  return `shuishuipingan-inkweaver-dsh-${dshVersionPart(version)}.tgz`
}

export function dshReceiptName(version) {
  return `shuishuipingan-inkweaver-dsh-${dshVersionPart(version)}.receipt.json`
}

function regularFile(file, label) {
  let details
  try {
    details = lstatSync(file)
  } catch (error) {
    throw new Error(`${label} is missing: ${file}`)
  }
  assert(details.isFile() && !details.isSymbolicLink() && details.size > 0, `${label} must be a non-empty regular file: ${file}`)
  return details
}

function strictJsonBytes(bytes, label) {
  try {
    return JSON.parse(strictUtf8.decode(bytes))
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Validate the exact DSH receipt against one exact tarball file.
 * Callers must supply an explicit path; this helper never searches for JSON files.
 */
export function validateDshReleaseReceipt({ receiptPath, tarballPath, version, expectedReceiptFileName = dshReceiptName(version) }) {
  const resolvedVersion = dshVersionPart(version)
  const expectedTarball = dshTarballName(resolvedVersion)
  const expectedReceipt = expectedReceiptFileName
  const resolvedReceiptPath = path.resolve(receiptPath)
  const resolvedTarballPath = path.resolve(tarballPath)
  assert(path.basename(resolvedReceiptPath) === expectedReceipt, `DSH receipt filename must be ${expectedReceipt}`)
  assert(path.basename(resolvedTarballPath) === expectedTarball, `DSH tarball filename must be ${expectedTarball}`)

  const tarballDetails = regularFile(resolvedTarballPath, 'DSH release tarball')
  const receiptDetails = regularFile(resolvedReceiptPath, 'DSH release receipt')
  const tarballBytes = readFileSync(resolvedTarballPath)
  const tarballSha256 = sha256(tarballBytes)
  assert(tarballDetails.size === tarballBytes.length, 'DSH release tarball changed while being read')
  const receiptBytes = readFileSync(resolvedReceiptPath)
  const receipt = strictJsonBytes(receiptBytes, 'DSH release receipt')
  assert(receipt !== null && typeof receipt === 'object' && !Array.isArray(receipt), 'DSH release receipt must be an object')
  assert(receipt.schemaVersion === 1 && receipt.status === 'passed', 'DSH release receipt status is invalid')
  assert(receipt.packageName === DSH_PACKAGE_NAME, 'DSH release receipt package name is invalid')
  assert(receipt.version === resolvedVersion, 'DSH release receipt version does not match the qualification')
  assert(receipt.sha256 === tarballSha256, 'DSH release receipt SHA-256 does not match the tarball')
  assert(receipt.bytes === tarballDetails.size, 'DSH release receipt byte count does not match the tarball')
  assert(receipt.tarball?.fileName === expectedTarball, 'DSH release receipt tarball filename is invalid')
  assert(receipt.tarball?.relativePath === `release/${resolvedVersion}/${expectedTarball}`, 'DSH release receipt tarball path is invalid')
  assert(Array.isArray(receipt.presetIds) && receipt.presetIds.length === DSH_PRESET_IDS.length && receipt.presetIds.every((id, index) => id === DSH_PRESET_IDS[index]), 'DSH release receipt preset IDs are invalid')

  return {
    receipt,
    receiptPath: resolvedReceiptPath,
    receiptName: expectedReceipt,
    receiptSize: receiptDetails.size,
    receiptSha256: sha256(receiptBytes),
    tarballPath: resolvedTarballPath,
    tarballName: expectedTarball,
    tarballSize: tarballDetails.size,
    tarballSha256,
  }
}
