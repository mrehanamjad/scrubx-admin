# Storefront Settings Contract & Registry (ECOM-012)

## Overview
This document defines the formal contract and configuration schema shared between the **ScrubX Admin Backoffice** and the consumer **Next.js Storefront** application. All operational, branding, contact, and checkout settings are stored centrally in PostgreSQL in the `store_settings` table (key-value JSONB storage) and validated via `src/lib/store-settings-registry.ts`.

---

## Contract Keys & Types

| Key | Type | Category | Required | Default Value | Description / Validation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `store_name` | `string` | General | Yes | `"ScrubX Pakistan"` | Store name printed on receipts, customer emails, invoices. Minimum length 2 chars. |
| `tagline` | `string` | General | No | `"Premium Medical Apparel & Scrubs in Pakistan"` | Marketing tagline displayed in headers and SEO meta descriptions. |
| `currency` | `string` | General | Yes | `"PKR"` | Three-letter ISO 4217 currency code. Must match `/^[A-Z]{3}$/`. |
| `support_email` | `string` | Support | Yes | `"support@scrubx.pk"` | Customer contact email and invoice sender address. Valid email regex. |
| `support_phone` | `phone` | Support | Yes | `"+923001234567"` | Customer helpline phone number. Valid Pakistani phone regex `/^(\+92\|0)\d{9,10}$/`. |
| `whatsapp_number` | `phone` | Support | Yes | `"+923001234567"` | Direct customer messaging channel. Valid Pakistani phone regex. |
| `address` | `string` | Location | Yes | `"Plot 12-C, 4th Commercial Lane, Zamzama, DHA Phase 5"` | Physical warehouse/office address printed on shipping labels & packing slips. |
| `city` | `string` | Location | Yes | `"Karachi"` | Fulfilment hub city. |
| `province` | `string` | Location | Yes | `"Sindh"` | Origin province. |
| `postal_code` | `string` | Location | No | `"75500"` | Origin postal/zip code. |
| `payment_deadline_hours` | `number` | Payments | Yes | `48` | Hours before an unpaid order expires (`ECOM-001`). Must be between 1 and 168. |
| `default_shipping_method_id` | `string` | Fulfilment | No | `null` | UUID of the default active courier tier for storefront checkout. |
| `order_confirmation_auto` | `boolean` | Fulfilment | No | `false` | When true, Cash on Delivery orders are auto-confirmed upon checkout. |
| `low_stock_alerts` | `boolean` | Notifications | No | `true` | When true, inventory variants at/below reorder threshold trigger admin alerts. |
| `new_order_email` | `boolean` | Notifications | No | `true` | Send immediate notification email to store support on order placement. |
| `new_order_whatsapp` | `boolean` | Notifications | No | `false` | Send automated WhatsApp message on order placement. |
| `payment_submitted_alert`| `boolean` | Notifications | No | `true` | Alert administrators when customer uploads a manual bank payment proof. |
| `daily_summary` | `boolean` | Notifications | No | `true` | Compile and present daily operational GMV and order throughput digests. |

---

## Validation & Audit Trail Rules

1. **Registry Enforcement**:
   - `SettingsService.updateSetting` and `SettingsService.updateSettingsBatch` invoke `validateStoreSetting` before writing to the database.
   - Any unknown or invalid values trigger a `ValidationError` (HTTP 400).

2. **Privilege Restrictions (SEC-013)**:
   - Reading store settings requires at least `staff` role.
   - Modifying any store setting requires `super_admin` role.

3. **Audit Logging (DB-014)**:
   - Every mutation is atomically recorded in `audit_logs` with `action: store_setting.update` or `store_settings.batch_update`.
   - The actor ID, role, previous value (`before`), and updated value (`after`) are captured.

---

## Consumption in Storefront & Admin

- **Admin Backoffice**: Accessed via `settingsService.getAllSettings()` in Server Components or `updateSettingsAction` in `src/actions/settings.ts`.
- **Public Storefront**: Can safely fetch public branding settings (`store_name`, `tagline`, `currency`, `support_email`, `support_phone`, `whatsapp_number`) via public cached endpoints while keeping internal alerts and keys hidden.
