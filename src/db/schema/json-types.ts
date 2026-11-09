/**
 * ScrubX Database JSONB Column Interfaces
 *
 * Strict compile-time typings for PostgreSQL JSONB columns.
 * Enforces NO index signatures ([key: string]: unknown) and NO invented fields.
 * Contains zero table or circular dependencies.
 */

/**
 * Extra attributes for product variants.
 * Captures UI generator metadata (e.g. manual addition toggle).
 */
export interface VariantAttributes {
  manual?: boolean;
}

/**
 * Immutable snapshot of the customer delivery address captured when an order is placed.
 */
export interface ShippingAddressSnapshot {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
  country: string;
}

/**
 * Record of an individual payment rejection event.
 */
export interface PaymentRejectionRecord {
  rejectedBy: string;
  rejectedAt: string;
  reason: string;
}

/**
 * Record of an individual payment refund event.
 */
export interface PaymentRefundRecord {
  amount: number;
  reason: string;
  refundedBy: string;
  refundedAt: string;
}

/**
 * Record of an administrative payment correction event.
 */
export interface PaymentCorrectionRecord {
  by: string;
  at: string;
  from: string;
  to: string;
  note: string;
}

/**
 * Optional metadata for manual bank transfer or mobile wallet payment records.
 * Tracks ImageKit file ID, upload timestamps, and rejection audit history.
 */
export interface PaymentMetadata {
  customerNotes?: string;
  imagekitFileId?: string;
  proofUploadedAt?: string;
  rejectionHistory?: PaymentRejectionRecord[];
  refundRequired?: boolean;
  refunds?: PaymentRefundRecord[];
  corrections?: PaymentCorrectionRecord[];
}

/**
 * Key-to-value mapping for store settings in key-value store.
 * Every supported key maps to its exact expected value type.
 */
export interface StoreSettingsMap {
  whatsapp_number: string;
  payment_deadline_hours: number;
  store_name: string;
  tagline: string;
  support_email: string;
  support_phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  currency: string;
  default_shipping_method_id: string;
  order_confirmation_auto: boolean;
  low_stock_alerts: boolean;
  new_order_email: boolean;
  new_order_whatsapp: boolean;
  payment_submitted_alert: boolean;
  daily_summary: boolean;
}

export type StoreSettingKey = keyof StoreSettingsMap;
export type StoreSettingValue<K extends StoreSettingKey> = StoreSettingsMap[K];
export type AnyStoreSettingValue = StoreSettingsMap[StoreSettingKey];
