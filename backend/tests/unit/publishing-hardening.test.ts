import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "../../src/db/memory.js";
import { createRouteService } from "../../src/modules/routes/route.service.js";
import { createPackageService } from "../../src/modules/packages/package.service.js";
import { createLocalTourService } from "../../src/modules/local-tours/local-tour.service.js";
import { createMonumentService } from "../../src/modules/monuments/monument.service.js";

// Slice 6: publishing hardening — sitemap/search surface only published
// content; drafts never leak.

async function setup() {
  const db = createMemoryRepositories();
  return {
    db,
    routes: createRouteService({ db }),
    packages: createPackageService({ db }),
    tours: createLocalTourService({ db }),
    monuments: createMonumentService({ db }),
  };
}

// Mirrors the matching logic in seo.routes.ts so the contract is pinned.
function searchPublished(
  q: string,
  data: {
    routes: Array<{ slug: string; originCity: string; destinationCity: string }>;
    packages: Array<{ slug: string; title: string }>;
    tours: Array<{ slug: string; title: string; city: string }>;
    monuments: Array<{ slug: string; name: string; city: string }>;
  },
) {
  const query = q.trim().toLowerCase();
  const results: Array<{ kind: string; slug: string }> = [];
  for (const r of data.routes) {
    if (`${r.originCity} ${r.destinationCity}`.toLowerCase().includes(query))
      results.push({ kind: "route", slug: r.slug });
  }
  for (const p of data.packages) {
    if (p.title.toLowerCase().includes(query)) results.push({ kind: "package", slug: p.slug });
  }
  for (const t of data.tours) {
    if (`${t.title} ${t.city}`.toLowerCase().includes(query)) results.push({ kind: "tour", slug: t.slug });
  }
  for (const m of data.monuments) {
    if (`${m.name} ${m.city}`.toLowerCase().includes(query)) results.push({ kind: "monument", slug: m.slug });
  }
  return results;
}

describe("Slice 6 — published-only surfaces", () => {
  it("only published records appear in the public lists", async () => {
    const { routes, packages, tours, monuments } = await setup();

    const r = await routes.createRoute({ originCity: "Delhi", destinationCity: "Agra", tripType: "one-way" });
    const p = await packages.createPackage({ title: "Agra Day Tour" });
    const t = await tours.createLocalTour({ title: "Agra Local", city: "Agra" });
    const m = await monuments.createMonument({ name: "Taj Mahal", city: "Agra" });

    // All drafts: public lists empty
    expect(await routes.listPublishedRoutes({ limit: 50 })).toEqual([]);
    expect(await packages.listPublishedPackages({ limit: 50 })).toEqual([]);
    expect(await tours.listPublishedLocalTours({ limit: 50 })).toEqual([]);
    expect(await monuments.listPublishedMonuments({ limit: 50 })).toEqual([]);

    await routes.publishRoute(r.id);
    await packages.publishPackage(p.id);
    await tours.publishLocalTour(t.id);
    await monuments.publishMonument(m.id);

    expect((await routes.listPublishedRoutes({ limit: 50 })).map((x) => x.slug)).toContain(r.slug);
    expect((await packages.listPublishedPackages({ limit: 50 })).map((x) => x.slug)).toContain(p.slug);
    expect((await tours.listPublishedLocalTours({ limit: 50 })).map((x) => x.slug)).toContain(t.slug);
    expect((await monuments.listPublishedMonuments({ limit: 50 })).map((x) => x.slug)).toContain(m.slug);
  });

  it("archive removes a record from every public surface", async () => {
    const { routes } = await setup();
    const r = await routes.createRoute({ originCity: "Delhi", destinationCity: "Agra", tripType: "one-way" });
    await routes.publishRoute(r.id);
    expect(await routes.listPublishedRoutes({ limit: 50 })).toHaveLength(1);
    await routes.archiveRoute(r.id);
    expect(await routes.listPublishedRoutes({ limit: 50 })).toEqual([]);
    await expect(routes.getPublishedRoute(r.slug)).rejects.toThrow();
  });

  it("search matches across kinds and never returns drafts", async () => {
    const { routes, packages, tours, monuments } = await setup();
    const r = await routes.createRoute({ originCity: "Delhi", destinationCity: "Agra", tripType: "one-way" });
    await routes.publishRoute(r.id);
    const p = await packages.createPackage({ title: "Agra Heritage Package" });
    await packages.publishPackage(p.id);
    await tours.createLocalTour({ title: "Agra Local", city: "Agra" }); // draft
    const m = await monuments.createMonument({ name: "Taj Mahal", city: "Agra" });
    await monuments.publishMonument(m.id);

    const data = {
      routes: await routes.listPublishedRoutes({ limit: 100 }),
      packages: await packages.listPublishedPackages({ limit: 100 }),
      tours: await tours.listPublishedLocalTours({ limit: 100 }),
      monuments: await monuments.listPublishedMonuments({ limit: 100 }),
    };
    const kinds = searchPublished("agra", data).map((x) => x.kind).sort();
    expect(kinds).toEqual(["monument", "package", "route"]);
    // the draft tour is not in the published list, so it can't match
    expect(data.tours).toHaveLength(0);
  });

  it("slug redirects survive publish/archive cycles", async () => {
    const { db, routes } = await setup();
    const r = await routes.createRoute({ originCity: "Delhi", destinationCity: "Agra", tripType: "one-way" });
    await routes.publishRoute(r.id);
    await routes.updateRoute(r.id, { slug: "delhi-agra-express" });
    const redir = await db.slugRedirects.get(r.slug);
    expect(redir?.newSlug).toBe("delhi-agra-express");
    await routes.archiveRoute(r.id);
    // redirect record persists even after archive
    expect((await db.slugRedirects.get(r.slug))?.newSlug).toBe("delhi-agra-express");
  });
});
