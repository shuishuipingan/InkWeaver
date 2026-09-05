**English** | [中文](README.md)

# InkWeaver / 织墨

InkWeaver is a local-first desktop workspace for long-form fiction. It brings project settings, characters, worldbuilding, chapter blueprints, prose, review, revision, and finalization into a traceable writing chain while keeping the author in control of every durable change.

Current version: **v1.0.0**

[Download for Windows or macOS](https://github.com/shuishuipingan/InkWeaver/releases/latest) · [View source](https://github.com/shuishuipingan/InkWeaver)

## Optional DSH extension

InkWeaver also ships an optional InkWeaver DSH Extension for the external DeepSeek Harness host. It organizes novel settings, characters, chapter planning, prose, and revision proposals into an author-reviewed writing chain. It uses an independent \`.inkweaver\` workspace and does not read or replace desktop projects.

Install v1.0.0 into the DSH Web profile:

Run `dsh plugin --profile web add https://github.com/shuishuipingan/InkWeaver/releases/download/v1.0.0/shuishuipingan-inkweaver-dsh-1.0.0.tgz`.

See the [DSH extension guide](plugins/inkweaver-dsh/README.md) for the two presets (\`inkweaver\` / \`inkweaver-v2\`) and the legacy migration boundary.

## What InkWeaver is for

Chat tools can generate a passage, but they rarely maintain character state, world rules, chapter plans, and causal continuity across a full novel. InkWeaver supplies that missing orchestration layer: project facts have clear ownership, generation runs carry explicit context and state, review findings require author confirmation, and finalized chapters become the factual foundation for later work.

InkWeaver is not a hosted model service or an online fiction platform. It includes no model quota. You connect a local model or a cloud account you are authorized to use, and project data stays local by default.

## Writing workflow

1. Define the premise, genre, writing language, and creative strategy.
2. Create or edit characters, relationships, worldbuilding, and story architecture.
3. Plan the whole-book outline and per-chapter blueprints.
4. Choose a model and target length for each chapter draft.
5. Ask AI for a structured review, then edit, ignore, add, and confirm its findings.
6. Revise from the human-confirmed checklist and inspect the diff before merging.
7. Finalize the chapter, project continuity facts and narrative threads, then continue to the next chapter.

## Core capabilities

- **Long-form continuity context** carries explicit premises, characters, worldbuilding, blueprints, and finalized facts into later writing.
- **Foreshadowing and narrative threads** track planned, planted, progressing, resolved, and overdue story threads.
- **Per-chapter model and length control** applies to single and continuous writing runs. Duplicate jobs for the same target are blocked.
- **Human-confirmed review loop** keeps AI findings editable and non-authoritative until the author confirms them, revises, and inspects the diff.
- **Reference material and knowledge retrieval** support TXT, Markdown, and EPUB import, semantic search, and SQLite full-text fallback.
- **Character cards and relationship graph** keep structured character facts and support zoom, pan, or clear operations.
- **Recoverable operations** record progress for long generation, batch writing, imports, finalization, and post-processing.
- **Independent UI and writing languages** let the interface and the novel use different languages.
- **More precise failure messages** distinguish content restrictions, provider failures, prompt-budget exhaustion, and resource conflicts from successful output.

## Model connections

InkWeaver supports two request protocols:

- **OpenAI-compatible** for OpenAI, DeepSeek, Ollama, the NovelAI preset, and compatible Chat Completions endpoints.
- **Native Gemini** for Google Gemini-compatible endpoints.

Advanced model settings expose supported reasoning effort, temperature, structured output, and output limits. After entering an API key and Base URL, you can fetch the model list. A custom URL must still implement one of the supported protocols.

### Ollama

Use Ollama through its OpenAI-compatible endpoint:

```text
Provider:  Ollama (local) or Custom
Protocol:  OpenAI-compatible
Base URL:  http://127.0.0.1:11434/v1
Model:     your Ollama model name, for example qwen3:14b
```

### NovelAI

NovelAI currently has minimal compatibility support. Use your own Persistent API Token and a model identifier available to your account. InkWeaver omits the standard `response_format` parameter for this endpoint. Account permissions and API differences remain subject to NovelAI's documentation.

## Data and privacy

| Data | Default location or destination |
| --- | --- |
| Settings, characters, blueprints, drafts, reviews, and finals | Local SQLite data and finalized text inside the project |
| Knowledge index | Local LanceDB data inside the project |
| Model profiles and API keys | Local user file `~/.vela/models.json` |
| App preferences | Local user file `~/.vela/config.json` |
| Local-model requests | The local or LAN inference service you configure |
| Cloud-model requests | The provider you explicitly select |

The renderer cannot directly read API keys. Electron's main process owns model calls, database access, and filesystem access. Files outside a project require a capability granted through a user-operated system picker.

## Installation and updates

### Windows x64

Download the installer from [GitHub Releases](https://github.com/shuishuipingan/InkWeaver/releases/latest):

```text
inkweaver-setup-<version>.exe
```

Windows supports in-app update checks, downloads, and installation. The installer is not code-signed, so Windows may show publisher or reputation warnings. Continue only after confirming that the file came from the official project Release.

### macOS

Apple Silicon and Intel use separate installers:

```text
inkweaver-mac-arm64-<version>-installer.dmg
inkweaver-mac-x64-<version>-installer.dmg
```

The current macOS installers do not have a Developer ID signature and are not notarized. Download only from the official Release and follow the operating system's first-launch confirmation. Formal releases qualify Windows installation and update files, the macOS Apple Silicon and macOS Intel installers and checksums, and the InkWeaver DSH extension together as one eight-asset set.

## Local development

Node.js 20+ and pnpm 11 are required:

```sh
pnpm install
pnpm dev
```

Common verification commands:

```sh
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
```

## Current boundaries

- InkWeaver does not provide model accounts, cloud quota, online publishing, or a reading community.
- A URL and key do not guarantee compatibility with every third-party API.
- Authors remain responsible for factual accuracy, quality, and copyright decisions.
- Back up important work before upgrades or migrations.

## License

This project is licensed under [GPL-3.0](LICENSE).
