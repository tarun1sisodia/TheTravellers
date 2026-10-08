import type { FastifyInstance } from "fastify";
import { createRouteController } from "./route.controller.js";
import { createRouteService } from "./route.service.js";
import type { Repositories } from "../../db/types.js";

export function registerRouteRoutes(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createRouteService(deps);
  const controller = createRouteController(service);

  // Admin
  app.get("/api/v1/ops/admin/routes", controller.listRoutes);
  app.post("/api/v1/ops/admin/routes", controller.createRoute);
  app.get("/api/v1/ops/admin/routes/:id", controller.getRoute);
  app.patch("/api/v1/ops/admin/routes/:id", controller.updateRoute);
  app.post("/api/v1/ops/admin/routes/:id/publish", controller.publishRoute);
  app.post("/api/v1/ops/admin/routes/:id/archive", controller.archiveRoute);
  app.put("/api/v1/ops/admin/routes/:id/fleets/:code", controller.upsertRouteFleetFare);
  app.post("/api/v1/ops/admin/routes/:id/charges", controller.addRouteCharge);
  app.delete("/api/v1/ops/admin/routes/:id/charges/:chargeId", controller.deleteRouteCharge);

  // Public (published only)
  app.get("/api/v1/routes", controller.listPublishedRoutes);
  app.get("/api/v1/routes/:slug", controller.getPublishedRoute);
}
