import type { FastifyRequest, FastifyReply } from "fastify";
import { requireUser } from "../../middlewares/authGuard.js";
import { sendSuccess } from "../../middlewares/errorHandler.js";
import { ADMIN_ROLES, requireRole } from "../../middlewares/roleGuard.js";
import {
  FleetCodeSchema,
  FleetFareRuleVersionParamSchema,
  UpdateFleetSchema,
  UpsertFleetFareRuleSchema,
} from "./fleet.schema.js";
import type { createFleetService } from "./fleet.service.js";

export function createFleetController(service: ReturnType<typeof createFleetService>) {
  return {
    async listFleets(request: FastifyRequest, reply: FastifyReply) {
      requireUser(request);
      requireRole(request, ADMIN_ROLES);
      return sendSuccess(reply, { items: await service.listFleets() });
    },

    async updateFleet(request: FastifyRequest, reply: FastifyReply) {
      requireUser(request);
      requireRole(request, ADMIN_ROLES);
      const { code } = FleetCodeSchema.parse(request.params);
      const body = UpdateFleetSchema.parse(request.body);
      return sendSuccess(reply, await service.updateFleet(code, body));
    },

    async listVersionFleetRules(request: FastifyRequest, reply: FastifyReply) {
      requireUser(request);
      requireRole(request, ADMIN_ROLES);
      const { version } = FleetFareRuleVersionParamSchema.pick({ version: true }).parse(request.params);
      return sendSuccess(reply, await service.listVersionFleetRules(version));
    },

    async upsertVersionFleetRule(request: FastifyRequest, reply: FastifyReply) {
      requireUser(request);
      requireRole(request, ADMIN_ROLES);
      const { version, fleetCode } = FleetFareRuleVersionParamSchema.parse(request.params);
      const body = UpsertFleetFareRuleSchema.parse(request.body);
      return sendSuccess(reply, await service.upsertVersionFleetRule(version, fleetCode, body));
    },
  };
}
