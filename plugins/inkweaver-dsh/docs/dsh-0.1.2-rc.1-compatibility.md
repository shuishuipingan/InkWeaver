# DSH 0.1.2-rc.1 compatibility receipt

Verification date: 2026-09-09 (Asia/Hong_Kong)

## Official distribution anchor

The official npm package `@deepseek-ai/dsh` reports:

| Field | Observed value |
| --- | --- |
| `latest` | `0.1.2-rc.1` |
| `next` | `0.1.2-rc.1` |
| `alpha` | `0.1.2-alpha.5` |
| repository | `git+https://github.com/deepseek-ai/deepseek-harness.git` |
| published | 2026-09-03 |

There is no stable semver release on the official default npm channel at this
verification point. This plugin therefore describes the host compatibility as
the official `0.1.2-rc.1` release candidate, not as a stable release.

## Plugin dependency pinning

The plugin pins the DSH family to the verified release candidate where the
package exists. Two client packages have an older official `next` tag and are
intentionally pinned to that tag's exact version:

| Package | Pin | Reason |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-runtime` | `0.1.1-rc.2` | official `next`; `0.1.2-rc.1` is not published |
| `@deepseek-ai/dsh-client-schema-form` | `0.1.0-rc.7` | official `next`; `0.1.2-rc.1` is not published |
| `@deepseek-ai/dsh-session-projection` | `0.1.2-rc.1` | required by the new `AgentPresets` service contract |
| `@deepseek-ai/cordis` | `4.0.2` | official latest peer used by the host release |
| `@deepseek-ai/schemastery` | `3.18.2` | official latest dependency used by the host release |

The lockfile is generated from these exact pins. A bare `next`, `alpha`, or
range expression must not replace them in a release commit.

## Source-level API migrations

- `JsonValue` is imported from the value utility contract where tests need the
  runtime validator; the plugin's host receipt type remains a local JSON-safe
  type so it does not leak a package-internal dependency.
- `CallId` is now `ToolCallId`.
- `assertNever` is no longer exported by `dsh-llm`; the plugin owns its local
  exhaustive-switch helper.
- Client connection generation state replaces the removed `hostDescription`
  source. The client keeps a narrow fallback for older embedded hosts while
  the official release path uses `connection.generation`.
- Host `connection.rpc.handle` accepts the channel and handler only; the old
  `{ authority: 'loopback' }` option was removed by the official contract.
- `AgentPresets` now requires the `sessionProjections` service and its config
  explicitly includes `includeShippedRoot`. The qualification composition and
  tests load the projection service and set this flag deliberately.
- The official Web settings surface pairs keyed `settings.plugin.item` entries
  with Host settings namespaces. InkWeaver registers the `inkweaver` namespace
  on the Host and supplies both the keyed `key` and legacy `id`/`order` fields
  in its Client entry, keeping the compatibility cast local for older embedded
  runtimes; all other slots remain typed.

## V2 continuity handoff extension

The V2 SQLite store is now schema version 5. Opening a schema-4 database runs an
idempotent migration that adds source-bound `handoff_json` and
`knowledge_events_json` columns to the chapter aggregate. A chapter Proposal may
carry an immediate or deliberate transition, source chapter/revision, scene,
emotional state, open actions, and unresolved questions. It may also carry
stable-ID knowledge events with acquisition method, fact/belief/rumor/misbelief
kind, validity range, evidence, and candidate/confirmed status.

`chapter/context` exposes the handoff for the selected chapter and filters the
knowledge projection to confirmed events active at that chapter. Candidate
events remain in the Proposal until an author applies the change and never enter
the model context. The client validates the closed DTO and the preview path
rejects events that reference an unknown stable character ID.

## Web companion qualification note

The current DSH runtime is compatible with the official
`@linxin666/dsh-web-all@0.3.17` companion. The older
`@linxin666/dsh-web-ui-all@0.1.16` composition is not used: in the isolated
profile it imports removed `dsh-settings` exports and prevents the Web profile
from booting. The plugin qualification script pins `dsh-web-all@0.3.17` for
this reason.
This package is owned and released by the DSH Web host ecosystem; InkWeaver
does not modify, version, publish, or promise support for that package beyond
recording the compatibility prerequisite used by qualification.

## Qualification receipt (development line)

The complete isolated qualification receipt is retained at:

`.runtime/.cache/dsh-ai-novel-qualification-128/runs/2026-09-09T11-44-24-930Z-24004/qualification-receipt.json`

It records source commit `3be4604c4d58cbb6ac3f7fbd3bb2fbbc20ec820d`, the clean
Harness commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`, and tarball SHA-256
`11859a1d8cebf6e2c3f250cbec5a36e6b190607b2d92dadd865be1f1773ec92a`. The run
passed the plugin suite (40 files, 431 tests passed, 6 skipped), Electron
typecheck and renderer/main/release suites, clean Harness build, tarball
content comparison, isolated profile add/remove/reinstall, V2 preset tools,
three Chrome Web journeys, and durable schema-5 readback. The six skipped
plugin tests are Windows symlink-privilege cases and are explicitly recorded
by the test runner; they are not treated as failed product behavior.

## Evidence and remaining release gates

Passed locally after the migration and the official Harness qualification:

- `pnpm run typecheck`
- `pnpm run build`
- emitted Host/Agent/Client package verification in `scripts/verify-built.mjs`
- 40 of 41 plugin test files / 431 tests in the full qualification run, with
  six skipped Windows symlink-privilege cases. The qualification receipt
  verifies V2 schema 5, the continuity context contract, real Chrome mount and
  proposal flow, and persistence after restart/reinstall.

The symlink tests require the Windows SeCreateSymbolicLink privilege and should
be rerun on a machine/profile that grants it before calling the Windows test
matrix completely green. The complete DSH qualification is now passed, but
desktop version freeze, Windows/macOS installers, npm publication, GitHub
Release assets, and release back-read remain separate 1.1.0 gates.

Official sources:

- <https://www.npmjs.com/package/@deepseek-ai/dsh>
- <https://github.com/deepseek-ai/deepseek-harness/releases>
