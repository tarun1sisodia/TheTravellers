import { describe, expect, it } from "vitest";
import {
  StandardVehiclePricingStrategy,
  GroupCommercialVehicleStrategy,
  PricingEngineContext,
} from "../../src/modules/fares/fare.strategy.js";
import type { FareEngineInput } from "../../src/modules/fares/fare.types.js";

const baseInput: FareEngineInput = {
  tripType: "one-way",
  vehicleTier: "sedan",
  originName: "Agra",
  destinationName: "Delhi",
  pickupDatetime: "2026-10-15T08:00:00+05:30",
  distanceKm: 230,
};

const mockRoute = {
  id: "agra-to-delhi",
  from: "agra",
  to: "delhi",
  km: 210,
  duration: "4 hrs",
  kind: "one-way" as const,
  fares: { sedan: 3499, ertiga: 4499, innova: 5499, tempo: 7500, urbania: 9500 },
};

describe("StandardVehiclePricingStrategy", () => {
  const strategy = new StandardVehiclePricingStrategy();

  it("is applicable for standard vehicle tiers", () => {
    expect(strategy.isApplicable("sedan")).toBe(true);
    expect(strategy.isApplicable("ertiga")).toBe(true);
    expect(strategy.isApplicable("innova-crysta")).toBe(true);
  });

  it("is not applicable for group vehicles", () => {
    expect(strategy.isApplicable("tempo-traveller")).toBe(false);
    expect(strategy.isApplicable("urbania")).toBe(false);
  });

  it("calculates one-way fare using catalogue price", () => {
    const result = strategy.calculate(baseInput, {
      route: mockRoute,
      vehicleId: "sedan",
      spec: { id: "sedan", tier: "sedan", name: "Sedan", seats: 4, bags: 2, perKm: 10, alwaysRoundTrip: false },
      fareVersion: "2026-09-13",
    });
    expect(result.baseFare).toBe(3499);
    expect(result.effectiveTripType).toBe("one-way");
    expect(result.driverAllowance).toBe(0);
    expect(result.alwaysRoundTrip).toBe(false);
  });

  it("calculates one-way fare using per-km rate when custom rate", () => {
    const result = strategy.calculate(baseInput, {
      route: mockRoute,
      vehicleId: "sedan",
      spec: { id: "sedan", tier: "sedan", name: "Sedan", seats: 4, bags: 2, perKm: 10, alwaysRoundTrip: false },
      fareVersion: "2026-09-13",
      hasCustomRate: true,
    });
    expect(result.baseFare).toBe(2300); // 230km * 10
  });

  it("applies same-day round-trip multiplier", () => {
    const input: FareEngineInput = {
      ...baseInput,
      tripType: "round-trip",
      returnDatetime: "2026-10-15T20:00:00+05:30",
    };
    const result = strategy.calculate(input, {
      route: mockRoute,
      vehicleId: "sedan",
      spec: { id: "sedan", tier: "sedan", name: "Sedan", seats: 4, bags: 2, perKm: 10, alwaysRoundTrip: false },
      fareVersion: "2026-09-13",
    });
    expect(result.effectiveTripType).toBe("round-trip");
    expect(result.roundMultiplierApplied).toBe(true);
    expect(result.driverAllowance).toBe(0); // Same day = no driver allowance
  });

  it("applies multi-day rules for round-trips spanning multiple days", () => {
    const input: FareEngineInput = {
      ...baseInput,
      tripType: "round-trip",
      returnDatetime: "2026-10-17T20:00:00+05:30",
    };
    const result = strategy.calculate(input, {
      route: mockRoute,
      vehicleId: "sedan",
      spec: { id: "sedan", tier: "sedan", name: "Sedan", seats: 4, bags: 2, perKm: 10, alwaysRoundTrip: false },
      fareVersion: "2026-09-13",
    });
    expect(result.effectiveTripType).toBe("round-trip");
    expect(result.roundMultiplierApplied).toBe(false);
    expect(result.driverAllowance).toBeGreaterThan(0); // Multi-day = driver allowance
  });

  it("uses route fixed fare when provided", () => {
    const result = strategy.calculate(baseInput, {
      route: mockRoute,
      vehicleId: "sedan",
      spec: { id: "sedan", tier: "sedan", name: "Sedan", seats: 4, bags: 2, perKm: 10, alwaysRoundTrip: false },
      fareVersion: "2026-09-13",
      routeFixedFareInr: 4000,
      routeSlug: "agra-delhi",
    });
    expect(result.baseFare).toBe(4000);
    expect(result.rules).toContain("route:fixed-fare:agra-delhi");
  });

  it("allows promo on standard vehicles", () => {
    const result = strategy.calculate(baseInput, {
      route: mockRoute,
      vehicleId: "sedan",
      spec: { id: "sedan", tier: "sedan", name: "Sedan", seats: 4, bags: 2, perKm: 10, alwaysRoundTrip: false },
      fareVersion: "2026-09-13",
    });
    expect(result.allowPromo).toBe(true);
  });
});

describe("GroupCommercialVehicleStrategy", () => {
  const strategy = new GroupCommercialVehicleStrategy();

  it("is applicable for group vehicle tiers", () => {
    expect(strategy.isApplicable("tempo-traveller")).toBe(true);
    expect(strategy.isApplicable("urbania")).toBe(true);
  });

  it("is not applicable for standard vehicles", () => {
    expect(strategy.isApplicable("sedan")).toBe(false);
    expect(strategy.isApplicable("ertiga")).toBe(false);
    expect(strategy.isApplicable("innova-crysta")).toBe(false);
  });

  it("always forces round-trip for group vehicles", () => {
    const result = strategy.calculate(baseInput, {
      route: { ...mockRoute, fares: { ...mockRoute.fares, tempo: 7500 } },
      vehicleId: "tempo",
      spec: { id: "tempo", tier: "tempo-traveller", name: "Tempo Traveller", seats: 12, bags: 8, perKm: 25, alwaysRoundTrip: true },
      fareVersion: "2026-09-13",
    });
    expect(result.effectiveTripType).toBe("round-trip");
    expect(result.alwaysRoundTrip).toBe(true);
    expect(result.rules).toContain("forced-round-trip");
  });

  it("doubles km for under 300km destinations", () => {
    const input: FareEngineInput = { ...baseInput, distanceKm: 200 };
    const result = strategy.calculate(input, {
      route: mockRoute,
      vehicleId: "tempo",
      spec: { id: "tempo", tier: "tempo-traveller", name: "Tempo Traveller", seats: 12, bags: 8, perKm: 25, alwaysRoundTrip: true },
      fareVersion: "2026-09-13",
    });
    expect(result.billedKm).toBe(400); // 200 * 2
    expect(result.rules).toContain("distance-rule:round-trip");
  });

  it("uses per-km once for 300km+ destinations", () => {
    const input: FareEngineInput = { ...baseInput, distanceKm: 400 };
    const result = strategy.calculate(input, {
      route: mockRoute,
      vehicleId: "tempo",
      spec: { id: "tempo", tier: "tempo-traveller", name: "Tempo Traveller", seats: 12, bags: 8, perKm: 25, alwaysRoundTrip: true },
      fareVersion: "2026-09-13",
    });
    expect(result.billedKm).toBe(400);
    expect(result.rules).toContain("distance-rule:per-km");
  });

  it("charges 500/day driver allowance", () => {
    const result = strategy.calculate(baseInput, {
      route: mockRoute,
      vehicleId: "tempo",
      spec: { id: "tempo", tier: "tempo-traveller", name: "Tempo Traveller", seats: 12, bags: 8, perKm: 25, alwaysRoundTrip: true },
      fareVersion: "2026-09-13",
    });
    expect(result.driverAllowance).toBe(500); // 1 day * 500
  });

  it("blocks promo by default on group vehicles", () => {
    const result = strategy.calculate(baseInput, {
      route: mockRoute,
      vehicleId: "tempo",
      spec: { id: "tempo", tier: "tempo-traveller", name: "Tempo Traveller", seats: 12, bags: 8, perKm: 25, alwaysRoundTrip: true },
      fareVersion: "2026-09-13",
    });
    expect(result.allowPromo).toBe(false);
  });

  it("allows promo when explicitly permitted", () => {
    const input: FareEngineInput = { ...baseInput, promoAllowGroupVehicles: true };
    const result = strategy.calculate(input, {
      route: mockRoute,
      vehicleId: "tempo",
      spec: { id: "tempo", tier: "tempo-traveller", name: "Tempo Traveller", seats: 12, bags: 8, perKm: 25, alwaysRoundTrip: true },
      fareVersion: "2026-09-13",
    });
    expect(result.allowPromo).toBe(true);
  });

  it("calculates multi-day driver allowance correctly", () => {
    const input: FareEngineInput = {
      ...baseInput,
      returnDatetime: "2026-10-17T20:00:00+05:30",
    };
    const result = strategy.calculate(input, {
      route: mockRoute,
      vehicleId: "tempo",
      spec: { id: "tempo", tier: "tempo-traveller", name: "Tempo Traveller", seats: 12, bags: 8, perKm: 25, alwaysRoundTrip: true },
      fareVersion: "2026-09-13",
    });
    expect(result.driverAllowance).toBe(500 * 3); // 3 days * 500
  });
});

describe("PricingEngineContext", () => {
  it("returns group strategy for tempo", () => {
    const ctx = PricingEngineContext.getInstance();
    const strategy = ctx.getStrategy("tempo-traveller");
    expect(strategy.name).toBe("GroupCommercialVehicleStrategy");
  });

  it("returns group strategy for urbania", () => {
    const ctx = PricingEngineContext.getInstance();
    const strategy = ctx.getStrategy("urbania");
    expect(strategy.name).toBe("GroupCommercialVehicleStrategy");
  });

  it("returns standard strategy for sedan", () => {
    const ctx = PricingEngineContext.getInstance();
    const strategy = ctx.getStrategy("sedan");
    expect(strategy.name).toBe("StandardVehiclePricingStrategy");
  });

  it("returns standard strategy for ertiga", () => {
    const ctx = PricingEngineContext.getInstance();
    const strategy = ctx.getStrategy("ertiga");
    expect(strategy.name).toBe("StandardVehiclePricingStrategy");
  });

  it("returns standard strategy for innova", () => {
    const ctx = PricingEngineContext.getInstance();
    const strategy = ctx.getStrategy("innova-crysta");
    expect(strategy.name).toBe("StandardVehiclePricingStrategy");
  });

  it("is a singleton", () => {
    const a = PricingEngineContext.getInstance();
    const b = PricingEngineContext.getInstance();
    expect(a).toBe(b);
  });
});
