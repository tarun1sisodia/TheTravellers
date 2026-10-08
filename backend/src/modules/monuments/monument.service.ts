import type { Repositories, MonumentRecord, MonumentStatus } from "../../db/types.js";
import { Errors } from "../../shared/errors.js";
import { toIso } from "../../shared/clock.js";
import { newId } from "../../shared/ids.js";
import type { CreateMonumentInput, UpdateMonumentInput } from "./monument.schema.js";

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function isMonumentNew(monument: MonumentRecord, now: Date = new Date()): boolean {
  if (monument.status !== "published" || !monument.publishedAt) return false;
  const published = new Date(monument.publishedAt).getTime();
  const until = monument.newUntil
    ? new Date(monument.newUntil).getTime()
    : published + 30 * 24 * 60 * 60 * 1000;
  const t = now.getTime();
  return t >= published && t < until;
}

export function createMonumentService(deps: { db: Repositories }) {
  const { db } = deps;

  const publicShape = (monument: MonumentRecord, now: Date) => ({ ...monument, isNew: isMonumentNew(monument, now) });

  const clean = (patch: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
    return out;
  };

  return {
    // ---------------------------------------------------------------- admin
    async listMonuments(filter: { status?: MonumentStatus; featured?: boolean; q?: string; city?: string }) {
      return db.monuments.list(filter);
    },

    async getMonument(id: string) {
      const monument = await db.monuments.get(id);
      if (!monument) throw Errors.notFound("MONUMENT_NOT_FOUND", "Monument not found.");
      return monument;
    },

    async createMonument(input: CreateMonumentInput) {
      const slug = input.slug ?? slugify(input.name);
      const code = input.code ?? `MON-${slugify(input.name).slice(0, 24).toUpperCase().replace(/-/g, "")}`;
      const now = toIso(new Date());
      try {
        return await db.monuments.create({
          id: newId(),
          slug,
          code,
          name: input.name.trim(),
          city: input.city.trim(),
          entryFeeIndianInr: input.entryFeeIndianInr ?? null,
          entryFeeForeignerInr: input.entryFeeForeignerInr ?? null,
          timings: input.timings ?? null,
          closedDays: input.closedDays ?? null,
          description: input.description ?? null,
          status: "draft",
          isFeatured: input.isFeatured ?? false,
          featuredOrder: input.featuredOrder ?? null,
          publishedAt: null,
          newUntil: input.newUntil ?? null,
          metaTitle: input.metaTitle ?? null,
          metaDescription: input.metaDescription ?? null,
          heroImageUrl: input.heroImageUrl ?? null,
          gallery: input.gallery ?? [],
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        throw Errors.conflict("MONUMENT_CONFLICT", "A monument with this slug or code already exists.");
      }
    },

    async updateMonument(id: string, patch: UpdateMonumentInput) {
      const existing = await db.monuments.get(id);
      if (!existing) throw Errors.notFound("MONUMENT_NOT_FOUND", "Monument not found.");
      if (patch.slug && patch.slug !== existing.slug) {
        await db.slugRedirects.put(existing.slug, "monument", patch.slug);
      }
      try {
        const updated = await db.monuments.update(id, clean(patch as Record<string, unknown>));
        if (!updated) throw Errors.notFound("MONUMENT_NOT_FOUND", "Monument not found.");
        return updated;
      } catch (err) {
        if (err instanceof Error && /slug|code|unique/i.test(err.message)) {
          throw Errors.conflict("MONUMENT_CONFLICT", "A monument with this slug or code already exists.");
        }
        throw err;
      }
    },

    async publishMonument(id: string) {
      const existing = await db.monuments.get(id);
      if (!existing) throw Errors.notFound("MONUMENT_NOT_FOUND", "Monument not found.");
      const updated = await db.monuments.update(id, {
        status: "published",
        publishedAt: existing.publishedAt ?? toIso(new Date()),
      });
      return updated!;
    },

    async archiveMonument(id: string) {
      const existing = await db.monuments.get(id);
      if (!existing) throw Errors.notFound("MONUMENT_NOT_FOUND", "Monument not found.");
      return (await db.monuments.update(id, { status: "archived" }))!;
    },

    // --------------------------------------------------------------- public
    async listPublishedMonuments(opts: { featured?: boolean; city?: string; limit: number }) {
      const now = new Date();
      const rows = await db.monuments.list({ status: "published", featured: opts.featured, city: opts.city });
      return rows.slice(0, opts.limit).map((r) => publicShape(r, now));
    },

    async getPublishedMonument(slug: string) {
      const direct = await db.monuments.getBySlug(slug);
      if (direct && direct.status === "published") {
        const now = new Date();
        // Transport context resolves through route/corridor pricing:
        // published local tours in the monument's city + published routes
        // touching the city. No separate monument pricing engine.
        const [tours, routes] = await Promise.all([
          db.localTours.list({ status: "published", city: direct.city }),
          db.routes.list({ status: "published" }),
        ]);
        const corridorRoutes = routes
          .filter((r) => r.originCity.toLowerCase() === direct.city.toLowerCase() || r.destinationCity.toLowerCase() === direct.city.toLowerCase())
          .slice(0, 8);
        return {
          monument: publicShape(direct, now),
          transport: {
            localTours: tours.slice(0, 6).map((t) => ({ slug: t.slug, title: t.title, city: t.city })),
            routes: corridorRoutes.map((r) => ({ slug: r.slug, title: `${r.originCity} → ${r.destinationCity}` })),
          },
          redirect: null as string | null,
        };
      }
      const redir = await db.slugRedirects.get(slug);
      if (redir && redir.entityType === "monument") {
        return { monument: null, transport: null, redirect: redir.newSlug };
      }
      throw Errors.notFound("MONUMENT_NOT_FOUND", "Monument not found.");
    },
  };
}

export type MonumentService = ReturnType<typeof createMonumentService>;
