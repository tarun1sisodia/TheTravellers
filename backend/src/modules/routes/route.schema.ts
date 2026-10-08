import { z } from "zod";

// Slice 2: Routes content domain (doc §22). Admin creates records;
// reusable templates render published records.

export const RouteTripTypeSchema = z.enum(["one-way", "round-trip"]);
export const RouteStatusSchema = z.enum(["draft", "published", "archived"]);

export const CreateRouteSchema = z
  .object({
    originCity: z.string().min(1).max(120),
    destinationCity: z.string().min(1).max(120),
    tripType: RouteTripTypeSchema.default("one-way"),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
    distanceKm: z.number().int().positive().max(10000).optional(),
    durationText: z.string().max(120).optional(),
    isFeatured: z.boolean().optional(),
    featuredOrder: z.number().int().min(0).optional(),
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(400).optional(),
    heroImageUrl: z.string().url().max(500).optional(),
    gallery: z.array(z.string().url().max(500)).max(20).optional(),
  })
  .strip();

export const UpdateRouteSchema = z
  .object({
    originCity: z.string().min(1).max(120).optional(),
    destinationCity: z.string().min(1).max(120).optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
    distanceKm: z.number().int().positive().max(10000).nullable().optional(),
    durationText: z.string().max(120).nullable().optional(),
    isFeatured: z.boolean().optional(),
    featuredOrder: z.number().int().min(0).nullable().optional(),
    newUntil: z.string().datetime().nullable().optional(),
    metaTitle: z.string().max(200).nullable().optional(),
    metaDescription: z.string().max(400).nullable().optional(),
    heroImageUrl: z.string().url().max(500).nullable().optional(),
    gallery: z.array(z.string().url().max(500)).max(20).optional(),
  })
  .strip();

export const RouteIdParamSchema = z.object({ id: z.string().uuid() });
export const RouteSlugParamSchema = z.object({ slug: z.string().min(1).max(160) });

export const ListRoutesQuerySchema = z
  .object({
    status: RouteStatusSchema.optional(),
    featured: z.enum(["true", "false"]).optional(),
    q: z.string().max(120).optional(),
  })
  .strip();

export const PublicRoutesQuerySchema = z
  .object({
    featured: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strip();

export const UpsertRouteFleetFareSchema = z
  .object({
    oneWayFareInr: z.number().positive().max(1000000).nullable().optional(),
    roundTripFareInr: z.number().positive().max(1000000).nullable().optional(),
  })
  .strip();

export const AddRouteChargeSchema = z
  .object({
    kind: z.enum(["toll", "interstate", "driver", "night_halt", "other"]),
    amountInr: z.number().min(0).max(1000000),
    appliesTo: z.string().max(40).default("all"),
    note: z.string().max(500).optional(),
  })
  .strip();

export const RouteChargeIdParamSchema = z.object({ chargeId: z.string().uuid() });

export type CreateRouteInput = z.infer<typeof CreateRouteSchema>;
export type UpdateRouteInput = z.infer<typeof UpdateRouteSchema>;
