/**
 * Storefront Settings Contract & Registry (ECOM-012)
 *
 * Single source of truth for all store configuration keys consumed by both
 * the Admin Backoffice and the Next.js Storefront application.
 */

export type SettingType = "string" | "number" | "boolean" | "iban" | "phone" | "url";

export interface SettingDefinition {
  key: string;
  type: SettingType;
  required: boolean;
  label: string;
  description: string;
  category: "general" | "support" | "location" | "payments" | "notifications" | "fulfilment";
  defaultValue?: string | number | boolean;
  validator?: (value: unknown) => { valid: boolean; error?: string };
}

export const IBAN_REGEX = /^PK\d{2}[A-Z]{4}\d{16}$/;
export const PHONE_REGEX = /^(\+92|0)\d{9,10}$/;
export const CURRENCY_REGEX = /^[A-Z]{3}$/;
export const HTTPS_URL_REGEX = /^https:\/\/[^\s$.?#].[^\s]*$/;

export const STORE_SETTINGS_REGISTRY: Record<string, SettingDefinition> = {
  store_name: {
    key: "store_name",
    type: "string",
    required: true,
    label: "Store Name",
    description: "Brand name displayed on customer receipts, invoices, and browser titles.",
    category: "general",
    defaultValue: "ScrubX Pakistan",
    validator: (v) =>
      typeof v === "string" && v.trim().length >= 2
        ? { valid: true }
        : { valid: false, error: "Store name must be at least 2 characters." },
  },
  tagline: {
    key: "tagline",
    type: "string",
    required: false,
    label: "Store Tagline",
    description: "Short promotional tagline shown in headers and SEO meta descriptions.",
    category: "general",
    defaultValue: "Premium Medical Apparel & Scrubs in Pakistan",
  },
  support_email: {
    key: "support_email",
    type: "string",
    required: true,
    label: "Support Email",
    description: "Inbound customer support inquiries and tax invoice sender address.",
    category: "support",
    defaultValue: "support@scrubx.pk",
    validator: (v) =>
      typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
        ? { valid: true }
        : { valid: false, error: "Invalid email address format." },
  },
  support_phone: {
    key: "support_phone",
    type: "phone",
    required: true,
    label: "Support Phone",
    description: "Helpline phone number for shipping and invoice queries.",
    category: "support",
    defaultValue: "+923001234567",
    validator: (v) => {
      const clean = String(v || "").replace(/[\s-]/g, "");
      return PHONE_REGEX.test(clean)
        ? { valid: true }
        : { valid: false, error: "Phone must be a valid Pakistani number (e.g. +923001234567 or 03001234567)." };
    },
  },
  whatsapp_number: {
    key: "whatsapp_number",
    type: "phone",
    required: true,
    label: "WhatsApp Business Number",
    description: "Direct customer messaging channel for order updates.",
    category: "support",
    defaultValue: "+923001234567",
    validator: (v) => {
      const clean = String(v || "").replace(/[\s-]/g, "");
      return PHONE_REGEX.test(clean)
        ? { valid: true }
        : { valid: false, error: "WhatsApp number must be a valid Pakistani phone number." };
    },
  },
  address: {
    key: "address",
    type: "string",
    required: true,
    label: "Warehouse / Office Address",
    description: "Origin shipping address printed on packing slips and return labels.",
    category: "location",
    defaultValue: "Plot 12-C, 4th Commercial Lane, Zamzama, DHA Phase 5",
  },
  city: {
    key: "city",
    type: "string",
    required: true,
    label: "City",
    description: "Origin fulfilment hub city.",
    category: "location",
    defaultValue: "Karachi",
  },
  province: {
    key: "province",
    type: "string",
    required: true,
    label: "Province",
    description: "Origin province in Pakistan.",
    category: "location",
    defaultValue: "Sindh",
  },
  postal_code: {
    key: "postal_code",
    type: "string",
    required: false,
    label: "Postal Code",
    description: "Postal / zip code for origin logistics.",
    category: "location",
    defaultValue: "75500",
  },
  currency: {
    key: "currency",
    type: "string",
    required: true,
    label: "Store Currency",
    description: "Three-letter ISO 4217 currency code.",
    category: "general",
    defaultValue: "PKR",
    validator: (v) =>
      typeof v === "string" && CURRENCY_REGEX.test(v.trim())
        ? { valid: true }
        : { valid: false, error: "Currency must be a 3-letter uppercase ISO code (e.g. PKR)." },
  },
  payment_deadline_hours: {
    key: "payment_deadline_hours",
    type: "number",
    required: true,
    label: "Payment Due Window (Hours)",
    description: "Hours before awaiting-payment orders expire and reserved stock is restored.",
    category: "payments",
    defaultValue: 48,
    validator: (v) =>
      typeof v === "number" && v >= 1 && v <= 168
        ? { valid: true }
        : { valid: false, error: "Payment deadline must be between 1 and 168 hours." },
  },
  default_shipping_method_id: {
    key: "default_shipping_method_id",
    type: "string",
    required: false,
    label: "Default Shipping Method UUID",
    description: "Default fallback courier tier for storefront checkout.",
    category: "fulfilment",
  },
  order_confirmation_auto: {
    key: "order_confirmation_auto",
    type: "boolean",
    required: false,
    label: "Auto-Confirm COD Orders",
    description: "Automatically advance COD orders to confirmed without manual approval.",
    category: "fulfilment",
    defaultValue: false,
  },
  low_stock_alerts: {
    key: "low_stock_alerts",
    type: "boolean",
    required: false,
    label: "Low Stock Dashboard Alerts",
    description: "Flag inventory variants whose stock level is at or below reorder threshold.",
    category: "notifications",
    defaultValue: true,
  },
  new_order_email: {
    key: "new_order_email",
    type: "boolean",
    required: false,
    label: "Email Alert on New Order",
    description: "Send instant notification to store support on order placement.",
    category: "notifications",
    defaultValue: true,
  },
  new_order_whatsapp: {
    key: "new_order_whatsapp",
    type: "boolean",
    required: false,
    label: "WhatsApp Alert on New Order",
    description: "Send instant WhatsApp business alert on order placement.",
    category: "notifications",
    defaultValue: false,
  },
  payment_submitted_alert: {
    key: "payment_submitted_alert",
    type: "boolean",
    required: false,
    label: "Payment Proof Upload Alerts",
    description: "Display badge in topbar when customers upload payment screenshots.",
    category: "notifications",
    defaultValue: true,
  },
  daily_summary: {
    key: "daily_summary",
    type: "boolean",
    required: false,
    label: "Daily Financial Summary Digest",
    description: "Compile and present daily GMV and order throughput metrics.",
    category: "notifications",
    defaultValue: true,
  },
};

/**
 * Validates a single setting key-value pair against the storefront registry.
 */
export function validateStoreSetting(
  key: string,
  value: unknown,
  options: { allowUnknown?: boolean } = {}
): { valid: boolean; error?: string } {
  const def = STORE_SETTINGS_REGISTRY[key];

  if (!def) {
    if (options.allowUnknown) {
      return { valid: true };
    }
    return { valid: false, error: `Setting key '${key}' is not recognized in the storefront contract registry.` };
  }

  // Type check
  if (def.type === "boolean" && typeof value !== "boolean") {
    return { valid: false, error: `'${key}' must be a boolean.` };
  }
  if (def.type === "number" && typeof value !== "number") {
    return { valid: false, error: `'${key}' must be a numeric value.` };
  }
  if ((def.type === "string" || def.type === "phone" || def.type === "iban" || def.type === "url") && typeof value !== "string") {
    return { valid: false, error: `'${key}' must be a string value.` };
  }

  // Custom validator check
  if (def.validator) {
    return def.validator(value);
  }

  return { valid: true };
}
