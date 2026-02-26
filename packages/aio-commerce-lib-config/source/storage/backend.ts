/*
 * Storage backend factory for versioning/audit data.
 * Default: files. Optional: database (@adobe/aio-lib-db). State is not used.
 */

import * as auditRepoFiles from "#modules/audit/audit-repository";
import * as versionRepoFiles from "#modules/versioning/version-repository";

const BACKEND_ENV = "CONFIG_STORAGE_BACKEND";
const DEFAULT_BACKEND = "files";

export type VersionBackend = {
  saveVersion: typeof versionRepoFiles.saveVersion;
  getVersion: typeof versionRepoFiles.getVersion;
  getVersionList: typeof versionRepoFiles.getVersionList;
  addToVersionList: typeof versionRepoFiles.addToVersionList;
  deleteVersion: typeof versionRepoFiles.deleteVersion;
  saveMetadata: typeof versionRepoFiles.saveMetadata;
  getMetadata: typeof versionRepoFiles.getMetadata;
  getVersions: typeof versionRepoFiles.getVersions;
};

export type AuditBackend = {
  saveAuditEntry: typeof auditRepoFiles.saveAuditEntry;
  appendToAuditList: typeof auditRepoFiles.appendToAuditList;
  getAuditEntry: typeof auditRepoFiles.getAuditEntry;
  getAuditEntries: typeof auditRepoFiles.getAuditEntries;
  getAuditList: typeof auditRepoFiles.getAuditList;
  getLastAuditHash: typeof auditRepoFiles.getLastAuditHash;
};

export type StorageBackend = {
  versions: VersionBackend;
  audits: AuditBackend;
};

/**
 * Returns the configured storage backend. Defaults to "files".
 */
export function getStorageBackend(): StorageBackend {
  const backend = (process.env[BACKEND_ENV] || DEFAULT_BACKEND).toLowerCase();

  if (backend === "files") {
    return {
      versions: versionRepoFiles,
      audits: auditRepoFiles,
    };
  }

  if (backend === "database" || backend === "db") {
    return createDbBackend();
  }

  throw new Error(
    `Unsupported CONFIG_STORAGE_BACKEND="${backend}". Expected "files" or "database".`,
  );
}

/**
 * Database backend stub: currently not implemented in this environment.
 * Hook point for future App Builder Database storage.
 */
function createDbBackend(): StorageBackend {
  const createNotImplemented = <
    TFn extends (...args: never[]) => Promise<unknown>,
  >(): TFn =>
    ((..._args: never[]) =>
      Promise.reject(
        new Error("Database backend not implemented in this build."),
      )) as TFn;

  const notImplSaveVersion =
    createNotImplemented<VersionBackend["saveVersion"]>();
  const notImplGetVersion =
    createNotImplemented<VersionBackend["getVersion"]>();
  const notImplGetVersionList =
    createNotImplemented<VersionBackend["getVersionList"]>();
  const notImplAddToVersionList =
    createNotImplemented<VersionBackend["addToVersionList"]>();
  const notImplDeleteVersion =
    createNotImplemented<VersionBackend["deleteVersion"]>();
  const notImplSaveMetadata =
    createNotImplemented<VersionBackend["saveMetadata"]>();
  const notImplGetMetadata =
    createNotImplemented<VersionBackend["getMetadata"]>();
  const notImplGetVersions =
    createNotImplemented<VersionBackend["getVersions"]>();

  const notImplSaveAuditEntry =
    createNotImplemented<AuditBackend["saveAuditEntry"]>();
  const notImplAppendToAuditList =
    createNotImplemented<AuditBackend["appendToAuditList"]>();
  const notImplGetAuditEntry =
    createNotImplemented<AuditBackend["getAuditEntry"]>();
  const notImplGetAuditEntries =
    createNotImplemented<AuditBackend["getAuditEntries"]>();
  const notImplGetAuditList =
    createNotImplemented<AuditBackend["getAuditList"]>();
  const notImplGetLastAuditHash =
    createNotImplemented<AuditBackend["getLastAuditHash"]>();

  return {
    versions: {
      saveVersion: notImplSaveVersion,
      getVersion: notImplGetVersion,
      getVersionList: notImplGetVersionList,
      addToVersionList: notImplAddToVersionList,
      deleteVersion: notImplDeleteVersion,
      saveMetadata: notImplSaveMetadata,
      getMetadata: notImplGetMetadata,
      getVersions: notImplGetVersions,
    },
    audits: {
      saveAuditEntry: notImplSaveAuditEntry,
      appendToAuditList: notImplAppendToAuditList,
      getAuditEntry: notImplGetAuditEntry,
      getAuditEntries: notImplGetAuditEntries,
      getAuditList: notImplGetAuditList,
      getLastAuditHash: notImplGetLastAuditHash,
    },
  };
}
