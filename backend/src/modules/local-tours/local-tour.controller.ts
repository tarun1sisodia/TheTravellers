import type { FastifyRequest, FastifyReply } from "fastify";
import { requireUser } from "../../middlewares/authGuard.js";
import { sendSuccess } from "../../middlewares/errorHandler.js";
import { ADMIN_ROLES, requireRole } from "../../middlewares/roleGuard.js";
import {
  CreateLocalTourSchema,
  ListLocalToursQuerySchema,
  LocalTourIdParamSchema,
  LocalTourSlugParamSchema,
  PublicLocalToursQuerySchema,
  UpdateLocalTourSchema,
  UpsertLocalTourFleetPriceSchema,
} from "./local-tour.schema.js";
import { FleetCodeSchema } from "../fleet/fleet.schema.js";
import type { createLocalTourService } from "./local-tour.service.js";

export function createLocalTourController(service: ReturnType<typeof createLocalTourService>) {
  const admin = (request: FastifyRequest) => {
    requireUser(request);
    requireRole(request, ADMIN_ROLES);
  };

  return {
    async listLocalTours(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const q = ListLocalToursQuerySchema.parse(request.query);
      const items = await service.listLocalTours({
        status: q.status,
        featured: q.featured === undefined ? undefined : q.featured === "true",
        city: q.city,
        q: q.q,
      });
      return sendSuccess(reply, { items });
    },

    async createLocalTour(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const body = CreateLocalTourSchema.parse(request.body);
      return sendSuccess(reply, await service.createLocalTour(body), 201);
    },

    async getLocalTour(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = LocalTourIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.getLocalTour(id));
    },

    async updateLocalTour(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = LocalTourIdParamSchema.parse(request.params);
      const body = UpdateLocalTourSchema.parse(request.body);
      return sendSuccess(reply, await service.updateLocalTour(id, body));
    },

    async publishLocalTour(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = LocalTourIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.publishLocalTour(id));
    },

    async archiveLocalTour(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = LocalTourIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.archiveLocalTour(id));
    },

    async upsertLocalTourFleetPrice(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = LocalTourIdParamSchema.parse(request.params);
      const { code } = FleetCodeSchema.parse(request.params);
      const body = UpsertLocalTourFleetPriceSchema.parse(request.body);
      return sendSuccess(reply, await service.upsertLocalTourFleetPrice(id, code, body.priceInr));
    },

    async listPublishedLocalTours(request: FastifyRequest, reply: FastifyReply) {
      const q = PublicLocalToursQuerySchema.parse(request.query);
      const items = await service.listPublishedLocalTours({
        featured: q.featured === undefined ? undefined : q.featured === "true",
        city: q.city,
        limit: q.limit,
      });
      return sendSuccess(reply, { items });
    },

    async getPublishedLocalTour(request: FastifyRequest, reply: FastifyReply) {
      const { slug } = LocalTourSlugParamSchema.parse(request.params);
      const result = await service.getPublishedLocalTour(slug);
      if (result.redirect) {
        return reply.redirect(`/api/v1/tours/${result.redirect}`, 301);
      }
      return sendSuccess(reply, result);
    },
  };
}
