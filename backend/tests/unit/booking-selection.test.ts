import { describe, expect, it } from "vitest";
import { BookingSelectionSchema } from "../../src/shared/bookingSelection.js";

describe("BookingSelectionSchema", () => {
  describe("outstation selection", () => {
    it("accepts valid one-way outstation selection", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "agra-to-delhi",
        tripType: "one-way",
        originName: "Agra",
        destinationName: "Delhi",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid round-trip outstation selection", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "agra-delhi-round",
        tripType: "round-trip",
        originName: "Agra",
        destinationName: "Delhi",
        name: "Agra-Delhi Round Trip",
      });
      expect(result.success).toBe(true);
    });

    it("rejects outstation without origin", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "test",
        tripType: "one-way",
        originName: "",
        destinationName: "Delhi",
      });
      expect(result.success).toBe(false);
    });

    it("rejects outstation without destination", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "test",
        tripType: "one-way",
        originName: "Agra",
        destinationName: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid trip type", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "test",
        tripType: "invalid-type",
        originName: "Agra",
        destinationName: "Delhi",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("local selection", () => {
    it("accepts valid catalog local selection", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "local",
        id: "agra-sightseeing",
        source: "catalog",
        slug: "agra-8hr-tour",
        tripType: "local-tour",
        pickupLocation: "Taj East Gate",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid curated local selection with package key", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "local",
        id: "local-tour-1",
        source: "curated",
        tripType: "local-tour",
        localPackageKey: "8hr-80km",
        pickupLocation: "Hotel Pickup",
      });
      expect(result.success).toBe(true);
    });

    it("accepts airport transfer selection", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "local",
        id: "airport-transfer-1",
        source: "curated",
        tripType: "airport-transfer",
        localPackageKey: "airport-transfer",
        pickupLocation: "Hotel Address",
        transferTarget: "IGI Airport T3",
      });
      expect(result.success).toBe(true);
    });

    it("rejects catalog source without slug", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "local",
        id: "test",
        source: "catalog",
        tripType: "local-tour",
        pickupLocation: "Hotel",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("slug"))).toBe(true);
      }
    });

    it("rejects curated source without localPackageKey", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "local",
        id: "test",
        source: "curated",
        tripType: "local-tour",
        pickupLocation: "Hotel",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("localPackageKey"))).toBe(true);
      }
    });

    it("rejects invalid local package key", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "local",
        id: "test",
        source: "curated",
        tripType: "local-tour",
        localPackageKey: "invalid-key",
        pickupLocation: "Hotel",
      });
      expect(result.success).toBe(false);
    });

    it("accepts legacy source without slug or package key", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "local",
        id: "legacy-1",
        source: "legacy",
        tripType: "local-tour",
        pickupLocation: "Old Location",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("package selection", () => {
    it("accepts valid package selection", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "package",
        id: "golden-triangle",
        source: "catalog",
        slug: "golden-triangle-tour",
      });
      expect(result.success).toBe(true);
    });

    it("accepts package selection with name", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "package",
        id: "agra-day",
        source: "catalog",
        slug: "agra-sightseeing",
        name: "Same Day Agra Tour",
      });
      expect(result.success).toBe(true);
    });

    it("rejects package without slug", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "package",
        id: "test",
        source: "catalog",
      });
      expect(result.success).toBe(false);
    });

    it("rejects package with empty slug", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "package",
        id: "test",
        source: "catalog",
        slug: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("common validation", () => {
    it("rejects invalid id format", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "invalid id with spaces",
        tripType: "one-way",
        originName: "Agra",
        destinationName: "Delhi",
      });
      expect(result.success).toBe(false);
    });

    it("rejects id with special characters", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "invalid@id#",
        tripType: "one-way",
        originName: "Agra",
        destinationName: "Delhi",
      });
      expect(result.success).toBe(false);
    });

    it("accepts id with allowed characters", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "outstation",
        id: "valid-id_123.test",
        tripType: "one-way",
        originName: "Agra",
        destinationName: "Delhi",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unknown kind", () => {
      const result = BookingSelectionSchema.safeParse({
        kind: "unknown",
        id: "test",
      });
      expect(result.success).toBe(false);
    });
  });
});
