import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Repositories } from "../../db/types.js";
import { createRouteService } from "../routes/route.service.js";
import { createPackageService } from "../packages/package.service.js";
import { createLocalTourService } from "../local-tours/local-tour.service.js";
import { createMonumentService } from "../monuments/monument.service.js";

// Slice 6: publishing hardening — sitemap.xml, robots.txt, and a unified
// search across published content. All data comes from the publishable
// entities; drafts never appear.

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function baseUrl(request: FastifyRequest): string {
  const env = process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.host ?? "localhost:3000";
  const proto = (request.headers["x-forwarded-proto"] as string) ?? "http";
  return `${proto}://${host}`;
}

export function registerSeoRoutes(app: FastifyInstance, deps: { db: Repositories }) {
  const routes = createRouteService(deps);
  const packages = createPackageService(deps);
  const tours = createLocalTourService(deps);
  const monuments = createMonumentService(deps);

  app.get("/sitemap.xml", async (request: FastifyRequest, reply: FastifyReply) => {
    const base = baseUrl(request);
    const [rs, ps, ts, ms] = await Promise.all([
      routes.listPublishedRoutes({ limit: 1000 }),
      packages.listPublishedPackages({ limit: 1000 }),
      tours.listPublishedLocalTours({ limit: 1000 }),
      monuments.listPublishedMonuments({ limit: 1000 }),
    ]);
    const urls: string[] = [`<url><loc>${esc(base)}/</loc></url>`];
    for (const r of rs) urls.push(`<url><loc>${esc(base)}/routes/${esc(r.slug)}</loc><lastmod>${esc(r.updatedAt.slice(0, 10))}</lastmod></url>`);
    for (const p of ps) urls.push(`<url><loc>${esc(base)}/packages/${esc(p.slug)}</loc><lastmod>${esc(p.updatedAt.slice(0, 10))}</lastmod></url>`);
    for (const t of ts) urls.push(`<url><loc>${esc(base)}/tours/${esc(t.slug)}</loc><lastmod>${esc(t.updatedAt.slice(0, 10))}</lastmod></url>`);
    for (const m of ms) urls.push(`<url><loc>${esc(base)}/monuments/${esc(m.slug)}</loc><lastmod>${esc(m.updatedAt.slice(0, 10))}</lastmod></url>`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
    return reply.type("application/xml").send(xml);
  });

  app.get("/robots.txt", async (request: FastifyRequest, reply: FastifyReply) => {
    const base = baseUrl(request);
    return reply.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dev/\nSitemap: ${base}/sitemap.xml\n`,
    );
  });

  // Unified search across published content (data-first; no ranking engine yet)
  app.get("/api/v1/search", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = String((request.query as Record<string, unknown>)?.q ?? "").trim().toLowerCase();
    if (!q || q.length < 2) {
      return reply.send({ success: true, data: { query: q, results: [] } });
    }
    const [rs, ps, ts, ms] = await Promise.all([
      routes.listPublishedRoutes({ limit: 1000 }),
      packages.listPublishedPackages({ limit: 1000 }),
      tours.listPublishedLocalTours({ limit: 1000 }),
      monuments.listPublishedMonuments({ limit: 1000 }),
    ]);
    const results: Array<{ kind: string; slug: string; title: string; url: string }> = [];
    for (const r of rs) {
      const hay = `${r.originCity} ${r.destinationCity} ${r.corridor}`.toLowerCase();
      if (hay.includes(q)) results.push({ kind: "route", slug: r.slug, title: `${r.originCity} → ${r.destinationCity}`, url: `/routes/${r.slug}` });
    }
    for (const p of ps) {
      if (p.title.toLowerCase().includes(q)) results.push({ kind: "package", slug: p.slug, title: p.title, url: `/packages/${p.slug}` });
    }
    for (const t of ts) {
      const hay = `${t.title} ${t.city}`.toLowerCase();
      if (hay.includes(q)) results.push({ kind: "tour", slug: t.slug, title: t.title, url: `/tours/${t.slug}` });
    }
    for (const m of ms) {
      const hay = `${m.name} ${m.city}`.toLowerCase();
      if (hay.includes(q)) results.push({ kind: "monument", slug: m.slug, title: m.name, url: `/monuments/${m.slug}` });
    }
    return reply.send({ success: true, data: { query: q, results: results.slice(0, 50) } });
  });
}
