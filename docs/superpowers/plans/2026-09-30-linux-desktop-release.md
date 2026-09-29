# Linux Desktop Release Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Linux x64 `.deb`, `.rpm`, and AppImage packages to the required v1.3.6 release matrix and publish only after all four desktop qualification entities pass.

**Architecture:** Keep Linux packaging, runtime evidence, and release promotion on the existing immutable artifact path. Add one `linux-x64` qualification entity that builds all three package formats from one pinned source SHA, validates native database bindings and actual launch behavior on the target distro families, and contributes exact asset/checksum records to the same promotion contract as Windows and macOS.

**Tech Stack:** TypeScript, Electron 41, electron-builder 26, pnpm 11, GitHub Actions, Ubuntu/Debian packages, Fedora/RPM packages, AppImage, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-linux-desktop-release-design.md`

## Global Constraints

- Release version is `1.3.6`; the qualification commit, tag `v1.3.6`, frozen release profile, lockfile hash, and all four qualification artifacts must agree.
- Required qualification entities are exactly `windows`, `macos-arm64`, `macos-x64`, and `linux-x64`.
- Linux packages are x64 only: AppImage, `.deb`, and `.rpm`; Linux ARM64, pacman, Snap, Flatpak, and source packages are out of scope.
- Linux release assets are exactly `inkweaver-linux-x64-{version}.AppImage[.sha256]`, `inkweaver-linux-x64-{version}.deb[.sha256]`, and `inkweaver-linux-x64-{version}.rpm[.sha256]`.
- Every published asset must be copied from the exact run-attempt artifact ID that passed qualification; do not rebuild during promotion.
- Preserve existing same-SHA, profile-hash, artifact digest, release asset allowlist, unsigned-distribution disclosure, and final publish readback checks.
- Advertise only distro versions that pass the Linux package smoke matrix; describe AppImage FUSE/extraction requirements accurately.
- Do not create the GitHub tag or Release until all four platform qualification runs succeed.
- Keep all platform qualification and promotion work on `main`; do not create a PR.

## Review Focus

- Linux native SQLite or LanceDB bindings missing from an otherwise successful AppImage/deb/rpm build must fail packaged smoke.
- A package format that installs but cannot launch on its declared distro baseline must fail Linux qualification.
- AppImage execution without FUSE must either pass using the documented extraction mode or fail with a clear unsupported-runtime receipt.
- A release profile missing one Linux package or checksum must be rejected before artifact download/promotion.
- A Linux artifact with a different source SHA, profile hash, lockfile hash, run attempt, or artifact ID must be rejected.
- Existing Windows/macOS qualification bundles and their exact assets must remain accepted without schema relaxation.

---

### Task 1: Add the Linux package and compatibility contract

**Files:**
- Modify: `electron-builder.json5`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `electron/__tests__/package-contract.test.ts`

- [ ] **Step 1: Write failing Linux packaging contract tests**

Assert that the Linux electron-builder targets are exactly AppImage, deb, and rpm; that the package scripts expose a gated x64 Linux artifact build; that the Linux LanceDB GNU binding is pinned to `0.22.3`; and that the ASAR unpack rules include the Linux binding.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run electron/__tests__/package-contract.test.ts`

Expected: FAIL because the current package target only declares AppImage and has no Linux qualification build script or explicit Linux native binding.

- [ ] **Step 3: Implement the minimal package configuration**

Add the x64 GNU LanceDB optional dependency, exact Linux asset names, and `build:linux:artifacts` script. Keep all three formats in one electron-builder Linux target and use `--publish never` so only the qualification/promotion pipeline can publish.

- [ ] **Step 4: Update and verify the lockfile and package contract**

Run: `pnpm install --lockfile-only`

Run: `pnpm exec vitest run electron/__tests__/package-contract.test.ts`

Expected: lockfile resolves the pinned Linux binding and all package contract tests pass.

### Task 2: Add Linux native and package launch receipts

**Files:**
- Create: `scripts/smoke-linux-packages.mjs`
- Create: `scripts/__tests__/smoke-linux-packages.test.ts`
- Modify: `scripts/release-evidence-v2.mjs`
- Modify: `electron/services/release-vector-smoke.ts`
- Test: `electron/services/__tests__/release-vector-smoke.test.ts`
- Test: `scripts/__tests__/release-evidence-v2.test.ts`

- [ ] **Step 1: Write failing Linux receipt and smoke-contract tests**

Cover `.deb` installation and launch on Ubuntu 22.04 and Debian 13, `.rpm` installation and launch on Fedora 44, AppImage launch on all three, native `better-sqlite3`/LanceDB loading and operations, cleanup, and required JSON evidence fields. Extend the packaged vector smoke receipt with a successful in-memory SQLite `SELECT 1` result so the Linux qualification proves both native database engines execute.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm exec vitest run scripts/__tests__/smoke-linux-packages.test.ts scripts/__tests__/release-evidence-v2.test.ts`

Expected: FAIL because the evidence system currently has no Linux platform profile, acceptance receipts, or Linux packaged-smoke validation.

- [ ] **Step 3: Implement deterministic package smoke helpers**

Create an explicit-mode smoke driver that installs the `.deb` on Ubuntu 22.04 and Debian 13, the `.rpm` on Fedora 44, and launches the AppImage on all three. Use isolated home/XDG data directories and Xvfb to launch the packaged app in the existing token-gated release-smoke mode. Record package name/version, distro image identity, glibc version, exit status, native-binding results, and cleanup status; never include user data.

- [ ] **Step 4: Verify the glibc and AppImage runtime floor**

Inspect required glibc symbols for Electron, `better-sqlite3`, and LanceDB from each package. Require glibc 2.35 or lower for the Ubuntu 22.04 build baseline; exercise AppImage through FUSE and `--appimage-extract-and-run` when FUSE is unavailable. If any format exceeds this floor, adjust the pinned build container or narrow the documented baseline before release.

- [ ] **Step 5: Extend evidence-v2 Linux profiles and receipt validation**

Add Linux x64 workflow identity, command steps, acceptance receipt allowlist, packaged-smoke evidence, architecture reporting, artifact names, and unsigned Linux signing/disclosure receipt. Keep Windows and macOS profiles unchanged.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `pnpm exec vitest run scripts/__tests__/smoke-linux-packages.test.ts scripts/__tests__/release-evidence-v2.test.ts`

Expected: Linux receipts pass valid cases and reject missing, mislabeled, incomplete, or cross-platform evidence.

### Task 3: Extend the frozen release profile and promotion verifier

**Files:**
- Modify: `.release/release-profile.json`
- Modify: `.release/scripts/validate-release-profile.mjs`
- Modify: `.release/scripts/github-desktop-promotion.mjs`
- Modify: `.release/scripts/freeze-release-contract.mjs`
- Modify: `.release/scripts/legacy-qualification-adapter.mjs`
- Modify: `.release/scripts/project-legacy-qualification.mjs`
- Modify: `.release/scripts/finalize-legacy-qualification.mjs`
- Test: `scripts/__tests__/release-profile-contract.test.ts`
- Test: `scripts/__tests__/github-release-asset-contract.test.ts`
- Test: `scripts/__tests__/release-promotion-qualification-entities.test.ts`
- Test: `scripts/__tests__/legacy-qualification-projection.test.ts`
- Test: `scripts/__tests__/release-qualification-adapter.test.ts`
- Test: `scripts/__tests__/cross-platform-runtime-artifact-promotion-workflow.test.ts`

- [ ] **Step 1: Write failing Linux profile/promotion tests**

Assert Linux x64 is a supported qualification entity with the exact six asset names and required receipts. Prove that a missing Linux run, package, checksum, or evidence file fails promotion, and that a Linux run with a mismatched commit/profile/lockfile hash is rejected.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm exec vitest run scripts/__tests__/release-profile-contract.test.ts scripts/__tests__/release-promotion-qualification-entities.test.ts scripts/__tests__/legacy-qualification-projection.test.ts scripts/__tests__/cross-platform-runtime-artifact-promotion-workflow.test.ts`

Expected: FAIL because the checked-in validators and promotion engine allow only Windows and macOS entities.

- [ ] **Step 3: Extend profile/evidence validation without loosening existing checks**

Add `linux-x64` with architecture `x64`, the Linux qualification workflow, six exact Linux assets, required Linux receipt paths, and unsigned-with-disclosure policy. Extend qualification identity and projection code so Linux manifests report `platform: linux-x64` and `architecture: x64`.

- [ ] **Step 4: Extend promotion run mapping and asset verification**

Require exactly four qualification run identities. Verify the three Linux packages and three checksums against the frozen profile and copy only the selected Linux artifact ID. Preserve the existing artifact digest, same-commit, profile-byte-hash, lockfile-hash, and release readback checks. Keep the vendored promotion validator provenance documented.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run the same four Vitest files.

Expected: all valid four-platform fixtures pass; every missing/mismatched Linux qualification case fails closed; the existing three-platform regression fixtures remain green.

### Task 4: Add the Linux x64 GitHub qualification workflow

**Files:**
- Create: `.github/workflows/linux-cloud-build.yml`
- Modify: `scripts/release-evidence-v2.mjs`
- Test: `scripts/__tests__/linux-cloud-build-workflow.test.ts`

- [ ] **Step 1: Write failing workflow contract tests**

Assert a manually dispatched workflow checks out the exact expected SHA, pins release tag/version/profile path, uses `ubuntu-24.04` plus the pinned Ubuntu 22.04 x64 package-build container, runs the full test/browser/package-smoke gates on Ubuntu 22.04, Debian 13, and Fedora 44, finalizes the Linux evidence bundle, and uploads only `qualified-linux-x64`.

- [ ] **Step 2: Run the workflow test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/linux-cloud-build-workflow.test.ts`

Expected: FAIL because there is no Linux workflow.

- [ ] **Step 3: Implement the Linux qualification workflow**

Use the frozen release inputs and pinned Ubuntu 22.04 x64 build-container digest. Build AppImage/deb/rpm with `pnpm run build:linux:artifacts`; install and launch `.deb` on Ubuntu 22.04 and Debian 13, `.rpm` on Fedora 44, and AppImage on Ubuntu 22.04, Debian 13, and Fedora 44 (both FUSE and extraction mode where supported). Finalize all receipts and checksums, and upload the exact profile artifact name.

- [ ] **Step 4: Run the workflow contract test to verify it passes**

Run: `pnpm exec vitest run scripts/__tests__/linux-cloud-build-workflow.test.ts`

Expected: PASS with the same commit identity and evidence contract as the other qualification workflows.

### Task 5: Publish tested Linux compatibility and v1.3.6 notes

**Files:**
- Modify: `README.md`
- Modify: `README_en.md`
- Modify: `docs/quickstart/README.md`
- Modify: `CHANGELOG.md`
- Test: `scripts/__tests__/release-version.test.ts`
- Test: `scripts/__tests__/release-promotion-qualification-entities.test.ts`

- [ ] **Step 1: Write failing documentation/release-note assertions**

Assert v1.3.6 advertises `.deb`, `.rpm`, and AppImage, documents the tested Ubuntu 22.04, Debian 13, and Fedora 44 x64 baselines, the verified glibc floor and AppImage FUSE/extraction behavior, and does not claim untested Linux versions or architectures.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm exec vitest run scripts/__tests__/release-version.test.ts scripts/__tests__/release-promotion-qualification-entities.test.ts`

Expected: FAIL because current release notes and download guidance list only Windows and macOS.

- [ ] **Step 3: Update bilingual v1.3.6 release notes and downloads**

List exact filenames, the tested Ubuntu 22.04, Debian 13, and Fedora 44 x64 baselines, AppImage FUSE/extraction behavior, glibc floor, and unsigned-package disclosure. Keep v1.3.5 history intact.

- [ ] **Step 4: Run focused release metadata tests**

Run the same two Vitest files.

Expected: PASS with release notes extracted only for v1.3.6 and all 13 release asset names accounted for.

### Task 6: Verify, commit directly to main, qualify, and publish v1.3.6

**Files:**
- No additional source files expected beyond Tasks 1–5.

- [ ] **Step 1: Run local validation**

Run sequentially to avoid pnpm lockfile contention:

- `pnpm test`
- `pnpm test:browser`
- `pnpm run test:renderer-surface:e2e`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm check:i18n`
- `pnpm check:runtime-log-coverage`
- `node scripts/check-public-tree.mjs --json`
- `pnpm build`

Expected: every command passes.

- [ ] **Step 2: Commit release support directly to main and push**

Run `git diff --check`, commit the reviewed Linux release implementation and v1.3.6 notes to `main`, then push `origin main`. Do not create a pull request.

- [ ] **Step 3: Run all four qualification workflows against the same full SHA**

Dispatch Windows, macOS ARM64, macOS x64, and Linux x64 using `v1.3.6` and `.release/release-profile.json`. Wait for each workflow to complete successfully and record each run ID, attempt, and artifact ID.

- [ ] **Step 4: Promote only the four qualified artifact IDs**

Dispatch the existing promotion workflow from `main` with the four exact run identities, `expected_sha` from Step 2, `release_tag=v1.3.6`, and the repository's required promotion confirmation. Do not create the tag separately.

- [ ] **Step 5: Verify GitHub Release v1.3.6**

Read back the release and confirm it is published, points to the qualified SHA, contains exactly the 13 declared assets with verified checksums and Linux compatibility notes, and is marked latest.
