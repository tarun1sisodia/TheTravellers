import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Repositories } from "../../db/types.js";
import { createMonumentService, isMonumentNew } from "./monument.service.js";

// Slice 5: /monuments/[slug] customer template. Data-first.
// Monument transport resolves through route/corridor pricing: the page shows
// published local tours in the monument's city and published routes touching
// that city. No separate monument pricing engine.

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
.row{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f4f4f5;padding:10px 0}
.row:last-child{border-bottom:0}
.price{font-size:20px;font-weight:700}
.badge{display:inline-block;font-size:11px;background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;margin-left:8px}
.meta{color:#52525b;font-size:13px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.grid2{grid-template-columns:1fr}}
img.hero{max-width:100%;border-radius:10px;margin:12px 0}
table.info{border-collapse:collapse;font-size:14px}
table.info td{padding:6px 12px 6px 0;vertical-align:top}
table.info td:first-child{color:#52525b;white-space:nowrap}
</style>
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head><body>
<header class="top"><a href="/"><b>TheTravellers</b></a><a href="/dev/customer">Dev UI</a></header>
<div class="wrap">${body}</div></body></html>`;

export function registerMonumentPages(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createMonumentService(deps);

  app.get("/monuments/:slug", async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    let result;
    try {
      result = await service.getPublishedMonument(slug);
    } catch {
      return reply.code(404).type("text/html").send(shell("Not found", "", "<h1>Monument not found</h1>"));
    }
    if (result.redirect) {
      return reply.redirect(`/monuments/${result.redirect}`, 301);
    }
    const { monument: m, transport } = result;
    if (!m) return reply.code(404).type("text/html").send(shell("Not found", "", "<h1>Monument not found</h1>"));

    const fee = (v: number | null | undefined) =>
      v === null || v === undefined ? "—" : `₹${Number(v).toLocaleString("en-IN")}`;
    const tours = (transport?.localTours ?? [])
      .map((t: { slug: string; title: string }) =>
        `<div class="row"><div><b>${esc(t.title)}</b></div><div><a href="/tours/${esc(t.slug)}">View tour</a></div></div>`)
      .join("");
    const routes = (transport?.routes ?? [])
      .map((r: { slug: string; title: string }) =>
        `<div class="row"><div><b>${esc(r.title)}</b></div><div><a href="/routes/${esc(r.slug)}">View route</a></div></div>`)
      .join("");

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "TouristAttraction",
      name: m.name,
      description: m.metaDescription ?? m.description ?? "",
    });

    const body = `
      <p class="meta"><a href="/">Home</a> / Monuments / ${esc(m.slug)}</p>
      <h1 style="margin:6px 0">${esc(m.name)}${isMonumentNew(m) ? '<span class="badge">NEW</span>' : ""}</h1>
      <p class="meta">${esc(m.city)} · ${esc(m.code)}</p>
      ${m.heroImageUrl ? `<img class="hero" src="${esc(m.heroImageUrl)}" alt="${esc(m.name)}">` : ""}
      <div class="card"><h3 style="margin-top:0">Visitor information</h3>
        <table class="info">
          <tr><td>Entry (Indian)</td><td><b>${fee(m.entryFeeIndianInr)}</b></td></tr>
          <tr><td>Entry (Foreigner)</td><td><b>${fee(m.entryFeeForeignerInr)}</b></td></tr>
          <tr><td>Timings</td><td>${esc(m.timings ?? "—")}</td></tr>
          <tr><td>Closed</td><td>${esc(m.closedDays ?? "—")}</td></tr>
        </table>
        ${m.description ? `<p style="font-size:14px">${esc(m.description)}</p>` : ""}
      </div>
      <div class="grid2">
        <div class="card"><h3 style="margin-top:0">Local tours in ${esc(m.city)}</h3>${tours || '<p class="meta">No tours listed yet.</p>'}</div>
        <div class="card"><h3 style="margin-top:0">Routes via ${esc(m.city)}</h3>${routes || '<p class="meta">No routes listed yet.</p>'}</div>
      </div>
      <p class="meta">Transport prices are set by the route and tour listings above — monuments carry no separate pricing.</p>`;
    return reply.type("text/html").send(shell(
      m.metaTitle ?? `${m.name} — ${m.city}`,
      m.metaDescription ?? m.description ?? "",
      body,
      jsonLd,
    ));
  });
}
