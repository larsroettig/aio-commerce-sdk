/*
 * Copyright 2025 Adobe. All rights reserved.
 * Licensed under the Apache License, Version 2.0.
 */

import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAuditLog,
  logChange,
  verifyAuditChain,
} from "#modules/audit/audit-logger";

import type { Mock } from "vitest";
import type { AuditContext } from "#modules/audit/types";

const mockAudits = {
  saveAuditEntry: vi.fn(),
  appendToAuditList: vi.fn(),
  getAuditEntry: vi.fn(),
  getAuditList: vi.fn(),
  getAuditEntries: vi.fn(),
  getLastAuditHash: vi.fn(),
};

type MockFn = Mock<(...args: never[]) => unknown>;

vi.mock("#storage/backend", () => ({
  getStorageBackend: () => ({ versions: {}, audits: mockAudits }),
}));

vi.mock("#utils/uuid", () => ({
  generateUUID: vi.fn(() => "audit-uuid-123"),
}));

describe("Audit Logger", () => {
  const context: AuditContext = { namespace: "test-namespace" };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(mockAudits)) {
      (fn as MockFn).mockReset();
    }
  });

  describe("logChange", () => {
    it("creates audit entry with integrity hash", async () => {
      vi.mocked(mockAudits.getLastAuditHash).mockResolvedValue(null);

      const result = await logChange(context, {
        scope: { id: "scope-1", code: "global", level: "global" },
        versionId: "version-123",
        actor: { userId: "user@test.com" },
        changes: [
          {
            name: "field1",
            oldValue: "old",
            newValue: "new",
            type: "modified",
          },
        ],
        action: "update",
      });

      expect(result.id).toBe("audit-uuid-123");
      expect(result.previousHash).toBeNull();
      expect(result.integrityHash).toBeTruthy();

      expect(mockAudits.saveAuditEntry).toHaveBeenCalled();
      expect(mockAudits.appendToAuditList).toHaveBeenCalledWith(
        context.namespace,
        "global",
        "audit-uuid-123",
      );
    });

    it("chains with previous hash", async () => {
      const prev = "prevhash";
      vi.mocked(mockAudits.getLastAuditHash).mockResolvedValue(prev);

      const result = await logChange(context, {
        scope: { id: "scope-1", code: "global", level: "global" },
        versionId: "v2",
        actor: {},
        changes: [],
        action: "update",
      });

      expect(result.previousHash).toBe(prev);
    });

    it("redacts sensitive fields", async () => {
      vi.mocked(mockAudits.getLastAuditHash).mockResolvedValue(null);

      const result = await logChange(context, {
        scope: { id: "scope-1", code: "global", level: "global" },
        versionId: "v1",
        actor: {},
        changes: [
          {
            name: "api_key",
            oldValue: "old",
            newValue: "new",
            type: "modified",
          },
          { name: "timeout", oldValue: 1, newValue: 2, type: "modified" },
        ],
        action: "update",
      });

      const apiChange = result.changes.find((c) => c.name === "api_key");
      expect(apiChange?.oldValue).toBe("***REDACTED***");
      expect(apiChange?.newValue).toBe("***REDACTED***");
    });
  });

  describe("getAuditLog", () => {
    it("returns entries newest first", async () => {
      vi.mocked(mockAudits.getAuditList).mockResolvedValue([
        "audit-1",
        "audit-2",
        "audit-3",
      ]);
      vi.mocked(mockAudits.getAuditEntries).mockResolvedValue([
        {
          id: "audit-1",
          timestamp: "2025-01-01T00:00:00Z",
          scope: { id: "", code: "global", level: "global" },
          versionId: "v1",
          actor: {},
          changes: [],
          integrityHash: "h1",
          previousHash: null,
          action: "create",
        },
        {
          id: "audit-2",
          timestamp: "2025-01-02T00:00:00Z",
          scope: { id: "", code: "global", level: "global" },
          versionId: "v2",
          actor: {},
          changes: [],
          integrityHash: "h2",
          previousHash: "h1",
          action: "update",
        },
        {
          id: "audit-3",
          timestamp: "2025-01-03T00:00:00Z",
          scope: { id: "", code: "global", level: "global" },
          versionId: "v3",
          actor: {},
          changes: [],
          integrityHash: "h3",
          previousHash: "h2",
          action: "update",
        },
      ]);

      const result = await getAuditLog(context, { scopeCode: "global" });
      expect(result.entries.map((e) => e?.id)).toEqual([
        "audit-3",
        "audit-2",
        "audit-1",
      ]);
      expect(result.pagination.total).toBe(3);
    });
  });

  describe("verifyAuditChain", () => {
    it("validates chain integrity", async () => {
      const hash = (entry: unknown) =>
        crypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex");

      const entry1Base = {
        id: "a1",
        timestamp: "2025-01-01T00:00:00Z",
        scope: { id: "", code: "global", level: "global" },
        versionId: "v1",
        actor: {},
        changes: [],
        previousHash: null,
        action: "create",
      } as const;
      const entry1 = {
        ...entry1Base,
        integrityHash: hash(entry1Base),
      };

      const entry2Base = {
        id: "a2",
        timestamp: "2025-01-02T00:00:00Z",
        scope: { id: "", code: "global", level: "global" },
        versionId: "v2",
        actor: {},
        changes: [],
        previousHash: entry1.integrityHash,
        action: "update",
      } as const;
      const entry2 = {
        ...entry2Base,
        integrityHash: hash(entry2Base),
      };

      vi.mocked(mockAudits.getAuditList).mockResolvedValue(["a1", "a2"]);
      vi.mocked(mockAudits.getAuditEntries).mockResolvedValue([entry1, entry2]);

      const result = await verifyAuditChain(context, "global");
      expect(result.valid).toBe(true);
    });
  });
});
