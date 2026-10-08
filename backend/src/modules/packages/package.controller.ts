import type { FastifyRequest, FastifyReply } from "fastify";
import { requireUser } from "../../middlewares/authGuard.js";
import { sendSuccess } from "../../middlewares/errorHandler.js";
import { ADMIN_ROLES, requireRole } from "../../middlewares/roleGuard.js";
import {
  CreatePackageSchema,
  ListPackagesQuerySchema,
  PackageIdParamSchema,
  PackageSlugParamSchema,
  PublicPackagesQuerySchema,
  UpdatePackageSchema,
  UpsertPackageFleetPriceSchema,
} from "./package.schema.js";
import { FleetCodeSchema } from "../fleet/fleet.schema.js";
import type { createPackageService } from "./package.service.js";

export function createPackageController(service: ReturnType<typeof createPackageService>) {
  const admin = (request: FastifyRequest) => {
    requireUser(request);
    requireRole(request, ADMIN_ROLES);
  };

  return {
    async listPackages(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const q = ListPackagesQuerySchema.parse(request.query);
      const items = await service.listPackages({
        status: q.status,
        featured: q.featured === undefined ? undefined : q.featured === "true",
        q: q.q,
      });
      return sendSuccess(reply, { items });
    },

    async createPackage(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const body = CreatePackageSchema.parse(request.body);
      return sendSuccess(reply, await service.createPackage(body), 201);
    },

    async getPackage(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = PackageIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.getPackage(id));
    },

    async updatePackage(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = PackageIdParamSchema.parse(request.params);
      const body = UpdatePackageSchema.parse(request.body);
      return sendSuccess(reply, await service.updatePackage(id, body));
    },

    async publishPackage(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = PackageIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.publishPackage(id));
    },

    async archivePackage(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = PackageIdParamSchema.parse(request.params);
      return sendSuccess(reply, await service.archivePackage(id));
    },

    async upsertPackageFleetPrice(request: FastifyRequest, reply: FastifyReply) {
      admin(request);
      const { id } = PackageIdParamSchema.parse(request.params);
      const { code } = FleetCodeSchema.parse(request.params);
      const body = UpsertPackageFleetPriceSchema.parse(request.body);
      return sendSuccess(reply, await service.upsertPackageFleetPrice(id, code, body.priceInr));
    },

    async listPublishedPackages(request: FastifyRequest, reply: FastifyReply) {
      const q = PublicPackagesQuerySchema.parse(request.query);
      const items = await service.listPublishedPackages({
        featured: q.featured === undefined ? undefined : q.featured === "true",
        limit: q.limit,
      });
      return sendSuccess(reply, { items });
    },

    async getPublishedPackage(request: FastifyRequest, reply: FastifyReply) {
      const { slug } = PackageSlugParamSchema.parse(request.params);
      const result = await service.getPublishedPackage(slug);
      if (result.redirect) {
        return reply.redirect(`/api/v1/packages/${result.redirect}`, 301);
      }
      return sendSuccess(reply, result);
    },
  };
}
