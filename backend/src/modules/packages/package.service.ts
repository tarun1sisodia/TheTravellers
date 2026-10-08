import type { Repositories, PackageRecord, PackageStatus } from "../../db/types.js";
import { Errors } from "../../shared/errors.js";
import { toIso } from "../../shared/clock.js";
import { newId } from "../../shared/ids.js";
import type { CreatePackageInput, UpdatePackageInput } from "./package.schema.js";

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function isPackageNew(pkg: PackageRecord, now: Date = new Date()): boolean {
  if (pkg.status !== "published" || !pkg.publishedAt) return false;
  const published = new Date(pkg.publishedAt).getTime();
  const until = pkg.newUntil
    ? new Date(pkg.newUntil).getTime()
    : published + 30 * 24 * 60 * 60 * 1000;
  const t = now.getTime();
  return t >= published && t < until;
}

export function createPackageService(deps: { db: Repositories }) {
  const { db } = deps;

  const publicShape = (pkg: PackageRecord, now: Date) => ({ ...pkg, isNew: isPackageNew(pkg, now) });

  const clean = (patch: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
    return out;
  };

  return {
    // ---------------------------------------------------------------- admin
    async listPackages(filter: { status?: PackageStatus; featured?: boolean; q?: string }) {
      return db.packages.list(filter);
    },

    async getPackage(id: string) {
      const pkg = await db.packages.get(id);
      if (!pkg) throw Errors.notFound("PACKAGE_NOT_FOUND", "Package not found.");
      const fleetPrices = await db.packages.listFleetPrices(id);
      return { ...pkg, fleetPrices };
    },

    async createPackage(input: CreatePackageInput) {
      const slug = input.slug ?? slugify(input.title);
      const code = input.code ?? `PKG-${slugify(input.title).slice(0, 24).toUpperCase().replace(/-/g, "")}`;
      const now = toIso(new Date());
      try {
        return await db.packages.create({
          id: newId(),
          slug,
          code,
          title: input.title.trim(),
          tagline: input.tagline ?? null,
          originCity: input.originCity ?? null,
          corridor: input.corridor ?? null,
          durationDays: input.durationDays ?? null,
          durationNights: input.durationNights ?? null,
          durationText: input.durationText ?? null,
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
        throw Errors.conflict("PACKAGE_CONFLICT", "A package with this slug or code already exists.");
      }
    },

    async updatePackage(id: string, patch: UpdatePackageInput) {
      const existing = await db.packages.get(id);
      if (!existing) throw Errors.notFound("PACKAGE_NOT_FOUND", "Package not found.");
      if (patch.slug && patch.slug !== existing.slug) {
        await db.slugRedirects.put(existing.slug, "package", patch.slug);
      }
      try {
        const updated = await db.packages.update(id, clean(patch as Record<string, unknown>));
        if (!updated) throw Errors.notFound("PACKAGE_NOT_FOUND", "Package not found.");
        return updated;
      } catch (err) {
        if (err instanceof Error && /slug|code|unique/i.test(err.message)) {
          throw Errors.conflict("PACKAGE_CONFLICT", "A package with this slug or code already exists.");
        }
        throw err;
      }
    },

    async publishPackage(id: string) {
      const existing = await db.packages.get(id);
      if (!existing) throw Errors.notFound("PACKAGE_NOT_FOUND", "Package not found.");
      const updated = await db.packages.update(id, {
        status: "published",
        publishedAt: existing.publishedAt ?? toIso(new Date()),
      });
      return updated!;
    },

    async archivePackage(id: string) {
      const existing = await db.packages.get(id);
      if (!existing) throw Errors.notFound("PACKAGE_NOT_FOUND", "Package not found.");
      return (await db.packages.update(id, { status: "archived" }))!;
    },

    async upsertPackageFleetPrice(id: string, fleetCode: string, priceInr: number) {
      const existing = await db.packages.get(id);
      if (!existing) throw Errors.notFound("PACKAGE_NOT_FOUND", "Package not found.");
      const fleet = await db.fleets.get(fleetCode);
      if (!fleet) throw Errors.notFound("FLEET_NOT_FOUND", `Fleet '${fleetCode}' not found.`);
      return db.packages.upsertFleetPrice(id, fleetCode, priceInr);
    },

    // --------------------------------------------------------------- public
    async listPublishedPackages(opts: { featured?: boolean; limit: number }) {
      const now = new Date();
      const rows = await db.packages.list({ status: "published", featured: opts.featured });
      return rows.slice(0, opts.limit).map((r) => publicShape(r, now));
    },

    async getPublishedPackage(slug: string) {
      const direct = await db.packages.getBySlug(slug);
      if (direct && direct.status === "published") {
        const now = new Date();
        const fleetPrices = await db.packages.listFleetPrices(direct.id);
        return { package: publicShape(direct, now), fleetPrices, redirect: null as string | null };
      }
      const redir = await db.slugRedirects.get(slug);
      if (redir && redir.entityType === "package") {
        return { package: null, fleetPrices: [], redirect: redir.newSlug };
      }
      throw Errors.notFound("PACKAGE_NOT_FOUND", "Package not found.");
    },
  };
}

export type PackageService = ReturnType<typeof createPackageService>;
