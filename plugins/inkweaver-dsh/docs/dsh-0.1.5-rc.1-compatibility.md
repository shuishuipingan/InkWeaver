# DSH 0.1.5-rc.1 compatibility receipt

Verification date: 2026-09-12 (Asia/Hong_Kong)

## Official distribution anchor

The official npm package `@deepseek-ai/dsh` currently reports:

| Field | Observed value |
| --- | --- |
| `latest` | `0.1.5-rc.1` |
| `next` | `0.1.5-rc.2` |
| `alpha` | `0.1.5-alpha.2` |
| repository | `git+https://github.com/deepseek-ai/deepseek-harness.git` |

There is still no stable semver release on the default npm channel at this
verification point. InkWeaver therefore names the exact official release
candidate and does not call it a stable release.

## Plugin dependency pinning

The plugin pins the DSH family to `0.1.5-rc.1` wherever that release is
published. The following official packages intentionally remain on their
published compatible versions because the 0.1.5 release does not publish the
same version for them:

| Package | Pin | Reason |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-runtime` | `0.1.1-rc.2` | the 0.1.5 tag is not published for this client runtime |
| `@deepseek-ai/dsh-client-schema-form` | `0.1.0-rc.7` | the 0.1.5 tag is not published for this client schema package |
| `@deepseek-ai/cordis` | `4.0.2` | official host peer used by the 0.1.5 package family |
| `@deepseek-ai/cordis-plugin-include` | `1.0.7` | required by the 0.1.5 preset composition |
| `@deepseek-ai/cordis-plugin-loader` | `1.0.3` | required by the 0.1.5 preset composition |
| `@deepseek-ai/schemastery` | `3.18.2` | official dependency used by the host release |

The lockfile is generated from these exact pins. Floating `next`, `alpha`,
GitHub `main`, or an unconstrained range is not an accepted release input.

## 0.1.5 source-level migrations

- `@deepseek-ai/dsh-persona` changed its preset row from `config.text` to the
  required `config.prefix`; InkWeaver's V1 and V2 presets now use `prefix`.
- `@deepseek-ai/dsh-system-prompt` renamed the global configuration field from
  `persona` to `personaPrefix`; fixture and qualification compositions use the
  new field.
- Session model output is represented by `assistant/message` events rather
  than the old `assistant/chunk` boundary. The snapshot reconstruction test
  now uses the model assistant message for the request boundary and keeps
  readback assertions semantic.
- The request header no longer exposes a typed `system` field. Qualification
  fixtures reconstruct the system prompt from the canonical message list and
  keep the header assertion focused on provider/model/tools.
- 0.1.5 introduced a larger peer graph. The plugin pins the 0.1.5 session
  persistence, projection-cache, command, retry, and related packages so a
  stale 0.1.0-rc.6 peer cannot be selected beside a 0.1.5 session package.

## Web companion boundary

The qualification host uses `@linxin666/dsh-web-all@0.3.20` as an external
DSH Web companion. It is not an InkWeaver dependency, source directory,
package, or publication target. The historical
`@ethanyoq/dsh-ai-novel-writer` name is not an installation target either.

## Evidence status

The local 0.1.5 migration currently passes:

- `pnpm run typecheck`
- `pnpm run build` and emitted package verification
- `pnpm test`: 40 test files, 433 passed, 6 skipped
- source/preset checks in `scripts/qualify-release.mjs`

The full isolated Harness qualification now passes against the 1.1.0 freeze
candidate and official Harness checkout:

| Field | Passed evidence |
| --- | --- |
| source commit | `0358584da5333b1c6476062a0518d765800a4b2f` |
| Harness commit | `183f08e9c6dde7e36cd2318eaee70b0da08fb35e` (`dsh-v0.1.5-rc.1`) |
| plugin package | `@shuishuipingan/inkweaver-dsh@1.1.0` |
| tarball SHA-256 | `140565e6089800dad7c6a46ba100ecf3f591e089eb8495694e969eb4f1eb3d27` |
| tarball bytes / entries | `241334` / `41` |
| receipt | `.runtime/.cache/dsh-ai-novel-qualification-128/runs/2026-09-12T02-19-28-457Z-16964/qualification-receipt.json` |
| browser | Google Chrome, first/restart/reinstall journeys passed |
| persistence | schema 5 proposal lifecycle and chapter-context readback passed |

The qualification uses DSH 0.1.5's exact shared `/api` Fetch routes for
InkWeaver endpoints; it does not claim the singleton official API interceptor.
Desktop 1.1.0 platform installers and GitHub Release asset back-read remain
separate distribution gates. This project does not publish npm in this release
scope.

Official sources:

- <https://www.npmjs.com/package/@deepseek-ai/dsh>
- <https://github.com/deepseek-ai/deepseek-harness/releases>
