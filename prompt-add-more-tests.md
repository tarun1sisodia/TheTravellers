# Prompt: Add More Edge Cases and Untested Logic — TheTravellers Backend

## Context

This is the TheTravellers backend — a Fastify + TypeScript modular monolith for SK Baghel Tour & Travels (transportation and tour booking platform). It currently has **519 passing tests** across 40 files. All tests are in `backend/tests/`. Tests run with `vitest run` (command: `npm test` from `backend/`).

**Test patterns used:**
- Pure unit tests in `tests/unit/` — no real DB, test business logic directly
- Integration tests in `tests/integration/` — use `createTestApp()` from `tests/helpers.ts` which builds a Fastify app with in-memory repositories
- Contract tests in `tests/contract/` — guard locked contracts
- All imports use `.js` extension (ESM)

**Rules:**
- Focus on **logic correctness** — not frontend design
- Do NOT modify production source files
- Tests must pass `npm test` with zero failures
- Use the existing memory repository (`src/db/memory.ts`) for integration tests that need a DB

---

## Untested / Undertested Areas (Priority Order)

### 1. `calculateFare` — Deep Edge Cases (`src/modules/fares/fare.engine.ts`)

The main `calculateFare()` function has many code paths that are barely tested. Add tests for:

**a) Dossier Tier Pricing via `ruleOverrides`**
- Tour package with `fleetPrices` using canonical keys (`"innova-crysta"`) → should use dossier-admin-fleet-price
- Tour package with `fleetPrices` using legacy keys (`"innova"`) → should use legacy fallback
- Tour package with `packageBasePrice` + `upgradeSurcharges` → should use dossier-starting-price-upgrade
- Ride with `packageBasePrice` (catalogItemType === "ride") → should enter catalog-local/transfer path
- `usePerKm: false` with no tier price → must throw `TIER_NOT_PRICED`
- `usePerKm: true` with `perKmRateOverride` → should use override rate
- `routeFixedFareInr` set on a round-trip → strategy should use fixed fare

**b) Multi-day Round-Trip 300km/day Floor**
- 2-day round-trip Agra→Delhi sedan: verify `minDayKmTotal = 300 * 2 * perKm` is applied
- 3-day round-trip: verify `minDayKmTotal = 300 * 3 * perKm`
- Same-day round-trip: verify `sameDayRoundMultiplier` (1.85x) is applied
- Round-trip where actual km exceeds 300km/day floor

**c) Group Vehicle Through calculateFare**
- Tempo traveller one-way (should be forced to round-trip)
- Urbania under 300km (km doubled) vs 300km+ (km once)
- Group vehicle with `promoAllowGroupVehicles: true` vs default blocked
- Group vehicle driver allowance: ₹500/day default, verify multi-day

**d) Night Allowance Edge Cases**
- Night pickup with configurable window via `nightStartHour`/`nightEndHour` overrides
- Multi-night override (`nights: 3`) → nightAllowance = rate × 3
- `nightChargeInr` override → uses custom rate instead of tier default
- `nightHaltInr` override → same as nightChargeInr
- Per-vehicle night override via `vehicles[].nightAllowance` → takes precedence
- Night allowance on group vehicle (should use tempo rate ₹500)
- Night allowance on airport transfer (applyNight: true)
- Night allowance on local tour (applyNight: false → should be 0)

**e) Catalog Paths**
- `catalogItemType: "tour"` with `packageBasePrice` → catalog tour path
- `catalogItemType: "ride"` with `packageBasePrice` → catalog transfer path
- Group vehicle through catalog path (force doubled km under 300)

---

### 2. Booking Service (`src/modules/bookings/booking.service.ts`)

**a) `resolveBookingSelection`**
- Outstation selection → resolves route ID
- Legacy source → throws "Legacy selection markers are read-only"
- Catalog package with published status → resolves
- Catalog package with draft status → throws NOT_FOUND
- Catalog package with slug mismatch → throws BOOKING_SELECTION_CHANGED
- Catalog local tour with published status → resolves
- Catalog item with `availability: "unavailable"` → throws NOT_FOUND
- Curated package (source not catalog) with matching PACKAGES entry → resolves
- Curated package not found → throws PACKAGE_NOT_FOUND
- Curated local with valid `localPackageKey` → resolves
- Curated local with invalid key → throws LOCAL_PACKAGE_NOT_FOUND

**b) `createDraft`**
- Creates booking with correct fare snapshot
- Sanitizes HTML in customerName, pickupAddress, dropAddress, specialNotes
- Creates profile for authenticated user if not exists
- Profile upsert conflict → throws PROFILE_CONTACT_CONFLICT
- Server-authoritative distance: ignores client-supplied `distanceKm`
- Ticket ID uniqueness (retry on collision)

**c) `transition`**
- Valid transition updates status and increments version
- Version conflict when expectedVersion doesn't match → throws VERSION_CONFLICT
- Cancel with captured payment and 24+ hours notice → creates refund record
- Cancel with captured payment and <24 hours → no refund record (advance retained)
- Cancel tour package → uses tour_package policy type
- Cancel with no payments → no refund record created

**d) `projectBooking`**
- Masks phone and email when `unmask: false`
- Unmasks when `unmask: true` (admin view)
- Legacy bookings (no bookingSelection) → generates legacy selection for projection
- Legacy package booking → generates package selection with source="legacy"
- Legacy local tour → generates local selection with source="legacy"

**e) `assertBookingPayable`**
- Allows `pending_payment` and `draft` statuses
- Rejects `paid_confirmed`, `completed`, `cancelled`, `refunded`
- Rejects when pickup time is in the past (>1 hour ago)

**f) `getVerifiedBooking`**
- Valid token → returns booking
- Matching phone → returns booking
- Admin actor → returns booking (unmasked)
- No auth → throws unauthorized
- Short token (<16 chars) → rejected
- Non-existent ticketId → throws NOT_FOUND

---

### 3. Payment Service (`src/modules/payments/payment.service.ts`)

**a) `isAllowedReturnUrl` (extract and test)**
- Allows HTTPS URLs matching CORS origins
- Rejects HTTP in non-localhost
- Rejects completely unrelated domains
- Allows localhost URLs
- Handles subdomain matching

**b) `createCheckout`**
- Idempotent: same idempotencyKey returns same checkout
- Ownership proof: user ID match or guest access token
- Invalid return URL → throws validation error
- Invalid cancel URL → throws validation error
- Draft booking → transitions to pending_payment
- Non-payable booking → throws BOOKING_NOT_PAYABLE
- Reuses open (non-expired) payment if exists

**c) `processWebhookEvent`**
- Duplicate eventId → returns `{ duplicate: true }`
- `payment.failed` event → marks payment failed
- `payment.refunded` event → marks payment refunded, updates refund record
- `order.paid` without providerPaymentId → returns pending (waits for payment.captured)
- Amount mismatch → marks needs_review
- Valid captured event → confirms booking, increments promo count
- Already confirmed booking → idempotent (no-op)
- Cancelled booking → skips confirmation
- Refunded event on cancelled booking → does NOT attempt cancelled→refunded transition

**d) `refund`**
- Reason < 5 chars → throws validation
- Idempotent by idempotencyKey
- Only `paid_confirmed` bookings are eligible
- Already refunded → throws ALREADY_REFUNDED
- No captured payment → throws REFUND_NOT_ELIGIBLE
- Successful refund → creates refund record, updates payment and booking status

**e) `assertNoClientAmount`**
- Strips all forbidden money fields from body
- Handles non-object input gracefully

---

### 4. Booking Intent Service (`src/modules/booking-intents/booking-intent.service.ts`)

- `create` with new idempotencyKey → creates intent with quote and secret
- `create` with duplicate idempotencyKey, same payload → returns continuation with fresh secret
- `create` with duplicate idempotencyKey, different payload → throws IDEMPOTENCY_KEY_REUSED
- `create` with already-consumed intent → throws BOOKING_INTENT_ALREADY_FINALIZED
- `create` with expired intent → throws BOOKING_INTENT_EXPIRED
- `resume` with valid secret → returns current quote
- `resume` with invalid secret → throws unauthorized
- `resume` when fare changed → sets fareReconfirmationPending
- `finalize` → creates booking and marks intent consumed

---

### 5. Auth Guard (`src/middlewares/authGuard.ts`)

**a) `authenticateRequest`**
- No Authorization header → returns null
- Empty Bearer token → returns null
- Token > 2048 chars → throws unauthorized
- Test auth with valid role prefix → returns test user
- Test auth with invalid role → throws unauthorized
- Test auth disabled in production → test tokens rejected

**b) `principalFromPayload`**
- Missing sub → throws unauthorized
- `app_metadata.role: "super_admin"` → returns super_admin
- `app_metadata.role` unknown → defaults to customer
- `user_metadata.role` → ignored (only app_metadata trusted)
- Invalid email format → email is null
- Invalid phone format → phone is null

**c) `enforceAdminEmailWhitelist`**
- super_admin with matching ADMIN_EMAIL → allowed
- super_admin with non-matching email → throws forbidden
- Customer role → whitelist not enforced
- No ADMIN_EMAIL configured → whitelist not enforced

**d) `requireUser`**
- request.user exists → returns user
- request.user is null → throws unauthorized
- request.user.id is empty → throws unauthorized

---

### 6. Role Guard (`src/middlewares/roleGuard.ts`)

- super_admin always passes regardless of required roles
- Customer with allowed role → passes
- Customer with disallowed role → throws forbidden
- No user on request → throws unauthorized

---

### 7. Error Handler (`src/middlewares/errorHandler.ts`)

- ZodError → 400 with sanitized details (path, message, code — no raw values)
- AppError 4xx → returns code, message, details
- AppError 500 in production → message replaced with generic text
- AppError 500 in development → returns actual message
- Generic Error → 500 with INTERNAL_ERROR code
- 429 status → RATE_LIMITED code
- 404 status → NOT_FOUND code
- `sendSuccess` → wraps data in `{ success: true, data }`

---

### 8. Environment Config (`src/config/env.ts`)

- `loadEnv` with defaults → returns valid Env
- `loadEnv` production mode missing DATABASE_URL → throws
- `loadEnv` production with invalid RAZORPAY_KEY_ID → throws
- `loadEnv` production with ALLOW_TEST_AUTH=true → throws
- `loadEnv` production with insecure CORS origins → throws
- `loadEnv` with ALLOW_TEST_AUTH + DATABASE_URL in non-test → warns
- `corsOriginList` → trims, strips trailing slashes, filters invalid URLs
- `isProduction` → true only for NODE_ENV=production
- `resetEnvCache` → clears cached env

---

### 9. HMAC Payment Adapter (`src/providers/adapters/hmacCheckout.ts`)

- `createCheckout` with valid amount → returns checkout result
- `createCheckout` with invalid amount → throws
- Razorpay adapter → checkoutUrl is null
- Non-razorpay adapter → checkoutUrl is set
- `verifyWebhook` with valid signature → returns true
- `verifyWebhook` with invalid signature → returns false
- `verifyWebhook` with missing header → returns false
- `verifyCheckoutPayment` with valid signature → returns captured
- `verifyCheckoutPayment` with invalid signature → returns null
- `parseEvent` with valid JSON → returns normalized event
- `parseEvent` with invalid JSON → throws
- `parseEvent` status normalization: "failed", "refunded", "pending", "captured"
- `refund` with valid input → returns processed
- `refund` without providerPaymentId → throws
- Webhook secret < 8 chars → throws on construction
- `webhookHeaderName` returns correct header per provider
- `header()` function: case-insensitive lookup, array values

---

### 10. Notification Service (`src/modules/notifications/notification.service.ts`)

- `queuePaymentConfirmed` → creates whatsapp + email notification jobs
- Email not provided → only whatsapp job queued
- Invalid email format → email job skipped
- Dedupe: same booking → no duplicate jobs
- `processQueued` → sends whatsapp via messaging provider
- `processQueued` → sends email via email provider
- Failed send → increments attemptCount, stays queued
- Max attempts (3) → marks as failed
- Missing customer phone → marks as failed

---

### 11. Fleet Service (`src/modules/fleet/fleet.service.ts`)

- `listFleets` → returns all fleets
- `updateFleet` with valid code → returns updated fleet
- `updateFleet` with invalid code → throws FLEET_NOT_FOUND
- `listVersionFleetRules` with valid version → returns rules
- `listVersionFleetRules` with invalid version → throws FARE_VERSION_NOT_FOUND
- `upsertVersionFleetRule` → creates/updates fleet fare rule
- `createVersionFromActive` → creates new inactive version carrying forward rules

---

### 12. Deploy Hook (`src/shared/deploy-hook.ts`)

- No PAGES_DEPLOY_HOOK_URL → warns and returns (no fetch)
- Hook URL set, successful response → no error
- Hook URL set, HTTP error response → warns
- Hook URL set, network failure → warns (catches error)

---

### 13. Content Audit (`src/shared/content-audit.ts`)

- `auditContentLifecycle` publish action → appends audit log with correct action/resourceType
- `auditContentLifecycle` archive action → after.status = "archived"
- Different resource types (route, package, local_tour, monument) → correct action string

---

### 14. Razorpay Adapter (`src/providers/adapters/razorpay.ts`)

Read the file first, then test:
- Adapter construction with/without credentials
- `createCheckout` → returns Razorpay order structure
- `verifyCheckoutPayment` → verifies Razorpay signature
- `verifyWebhook` → verifies webhook HMAC
- `parseEvent` → normalizes Razorpay webhook events
- `refund` → initiates Razorpay refund

---

## Instructions

1. Read each source file listed above before writing its tests
2. Create test files following the existing naming pattern: `tests/unit/<module>.test.ts`
3. For service tests that need a DB, use `createMemoryRepositories()` from `src/db/memory.ts`
4. Run `npm test` after each file to verify all pass
5. Aim for **200+ additional tests** covering the areas above
6. Focus on edge cases, boundary values, error paths, and security-critical logic
7. Do NOT modify any production source files
