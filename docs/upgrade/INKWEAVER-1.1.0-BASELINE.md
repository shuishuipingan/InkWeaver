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
| local source HEAD | `462b5bd` |
| GitHub development ref | `origin/1.1.0-development` = `462b5bd` |
| desktop package version | `0.9.2` (still not frozen) |
| DSH plugin package version | `0.1.0` (still not frozen) |
| tracker status | 4 待验收 / 30 开发中 / 4 未开始 / 0 通过 |
| latest full DSH qualification | `passed`, run `2026-09-09T11-44-24-930Z-24004` |

Since the historical checkpoint, the development line has also added the
read-only cross-volume trend view (`681fa15`), chronological reader-knowledge
ledger (`a622847`), character-growth ledger (`4a0fbe5`), relationship history
and evidence panel (`8a20fe9`), cross-volume narrative-thread summary
(`d1b26e5`), historical-state chapter query (`f3f2d2d`), and scene causality
gap warnings (`df16a42`). These have browser regression coverage and are still
subject to long-form human review; they are not release claims. The CSS import
order warning was removed in `8282f8e`; the deterministic 24-pair/100-chapter
quality fixture and review protocol were added in `a490427`; the full renderer
suite remains green. The desktop/plugin final-version freeze gate was added in
`1de0e2b`; it is a pre-release guard and has not changed the current versions.

To verify the gate before freezing, run:

```text
node scripts/release-version-sync.mjs --expected-version 1.1.0
```

At this checkpoint the command correctly returns `ok: false` because desktop
is still `0.9.2` and the plugin is still `0.1.0`; a successful result is only
valid after full roadmap acceptance and the version-freeze review.

The plugin distribution handoff checklist is tracked at
`plugins/inkweaver-dsh/docs/1.1.0-release-checklist.md`; it documents the
tarball, npm, topic-index, and rollback gates without claiming they are done.

The character candidate panel now also exposes a dedicated growth-arc/state
review section (`f1e9f6b`); the underlying merge and author-confirmation gates
remain unchanged. C01 source coverage is now visible in the candidate panel
with a privacy-safe source fingerprint (`fe7df5a`).

Chapter handoff UI now also displays the selected transition strategy in both
languages (`9b03a2f`), while the author confirmation and source-binding rules
remain unchanged.

Reader expectations now also expose editable due chapters and explicit delay
reasons in the continuity sheet (`d7184c5`).

The G04 CLI now uses Windows-safe `fileURLToPath` entry detection and has a
regression test proving it cannot silently exit zero without executing the
backread request (`57707c2`). Relationship evidence can now open the matching
finalized chapter through the project session (`462b5bd`).

The Windows release plan was also re-read on this line; it includes native
dependency preparation, package/update verification, app/installer/upgrade
smoke checks, native restoration, and a quiet final stage. This is a plan
check only, not a built 1.1.0 artifact.

The safe provider qualification dry-run now exercises three adapters, six
simulated calls, one model lease per provider, budget/usage receipts and
checksums without credentials or billing; price snapshots remain unavailable
until a separately authorized real-provider run.

The formal-release backread gate was added in `9464c35`; it checks the seven
Windows/macOS asset names, final tag state, GitHub SHA-256 digests, and the
`dsh-plugin` topic. It is not a claim that a public Release exists yet.
