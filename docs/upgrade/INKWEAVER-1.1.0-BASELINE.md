# InkWeaver 1.1.0 development baseline

Recorded: 2026-09-07 (Asia/Hong_Kong)

This is a development checkpoint, not a release claim. The working tree still
contains the user's pre-existing deletions and token-test edit listed below.

## Source and package identity

| Item | Value |
| --- | --- |
| repository | `https://github.com/shuishuipingan/InkWeaver.git` |
| development branch | `main` |
| current source SHA | `5f66ed2d4dfb38bbd68d3d05b8ed39ffe71849b5` |
| local `v1.0.0` tag | `74461ad34dbabf69cdf85180163d1403027eb6c1` |
| desktop package version | `0.9.2` (not frozen for 1.1.0) |
| DSH plugin package version | `0.1.0` (not frozen for 1.1.0) |

The desktop and plugin package formats remain separate: desktop projects use
`.vela/vela.db`, while the DSH plugin uses `.ai-novel/novel.db`.

## Preserved user changes

These files were already modified before this development pass and are not
part of feature commits:

- `docs/upgrade/DESIGN-TOKENS.md` — deleted by the user;
- `docs/upgrade/UI-动画-反馈-日志-升级方案.md` — deleted by the user;
- `src/tokens/__tests__/tokens.test.ts` — user modification.

Generated browser screenshots and `.vitest-attachments/` files are local test
artifacts and are intentionally not release inputs.

## DSH distribution baseline

The official npm registry was queried through the configured proxy. At this
checkpoint `@deepseek-ai/dsh` reports `latest=0.1.2-rc.1`,
`next=0.1.2-rc.1`, and `alpha=0.1.2-alpha.5`; the official repository is
`deepseek-ai/deepseek-harness`. There is no stable default-channel semver
release at this checkpoint. The plugin compatibility receipt records the exact
related package pins and API migration evidence:

[DSH 0.1.2-rc.1 compatibility receipt](../../plugins/inkweaver-dsh/docs/dsh-0.1.2-rc.1-compatibility.md)

## Verification checkpoint

The following focused evidence exists at this source SHA:

- desktop TypeScript check passes with the direct TypeScript 6 compiler;
- context receipt, adjacent continuity, character identity, knowledge-event,
  relationship presentation, export-authority, and story-continuity tests pass;
- RelationshipGraph browser suite passes 23 tests;
- StoryContinuityPanel and ContinuousReader browser regressions pass;
- DSH plugin typecheck, build, emitted-package verification, and 37/41 local
  test files pass. Two filesystem-symlink security tests require a Windows
  SeCreateSymbolicLink privilege; the remaining local snapshot comparison is
  normalized for LF/CRLF.

This checkpoint does not prove the 38-row 1.1.0 tracker, cross-platform
installers, npm publication, GitHub Release, or topic-page discovery. Those
remain explicit later gates.

## Latest development checkpoint

Recorded: 2026-09-09 (Asia/Hong_Kong). This is an additive progress note; the
historical checkpoint above is intentionally retained.

| Item | Current value |
| --- | --- |
| local source HEAD | `0a9c2d9` |
| GitHub development ref | `origin/1.1.0-development` = `0a9c2d9` |
| desktop package version | `0.9.2` (still not frozen) |
| DSH plugin package version | `0.1.0` (still not frozen) |
| tracker status | 4 待验收 / 30 开发中 / 4 未开始 / 0 通过 |
| latest full DSH qualification | `passed`, run `2026-09-09T11-44-24-930Z-24004` |

Since the historical checkpoint, the development line has also added the
read-only cross-volume trend view (`681fa15`), chronological reader-knowledge
ledger (`a622847`), character-growth ledger (`4a0fbe5`), relationship history
and evidence panel (`8a20fe9`), and cross-volume narrative-thread summary
(`d1b26e5`). These have browser regression coverage and are still subject to
long-form human review; they are not release claims.
