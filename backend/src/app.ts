// TheTravellers backend — Slice 0 app wiring.
// Verbatim port of the booking/payment core from the ArenaAI codebase
// (source: arenaai-contracts-pilot worktree, branch feat/contracts-pilot-2026-10).
// Only the protected booking subsystem is registered here; content modules
// (routes/packages/tours/monuments/admin) arrive in later slices.
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import type { Logger } from "pino";
import type { Env } from "./config/env.js";
import { corsOriginList } from "./config/env.js";
import { systemClock, toIso, type Clock } from "./shared/clock.js";
import { newId } from "./shared/ids.js";
import type { Repositories } from "./db/types.js";
import { createMemoryRepositories } from "./db/memory.js";
import { authenticateRequest } from "./middlewares/authGuard.js";
import { AppError, Errors } from "./shared/errors.js";
import { registerErrorHandler, sendSuccess } from "./middlewares/errorHandler.js";
import { registerNetworkHeaders } from "./middlewares/networkHeaders.js";
import { registerRawBody } from "./middlewares/rawBody.js";
import { registerRequestId } from "./middlewares/requestId.js";
import { createBookingController } from "./modules/bookings/booking.controller.js";
import { registerBookingRoutes } from "./modules/bookings/booking.routes.js";
import { createBookingService } from "./modules/bookings/booking.service.js";
import { createBookingIntentController } from "./modules/booking-intents/booking-intent.controller.js";
import { createBookingIntentService } from "./modules/booking-intents/booking-intent.service.js";
import { registerBookingIntentRoutes } from "./modules/booking-intents/booking-intent.routes.js";
import { createFareController } from "./modules/fares/fare.controller.js";
import { registerFareRoutes } from "./modules/fares/fare.routes.js";
import { createFareService } from "./modules/fares/fare.service.js";
import { registerFleetRoutes } from "./modules/fleet/fleet.routes.js";
import { registerRouteRoutes } from "./modules/routes/route.routes.js";
import { registerRoutePages } from "./modules/routes/route.pages.js";
import { registerPackageRoutes } from "./modules/packages/package.routes.js";
import { registerPackagePages } from "./modules/packages/package.pages.js";
import { registerLocalTourRoutes } from "./modules/local-tours/local-tour.routes.js";
import { registerLocalTourPages } from "./modules/local-tours/local-tour.pages.js";
import { registerMonumentRoutes } from "./modules/monuments/monument.routes.js";
import { registerMonumentPages } from "./modules/monuments/monument.pages.js";
import { createNotificationService } from "./modules/notifications/notification.service.js";
import { createPaymentController } from "./modules/payments/payment.controller.js";
import { registerPaymentRoutes } from "./modules/payments/payment.routes.js";
import { createPaymentService } from "./modules/payments/payment.service.js";
import { createCancellationPoliciesController } from "./modules/cancellation-policies/cancellation-policies.controller.js";
import { registerCancellationPoliciesRoutes } from "./modules/cancellation-policies/cancellation-policies.routes.js";
import { createCancellationPoliciesService } from "./modules/cancellation-policies/cancellation-policies.service.js";
import { createPromosController } from "./modules/promos/promos.controller.js";
import { registerPromosRoutes } from "./modules/promos/promos.routes.js";
import { createPromosService } from "./modules/promos/promos.service.js";
import { createAdminController } from "./modules/admin/admin.controller.js";
import { registerAdminRoutes } from "./modules/admin/admin.routes.js";
import { createAdminService } from "./modules/admin/admin.service.js";
import {
  createNoopEmail,
  createNoopMessaging,
  createResendEmailProvider,
  createWhatsAppProvider,
} from "./providers/MessagingProvider.js";
import { createRazorpayAdapter } from "./providers/adapters/razorpay.js";
import type { PaymentProviderRegistry } from "./providers/PaymentProvider.js";

export type AppOptions = {
  env: Env;
  logger: Logger;
  db?: Repositories;
  clock?: Clock;
};

export type BuiltApp = {
  app: FastifyInstance;
  db: Repositories;
  notifications: ReturnType<typeof createNotificationService>;
};

export async function buildApp(options: AppOptions): Promise<BuiltApp> {
  const env = options.env;
  const clock = options.clock ?? systemClock;
  const db = options.db ?? createMemoryRepositories(clock.now().toISOString());

  const app = Fastify({
    logger: env.LOG_LEVEL === "silent" ? false : { level: env.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 1_000_000, // 1MB max body to prevent large payload attacks
  });

  registerRawBody(app);
  registerRequestId(app);
  registerErrorHandler(app);
  registerNetworkHeaders(app);

  // Security headers - enable all protections, CSP only for API is minimal
  await app.register(helmet, {
    contentSecurityPolicy: false, // API doesn't serve HTML, but other headers are critical
    crossOriginEmbedderPolicy: false,
    hsts: env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  const origins = corsOriginList(env);
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow no origin (mobile apps, curl) in dev, but require origin check in prod
      if (!origin) {
        if (env.NODE_ENV === "production") {
          // In production, allow requests with no origin only for webhooks which are allowlisted
          cb(null, true);
          return;
        }
        cb(null, true);
        return;
      }
      if (origins.includes(origin)) {
        cb(null, true);
      } else {
        // Do not throw here: Fastify would turn a normal cross-origin denial
        // into a misleading HTTP 500. Returning false omits CORS headers and
        // lets the browser enforce the same-origin policy safely.
        cb(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Booking-Token", "X-Booking-Intent-Secret", "X-Request-Id", "X-Razorpay-Signature"],
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    // SEC-001: no global allowList exemption — each route sets its own limit
    // Webhooks use a per-route config with a generous limit to allow provider retries
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Retry after ${Math.ceil(Number(context.after) / 1000)}s.`,
        requestId: request.requestId ?? "rate-limit",
      },
    }),
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
  });

  app.addHook("onRequest", async (request) => {
    try {
      request.user = (await authenticateRequest(request, env)) ?? undefined;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Only throw if auth header present - otherwise treat as anonymous
      if (request.headers.authorization) {
        throw Errors.unauthorized("Invalid access token.");
      }
      request.user = undefined;
    }
  });

  const providers = createPaymentProviders(env);
  const messaging = env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
    ? createWhatsAppProvider(env.WHATSAPP_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID)
    : createNoopMessaging();
  const email = env.RESEND_API_KEY
    ? createResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
    : createNoopEmail();

  const notifications = createNotificationService({
    db,
    clock,
    messaging,
    email,
    paymentTemplate: env.WHATSAPP_TEMPLATE_PAYMENT,
  });
  const fareService = createFareService(env.FARE_RULES_VERSION, db);
  const bookingService = createBookingService({
    db,
    clock,
    fareVersion: env.FARE_RULES_VERSION,
    fareService,
  });
  const paymentService = createPaymentService({ db, clock, env, providers, notifications });
  const cancellationPoliciesService = createCancellationPoliciesService({ db, clock });
  const promosService = createPromosService({ db });
  const adminService = createAdminService({ db, clock });

  const healthHandler = async () => ({ success: true, data: { status: "ok", version: env.FARE_RULES_VERSION } });
  const readyHandler = async (_request: unknown, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) => {
    try {
      const ok = await db.healthCheck();
      if (!ok) {
        return reply.code(503).send({ success: false, error: { code: "DB_NOT_READY", message: "Database is not ready." } });
      }
      if (env.NODE_ENV === "production" && !env.DATABASE_URL) {
        return reply.code(503).send({ success: false, error: { code: "DB_NOT_CONFIGURED", message: "Production database URL is required." } });
      }
      return reply.code(200).send({ success: true, data: { status: "ready", store: env.DATABASE_URL ? "postgres" : "memory" } });
    } catch {
      return reply.code(503).send({ success: false, error: { code: "DB_NOT_READY", message: "Database health check failed." } });
    }
  };

  app.get("/health", healthHandler);
  app.get("/api/v1/health", healthHandler);
  app.get("/ready", readyHandler);
  app.get("/api/v1/ready", readyHandler);

  await registerFareRoutes(app, createFareController(fareService));
  registerFleetRoutes(app, { db });
  registerRouteRoutes(app, { db });
  registerRoutePages(app, { db });
  registerPackageRoutes(app, { db });
  registerPackagePages(app, { db });
  registerLocalTourRoutes(app, { db });
  registerLocalTourPages(app, { db });
  registerMonumentRoutes(app, { db });
  registerMonumentPages(app, { db });
  await registerBookingRoutes(app, createBookingController(bookingService, env.CUSTOMER_AUTH_REQUIRED_FOR_NEW_BOOKINGS));
  const bookingIntentService = createBookingIntentService({ db, clock, fareService, bookingService });
  await registerBookingIntentRoutes(app, createBookingIntentController(bookingIntentService));
  await registerPaymentRoutes(app, createPaymentController(paymentService));
  await registerCancellationPoliciesRoutes(app, createCancellationPoliciesController(cancellationPoliciesService));
  await registerPromosRoutes(app, createPromosController(promosService));
  await registerAdminRoutes(app, createAdminController(adminService, paymentService, bookingService));

  app.post("/api/v1/devices/register", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (request, reply) => {
      const DeviceSchema = z.object({
        deviceId: z.string().min(1).max(100),
        platform: z.enum(["android", "ios", "web"]),
        fcmToken: z.string().min(1).max(500),
        userId: z.string().uuid().optional(),
        bookingId: z.string().uuid().optional(),
        ticketId: z.string().optional(),
        guestAccessToken: z.string().optional(),
      });
      const body = DeviceSchema.parse(request.body);

      // Ownership enforcement:
      // 1. If userId is provided, request must be authenticated and match userId (or staff/admin)
      if (body.userId) {
        if (!request.user) {
          throw Errors.unauthorized("Authentication required to link device to user account.");
        }
        const isPrivileged = ["super_admin", "admin", "staff"].includes(request.user.role);
        if (request.user.id !== body.userId && !isPrivileged) {
          throw Errors.forbidden("Cannot register device token for another user account.");
        }
      }

      // 2. If bookingId or ticketId is provided, ownership of that booking must be verified
      let verifiedBookingId: string | null = null;
      if (body.bookingId || body.ticketId) {
        const booking = body.bookingId
          ? await db.bookings.getById(body.bookingId)
          : await db.bookings.getByTicketId(body.ticketId!);

        if (!booking) {
          throw Errors.notFound("BOOKING_NOT_FOUND", "Booking not found.");
        }

        const isPrivileged = request.user && ["super_admin", "admin", "staff"].includes(request.user.role);
        const isOwnerUser = Boolean(request.user?.id && booking.userId === request.user.id);
        const hasValidToken = Boolean(body.guestAccessToken && body.guestAccessToken === booking.guestAccessToken);

        if (!isPrivileged && !isOwnerUser && !hasValidToken) {
          throw Errors.forbidden("Proof of booking ownership (valid guestAccessToken or authenticated booking owner) is required.");
        }

        verifiedBookingId = booking.id;
      }

      const now = toIso(clock.now());
      const record = await db.devices.register({
        id: newId(),
        deviceId: body.deviceId,
        platform: body.platform,
        fcmToken: body.fcmToken,
        userId: body.userId || null,
        bookingId: verifiedBookingId,
        isActive: true,
        lastSeenAt: now,
        createdAt: now,
      });
      return sendSuccess(reply, { success: true, deviceId: record.deviceId });
    },
  });

  // Dev UI — dead-simple data-first customer/admin pages for endpoint verification.
  // Explicitly never registered in production.
  if (env.NODE_ENV !== "production") {
    const devUiDir = path.join(process.cwd(), "dev-ui");
    const serveDevUi = (file: string) => async (_request: unknown, reply: FastifyReply) => {
      try {
        const html = await fs.readFile(path.join(devUiDir, file), "utf8");
        return reply.type("text/html").send(html);
      } catch {
        throw Errors.notFound("DEV_UI_MISSING", "Dev UI file not found. Start the server from backend/.");
      }
    };
    app.get("/dev", async (_request: unknown, reply: FastifyReply) => reply.redirect("/dev/customer"));
    app.get("/dev/customer", serveDevUi("customer.html"));
    app.get("/dev/admin", serveDevUi("admin.html"));
  }

  return { app, db, notifications };
}

function createPaymentProviders(env: Env): PaymentProviderRegistry {
  return {
    razorpay: createRazorpayAdapter({
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET,
      isProduction: env.NODE_ENV === "production",
    }),
  };
}
