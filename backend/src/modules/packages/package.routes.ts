import type { FastifyInstance } from "fastify";
import { createPackageController } from "./package.controller.js";
import { createPackageService } from "./package.service.js";
import type { Repositories } from "../../db/types.js";

export function registerPackageRoutes(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createPackageService(deps);
  const controller = createPackageController(service, deps);

  // Admin
  app.get("/api/v1/ops/admin/packages", controller.listPackages);
  app.post("/api/v1/ops/admin/packages", controller.createPackage);
  app.get("/api/v1/ops/admin/packages/:id", controller.getPackage);
  app.patch("/api/v1/ops/admin/packages/:id", controller.updatePackage);
  app.post("/api/v1/ops/admin/packages/:id/publish", controller.publishPackage);
  app.post("/api/v1/ops/admin/packages/:id/archive", controller.archivePackage);
  app.put("/api/v1/ops/admin/packages/:id/fleets/:code", controller.upsertPackageFleetPrice);

  // Public (published only)
  app.get("/api/v1/packages", controller.listPublishedPackages);
  app.get("/api/v1/packages/:slug", controller.getPublishedPackage);
}
