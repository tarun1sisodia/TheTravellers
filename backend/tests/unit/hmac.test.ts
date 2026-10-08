import { describe, expect, it } from "vitest";
import { hmacSha256Hex, verifyHmacSha256Hex } from "../../src/shared/hmac.js";

describe("hmacSha256Hex", () => {
  it("computes HMAC-SHA256 hex digest", () => {
    const digest = hmacSha256Hex("secret", "hello");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different digests for different payloads", () => {
    const a = hmacSha256Hex("secret", "hello");
    const b = hmacSha256Hex("secret", "world");
    expect(a).not.toBe(b);
  });

  it("produces different digests for different secrets", () => {
    const a = hmacSha256Hex("secret1", "hello");
    const b = hmacSha256Hex("secret2", "hello");
    expect(a).not.toBe(b);
  });

  it("is deterministic", () => {
    const a = hmacSha256Hex("secret", "hello");
    const b = hmacSha256Hex("secret", "hello");
    expect(a).toBe(b);
  });

  it("accepts Buffer payload", () => {
    const digest = hmacSha256Hex("secret", Buffer.from("hello"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws when secret is empty", () => {
    expect(() => hmacSha256Hex("", "hello")).toThrow("HMAC secret is required");
  });
});

describe("verifyHmacSha256Hex", () => {
  it("returns true for valid signature", () => {
    const payload = "hello world";
    const secret = "my-secret";
    const signature = hmacSha256Hex(secret, payload);
    expect(verifyHmacSha256Hex(secret, payload, signature)).toBe(true);
  });

  it("returns false for invalid signature", () => {
    expect(verifyHmacSha256Hex("secret", "hello", "deadbeef")).toBe(false);
  });

  it("returns false for tampered payload", () => {
    const signature = hmacSha256Hex("secret", "hello");
    expect(verifyHmacSha256Hex("secret", "hello-tampered", signature)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const signature = hmacSha256Hex("secret1", "hello");
    expect(verifyHmacSha256Hex("secret2", "hello", signature)).toBe(false);
  });

  it("returns false for empty secret", () => {
    expect(verifyHmacSha256Hex("", "hello", "sig")).toBe(false);
  });

  it("returns false for empty signature", () => {
    expect(verifyHmacSha256Hex("secret", "hello", "")).toBe(false);
  });

  it("accepts Buffer payload", () => {
    const payload = Buffer.from("test data");
    const secret = "secret";
    const signature = hmacSha256Hex(secret, payload);
    expect(verifyHmacSha256Hex(secret, payload, signature)).toBe(true);
  });
});
