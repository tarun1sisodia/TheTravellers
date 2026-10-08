import type { Repositories, RouteRecord, RouteStatus } from "../../db/types.js";
import { Errors } from "../../shared/errors.js";
import { toIso } from "../../shared/clock.js";
import { newId } from "../../shared/ids.js";
import type { CreateRouteInput, UpdateRouteInput } from "./route.schema.js";

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// isNew is DERIVED (doc decision): published recently and inside the new window.
// Default window is 30 days from published_at; admin can override via new_until.
export function isRouteNew(route: RouteRecord, now: Date = new Date()): boolean {
  if (route.status !== "published" || !route.publishedAt) return false;
  const published = new Date(route.publishedAt).getTime();
  const until = route.newUntil
    ? new Date(route.newUntil).getTime()
    : published + 30 * 24 * 60 * 60 * 1000;
  const t = now.getTime();
  return t >= published && t < until;
}

export function createRouteService(deps: { db: Repositories }) {
  const { db } = deps;

  const publicShape = (route: RouteRecord, now: Date) => ({
    ...route,
    isNew: isRouteNew(route, now),
  });

  return {
    // ---------------------------------------------------------------- admin
    async listRoutes(filter: { status?: RouteStatus; featured?: boolean; q?: string }) {
      return db.routes.list(filter);
    },

    async getRoute(id: string) {
      const route = await db.routes.get(id);
      if (!route) throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
      const [fleetFares, charges] = await Promise.all([
        db.routes.listFleetFares(id),
        db.routes.listCharges(id),
      ]);
      return { ...route, fleetFares, charges };
    },

    async createRoute(input: CreateRouteInput) {
      const origin = slugify(input.originCity);
      const dest = slugify(input.destinationCity);
      const slug = input.slug ?? `${origin}-to-${dest}-${input.tripType ?? "one-way"}`;
      const now = toIso(new Date());
      try {
        return await db.routes.create({
          id: newId(),
          slug,
          originCity: input.originCity.trim(),
          destinationCity: input.destinationCity.trim(),
          corridor: `${origin}-${dest}`,
          tripType: input.tripType ?? "one-way",
          distanceKm: input.distanceKm ?? null,
          durationText: input.durationText ?? null,
          status: "draft",
          isFeatured: input.isFeatured ?? false,
          featuredOrder: input.featuredOrder ?? null,
          publishedAt: null,
          newUntil: null,
          metaTitle: input.metaTitle ?? null,
          metaDescription: input.metaDescription ?? null,
          heroImageUrl: input.heroImageUrl ?? null,
          gallery: input.gallery ?? [],
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        throw Errors.conflict("ROUTE_CONFLICT", "A route with this slug or corridor already exists.");
      }
    },

    async updateRoute(id: string, patch: UpdateRouteInput) {
      const existing = await db.routes.get(id);
      if (!existing) throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
      // Slug change → persistent 301 redirect (doc: add before URLs change)
      if (patch.slug && patch.slug !== existing.slug) {
        await db.slugRedirects.put(existing.slug, "route", patch.slug);
      }
      // Strip undefined so partial patches never wipe existing values
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries({
        ...patch,
        originCity: patch.originCity?.trim(),
        destinationCity: patch.destinationCity?.trim(),
      })) {
        if (v !== undefined) clean[k] = v;
      }
      try {
        const updated = await db.routes.update(id, clean);
        if (!updated) throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
        return updated;
      } catch (err) {
        if (err instanceof Error && /slug|corridor|unique/i.test(err.message)) {
          throw Errors.conflict("ROUTE_CONFLICT", "A route with this slug or corridor already exists.");
        }
        throw err;
      }
    },

    async publishRoute(id: string) {
      const existing = await db.routes.get(id);
      if (!existing) throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
      const now = new Date();
      const updated = await db.routes.update(id, {
        status: "published",
        publishedAt: existing.publishedAt ?? toIso(now),
      });
      return updated!;
    },

    async archiveRoute(id: string) {
      const existing = await db.routes.get(id);
      if (!existing) throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
      // Content rollback = unpublish/archive. No deploy, no data loss.
      return (await db.routes.update(id, { status: "archived" }))!;
    },

    async upsertRouteFleetFare(
      id: string,
      fleetCode: string,
      values: { oneWayFareInr?: number | null; roundTripFareInr?: number | null },
    ) {
      const existing = await db.routes.get(id);
      if (!existing) throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
      const fleet = await db.fleets.get(fleetCode);
      if (!fleet) throw Errors.notFound("FLEET_NOT_FOUND", `Fleet '${fleetCode}' not found.`);
      return db.routes.upsertFleetFare(id, fleetCode, values);
    },

    async addRouteCharge(
      id: string,
      charge: { kind: "toll" | "interstate" | "driver" | "night_halt" | "other"; amountInr: number; appliesTo?: string; note?: string | null },
    ) {
      const existing = await db.routes.get(id);
      if (!existing) throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
      return db.routes.addCharge(id, charge);
    },

    async deleteRouteCharge(_id: string, chargeId: string) {
      const ok = await db.routes.deleteCharge(chargeId);
      if (!ok) throw Errors.notFound("ROUTE_CHARGE_NOT_FOUND", "Charge not found.");
      return { deleted: true };
    },

    // --------------------------------------------------------------- public
    async listPublishedRoutes(opts: { featured?: boolean; limit: number }) {
      const now = new Date();
      const rows = await db.routes.list({
        status: "published",
        featured: opts.featured,
      });
      return rows.slice(0, opts.limit).map((r) => publicShape(r, now));
    },

    async getPublishedRoute(slug: string) {
      // Old slug → 301 target
      const direct = await db.routes.getBySlug(slug);
      if (direct && direct.status === "published") {
        const now = new Date();
        const [fleetFares, charges] = await Promise.all([
          db.routes.listFleetFares(direct.id),
          db.routes.listCharges(direct.id),
        ]);
        return { route: publicShape(direct, now), fleetFares, charges, redirect: null as string | null };
      }
      const redir = await db.slugRedirects.get(slug);
      if (redir && redir.entityType === "route") {
        return { route: null, fleetFares: [], charges: [], redirect: redir.newSlug };
      }
      throw Errors.notFound("ROUTE_NOT_FOUND", "Route not found.");
    },

    async getPublishedRouteByCorridor(corridor: string, tripType: string) {
      return db.routes.getByCorridor(corridor, tripType);
    },
  };
}

export type RouteService = ReturnType<typeof createRouteService>;
