import { couponRepository, CouponRepository, type CouponStatus, type CouponListItem, type CouponUsageRecord } from "../repositories/coupon.repository.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { db } from "../../db/index.ts";
import { ValidationError, NotFoundError, ConflictError } from "../errors.ts";
import {
  type CouponFilter,
  type CreateCouponInput,
  type UpdateCouponInput,
  type CouponUsageFilter,
  createCouponSchema,
  updateCouponSchema,
} from "../validation/coupons.ts";
import type { DatabaseExecutor, PaginatedResult } from "../repositories/base.repository.ts";
import type { Coupon } from "../../db/schema/types.ts";

export class CouponService {
  private readonly repo: CouponRepository;

  constructor(repo: CouponRepository = couponRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves paginated coupons with real-time computed statuses.
   * Requires at least staff role.
   */
  async getCoupons(filter: CouponFilter, admin: AdminContext): Promise<PaginatedResult<CouponListItem>> {
    assertRole(admin, ["staff"]);
    return this.repo.findPaginated(filter);
  }

  /**
   * Retrieves a single coupon by ID.
   * Requires at least staff role.
   */
  async getCouponById(id: string, admin: AdminContext): Promise<CouponListItem> {
    assertRole(admin, ["staff"]);
    const coupon = await this.repo.findById(id);
    if (!coupon) {
      throw new NotFoundError("Coupon", id);
    }

    return {
      ...coupon,
      computedStatus: this.repo.deriveStatus(coupon),
    };
  }

  /**
   * Creates a new marketing coupon.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async createCoupon(input: CreateCouponInput, admin: AdminContext): Promise<Coupon> {
    assertRole(admin, ["admin"]);

    const parseRes = createCouponSchema.safeParse(input);
    if (!parseRes.success) {
      throw new ValidationError(parseRes.error.issues.map((i) => i.message).join(", "));
    }
    const data = parseRes.data;

    const normalizedCode = data.code;

    // Verify code uniqueness
    const existing = await this.repo.findByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Coupon with code '${normalizedCode}' already exists.`);
    }

    return this.repo.create({
      code: normalizedCode,
      description: data.description ?? null,
      discountType: data.discountType as "percentage" | "fixed_amount",
      discountValue: String(data.discountValue),
      minimumOrderAmount: String(data.minimumOrderAmount),
      maximumDiscountAmount: data.maximumDiscountAmount ? String(data.maximumDiscountAmount) : null,
      usageLimit: data.usageLimit ?? null,
      usageLimitPerCustomer: data.usageLimitPerCustomer ?? null,
      firstOrderOnly: data.firstOrderOnly,
      startsAt: data.startsAt,
      expiresAt: data.expiresAt ?? null,
      isActive: data.isActive,
    });
  }

  /**
   * Updates an existing coupon with complete merged entity validation.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async updateCoupon(input: UpdateCouponInput, admin: AdminContext): Promise<Coupon> {
    assertRole(admin, ["admin"]);

    const parseRes = updateCouponSchema.safeParse(input);
    if (!parseRes.success) {
      throw new ValidationError(parseRes.error.issues.map((i) => i.message).join(", "));
    }
    const data = parseRes.data;

    const existing = await this.repo.findById(data.id);
    if (!existing) {
      throw new NotFoundError("Coupon", data.id);
    }

    // Merge partial update with existing record
    const merged = {
      ...existing,
      ...data,
      code: data.code ? data.code.trim().toUpperCase() : existing.code,
      startsAt: data.startsAt ? new Date(data.startsAt) : new Date(existing.startsAt),
      expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : (existing.expiresAt ? new Date(existing.expiresAt) : null),
      discountValue: data.discountValue !== undefined ? String(data.discountValue) : existing.discountValue,
      discountType: (data.discountType ?? existing.discountType) as "percentage" | "fixed_amount",
    };

    // 1. Code uniqueness check if modified
    if (merged.code !== existing.code) {
      const conflicting = await this.repo.findByCode(merged.code);
      if (conflicting && conflicting.id !== existing.id) {
        throw new ConflictError(`Coupon with code '${merged.code}' already exists.`);
      }
    }

    // 2. Date consistency check
    if (merged.expiresAt && merged.expiresAt <= merged.startsAt) {
      throw new ValidationError("Expiration date must be strictly after start date.");
    }

    // 3. Percentage cap check
    if (merged.discountType === "percentage" && Number(merged.discountValue) > 100) {
      throw new ValidationError("Percentage discount cannot exceed 100%.");
    }

    const updated = await this.repo.update(data.id, {
      code: merged.code,
      description: data.description !== undefined ? data.description : existing.description,
      discountType: merged.discountType,
      discountValue: merged.discountValue,
      minimumOrderAmount: data.minimumOrderAmount !== undefined ? String(data.minimumOrderAmount) : existing.minimumOrderAmount,
      maximumDiscountAmount: data.maximumDiscountAmount !== undefined ? (data.maximumDiscountAmount ? String(data.maximumDiscountAmount) : null) : existing.maximumDiscountAmount,
      usageLimit: data.usageLimit !== undefined ? data.usageLimit : existing.usageLimit,
      usageLimitPerCustomer: data.usageLimitPerCustomer !== undefined ? data.usageLimitPerCustomer : existing.usageLimitPerCustomer,
      firstOrderOnly: data.firstOrderOnly !== undefined ? data.firstOrderOnly : existing.firstOrderOnly,
      startsAt: merged.startsAt,
      expiresAt: merged.expiresAt,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
    });

    return updated!;
  }

  /**
   * Toggles the active status of a coupon.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async toggleCouponStatus(id: string, isActive: boolean, admin: AdminContext): Promise<Coupon> {
    assertRole(admin, ["admin"]);

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Coupon", id);
    }

    const updated = await this.repo.update(id, { isActive });
    return updated!;
  }

  /**
   * Safely deletes or deactivates a coupon.
   * If historical order_coupons records exist, executes safe deactivation to preserve invoices.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async deleteCoupon(
    id: string,
    admin: AdminContext
  ): Promise<{ deleted: boolean; deactivated: boolean; message: string }> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError("Coupon", id);
      }

      const usagesCount = await this.repo.checkHasOrderUsages(id, tx);
      if (usagesCount > 0) {
        // Safe deactivation to preserve foreign key constraints and historical invoices
        await this.repo.update(id, { isActive: false }, tx);
        return {
          deleted: false,
          deactivated: true,
          message: `Coupon '${existing.code}' has ${usagesCount} historical order redemptions and was deactivated instead of deleted.`,
        };
      }

      await this.repo.delete(id, tx);
      return {
        deleted: true,
        deactivated: false,
        message: `Coupon '${existing.code}' was permanently deleted.`,
      };
    });
  }

  /**
   * Retrieves usage history for a coupon.
   * Requires at least staff role.
   */
  async getCouponUsageHistory(
    couponId: string,
    filter: CouponUsageFilter,
    admin: AdminContext
  ): Promise<PaginatedResult<CouponUsageRecord>> {
    assertRole(admin, ["staff"]);

    const existing = await this.repo.findById(couponId);
    if (!existing) {
      throw new NotFoundError("Coupon", couponId);
    }

    return this.repo.findUsageHistory(filter);
  }

  /**
   * Authoritative coupon validation and row-locking method called during order placement.
   * Must run inside an active database transaction.
   * Enforces ADR 020: called after inventory locks are acquired.
   */
  async validateAndLockForOrder(
    code: string,
    subtotal: number,
    customerId: string,
    tx: DatabaseExecutor
  ): Promise<{ coupon: Coupon; discountAmount: number }> {
    const normalizedCode = code.trim().toUpperCase();

    // 1. Acquire exclusive pessimistic row lock
    const coupon = await this.repo.findForUpdateByCode(normalizedCode, tx);
    if (!coupon) {
      throw new ValidationError(`Coupon code '${normalizedCode}' was not found.`);
    }

    // 2. Real-time status checks
    const status = this.repo.deriveStatus(coupon);
    if (status === "inactive") {
      throw new ValidationError(`Coupon '${normalizedCode}' is currently inactive.`);
    }
    if (status === "scheduled") {
      throw new ValidationError(
        `Coupon '${normalizedCode}' is scheduled and not yet valid (starts on ${new Date(coupon.startsAt).toISOString().slice(0, 10)}).`
      );
    }
    if (status === "expired") {
      throw new ValidationError(`Coupon '${normalizedCode}' expired on ${new Date(coupon.expiresAt!).toISOString().slice(0, 10)}.`);
    }

    // 3. Minimum order amount check
    const minOrder = Number(coupon.minimumOrderAmount);
    if (subtotal < minOrder) {
      throw new ValidationError(
        `Order subtotal (PKR ${subtotal.toLocaleString()}) does not meet the minimum requirement of PKR ${minOrder.toLocaleString()} for coupon '${normalizedCode}'.`
      );
    }

    // 4. Global usage limit check
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new ValidationError(`Coupon '${normalizedCode}' has reached its global redemption limit.`);
    }

    // 5. Customer-specific rules inside the locked transaction
    if (customerId) {
      // First order only rule
      if (coupon.firstOrderOnly) {
        const nonCancelledOrders = await this.repo.getCustomerOrderCount(customerId, tx);
        if (nonCancelledOrders > 0) {
          throw new ValidationError(`Coupon '${normalizedCode}' is exclusively available for first-time customer orders.`);
        }
      }

      // Per-customer usage limit
      if (coupon.usageLimitPerCustomer !== null) {
        const customerUsages = await this.repo.getCustomerUsageCount(coupon.id, customerId, tx);
        if (customerUsages >= coupon.usageLimitPerCustomer) {
          throw new ValidationError(
            `You have already reached the maximum usage limit (${coupon.usageLimitPerCustomer}) for coupon '${normalizedCode}'.`
          );
        }
      }
    }

    // 6. Accurate discount calculation with 2-decimal rounding
    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      const pct = Number(coupon.discountValue);
      const rawDiscount = (subtotal * pct) / 100;
      discountAmount = Math.round(rawDiscount * 100) / 100;

      if (coupon.maximumDiscountAmount !== null) {
        const maxDiscount = Number(coupon.maximumDiscountAmount);
        discountAmount = Math.min(discountAmount, maxDiscount);
      }
    } else {
      discountAmount = Number(coupon.discountValue);
    }

    // Cap discount at subtotal to prevent negative totals
    discountAmount = Math.min(discountAmount, subtotal);

    return {
      coupon,
      discountAmount,
    };
  }

  /**
   * Releases an order's coupon redemption on order cancellation or refund (BUG-007, DB-007).
   * Atomically decrements usageCount and updates the order_coupons entry with releaseReason.
   * Idempotent: safe to invoke multiple times.
   */
  async releaseOrderRedemption(
    orderId: string,
    tx: DatabaseExecutor,
    reason: "order_cancelled" | "order_refunded" | "admin_correction" = "order_cancelled"
  ): Promise<boolean> {
    return this.repo.releaseRedemption(orderId, tx, reason);
  }
}

export const couponService = new CouponService();
