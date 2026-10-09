import { describe, expect, it } from "vitest";
import {
  calculateCancellationRefund,
  DEFAULT_CANCELLATION_SLABS,
  type CancellationPolicySlab,
} from "../../src/modules/fares/cancellation.engine.js";

describe("calculateCancellationRefund", () => {
  describe("cab policy (outstation)", () => {
    it("gives 100% refund for 24+ hours notice", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 24,
        paidAmountMinor: 10000,
      });
      expect(result.refundPercent).toBe(100);
      expect(result.feeRetainedPercent).toBe(0);
      expect(result.refundAmountMinor).toBe(10000);
      expect(result.feeRetainedAmountMinor).toBe(0);
      expect(result.slabId).toBe("cab-slab-1");
    });

    it("gives 100% refund for 48 hours notice", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 48,
        paidAmountMinor: 10000,
      });
      expect(result.refundPercent).toBe(100);
      expect(result.refundAmountMinor).toBe(10000);
    });

    it("gives 0% refund for <24 hours notice", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 12,
        paidAmountMinor: 10000,
      });
      expect(result.refundPercent).toBe(0);
      expect(result.feeRetainedPercent).toBe(100);
      expect(result.refundAmountMinor).toBe(0);
      expect(result.feeRetainedAmountMinor).toBe(10000);
      expect(result.slabId).toBe("cab-slab-2");
    });

    it("gives 0% refund for 1 hour notice", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 1,
        paidAmountMinor: 10000,
      });
      expect(result.refundPercent).toBe(0);
      expect(result.feeRetainedAmountMinor).toBe(10000);
    });

    it("gives 0% refund for no-show (0 hours)", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 0,
        paidAmountMinor: 10000,
      });
      expect(result.refundPercent).toBe(0);
      expect(result.feeRetainedPercent).toBe(100);
      expect(result.slabId).toBe("cab-slab-3");
    });

    it("handles zero paid amount", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 48,
        paidAmountMinor: 0,
      });
      expect(result.refundAmountMinor).toBe(0);
      expect(result.feeRetainedAmountMinor).toBe(0);
    });

    it("handles negative paid amount safely", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 48,
        paidAmountMinor: -1000,
      });
      expect(result.refundAmountMinor).toBe(0);
      expect(result.feeRetainedAmountMinor).toBe(0);
    });

    it("handles fractional paid amount", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 48,
        paidAmountMinor: 10000.75,
      });
      expect(result.refundAmountMinor).toBe(10000);
    });
  });

  describe("tour_package policy", () => {
    it("gives 100% refund for 61+ days notice", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 61 * 24,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(100);
      expect(result.feeRetainedPercent).toBe(0);
      expect(result.refundAmountMinor).toBe(50000);
      expect(result.slabId).toBe("tour-slab-1");
    });

    it("gives 90% refund for 46-60 days notice (10% fee)", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 50 * 24,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(90);
      expect(result.feeRetainedPercent).toBe(10);
      expect(result.refundAmountMinor).toBe(45000);
      expect(result.feeRetainedAmountMinor).toBe(5000);
      expect(result.slabId).toBe("tour-slab-2");
    });

    it("gives 80% refund for 31-45 days notice (20% fee)", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 40 * 24,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(80);
      expect(result.feeRetainedPercent).toBe(20);
      expect(result.refundAmountMinor).toBe(40000);
      expect(result.feeRetainedAmountMinor).toBe(10000);
      expect(result.slabId).toBe("tour-slab-3");
    });

    it("gives 70% refund for 16-30 days notice (30% fee)", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 20 * 24,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(70);
      expect(result.feeRetainedPercent).toBe(30);
      expect(result.refundAmountMinor).toBe(35000);
      expect(result.feeRetainedAmountMinor).toBe(15000);
      expect(result.slabId).toBe("tour-slab-4");
    });

    it("gives 45% refund for 6-15 days notice (55% fee)", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 10 * 24,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(45);
      expect(result.feeRetainedPercent).toBe(55);
      expect(result.refundAmountMinor).toBe(22500);
      expect(result.feeRetainedAmountMinor).toBe(27500);
      expect(result.slabId).toBe("tour-slab-5");
    });

    it("gives 0% refund for 0-5 days notice (100% fee)", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 3 * 24,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(0);
      expect(result.feeRetainedPercent).toBe(100);
      expect(result.refundAmountMinor).toBe(0);
      expect(result.feeRetainedAmountMinor).toBe(50000);
      expect(result.slabId).toBe("tour-slab-6");
    });

    it("gives 0% refund for no-show (0 hours)", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 0,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(0);
      expect(result.feeRetainedAmountMinor).toBe(50000);
    });

    it("handles boundary at exactly 60 days", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 60 * 24,
        paidAmountMinor: 50000,
      });
      // 60 days is in the 46-60 range (90% refund)
      expect(result.refundPercent).toBe(90);
    });

    it("handles boundary at exactly 61 days", () => {
      const result = calculateCancellationRefund({
        policyType: "tour_package",
        noticeHours: 61 * 24,
        paidAmountMinor: 50000,
      });
      expect(result.refundPercent).toBe(100);
    });
  });

  describe("custom policies", () => {
    it("uses custom policy slabs when provided", () => {
      const customSlabs: CancellationPolicySlab[] = [
        {
          id: "custom-1",
          policyType: "cab",
          noticePeriodText: "48+ hours",
          sortOrder: 1,
          feeRetainedPercent: 0,
          refundPercent: 100,
          ruleText: "Custom full refund",
        },
        {
          id: "custom-2",
          policyType: "cab",
          noticePeriodText: "<48 hours",
          sortOrder: 2,
          feeRetainedPercent: 50,
          refundPercent: 50,
          ruleText: "Custom 50% refund",
        },
      ];

      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 12,
        paidAmountMinor: 10000,
        customPolicies: customSlabs,
      });

      // Should use custom slab for <24 hours (the 50% fee one)
      expect(result.refundPercent).toBe(50);
      expect(result.refundAmountMinor).toBe(5000);
      expect(result.slabId).toBe("custom-2");
    });

    it("falls back to default slabs when custom policies are empty", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 48,
        paidAmountMinor: 10000,
        customPolicies: [],
      });

      expect(result.refundPercent).toBe(100);
      expect(result.slabId).toBe("cab-slab-1");
    });
  });

  describe("DEFAULT_CANCELLATION_SLABS", () => {
    it("contains 9 baseline slabs", () => {
      expect(DEFAULT_CANCELLATION_SLABS).toHaveLength(9);
    });

    it("has 3 cab slabs", () => {
      const cabSlabs = DEFAULT_CANCELLATION_SLABS.filter((s) => s.policyType === "cab");
      expect(cabSlabs).toHaveLength(3);
    });

    it("has 6 tour package slabs", () => {
      const tourSlabs = DEFAULT_CANCELLATION_SLABS.filter((s) => s.policyType === "tour_package");
      expect(tourSlabs).toHaveLength(6);
    });

    it("cab slabs have correct structure", () => {
      const cabSlabs = DEFAULT_CANCELLATION_SLABS.filter((s) => s.policyType === "cab");
      expect(cabSlabs[0].refundPercent).toBe(100);
      expect(cabSlabs[1].refundPercent).toBe(0);
      expect(cabSlabs[2].refundPercent).toBe(0);
    });

    it("tour package slabs have tiered refund percentages", () => {
      const tourSlabs = DEFAULT_CANCELLATION_SLABS.filter((s) => s.policyType === "tour_package");
      const percentages = tourSlabs.map((s) => s.refundPercent);
      expect(percentages).toEqual([100, 90, 80, 70, 45, 0]);
    });
  });

  describe("edge cases", () => {
    it("handles very large paid amounts", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 48,
        paidAmountMinor: 1000000,
      });
      expect(result.refundAmountMinor).toBe(1000000);
    });

    it("handles very small paid amounts", () => {
      const result = calculateCancellationRefund({
        policyType: "cab",
        noticeHours: 12,
        paidAmountMinor: 100,
      });
      expect(result.refundAmountMinor).toBe(0);
      expect(result.feeRetainedAmountMinor).toBe(100);
    });

    it("refund + fee always equals paid amount", () => {
      const testCases = [
        { policyType: "cab" as const, noticeHours: 48, paidAmountMinor: 12345 },
        { policyType: "cab" as const, noticeHours: 12, paidAmountMinor: 12345 },
        { policyType: "tour_package" as const, noticeHours: 50 * 24, paidAmountMinor: 12345 },
        { policyType: "tour_package" as const, noticeHours: 10 * 24, paidAmountMinor: 12345 },
      ];

      for (const tc of testCases) {
        const result = calculateCancellationRefund(tc);
        expect(result.refundAmountMinor + result.feeRetainedAmountMinor).toBe(
          Math.max(0, Math.floor(tc.paidAmountMinor)),
        );
      }
    });
  });
});
