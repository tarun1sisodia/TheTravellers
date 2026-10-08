import type { Repositories, LocalTourRecord, LocalTourStatus } from "../../db/types.js";
import { Errors } from "../../shared/errors.js";
import { toIso } from "../../shared/clock.js";
import { newId } from "../../shared/ids.js";
import type { CreateLocalTourInput, UpdateLocalTourInput } from "./local-tour.schema.js";

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function isLocalTourNew(tour: LocalTourRecord, now: Date = new Date()): boolean {
  if (tour.status !== "published" || !tour.publishedAt) return false;
  const published = new Date(tour.publishedAt).getTime();
  const until = tour.newUntil
    ? new Date(tour.newUntil).getTime()
    : published + 30 * 24 * 60 * 60 * 1000;
  const t = now.getTime();
  return t >= published && t < until;
}

export function createLocalTourService(deps: { db: Repositories }) {
  const { db } = deps;

  const publicShape = (tour: LocalTourRecord, now: Date) => ({ ...tour, isNew: isLocalTourNew(tour, now) });

  const clean = (patch: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
    return out;
  };

  return {
    // ---------------------------------------------------------------- admin
    async listLocalTours(filter: { status?: LocalTourStatus; featured?: boolean; q?: string; city?: string }) {
      return db.localTours.list(filter);
    },

    async getLocalTour(id: string) {
      const tour = await db.localTours.get(id);
      if (!tour) throw Errors.notFound("LOCAL_TOUR_NOT_FOUND", "Local tour not found.");
      const fleetPrices = await db.localTours.listFleetPrices(id);
      return { ...tour, fleetPrices };
    },

    async createLocalTour(input: CreateLocalTourInput) {
      const slug = input.slug ?? slugify(input.title);
      const code = input.code ?? `LTR-${slugify(input.title).slice(0, 24).toUpperCase().replace(/-/g, "")}`;
      const now = toIso(new Date());
      try {
        return await db.localTours.create({
          id: newId(),
          slug,
          code,
          title: input.title.trim(),
          tagline: input.tagline ?? null,
          city: input.city.trim(),
          durationHours: input.durationHours ?? null,
          distanceKm: input.distanceKm ?? null,
          durationText: input.durationText ?? null,
          extraKmRateInr: input.extraKmRateInr ?? null,
          extraHourRateInr: input.extraHourRateInr ?? null,
          itinerary: input.itinerary ?? [],
          inclusions: input.inclusions ?? [],
          exclusions: input.exclusions ?? [],
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
        throw Errors.conflict("LOCAL_TOUR_CONFLICT", "A local tour with this slug or code already exists.");
      }
    },

    async updateLocalTour(id: string, patch: UpdateLocalTourInput) {
      const existing = await db.localTours.get(id);
      if (!existing) throw Errors.notFound("LOCAL_TOUR_NOT_FOUND", "Local tour not found.");
      if (patch.slug && patch.slug !== existing.slug) {
        await db.slugRedirects.put(existing.slug, "tour", patch.slug);
      }
      try {
        const updated = await db.localTours.update(id, clean(patch as Record<string, unknown>));
        if (!updated) throw Errors.notFound("LOCAL_TOUR_NOT_FOUND", "Local tour not found.");
        return updated;
      } catch (err) {
        if (err instanceof Error && /slug|code|unique/i.test(err.message)) {
          throw Errors.conflict("LOCAL_TOUR_CONFLICT", "A local tour with this slug or code already exists.");
        }
        throw err;
      }
    },

    async publishLocalTour(id: string) {
      const existing = await db.localTours.get(id);
      if (!existing) throw Errors.notFound("LOCAL_TOUR_NOT_FOUND", "Local tour not found.");
      const updated = await db.localTours.update(id, {
        status: "published",
        publishedAt: existing.publishedAt ?? toIso(new Date()),
      });
      return updated!;
    },

    async archiveLocalTour(id: string) {
      const existing = await db.localTours.get(id);
      if (!existing) throw Errors.notFound("LOCAL_TOUR_NOT_FOUND", "Local tour not found.");
      return (await db.localTours.update(id, { status: "archived" }))!;
    },

    async upsertLocalTourFleetPrice(id: string, fleetCode: string, priceInr: number) {
      const existing = await db.localTours.get(id);
      if (!existing) throw Errors.notFound("LOCAL_TOUR_NOT_FOUND", "Local tour not found.");
      const fleet = await db.fleets.get(fleetCode);
      if (!fleet) throw Errors.notFound("FLEET_NOT_FOUND", `Fleet '${fleetCode}' not found.`);
      return db.localTours.upsertFleetPrice(id, fleetCode, priceInr);
    },

    // --------------------------------------------------------------- public
    async listPublishedLocalTours(opts: { featured?: boolean; city?: string; limit: number }) {
      const now = new Date();
      const rows = await db.localTours.list({ status: "published", featured: opts.featured, city: opts.city });
      return rows.slice(0, opts.limit).map((r) => publicShape(r, now));
    },

    async getPublishedLocalTour(slug: string) {
      const direct = await db.localTours.getBySlug(slug);
      if (direct && direct.status === "published") {
        const now = new Date();
        const fleetPrices = await db.localTours.listFleetPrices(direct.id);
        return { tour: publicShape(direct, now), fleetPrices, redirect: null as string | null };
      }
      const redir = await db.slugRedirects.get(slug);
      if (redir && redir.entityType === "tour") {
        return { tour: null, fleetPrices: [], redirect: redir.newSlug };
      }
      throw Errors.notFound("LOCAL_TOUR_NOT_FOUND", "Local tour not found.");
    },
  };
}

export type LocalTourService = ReturnType<typeof createLocalTourService>;
