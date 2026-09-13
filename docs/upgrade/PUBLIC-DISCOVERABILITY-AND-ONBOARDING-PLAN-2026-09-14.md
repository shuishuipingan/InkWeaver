# InkWeaver 公共发现与首次体验优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution is selected for this session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让新用户能从 GitHub 搜索进入 InkWeaver，在十几秒内理解价值、三分钟内完成首次写作，同时让公开仓库只包含可维护的源码与文档。

**Architecture:** 先建立可回滚的公共树分类器和忽略规则，再以中英文 README 作为统一入口，快速开始和无版权示例作为独立文档层，GitHub 模板作为社区层，维护者脚本作为只读指标层。所有优化提交都不触碰 v1.2.0 发布代码、tag、桌面资产或 DSH tarball。

**Tech Stack:** Markdown, SVG, Node.js ESM, Vitest, GitHub issue/discussion templates, GitHub CLI/API。

**Spec:** `docs/upgrade/PUBLIC-DISCOVERABILITY-AND-ONBOARDING-DESIGN-2026-09-14.md`

## Global Constraints

- 不发布 npm，DSH 交付包固定为 `@shuishuipingan/inkweaver-dsh`。
- `@linxin666/dsh-web-all` 只是外部 companion，`@ethanyoq/dsh-ai-novel-writer` 只是历史名称。
- 不修改 v1.2.0 Release 的 tag、资产或 SHA；任何代码变更必须另行升版本。
- 不删除业务源码、DSH preset、发布脚本、必要图标和实际被测试读取的 fixture。
- 用户现有截图改动、`.snapshot-test-*`、`.playwright-cli` 和 `.dsh-upgrade-inspect` 不得被提交或删除。
- 不新增隐藏遥测；增长快照只读取 GitHub API，并且必须记录统计窗口与 CI clone 限制。
- 每个任务完成后都运行该任务列出的验证命令，再提交独立 commit。

---

### Task 1: 公共树卫生与版本入口

**Files:**
- Create: `scripts/check-public-tree.mjs`
- Create: `scripts/__tests__/public-tree-hygiene.test.ts`
- Modify: `.gitignore`
- Modify: `README_zh.md`
- Delete from repository only: tracked `_tmp_*`, `.vitest-attachments/**`, and browser `__screenshots__/**` files proven to be generated artifacts

**Interfaces:**
- `check-public-tree.mjs` exports `collectPublicTreeViolations(paths)` and a CLI that returns JSON `{schemaVersion: 1, violations: []}`.
- The checker accepts repository-relative paths and never follows directories outside the repository.
- A generated path is forbidden when it matches `_tmp_*`, `.vitest-attachments/`, `.snapshot-test-*`, `.playwright-cli/`, `.dsh-upgrade-inspect/`, or a test `__screenshots__/` path without a source reference.

- [ ] **Step 1: Write the failing classifier tests**

  Cover forbidden `_tmp_foo`, `.vitest-attachments/x.png`, `.snapshot-test-a/x`, allowed `src/App.tsx`, allowed `build/icon.png`, and a test screenshot explicitly marked as retained.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `pnpm exec vitest run scripts/__tests__/public-tree-hygiene.test.ts --maxWorkers=1`

  Expected: FAIL because `scripts/check-public-tree.mjs` does not exist.

- [ ] **Step 3: Implement the path-only classifier and CLI**

  Keep the classifier pure; use `path.posix.normalize` after converting separators, reject absolute paths and `..`, and print one JSON report. Do not inspect file contents in the classifier.

- [ ] **Step 4: Run tests and the pre-clean inventory**

  Run: `pnpm exec vitest run scripts/__tests__/public-tree-hygiene.test.ts --maxWorkers=1`

  Run: `node scripts/check-public-tree.mjs --json`

  Expected: classifier tests pass and the inventory lists only the exact generated paths selected for removal.

- [ ] **Step 5: Verify screenshot references before deletion**

  Run: `rg -n "__screenshots__|vitest-attachments|_tmp_" src scripts docs package.json vitest*.ts .github`

  Retain a screenshot only if a test, script, documentation link, or release evidence reads it. Record retained paths in the test fixture or documentation; do not infer from filename alone.

- [ ] **Step 6: Update ignore rules and the compatibility README**

  Add exact ignore rules for generated attachments, snapshot temp directories, and browser screenshot output. Rewrite `README_zh.md` to state v1.2.0, link to `README.md`, the Release, DSH plugin guide, and the quickstart.

- [ ] **Step 7: Remove only validated generated files and rerun hygiene**

  Use the explicit path list from Step 5, remove tracked generated files from the repository, then run `node scripts/check-public-tree.mjs --json` and confirm `violations=[]`.

- [ ] **Step 8: Commit the hygiene task**

  After the classifier has printed the exact generated paths, stage only those validated deletions with `git add -u -- _tmp_* .vitest-attachments 'src/**/__screenshots__/**'` together with the new checker, `.gitignore`, and `README_zh.md`; do not stage any user screenshot modification or untracked test directory.

  Commit: `git commit -m "chore: clean generated files from public tree"`

---

### Task 2: 首页首屏与产品视觉入口

**Files:**
- Create: `docs/assets/inkweaver-writing-loop.svg`
- Modify: `README.md`
- Modify: `README_en.md`
- Modify: `docs/PROJECT-FILE-GUIDE.md`
- Modify: `CHANGELOG.md` only when links or current release copy need synchronization

**Interfaces:**
- The SVG is a static, local, no-external-resource flow diagram: premise → characters → blueprint → draft → review → finalize → next chapter.
- Both READMEs use the same section order and the same v1.2.0/Release/DSH facts.
- The first screen contains a value proposition, image/diagram, download link, quickstart link, and audience statement before deep engineering details.

- [ ] **Step 1: Add the SVG flow asset**

  Use explicit `viewBox`, readable labels at 100% zoom, accessible `<title>`/`<desc>`, and no external fonts or network requests. Keep the diagram illustrative, not a claim that the model automatically finalizes text.

- [ ] **Step 2: Rewrite the Chinese README first screen**

  Add a compact hero, “适合谁/不适合谁”, download buttons for Windows/macOS, the diagram, and a three-minute quickstart link. Keep unsigned/notarization and no-npm disclosures visible but below the primary action.

- [ ] **Step 3: Mirror the structure in README_en.md**

  Translate facts rather than adding independent feature claims. Keep plugin names, release URL, and installation command byte-for-byte equivalent where applicable.

- [ ] **Step 4: Add link and Markdown contract tests**

  Create `scripts/__tests__/public-homepage-contract.test.ts` to assert both READMEs contain the Release URL, quickstart path, SVG path, package name, no-npm statement, and signing disclosure.

- [ ] **Step 5: Run the documentation tests**

  Run: `pnpm exec vitest run scripts/__tests__/documentation-consistency.test.ts scripts/__tests__/public-homepage-contract.test.ts --maxWorkers=1`

- [ ] **Step 6: Commit the homepage task**

  Run: `git add README.md README_en.md docs/assets/inkweaver-writing-loop.svg docs/PROJECT-FILE-GUIDE.md scripts/__tests__/public-homepage-contract.test.ts`

  Commit: `git commit -m "docs: improve InkWeaver public homepage"`

---

### Task 3: 快速开始与无版权示例项目

**Files:**
- Create: `docs/quickstart/README.md`
- Create: `docs/quickstart/example-project/README.md`
- Create: `docs/quickstart/example-project/project-brief.md`
- Create: `docs/quickstart/example-project/story-bible.md`
- Create: `docs/quickstart/example-project/outline.md`
- Create: `docs/quickstart/example-project/chapters/chapter-01.md`
- Modify: `docs/PROJECT-FILE-GUIDE.md`

**Interfaces:**
- The quickstart is copyable as Markdown and does not require a database migration or hidden credentials.
- The example is the original “灯塔来信 / Lighthouse Letters” fixture, explicitly marked as public-domain-style original sample text, not user content.
- Steps cover model connection, project creation, blueprint, draft, review, author confirmation, finalization, next-chapter continuity, and optional DSH installation.

- [ ] **Step 1: Write quickstart acceptance tests**

  Assert the guide contains the exact Release link, Node/pnpm prerequisites, first-project flow, model-credential warning, Windows/macOS warning, DSH tarball command, and links to the example files.

- [ ] **Step 2: Run the focused test and verify failure**

  Run: `pnpm exec vitest run scripts/__tests__/quickstart-contract.test.ts --maxWorkers=1`

  Expected: FAIL because the quickstart files and contract test are absent.

- [ ] **Step 3: Write the smallest complete quickstart**

  Use numbered actions with expected UI results and recovery paths. Explicitly say the desktop `.vela` project and DSH `.ai-novel` project are separate formats.

- [ ] **Step 4: Add the example assets**

  Keep the sample under 2,000 Chinese characters, use stable names, no API keys, no real persons, and include a chapter-end unresolved question that demonstrates continuous writing.

- [ ] **Step 5: Run the contract and link checks**

  Run: `pnpm exec vitest run scripts/__tests__/quickstart-contract.test.ts --maxWorkers=1`

  Run: `node scripts/check-i18n-coverage.mjs`

- [ ] **Step 6: Commit the quickstart task**

  Commit: `git commit -m "docs: add first chapter quickstart and sample"`

---

### Task 4: GitHub 社区入口与 DSH 分发材料

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/installation.yml`
- Create: `.github/DISCUSSION_TEMPLATE/ideas.yml`
- Create: `.github/DISCUSSION_TEMPLATE/questions.yml`
- Create: `CONTRIBUTING.md`
- Create: `ROADMAP.md`
- Create: `docs/distribution/DSH-LISTING-SUBMISSION.md`
- Modify: `README.md`
- Modify: `README_en.md`

**Interfaces:**
- Issue forms require version, OS/architecture, reproduction steps, logs with secrets removed, and whether the problem is desktop or DSH.
- Discussion templates are welcoming and do not require users to expose novel text.
- `CONTRIBUTING.md` explains local tests, public-tree hygiene, no-npm policy, and how to propose a DSH plugin-list entry.
- `ROADMAP.md` separates shipped 1.2.0 from planned work and does not promise unsigned packages are trusted.

- [ ] **Step 1: Add template schema tests**

  Test YAML/Markdown files for required fields, no secret request, and links to the correct docs.

- [ ] **Step 2: Implement the forms and contribution guide**

  Include privacy guidance, minimal reproduction, labels, code of conduct reference if present, and a clear “where to ask” path.

- [ ] **Step 3: Prepare the DSH curated-list submission**

  Write a short entry with package name, Release tarball install command, official Harness baseline, V2 proposal boundary, and screenshots/diagram links. Do not claim npm availability or include external companion as an InkWeaver dependency.

- [ ] **Step 4: Enable Discussions through the GitHub API**

  Use `gh api --method PATCH repos/shuishuipingan/InkWeaver -f has_discussions=true`, then read back `has_discussions` and preserve the output in the acceptance receipt.

- [ ] **Step 5: Run local template/link checks and commit**

  Run: `pnpm exec vitest run scripts/__tests__/github-community-contract.test.ts --maxWorkers=1`

  Commit: `git commit -m "docs: add GitHub community and DSH discovery paths"`

---

### Task 5: 隐私友好的增长快照与最终回归

**Files:**
- Create: `scripts/github-growth-snapshot.mjs`
- Create: `scripts/__tests__/github-growth-snapshot.test.ts`
- Create: `docs/metrics/README.md`
- Create: `docs/metrics/2026-09-14-baseline.json`
- Modify: `docs/upgrade/PUBLIC-DISCOVERABILITY-AND-ONBOARDING-DESIGN-2026-09-14.md`
- Modify: `docs/upgrade/PUBLIC-DISCOVERABILITY-AND-ONBOARDING-ACCEPTANCE-2026-09-14.md`

**Interfaces:**
- CLI accepts `--repository owner/name`, `--output path`, and optional `--token-env GITHUB_TOKEN`.
- Output schema is `{schemaVersion: 1, capturedAt, repository, window, repositoryStats, traffic, releases, topicSearch, interpretation}`.
- The script uses GitHub REST only, never app telemetry; token values are never printed or written.
- `interpretation` labels clone data as “not a user count” and records whether traffic data lags the current date.

- [ ] **Step 1: Write deterministic parser tests**

  Mock fetch responses for repository, views, clones, referrers, paths, releases, and topic search; assert stable ordering, missing endpoint handling, and no token serialization.

- [ ] **Step 2: Run the focused test and verify failure**

  Run: `pnpm exec vitest run scripts/__tests__/github-growth-snapshot.test.ts --maxWorkers=1`

  Expected: FAIL because the snapshot module is absent.

- [ ] **Step 3: Implement the read-only CLI**

  Use `fetch`, GitHub API version headers, explicit time-window metadata, and atomic write to the requested output path. Redact response fields to the documented public metrics only.

- [ ] **Step 4: Capture the baseline**

  Run: `node scripts/github-growth-snapshot.mjs --repository shuishuipingan/InkWeaver --output docs/metrics/2026-09-14-baseline.json`

  Verify the file contains no token, path, novel content, or raw API headers.

- [ ] **Step 5: Enable and verify Discussions and repository metadata**

  Read back `has_discussions`, description, topics, default branch, and `dsh-plugin` search result through `gh api`.

- [ ] **Step 6: Run final regression gates**

  Run:

  ```text
  pnpm run typecheck
  pnpm run check:i18n
  pnpm run check:runtime-log-coverage
  pnpm test
  pnpm test:browser
  pnpm build
  pnpm --dir plugins/inkweaver-dsh typecheck
  pnpm --dir plugins/inkweaver-dsh build
  pnpm --dir plugins/inkweaver-dsh exec vitest run --config vitest.config.ts
  node scripts/check-public-tree.mjs --json
  node scripts/verify-github-release-assets.mjs --version 1.2.0
  ```

- [ ] **Step 7: Verify release immutability and remote state**

  Confirm v1.2.0 tag/asset SHA, DSH tarball SHA, topic visibility, and release URL are unchanged from the prior receipt. Confirm no generated files are staged.

- [ ] **Step 8: Write the acceptance receipt and commit**

  Record command exit codes, public-tree counts, GitHub readback, baseline metrics, limitations, and exact commit IDs in `docs/upgrade/PUBLIC-DISCOVERABILITY-AND-ONBOARDING-ACCEPTANCE-2026-09-14.md`.

  Commit: `git commit -m "docs: record public discoverability optimization acceptance"`
