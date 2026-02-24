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

import type { AuditEntry } from "./types";

const AUDIT_ROOT = "audit";
const INDEX_FILENAME = "index.json";

/**
 * Saves an audit entry to file storage.
 */
export async function saveAuditEntry(
  _namespace: string,
  entry: AuditEntry,
): Promise<void> {
  const files = await getSharedFiles();
  await files.write(
    entryPath(entry.scope.code, entry.id),
    JSON.stringify(entry),
  );
}

/**
 * Appends an audit entry ID to the audit list.
 */
export async function appendToAuditList(
  _namespace: string,
  scopeCode: string,
  auditId: string,
): Promise<void> {
  const ids = await readIndex(scopeCode);
  ids.push(auditId);
  await writeIndex(scopeCode, ids);
}

/**
 * Gets an audit entry by ID.
 */
export async function getAuditEntry(
  _namespace: string,
  auditId: string,
  scopeCode?: string,
): Promise<AuditEntry | null> {
  const files = await getSharedFiles();
  if (scopeCode) {
    try {
      const buf = await files.read(entryPath(scopeCode, auditId));
      return buf ? (JSON.parse(buf.toString()) as AuditEntry) : null;
    } catch {
      return null;
    }
  }

  // If scope not provided, scan index files
  const allScopes = await listScopes();
  for (const scope of allScopes) {
    const buf = await files.read(entryPath(scope, auditId)).catch(() => null);
    if (buf) {
      return JSON.parse(buf.toString()) as AuditEntry;
    }
  }
  return null;
}

/**
 * Gets the audit list for a scope.
 */
export function getAuditList(
  _namespace: string,
  scopeCode?: string,
): Promise<string[]> {
  if (!scopeCode) {
    return Promise.resolve([]);
  }
  return readIndex(scopeCode);
}

/**
 * Gets multiple audit entries by their IDs.
 */
export function getAuditEntries(
  namespace: string,
  auditIds: string[],
  scopeCode?: string,
): Promise<(AuditEntry | null)[]> {
  return Promise.all(
    auditIds.map((id) => getAuditEntry(namespace, id, scopeCode)),
  );
}

/**
 * Gets the last audit entry hash for chain verification.
 */
export async function getLastAuditHash(
  namespace: string,
  scopeCode: string,
): Promise<string | null> {
  const ids = await getAuditList(namespace, scopeCode);
  if (ids.length === 0) {
    return null;
  }
  const lastId = ids.at(-1);
  if (!lastId) {
    return null;
  }
  const entry = await getAuditEntry(namespace, lastId, scopeCode);
  return entry?.integrityHash ?? null;
}

// Helpers

function entryPath(scopeCode: string, auditId: string) {
  return `${AUDIT_ROOT}/${scopeCode}/${auditId}.json`;
}

function indexPath(scopeCode: string) {
  return `${AUDIT_ROOT}/${scopeCode}/${INDEX_FILENAME}`;
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

async function listScopes(): Promise<string[]> {
  const files = await getSharedFiles();
  try {
    const listed = await files.list?.(`${AUDIT_ROOT}/`);
    if (!listed) {
      return [];
    }
    return listed
      .map((f) => f.name)
      .map((name) => name.replace(`${AUDIT_ROOT}/`, "").split("/")[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}
