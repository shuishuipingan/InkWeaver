import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import type { AppPromptLoadReceipt, AppPromptTemplate } from '../../src/shared/ipc-channels'
import { mainText } from '../i18n'
import { VELA_HOME, writeJsonFile } from '../utils/config-utils'

function text(zhCNText: string, enUSText: string): string {
  return mainText(app.getLocale(), zhCNText, enUSText)
}

function isContainedPath(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return !(
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  )
}

function promptKeyPath(key: string): string {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)
    || key === '.'
    || key === '..'
  ) {
    throw new Error(text('提示词标识无效', 'The prompt identifier is invalid'))
  }
  const promptsDirectory = path.join(VELA_HOME, 'prompts')
  const candidatePath = path.resolve(promptsDirectory, `${key}.json`)
  if (!isContainedPath(promptsDirectory, candidatePath)) {
    throw new Error(text('提示词目标超出应用目录', 'The prompt target is outside the app directory'))
  }
  return candidatePath
}

function isPromptTemplate(value: unknown): value is AppPromptTemplate {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as AppPromptTemplate).key === 'string'
}

const SAFE_SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

function skillDirectoryPath(name: string): string {
  if (!SAFE_SKILL_NAME.test(name) || name === '.' || name === '..') {
    throw new Error(text('技能标识无效', 'The Skill identifier is invalid'))
  }
  const skillsDirectory = path.resolve(VELA_HOME, 'skills')
  const candidate = path.resolve(skillsDirectory, name)
  if (!isContainedPath(skillsDirectory, candidate)) {
    throw new Error(text('技能目标超出应用目录', 'The Skill target is outside the app directory'))
  }
  return candidate
}

function validateSkillDocument(name: string, content: unknown): asserts content is string {
  if (typeof content !== 'string' || content.length === 0 || Buffer.byteLength(content, 'utf8') > 1_000_000) {
    throw new Error(text('技能文件为空或过大', 'The Skill file is empty or too large'))
  }
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u)
  if (!match) throw new Error(text('技能缺少 frontmatter', 'The Skill is missing frontmatter'))
  const fields = new Map<string, string>()
  for (const line of match[1]!.split('\n')) {
    const field = line.match(/^\s*([^:]+):\s*(.*?)\s*$/u)
    if (field) fields.set(field[1]!.trim(), field[2]!.trim())
  }
  if (fields.get('name') !== name || !fields.get('description')) {
    throw new Error(text('技能 name/description 与内容不一致', 'The Skill name/description is invalid'))
  }
}

/**
 * ~/.vela 的提示词和用户 Skill 只能由此固定根目录控制器访问；渲染层不接收
 * 任意 app-data 路径，也不借用外部文件授权。
 */
export function registerAppDataController(): void {
  ipcMain.handle('prompt:load-global', async (): Promise<AppPromptLoadReceipt> => {
    const promptsDirectory = path.join(VELA_HOME, 'prompts')
    if (!fs.existsSync(promptsDirectory)) return { templates: [], diagnostics: [] }

    const prompts: AppPromptTemplate[] = []
    const diagnostics: AppPromptLoadReceipt['diagnostics'] = []
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(promptsDirectory, { withFileTypes: true })
    } catch (error) {
      return {
        templates: [],
        diagnostics: [{
          path: 'prompts',
          error: error instanceof Error ? error.message : String(error),
        }],
      }
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      try {
        const candidatePath = path.join(promptsDirectory, entry.name)
        const canonicalPath = fs.realpathSync.native(candidatePath)
        if (!isContainedPath(fs.realpathSync.native(promptsDirectory), canonicalPath)) continue
        const parsed = JSON.parse(fs.readFileSync(canonicalPath, 'utf8')) as unknown
        if (!isPromptTemplate(parsed)) {
          throw new Error(text('提示词内容结构无效', 'The prompt content shape is invalid'))
        }
        const filenameKey = path.basename(entry.name, '.json')
        if (parsed.key !== filenameKey) {
          throw new Error(text('提示词标识与文件名不一致', 'The prompt identifier does not match its filename'))
        }
        prompts.push(parsed)
      } catch (error) {
        diagnostics.push({
          key: path.basename(entry.name, '.json'),
          path: entry.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { templates: prompts, diagnostics }
  })

  ipcMain.handle('prompt:save-global', async (_event, template: AppPromptTemplate) => {
    try {
      if (!isPromptTemplate(template)) {
        throw new Error(text('提示词内容无效', 'The prompt content is invalid'))
      }
      writeJsonFile(promptKeyPath(template.key), template)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('prompt:delete-global', async (_event, key: string) => {
    try {
      const filePath = promptKeyPath(key)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('skills:list-user', async () => {
    const skillsDirectory = path.join(VELA_HOME, 'skills')
    if (!fs.existsSync(skillsDirectory)) return []

    const canonicalSkillsDirectory = fs.realpathSync.native(skillsDirectory)
    const skills: Array<{ name: string; content: string; baseDir: string; filePath: string }> = []
    for (const entry of fs.readdirSync(canonicalSkillsDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      try {
        const baseDir = fs.realpathSync.native(path.join(canonicalSkillsDirectory, entry.name))
        if (!isContainedPath(canonicalSkillsDirectory, baseDir)) continue
        const filePath = fs.realpathSync.native(path.join(baseDir, 'SKILL.md'))
        if (!isContainedPath(baseDir, filePath) || !fs.statSync(filePath).isFile()) continue
        skills.push({
          name: entry.name,
          content: fs.readFileSync(filePath, 'utf8'),
          baseDir,
          filePath,
        })
      } catch {
        // 单个用户 Skill 无效时不阻断其余 Skill。
      }
    }
    return skills
  })

  ipcMain.handle('skills:install-user', async (_event, name: string, content: string) => {
    try {
      const directory = skillDirectoryPath(name)
      validateSkillDocument(name, content)
      if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
        throw new Error(text('技能目录不能是符号链接', 'A Skill directory cannot be a symbolic link'))
      }
      fs.mkdirSync(directory, { recursive: true })
      const target = path.join(directory, 'SKILL.md')
      const temporary = path.join(directory, `.SKILL.md.${process.pid}.${Date.now()}.tmp`)
      fs.writeFileSync(temporary, content, 'utf8')
      fs.renameSync(temporary, target)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('skills:remove-user', async (_event, name: string) => {
    try {
      const directory = skillDirectoryPath(name)
      if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
        throw new Error(text('技能目录不能是符号链接', 'A Skill directory cannot be a symbolic link'))
      }
      const target = path.join(directory, 'SKILL.md')
      if (fs.existsSync(target)) fs.unlinkSync(target)
      try { fs.rmdirSync(directory) } catch { /* retain non-empty user directory */ }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
