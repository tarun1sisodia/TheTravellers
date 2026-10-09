import { describe, expect, it } from "vitest";
import {
  slugifyPlace,
  isGroupExceptionVehicle,
  toInternalVehicleId,
  vehicleSpec,
  nightAllowanceFor,
  toVehicleTier,
  VEHICLES,
  LOCAL_PACKAGES,
  AIRPORT_TRANSFERS,
  PACKAGE_UPGRADES,
  OUTSTATION_RULES,
} from "../../src/modules/fares/fare.catalogue.js";

describe("slugifyPlace", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugifyPlace("New Delhi")).toBe("new-delhi");
    expect(slugifyPlace("Taj Mahal")).toBe("taj-mahal");
  });

  it("replaces ampersand with 'and'", () => {
    expect(slugifyPlace("Mathura & Vrindavan")).toBe("mathura-and-vrindavan");
  });

  it("removes special characters", () => {
    expect(slugifyPlace("Agra (City)")).toBe("agra-city");
    expect(slugifyPlace("Delhi/NCR")).toBe("delhi-ncr");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugifyPlace(" Agra ")).toBe("agra");
    expect(slugifyPlace("  Delhi  ")).toBe("delhi");
  });

  it("handles multiple consecutive special characters", () => {
    expect(slugifyPlace("Agra---City")).toBe("agra-city");
    expect(slugifyPlace("Delhi   NCR")).toBe("delhi-ncr");
  });

  it("handles empty string", () => {
    expect(slugifyPlace("")).toBe("");
    expect(slugifyPlace("   ")).toBe("");
  });
});

describe("toInternalVehicleId", () => {
  it("maps canonical tiers to internal IDs", () => {
    expect(toInternalVehicleId("sedan")).toBe("sedan");
    expect(toInternalVehicleId("ertiga")).toBe("ertiga");
    expect(toInternalVehicleId("innova-crysta")).toBe("innova");
    expect(toInternalVehicleId("tempo-traveller")).toBe("tempo");
    expect(toInternalVehicleId("urbania")).toBe("urbania");
  });

  it("maps partial matches to internal IDs", () => {
    expect(toInternalVehicleId("innova")).toBe("innova");
    expect(toInternalVehicleId("crysta")).toBe("innova");
    expect(toInternalVehicleId("tempo")).toBe("tempo");
    expect(toInternalVehicleId("force")).toBe("urbania");
  });

  it("defaults to sedan for unknown", () => {
    expect(toInternalVehicleId("unknown")).toBe("sedan");
    expect(toInternalVehicleId("")).toBe("sedan");
  });

  it("handles case insensitivity", () => {
    expect(toInternalVehicleId("SEDAN")).toBe("sedan");
    expect(toInternalVehicleId("Ertiga")).toBe("ertiga");
    expect(toInternalVehicleId("INNOVA")).toBe("innova");
  });

  it("trims whitespace", () => {
    expect(toInternalVehicleId("  sedan  ")).toBe("sedan");
    expect(toInternalVehicleId("\tertiga\n")).toBe("ertiga");
  });
});

describe("isGroupExceptionVehicle", () => {
  it("returns true for tempo traveller", () => {
    expect(isGroupExceptionVehicle("tempo")).toBe(true);
    expect(isGroupExceptionVehicle("tempo-traveller")).toBe(true);
  });

  it("returns true for urbania", () => {
    expect(isGroupExceptionVehicle("urbania")).toBe(true);
    expect(isGroupExceptionVehicle("force-urbania")).toBe(true);
  });

  it("returns false for standard vehicles", () => {
    expect(isGroupExceptionVehicle("sedan")).toBe(false);
    expect(isGroupExceptionVehicle("ertiga")).toBe(false);
    expect(isGroupExceptionVehicle("innova-crysta")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isGroupExceptionVehicle(null)).toBe(false);
    expect(isGroupExceptionVehicle(undefined)).toBe(false);
    expect(isGroupExceptionVehicle("")).toBe(false);
  });
});

describe("vehicleSpec", () => {
  it("returns spec for valid tiers", () => {
    const sedanSpec = vehicleSpec("sedan");
    expect(sedanSpec.id).toBe("sedan");
    expect(sedanSpec.name).toBe("Sedan");
    expect(sedanSpec.seats).toBe(4);
    expect(sedanSpec.bags).toBe(2);
    expect(sedanSpec.perKm).toBe(10);
    expect(sedanSpec.alwaysRoundTrip).toBe(false);
  });

  it("returns spec for tempo traveller", () => {
    const tempoSpec = vehicleSpec("tempo-traveller");
    expect(tempoSpec.id).toBe("tempo");
    expect(tempoSpec.seats).toBe(12);
    expect(tempoSpec.alwaysRoundTrip).toBe(true);
  });

  it("handles partial tier names", () => {
    const innovaSpec = vehicleSpec("innova");
    expect(innovaSpec.id).toBe("innova");
    expect(innovaSpec.name).toBe("Innova Crysta");
  });
});

describe("toVehicleTier", () => {
  it("maps internal IDs to canonical tiers", () => {
    expect(toVehicleTier("sedan")).toBe("sedan");
    expect(toVehicleTier("ertiga")).toBe("ertiga");
    expect(toVehicleTier("innova")).toBe("innova-crysta");
    expect(toVehicleTier("tempo")).toBe("tempo-traveller");
    expect(toVehicleTier("urbania")).toBe("urbania");
  });

  it("throws for unknown internal ID", () => {
    expect(() => toVehicleTier("unknown" as any)).toThrow("Unknown vehicle tier id");
  });
});

describe("nightAllowanceFor", () => {
  it("returns 300 for cab-tier vehicles", () => {
    expect(nightAllowanceFor("sedan")).toBe(300);
    expect(nightAllowanceFor("ertiga")).toBe(300);
    expect(nightAllowanceFor("innova-crysta")).toBe(300);
  });

  it("returns 500 for tempo and urbania", () => {
    expect(nightAllowanceFor("tempo")).toBe(500);
    expect(nightAllowanceFor("tempo-traveller")).toBe(500);
    expect(nightAllowanceFor("urbania")).toBe(500);
  });
});

describe("VEHICLES", () => {
  it("has 5 vehicle specifications", () => {
    expect(VEHICLES).toHaveLength(5);
  });

  it("all vehicles have required fields", () => {
    for (const vehicle of VEHICLES) {
      expect(vehicle.id).toBeTruthy();
      expect(vehicle.tier).toBeTruthy();
      expect(vehicle.name).toBeTruthy();
      expect(vehicle.seats).toBeGreaterThan(0);
      expect(vehicle.bags).toBeGreaterThanOrEqual(0);
      expect(vehicle.perKm).toBeGreaterThan(0);
      expect(typeof vehicle.alwaysRoundTrip).toBe("boolean");
    }
  });

  it("tempo and urbania have alwaysRoundTrip=true", () => {
    const tempo = VEHICLES.find((v) => v.id === "tempo");
    const urbania = VEHICLES.find((v) => v.id === "urbania");
    expect(tempo?.alwaysRoundTrip).toBe(true);
    expect(urbania?.alwaysRoundTrip).toBe(true);
  });

  it("sedan, ertiga, innova have alwaysRoundTrip=false", () => {
    const sedan = VEHICLES.find((v) => v.id === "sedan");
    const ertiga = VEHICLES.find((v) => v.id === "ertiga");
    const innova = VEHICLES.find((v) => v.id === "innova");
    expect(sedan?.alwaysRoundTrip).toBe(false);
    expect(ertiga?.alwaysRoundTrip).toBe(false);
    expect(innova?.alwaysRoundTrip).toBe(false);
  });
});

describe("LOCAL_PACKAGES", () => {
  it("has 3 local package types", () => {
    expect(Object.keys(LOCAL_PACKAGES)).toHaveLength(3);
  });

  it("each package has required fields", () => {
    for (const [key, pkg] of Object.entries(LOCAL_PACKAGES)) {
      expect(pkg.key).toBe(key);
      expect(pkg.label).toBeTruthy();
      expect(pkg.duration).toBeTruthy();
      expect(pkg.km).toBeGreaterThan(0);
      expect(pkg.fares).toBeDefined();
      expect(Object.keys(pkg.fares)).toHaveLength(5);
    }
  });

  it("8hr-80km has correct values", () => {
    const pkg = LOCAL_PACKAGES["8hr-80km"];
    expect(pkg.km).toBe(80);
    expect(pkg.fares.sedan).toBe(1900);
  });

  it("12hr-120km has correct values", () => {
    const pkg = LOCAL_PACKAGES["12hr-120km"];
    expect(pkg.km).toBe(120);
    expect(pkg.fares.sedan).toBe(2200);
  });

  it("airport-transfer has correct values", () => {
    const pkg = LOCAL_PACKAGES["airport-transfer"];
    expect(pkg.km).toBe(40);
    expect(pkg.fares.sedan).toBe(800);
  });
});

describe("AIRPORT_TRANSFERS", () => {
  it("has 3 airport transfer routes", () => {
    expect(Object.keys(AIRPORT_TRANSFERS)).toHaveLength(3);
  });

  it("each transfer has required fields", () => {
    for (const transfer of Object.values(AIRPORT_TRANSFERS)) {
      expect(transfer.name).toBeTruthy();
      expect(transfer.km).toBeGreaterThan(0);
      expect(transfer.fares).toBeDefined();
      expect(Object.keys(transfer.fares)).toHaveLength(5);
    }
  });
});

describe("PACKAGE_UPGRADES", () => {
  it("has upgrade surcharge for all 5 vehicles", () => {
    expect(Object.keys(PACKAGE_UPGRADES)).toHaveLength(5);
    expect(PACKAGE_UPGRADES.sedan).toBeDefined();
    expect(PACKAGE_UPGRADES.ertiga).toBeDefined();
    expect(PACKAGE_UPGRADES.innova).toBeDefined();
    expect(PACKAGE_UPGRADES.tempo).toBeDefined();
    expect(PACKAGE_UPGRADES.urbania).toBeDefined();
  });

  it("sedan has zero upgrade (baseline)", () => {
    expect(PACKAGE_UPGRADES.sedan).toBe(0);
  });

  it("all upgrades are non-negative", () => {
    for (const upgrade of Object.values(PACKAGE_UPGRADES)) {
      expect(upgrade).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("OUTSTATION_RULES", () => {
  it("has required configuration", () => {
    expect(OUTSTATION_RULES.minKmPerDay).toBe(300);
    expect(OUTSTATION_RULES.nightAllowanceCab).toBe(300);
    expect(OUTSTATION_RULES.nightAllowanceTempo).toBe(500);
    expect(OUTSTATION_RULES.nightStartHour).toBe(22);
    expect(OUTSTATION_RULES.nightEndHour).toBe(5);
    expect(OUTSTATION_RULES.sameDayRoundMultiplier).toBe(1.85);
  });
});
