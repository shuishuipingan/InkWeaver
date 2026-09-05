import { mkdirSync, rmSync, renameSync, existsSync, readFileSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INST = resolve(process.env.INKWEAVER_INSTALL_ROOT ?? join(process.env.LOCALAPPDATA ?? PROJ, 'Programs', 'InkWeaver'))
const APP_ASAR = join(INST, 'resources', 'app.asar')
const TMP = join(tmpdir(), 'inkweaver-asar-repack-final')
const TMP_SRC = join(TMP, 'asar-src')

const asar = createRequire(PROJ + '/node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/package.json')('./lib/asar.js')

function copyTreeSync(src, dest) {
  const entries = readdirSync(src, { withFileTypes: true })
  mkdirSync(dest, { recursive: true })
  for (const ent of entries) {
    const sp = join(src, ent.name)
    const dp = join(dest, ent.name)
    if (ent.isDirectory()) copyTreeSync(sp, dp)
    else if (ent.isFile()) copyFileSync(sp, dp)
  }
}

// Step 1: Verify fresh dist/ is present (vite build already run separately)
console.log('[1/5] verifying fresh dist/...')
const distIndex = readdirSync(PROJ + '/dist/assets').filter(f => f.startsWith('index-'))
if (distIndex.length === 0) throw new Error('dist/assets/index-*.js not found; run vite build first')
let srcFound = 0
for (const f of distIndex) {
  const c = readFileSync(PROJ + '/dist/assets/' + f, 'utf8')
  // 打包后局部变量被压缩改名；用新实现独有的压缩后字节特征校验
  if (c.includes('1.8/f') && c.includes('宿敌') && c.includes('条关系')) srcFound++
}
if (srcFound === 0) throw new Error('dist/ does not contain the graph update')
console.log('  ' + srcFound + ' asset(s) in source dist/ contain the update')
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
asar.extractAll(APP_ASAR, TMP_SRC)
console.log('  extracted')

// Step 2: Overwrite dist/ with fresh build (skip vite build - already fresh)
console.log('[2/4] replacing dist/...')
rmSync(TMP_SRC + '/dist', { recursive: true, force: true })
copyTreeSync(PROJ + '/dist', TMP_SRC + '/dist')
console.log('  replaced')

// Step 3: Verify
console.log('[3/4] verifying update present...')
const files = readdirSync(TMP_SRC + '/dist/assets').filter(f => f.startsWith('index-'))
let found = 0
for (const f of files) {
  const c = readFileSync(TMP_SRC + '/dist/assets/' + f, 'utf8')
  if (c.includes('1.8/f') && c.includes('宿敌') && c.includes('条关系')) found++
}
if (found === 0) {
  console.error('ERROR: update not present in extracted tree')
  process.exit(2)
}
console.log('  ' + found + ' assets contain the update')

// Step 4: Repack + replace
console.log('[4/4] repacking and replacing...')
const newAsar = TMP + '/new-app.asar'
rmSync(newAsar, { force: true })
await asar.createPackage(TMP_SRC, newAsar, {
  unpack: ['node_modules/**/@lancedb/**/*', 'node_modules/**/better-sqlite3/**/*', 'node_modules/**/flatbuffers/**/*'],
  unpackDir: 'app.asar.unpacked',
  globOptions: { dot: true },
})
// /tmp 与安装目录跨盘，renameSync 会 EXDEV —— 用复制 + 删除替代。
// 首次替换时保留一份原始备份；之后的重打包直接覆盖，避免每次多占 350MB。
const bakExists = existsSync(APP_ASAR + '.bak-20260901-orig')
if (bakExists) rmSync(APP_ASAR, { force: true })
else renameSync(APP_ASAR, APP_ASAR + '.bak-20260901-orig')
copyFileSync(newAsar, APP_ASAR)
rmSync(newAsar, { force: true })
console.log('DONE. Fresh app.asar installed at: ' + APP_ASAR)
