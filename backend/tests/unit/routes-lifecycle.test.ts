import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "../../src/db/memory.js";
import { createRouteService } from "../../src/modules/routes/route.service.js";
import { createFareService } from "../../src/modules/fares/fare.service.js";

// Slice 2: routes end-to-end — Admin → publish → customer template → quote.
// Verifies the publishing lifecycle, slug 301s, featured ordering,
// derived isNew, and fixed-fare quotes from a published route.

async function setup() {
  const db = createMemoryRepositories();
  const routes = createRouteService({ db });
  const fares = createFareService("v1", db);
  return { db, routes, fares };
}

describe("Slice 2 — route publishing lifecycle", () => {
  it("draft is invisible publicly; publish makes it visible with isNew=true", async () => {
    const { routes } = await setup();
    const created = await routes.createRoute({
      originCity: "Agra",
      destinationCity: "Jaipur",
      tripType: "one-way",
      distanceKm: 240,
    });
    expect(created.status).toBe("draft");
    expect(created.slug).toBe("agra-to-jaipur-one-way");

    expect(await routes.listPublishedRoutes({ limit: 20 })).toEqual([]);

    const published = await routes.publishRoute(created.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();

    const list = await routes.listPublishedRoutes({ limit: 20 });
    expect(list).toHaveLength(1);
    expect(list[0]!.isNew).toBe(true); // derived, not stored
    expect(list[0]).not.toHaveProperty("is_new");
  });

  it("archive removes the route from public listing (content rollback, no deploy)", async () => {
    const { routes } = await setup();
    const created = await routes.createRoute({ originCity: "Agra", destinationCity: "Jaipur", tripType: "one-way" });
    await routes.publishRoute(created.id);
    expect(await routes.listPublishedRoutes({ limit: 20 })).toHaveLength(1);
    await routes.archiveRoute(created.id);
    expect(await routes.listPublishedRoutes({ limit: 20 })).toEqual([]);
    // The record still exists for admin — nothing was deleted
    const admin = await routes.getRoute(created.id);
    expect(admin.status).toBe("archived");
  });

  it("slug change creates a persistent 301 redirect", async () => {
    const { db, routes } = await setup();
    const created = await routes.createRoute({ originCity: "Agra", destinationCity: "Jaipur", tripType: "one-way" });
    await routes.publishRoute(created.id);
    await routes.updateRoute(created.id, { slug: "agra-jaipur-taxi-one-way" });

    const redir = await db.slugRedirects.get("agra-to-jaipur-one-way");
    expect(redir?.newSlug).toBe("agra-jaipur-taxi-one-way");

    const viaOld = await routes.getPublishedRoute("agra-to-jaipur-one-way");
    expect(viaOld.redirect).toBe("agra-jaipur-taxi-one-way");
    const viaNew = await routes.getPublishedRoute("agra-jaipur-taxi-one-way");
    expect(viaNew.route?.slug).toBe("agra-jaipur-taxi-one-way");
  });

  it("featured routes come first, ordered by featured_order", async () => {
    const { routes } = await setup();
    const a = await routes.createRoute({ originCity: "Agra", destinationCity: "Delhi", tripType: "one-way" });
    const b = await routes.createRoute({ originCity: "Agra", destinationCity: "Jaipur", tripType: "one-way" });
    const c = await routes.createRoute({ originCity: "Delhi", destinationCity: "Agra", tripType: "one-way" });
    await routes.publishRoute(a.id);
    await routes.publishRoute(b.id);
    await routes.publishRoute(c.id);
    await routes.updateRoute(c.id, { isFeatured: true, featuredOrder: 2 });
    await routes.updateRoute(b.id, { isFeatured: true, featuredOrder: 1 });

    const featured = await routes.listPublishedRoutes({ featured: true, limit: 8 });
    expect(featured.map((r) => r.slug)).toEqual(["agra-to-jaipur-one-way", "delhi-to-agra-one-way"]);
  });

  it("isNew is derived from published_at/new_until: expires after the window", async () => {
    const { db, routes } = await setup();
    const created = await routes.createRoute({ originCity: "Agra", destinationCity: "Jaipur", tripType: "one-way" });
    await routes.publishRoute(created.id);
    // Backdate published_at 40 days → outside the default 30-day window
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    await db.routes.update(created.id, { publishedAt: old });
    const list = await routes.listPublishedRoutes({ limit: 20 });
    expect(list[0]!.isNew).toBe(false);
  });

  it("quote with routeSlug uses the published route's fixed fleet fare", async () => {
    const { routes, fares } = await setup();
    const created = await routes.createRoute({
      originCity: "Agra",
      destinationCity: "Delhi",
      tripType: "one-way",
      distanceKm: 230,
    });
    await routes.upsertRouteFleetFare(created.id, "sedan", { oneWayFareInr: 3499 });
    await routes.publishRoute(created.id);

    const q = await fares.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "Agra",
      destinationName: "Delhi",
      distanceKm: 230,
      routeSlug: created.slug,
      pickupDatetime: "2026-11-10T10:00:00.000Z",
    });
    expect(q.baseFare).toBe(3499);
    expect(q.rules.some((r) => r.startsWith("route:fixed-fare"))).toBe(true);
  });

  it("quote without routeSlug falls back to per-km engine pricing", async () => {
    const { fares } = await setup();
    const q = await fares.calculate({
      tripType: "one-way",
      vehicleTier: "sedan",
      originName: "CityA",
      destinationName: "CityB",
      distanceKm: 230,
      pickupDatetime: "2026-11-10T10:00:00.000Z",
    });
    expect(q.rules.some((r) => r.startsWith("route:fixed-fare"))).toBe(false);
  });
});
