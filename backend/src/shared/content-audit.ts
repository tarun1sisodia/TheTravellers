import type { FastifyRequest } from "fastify";
import type { Repositories } from "../db/types.js";
import { requireUser } from "../middlewares/authGuard.js";
import { newId } from "./ids.js";
import { toIso } from "./clock.js";

// Slice 6: audit logging for content publish lifecycle (publish/archive).
// Every state change on a publishable entity leaves a trail: who, what, when.

export async function auditContentLifecycle(
  db: Repositories,
  request: FastifyRequest,
  action: "publish" | "archive",
  resourceType: "route" | "package" | "local_tour" | "monument",
  resourceId: string,
  beforeStatus: string,
): Promise<void> {
  const user = requireUser(request);
  await db.audit.append({
    id: newId(),
    action: `${resourceType}_${action}`,
    actorId: user.id,
    actorRole: (user.role as "super_admin" | "customer") ?? "super_admin",
    resourceType,
    resourceId,
    before: { status: beforeStatus },
    after: { status: action === "publish" ? "published" : "archived" },
    reason: null,
    requestId: (request.id as string) ?? `req_${Date.now().toString(36)}`,
    createdAt: toIso(new Date()),
  });
}
