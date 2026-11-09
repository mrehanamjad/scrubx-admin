import type { baUser, baSession, baAccount, baVerification } from "./auth.ts";
import type {
  productCategories,
  products,
  productColors,
  productVariants,
  productImages,
} from "./catalog.ts";
import type { inventory, inventoryMovements } from "./inventory.ts";
import type { engravingOptions } from "./engraving.ts";
import type { customers, addresses, customerNotes } from "./customers.ts";
import type { shippingMethods } from "./shipping.ts";
import type { coupons } from "./coupons.ts";
import type { paymentMethods } from "./payment-methods.ts";
import type {
  orders,
  orderItems,
  orderItemEngraving,
  orderCoupons,
  orderNotes,
  orderStatusHistory,
  orderReturns,
  orderReturnItems,
} from "./orders.ts";
import type { payments } from "./payments.ts";
import type { storeSettings } from "./settings.ts";
import type { auditLogs } from "./audit.ts";
import type { mediaUploads } from "./media.ts";
import type { notificationReads } from "./notifications.ts";

// Re-export JSON types and Enums
export type * from "./json-types.ts";
export type * from "./enums.ts";

// 1. Auth Types
export type BaUser = typeof baUser.$inferSelect;
export type NewBaUser = typeof baUser.$inferInsert;

export type BaSession = typeof baSession.$inferSelect;
export type NewBaSession = typeof baSession.$inferInsert;

export type BaAccount = typeof baAccount.$inferSelect;
export type NewBaAccount = typeof baAccount.$inferInsert;

export type BaVerification = typeof baVerification.$inferSelect;
export type NewBaVerification = typeof baVerification.$inferInsert;

// 2. Catalog Types
export type ProductCategory = typeof productCategories.$inferSelect;
export type NewProductCategory = typeof productCategories.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductColor = typeof productColors.$inferSelect;
export type NewProductColor = typeof productColors.$inferInsert;

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;

export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;

// 3. Inventory Types
export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;

export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;

// 4. Engraving Types
export type EngravingOption = typeof engravingOptions.$inferSelect;
export type NewEngravingOption = typeof engravingOptions.$inferInsert;

// 5. Customer & Address Types
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;

export type CustomerNote = typeof customerNotes.$inferSelect;
export type NewCustomerNote = typeof customerNotes.$inferInsert;

// 6. Shipping Types
export type ShippingMethod = typeof shippingMethods.$inferSelect;
export type NewShippingMethod = typeof shippingMethods.$inferInsert;

// 7. Coupon Types
export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;

// 8. Payment Method Types
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;

// 9. Order Types
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
/**
 * Note: lineTotal is a STORED GENERATED column in PostgreSQL (unit_price * quantity)
 * and is strictly excluded from insert mutations.
 */
export type NewOrderItem = typeof orderItems.$inferInsert;

export type OrderItemEngraving = typeof orderItemEngraving.$inferSelect;
export type NewOrderItemEngraving = typeof orderItemEngraving.$inferInsert;

export type OrderCoupon = typeof orderCoupons.$inferSelect;
export type NewOrderCoupon = typeof orderCoupons.$inferInsert;

export type OrderNote = typeof orderNotes.$inferSelect;
export type NewOrderNote = typeof orderNotes.$inferInsert;

export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistory = typeof orderStatusHistory.$inferInsert;

// 10. Payment Types
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// 11. Store Settings Types
export type StoreSetting = typeof storeSettings.$inferSelect;
export type NewStoreSetting = typeof storeSettings.$inferInsert;

// 12. Audit Log Types
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// 13. Returns & Exchange Types (ECOM-002, ECOM-003)
export type OrderReturn = typeof orderReturns.$inferSelect;
export type NewOrderReturn = typeof orderReturns.$inferInsert;

export type OrderReturnItem = typeof orderReturnItems.$inferSelect;
export type NewOrderReturnItem = typeof orderReturnItems.$inferInsert;

// 14. Media Upload Tracking Types (ECOM-008)
export type MediaUpload = typeof mediaUploads.$inferSelect;
export type NewMediaUpload = typeof mediaUploads.$inferInsert;

// 15. Notification Read Types (ECOM-011)
export type NotificationRead = typeof notificationReads.$inferSelect;
export type NewNotificationRead = typeof notificationReads.$inferInsert;
