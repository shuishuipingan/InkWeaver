export const PROJECT_SNAPSHOT_SCHEMA_VERSION = 1 as const

export interface ProjectSnapshotFile {
  relativePath: string
  bytes: number
  sha256: string
}

export interface ProjectSnapshotManifest {
  schemaVersion: typeof PROJECT_SNAPSHOT_SCHEMA_VERSION
  snapshotId: string
  createdAt: string
  databaseFile: string
  databaseSha256: string
  files: ProjectSnapshotFile[]
}

export type ProjectSnapshotResult =
  | { success: true; manifest: ProjectSnapshotManifest }
  | { success: false; error: string }

export interface ProjectSnapshotVerification {
  snapshotId: string
  valid: boolean
  missing: string[]
  mismatched: string[]
}
