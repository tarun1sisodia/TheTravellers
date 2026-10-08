import { describe, expect, it } from "vitest";
import {
  maskPhone,
  maskEmail,
  last4,
  phonesMatch,
  sanitizeText,
  redactSecrets,
} from "../../src/shared/privacy.js";

describe("maskPhone", () => {
  it("masks 10-digit Indian phone number", () => {
    const masked = maskPhone("9876543210");
    expect(masked).toMatch(/^\+91 98\*\*\*\* \*\*10$/);
  });

  it("masks phone with country code", () => {
    const masked = maskPhone("919876543210");
    expect(masked).toMatch(/^\+91 98\*\*\*\* \*\*10$/);
  });

  it("handles short numbers", () => {
    expect(maskPhone("123")).toBe("****");
    expect(maskPhone("12")).toBe("****");
    expect(maskPhone("1")).toBe("****");
  });

  it("strips non-digit characters", () => {
    const masked = maskPhone("+91-98765-43210");
    expect(masked).toMatch(/98\*\*\*\* \*\*10/);
  });

  it("extracts last 2 digits correctly", () => {
    const masked = maskPhone("9876543299");
    expect(masked).toMatch(/99$/);
  });
});

describe("maskEmail", () => {
  it("masks email showing only first character", () => {
    expect(maskEmail("aman@example.com")).toBe("a****@example.com");
    expect(maskEmail("john.doe@gmail.com")).toBe("j****@gmail.com");
  });

  it("handles single character local part", () => {
    expect(maskEmail("a@example.com")).toBe("a****@example.com");
  });

  it("handles invalid email (no @)", () => {
    expect(maskEmail("invalidemail")).toBe("****");
  });

  it("handles empty string", () => {
    expect(maskEmail("")).toBe("****");
  });
});

describe("last4", () => {
  it("extracts last 4 digits from phone number", () => {
    expect(last4("9876543210")).toBe("3210");
    expect(last4("1234")).toBe("1234");
  });

  it("strips non-digits before extracting", () => {
    expect(last4("+91-9876-543-210")).toBe("3210");
  });

  it("handles short strings", () => {
    expect(last4("123")).toBe("123");
    expect(last4("12")).toBe("12");
    expect(last4("")).toBe("");
  });
});

describe("phonesMatch", () => {
  it("matches identical phone numbers", () => {
    expect(phonesMatch("9876543210", "9876543210")).toBe(true);
  });

  it("matches with and without country code", () => {
    expect(phonesMatch("919876543210", "9876543210")).toBe(true);
    expect(phonesMatch("9876543210", "919876543210")).toBe(true);
  });

  it("strips formatting before comparison", () => {
    expect(phonesMatch("+91-98765-43210", "9876543210")).toBe(true);
    expect(phonesMatch("9876543210", "(987) 654-3210")).toBe(true);
  });

  it("rejects different phone numbers", () => {
    expect(phonesMatch("9876543210", "9876543211")).toBe(false);
    expect(phonesMatch("9876543210", "8876543210")).toBe(false);
  });

  it("rejects partial matches (last 4 only)", () => {
    expect(phonesMatch("9876543210", "3210")).toBe(false);
    expect(phonesMatch("9876543210", "543210")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(phonesMatch("", "9876543210")).toBe(false);
    expect(phonesMatch("9876543210", "")).toBe(false);
    expect(phonesMatch("", "")).toBe(false);
  });

  it("rejects different lengths after normalization", () => {
    expect(phonesMatch("9876543210", "123456789")).toBe(false);
  });
});

describe("sanitizeText", () => {
  it("strips HTML tags", () => {
    expect(sanitizeText("<script>alert('xss')</script>", 1000)).toBe("alert('xss')");
    expect(sanitizeText("<b>bold</b> text", 1000)).toBe("bold text");
  });

  it("strips control characters", () => {
    expect(sanitizeText("text\u0000with\u0007controls", 1000)).toBe("textwithcontrols");
  });

  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ", 1000)).toBe("hello");
  });

  it("enforces max length", () => {
    expect(sanitizeText("a very long string", 10)).toBe("a very lon");
    expect(sanitizeText("short", 100)).toBe("short");
  });

  it("handles empty input", () => {
    expect(sanitizeText("", 100)).toBe("");
  });

  it("preserves safe characters", () => {
    const safe = "Hello, World! 123 @#$%";
    expect(sanitizeText(safe, 1000)).toBe(safe);
  });

  it("strips nested HTML", () => {
    expect(sanitizeText("<div><p>nested</p></div>", 1000)).toBe("nested");
  });
});

describe("redactSecrets", () => {
  it("redacts Razorpay live keys", () => {
    const input = "Key: rzp_live_abc123xyz";
    expect(redactSecrets(input)).toBe("Key: [redacted]");
  });

  it("redacts Razorpay test keys", () => {
    const input = "Key: rzp_test_abc123xyz";
    expect(redactSecrets(input)).toBe("Key: [redacted]");
  });

  it("redacts Stripe live keys", () => {
    const input = "Key: sk_live_abc123xyz";
    expect(redactSecrets(input)).toBe("Key: [redacted]");
  });

  it("redacts Stripe test keys", () => {
    const input = "Key: sk_test_abc123xyz";
    expect(redactSecrets(input)).toBe("Key: [redacted]");
  });

  it("redacts Bearer tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    expect(redactSecrets(input)).toBe("Authorization: Bearer [redacted]");
  });

  it("handles multiple secrets in one string", () => {
    const input = "rzp_live_abc and sk_test_xyz";
    const result = redactSecrets(input);
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("abc");
    expect(result).not.toContain("xyz");
  });

  it("preserves non-secret text", () => {
    const input = "This is safe text with no secrets";
    expect(redactSecrets(input)).toBe(input);
  });
});
