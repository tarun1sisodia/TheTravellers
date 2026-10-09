import { describe, expect, it } from "vitest";
import {
  applyPromo,
  findRoute,
  estimateDistanceKm,
  evaluateDossierTierBaseFare,
  ignoreClientMoney,
  isNightPickup,
} from "../../src/modules/fares/fare.engine.js";

describe("applyPromo", () => {
  it("returns invalid for empty/undefined code", () => {
    expect(applyPromo(undefined, 5000)).toEqual({ valid: false, discount: 0, code: null });
    expect(applyPromo("", 5000)).toEqual({ valid: false, discount: 0, code: null });
  });

  it("rejects codes with invalid characters", () => {
    const result = applyPromo("invalid code!", 5000);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID CODE!");
  });

  it("accepts valid promo code format", () => {
    const result = applyPromo("ASTTCAR500OFF", 5000);
    expect(result.valid).toBe(true);
    expect(result.discount).toBe(500);
    expect(result.code).toBe("ASTTCAR500OFF");
  });

  it("normalizes code to uppercase", () => {
    const result = applyPromo("asttcar500off", 5000);
    expect(result.code).toBe("ASTTCAR500OFF");
    expect(result.valid).toBe(true);
  });

  it("rejects promo when total is below minimum", () => {
    const result = applyPromo("ASTTCAR500OFF", 1000);
    expect(result.valid).toBe(false);
    expect(result.discount).toBe(0);
  });

  it("accepts promo when total meets minimum", () => {
    const result = applyPromo("ASTTCAR500OFF", 2000);
    expect(result.valid).toBe(true);
    expect(result.discount).toBe(500);
  });

  it("caps discount at total", () => {
    const lookup = (code: string) => {
      if (code === "BIG1000") return { discount: 1000, minTotal: 500, desc: "Big discount" };
      return null;
    };
    const result = applyPromo("BIG1000", 800, lookup);
    expect(result.valid).toBe(true);
    expect(result.discount).toBe(800); // Capped at total
  });

  describe("DB-backed promo lookup", () => {
    it("rejects inactive promo", () => {
      const lookup = () => ({
        discount: 500,
        minTotal: 1000,
        desc: "Test",
        isActive: false,
      });
      expect(applyPromo("TEST", 5000, lookup).valid).toBe(false);
    });

    it("rejects promo not yet started", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const lookup = () => ({
        discount: 500,
        minTotal: 1000,
        desc: "Future",
        isActive: true,
        validFrom: futureDate,
      });
      expect(applyPromo("FUTURE", 5000, lookup).valid).toBe(false);
    });

    it("rejects expired promo", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const lookup = () => ({
        discount: 500,
        minTotal: 1000,
        desc: "Expired",
        isActive: true,
        validTo: pastDate,
      });
      expect(applyPromo("EXPIRED", 5000, lookup).valid).toBe(false);
    });

    it("rejects promo at max redemptions", () => {
      const lookup = () => ({
        discount: 500,
        minTotal: 1000,
        desc: "Maxed",
        isActive: true,
        maxRedemptions: 100,
        redemptionCount: 100,
      });
      expect(applyPromo("MAXED", 5000, lookup).valid).toBe(false);
    });

    it("accepts promo under max redemptions", () => {
      const lookup = () => ({
        discount: 500,
        minTotal: 1000,
        desc: "Available",
        isActive: true,
        maxRedemptions: 100,
        redemptionCount: 50,
      });
      expect(applyPromo("AVAILABLE", 5000, lookup).valid).toBe(true);
    });

    it("accepts promo with unlimited redemptions", () => {
      const lookup = () => ({
        discount: 500,
        minTotal: 1000,
        desc: "Unlimited",
        isActive: true,
        maxRedemptions: null,
        redemptionCount: 999999,
      });
      expect(applyPromo("UNLIMITED", 5000, lookup).valid).toBe(true);
    });
  });

  it("rejects codes shorter than 3 characters", () => {
    const result = applyPromo("AB", 5000);
    expect(result.valid).toBe(false);
  });

  it("rejects codes longer than 30 characters", () => {
    const result = applyPromo("A".repeat(31), 5000);
    expect(result.valid).toBe(false);
  });
});

describe("findRoute", () => {
  it("finds direct catalogue route", () => {
    const route = findRoute("Agra", "Delhi");
    expect(route.from).toBe("agra");
    expect(route.to).toBe("delhi");
    expect(route.km).toBeGreaterThan(0);
  });

  it("finds reverse route", () => {
    const route = findRoute("Delhi", "Agra");
    expect(route.from).toBe("delhi");
    expect(route.to).toBe("agra");
    expect(route.km).toBeGreaterThan(0);
  });

  it("creates local route for same origin and destination", () => {
    const route = findRoute("Agra", "Agra");
    expect(route.from).toBe("agra");
    expect(route.to).toBe("agra");
    expect(route.kind).toBe("local");
  });

  it("estimates route for unknown city pair", () => {
    const route = findRoute("Agra", "Manali");
    expect(route.from).toBe("agra");
    expect(route.to).toBe("manali");
    expect(route.km).toBeGreaterThan(0);
  });

  it("throws for empty origin", () => {
    expect(() => findRoute("", "Delhi")).toThrow();
  });

  it("throws for empty destination", () => {
    expect(() => findRoute("Agra", "")).toThrow();
  });
});

describe("estimateDistanceKm", () => {
  it("estimates distance between known cities", () => {
    const km = estimateDistanceKm("agra", "delhi");
    expect(km).toBeGreaterThan(0);
  });

  it("returns minimum 60km", () => {
    const km = estimateDistanceKm("agra", "agra");
    expect(km).toBeGreaterThanOrEqual(60);
  });

  it("handles unknown cities with defaults", () => {
    const km = estimateDistanceKm("unknown-city", "another-unknown");
    expect(km).toBeGreaterThanOrEqual(60);
  });
});

describe("isNightPickup", () => {
  it("detects night pickup at 22:30 IST", () => {
    expect(isNightPickup("2026-10-09T22:30:00+05:30")).toBe(true);
  });

  it("detects night pickup at 03:00 IST", () => {
    expect(isNightPickup("2026-10-09T03:00:00+05:30")).toBe(true);
  });

  it("detects day pickup at 10:00 IST", () => {
    expect(isNightPickup("2026-10-09T10:00:00+05:30")).toBe(false);
  });

  it("detects day pickup at 15:00 IST", () => {
    expect(isNightPickup("2026-10-09T15:00:00+05:30")).toBe(false);
  });

  it("handles edge at 20:00 IST (night start)", () => {
    expect(isNightPickup("2026-10-09T20:00:00+05:30")).toBe(true);
  });

  it("handles edge at 06:00 IST (night end)", () => {
    expect(isNightPickup("2026-10-09T06:00:00+05:30")).toBe(false);
  });

  it("supports configurable night window", () => {
    // With custom window 22:00-05:00
    expect(isNightPickup("2026-10-09T20:30:00+05:30", { nightStartHour: 22, nightEndHour: 5 })).toBe(false);
    expect(isNightPickup("2026-10-09T22:30:00+05:30", { nightStartHour: 22, nightEndHour: 5 })).toBe(true);
  });

  it("returns false for invalid datetime", () => {
    expect(isNightPickup("invalid")).toBe(false);
  });
});

describe("evaluateDossierTierBaseFare", () => {
  const baseSpec = { perKm: 10 };

  it("returns null when no overrides provided", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "sedan",
      distanceKm: 200,
      spec: baseSpec,
    });
    expect(result).toBeNull();
  });

  it("returns null when overrides have no dossier fields", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "sedan",
      distanceKm: 200,
      spec: baseSpec,
      ruleOverrides: {},
    });
    expect(result).toBeNull();
  });

  it("uses fleet prices for tour packages", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "sedan",
      distanceKm: 200,
      spec: baseSpec,
      ruleOverrides: {
        catalogItemType: "tour",
        fleetPrices: { sedan: 5000 },
      },
    });
    expect(result?.baseFare).toBe(5000);
    expect(result?.rule).toBe("dossier-admin-fleet-price");
  });

  it("uses fleet prices with canonical keys", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "innova-crysta",
      distanceKm: 200,
      spec: baseSpec,
      ruleOverrides: {
        catalogItemType: "tour",
        fleetPrices: { "innova-crysta": 8000 },
      },
    });
    expect(result?.baseFare).toBe(8000);
    expect(result?.rule).toBe("dossier-admin-fleet-price");
  });

  it("falls back to legacy short ID fleet prices", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "innova-crysta",
      distanceKm: 200,
      spec: baseSpec,
      ruleOverrides: {
        catalogItemType: "tour",
        fleetPrices: { innova: 7500 },
      },
    });
    expect(result?.baseFare).toBe(7500);
  });

  it("uses packageBasePrice with upgrade surcharge", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "ertiga",
      distanceKm: 200,
      spec: baseSpec,
      ruleOverrides: {
        catalogItemType: "tour",
        packageBasePrice: 5000,
        upgradeSurcharges: { ertiga: 800 },
      },
    });
    expect(result?.baseFare).toBe(5800);
    expect(result?.rule).toBe("dossier-starting-price-upgrade");
  });

  it("uses per-km rate when no fixed price and usePerKm is true", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "sedan",
      distanceKm: 200,
      spec: baseSpec,
      ruleOverrides: {
        usePerKm: true,
        packageBasePrice: undefined,
      },
    });
    // No packageBasePrice, usePerKm is true -> per-km rate
    expect(result?.baseFare).toBe(2000);
    expect(result?.rule).toBe("dossier-per-km-rate");
  });

  it("uses perKmRateOverride when provided", () => {
    const result = evaluateDossierTierBaseFare({
      vehicleTier: "sedan",
      distanceKm: 200,
      spec: baseSpec,
      ruleOverrides: {
        usePerKm: true,
        perKmRateOverride: 15,
      },
    });
    expect(result?.baseFare).toBe(3000); // 200 * 15
  });

  it("throws when usePerKm is false but no tier price or package base", () => {
    expect(() =>
      evaluateDossierTierBaseFare({
        vehicleTier: "sedan",
        distanceKm: 200,
        spec: baseSpec,
        ruleOverrides: {
          usePerKm: false,
        },
      }),
    ).toThrow(/No fixed price configured for tier/);
  });
});

describe("ignoreClientMoney", () => {
  it("removes all client money fields", () => {
    const body: Record<string, unknown> = {
      customerName: "Test",
      totalFare: 5000,
      advanceAmount: 1000,
      balanceAmount: 4000,
      baseFare: 4500,
      amount: 5000,
      advance: 1000,
      amountMinor: 500000,
    };
    ignoreClientMoney(body);
    expect(body.totalFare).toBeUndefined();
    expect(body.advanceAmount).toBeUndefined();
    expect(body.balanceAmount).toBeUndefined();
    expect(body.baseFare).toBeUndefined();
    expect(body.amount).toBeUndefined();
    expect(body.advance).toBeUndefined();
    expect(body.amountMinor).toBeUndefined();
    expect(body.customerName).toBe("Test"); // Non-money fields preserved
  });

  it("handles missing fields gracefully", () => {
    const body: Record<string, unknown> = { customerName: "Test" };
    expect(() => ignoreClientMoney(body)).not.toThrow();
    expect(body.customerName).toBe("Test");
  });
});
