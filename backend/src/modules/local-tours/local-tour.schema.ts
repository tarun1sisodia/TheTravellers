import { z } from "zod";

// Slice 4: Local tours content domain. Own pricing context: fixed
// per-fleet base prices + extra km/hour overage rates.

export const LocalTourStatusSchema = z.enum(["draft", "published", "archived"]);

const ItineraryDaySchema = z.object({
  day: z.number().int().min(1).max(60),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const CreateLocalTourSchema = z
  .object({
    title: z.string().min(1).max(200),
    code: z.string().regex(/^[A-Z0-9-]+$/).max(40).optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
    tagline: z.string().max(300).optional(),
    city: z.string().min(1).max(120),
    durationHours: z.number().int().min(1).max(48).optional(),
    distanceKm: z.number().int().min(1).max(2000).optional(),
    durationText: z.string().max(120).optional(),
    extraKmRateInr: z.number().min(0).max(10000).optional(),
    extraHourRateInr: z.number().min(0).max(100000).optional(),
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

export const UpdateLocalTourSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
    tagline: z.string().max(300).nullable().optional(),
    city: z.string().min(1).max(120).optional(),
    durationHours: z.number().int().min(1).max(48).nullable().optional(),
    distanceKm: z.number().int().min(1).max(2000).nullable().optional(),
    durationText: z.string().max(120).nullable().optional(),
    extraKmRateInr: z.number().min(0).max(10000).nullable().optional(),
    extraHourRateInr: z.number().min(0).max(100000).nullable().optional(),
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

export const LocalTourIdParamSchema = z.object({ id: z.string().uuid() });
export const LocalTourSlugParamSchema = z.object({ slug: z.string().min(1).max(160) });

export const ListLocalToursQuerySchema = z
  .object({
    status: LocalTourStatusSchema.optional(),
    featured: z.enum(["true", "false"]).optional(),
    city: z.string().max(120).optional(),
    q: z.string().max(120).optional(),
  })
  .strip();

export const PublicLocalToursQuerySchema = z
  .object({
    featured: z.enum(["true", "false"]).optional(),
    city: z.string().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strip();

export const UpsertLocalTourFleetPriceSchema = z
  .object({ priceInr: z.number().positive().max(10000000) })
  .strip();

export type CreateLocalTourInput = z.infer<typeof CreateLocalTourSchema>;
export type UpdateLocalTourInput = z.infer<typeof UpdateLocalTourSchema>;
