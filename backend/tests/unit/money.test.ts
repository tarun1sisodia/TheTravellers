import { describe, expect, it } from "vitest";
import {
  rupeesToPaise,
  paiseToRupees,
  roundRupees,
  advanceOf,
  convertInrPaiseToMinor,
  assertPositiveInteger,
  assertAmountMatches,
  type FxTable,
} from "../../src/shared/money.js";

describe("rupeesToPaise", () => {
  it("converts whole rupees to paise", () => {
    expect(rupeesToPaise(100)).toBe(10000);
    expect(rupeesToPaise(1)).toBe(100);
    expect(rupeesToPaise(0)).toBe(0);
  });

  it("converts fractional rupees to paise with rounding", () => {
    expect(rupeesToPaise(99.99)).toBe(9999);
    expect(rupeesToPaise(99.995)).toBe(10000);
    expect(rupeesToPaise(10.50)).toBe(1050);
  });

  it("rejects negative values", () => {
    expect(() => rupeesToPaise(-1)).toThrow("Invalid rupees");
    expect(() => rupeesToPaise(-100.50)).toThrow("Invalid rupees");
  });

  it("rejects non-finite values", () => {
    expect(() => rupeesToPaise(NaN)).toThrow("Invalid rupees");
    expect(() => rupeesToPaise(Infinity)).toThrow("Invalid rupees");
    expect(() => rupeesToPaise(-Infinity)).toThrow("Invalid rupees");
  });
});

describe("paiseToRupees", () => {
  it("converts paise to rupees", () => {
    expect(paiseToRupees(10000)).toBe(100);
    expect(paiseToRupees(100)).toBe(1);
    expect(paiseToRupees(0)).toBe(0);
  });

  it("converts fractional paise to rupees", () => {
    expect(paiseToRupees(9999)).toBe(99.99);
    expect(paiseToRupees(1050)).toBe(10.5);
  });

  it("allows negative paise (for refunds)", () => {
    expect(paiseToRupees(-10000)).toBe(-100);
  });

  it("rejects non-finite values", () => {
    expect(() => paiseToRupees(NaN)).toThrow("Invalid paise");
    expect(() => paiseToRupees(Infinity)).toThrow("Invalid paise");
  });
});

describe("roundRupees", () => {
  it("rounds to nearest integer", () => {
    expect(roundRupees(100.4)).toBe(100);
    expect(roundRupees(100.5)).toBe(101);
    expect(roundRupees(100.6)).toBe(101);
  });

  it("handles whole numbers", () => {
    expect(roundRupees(100)).toBe(100);
    expect(roundRupees(0)).toBe(0);
  });

  it("rejects non-finite values", () => {
    expect(() => roundRupees(NaN)).toThrow("Invalid amount");
    expect(() => roundRupees(Infinity)).toThrow("Invalid amount");
  });
});

describe("advanceOf", () => {
  it("calculates 28% rounded to nearest 100", () => {
    expect(advanceOf(3499)).toBe(1000); // 3499 * 0.28 = 979.72 -> 1000
    expect(advanceOf(18500)).toBe(5200); // 18500 * 0.28 = 5180 -> 5200
  });

  it("enforces minimum 500 advance", () => {
    expect(advanceOf(1900)).toBe(500); // 1900 * 0.28 = 532 -> 500
    expect(advanceOf(1000)).toBe(500); // 1000 * 0.28 = 280 -> 500
  });

  it("never exceeds total fare", () => {
    expect(advanceOf(400)).toBe(400); // 400 * 0.28 = 112 -> 500, but capped at 400
    expect(advanceOf(200)).toBe(200); // 200 * 0.28 = 56 -> 500, but capped at 200
  });

  it("handles edge case: total < 500", () => {
    expect(advanceOf(499)).toBe(499);
    expect(advanceOf(1)).toBe(1);
  });

  it("handles large amounts", () => {
    expect(advanceOf(100000)).toBe(28000); // 100000 * 0.28 = 28000
  });

  it("rejects non-finite values", () => {
    expect(() => advanceOf(NaN)).toThrow("Invalid totalFare");
    expect(() => advanceOf(Infinity)).toThrow("Invalid totalFare");
  });

  it("rejects zero or negative values", () => {
    expect(() => advanceOf(0)).toThrow("Invalid totalFare");
    expect(() => advanceOf(-100)).toThrow("Invalid totalFare");
  });
});

describe("convertInrPaiseToMinor", () => {
  const fxTable: FxTable = {
    USD: 0.012, // 1 INR = 0.012 USD
    EUR: 0.011, // 1 INR = 0.011 EUR
    GBP: 0.0095, // 1 INR = 0.0095 GBP
  };

  it("returns paise as-is for INR", () => {
    expect(convertInrPaiseToMinor(10000, "INR", fxTable)).toBe(10000);
    expect(convertInrPaiseToMinor(5000, "INR", fxTable)).toBe(5000);
  });

  it("converts INR paise to USD cents", () => {
    // 10000 paise = 100 INR * 0.012 USD/INR * 100 cents/USD = 120 cents
    expect(convertInrPaiseToMinor(10000, "USD", fxTable)).toBe(120);
  });

  it("converts INR paise to EUR cents", () => {
    // 10000 paise = 100 INR * 0.011 EUR/INR * 100 cents/EUR = 110 cents
    expect(convertInrPaiseToMinor(10000, "EUR", fxTable)).toBe(110);
  });

  it("converts INR paise to GBP pence", () => {
    // 10000 paise = 100 INR * 0.0095 GBP/INR * 100 pence/GBP = 95 pence
    expect(convertInrPaiseToMinor(10000, "GBP", fxTable)).toBe(95);
  });

  it("ensures minimum 1 minor unit", () => {
    // Very small amount that would round to 0
    const tinyFx: FxTable = { USD: 0.0001, EUR: 0.0001, GBP: 0.0001 };
    expect(convertInrPaiseToMinor(100, "USD", tinyFx)).toBe(1);
  });

  it("rejects non-finite or non-positive paise", () => {
    expect(() => convertInrPaiseToMinor(0, "USD", fxTable)).toThrow("Invalid inrPaise");
    expect(() => convertInrPaiseToMinor(-100, "USD", fxTable)).toThrow("Invalid inrPaise");
    expect(() => convertInrPaiseToMinor(NaN, "USD", fxTable)).toThrow("Invalid inrPaise");
  });

  it("rejects invalid FX rates", () => {
    const invalidFx: FxTable = { USD: 0, EUR: 0.011, GBP: 0.0095 };
    expect(() => convertInrPaiseToMinor(10000, "USD", invalidFx)).toThrow("Invalid FX rate");

    const negativeFx: FxTable = { USD: -0.012, EUR: 0.011, GBP: 0.0095 };
    expect(() => convertInrPaiseToMinor(10000, "USD", negativeFx)).toThrow("Invalid FX rate");

    const tooHighFx: FxTable = { USD: 1.5, EUR: 0.011, GBP: 0.0095 };
    expect(() => convertInrPaiseToMinor(10000, "USD", tooHighFx)).toThrow("Invalid FX rate");
  });
});

describe("assertPositiveInteger", () => {
  it("accepts positive integers", () => {
    expect(() => assertPositiveInteger(1, "test")).not.toThrow();
    expect(() => assertPositiveInteger(100, "test")).not.toThrow();
    expect(() => assertPositiveInteger(999999, "test")).not.toThrow();
  });

  it("rejects zero", () => {
    expect(() => assertPositiveInteger(0, "count")).toThrow("count must be a positive integer");
  });

  it("rejects negative integers", () => {
    expect(() => assertPositiveInteger(-1, "amount")).toThrow("amount must be a positive integer");
  });

  it("rejects non-integers", () => {
    expect(() => assertPositiveInteger(1.5, "quantity")).toThrow("quantity must be a positive integer");
    expect(() => assertPositiveInteger(0.99, "price")).toThrow("price must be a positive integer");
  });

  it("rejects non-finite values", () => {
    expect(() => assertPositiveInteger(NaN, "value")).toThrow("value must be a positive integer");
    expect(() => assertPositiveInteger(Infinity, "value")).toThrow("value must be a positive integer");
  });
});

describe("assertAmountMatches", () => {
  it("checks exact equality when tolerance is 0", () => {
    expect(assertAmountMatches(100, 100)).toBe(true);
    expect(assertAmountMatches(100, 101)).toBe(false);
    expect(assertAmountMatches(100, 99)).toBe(false);
  });

  it("allows tolerance for small differences", () => {
    expect(assertAmountMatches(100, 101, 1)).toBe(true);
    expect(assertAmountMatches(100, 99, 1)).toBe(true);
    expect(assertAmountMatches(100, 102, 1)).toBe(false);
  });

  it("handles zero values", () => {
    expect(assertAmountMatches(0, 0)).toBe(true);
    expect(assertAmountMatches(0, 1, 1)).toBe(true);
  });

  it("handles negative differences", () => {
    expect(assertAmountMatches(100, 98, 5)).toBe(true);
    expect(assertAmountMatches(100, 105, 5)).toBe(true);
  });
});
