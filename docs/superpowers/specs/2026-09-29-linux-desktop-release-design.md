# Linux Desktop Release Support — Design

## User intent

The desktop release should include Linux packages for the common desktop distribution families, alongside Windows and macOS. The user selected x64 `.deb`, `.rpm`, and AppImage artifacts for the v1.3.6 release.

## Goals

- Publish one Linux x64 AppImage for general Linux desktop use.
- Publish one Debian package for Ubuntu/Debian and one RPM package for Fedora/RHEL/openSUSE.
- Treat Linux qualification as a required entity in the same immutable release as Windows and both macOS architectures. A failed Linux qualification blocks promotion of the complete release.
- Verify packaged startup and native database bindings, not only archive creation.
- Publish exact asset names and SHA-256 checksums through the existing artifact-provenance workflow.
- Document the Linux distributions and system requirements actually tested by qualification.

## Non-goals

- Linux ARM64 in v1.3.6.
- Separate packages for every point release or derivative distribution.
- Snap, Flatpak, pacman, or source packages in v1.3.6.
- Claiming universal compatibility without a tested system baseline.

## Package set

One required qualification entity, `linux-x64`, will produce these six release assets:

- `inkweaver-linux-x64-{version}.AppImage`
- `inkweaver-linux-x64-{version}.AppImage.sha256`
- `inkweaver-linux-x64-{version}.deb`
- `inkweaver-linux-x64-{version}.deb.sha256`
- `inkweaver-linux-x64-{version}.rpm`
- `inkweaver-linux-x64-{version}.rpm.sha256`

The complete desktop release will therefore contain 13 assets: the current seven Windows/macOS assets plus the six Linux assets above.

## Build and qualification flow

Add a manually dispatched Linux qualification workflow pinned to the same full source SHA, version, tag, and release-profile path as the Windows and macOS jobs. It builds all three Linux formats from one clean Linux x64 build environment and uploads one exact-name `qualified-linux-x64` artifact.

Use an explicit GitHub runner label and a pinned Linux package-build environment rather than `ubuntu-latest`. Verify the chosen glibc floor with the packaged native bindings before documenting supported distro baselines.

The qualification must exercise each format:

- Install and launch the `.deb` package on a documented Ubuntu/Debian x64 baseline.
- Install and launch the `.rpm` package on a documented Fedora/RHEL-family x64 baseline.
- Launch the AppImage on the documented general Linux baseline, including the expected FUSE or extraction behavior.
- Verify that packaged `better-sqlite3` and LanceDB Linux x64 GNU bindings load and execute a minimal database operation.
- Capture machine-readable install, launch, native-binding, and signing/disclosure receipts in the existing evidence format.

The initial OS baselines must be selected from current hosted runner and package support, then recorded in the release profile and user documentation. Qualification must test each package format on its matching distro family; only exact distro versions that pass will be listed as supported. Linux packages will be disclosed as unsigned unless a signing identity is configured and verified.

## Release verification changes

- Extend the release profile to add `linux-x64`, its qualification workflow, artifact name, x64 architecture, acceptance receipts, and the six exact asset contracts.
- Extend profile validation, evidence validation, qualification run mapping, and promotion validation to accept `linux-x64` without weakening the existing same-SHA, artifact-ID, checksum, lockfile, or exact-asset checks.
- Require Windows, macOS ARM64, macOS x64, and Linux x64 qualifications before creating the v1.3.6 Release.
- Update release profile tests and the promotion fixtures to prove missing Linux qualifications or assets block publication.
- Update bilingual README, quickstart downloads, and the v1.3.6 changelog after the exact tested distro baseline is settled.

## Compatibility and failure behavior

If any Linux format cannot install or start in its declared test environment, promotion fails. If a Linux native binding is missing or fails its smoke test, promotion fails. The app must not be published with release notes claiming Linux support when any Linux asset or receipt is missing.

## Open implementation detail

The checked-in promotion verifier currently hard-codes the Windows and macOS qualification entities and includes a vendor-provenance comment. The implementation must extend its accepted platform contract while preserving all existing fail-closed validation and documenting the source/provenance of the updated verifier.
