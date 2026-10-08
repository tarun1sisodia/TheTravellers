import type { FastifyInstance } from "fastify";
import { createFleetController } from "./fleet.controller.js";
import { createFleetService } from "./fleet.service.js";
import type { Repositories } from "../../db/types.js";

export function registerFleetRoutes(app: FastifyInstance, deps: { db: Repositories }) {
  const service = createFleetService(deps);
  const controller = createFleetController(service);

  app.get("/api/v1/ops/admin/fleets", controller.listFleets);
  app.put("/api/v1/ops/admin/fleets/:code", controller.updateFleet);
  app.get("/api/v1/ops/admin/fare-rules/:version/fleets", controller.listVersionFleetRules);
  app.put("/api/v1/ops/admin/fare-rules/:version/fleets/:fleetCode", controller.upsertVersionFleetRule);
}
