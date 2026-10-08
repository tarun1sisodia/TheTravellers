import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Repositories, RouteRecord, RouteFleetFareRecord } from "../../db/types.js";
import { createRouteService, isRouteNew } from "./route.service.js";
import { createPackageService } from "../packages/package.service.js";
import { createLocalTourService } from "../local-tours/local-tour.service.js";
import { createMonumentService } from "../monuments/monument.service.js";

// Slice 2: reusable customer templates. Admin creates records; these templates
// render published records. No manual page per record.
// Data-first by design — visual design comes later; the data contract is the point.

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = (title: string, description: string, body: string, jsonLd?: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#fafafa;color:#18181b}
.wrap{max-width:960px;margin:0 auto;padding:24px}
header.top{background:#18181b;color:#fff;padding:12px 24px}
header.top a{color:#fff;text-decoration:none;margin-right:16px;font-size:14px}
.card{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:20px;margin:16px 0}
.fleet{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f4f4f5;padding:10px 0}
.fleet:last-child{border-bottom:0}
.price{font-size:20px;font-weight:700}
.badge{display:inline-block;font-size:11px;background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;margin-left:8px}
.btn{background:#18181b;color:#fff;border:0;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px}
input,select{padding:8px;border:1px solid #d4d4d8;border-radius:6px;font-size:14px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.grid2{grid-template-columns:1fr}}
pre.out{background:#18181b;color:#a7f3d0;padding:12px;border-radius:8px;font-size:12px;overflow:auto;white-space:pre-wrap}
.meta{color:#52525b;font-size:13px}
</style>
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head><body>
<header class="top"><a href="/"><b>TheTravellers</b></a><a href="/routes">Routes</a><a href="/dev/customer">Dev UI</a></header>
<div class="wrap">${body}</div></body></html>`;

export function registerRoutePages(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createRouteService(deps);

  // Homepage: featured published routes + packages + tours + monuments (data-first; design later)
  app.get("/", async (_req: FastifyRequest, reply: FastifyReply) => {
    const packageService = createPackageService(deps);
    const tourService = createLocalTourService(deps);
    const monumentService = createMonumentService(deps);
    const [featured, featuredPkgs, featuredTours, featuredMonuments] = await Promise.all([
      service.listPublishedRoutes({ featured: true, limit: 8 }),
      packageService.listPublishedPackages({ featured: true, limit: 8 }),
      tourService.listPublishedLocalTours({ featured: true, limit: 8 }),
      monumentService.listPublishedMonuments({ featured: true, limit: 8 }),
    ]);
    const routeCards = featured.map((r) => `
      <div class="card">
        <h3 style="margin:0 0 6px"><a href="/routes/${esc(r.slug)}">${esc(r.originCity)} → ${esc(r.destinationCity)}</a>
        ${r.isNew ? '<span class="badge">NEW</span>' : ""}</h3>
        <div class="meta">${esc(r.distanceKm ? r.distanceKm + " km" : "")} ${esc(r.durationText ?? "")} · ${esc(r.tripType)}</div>
      </div>`).join("");
    const pkgCards = featuredPkgs.map((p) => `
      <div class="card">
        <h3 style="margin:0 0 6px"><a href="/packages/${esc(p.slug)}">${esc(p.title)}</a>
        ${p.isNew ? '<span class="badge">NEW</span>' : ""}</h3>
        <div class="meta">${esc(p.durationText ?? "")} · ${esc(p.code)}</div>
      </div>`).join("");
    const tourCards = featuredTours.map((t) => `
      <div class="card">
        <h3 style="margin:0 0 6px"><a href="/tours/${esc(t.slug)}">${esc(t.title)}</a>
        ${t.isNew ? '<span class="badge">NEW</span>' : ""}</h3>
        <div class="meta">${esc(t.city)} · ${esc(t.durationText ?? "")}</div>
      </div>`).join("");
    const monumentCards = featuredMonuments.map((m) => `
      <div class="card">
        <h3 style="margin:0 0 6px"><a href="/monuments/${esc(m.slug)}">${esc(m.name)}</a>
        ${m.isNew ? '<span class="badge">NEW</span>' : ""}</h3>
        <div class="meta">${esc(m.city)} · ${esc(m.timings ?? "")}</div>
      </div>`).join("");
    return reply.type("text/html").send(shell(
      "TheTravellers — Taxi & Tour Booking",
      "Book one-way taxis, round trips, tour packages and local sightseeing across India.",
      `<h1>TheTravellers</h1>
       <h2>Featured routes</h2>${routeCards || '<p class="meta">No featured routes yet.</p>'}
       <h2>Featured packages</h2>${pkgCards || '<p class="meta">No featured packages yet.</p>'}
       <h2>Featured local tours</h2>${tourCards || '<p class="meta">No featured tours yet.</p>'}
       <h2>Featured monuments</h2>${monumentCards || '<p class="meta">No featured monuments yet.</p>'}`,
    ));
  });

  // Customer template: /routes/[slug]
  app.get("/routes/:slug", async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    let result;
    try {
      result = await service.getPublishedRoute(slug);
    } catch {
      return reply.code(404).type("text/html").send(shell("Not found", "", "<h1>Route not found</h1>"));
    }
    if (result.redirect) {
      return reply.redirect(`/routes/${result.redirect}`, 301);
    }
    const { route, fleetFares, charges } = result;
    if (!route) return reply.code(404).type("text/html").send(shell("Not found", "", "<h1>Route not found</h1>"));

    const fleets = await deps.db.fleets.list();
    const fleetName = (code: string) => fleets.find((f) => f.code === code)?.name ?? code;
    const fareRows = (fleetFares as RouteFleetFareRecord[])
      .map((f) => {
        const fare = route.tripType === "round-trip" ? f.roundTripFareInr : f.oneWayFareInr;
        return `<div class="fleet"><div><b>${esc(fleetName(f.fleetCode))}</b><div class="meta">${esc(f.fleetCode)}</div></div>
          <div class="price">${fare ? "₹" + Number(fare).toLocaleString("en-IN") : '<span class="meta">on request</span>'}</div></div>`;
      })
      .join("");
    const chargeRows = charges.length
      ? `<h3>Charges & inclusions</h3>` + charges.map((c: { kind: string; amountInr: number; note?: string | null }) =>
        `<div class="fleet"><div>${esc(c.kind)}${c.note ? `<div class="meta">${esc(c.note)}</div>` : ""}</div><div>₹${Number(c.amountInr).toLocaleString("en-IN")}</div></div>`).join("")
      : "";

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "TouristTrip",
      name: route.metaTitle ?? `${route.originCity} to ${route.destinationCity} ${route.tripType} taxi`,
      description: route.metaDescription ?? "",
      touristType: "taxi",
      itinerary: { "@type": "ItemList", itemListElement: [] },
    });

    const body = `
      <p class="meta"><a href="/">Home</a> / Routes / ${esc(route.slug)}</p>
      <h1 style="margin:6px 0">${esc(route.originCity)} → ${esc(route.destinationCity)}
        ${isRouteNew(route as RouteRecord) ? '<span class="badge">NEW</span>' : ""}</h1>
      <p class="meta">${esc(route.tripType)} · ${esc(route.distanceKm ? route.distanceKm + " km" : "")} ${esc(route.durationText ?? "")}</p>
      <div class="grid2">
        <div class="card"><h3 style="margin-top:0">Fares by fleet</h3>${fareRows || '<p class="meta">Fares on request.</p>'}${chargeRows}</div>
        <div class="card"><h3 style="margin-top:0">Get an instant quote</h3>
          <label class="meta">Fleet</label><br>
          <select id="tier">${fleets.filter((f) => f.isActive).map((f) => `<option value="${esc(f.code)}">${esc(f.name)}</option>`).join("")}</select><br><br>
          <label class="meta">Pickup date & time</label><br>
          <input type="datetime-local" id="pickup"><br><br>
          <button class="btn" onclick="quote()">Calculate fare</button>
          <div id="qout" style="margin-top:12px"></div>
        </div>
      </div>
      <script>
      async function quote(){
        const r = await fetch('/api/v1/fares/calculate',{method:'POST',headers:{'Content-Type':'application/json'},
          body: JSON.stringify({tripType:'${esc(route.tripType)}',vehicleTier:document.getElementById('tier').value,
            originName:'${esc(route.originCity)}',destinationName:'${esc(route.destinationCity)}',
            routeSlug:'${esc(route.slug)}',
            pickupDatetime: new Date(document.getElementById('pickup').value || Date.now()+36e5).toISOString()})});
        const j = await r.json();
        document.getElementById('qout').innerHTML = '<pre class="out">'+JSON.stringify(j,null,1).slice(0,1500)+'</pre>';
      }
      </script>`;
    return reply.type("text/html").send(shell(
      route.metaTitle ?? `${route.originCity} to ${route.destinationCity} taxi`,
      route.metaDescription ?? "",
      body,
      jsonLd,
    ));
  });
}
