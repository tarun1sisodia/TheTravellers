import { describe, expect, it } from "vitest";
import {
  toCanonicalTierKey,
  resolveTierKey,
  VEHICLE_TIERS,
  VEHICLE_TIER_META,
  type VehicleTier,
} from "../../src/contracts/vehicle-tiers.js";

describe("toCanonicalTierKey", () => {
  it("returns canonical tier as-is", () => {
    expect(toCanonicalTierKey("sedan")).toBe("sedan");
    expect(toCanonicalTierKey("ertiga")).toBe("ertiga");
    expect(toCanonicalTierKey("innova-crysta")).toBe("innova-crysta");
    expect(toCanonicalTierKey("tempo-traveller")).toBe("tempo-traveller");
    expect(toCanonicalTierKey("urbania")).toBe("urbania");
  });

  it("maps legacy short IDs to canonical", () => {
    expect(toCanonicalTierKey("innova")).toBe("innova-crysta");
    expect(toCanonicalTierKey("tempo")).toBe("tempo-traveller");
  });

  it("is case-insensitive", () => {
    expect(toCanonicalTierKey("SEDAN")).toBe("sedan");
    expect(toCanonicalTierKey("Ertiga")).toBe("ertiga");
    expect(toCanonicalTierKey("INNOVA-CRYSTA")).toBe("innova-crysta");
  });

  it("trims whitespace", () => {
    expect(toCanonicalTierKey("  sedan  ")).toBe("sedan");
    expect(toCanonicalTierKey("\tertiga\t")).toBe("ertiga");
  });

  it("returns undefined for unknown keys", () => {
    expect(toCanonicalTierKey("unknown")).toBeUndefined();
    expect(toCanonicalTierKey("")).toBeUndefined();
    expect(toCanonicalTierKey("bus")).toBeUndefined();
  });
});

describe("resolveTierKey", () => {
  it("resolves canonical key", () => {
    const record = { "innova-crysta": 5000, sedan: 3000 };
    const result = resolveTierKey(record, "innova-crysta");
    expect(result.value).toBe(5000);
    expect(result.via).toBe("canonical");
  });

  it("resolves legacy short ID key", () => {
    const record = { innova: 5000, sedan: 3000 };
    const result = resolveTierKey(record, "innova-crysta");
    expect(result.value).toBe(5000);
    expect(result.via).toBe("legacy");
  });

  it("prefers canonical over legacy when both exist", () => {
    const record = { innova: 5000, "innova-crysta": 6000 };
    const result = resolveTierKey(record, "innova-crysta");
    expect(result.value).toBe(6000);
    expect(result.via).toBe("canonical");
  });

  it("returns miss when key not found", () => {
    const record = { sedan: 3000 };
    const result = resolveTierKey(record, "innova-crysta");
    expect(result.value).toBeUndefined();
    expect(result.via).toBe("miss");
  });

  it("handles null/undefined record", () => {
    expect(resolveTierKey(null, "sedan")).toEqual({ value: undefined, via: "miss" });
    expect(resolveTierKey(undefined, "sedan")).toEqual({ value: undefined, via: "miss" });
  });

  it("works with all vehicle tiers using canonical keys", () => {
    const record: Record<string, number> = {
      sedan: 3000,
      ertiga: 4000,
      "innova-crysta": 5000,
      "tempo-traveller": 7000,
      urbania: 9000,
    };

    for (const tier of VEHICLE_TIERS) {
      const result = resolveTierKey(record, tier);
      expect(result.value).toBeGreaterThan(0);
      expect(result.via).toBe("canonical");
    }
  });

  it("works with all vehicle tiers using legacy short IDs", () => {
    const record: Record<string, number> = {
      sedan: 3000,
      ertiga: 4000,
      innova: 5000,
      tempo: 7000,
      urbania: 9000,
    };

    for (const tier of VEHICLE_TIERS) {
      const result = resolveTierKey(record, tier);
      expect(result.value).toBeGreaterThan(0);
    }
  });
});

describe("VEHICLE_TIERS", () => {
  it("has 5 tiers", () => {
    expect(VEHICLE_TIERS).toHaveLength(5);
  });

  it("contains all expected tiers", () => {
    expect(VEHICLE_TIERS).toContain("sedan");
    expect(VEHICLE_TIERS).toContain("ertiga");
    expect(VEHICLE_TIERS).toContain("innova-crysta");
    expect(VEHICLE_TIERS).toContain("tempo-traveller");
    expect(VEHICLE_TIERS).toContain("urbania");
  });
});

describe("VEHICLE_TIER_META", () => {
  it("has metadata for all tiers", () => {
    for (const tier of VEHICLE_TIERS) {
      const meta = VEHICLE_TIER_META[tier];
      expect(meta.label).toBeTruthy();
      expect(meta.seats).toBeTruthy();
      expect(meta.shortId).toBeTruthy();
    }
  });

  it("short IDs are consistent with legacy mapping", () => {
    expect(VEHICLE_TIER_META["sedan"].shortId).toBe("sedan");
    expect(VEHICLE_TIER_META["ertiga"].shortId).toBe("ertiga");
    expect(VEHICLE_TIER_META["innova-crysta"].shortId).toBe("innova");
    expect(VEHICLE_TIER_META["tempo-traveller"].shortId).toBe("tempo");
    expect(VEHICLE_TIER_META["urbania"].shortId).toBe("urbania");
  });
});
