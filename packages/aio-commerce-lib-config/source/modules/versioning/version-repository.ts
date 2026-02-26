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

import { getSharedFiles } from "#utils/repository";

import type { ConfigVersion, VersionMetadata } from "./types";

const VERSION_ROOT = "versions";
const META_FILENAME = "meta.json";
const INDEX_FILENAME = "index.json";

class StorageLimitExceededError extends Error {
  public constructor(valueSize: number, limit: number) {
    super(
      `Storage limit exceeded: value size ${valueSize} bytes exceeds limit of ${limit} bytes`,
    );
    this.name = "StorageLimitExceededError";
  }
}

function getValueSize(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return Buffer.byteLength(serialized, "utf8");
  } catch {
    return -1;
  }
}

/**
 * Saves a version to file storage.
 */
export async function saveVersion(
  _namespace: string,
  version: ConfigVersion,
): Promise<{ archived: boolean }> {
  const sizeInBytes = getValueSize(version);
  const MAX_PRACTICAL_SIZE_BYTES = 10 * 1024 * 1024; // 10MB sanity limit

  if (sizeInBytes > MAX_PRACTICAL_SIZE_BYTES) {
    throw new StorageLimitExceededError(sizeInBytes, MAX_PRACTICAL_SIZE_BYTES);
  }

  const files = await getSharedFiles();
  await files.write(
    livePath(version.scope.code, version.id),
    JSON.stringify(version),
  );
  return { archived: false };
}

/**
 * Gets a version by ID from live storage.
 */
export async function getVersion(
  _namespace: string,
  scopeCode: string,
  versionId: string,
): Promise<ConfigVersion | null> {
  const files = await getSharedFiles();
  try {
    const live = await files.read(livePath(scopeCode, versionId));
    return live ? (JSON.parse(live.toString()) as ConfigVersion) : null;
  } catch {
    return null;
  }
}

/**
 * Saves version metadata for a scope.
 */
export async function saveMetadata(
  _namespace: string,
  scopeCode: string,
  metadata: VersionMetadata,
): Promise<void> {
  const files = await getSharedFiles();
  await files.write(metaPath(scopeCode), JSON.stringify(metadata));
}

/**
 * Gets version metadata for a scope.
 */
export async function getMetadata(
  _namespace: string,
  scopeCode: string,
): Promise<VersionMetadata | null> {
  const files = await getSharedFiles();
  try {
    const buf = await files.read(metaPath(scopeCode));
    return buf ? (JSON.parse(buf.toString()) as VersionMetadata) : null;
  } catch {
    return null;
  }
}

/**
 * Adds a version ID to the list (oldest-first). Trims to maxVersions and returns removed ID if any.
 */
export async function addToVersionList(
  _namespace: string,
  scopeCode: string,
  versionId: string,
  maxVersions: number,
): Promise<string | null> {
  const list = await readIndex(scopeCode);
  list.push(versionId);

  let removed: string | null = null;
  if (list.length > maxVersions) {
    removed = list.shift() ?? null;
  }

  await writeIndex(scopeCode, list);
  return removed;
}

/**
 * Gets the ordered list of version IDs (oldest-first).
 */
export function getVersionList(
  _namespace: string,
  scopeCode: string,
): Promise<string[]> {
  return readIndex(scopeCode);
}

/**
 * Deletes a version from live storage.
 */
export async function deleteVersion(
  _namespace: string,
  scopeCode: string,
  versionId: string,
): Promise<void> {
  const files = await getSharedFiles();
  await files.delete?.(livePath(scopeCode, versionId));
}

/**
 * Gets multiple versions by their IDs.
 */
export function getVersions(
  namespace: string,
  scopeCode: string,
  versionIds: string[],
): Promise<(ConfigVersion | null)[]> {
  return Promise.all(
    versionIds.map((id) => getVersion(namespace, scopeCode, id)),
  );
}

// Helpers

function metaPath(scopeCode: string) {
  return `${VERSION_ROOT}/${scopeCode}/${META_FILENAME}`;
}

function indexPath(scopeCode: string) {
  return `${VERSION_ROOT}/${scopeCode}/${INDEX_FILENAME}`;
}

function livePath(scopeCode: string, versionId: string) {
  return `${VERSION_ROOT}/${scopeCode}/${versionId}.json`;
}

async function readIndex(scopeCode: string): Promise<string[]> {
  const files = await getSharedFiles();
  try {
    const buf = await files.read(indexPath(scopeCode));
    if (!buf) {
      return [];
    }
    const parsed = JSON.parse(buf.toString());
    return Array.isArray(parsed) ? parsed : (parsed.ids ?? []);
  } catch {
    return [];
  }
}

async function writeIndex(scopeCode: string, ids: string[]): Promise<void> {
  const files = await getSharedFiles();
  await files.write(indexPath(scopeCode), JSON.stringify(ids));
}
