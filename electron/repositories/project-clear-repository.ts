import fs from 'node:fs'
import path from 'node:path'

import { getCurrentProjectPath, getProjectDb } from '../database'
import { ensureCharacterRosterSchema } from './character-roster-schema'
import { clearBlueprintFactsWithinTransaction } from './blueprint-repository'

/**
 * 「清空生成数据」的**覆盖口径**（唯一事实源，改清空范围时必须同步这里）。
 *
 * 三个 scope 实际清掉的表：
 * - creativeFields：project_core 的文本字段（前提/世界观/角色架构/大纲/文风/参考作品/金手指/全局指导）、
 *   characters、character_roster_operations、character_roster_meta、**writing_style_history**。
 * - blueprints：章节蓝图及其事实（见 clearBlueprintFactsWithinTransaction）。
 * - generatedText：drafts、contents、revisions、reviews、post_process_runs/steps、
 *   summarized 快照、finalized_draft_import_operations、**finalization_outbox**、**context_summary_cache**，
 *   并在 db:project-clear-generated-data 里联动清理由定稿写入知识库的"第N章"文档。
 *
 * **明确不在此列（刻意保留）**：
 * - agent_conversations / agent_messages —— 助手会话是"作者与助手的对话记录"，不是生成的小说内容。
 *   清空生成数据不应销毁对话历史（见 ClearProjectDataDialog 的界面说明与助手面板的单独清空入口）。
 * - llm_calls、chapter_deletion_operations —— 调用与删除操作的审计台账，不是作品内容。
 * - import_runs / import_run_* / import_reference_documents / import_source_* —— 作者导入的来源与参照语料。
 *
 * 判据：**清空"生成数据"清的是稿子，不是规划与决定**——判断某张表算哪边，看它的内容是不是作者的自主产物。
 * 具体到容易误判的几张（均**不在此列**，理由写死以免后来者误纳入）：
 * - planning_materials（规划资料）、narrative_thread_plans / narrative_thread_confirmations（线索规划）、
 *   consistency_exemptions（豁免）、knowledge_events（知情边界）—— 作者的**规划与决定**，不是稿子。
 * - chapter_handoffs（章节交接）、story_continuity_plans（连续性工作表）—— 生成与作者确认的混合事实；
 *   在没有作者明确要求前一律不清，若将来确有"清空后还留着这些"的抱怨，再单独开选项，不替作者决定。
 * - character_extraction_candidates（人物提取候选）—— **在 generatedText 内**：作者尚未确认的中间产物。
 */
export type ProjectClearScope = 'creativeFields' | 'blueprints' | 'generatedText'

export interface ProjectClearOptions {
    creativeFields?: boolean
    blueprints?: boolean
    generatedText?: boolean
}

export interface ProjectClearResult {
    cleared: ProjectClearScope[]
    physicalFilesDeleted: number
}

interface MovedFile {
    from: string
    to: string
}

const FINALIZED_CHAPTER_FILE_RE = /^第\d+章(?: .*)?\.txt$/u

function listGeneratedChapterFiles(projectPath: string): string[] {
    if (!fs.existsSync(projectPath)) return []
    return fs.readdirSync(projectPath, { withFileTypes: true })
        .filter(entry => entry.isFile() && FINALIZED_CHAPTER_FILE_RE.test(entry.name))
        .map(entry => path.join(projectPath, entry.name))
}

function moveGeneratedFilesToTrash(projectPath: string): MovedFile[] {
    const files = listGeneratedChapterFiles(projectPath)
    if (files.length === 0) return []

    const trashDir = path.join(
        projectPath,
        '.vela',
        'trash',
        `clear-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    )
    fs.mkdirSync(trashDir, { recursive: true })

    const moved: MovedFile[] = []
    try {
        for (const file of files) {
            const target = path.join(trashDir, path.basename(file))
            fs.renameSync(file, target)
            moved.push({ from: file, to: target })
        }
        return moved
    } catch (error) {
        restoreMovedFiles(moved)
        throw error
    }
}

function restoreMovedFiles(moved: MovedFile[]): void {
    for (const item of [...moved].reverse()) {
        if (fs.existsSync(item.to) && !fs.existsSync(item.from)) {
            fs.renameSync(item.to, item.from)
        }
    }
}

function removeMovedFiles(moved: MovedFile[]): void {
    const dirs = new Set<string>()
    for (const item of moved) {
        dirs.add(path.dirname(item.to))
    }

    for (const dir of dirs) {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

export class ProjectClearRepository {
    static clearGeneratedData(options: ProjectClearOptions): ProjectClearResult {
        const db = getProjectDb()
        if (!db) throw new Error('项目数据库未打开')

        const projectPath = getCurrentProjectPath()
        if (options.generatedText && !projectPath) throw new Error('项目路径未初始化')

        const movedFiles = options.generatedText && projectPath
            ? moveGeneratedFilesToTrash(projectPath)
            : []
        const cleared: ProjectClearScope[] = []

        try {
            const tx = db.transaction(() => {
                if (options.generatedText) {
                    db.prepare('DELETE FROM finalized_draft_import_operations').run()
                    // outbox 里冻结着定稿全文快照：不清它会让"清空定稿正文"后仍留存整章文本。
                    db.prepare('DELETE FROM finalization_outbox').run()
                    db.prepare('DELETE FROM post_process_steps').run()
                    db.prepare('DELETE FROM post_process_runs').run()
                    db.prepare('DELETE FROM reviews').run()
                    db.prepare('DELETE FROM revisions').run()
                    db.prepare('DELETE FROM drafts').run()
                    db.prepare('DELETE FROM contents').run()
                    db.prepare('DELETE FROM summary_snapshots').run()
                    // AI 从正文提取、作者尚未确认的人物候选：属"稿子的中间产物"，清了不损失作者成果。
                    db.prepare('DELETE FROM character_extraction_candidates').run()
                    // 上下文摘要缓存是纯派生数据（含正文片段），清了可重建，没有保留价值。
                    // 该表由 context-summary-cache-repository 懒建：从未用过摘要缓存的项目里它并不存在，
                    // 直接 DELETE 会抛 no such table 并让整个清空事务失败，因此先探存在性。
                    if (db.prepare(
                        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'context_summary_cache'",
                    ).get()) {
                        db.prepare('DELETE FROM context_summary_cache').run()
                    }
                    cleared.push('generatedText')
                }

                if (options.blueprints) {
                    clearBlueprintFactsWithinTransaction(db)
                    cleared.push('blueprints')
                }

                if (options.creativeFields) {
                    // 即使项目是在 roster 元数据迁移前创建的，也必须先按唯一
                    // 迁移规则建立元数据表，再在同一 transaction 内清空角色事实
                    // 与 receipt。这样下次 read 会重新分类为空项目，而不会遗留
                    // ready 状态或旧角色参与新的架构生成。
                    ensureCharacterRosterSchema(db)
                    db.prepare('DELETE FROM character_roster_operations').run()
                    db.prepare('DELETE FROM character_roster_meta').run()
                    db.prepare('DELETE FROM characters').run()
                    // 文风档案版本历史与 project_core.writing_style 同源：清了后者却留下历史会造成口径不一致。
                    db.prepare('DELETE FROM writing_style_history').run()
                    db.prepare(`
                        UPDATE project_core
                        SET writing_style = '',
                            reference_works = '',
                            global_guidance = '',
                            golden_finger = '',
                            premise = '',
                            worldbuilding = '',
                            characters_arch = '',
                            synopsis = '',
                            character_states = '',
                            updated_at = datetime('now')
                        WHERE id = 'main'
                    `).run()
                    cleared.push('creativeFields')
                }
            })

            tx()
            removeMovedFiles(movedFiles)
            return { cleared, physicalFilesDeleted: movedFiles.length }
        } catch (error) {
            restoreMovedFiles(movedFiles)
            throw error
        }
    }
}
