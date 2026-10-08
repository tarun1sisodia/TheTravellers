import type { Repositories, FleetRecord } from "../../db/types.js";
import { Errors } from "../../shared/errors.js";
import { toIso } from "../../shared/clock.js";
import { newId } from "../../shared/ids.js";
import type { UpdateFleetInput, UpsertFleetFareRuleInput } from "./fleet.schema.js";

// Slice 1: Fleet Master application service.
// Owns fleet identity (code/name/seats/...) — never pricing math.
export function createFleetService(deps: { db: Repositories }) {
  const { db } = deps;

  return {
    async listFleets(): Promise<FleetRecord[]> {
      return db.fleets.list();
    },

    async updateFleet(code: string, patch: UpdateFleetInput): Promise<FleetRecord> {
      const updated = await db.fleets.update(code, patch);
      if (!updated) throw Errors.notFound("FLEET_NOT_FOUND", `Fleet '${code}' not found.`);
      return updated;
    },

    async listVersionFleetRules(version: string) {
      const rule = await db.fareRules.getByVersion(version);
      if (!rule) throw Errors.notFound("FARE_VERSION_NOT_FOUND", `Fare version '${version}' not found.`);
      const rows = await db.fleetFareRules.listByFareRuleId(rule.id);
      return { version: rule.version, isActive: rule.isActive, fleetRules: rows };
    },

    async upsertVersionFleetRule(version: string, fleetCode: string, values: UpsertFleetFareRuleInput) {
      const rule = await db.fareRules.getByVersion(version);
      if (!rule) throw Errors.notFound("FARE_VERSION_NOT_FOUND", `Fare version '${version}' not found.`);
      const fleet = await db.fleets.get(fleetCode);
      if (!fleet) throw Errors.notFound("FLEET_NOT_FOUND", `Fleet '${fleetCode}' not found.`);
      return db.fleetFareRules.upsert(rule.id, fleetCode, values);
    },

    // Creates a new fare-rule version carrying forward the current fleet rules.
    // The new version starts inactive; activate via the admin fare-rules endpoint.
    async createVersionFromActive(version: string) {
      const active = await db.fareRules.getActive();
      const now = toIso(new Date());
      const record = await db.fareRules.save({
        id: newId(),
        version,
        config: active?.config ?? {},
        effectiveFrom: now,
        effectiveTo: null,
        isActive: false,
        createdAt: now,
        nightStartHour: active?.nightStartHour ?? null,
        nightEndHour: active?.nightEndHour ?? null,
        minKmPerDay: active?.minKmPerDay ?? null,
        sameDayRoundMultiplier: active?.sameDayRoundMultiplier ?? null,
      });
      if (active) {
        const rows = await db.fleetFareRules.listByFareRuleId(active.id);
        for (const r of rows) {
          await db.fleetFareRules.upsert(record.id, r.fleetCode, {
            perKm: r.perKm,
            driverAllowance: r.driverAllowance,
            nightAllowance: r.nightAllowance,
          });
        }
      }
      return record;
    },
  };
}

export type FleetService = ReturnType<typeof createFleetService>;
