import { describe, expect, test } from "bun:test";

import {
  MAX_PROFILE_NAME_LENGTH,
  validateProfileName,
} from "./profile-name.ts";

describe("validateProfileName", () => {
  test("accepts names OMP accepts, returning the value unchanged", () => {
    const names = [
      "a",
      "1abc",
      "work",
      "daily-driver",
      "ok-name_1.2",
      "com10", // COM10 is not a reserved device (only COM0-9 are)
      "console", // "con" is reserved but "console" is not
      "com", // bare "com" is not reserved
    ];
    for (const name of names) {
      const result = validateProfileName(name);
      expect(result).toEqual({ ok: true, value: name });
    }
  });

  test("accepts a name at the 64-character boundary and rejects 65", () => {
    const maxName = "a".repeat(MAX_PROFILE_NAME_LENGTH);
    expect(validateProfileName(maxName)).toEqual({ ok: true, value: maxName });

    const tooLong = "a".repeat(MAX_PROFILE_NAME_LENGTH + 1);
    const result = validateProfileName(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/at most 64/);
  });

  test("never silently rewrites a name (no lowercasing or truncation)", () => {
    // An uppercase name is rejected outright, not coerced to lowercase.
    const upper = validateProfileName("Work");
    expect(upper.ok).toBe(false);

    // An over-length name is rejected, not truncated to a valid prefix.
    const long = validateProfileName("a".repeat(200));
    expect(long.ok).toBe(false);
  });

  test("rejects the empty string", () => {
    expect(validateProfileName("").ok).toBe(false);
  });

  test.each([
    ["UPPER", /must match/],
    ["café", /must match/],
    ["a/b", /must match/],
    ["a b", /must match/],
    ["-lead", /must match/],
    ["_lead", /must match/],
    [".lead", /must match/],
  ])("rejects out-of-charset name %p", (name, pattern) => {
    const result = validateProfileName(name);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(pattern);
  });

  test.each([".", ".."])("rejects the dotted name %p", (name) => {
    const result = validateProfileName(name);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"\." or "\.\."/);
  });

  test.each(["trail.", "a.."])("rejects trailing-dot name %p", (name) => {
    const result = validateProfileName(name);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot end with/);
  });

  // Reserved names can only reach the device-name check in lowercase; an
  // uppercase spelling (e.g. "CON") is already rejected by the charset rule.
  test.each([
    "con",
    "prn",
    "aux",
    "nul",
    "com0",
    "com1",
    "lpt0",
    "lpt9",
    "con.txt",
    "nul.log",
    "com1.dat",
  ])("rejects Windows reserved device name %p", (name) => {
    const result = validateProfileName(name);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/reserved device name/);
  });

  test("rejects an uppercase reserved spelling via the charset rule", () => {
    const result = validateProfileName("CON");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/must match/);
  });
});
