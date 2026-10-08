import { describe, expect, it } from "vitest";
import {
  toIso,
  formatIstYmd,
  hourInIst,
  calendarDaysInclusiveIst,
} from "../../src/shared/clock.js";

describe("toIso", () => {
  it("converts Date to ISO string", () => {
    const date = new Date("2026-10-09T10:00:00Z");
    expect(toIso(date)).toBe("2026-10-09T10:00:00.000Z");
  });

  it("preserves timezone information", () => {
    const date = new Date("2026-10-09T15:30:00+05:30");
    const iso = toIso(date);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("formatIstYmd", () => {
  it("formats date in IST timezone as YYYY-MM-DD", () => {
    // UTC time that maps to a specific IST date
    const date = new Date("2026-10-09T00:00:00+05:30");
    expect(formatIstYmd(date)).toBe("2026-10-09");
  });

  it("handles IST date rollover correctly", () => {
    // 23:30 IST on Oct 9 = 18:00 UTC on Oct 9
    const date = new Date("2026-10-09T18:00:00Z");
    expect(formatIstYmd(date)).toBe("2026-10-09");
  });

  it("handles UTC to IST conversion across midnight", () => {
    // 20:00 UTC on Oct 8 = 01:30 IST on Oct 9
    const date = new Date("2026-10-08T20:00:00Z");
    expect(formatIstYmd(date)).toBe("2026-10-09");
  });

  it("formats edge of day correctly", () => {
    // 23:59 IST
    const date = new Date("2026-10-09T18:29:00Z");
    expect(formatIstYmd(date)).toBe("2026-10-09");
  });
});

describe("hourInIst", () => {
  it("extracts hour from ISO datetime in IST", () => {
    expect(hourInIst("2026-10-09T10:00:00+05:30")).toBe(10);
    expect(hourInIst("2026-10-09T23:30:00+05:30")).toBe(23);
    expect(hourInIst("2026-10-09T00:00:00+05:30")).toBe(0);
  });

  it("converts UTC to IST hour", () => {
    // 04:30 UTC = 10:00 IST
    expect(hourInIst("2026-10-09T04:30:00Z")).toBe(10);
    // 18:00 UTC = 23:30 IST
    expect(hourInIst("2026-10-09T18:00:00Z")).toBe(23);
  });

  it("handles midnight IST", () => {
    // 18:30 UTC previous day = 00:00 IST next day
    expect(hourInIst("2026-10-08T18:30:00Z")).toBe(0);
  });

  it("handles edge hours", () => {
    expect(hourInIst("2026-10-09T05:59:00+05:30")).toBe(5);
    expect(hourInIst("2026-10-09T06:01:00+05:30")).toBe(6);
    expect(hourInIst("2026-10-09T22:00:00+05:30")).toBe(22);
  });

  it("throws for invalid datetime", () => {
    expect(() => hourInIst("not-a-date")).toThrow();
    expect(() => hourInIst("")).toThrow();
  });
});

describe("calendarDaysInclusiveIst", () => {
  it("returns 1 when end date is not provided", () => {
    expect(calendarDaysInclusiveIst("2026-10-09T10:00:00+05:30")).toBe(1);
    expect(calendarDaysInclusiveIst("2026-10-09T10:00:00+05:30", undefined)).toBe(1);
  });

  it("returns 1 for same-day trips", () => {
    expect(
      calendarDaysInclusiveIst(
        "2026-10-09T08:00:00+05:30",
        "2026-10-09T20:00:00+05:30",
      ),
    ).toBe(1);
  });

  it("returns 2 for next-day trips", () => {
    expect(
      calendarDaysInclusiveIst(
        "2026-10-09T08:00:00+05:30",
        "2026-10-10T20:00:00+05:30",
      ),
    ).toBe(2);
  });

  it("returns 3 for multi-day trips", () => {
    expect(
      calendarDaysInclusiveIst(
        "2026-10-09T08:00:00+05:30",
        "2026-10-11T20:00:00+05:30",
      ),
    ).toBe(3);
  });

  it("caps at 31 days maximum", () => {
    expect(
      calendarDaysInclusiveIst(
        "2026-10-01T08:00:00+05:30",
        "2026-12-31T20:00:00+05:30",
      ),
    ).toBe(31);
  });

  it("handles month boundaries", () => {
    expect(
      calendarDaysInclusiveIst(
        "2026-10-31T08:00:00+05:30",
        "2026-11-02T20:00:00+05:30",
      ),
    ).toBe(3);
  });

  it("handles invalid dates gracefully", () => {
    // Invalid start date falls back to epoch (1970-01-01), producing large diff capped at 31
    const result1 = calendarDaysInclusiveIst("invalid", "2026-10-10T20:00:00+05:30");
    expect(result1).toBeGreaterThanOrEqual(1);
    expect(result1).toBeLessThanOrEqual(31);

    // Invalid end date falls back to epoch
    const result2 = calendarDaysInclusiveIst("2026-10-09T08:00:00+05:30", "invalid");
    expect(result2).toBeGreaterThanOrEqual(1);
    expect(result2).toBeLessThanOrEqual(31);
  });

  it("handles year boundaries", () => {
    expect(
      calendarDaysInclusiveIst(
        "2026-12-31T08:00:00+05:30",
        "2027-01-02T20:00:00+05:30",
      ),
    ).toBe(3);
  });
});
