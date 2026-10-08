import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Repositories } from "../../db/types.js";
import { baseUrl } from "../seo/seo.routes.js";
import { createRouteService } from "../routes/route.service.js";
import { createPackageService } from "../packages/package.service.js";
import { createLocalTourService } from "../local-tours/local-tour.service.js";
import { createFareService } from "../fares/fare.service.js";
import { createBookingService } from "../bookings/booking.service.js";
import { CreateDraftBookingSchema } from "../bookings/booking.schema.js";
import { systemClock } from "../../shared/clock.js";

// Slice 7: booking UI port — functional, data-first, no redesign.
// Mirrors the wizard steps (select → fare → customer → confirm) as
// server-rendered pages against the live API. Visual design comes later.

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | TheTravellers</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#fafafa;color:#18181b}
.wrap{max-width:720px;margin:0 auto;padding:24px}
header.top{background:#18181b;color:#fff;padding:12px 24px}
header.top a{color:#fff;text-decoration:none;margin-right:16px;font-size:14px}
.card{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:20px;margin:16px 0}
.btn{background:#18181b;color:#fff;border:0;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:15px}
.btn:disabled{opacity:.5}
input,select{padding:10px;border:1px solid #d4d4d8;border-radius:6px;font-size:14px;width:100%;box-sizing:border-box;margin:4px 0 12px}
label{font-size:13px;color:#52525b;font-weight:600}
.meta{color:#52525b;font-size:13px}
.price{font-size:28px;font-weight:800}
.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px;border-radius:8px;margin:12px 0;font-size:14px}
.ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:12px;border-radius:8px;margin:12px 0;font-size:14px}
.steps{display:flex;gap:8px;margin:16px 0;font-size:13px}
.step{padding:6px 12px;border-radius:20px;background:#e4e4e7;color:#52525b}
.step.on{background:#18181b;color:#fff}
pre.out{background:#18181b;color:#a7f3d0;padding:12px;border-radius:8px;font-size:12px;overflow:auto;white-space:pre-wrap}
</style>
</head><body>
<header class="top"><a href="/"><b>TheTravellers</b></a><a href="/book">Book</a><a href="/book/lookup">Find booking</a></header>
<div class="wrap">${body}</div></body></html>`;

const steps = (n: number) => `<div class="steps">
  <span class="step${n === 1 ? " on" : ""}">1 · Trip</span>
  <span class="step${n === 2 ? " on" : ""}">2 · Fare</span>
  <span class="step${n === 3 ? " on" : ""}">3 · Details</span>
  <span class="step${n === 4 ? " on" : ""}">4 · Done</span></div>`;

export function registerBookingUi(app: FastifyInstance, deps: { db: Repositories }) {
  const routeService = createRouteService(deps);
  const packageService = createPackageService(deps);
  const tourService = createLocalTourService(deps);

  // Step 1: choose what to book
  app.get("/book", async (_req: FastifyRequest, reply: FastifyReply) => {
    const [routes, packages, tours, fleets] = await Promise.all([
      routeService.listPublishedRoutes({ limit: 100 }),
      packageService.listPublishedPackages({ limit: 100 }),
      tourService.listPublishedLocalTours({ limit: 100 }),
      deps.db.fleets.list(),
    ]);
    const routeOpts = routes.map((r) => `<option value="route:${esc(r.slug)}">${esc(r.originCity)} → ${esc(r.destinationCity)} (${esc(r.tripType)})</option>`).join("");
    const pkgOpts = packages.map((p) => `<option value="package:${esc(p.slug)}">${esc(p.title)}</option>`).join("");
    const tourOpts = tours.map((t) => `<option value="tour:${esc(t.slug)}">${esc(t.title)} — ${esc(t.city)}</option>`).join("");
    const fleetOpts = fleets.filter((f) => f.isActive).map((f) => `<option value="${esc(f.code)}">${esc(f.name)}</option>`).join("");
    return reply.type("text/html").send(shell("Book a cab", `
      ${steps(1)}
      <h1>Book your trip</h1>
      <div class="card"><form method="POST" action="/book/quote">
        <label>What are you booking?</label>
        <select name="selection"><option value="">— Custom trip (enter cities below) —</option>
          <optgroup label="Routes">${routeOpts}</optgroup>
          <optgroup label="Packages">${pkgOpts}</optgroup>
          <optgroup label="Local tours">${tourOpts}</optgroup></select>
        <label>Fleet</label><select name="vehicleTier">${fleetOpts}</select>
        <label>Pickup city</label><input name="originName" placeholder="e.g. Agra" required>
        <label>Drop city</label><input name="destinationName" placeholder="e.g. Delhi" required>
        <label>Trip type</label><select name="tripType"><option value="one-way">One-way</option><option value="round-trip">Round trip</option></select>
        <label>Pickup date & time</label><input type="datetime-local" name="pickupDatetime" required>
        <button class="btn" type="submit">Get fare →</button>
      </form></div>`));
  });

  // Step 2: fare quote (posts to the real fare API server-side, shows breakdown)
  app.post("/book/quote", async (request: FastifyRequest, reply: FastifyReply) => {
    const b = request.body as Record<string, string>;
    const fareService = createFareService("v1", deps.db);
    const [kind, slug] = String(b.selection ?? "").split(":");
    let packageId: string | undefined;
    let tripType = b.tripType === "round-trip" ? "round-trip" : "one-way";
    let bookingSelection: Record<string, unknown> | undefined;
    if (kind === "route" && slug) {
      const r = await routeService.getPublishedRoute(slug).catch(() => null);
      if (r?.route) {
        tripType = r.route.tripType;
        bookingSelection = { kind: "route", id: r.route.id, source: "catalog", slug: r.route.slug, tripType, pickupLocation: r.route.originCity, name: `${r.route.originCity} to ${r.route.destinationCity}` };
      }
    } else if (kind === "package" && slug) {
      const p = await packageService.getPublishedPackage(slug).catch(() => null);
      if (p?.package) { packageId = p.package.slug; tripType = "one-way"; bookingSelection = { kind: "package", id: p.package.id, source: "catalog", slug: p.package.slug, tripType, pickupLocation: p.package.title, name: p.package.title }; }
    } else if (kind === "tour" && slug) {
      const t = await tourService.getPublishedLocalTour(slug).catch(() => null);
      if (t?.tour) { packageId = t.tour.slug; tripType = "local-tour"; bookingSelection = { kind: "local", id: t.tour.id, source: "catalog", slug: t.tour.slug, tripType, pickupLocation: t.tour.city, name: t.tour.title }; }
    }
    let quote: Record<string, unknown> | null = null;
    let quoteError: string | null = null;
    try {
      const q = await fareService.calculate({
        tripType: tripType as "one-way" | "round-trip" | "local-tour",
        vehicleTier: b.vehicleTier as "sedan" | "ertiga" | "innova-crysta" | "tempo-traveller" | "urbania",
        originName: String(b.originName),
        destinationName: String(b.destinationName),
        packageId,
        pickupDatetime: new Date(String(b.pickupDatetime)).toISOString(),
      });
      quote = q as unknown as Record<string, unknown>;
    } catch (e) {
      quoteError = e instanceof Error ? e.message : "Fare calculation failed.";
    }
    const sel = encodeURIComponent(JSON.stringify({ bookingSelection, vehicleTier: b.vehicleTier, originName: b.originName, destinationName: b.destinationName, pickupDatetime: b.pickupDatetime, tripType, packageId }));
    return reply.type("text/html").send(shell("Fare quote", `
      ${steps(2)}
      <h1>Your fare</h1>
      ${quoteError ? `<div class="err">${esc(quoteError)}</div><p><a href="/book">← Try again</a></p>`
        : `<div class="card"><div class="price">₹${Number(quote!.total ?? quote!.baseFare).toLocaleString("en-IN")}</div>
        <p class="meta">${esc(b.originName)} → ${esc(b.destinationName)} · ${esc(b.vehicleTier)} · ${esc(tripType)}</p>
        <details><summary class="meta">Fare breakdown</summary><pre class="out">${esc(JSON.stringify(quote, null, 1))}</pre></details></div>
        <div class="card"><h3 style="margin-top:0">Your details</h3>
        <form method="POST" action="/book/confirm">
          <input type="hidden" name="sel" value="${sel}">
          <label>Full name</label><input name="customerName" required minlength="2">
          <label>Phone (10-digit mobile)</label><input name="customerPhone" required pattern="[0-9]{10}">
          <label>Email (optional)</label><input name="customerEmail" type="email">
          <label>Pickup address</label><input name="pickupAddress" required minlength="5">
          <button class="btn" type="submit">Confirm booking →</button>
        </form></div>`}`));
  });

  // Step 3→4: create the booking draft, show the ticket
  app.post("/book/confirm", async (request: FastifyRequest, reply: FastifyReply) => {
    const b = request.body as Record<string, string>;
    const sel = JSON.parse(decodeURIComponent(String(b.sel))) as {
      bookingSelection?: Record<string, unknown>; vehicleTier: string; originName: string;
      destinationName: string; pickupDatetime: string;
    };
    const fareService = createFareService("v1", deps.db);
    const bookingService = createBookingService({ db: deps.db, clock: systemClock, fareVersion: "v1", fareService });
    try {
      const parsed = CreateDraftBookingSchema.parse({
        bookingSelection: sel.bookingSelection,
        vehicleTier: sel.vehicleTier,
        pickupAddress: b.pickupAddress,
        pickupDatetime: new Date(sel.pickupDatetime).toISOString(),
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        ...(b.customerEmail ? { customerEmail: b.customerEmail } : {}),
      });
      const draft = await bookingService.createDraft(parsed, null);
      const ticket = draft.booking.ticketId;
      return reply.redirect(`/book/success?ticket=${encodeURIComponent(ticket)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Booking failed.";
      return reply.type("text/html").send(shell("Booking failed", `${steps(3)}<h1>Something went wrong</h1><div class="err">${esc(msg)}</div><p><a href="/book">← Start over</a></p>`));
    }
  });

  // Step 4: success / ticket page
  app.get("/book/success", async (request: FastifyRequest, reply: FastifyReply) => {
    const ticket = String((request.query as Record<string, unknown>)?.ticket ?? "");
    if (!ticket) return reply.redirect("/book");
    let booking: Record<string, unknown> | null = null;
    try {
      booking = (await deps.db.bookings.getByTicketId(ticket)) as unknown as Record<string, unknown>;
    } catch { /* show ticket id anyway */ }
    return reply.type("text/html").send(shell("Booking confirmed", `
      ${steps(4)}
      <div class="ok"><b>Booking confirmed.</b> Your ticket id is <b>${esc(ticket)}</b>.</div>
      ${booking ? `<div class="card"><h3 style="margin-top:0">Ticket details</h3><pre class="out">${esc(JSON.stringify(booking, null, 1).slice(0, 2000))}</pre></div>` : ""}
      <p><a href="/book/lookup">Look up another booking →</a></p>`));
  });

  // Lookup: find a booking by ticket id
  app.get("/book/lookup", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.type("text/html").send(shell("Find booking", `
      <h1>Find your booking</h1>
      <div class="card"><form method="GET" action="/book/success">
        <label>Ticket id</label><input name="ticket" placeholder="e.g. AGR-20261008-1234" required>
        <button class="btn" type="submit">Look up</button>
      </form></div>`));
  });

  void baseUrl;
}
