import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "../../src/db/memory.js";
import { createMonumentService } from "../../src/modules/monuments/monument.service.js";

// Slice 5: monuments — content lifecycle; transport resolves through
// route/corridor pricing (routes + local tours), never a monument engine.

async function setup() {
  const db = createMemoryRepositories();
  const monuments = createMonumentService({ db });
  const { createRouteService } = await import("../../src/modules/routes/route.service.js");
  const { createLocalTourService } = await import("../../src/modules/local-tours/local-tour.service.js");
  const routes = createRouteService({ db });
  const tours = createLocalTourService({ db });
  return { db, monuments, routes, tours };
}

describe("Slice 5 — monument lifecycle", () => {
  it("draft is invisible publicly; publish makes it visible with isNew=true", async () => {
    const { monuments } = await setup();
    const created = await monuments.createMonument({
      name: "Taj Mahal",
      city: "Agra",
      entryFeeIndianInr: 50,
      entryFeeForeignerInr: 1100,
      timings: "Sunrise to sunset",
      closedDays: "Friday",
    });
    expect(created.status).toBe("draft");
    expect(created.slug).toBe("taj-mahal");
    expect(created.code).toMatch(/^MON-/);

    expect(await monuments.listPublishedMonuments({ limit: 20 })).toEqual([]);

    await monuments.publishMonument(created.id);
    const list = await monuments.listPublishedMonuments({ limit: 20 });
    expect(list).toHaveLength(1);
    expect(list[0]!.isNew).toBe(true);
    expect(list[0]!.entryFeeIndianInr).toBe(50);
  });

  it("city filter works on the public list", async () => {
    const { monuments } = await setup();
    const a = await monuments.createMonument({ name: "Taj Mahal", city: "Agra" });
    const b = await monuments.createMonument({ name: "Qutub Minar", city: "Delhi" });
    await monuments.publishMonument(a.id);
    await monuments.publishMonument(b.id);
    const agra = await monuments.listPublishedMonuments({ city: "Agra", limit: 20 });
    expect(agra).toHaveLength(1);
    expect(agra[0]!.city).toBe("Agra");
  });

  it("slug change creates a persistent 301 redirect", async () => {
    const { db, monuments } = await setup();
    const created = await monuments.createMonument({ name: "Taj Mahal", city: "Agra" });
    await monuments.publishMonument(created.id);
    await monuments.updateMonument(created.id, { slug: "taj-mahal-agra" });
    const redir = await db.slugRedirects.get("taj-mahal");
    expect(redir?.newSlug).toBe("taj-mahal-agra");
    const viaOld = await monuments.getPublishedMonument("taj-mahal");
    expect(viaOld.redirect).toBe("taj-mahal-agra");
  });

  it("transport context resolves through published tours and routes in the city", async () => {
    const { monuments, routes, tours } = await setup();
    const m = await monuments.createMonument({ name: "Taj Mahal", city: "Agra" });
    await monuments.publishMonument(m.id);

    const t = await tours.createLocalTour({ title: "Agra Local", city: "Agra" });
    await tours.publishLocalTour(t.id);

    const r = await routes.createRoute({ originCity: "Delhi", destinationCity: "Agra", tripType: "one-way" });
    await routes.publishRoute(r.id);

    const result = await monuments.getPublishedMonument("taj-mahal");
    expect(result.redirect).toBeNull();
    expect(result.transport!.localTours.map((x: { slug: string }) => x.slug)).toContain("agra-local");
    expect(result.transport!.routes.map((x: { slug: string }) => x.slug)).toContain(r.slug);
  });

  it("transport context ignores unpublished tours/routes and other cities", async () => {
    const { monuments, routes, tours } = await setup();
    const m = await monuments.createMonument({ name: "Taj Mahal", city: "Agra" });
    await monuments.publishMonument(m.id);

    await tours.createLocalTour({ title: "Agra Local Draft", city: "Agra" }); // draft
    const d = await tours.createLocalTour({ title: "Delhi Local", city: "Delhi" });
    await tours.publishLocalTour(d.id);
    await routes.createRoute({ originCity: "Jaipur", destinationCity: "Udaipur", tripType: "one-way" }); // draft + wrong city

    const result = await monuments.getPublishedMonument("taj-mahal");
    expect(result.transport!.localTours).toHaveLength(0);
    expect(result.transport!.routes).toHaveLength(0);
  });
});
