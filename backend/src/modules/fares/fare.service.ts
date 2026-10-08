import { applyPromo, calculateFare, findRoute } from "./fare.engine.js";
import { isGroupExceptionVehicle, PACKAGE_UPGRADES, slugifyPlace, VEHICLES } from "./fare.catalogue.js";
import type {
  CalculateFareInput,
  FareEngineInput,
  FareEngineResult,
  FareRuleOverrides,
  FareVehicleOverride,
} from "./fare.types.js";
import type { Repositories, RouteRecord } from "../../db/types.js";
import type { RouteCatalogRecord } from "../../db/route-catalog-types.js";
import { Errors } from "../../shared/errors.js";
import { resolveTierKey, toCanonicalTierKey } from "../../contracts/vehicle-tiers.js";

export type PublicFleetVehicle = {
  id: string;
  tier: string;
  name: string;
  seats: number;
  bags: number;
  perKm: number;
  active: boolean;
};

export function createFareService(fareVersion: string, db?: Repositories) {
  return {
    /**
     * PUBLIC — the live fleet read from the active fare rules. The customer
     * site merges this over its static fleet so desk-side vehicle edits
     * (name / seats / per-km rate / availability) appear without a deploy.
     */
    async getFleet(): Promise<{ version: string; vehicles: PublicFleetVehicle[] }> {
      const base: PublicFleetVehicle[] = VEHICLES.map((v) => ({
        id: v.id,
        tier: v.tier,
        name: v.name,
        seats: v.seats,
        bags: v.bags,
        perKm: v.perKm,
        active: true,
      }));
      if (!db) return { version: fareVersion, vehicles: base };
      const rule = await db.fareRules.getActive();
      const cfgVehicles = rule && Array.isArray((rule.config as Record<string, unknown>).vehicles)
        ? ((rule.config as Record<string, unknown>).vehicles as Array<Record<string, unknown>>)
        : [];
      const vehicles = base.map((v) => {
        // C-ENUM-001: override keys are normalized to canonical tier keys, so
        // desk-side entries keyed by legacy short ids (innova/tempo) still match.
        const override = cfgVehicles.find((ov) => {
          const key = toCanonicalTierKey(String(ov.tier ?? ov.id ?? ""));
          return key !== undefined && key === v.tier;
        });
        if (!override) return v;
        return {
          ...v,
          name: typeof override.name === "string" && override.name.trim() ? override.name.trim() : v.name,
          seats: typeof override.seats === "number" && override.seats > 0 ? Math.floor(override.seats) : v.seats,
          bags: typeof override.bags === "number" && override.bags >= 0 ? Math.floor(override.bags) : v.bags,
          perKm: typeof override.perKm === "number" && override.perKm > 0 ? override.perKm : v.perKm,
          active: typeof override.active === "boolean" ? override.active : v.active,
        };
      });
      return { version: rule?.version ?? fareVersion, vehicles };
    },

    async calculate(input: CalculateFareInput): Promise<FareEngineResult> {
      // Resolve a published catalog item once. This keeps catalog-backed local
      // tours/transfers on the server-authoritative path without trusting
      // client-supplied distance or price values.
      const catalogItem = db && input.packageId
        ? (await db.catalog.getById(input.packageId)) ?? (await db.catalog.getBySlug(input.packageId))
        : null;

      // Check for published dossier entities (tour_packages, transfer_routes, local_packages, route_catalog)
      let dossierFleetPrices: Record<string, number> | undefined;
      let dossierUsePerKm: boolean | undefined;
      let dossierPerKmRateOverride: number | null | undefined;
      let dossierNightChargeInr: number | undefined;
      let dossierNights: number | undefined;
      let dossierUpgradeSurcharges: Record<string, number> | undefined;
      let dossierNightHaltInr: number | undefined;
      let dossierPackageName: string | undefined;
      let dossierPackageDuration: string | undefined;
      let dossierCatalogItemType: "package" | "tour" | "ride" | undefined;
      let dossierDistanceKm: number | undefined;
      let dossierPackageBasePrice: number | undefined;

      if (db) {
        // 0. Canonical packages (Slice 3) — fixed per-fleet prices, isolated
        //    from route-rate changes. Takes precedence over legacy dossier rows.
        if (input.packageId) {
          const pkg =
            (await db.packages.get(input.packageId)) ??
            (await db.packages.getBySlug(input.packageId));
          if (pkg && pkg.status === "published") {
            const prices = await db.packages.listFleetPrices(pkg.id);
            const fleetPrices: Record<string, number> = {};
            for (const p of prices) fleetPrices[p.fleetCode] = p.priceInr;
            if (Object.keys(fleetPrices).length > 0) {
              dossierFleetPrices = fleetPrices;
              dossierCatalogItemType = "tour";
              dossierUsePerKm = false;
              dossierPackageName = pkg.title;
              dossierPackageDuration = pkg.durationText ?? undefined;
              dossierPackageBasePrice = Math.min(...Object.values(fleetPrices));
            }
          }
        }

        // 1. Tour packages
        if (input.packageId && !dossierFleetPrices) {
          const tourPkg =
            (await db.tourPackages.getById(input.packageId)) ??
            (await db.tourPackages.getByCode(input.packageId));
          if (tourPkg && tourPkg.status === "published" && tourPkg.isActive) {
            dossierFleetPrices = tourPkg.fleetPrices;
            dossierNightChargeInr = tourPkg.nightChargeInr;
            dossierNights = tourPkg.nights;
            dossierPackageName = tourPkg.name;
            dossierPackageDuration = tourPkg.durationText;
            dossierPackageBasePrice = tourPkg.startingPriceInr;
            dossierCatalogItemType = "tour";
            dossierDistanceKm = tourPkg.days ? tourPkg.days * 300 : undefined;

            const [globalUpgrades, pkgUpgrades] = await Promise.all([
              db.tourPackages.listUpgrades(null),
              db.tourPackages.listUpgrades(tourPkg.id),
            ]);
            const upgradesMap: Record<string, number> = { ...PACKAGE_UPGRADES };
            for (const u of globalUpgrades) {
              upgradesMap[u.tierCode] = u.surchargeInr;
            }
            for (const u of pkgUpgrades) {
              upgradesMap[u.tierCode] = u.surchargeInr;
            }
            dossierUpgradeSurcharges = upgradesMap;
          }
        }

        // 2. Transfer routes
        if (
          !dossierFleetPrices &&
          (input.packageId ||
            input.localPackageKey === "airport-transfer" ||
            input.tripType === "airport-transfer")
        ) {
          const lookupCode =
            input.packageId ??
            (input.localPackageKey === "airport-transfer" ? "kheria-airport" : undefined);
          const xfer = lookupCode
            ? (await db.transferRoutes.getById(lookupCode)) ??
              (await db.transferRoutes.getByCode(lookupCode))
            : null;
          if (xfer && xfer.status === "published" && xfer.isActive) {
            dossierFleetPrices = xfer.fleetPrices;
            dossierUsePerKm = xfer.usePerKm;
            dossierNightChargeInr = xfer.nightChargeInr;
            dossierPackageName = xfer.name;
            dossierPackageDuration = xfer.distanceText ?? undefined;
            dossierCatalogItemType = "ride";
            dossierDistanceKm =
              xfer.distanceText && /\d+/.test(xfer.distanceText)
                ? parseInt(xfer.distanceText.match(/\d+/)![0], 10)
                : undefined;
          }
        }

        // 3. Local packages
        if (!dossierFleetPrices) {
          let localCode = input.packageId;
          if (!localCode) {
            if (input.localPackageKey === "8hr-80km") localCode = "agra-standard-sightseeing";
            else if (input.localPackageKey === "12hr-120km") localCode = "agra-extended-city-tour";
          }
          if (localCode) {
            const localPkg =
              (await db.localPackages.getById(localCode)) ??
              (await db.localPackages.getByCode(localCode));
            if (localPkg && localPkg.status === "published" && localPkg.isActive) {
              dossierFleetPrices = localPkg.fleetPrices;
              dossierUsePerKm = localPkg.usePerKm;
              // C-ENUM-001: extra_rates may still be keyed by legacy short ids in
              // old rows — resolveTierKey tries canonical first, then legacy.
              // TODO(G2): log when hit.via === "legacy" so unmigrated rows surface.
              const extraRateHit = resolveTierKey(localPkg.extraRates, input.vehicleTier);
              dossierPerKmRateOverride = extraRateHit.value?.per_km ?? undefined;
              dossierNightChargeInr = localPkg.nightChargeInr;
              dossierPackageName = localPkg.name;
              dossierPackageDuration = `${localPkg.durationHours} hrs / ${localPkg.includedKm} km`;
              dossierCatalogItemType = "package";
              dossierDistanceKm = localPkg.includedKm;
            }
          }
        }

        // 4. Route catalog
        if (!dossierFleetPrices) {
          let routeRow: RouteCatalogRecord | null = null;
          if (input.packageId) {
            routeRow =
              (await db.routeCatalog.getById(input.packageId)) ??
              (await db.routeCatalog.getBySlug(input.packageId));
          }
          if (!routeRow && input.originName && input.destinationName) {
            const routeSlug = `${slugifyPlace(input.originName)}-to-${slugifyPlace(input.destinationName)}`;
            routeRow = await db.routeCatalog.getBySlug(routeSlug);
          }
          if (routeRow && routeRow.status === "published" && !routeRow.needsReview) {
            dossierFleetPrices = routeRow.faresInr;
            dossierUsePerKm = false;
            dossierNightHaltInr = routeRow.nightHaltInr;
            dossierDistanceKm = routeRow.distanceKm ?? undefined;
            dossierPackageName = `${routeRow.sourceCity} to ${routeRow.destinationCity ?? ""}`;
            dossierPackageDuration = routeRow.durationText ?? undefined;
          }
        }
      }

      // Derive distanceKm from catalogue if omitted by client
      let distanceKm = input.distanceKm;
      if (!distanceKm || !Number.isFinite(distanceKm) || distanceKm <= 0) {
        if (dossierDistanceKm && dossierDistanceKm > 0) {
          distanceKm = dossierDistanceKm;
        } else if (catalogItem?.distanceKm && catalogItem.distanceKm > 0) {
          distanceKm = catalogItem.distanceKm;
        } else if (input.packageId) {
          distanceKm = 100;
        } else if (input.localPackageKey === "8hr-80km") {
          distanceKm = 80;
        } else if (input.localPackageKey === "12hr-120km") {
          distanceKm = 120;
        } else if (input.localPackageKey === "airport-transfer" || input.tripType === "airport-transfer") {
          distanceKm = 20;
        } else {
          const route = findRoute(input.originName, input.destinationName);
          distanceKm = route.km;
        }
      }

      // Load active fare rules if DB is available
      const activeRule = db ? await db.fareRules.getActive() : null;
      const effectiveVersion = activeRule?.version ?? fareVersion;
      const cfg = (activeRule?.config as Record<string, unknown>) || {};
      const outstationCfg =
        typeof cfg.outstation === "object" && cfg.outstation !== null
          ? (cfg.outstation as Record<string, unknown>)
          : {};

      // Slice 1: normalized fleet fare rules (fleet_fare_rules) take precedence over
      // the legacy config JSONB. Version-level knobs come from fare_rules columns first.
      const dbFleetRules = activeRule && db ? await db.fleetFareRules.listByFareRuleId(activeRule.id) : [];
      const dbVehicles: FareVehicleOverride[] | undefined = dbFleetRules.length > 0
        ? dbFleetRules.map((r) => ({
            tier: r.fleetCode,
            perKm: r.perKm,
            driverAllowance: r.driverAllowance,
            nightAllowance: r.nightAllowance,
          }))
        : undefined;
      const dbNightStartHour = activeRule?.nightStartHour ?? undefined;
      const dbNightEndHour = activeRule?.nightEndHour ?? undefined;
      const dbMinKmPerDay = activeRule?.minKmPerDay ?? undefined;
      const dbSameDayRoundMultiplier = activeRule?.sameDayRoundMultiplier !== null && activeRule?.sameDayRoundMultiplier !== undefined
        ? Number(activeRule.sameDayRoundMultiplier) : undefined;
      // Per-fleet allowances: group vehicles (tempo/urbania) vs others, from the active version's rows
      const allowanceFor = (tier: string, kind: "driver" | "night"): number | undefined => {
        const row = dbFleetRules.find((r) => r.fleetCode === tier);
        if (!row) return undefined;
        return kind === "driver" ? row.driverAllowance : row.nightAllowance;
      };

      const nightStartHour =
        dbNightStartHour ?? (typeof outstationCfg.nightStartHour === "number" ? outstationCfg.nightStartHour : undefined);
      const nightEndHour =
        dbNightEndHour ?? (typeof outstationCfg.nightEndHour === "number" ? outstationCfg.nightEndHour : undefined);

      // Check package in db.catalog if packageId provided
      let packageBasePrice: number | undefined;
      let packageName: string | undefined;
      let packageDuration: string | undefined;
      if (db && input.packageId) {
        if (catalogItem) {
          if (catalogItem.status !== "published") {
            throw Errors.notFound("CATALOG_ITEM_NOT_FOUND", "Package is not available for booking.");
          }
          if (typeof catalogItem.startingPriceInr === "number" && catalogItem.startingPriceInr > 0) {
            packageBasePrice = catalogItem.startingPriceInr;
          }
          packageName = catalogItem.title;
          packageDuration = catalogItem.durationText;
        }
      }

      // Slice 2: published route fixed fares. An explicit routeSlug wins; otherwise
      // match the origin/destination corridor (either direction) for the trip type.
      // A fixed fare for the requested fleet replaces per-km math as the base fare.
      let routeFixedFareInr: number | undefined;
      let routeSlug: string | undefined;
      if (db && (input.tripType === "one-way" || input.tripType === "round-trip")) {
        let route: RouteRecord | null = null;
        const explicit = input.routeSlug?.trim();
        if (explicit) {
          const found = await db.routes.getBySlug(explicit);
          route = found && found.status === "published" ? found : null;
        } else if (input.originName && input.destinationName) {
          const a = slugifyPlace(input.originName);
          const b = slugifyPlace(input.destinationName);
          route = (await db.routes.getByCorridor(`${a}-${b}`, input.tripType))
            ?? (await db.routes.getByCorridor(`${b}-${a}`, input.tripType));
        }
        if (route) {
          const fares = await db.routes.listFleetFares(route.id);
          const row = fares.find((f) => f.fleetCode === input.vehicleTier);
          const fixed = input.tripType === "round-trip" ? row?.roundTripFareInr : row?.oneWayFareInr;
          if (fixed !== null && fixed !== undefined && fixed > 0) {
            routeFixedFareInr = fixed;
            routeSlug = route.slug;
          }
        }
      }

      const ruleOverrides: FareRuleOverrides = {
        vehicles: dbVehicles ?? (Array.isArray(cfg.vehicles) ? (cfg.vehicles as FareVehicleOverride[]) : undefined),
        minKmPerDay: dbMinKmPerDay
          ?? (typeof outstationCfg.minKmPerDay === "number" ? outstationCfg.minKmPerDay : undefined),
        sameDayRoundMultiplier: dbSameDayRoundMultiplier
          ?? (typeof outstationCfg.sameDayRoundMultiplier === "number"
            ? outstationCfg.sameDayRoundMultiplier
            : undefined),
        nightAllowanceCab: allowanceFor("sedan", "night")
          ?? (typeof outstationCfg.nightAllowanceCab === "number" ? outstationCfg.nightAllowanceCab : undefined),
        nightAllowanceTempo: allowanceFor("tempo-traveller", "night")
          ?? (typeof outstationCfg.nightAllowanceTempo === "number" ? outstationCfg.nightAllowanceTempo : undefined),
        driverAllowance: allowanceFor(input.vehicleTier, "driver")
          ?? (typeof outstationCfg.driverAllowance === "number" ? outstationCfg.driverAllowance : undefined),
        packageBasePrice: dossierPackageBasePrice ?? packageBasePrice,
        packageName: dossierPackageName ?? packageName,
        packageDuration: dossierPackageDuration ?? packageDuration,
        catalogItemType:
          dossierCatalogItemType ??
          (catalogItem?.type === "package" || catalogItem?.type === "tour" || catalogItem?.type === "ride"
            ? catalogItem.type
            : undefined),
        catalogDistanceKm: dossierDistanceKm ?? catalogItem?.distanceKm ?? undefined,

        fleetPrices: dossierFleetPrices,
        usePerKm: dossierUsePerKm,
        perKmRateOverride: dossierPerKmRateOverride,
        nightChargeInr: dossierNightChargeInr,
        nights: dossierNights,
        upgradeSurcharges: dossierUpgradeSurcharges,
        nightHaltInr: dossierNightHaltInr,

        nightStartHour,
        nightEndHour,

        routeFixedFareInr,
        routeSlug,

        ...input.ruleOverrides,
      };

      const engineInput: FareEngineInput = {
        ...input,
        distanceKm,
        fareVersion: effectiveVersion,
        ruleOverrides,
      };

      // If DB available and promo code provided, validate against DB for expiry, active, redemption limits
      let lookup:
        | ((code: string) => {
            discount: number;
            minTotal: number;
            desc: string;
            isActive?: boolean;
            validFrom?: string | null;
            validTo?: string | null;
            maxRedemptions?: number | null;
            redemptionCount?: number;
            allowGroupVehicles?: boolean;
          } | null)
        | undefined;
      let lookupAllowGroupVehicles = false;
      if (db && input.promoCode) {
        const promo = await db.promos.getByCode(input.promoCode);
        if (promo) {
          lookupAllowGroupVehicles = promo.allowGroupVehicles;
          lookup = () => ({
            discount: promo.discountAmount,
            minTotal: promo.minTotal,
            desc: promo.description,
            isActive: promo.isActive,
            validFrom: promo.validFrom,
            validTo: promo.validTo,
            maxRedemptions: promo.maxRedemptions,
            redemptionCount: promo.redemptionCount,
            allowGroupVehicles: promo.allowGroupVehicles,
          });
        }
      }

      const resultWithoutPromoLookup = calculateFare({
        ...engineInput,
        promoCode: undefined,
        promoAllowGroupVehicles: lookupAllowGroupVehicles,
      });
      if (!input.promoCode || (isGroupExceptionVehicle(input.vehicleTier) && !lookupAllowGroupVehicles)) return resultWithoutPromoLookup;

      // Re-apply promo with DB validation
      const promoEval = applyPromo(
        input.promoCode,
        resultWithoutPromoLookup.baseFare +
          resultWithoutPromoLookup.nightAllowance +
          resultWithoutPromoLookup.driverAllowance,
        lookup,
      );
      const subtotal =
        resultWithoutPromoLookup.baseFare +
        resultWithoutPromoLookup.nightAllowance +
        resultWithoutPromoLookup.driverAllowance;
      const totalFare = Math.max(1, subtotal - promoEval.discount);
      const { advanceOf } = await import("../../shared/money.js");
      const advanceAmount = advanceOf(totalFare);
      const finalAdvance = Math.min(totalFare, Math.max(advanceAmount, totalFare < 500 ? totalFare : 500));
      return {
        ...resultWithoutPromoLookup,
        discountAmount: promoEval.discount,
        totalFare,
        advanceAmount: finalAdvance,
        balanceAmount: totalFare - finalAdvance,
        promoCode: promoEval.valid ? promoEval.code : input.promoCode.trim().toUpperCase(),
        promoValid: promoEval.valid,
      };
    },
    calculateSync(input: CalculateFareInput): FareEngineResult {
      let distanceKm = input.distanceKm;
      if (!distanceKm || !Number.isFinite(distanceKm) || distanceKm <= 0) {
        if (input.ruleOverrides?.catalogDistanceKm && input.ruleOverrides.catalogDistanceKm > 0) {
          distanceKm = input.ruleOverrides.catalogDistanceKm;
        } else if (input.packageId) {
          distanceKm = 100;
        } else if (input.localPackageKey === "8hr-80km") {
          distanceKm = 80;
        } else if (input.localPackageKey === "12hr-120km") {
          distanceKm = 120;
        } else if (input.localPackageKey === "airport-transfer" || input.tripType === "airport-transfer") {
          distanceKm = 20;
        } else {
          const route = findRoute(input.originName, input.destinationName);
          distanceKm = route.km;
        }
      }
      return calculateFare({ ...input, distanceKm, fareVersion: input.fareVersion ?? fareVersion });
    },
  };
}
