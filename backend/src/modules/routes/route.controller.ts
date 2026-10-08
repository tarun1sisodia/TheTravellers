import type { FastifyRequest, FastifyReply } from "fastify";
import { requireUser } from "../../middlewares/authGuard.js";
import { sendSuccess } from "../../middlewares/errorHandler.js";
import { ADMIN_ROLES, requireRole } from "../../middlewares/roleGuard.js";
import {
  AddRouteChargeSchema,
  CreateRouteSchema,
  ListRoutesQuerySchema,
  PublicRoutesQuerySchema,
  RouteChargeIdParamSchema,
  RouteIdParamSchema,
  RouteSlugParamSchema,
  UpdateRouteSchema,
  UpsertRouteFleetFareSchema,
} from "./route.schema.js";
import type { createRouteService } from "./route.service.js";
import { FleetCodeSchema } from "../fleet/fleet.schema.js";

export function createRouteController(service: ReturnType<typeof createRouteService>) {
  const admin = (request: FastifyRequest) => {
    requireUser(request);
    requireRole(request, ADMIN_ROLES);
  };

  return {
    // --------------------------------------------------------------- admin
    async listRoutes(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const q = ListRoutesQuerySchema.parse(request.query);
      const items = await service.listRoutes({
        status: q.status,
        featured: q.featured === undefined ? undefined : q.featured === "true",
        q: q.q,
      });
      return sendSuccess(reply, { items });
    },

    async createRoute(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const body = CreateRouteSchema.parse(request.body);
      return sendSuccess(reply, await service.createRoute(body), 201);
    },

    async getRoute(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = RouteIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.getRoute(id));
    },

    async updateRoute(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = RouteIdParamSchema.parse(request.params);
      const body = UpdateRouteSchema.parse(request.body);
      return sendSuccess(reply, await service.updateRoute(id, body));
    },

    async publishRoute(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = RouteIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.publishRoute(id));
    },

    async archiveRoute(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = RouteIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.archiveRoute(id));
    },

    async upsertRouteFleetFare(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = RouteIdParamSchema.parse(request.params);
      const { code } = FleetCodeSchema.parse(request.params);
      const body = UpsertRouteFleetFareSchema.parse(request.body);
      return sendSuccess(reply, await service.upsertRouteFleetFare(id, code, body));
    },

    async addRouteCharge(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = RouteIdParamSchema.parse(request.params);
      const body = AddRouteChargeSchema.parse(request.body);
      return sendSuccess(reply, await service.addRouteCharge(id, body), 201);
    },

    async deleteRouteCharge(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = RouteIdParamSchema.parse(request.params);
      const { chargeId } = RouteChargeIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.deleteRouteCharge(id, chargeId));
    },

    // --------------------------------------------------------------- public
    async listPublishedRoutes(request: FastifyRequest, reply: FastifyReply) {
      const q = PublicRoutesQuerySchema.parse(request.query);
      const items = await service.listPublishedRoutes({
        featured: q.featured === undefined ? undefined : q.featured === "true",
        limit: q.limit,
      });
      return sendSuccess(reply, { items });
    },

    async getPublishedRoute(request: FastifyRequest, reply: FastifyReply) {
      const { slug } = RouteSlugParamSchema.parse(request.params);
      const result = await service.getPublishedRoute(slug);
      if (result.redirect) {
        return reply.redirect(`/api/v1/routes/${result.redirect}`, 301);
      }
      return sendSuccess(reply, result);
    },
  };
}
