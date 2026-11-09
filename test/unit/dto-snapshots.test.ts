import { describe, it, expect } from "vitest";
import {
  toCategoryDTO,
  toProductBundleDTO,
  toProductListItemDTO,
  toCustomerDTO,
  toOrderDTO,
  toPaymentSubmissionDTO,
  toCouponDTO,
  toShippingMethodDTO,
  toEngravingOptionDTO,
  toPaymentMethodDTO,
} from "../../src/lib/dto.ts";

describe("TEST-003: DTO Snapshots & Anti-Fabrication Test Suite", () => {
  it("transforms Category DTO accurately", () => {
    const fixture = {
      id: "cat-1",
      name: "Classic Scrubs",
      slug: "classic-scrubs",
      description: "Standard hospital scrubs",
      parentId: null,
      imageUrl: "https://ik.imagekit.io/scrubx/cats/classic.jpg",
      imageFileId: "ik_cat_1",
      isActive: true,
      sortOrder: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      productCount: 12,
    };

    const dto = toCategoryDTO(fixture);
    expect(dto).toEqual({
      id: "cat-1",
      name: "Classic Scrubs",
      slug: "classic-scrubs",
      parentId: null,
      description: "Standard hospital scrubs",
      image: "https://ik.imagekit.io/scrubx/cats/classic.jpg",
      imageFileId: "ik_cat_1",
      sortOrder: 1,
      status: "active",
    });
  });

  it("transforms Coupon DTO accurately", () => {
    const fixture = {
      id: "coup-1",
      code: "WELCOME15",
      description: "15% discount for new customers",
      discountType: "percentage" as const,
      discountValue: "15.00",
      minimumOrderAmount: "3000.00",
      maximumDiscountAmount: "1000.00",
      usageLimit: 100,
      usageCount: 10,
      usageLimitPerCustomer: 1,
      firstOrderOnly: true,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-12-31T23:59:59.000Z"),
      isActive: true,
      computedStatus: "active" as const,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const dto = toCouponDTO(fixture);
    expect(dto.code).toBe("WELCOME15");
    expect(dto.type).toBe("percentage");
    expect(dto.value).toBe(15);
    expect(dto.minOrderAmount).toBe(3000);
    expect(dto.maxDiscount).toBe(1000);
    expect(dto.usedCount).toBe(10);
    expect(dto.usageLimit).toBe(100);
    expect(dto.firstOrderOnly).toBe(true);
    expect(dto.status).toBe("active");
  });

  it("transforms Shipping Method DTO accurately", () => {
    const fixture = {
      id: "ship-1",
      name: "Standard TCS Courier",
      code: "tcs_standard",
      description: "All Pakistan 2-4 working days",
      price: "350.00",
      estimatedDays: 3,
      minDays: 2,
      maxDays: 4,
      freeAbove: "5000.00",
      sortOrder: 1,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const dto = toShippingMethodDTO(fixture as any);
    expect(dto).toEqual({
      id: "ship-1",
      name: "Standard TCS Courier",
      description: "All Pakistan 2-4 working days",
      price: 350,
      minDays: 2,
      maxDays: 4,
      freeShippingThreshold: 5000,
      active: true,
      displayOrder: 1,
    });
  });

  it("transforms Engraving Option DTO accurately", () => {
    const fixture = {
      id: "eng-1",
      name: "Chest Name Embroidery",
      type: "name" as const,
      description: "",
      price: "350.00",
      maxCharacters: 12,
      sortOrder: 1,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const dto = toEngravingOptionDTO(fixture as any);
    expect(dto).toEqual({
      id: "eng-1",
      name: "Chest Name Embroidery",
      type: "name",
      description: "",
      price: 350,
      maxCharacters: 12,
      active: true,
    });
  });

  it("transforms Payment Method DTO accurately", () => {
    const fixture = {
      id: "pm-1",
      code: "bank_transfer",
      name: "Standard Chartered Bank",
      instructions: "Transfer to IBAN PK36SCBL0000001123456701",
      accountTitle: "ScrubX Apparel",
      accountNumber: "01-1234567-01",
      bankName: "Standard Chartered Bank Pakistan",
      branchCode: "0123",
      iban: "PK36SCBL0000001123456701",
      allowedWithEngraving: true,
      supportsProof: true,
      sortOrder: 1,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const dto = toPaymentMethodDTO(fixture as any);
    expect(dto.id).toBe("bank");
    expect(dto.dbId).toBe("pm-1");
    expect(dto.name).toBe("Standard Chartered Bank");
    expect(dto.bankName).toBe("Standard Chartered Bank Pakistan");
    expect(dto.allowEngraving).toBe(true);
    expect(dto.supportsProof).toBe(true);
  });

  describe("Anti-Fabrication Invariants", () => {
    it("does NOT fabricate proofUrl or reviewedAt when absent on PaymentSubmission DTO", () => {
      const barePayment = {
        id: "pay-100",
        orderId: "ord-100",
        amount: "4500.00",
        paymentMethodCode: "bank_transfer",
        transactionReference: null,
        proofUrl: null,
        status: "awaiting_verification" as const,
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
        metadata: {},
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };

      const dto = toPaymentSubmissionDTO(barePayment as any);
      expect(dto.proofUrl).toBeUndefined();
      expect(dto.reviewedAt).toBeUndefined();
      expect(dto.rejectionReason).toBeUndefined();
      expect(dto.transactionRef).toBe("—");
      expect(dto.isDuplicate).toBe(false);
    });

    it("does NOT fabricate notes or trackingNumber on Order DTO when absent", () => {
      const bareOrder = {
        id: "ord-101",
        orderNumber: "SX-100101",
        customerId: "cust-1",
        status: "awaiting_payment" as const,
        currency: "PKR",
        subtotal: "4500.00",
        engravingTotal: "0.00",
        discountTotal: "0.00",
        shippingTotal: "0.00",
        taxTotal: "0.00",
        total: "4500.00",
        hasEngraving: false,
        paymentMethodId: "pm-1",
        paymentMethodCode: "bank_transfer",
        paymentMethodName: "Bank Transfer",
        shippingMethodId: null,
        shippingMethodName: null,
        contactPhone: "+923001234567",
        shippingAddress: {
          fullName: "Dr. Ayesha",
          phone: "+923001234567",
          addressLine1: "Clinic 4, Main Boulevard",
          city: "Lahore",
          province: "Punjab",
          country: "PK",
        },
        notes: null,
        courier: null,
        trackingNumber: null,
        paymentDueAt: null,
        placedAt: new Date("2026-01-01T00:00:00.000Z"),
        shippedAt: null,
        deliveredAt: null,
        cancelledAt: null,
        items: [],
        timeline: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };

      const dto = toOrderDTO(bareOrder as any);
      expect((dto as any).notes).toBeUndefined();
      expect(dto.trackingNumber).toBeUndefined();
      expect(dto.courier).toBeUndefined();
      expect((dto as any).shippedAt).toBeUndefined();
      expect((dto as any).deliveredAt).toBeUndefined();
      expect((dto as any).cancelledAt).toBeUndefined();
    });
  });
});
