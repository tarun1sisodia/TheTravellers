import type { FastifyInstance } from "fastify";
import { createMonumentController } from "./monument.controller.js";
import { createMonumentService } from "./monument.service.js";
import type { Repositories } from "../../db/types.js";

export function registerMonumentRoutes(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createMonumentService(deps);
  const controller = createMonumentController(service, deps);

  // Admin
  app.get("/api/v1/ops/admin/monuments", controller.listMonuments);
  app.post("/api/v1/ops/admin/monuments", controller.createMonument);
  app.get("/api/v1/ops/admin/monuments/:id", controller.getMonument);
  app.patch("/api/v1/ops/admin/monuments/:id", controller.updateMonument);
  app.post("/api/v1/ops/admin/monuments/:id/publish", controller.publishMonument);
  app.post("/api/v1/ops/admin/monuments/:id/archive", controller.archiveMonument);
  // Public (published only)
  app.get("/api/v1/monuments", controller.listPublishedMonuments);
  app.get("/api/v1/monuments/:slug", controller.getPublishedMonument);
}
