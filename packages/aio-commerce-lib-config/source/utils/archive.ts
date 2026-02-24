/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * Archive management using @adobe/aio-lib-files only (no state).
 * Large or old versions are moved from live version storage to an archive path.
 */

import AioLogger from "@adobe/aio-lib-core-logging";

import { getSharedFiles } from "#utils/repository";

import { getValueSize } from "./storage-limits";

import type { ConfigVersion } from "#modules/versioning/types";

const logger = AioLogger("aio-commerce-lib-config:archive");

/** Storage size constants */
const BYTES_PER_KB = 1024;
const DEFAULT_ARCHIVE_SIZE_KB = 900;
const ARCHIVE_SIZE_ENV_VAR = "CONFIG_ARCHIVE_SIZE_KB";

/** Default age threshold for archiving (90 days). */
const DEFAULT_ARCHIVE_AGE_DAYS = 90;
const ARCHIVE_AGE_ENV_VAR = "CONFIG_ARCHIVE_MAX_AGE_DAYS";

/** Regex pattern for safe path components (security: prevent path traversal). */
const SAFE_PATH_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Time constants for day calculations */
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_DAY =
  HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

export type ArchiveReference = {
  id: string;
  archived: true;
  archivedAt: string;
  archivePath: string;
  sizeInBytes: number;
  reason: "size" | "age" | "manual";
};

/**
 * Checks if a version should be archived based on size or age.
 */
export function shouldArchive(
  version: ConfigVersion,
  maxAgeDays: number = getArchiveAgeThresholdDays(),
): { should: boolean; reason: "size" | "age" | null } {
  const sizeInBytes = getValueSize(version);

  if (sizeInBytes >= getArchiveSizeThresholdBytes()) {
    return { should: true, reason: "size" };
  }

  const versionDate = new Date(version.timestamp);
  const ageInDays = getDaysOld(versionDate);
  if (ageInDays > maxAgeDays) {
    return { should: true, reason: "age" };
  }

  return { should: false, reason: null };
}

/**
 * Archives a version to lib-files and returns reference data.
 */
export async function archiveVersion(options: {
  namespace: string;
  scopeCode: string;
  version: ConfigVersion;
  reason?: "size" | "age" | "manual";
  precalculatedSize?: number;
}): Promise<ArchiveReference> {
  const { scopeCode, version, reason = "manual", precalculatedSize } = options;
  const files = await getSharedFiles();

  const archivePath = getArchivePath(scopeCode, version.id);
  await files.write(archivePath, JSON.stringify(version));

  const sizeInBytes = precalculatedSize ?? getValueSize(version);

  // Remove live copy to save space; ignore errors
  if (files.delete) {
    try {
      await files.delete(getVersionPath(scopeCode, version.id));
    } catch {
      // Ignore cleanup errors because archive write already succeeded.
    }
  }

  return {
    id: version.id,
    archived: true,
    archivedAt: new Date().toISOString(),
    archivePath,
    sizeInBytes,
    reason,
  };
}

/**
 * Restores a version from live or archive storage.
 */
export async function restoreFromArchive(
  _namespace: string,
  scopeCode: string,
  versionId: string,
): Promise<ConfigVersion | null> {
  const files = await getSharedFiles();

  // Try live path first
  try {
    const live = await files.read(getVersionPath(scopeCode, versionId));
    if (live) {
      return JSON.parse(live.toString());
    }
  } catch {
    // ignore
  }

  // Fallback to archive
  try {
    const archived = await files.read(getArchivePath(scopeCode, versionId));
    if (archived) {
      return JSON.parse(archived.toString());
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Archives old versions for a scope with parallel processing.
 */
export async function archiveOldVersions(
  namespace: string,
  scopeCode: string,
  versionIds: string[],
  maxAgeDays: number = getArchiveAgeThresholdDays(),
): Promise<number> {
  const results = await Promise.allSettled(
    versionIds.map(async (versionId) => {
      try {
        const version = await restoreFromArchive(
          namespace,
          scopeCode,
          versionId,
        );
        if (!version) {
          return false;
        }

        const { should, reason } = shouldArchive(version, maxAgeDays);
        if (should && reason) {
          await archiveVersion({ namespace, scopeCode, version, reason });
          return true;
        }
        return false;
      } catch (error) {
        logger.warn(
          `Failed to archive version ${versionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    }),
  );

  return results.filter(
    (result) => result.status === "fulfilled" && result.value === true,
  ).length;
}

/**
 * Saves a version, auto-archiving if it exceeds size threshold.
 */
export async function saveVersionWithAutoArchive(
  namespace: string,
  scopeCode: string,
  version: ConfigVersion,
): Promise<{ archived: boolean; reference?: ArchiveReference }> {
  const sizeInBytes = getValueSize(version);

  if (sizeInBytes >= getArchiveSizeThresholdBytes()) {
    const reference = await archiveVersion({
      namespace,
      scopeCode,
      version,
      reason: "size",
      precalculatedSize: sizeInBytes,
    });
    return { archived: true, reference };
  }

  const files = await getSharedFiles();
  await files.write(
    getVersionPath(scopeCode, version.id),
    JSON.stringify(version),
  );
  return { archived: false };
}

/**
 * Gets storage statistics for a scope based on files.
 */
export async function getStorageStats(
  _namespace: string,
  scopeCode: string,
  versionIds: string[],
): Promise<{
  totalVersions: number;
  archivedCount: number;
  activeCount: number;
  totalSizeBytes: number;
  averageSizeBytes: number;
  largestSizeBytes: number;
}> {
  let archivedCount = 0;
  let totalSizeBytes = 0;
  let largestSizeBytes = 0;
  const files = await getSharedFiles();

  for (const versionId of versionIds) {
    try {
      const live = await files.read(getVersionPath(scopeCode, versionId));
      if (live) {
        const size = live.length;
        totalSizeBytes += size;
        largestSizeBytes = Math.max(largestSizeBytes, size);
        continue;
      }
    } catch {
      // not in live
    }

    try {
      const archived = await files.read(getArchivePath(scopeCode, versionId));
      if (archived) {
        const size = archived.length;
        archivedCount += 1;
        totalSizeBytes += size;
        largestSizeBytes = Math.max(largestSizeBytes, size);
      }
    } catch {
      // ignore missing
    }
  }

  const totalVersions = versionIds.length;
  const activeCount = totalVersions - archivedCount;

  return {
    totalVersions,
    archivedCount,
    activeCount,
    totalSizeBytes,
    averageSizeBytes:
      totalVersions > 0 ? Math.floor(totalSizeBytes / totalVersions) : 0,
    largestSizeBytes,
  };
}

function getDaysOld(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / MS_PER_DAY);
}

function getArchivePath(scopeCode: string, versionId: string): string {
  validatePathParts(scopeCode, versionId);
  return `archives/versions/${scopeCode}/${versionId}.json`;
}

function getVersionPath(scopeCode: string, versionId: string): string {
  validatePathParts(scopeCode, versionId);
  return `versions/${scopeCode}/${versionId}.json`;
}

function validatePathParts(scopeCode: string, versionId: string) {
  if (!SAFE_PATH_PATTERN.test(scopeCode)) {
    throw new Error(
      `Invalid scopeCode: "${scopeCode}". Only alphanumeric characters, dashes, and underscores are allowed.`,
    );
  }
  if (!SAFE_PATH_PATTERN.test(versionId)) {
    throw new Error(
      `Invalid versionId: "${versionId}". Only alphanumeric characters, dashes, and underscores are allowed.`,
    );
  }
}

function getArchiveAgeThresholdDays(): number {
  const envValue = process.env[ARCHIVE_AGE_ENV_VAR];
  const parsedValue = Number.parseInt(envValue ?? "", 10);

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return DEFAULT_ARCHIVE_AGE_DAYS;
}

function getArchiveSizeThresholdBytes(): number {
  const envValue = process.env[ARCHIVE_SIZE_ENV_VAR];
  const parsedValue = Number.parseInt(envValue ?? "", 10);

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue * BYTES_PER_KB;
  }

  return DEFAULT_ARCHIVE_SIZE_KB * BYTES_PER_KB;
}
