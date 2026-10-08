import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "../../src/db/memory.js";
import { createLocalTourService } from "../../src/modules/local-tours/local-tour.service.js";
import { createFareService } from "../../src/modules/fares/fare.service.js";

// Slice 4: local tours — own pricing context (fixed fleet prices + extra
// km/hour rates), publish lifecycle, 301s, booking handoff pricing.

async function setup() {
  const db = createMemoryRepositories();
  const tours = createLocalTourService({ db });
  const fares = createFareService("v1", db);
  return { db, tours, fares };
}

describe("Slice 4 — local tour lifecycle", () => {
  it("draft is invisible publicly; publish makes it visible with isNew=true", async () => {
    const { tours } = await setup();
    const created = await tours.createLocalTour({
      title: "Agra Local Sightseeing",
      city: "Agra",
      durationHours: 8,
      distanceKm: 80,
      extraKmRateInr: 14,
      extraHourRateInr: 200,
    });
    expect(created.status).toBe("draft");
    expect(created.slug).toBe("agra-local-sightseeing");
    expect(created.code).toMatch(/^LTR-/);

    expect(await tours.listPublishedLocalTours({ limit: 20 })).toEqual([]);

    await tours.publishLocalTour(created.id);
    const list = await tours.listPublishedLocalTours({ limit: 20 });
    expect(list).toHaveLength(1);
    expect(list[0]!.isNew).toBe(true);
    expect(list[0]!.extraKmRateInr).toBe(14);
    expect(list[0]!.extraHourRateInr).toBe(200);
  });

  it("city filter works on the public list", async () => {
    const { tours } = await setup();
    const a = await tours.createLocalTour({ title: "Agra Local", city: "Agra" });
    const b = await tours.createLocalTour({ title: "Delhi Local", city: "Delhi" });
    await tours.publishLocalTour(a.id);
    await tours.publishLocalTour(b.id);
    const agra = await tours.listPublishedLocalTours({ city: "Agra", limit: 20 });
    expect(agra).toHaveLength(1);
    expect(agra[0]!.city).toBe("Agra");
  });

  it("slug change creates a persistent 301 redirect", async () => {
    const { db, tours } = await setup();
    const created = await tours.createLocalTour({ title: "Agra Local", city: "Agra" });
    await tours.publishLocalTour(created.id);
    await tours.updateLocalTour(created.id, { slug: "agra-sightseeing-tour" });
    const redir = await db.slugRedirects.get("agra-local");
    expect(redir?.newSlug).toBe("agra-sightseeing-tour");
    const viaOld = await tours.getPublishedLocalTour("agra-local");
    expect(viaOld.redirect).toBe("agra-sightseeing-tour");
  });

  it("quote with the tour packageId uses the tour's fixed fleet price", async () => {
    const { tours, fares } = await setup();
    const created = await tours.createLocalTour({ title: "Agra Local", city: "Agra" });
    await tours.upsertLocalTourFleetPrice(created.id, "sedan", 2200);
    await tours.upsertLocalTourFleetPrice(created.id, "innova-crysta", 3600);
    await tours.publishLocalTour(created.id);

    const q = await fares.calculate({
      tripType: "local-tour",
      vehicleTier: "sedan",
      originName: "Agra",
      destinationName: "Agra",
      packageId: created.slug,
      pickupDatetime: "2026-11-10T10:00:00.000Z",
    });
    expect(q.baseFare).toBe(2200);
  });

  it("tour price is independent of the global per-km rate", async () => {
    const { db, tours, fares } = await setup();
    const created = await tours.createLocalTour({ title: "Agra Local", city: "Agra" });
    await tours.upsertLocalTourFleetPrice(created.id, "sedan", 2200);
    await tours.publishLocalTour(created.id);

    const rule = await db.fareRules.getActive();
    await db.fleetFareRules.upsert(rule!.id, "sedan", { perKm: 99, driverAllowance: 300, nightAllowance: 300 });

    const q = await fares.calculate({
      tripType: "local-tour",
      vehicleTier: "sedan",
      originName: "Agra",
      destinationName: "Agra",
      packageId: created.slug,
      pickupDatetime: "2026-11-10T10:00:00.000Z",
    });
    expect(q.baseFare).toBe(2200);
  });
});
