import { describe, expect, it } from "vitest";
import {
  newId,
  newGuestAccessToken,
  newTicketId,
  TICKET_ID_PATTERN,
  sha256Hex,
  timingSafeEqualString,
} from "../../src/shared/ids.js";

describe("newId", () => {
  it("generates a valid UUID v4", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});

describe("newGuestAccessToken", () => {
  it("generates a 64-character hex string", () => {
    const token = newGuestAccessToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newGuestAccessToken()));
    expect(tokens.size).toBe(50);
  });

  it("has sufficient entropy (32 bytes = 256 bits)", () => {
    const token = newGuestAccessToken();
    expect(token.length).toBe(64); // 32 bytes * 2 hex chars
  });
});

describe("newTicketId", () => {
  const mockClock = {
    now: () => new Date("2026-10-09T10:00:00+05:30"),
  };

  it("generates ticket ID in format AGR-YYYYMMDD-NNNN", () => {
    const ticketId = newTicketId(mockClock, 1);
    expect(ticketId).toMatch(TICKET_ID_PATTERN);
  });

  it("uses IST date for ticket ID", () => {
    const ticketId = newTicketId(mockClock, 1);
    // IST date should be 2026-10-09
    expect(ticketId).toMatch(/^AGR-20261009-/);
  });

  it("pads sequence number to 4 digits", () => {
    expect(newTicketId(mockClock, 1)).toContain("-0001");
    expect(newTicketId(mockClock, 42)).toContain("-0042");
    expect(newTicketId(mockClock, 999)).toContain("-0999");
    expect(newTicketId(mockClock, 9999)).toContain("-9999");
  });

  it("generates random sequence when not provided", () => {
    const ticketId = newTicketId(mockClock);
    expect(ticketId).toMatch(TICKET_ID_PATTERN);
  });

  it("generates unique random sequences", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newTicketId(mockClock)));
    // Should have mostly unique values (allow some collision due to 4-digit space)
    expect(ids.size).toBeGreaterThan(40);
  });
});

describe("TICKET_ID_PATTERN", () => {
  it("matches valid ticket IDs", () => {
    expect(TICKET_ID_PATTERN.test("AGR-20261009-0001")).toBe(true);
    expect(TICKET_ID_PATTERN.test("AGR-20261009-9999")).toBe(true);
    expect(TICKET_ID_PATTERN.test("AGR-19991231-1234")).toBe(true);
  });

  it("rejects invalid ticket IDs", () => {
    expect(TICKET_ID_PATTERN.test("AGR-2026109-0001")).toBe(false); // 7 digits
    expect(TICKET_ID_PATTERN.test("AGR-20261009-001")).toBe(false); // 3 digits
    expect(TICKET_ID_PATTERN.test("XYZ-20261009-0001")).toBe(false); // wrong prefix
    expect(TICKET_ID_PATTERN.test("agr-20261009-0001")).toBe(false); // lowercase
    expect(TICKET_ID_PATTERN.test("AGR-20261009-ABCD")).toBe(false); // letters
  });
});

describe("sha256Hex", () => {
  it("computes SHA-256 hash of string", () => {
    const hash = sha256Hex("hello");
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("computes SHA-256 hash of Buffer", () => {
    const hash = sha256Hex(Buffer.from("hello"));
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("returns 64-character hex string", () => {
    const hash = sha256Hex("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = sha256Hex("hello");
    const hash2 = sha256Hex("world");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = sha256Hex("");
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("timingSafeEqualString", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualString("hello", "hello")).toBe(true);
    expect(timingSafeEqualString("test123", "test123")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeEqualString("hello", "world")).toBe(false);
    expect(timingSafeEqualString("test", "test1")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqualString("short", "longer")).toBe(false);
    expect(timingSafeEqualString("", "a")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(timingSafeEqualString("", "")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(timingSafeEqualString("Hello", "hello")).toBe(false);
  });
});
