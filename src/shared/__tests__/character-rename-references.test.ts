import { describe, expect, it } from 'vitest'
import { renameReferencesClean, replaceCharacterNamesSimultaneously, rewriteRelationshipsAfterRename } from '../character-rename-references'

describe('character rename reference rewriting', () => {
  it('replaces names in planning text once without cascading through new names', () => {
    expect(replaceCharacterNamesSimultaneously('林舟与林舟儿同行', [
      { originalName: '林舟', newName: '苏绾' },
      { originalName: '林舟儿', newName: '顾舟' },
      { originalName: '苏绾', newName: '闻清' },
    ])).toBe('苏绾与顾舟同行')
  })

  it('keeps longer unrenamed character names intact', () => {
    expect(replaceCharacterNamesSimultaneously('万阳光遇见万阳', [
      { originalName: '万阳', newName: '楚曜' },
    ], ['万阳光'])).toBe('万阳光遇见楚曜')
  })
  it('rewrites JSON array relationship targets without touching unrelated records', () => {
    const input = JSON.stringify([
      { target: '林舟', relation: '好友', sourceChapter: 2 },
      { target: '沈月', relation: '盟友', sourceChapter: 3 },
    ])
    const output = rewriteRelationshipsAfterRename(input, [{ originalName: '林舟', newName: '林澈' }])
    expect(JSON.parse(output)).toEqual([
      { target: '林澈', relation: '好友', sourceChapter: 2 },
      { target: '沈月', relation: '盟友', sourceChapter: 3 },
    ])
    expect(renameReferencesClean(output, ['林舟'])).toBe(true)
  })

  it('rewrites plain text line targets and leaves author notes intact', () => {
    const input = '林舟：挚友\n沈月：对手\n林舟其实还在旧码头等着（自由备注不自动改）'
    const output = rewriteRelationshipsAfterRename(input, [{ originalName: '林舟', newName: '林澈' }])
    expect(output).toContain('林澈：挚友')
    expect(output).toContain('沈月：对手')
    expect(output).toContain('林舟其实还在旧码头等着（自由备注不自动改）')
    expect(renameReferencesClean(output, ['林舟'])).toBe(true)
  })

  it('keeps unknown structured JSON record keys untouched while rewriting target', () => {
    const input = JSON.stringify({ target: '旧名', relation: '师生', note: '旧名还出现在备注里' })
    const output = rewriteRelationshipsAfterRename(input, [{ originalName: '旧名', newName: '新名' }])
    const record = JSON.parse(output) as { target: string; relation: string; note: string }
    expect(record.target).toBe('新名')
    expect(record.note).toContain('旧名')
  })
})
