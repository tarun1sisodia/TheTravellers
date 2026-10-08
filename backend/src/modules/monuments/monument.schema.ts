import { z } from "zod";

// Slice 5: Monuments content domain. Monument transport resolves through
// route/corridor pricing (routes + local tours) — there is deliberately NO
// separate monument pricing engine.

export const MonumentStatusSchema = z.enum(["draft", "published", "archived"]);

export const CreateMonumentSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().min(1).max(120),
  code: z.string().regex(/^[A-Z0-9-]+$/).max(40).optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160).optional(),
  entryFeeIndianInr: z.number().nonnegative().max(100000).optional(),
  entryFeeForeignerInr: z.number().nonnegative().max(100000).optional(),
  timings: z.string().max(200).optional(),
  closedDays: z.string().max(200).optional(),
  description: z.string().max(20000).optional(),
  heroImageUrl: z.string().url().max(500).optional(),
  gallery: z.array(z.string().url().max(500)).max(20).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(400).optional(),
  isFeatured: z.boolean().optional(),
  featuredOrder: z.number().int().optional(),
  newUntil: z.string().datetime().optional(),
});

export const UpdateMonumentSchema = CreateMonumentSchema.partial().extend({
  status: MonumentStatusSchema.optional(),
});

export const MonumentQuerySchema = z.object({
  status: MonumentStatusSchema.optional(),
  city: z.string().max(120).optional(),
  featured: z.enum(["true", "false"]).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateMonumentInput = z.infer<typeof CreateMonumentSchema>;
export type UpdateMonumentInput = z.infer<typeof UpdateMonumentSchema>;
