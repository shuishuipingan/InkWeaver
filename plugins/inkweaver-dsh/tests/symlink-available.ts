import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Windows without Developer Mode cannot create dir/file symlinks; these tests then skip locally. */
export async function symlinkAvailable(): Promise<boolean> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-symlink-probe-'))
  try {
    const dirTarget = join(root, 'dir-target')
    const dirAlias = join(root, 'dir-alias')
    await mkdir(dirTarget)
    await symlink(dirTarget, dirAlias, 'dir')
    await rm(dirAlias)
    const fileTarget = join(root, 'file-target')
    const fileAlias = join(root, 'file-alias')
    await writeFile(fileTarget, 'x', 'utf8')
    await symlink(fileTarget, fileAlias, 'file')
    return true
  } catch {
    return false
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
}