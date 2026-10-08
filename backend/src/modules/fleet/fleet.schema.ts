import { z } from "zod";

// Slice 1: Fleet Master (doc §7). Canonical fleet identity only — no pricing here.
// Pricing lives in fleet_fare_rules, owned by the pricing domain.
export const FleetCodeSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]+$/, "fleet code must be kebab-case"),
});

export const UpdateFleetSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    seats: z.number().int().min(1).max(60).optional(),
    luggageCapacity: z.number().int().min(0).max(60).optional(),
    imageUrl: z.string().url().max(500).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strip();

export const FleetFareRuleVersionParamSchema = z.object({
  version: z.string().min(1).max(20),
  fleetCode: z.string().regex(/^[a-z0-9-]+$/),
});

export const UpsertFleetFareRuleSchema = z
  .object({
    perKm: z.number().positive().max(1000),
    driverAllowance: z.number().min(0).max(100000),
    nightAllowance: z.number().min(0).max(100000),
  })
  .strip();

export type UpdateFleetInput = z.infer<typeof UpdateFleetSchema>;
export type UpsertFleetFareRuleInput = z.infer<typeof UpsertFleetFareRuleSchema>;
