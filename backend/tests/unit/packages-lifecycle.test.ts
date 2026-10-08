import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "../../src/db/memory.js";
import { createPackageService } from "../../src/modules/packages/package.service.js";
import { createFareService } from "../../src/modules/fares/fare.service.js";

// Slice 3: packages — fixed per-fleet prices, isolated from route-rate changes.

async function setup() {
  const db = createMemoryRepositories();
  const packages = createPackageService({ db });
  const fares = createFareService("v1", db);
  return { db, packages, fares };
}

describe("Slice 3 — package publishing lifecycle", () => {
  it("draft is invisible publicly; publish makes it visible with isNew=true", async () => {
    const { packages } = await setup();
    const created = await packages.createPackage({
      title: "Agra Same-Day Tour",
      originCity: "Agra",
      durationText: "1 day",
    });
    expect(created.status).toBe("draft");
    expect(created.slug).toBe("agra-same-day-tour");
    expect(created.code).toMatch(/^PKG-/);

    expect(await packages.listPublishedPackages({ limit: 20 })).toEqual([]);

    await packages.publishPackage(created.id);
    const list = await packages.listPublishedPackages({ limit: 20 });
    expect(list).toHaveLength(1);
    expect(list[0]!.isNew).toBe(true);
  });

  it("archive removes the package from public listing (content rollback)", async () => {
    const { packages } = await setup();
    const created = await packages.createPackage({ title: "Agra Same-Day Tour" });
    await packages.publishPackage(created.id);
    expect(await packages.listPublishedPackages({ limit: 20 })).toHaveLength(1);
    await packages.archivePackage(created.id);
    expect(await packages.listPublishedPackages({ limit: 20 })).toEqual([]);
    const admin = await packages.getPackage(created.id);
    expect(admin.status).toBe("archived");
  });

  it("slug change creates a persistent 301 redirect", async () => {
    const { db, packages } = await setup();
    const created = await packages.createPackage({ title: "Agra Same-Day Tour" });
    await packages.publishPackage(created.id);
    await packages.updatePackage(created.id, { slug: "agra-one-day-tour" });

    const redir = await db.slugRedirects.get("agra-same-day-tour");
    expect(redir?.newSlug).toBe("agra-one-day-tour");

    const viaOld = await packages.getPublishedPackage("agra-same-day-tour");
    expect(viaOld.redirect).toBe("agra-one-day-tour");
  });

  it("quote with packageId uses the fixed fleet price, not per-km math", async () => {
    const { packages, fares } = await setup();
    const created = await packages.createPackage({ title: "Agra Same-Day Tour", originCity: "Agra" });
    await packages.upsertPackageFleetPrice(created.id, "sedan", 3499);
    await packages.upsertPackageFleetPrice(created.id, "tempo-traveller", 8999);
    await packages.publishPackage(created.id);

    const sedan = await fares.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "Agra",
      destinationName: "Agra",
      packageId: created.slug,
      pickupDatetime: "2026-11-10T10:00:00.000Z",
    });
    expect(sedan.baseFare).toBe(3499);

    const tempo = await fares.calculate({
      tripType: "one-way",
      vehicleTier: "tempo-traveller",
      originName: "Agra",
      destinationName: "Agra",
      packageId: created.slug,
      pickupDatetime: "2026-11-10T10:00:00.000Z",
    });
    expect(tempo.baseFare).toBe(8999);
  });

  it("package price is isolated from route-rate changes", async () => {
    const { db, packages, fares } = await setup();
    const created = await packages.createPackage({ title: "Agra Same-Day Tour", originCity: "Agra" });
    await packages.upsertPackageFleetPrice(created.id, "sedan", 3499);
    await packages.publishPackage(created.id);

    // Change the global sedan per-km rate — the package price must not move
    const rule = await db.fareRules.getActive();
    await db.fleetFareRules.upsert(rule!.id, "sedan", { perKm: 99, driverAllowance: 300, nightAllowance: 300 });

    const q = await fares.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "Agra",
      destinationName: "Agra",
      packageId: created.slug,
      pickupDatetime: "2026-11-10T10:00:00.000Z",
    });
    expect(q.baseFare).toBe(3499);
  });
});
