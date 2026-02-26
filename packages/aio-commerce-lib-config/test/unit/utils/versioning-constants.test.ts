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

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_VERSIONS,
  MIN_VERSION_COUNT,
  resolveMaxVersions,
} from "#utils/versioning-constants";

describe("versioning-constants", () => {
  describe("resolveMaxVersions", () => {
    it("returns default when env value is missing", () => {
      expect(resolveMaxVersions(undefined)).toBe(DEFAULT_MAX_VERSIONS);
    });

    it("returns default when env value is not numeric", () => {
      expect(resolveMaxVersions("abc")).toBe(DEFAULT_MAX_VERSIONS);
    });

    it("returns default when env value is below minimum", () => {
      const belowMinimum = String(MIN_VERSION_COUNT - 1);
      expect(resolveMaxVersions(belowMinimum)).toBe(DEFAULT_MAX_VERSIONS);
    });

    it("returns parsed value when env value is valid", () => {
      expect(resolveMaxVersions("50")).toBe(50);
    });
  });
});
