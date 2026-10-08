import { z } from "zod";

// Slice 3: Packages content domain. Fixed per-fleet prices, isolated from
// route-rate changes. Admin creates records; templates render them.

export const PackageStatusSchema = z.enum(["draft", "published", "archived"]);

const ItineraryDaySchema = z.object({
  day: z.number().int().min(1).max(60),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const CreatePackageSchema = z
  .object({
    title: z.string().min(1).max(200),
    code: z.string().regex(/^[A-Z0-9-]+$/).max(40).optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
    tagline: z.string().max(300).optional(),
    originCity: z.string().max(120).optional(),
    corridor: z.string().regex(/^[a-z0-9-]+$/).max(120).optional(),
    durationDays: z.number().int().min(1).max(60).optional(),
    durationNights: z.number().int().min(0).max(60).optional(),
    durationText: z.string().max(120).optional(),
    itinerary: z.array(ItineraryDaySchema).max(60).optional(),
    inclusions: z.array(z.string().max(300)).max(40).optional(),
    exclusions: z.array(z.string().max(300)).max(40).optional(),
    isFeatured: z.boolean().optional(),
    featuredOrder: z.number().int().min(0).optional(),
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(400).optional(),
    heroImageUrl: z.string().url().max(500).optional(),
    gallery: z.array(z.string().url().max(500)).max(20).optional(),
  })
  .strip();

export const UpdatePackageSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
    tagline: z.string().max(300).nullable().optional(),
    originCity: z.string().max(120).nullable().optional(),
    corridor: z.string().regex(/^[a-z0-9-]+$/).max(120).nullable().optional(),
    durationDays: z.number().int().min(1).max(60).nullable().optional(),
    durationNights: z.number().int().min(0).max(60).nullable().optional(),
    durationText: z.string().max(120).nullable().optional(),
    itinerary: z.array(ItineraryDaySchema).max(60).optional(),
    inclusions: z.array(z.string().max(300)).max(40).optional(),
    exclusions: z.array(z.string().max(300)).max(40).optional(),
    isFeatured: z.boolean().optional(),
    featuredOrder: z.number().int().min(0).nullable().optional(),
    newUntil: z.string().datetime().nullable().optional(),
    metaTitle: z.string().max(200).nullable().optional(),
    metaDescription: z.string().max(400).nullable().optional(),
    heroImageUrl: z.string().url().max(500).nullable().optional(),
    gallery: z.array(z.string().url().max(500)).max(20).optional(),
  })
  .strip();

export const PackageIdParamSchema = z.object({ id: z.string().uuid() });
export const PackageSlugParamSchema = z.object({ slug: z.string().min(1).max(160) });

export const ListPackagesQuerySchema = z
  .object({
    status: PackageStatusSchema.optional(),
    featured: z.enum(["true", "false"]).optional(),
    q: z.string().max(120).optional(),
  })
  .strip();

export const PublicPackagesQuerySchema = z
  .object({
    featured: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strip();

export const UpsertPackageFleetPriceSchema = z
  .object({ priceInr: z.number().positive().max(10000000) })
  .strip();

export type CreatePackageInput = z.infer<typeof CreatePackageSchema>;
export type UpdatePackageInput = z.infer<typeof UpdatePackageSchema>;
