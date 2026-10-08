import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireUser } from "../../middlewares/authGuard.js";
import { sendSuccess } from "../../middlewares/errorHandler.js";
import { ADMIN_ROLES, requireRole } from "../../middlewares/roleGuard.js";
import {
  CreateMonumentSchema,
  MonumentQuerySchema,
  UpdateMonumentSchema,
} from "./monument.schema.js";
import type { createMonumentService } from "./monument.service.js";

const IdParamSchema = z.object({ id: z.string().uuid() });
const SlugParamSchema = z.object({ slug: z.string().min(1).max(160) });

export function createMonumentController(service: ReturnType<typeof createMonumentService>) {
  const admin = (request: FastifyRequest) => {
    requireUser(request);
    requireRole(request, ADMIN_ROLES);
  };

  return {
    async listMonuments(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const q = MonumentQuerySchema.parse(request.query);
      const items = await service.listMonuments({
        status: q.status,
        featured: q.featured === undefined ? undefined : q.featured === "true",
        city: q.city,
        q: q.q,
      });
      return sendSuccess(reply, { items });
    },

    async createMonument(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const body = CreateMonumentSchema.parse(request.body);
      return sendSuccess(reply, await service.createMonument(body), 201);
    },

    async getMonument(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = IdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.getMonument(id));
    },

    async updateMonument(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = IdParamSchema.parse(request.params);
      const body = UpdateMonumentSchema.parse(request.body);
      return sendSuccess(reply, await service.updateMonument(id, body));
    },

    async publishMonument(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = IdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.publishMonument(id));
    },

    async archiveMonument(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = IdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.archiveMonument(id));
    },

    async listPublishedMonuments(request: FastifyRequest, reply: FastifyReply) {
      const q = MonumentQuerySchema.parse(request.query);
      const items = await service.listPublishedMonuments({
        featured: q.featured === undefined ? undefined : q.featured === "true",
        city: q.city,
        limit: q.limit,
      });
      return sendSuccess(reply, { items });
    },

    async getPublishedMonument(request: FastifyRequest, reply: FastifyReply) {
      const { slug } = SlugParamSchema.parse(request.params);
      const result = await service.getPublishedMonument(slug);
      if (result.redirect) {
        return reply.redirect(`/api/v1/monuments/${result.redirect}`, 301);
      }
      return sendSuccess(reply, result);
    },
  };
}
