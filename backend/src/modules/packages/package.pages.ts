import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Repositories, PackageFleetPriceRecord } from "../../db/types.js";
import { createPackageService, isPackageNew } from "./package.service.js";
import { baseUrl } from "../seo/seo.routes.js";

// Slice 3: /packages/[slug] customer template. Data-first.
// Booking handoff: the template posts a draft with packageId; the fare engine
// prices it from the package's fixed fleet prices (isolated from route rates).

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = (title: string, description: string, body: string, jsonLd?: string, canonical?: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
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
ul.tight{margin:6px 0;padding-left:20px;font-size:14px}
</style>
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head><body>
<header class="top"><a href="/"><b>TheTravellers</b></a><a href="/routes">Routes</a><a href="/dev/customer">Dev UI</a></header>
<div class="wrap">${body}</div></body></html>`;

export function registerPackagePages(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createPackageService(deps);

  app.get("/packages/:slug", async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    let result;
    try {
      result = await service.getPublishedPackage(slug);
    } catch {
      return reply.code(404).type("text/html").send(shell("Not found", "", "<h1>Package not found</h1>"));
    }
    if (result.redirect) {
      return reply.redirect(`/packages/${result.redirect}`, 301);
    }
    const { package: pkg, fleetPrices } = result;
    if (!pkg) return reply.code(404).type("text/html").send(shell("Not found", "", "<h1>Package not found</h1>"));

    const fleets = await deps.db.fleets.list();
    const fleetName = (code: string) => fleets.find((f) => f.code === code)?.name ?? code;
    const priceRows = (fleetPrices as PackageFleetPriceRecord[])
      .map((p) => `<div class="fleet"><div><b>${esc(fleetName(p.fleetCode))}</b><div class="meta">fixed package price</div></div>
        <div class="price">₹${Number(p.priceInr).toLocaleString("en-IN")}</div></div>`)
      .join("");
    const itinerary = (pkg.itinerary ?? []).map((d: { day: number; title: string; description?: string }) =>
      `<li><b>Day ${d.day}:</b> ${esc(d.title)}${d.description ? ` — ${esc(d.description)}` : ""}</li>`).join("");
    const inc = (pkg.inclusions ?? []).map((i: string) => `<li>${esc(i)}</li>`).join("");
    const exc = (pkg.exclusions ?? []).map((e: string) => `<li>${esc(e)}</li>`).join("");

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "TouristTrip",
      name: pkg.metaTitle ?? pkg.title,
      description: pkg.metaDescription ?? pkg.tagline ?? "",
    });

    const body = `
      <p class="meta"><a href="/">Home</a> / Packages / ${esc(pkg.slug)}</p>
      <h1 style="margin:6px 0">${esc(pkg.title)}${isPackageNew(pkg) ? '<span class="badge">NEW</span>' : ""}</h1>
      <p class="meta">${esc(pkg.tagline ?? "")} · ${esc(pkg.durationText ?? "")} · ${esc(pkg.code)}</p>
      <div class="grid2">
        <div class="card"><h3 style="margin-top:0">Fixed prices by fleet</h3>${priceRows || '<p class="meta">Prices on request.</p>'}</div>
        <div class="card"><h3 style="margin-top:0">Book this package</h3>
          <label class="meta">Fleet</label><br>
          <select id="tier">${fleets.filter((f) => f.isActive).map((f) => `<option value="${esc(f.code)}">${esc(f.name)}</option>`).join("")}</select><br><br>
          <label class="meta">Pickup date & time</label><br>
          <input type="datetime-local" id="pickup"><br><br>
          <label class="meta">Your name</label><br><input id="cname" placeholder="Full name"><br><br>
          <label class="meta">Phone</label><br><input id="cphone" placeholder="10-digit mobile"><br><br>
          <button class="btn" onclick="bookPkg()">Book now</button>
          <div id="bout" style="margin-top:12px"></div>
        </div>
      </div>
      <div class="card"><h3 style="margin-top:0">Itinerary</h3><ul class="tight">${itinerary || '<li class="meta">Itinerary coming soon.</li>'}</ul></div>
      <div class="grid2">
        <div class="card"><h3 style="margin-top:0">Inclusions</h3><ul class="tight">${inc}</ul></div>
        <div class="card"><h3 style="margin-top:0">Exclusions</h3><ul class="tight">${exc}</ul></div>
      </div>
      <script>
      async function bookPkg(){
        const tier = document.getElementById('tier').value;
        const r = await fetch('/api/v1/bookings/draft',{method:'POST',headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            bookingSelection:{kind:'package',id:'${esc(pkg.id)}',source:'catalog',slug:'${esc(pkg.slug)}',name:'${esc(pkg.title)}'},
            vehicleTier:tier,
            pickupAddress:'${esc(pkg.originCity ?? "")}',
            pickupDatetime: new Date(document.getElementById('pickup').value || Date.now()+36e5).toISOString(),
            customerName:document.getElementById('cname').value, customerPhone:document.getElementById('cphone').value})});
        const j = await r.json();
        document.getElementById('bout').innerHTML = '<pre class="out">'+JSON.stringify(j,null,1).slice(0,1500)+'</pre>';
      }
      </script>`;
    return reply.type("text/html").send(shell(
      pkg.metaTitle ?? pkg.title,
      pkg.metaDescription ?? pkg.tagline ?? "",
      body,
      jsonLd,
      `${baseUrl(request)}/packages/${encodeURIComponent(pkg.slug)}`,
    ));
  });
}
