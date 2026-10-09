import { describe, expect, it } from "vitest";
import { canTransition, assertTransition } from "../../src/shared/stateMachine.js";
import type { BookingStatus } from "../../src/types/domain.js";

describe("canTransition", () => {
  const ALL_STATUSES: BookingStatus[] = [
    "draft",
    "pending_payment",
    "paid_confirmed",
    "in_transit",
    "completed",
    "cancelled",
    "refunded",
  ];

  describe("draft transitions", () => {
    it("allows draft -> pending_payment", () => {
      expect(canTransition("draft", "pending_payment")).toBe(true);
    });
    it("allows draft -> cancelled", () => {
      expect(canTransition("draft", "cancelled")).toBe(true);
    });
    it("blocks draft -> paid_confirmed", () => {
      expect(canTransition("draft", "paid_confirmed")).toBe(false);
    });
    it("blocks draft -> completed", () => {
      expect(canTransition("draft", "completed")).toBe(false);
    });
    it("blocks draft -> in_transit", () => {
      expect(canTransition("draft", "in_transit")).toBe(false);
    });
    it("blocks draft -> refunded", () => {
      expect(canTransition("draft", "refunded")).toBe(false);
    });
  });

  describe("pending_payment transitions", () => {
    it("allows pending_payment -> paid_confirmed", () => {
      expect(canTransition("pending_payment", "paid_confirmed")).toBe(true);
    });
    it("allows pending_payment -> cancelled", () => {
      expect(canTransition("pending_payment", "cancelled")).toBe(true);
    });
    it("blocks pending_payment -> draft", () => {
      expect(canTransition("pending_payment", "draft")).toBe(false);
    });
    it("blocks pending_payment -> completed", () => {
      expect(canTransition("pending_payment", "completed")).toBe(false);
    });
    it("blocks pending_payment -> in_transit", () => {
      expect(canTransition("pending_payment", "in_transit")).toBe(false);
    });
    it("blocks pending_payment -> refunded", () => {
      expect(canTransition("pending_payment", "refunded")).toBe(false);
    });
  });

  describe("paid_confirmed transitions", () => {
    it("allows paid_confirmed -> in_transit", () => {
      expect(canTransition("paid_confirmed", "in_transit")).toBe(true);
    });
    it("allows paid_confirmed -> completed", () => {
      expect(canTransition("paid_confirmed", "completed")).toBe(true);
    });
    it("allows paid_confirmed -> refunded", () => {
      expect(canTransition("paid_confirmed", "refunded")).toBe(true);
    });
    it("allows paid_confirmed -> cancelled", () => {
      expect(canTransition("paid_confirmed", "cancelled")).toBe(true);
    });
    it("blocks paid_confirmed -> draft", () => {
      expect(canTransition("paid_confirmed", "draft")).toBe(false);
    });
    it("blocks paid_confirmed -> pending_payment", () => {
      expect(canTransition("paid_confirmed", "pending_payment")).toBe(false);
    });
  });

  describe("in_transit transitions", () => {
    it("allows in_transit -> completed", () => {
      expect(canTransition("in_transit", "completed")).toBe(true);
    });
    it("allows in_transit -> refunded", () => {
      expect(canTransition("in_transit", "refunded")).toBe(true);
    });
    it("blocks in_transit -> cancelled", () => {
      expect(canTransition("in_transit", "cancelled")).toBe(false);
    });
    it("blocks in_transit -> draft", () => {
      expect(canTransition("in_transit", "draft")).toBe(false);
    });
    it("blocks in_transit -> pending_payment", () => {
      expect(canTransition("in_transit", "pending_payment")).toBe(false);
    });
    it("blocks in_transit -> paid_confirmed", () => {
      expect(canTransition("in_transit", "paid_confirmed")).toBe(false);
    });
  });

  describe("terminal states (completed, cancelled, refunded)", () => {
    it("completed allows no transitions", () => {
      for (const target of ALL_STATUSES) {
        expect(canTransition("completed", target)).toBe(false);
      }
    });
    it("cancelled allows no transitions", () => {
      for (const target of ALL_STATUSES) {
        expect(canTransition("cancelled", target)).toBe(false);
      }
    });
    it("refunded allows no transitions", () => {
      for (const target of ALL_STATUSES) {
        expect(canTransition("refunded", target)).toBe(false);
      }
    });
  });
});

describe("assertTransition", () => {
  it("allows valid transitions without throwing", () => {
    expect(() => assertTransition("draft", "pending_payment")).not.toThrow();
    expect(() => assertTransition("draft", "cancelled")).not.toThrow();
    expect(() => assertTransition("pending_payment", "paid_confirmed")).not.toThrow();
    expect(() => assertTransition("paid_confirmed", "in_transit")).not.toThrow();
    expect(() => assertTransition("in_transit", "completed")).not.toThrow();
  });

  it("allows same-status (idempotent) transitions without throwing", () => {
    expect(() => assertTransition("draft", "draft")).not.toThrow();
    expect(() => assertTransition("completed", "completed")).not.toThrow();
    expect(() => assertTransition("cancelled", "cancelled")).not.toThrow();
    expect(() => assertTransition("refunded", "refunded")).not.toThrow();
    expect(() => assertTransition("pending_payment", "pending_payment")).not.toThrow();
    expect(() => assertTransition("paid_confirmed", "paid_confirmed")).not.toThrow();
    expect(() => assertTransition("in_transit", "in_transit")).not.toThrow();
  });

  it("throws INVALID_TRIP_TRANSITION for invalid transitions", () => {
    expect(() => assertTransition("draft", "completed")).toThrow(/Cannot transition booking/);
    expect(() => assertTransition("completed", "draft")).toThrow(/Cannot transition booking/);
    expect(() => assertTransition("cancelled", "draft")).toThrow(/Cannot transition booking/);
    expect(() => assertTransition("refunded", "paid_confirmed")).toThrow(/Cannot transition booking/);
  });

  it("includes from/to info in the error message", () => {
    try {
      assertTransition("completed", "draft");
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("INVALID_TRIP_TRANSITION");
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual({ from: "completed", to: "draft" });
    }
  });
});
