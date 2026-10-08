import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "../../src/db/memory.js";
import { createFareService } from "../../src/modules/fares/fare.service.js";
import { newId } from "../../src/shared/ids.js";

// Slice 1 / doc §76: the full 5 fleets × 7 distances outstation matrix,
// driven by DB-backed fleet_fare_rules (not hardcoded constants).
//
// Verifies:
//  - per-km rates come from fleet_fare_rules (DB authority)
//  - the 300 km forced round-trip rule: tempo/urbania under 300 km bill 2x,
//    exactly 300 km and above bill 1x
//  - night window comes from fare_rules columns (20:00–06:00 dossier canon)

const FLEETS = [
  { code: "sedan", perKm: 11, driver: 300, night: 300 },
  { code: "ertiga", perKm: 15, driver: 300, night: 300 },
  { code: "innova-crysta", perKm: 19, driver: 300, night: 300 },
  { code: "tempo-traveller", perKm: 26, driver: 500, night: 500 },
  { code: "urbania", perKm: 35, driver: 500, night: 500 },
] as const;

// Distances stay above the engine's 150 km estimated-route floor for unknown
// cities, so billedKm reflects the input distance exactly. Rates differ from
// the VEHICLES consts on purpose — this proves the DB is the pricing authority.
const DISTANCES = [150, 299, 300, 301, 400, 500, 700];
const GROUP = new Set(["tempo-traveller", "urbania"]);

async function seededService() {
  const db = createMemoryRepositories();
  const ruleId = newId();
  await db.fareRules.save({
    id: ruleId,
    version: "v1",
    config: {},
    effectiveFrom: new Date().toISOString(),
    effectiveTo: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    nightStartHour: 20,
    nightEndHour: 6,
    minKmPerDay: 300,
    sameDayRoundMultiplier: 1.85,
  });
  for (const f of FLEETS) {
    await db.fleetFareRules.upsert(ruleId, f.code, {
      perKm: f.perKm,
      driverAllowance: f.driver,
      nightAllowance: f.night,
    });
  }
  return { db, fareService: createFareService("v1", db) };
}

const dayPickup = "2026-11-10T10:00:00.000Z"; // 10:00 UTC — outside night window

describe("Slice 1 — DB-driven outstation matrix (doc §76)", () => {
  it("5 fleets × 7 distances: billedKm follows the 300 km rule, baseFare uses DB per-km", async () => {
    const { fareService } = await seededService();
    for (const fleet of FLEETS) {
      for (const km of DISTANCES) {
        const q = await fareService.calculate({
          tripType: "one-way",
          vehicleTier: fleet.code,
          originName: "CityA",
          destinationName: "CityB",
          distanceKm: km,
          pickupDatetime: dayPickup,
        });
        const expectedBilled = GROUP.has(fleet.code) && km < 300 ? km * 2 : km;
        expect(q.billedKm, `${fleet.code} @ ${km}km billedKm`).toBe(expectedBilled);
        expect(q.baseFare, `${fleet.code} @ ${km}km baseFare`).toBe(expectedBilled * fleet.perKm);
        expect(q.fareVersion).toBe("v1");
      }
    }
  });

  it("boundary: exactly 300 km is NOT doubled for group vehicles", async () => {
    const { fareService } = await seededService();
    for (const code of ["tempo-traveller", "urbania"] as const) {
      const q = await fareService.calculate({
        tripType: "one-way",
        vehicleTier: code,
        originName: "CityA",
        destinationName: "CityB",
        distanceKm: 300,
        pickupDatetime: dayPickup,
      });
      expect(q.billedKm).toBe(300);
    }
  });

  it("night window 20:00–06:00 comes from the DB version, not the old 22–5 hardcode", async () => {
    const { fareService } = await seededService();
    // 21:00 pickup is inside the dossier window (20–6) but outside the old 22–5 hardcode
    const night = await fareService.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "CityA",
      destinationName: "CityB",
      distanceKm: 230,
      pickupDatetime: "2026-11-10T21:00:00.000Z",
    });
    expect(night.nightAllowance).toBe(300);
    expect(night.rules).toContain("night-allowance");

    const day = await fareService.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "CityA",
      destinationName: "CityB",
      distanceKm: 230,
      pickupDatetime: dayPickup,
    });
    expect(day.nightAllowance).toBe(0);
  });

  it("per-tier night allowance from DB: tempo gets 500 at night", async () => {
    const { fareService } = await seededService();
    const night = await fareService.calculate({
      tripType: "one-way",
      vehicleTier: "tempo-traveller",
      originName: "CityA",
      destinationName: "CityB",
      distanceKm: 400,
      pickupDatetime: "2026-11-10T21:00:00.000Z",
    });
    expect(night.nightAllowance).toBe(500);
  });

  it("changing the DB per-km rate changes the quote without a deploy", async () => {
    const { db, fareService } = await seededService();
    const base = await fareService.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "CityA",
      destinationName: "CityB",
      distanceKm: 230,
      pickupDatetime: dayPickup,
    });
    expect(base.baseFare).toBe(230 * 11);

    const rule = await db.fareRules.getActive();
    await db.fleetFareRules.upsert(rule!.id, "sedan", { perKm: 12, driverAllowance: 300, nightAllowance: 300 });

    const updated = await fareService.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "CityA",
      destinationName: "CityB",
      distanceKm: 230,
      pickupDatetime: dayPickup,
    });
    expect(updated.baseFare).toBe(230 * 12);
  });
});
