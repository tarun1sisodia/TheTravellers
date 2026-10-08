import type { FastifyInstance } from "fastify";
import { createLocalTourController } from "./local-tour.controller.js";
import { createLocalTourService } from "./local-tour.service.js";
import type { Repositories } from "../../db/types.js";

export function registerLocalTourRoutes(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createLocalTourService(deps);
  const controller = createLocalTourController(service, deps);

  // Admin
  app.get("/api/v1/ops/admin/tours", controller.listLocalTours);
  app.post("/api/v1/ops/admin/tours", controller.createLocalTour);
  app.get("/api/v1/ops/admin/tours/:id", controller.getLocalTour);
  app.patch("/api/v1/ops/admin/tours/:id", controller.updateLocalTour);
  app.post("/api/v1/ops/admin/tours/:id/publish", controller.publishLocalTour);
  app.post("/api/v1/ops/admin/tours/:id/archive", controller.archiveLocalTour);
  app.put("/api/v1/ops/admin/tours/:id/fleets/:code", controller.upsertLocalTourFleetPrice);

  // Public (published only)
  app.get("/api/v1/tours", controller.listPublishedLocalTours);
  app.get("/api/v1/tours/:slug", controller.getPublishedLocalTour);
}
