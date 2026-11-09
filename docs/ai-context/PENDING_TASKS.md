# ScrubX Admin — Project Roadmap & Pending Tasks

> **Permanent AI Context Documentation**  
> *Last Updated: November 2026 (Phase 7 Completed — All Modules Live & Zero-Mock Decommissioned)*

---

## 1. Project Phase Status Overview

| Phase | Description | Status | Verification Status |
|---|---|---|---|
| **Pre-Audit** | Vite React SPA $\to$ Next.js 16 App Router migration | **Completed** | Production build passes (15 routes) |
| **Skills** | Custom Agent Skills authoring (`.agent/`) | **Completed** | 4 skill files written & registered |
| **Phase 0** | Codebase audit & architecture analysis | **Completed** | Full audit artifact accepted |
| **Phase 1** | Supabase PostgreSQL infrastructure & Drizzle ORM | **Completed** | Connected & verified with live database |
| **Phase 2** | Better Auth integration & route protection | **Completed** | 22/22 tests passed, admin seeded, middleware active |
| **Phase 2.5** | AI Context & Context Management Skill | **Completed** | 8 context files & skill operational |
| **Phase 3** | Implement & Finalize PostgreSQL Database Schema | **Completed** | 25 tables, modular schema, 8/8 parity passed, 5/5 integrity passed |
| **Phase 4** | ImageKit media pipeline integration | **Completed** | 17/17 connection tests passed, 6/6 live lifecycle passed, forms integrated |
| **Phase 5** | Production-Ready Backend Architecture (DAL & Foundation) | **Completed** | 46/46 architecture tests passed, 7-layer architecture, safe action pipeline |
| **Phase 6A** | Implement Product & Category Backend (DAL & Actions) | **Completed** | 43/43 catalog tests passed, 0 errors in build, atomic transactions |
| **Phase 6B** | Implement Inventory Management Backend (DAL & Actions) | **Completed** | 47/47 inventory tests passed, concurrency locks, dual-counter ledger |
| **Phase 6C** | Implement Orders, Customers & Payments Backend (Server Actions First) | **Completed** | 60/60 tests passed, global lock ordering, 4-way cancellation semantics |
| **Phase 6D** | Implement Remaining ScrubX Admin Backends (Coupons, Shipping, Engraving, Payments, Settings) | **Completed** | 78/78 tests passed, authoritative redemption, safe deactivation, COD invariants |
| **Phase 7** | Frontend-to-Backend Full Integration & Zero-Mock Decommissioning | **Completed** | 100% UI preservation, 0 read Server Actions (ADR 019), 0 mock references, next build passes |

---

## 2. Implemented & Verified Functionality

- [x] **Next.js 16 App Router Core:** Async `params` and `searchParams` properly typed and awaited across all routes.
- [x] **PostgreSQL Database Connection:** Drizzle ORM connected to Supabase Supavisor transaction pooler on port 6543 (`prepare: false`).
- [x] **Pure Modular Schema Architecture:** All 25 tables organized into domain-driven modular files in `src/db/schema/` with root `index.ts`. Monolithic `src/db/schema.ts` facade eliminated.
- [x] **Database Schema Migrations:** Raw SQL migrations `20261105000000_initial_schema.sql` and `20261105000001_phase3_schema_refinements.sql` applied to live PostgreSQL.
- [x] **New Tables & UI Columns Added:**
  - `order_notes`: UUID PK, cascade on `order_id`, non-empty body check, created_by, RLS enabled.
  - `product_categories.image_file_id`: For ImageKit deletion/management.
  - `products.is_featured`: Boolean default false.
  - `shipping_methods.min_days` & `shipping_methods.max_days`: Integer transit windows.
  - `payment_methods.supports_proof`: Boolean proof requirement flag.
- [x] **Canonical Lowercase Roles:** User roles standardized to `super_admin`, `admin`, `staff`, `customer`. Database check constraint updated, Better Auth admin plugin updated, and auth guard helpers updated.
- [x] **Strict Non-Circular JSONB Typings:** `json-types.ts` contains `VariantAttributes`, `ShippingAddressSnapshot`, `PaymentMetadata`, and `StoreSettingsMap` with zero table dependencies and no index signatures. Matching runtime Zod validation in `json-schemas.ts`.
- [x] **Stored Generated Column:** `order_items.line_total` declared with `.generatedAlwaysAs(sql\`("unit_price" * "quantity")\`)`. Excluded from `NewOrderItem` insert type; tested rejection on explicit insert and verified automatic calculation.
- [x] **PostgreSQL Triggers Active:** `check_engraving_cod_rule` (prohibits COD on engraved orders), `generate_order_number` (`SX-10xx` sequence), and `update_updated_at_column`.
- [x] **Three-Pillar Schema Verification:**
  - Pillar B: `npm run db:parity` verified 25/25 tables, column types, nullability, 5 enums, 31 foreign keys, indexes, triggers, and RLS on every table.
  - Pillar C: `npm run db:integrity` verified 5/5 business rules inside rolled-back transaction.
- [x] **Better Auth Test Suite:** `npm run auth:test` passed 22/22 assertions with `super_admin`.
- [x] **ImageKit Media Pipeline Integration (Phase 4):**
  - Official SDK (`imagekit@^6.0.0`) configured with lazy Proxy singleton in `src/lib/imagekit.ts`.
  - Next.js remotePatterns configured for `ik.imagekit.io` in `next.config.ts`.
  - Ephemeral signature generation route `GET /api/upload/auth` protected by `requireStaff()`.
  - Client-side upload utility with `XMLHttpRequest` progress tracking in `src/lib/imagekit-upload.ts`.
  - Edge URL transformer with responsive presets (`getImageThumbnailUrl`, `getProductCardImageUrl`, `getProductHeroImageUrl`, `getCategoryBannerUrl`) in `src/lib/imagekit-url.ts`.
  - Server actions `deleteMediaAction` and `uploadServerMediaAction` in `src/actions/media.ts`.
  - Accessible, drag-and-drop `ImageUpload` component in `src/components/shared/image-upload.tsx`.
  - Integrated into `src/views/ProductForm.tsx` (with color variant tagging and deletion) and `src/views/Categories.tsx`.
  - Automated tests: `npm run imagekit:test` (17/17 passed), `npm run imagekit:lifecycle` (6/6 passed live upload/delete).
- [x] **Production-Ready Backend Architecture (Phase 5):**
  - Standardized 7-layer architecture: Database Layer (`src/db/`), Repositories (`src/server/repositories/`), Services (`src/server/services/`), Validation Schemas (`src/server/validation/`), Error Handling (`src/server/errors.ts`), Action Pipeline Wrapper (`src/server/action-client.ts`), and Server Actions (`src/actions/`).
  - Strict server-side Zod input validation: UUID, slug, non-negative PKR price, non-negative quantity, pagination with 100 limit ceiling, date ranges, and file metadata.
  - Centralized domain errors (`AppError`, `AuthenticationError`, `AuthorizationError`, `ValidationError`, `NotFoundError`, `ConflictError`, `DatabaseError`) and universal `toActionError()` masking Postgres constraint codes (23505, 23503, 23514) to prevent database leaks.
  - Server-side auth context (`getCurrentAdmin()`, `assertRole()`, `hasMinimumRole()`, `requireStaffContext()`, `requireAdminContext()`, `requireSuperAdminContext()`).
  - Type-safe `createSafeAction` higher-order wrapper automatically verifying authorization, validating Zod input schemas, and returning standardized `ActionResponse<T>`.
  - Foundational data access with `SettingsRepository` (live `store_settings` queries, atomic upserts via `.onConflictDoUpdate()`, `SELECT NOW()` healthcheck) and `SettingsService`.
  - Authenticated Server Actions in `src/actions/settings.ts` (`getStoreSettingsAction`, `updateStoreSettingAction`, `getDatabaseHealthAction`).
  - Automated test suite `src/scripts/test-backend-architecture.ts` (`npm run backend:test`) passing 46/46 assertions.
- [x] **Product & Category Backend Architecture (Phase 6A):**
  - Category Repository (`src/server/repositories/category.repository.ts`): Aggregated SQL `productCount`, hierarchy tree queries, circular hierarchy check, and safe deletion reassignment.
  - Product Repository (`src/server/repositories/product.repository.ts`): Multi-condition catalog listing (`q`, `categoryId`, `status`, `gender`, `isFeatured`, `inStock`), sorting, pagination with total count, and deep product bundle queries (product, category, colors, variants with inventory, images).
  - Business Services (`src/server/services/category.service.ts`, `src/server/services/product.service.ts`):
    - Category CRUD, activation toggle, ImageKit asset deletion cleanup post-commit, safe deletion guard (blocks deletion if products are active unless `reassignToCategoryId` is provided).
    - Atomic product creation (`db.transaction`): base product, colors with mapped IDs, variants with unique SKUs, automatic `inventory` row initialization (`quantityOnHand = variant.stock`), automatic `inventory_movements` restock log with admin attribution, and images.
    - Product updates & stock reconciliation: computes inventory delta, logs `inventory_movements` with `reason = 'adjustment'`, preserves customer order history by safe deactivating variants that have historical orders instead of deleting, and purges removed media from ImageKit.
    - Product archival (soft delete) & permanent deletion guard (prevents hard deletion if orders reference variants).
  - Server Actions (`src/actions/categories.ts`, `src/actions/products.ts`):
    - Type-safe, role-enforced actions with `createSafeAction` (`staff` for reads, `admin` for mutations).
    - Cache revalidation across `/categories`, `/products`, and `/inventory`.
  - Automated Test Suite (`src/scripts/test-catalog-backend.ts`, `npm run catalog:test`): 43/43 assertions passed.
- [x] **Inventory Management Backend Architecture (Phase 6B):**
  - Inventory Repository (`src/server/repositories/inventory.repository.ts`):
    - `findPaginated(filter)`: Dynamic search across product title and SKU, category filter, stock status filter (`healthy`, `low`, `out`), sorting, limit/offset pagination, computed `availableStock` (`quantityOnHand - quantityReserved`), computed `stockStatus`, and computed `stockValue`.
    - `getSummaryMetrics()`: SQL aggregated KPIs across all SKUs (`totalUnitsInStock`, `totalReservedUnits`, `totalStockValue`, `totalSkus`, `lowStockCount`, `outOfStockCount`, `healthyStockCount`).
    - `findByVariantId(variantId)`: Deep bundle query joining variant, product, category, and color details.
    - `findByProductId(productId)`: Complete variant inventory array for product detail views.
    - `findForUpdate(variantId, tx)`: Pessimistic row-level locking via PostgreSQL `SELECT ... FOR UPDATE` preventing race conditions during concurrent stock updates.
    - `updateInventoryRow(id, data, tx)`, `insertMovement(data, tx)`, and `findMovementsPaginated(filter)`.
  - Inventory Business Service (`src/server/services/inventory.service.ts`):
    - RBAC enforcement (`staff` for reads, `admin` or `super_admin` for stock adjustments).
    - Manual stock adjustments (`adjustStock`): supports modes `"add"`, `"remove"`, and `"set"`. Runs inside `db.transaction` with `findForUpdate`, verifies `nextOnHand >= 0` invariant and ensures `nextOnHand >= quantityReserved` to protect open customer orders, and logs `inventory_movements` with admin attribution.
    - Restocking (`restock`): specialized wrapper over `adjustStock` logging `"restock"` movement.
    - Order lifecycle ledger primitives:
      - `reserveStock(variantId, quantity)`: Reserves stock for checkout/unpaid order; rejects over-reservation with `ConflictError`.
      - `releaseReservedStock(variantId, quantity)`: Cleans up expired or unpaid reservations.
      - `commitOrderSale(variantId, quantity)`: Permanently deducts `quantityOnHand`, clears reservation, and logs `"sale"` movement.
      - `cancelOrderStock(variantId, quantity, orderId, wasCommitted)`: Restores stock or releases reservation with `"cancellation"` movement.
      - `returnOrderStock(variantId, quantity)`: Increments `quantityOnHand` with `"return"` movement.
  - Server Actions (`src/actions/inventory.ts`):
    - Safe actions (`getInventoryAction`, `getInventorySummaryAction`, `getVariantInventoryAction`, `getProductInventoryAction`, `adjustStockAction`, `restockAction`, `getInventoryMovementsAction`) revalidating `/inventory` and `/products`.
  - Next.js 16 Route Handlers (`src/app/api/inventory/**`):
    - `GET /api/inventory`: Paginated inventory list and summary metrics.
    - `POST /api/inventory/adjust`: Admin manual stock adjustment endpoint.
    - `GET /api/inventory/movements`: Audit trail of stock movements.
  - Automated Test Suite (`src/scripts/test-inventory-backend.ts`, `npm run inventory:test`): 47/47 assertions passed, including concurrent row locking under parallel `Promise.all` adjustments.
- [x] **Orders, Customers & Payments Backend Architecture (Phase 6C):**
  - **Server Actions First Architecture:** Zero redundant internal Route Handlers created. Admin UI mutations interact directly via Next.js Server Actions, while page components consume server-side services directly.
  - **Global Consistent Lock Ordering:** Enforced strict row locking sequence (`orders` $\to$ `payments` $\to$ `inventory`) across all operations to mathematically prevent PostgreSQL deadlocks.
  - **Customer Repository & Service (`src/server/repositories/customer.repository.ts`, `src/server/services/customer.service.ts`):**
    - `findPaginated`: Search across name, email, phone with registration and status filters.
    - `findById`: Deep customer bundle with addresses array.
    - `upsertCustomer`: Atomic normalized email lookup and upsert/insert avoiding duplicate customer creation for guest checkouts.
    - `updateCustomer`, `saveAddress`, `deleteAddress`.
  - **Order Repository & Service (`src/server/repositories/order.repository.ts`, `src/server/services/order.service.ts`):**
    - `findPaginated`: Search by order number, customer name, email; filter by status, payment status, date range; pagination.
    - `findById`: Comprehensive order bundle including customer, items, engravings, coupon snapshot, internal notes, and status timeline.
    - `findForUpdate`: Row-level exclusive lock `SELECT ... FOR UPDATE` on `orders`.
    - `createOrder`: Mandatory `admin: AdminContext`, COD + Custom Engraving business rule rejection, automatic customer lookup/creation, price & discount snapshots, stock reservation via `inventoryService.reserveStock`, and atomic order bundle creation.
    - `updateOrderStatus`: Transition matrix enforcement across all 9 statuses (`awaiting_payment`, `payment_submitted`, `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`), courier tracking info updates, and admin status history logging.
    - **Distinct 4-Way Cancellation & Refund Semantics:**
      - Scenario A (Unpaid): Releases reservation (`wasCommitted = false`), on-hand stock untouched.
      - Scenario B (Paid & Unshipped): Restores warehouse on-hand stock (`wasCommitted = true`), payment remains `paid` (NOT automatically refunded).
      - Scenario C (Shipped/Delivered): Does NOT alter warehouse stock (goods with courier/customer), payment remains `paid`.
      - Scenario D (Refund): Dedicated `refundPayment` action marks payment and order as `refunded` only after actual refund processed.
  - **Payment Repository & Service (`src/server/repositories/payment.repository.ts`, `src/server/services/payment.service.ts`):**
    - `findPaginated`: Search across transaction reference, order number, customer name; filter by status, method; pagination.
    - `findForUpdate`: Row-level exclusive lock `SELECT ... FOR UPDATE` on `payments`.
    - `submitPaymentProof`: Updates payment status to `awaiting_verification`, attaches ImageKit file ID/URL and transaction reference, sets order status to `payment_submitted`.
    - `approvePayment`: Enforces lock order (`orders` $\to$ `payments`), verifies payment, commits stock sale via `inventoryService.commitOrderSale` with idempotency guard against double-deduction, sets order to `confirmed`.
    - `rejectPayment`: Enforces lock order, rejects payment with reason and rejection history log in JSONB metadata, reverts order status to `awaiting_payment` for customer retry.
    - `refundPayment`: Enforces lock order, records refund reason and admin attribution, updates payment status to `refunded`, and updates order status to `refunded`.
  - **Server Actions (`src/actions/customers.ts`, `src/actions/orders.ts`, `src/actions/payments.ts`):**
    - Thin wrappers around services protected by `createSafeAction` with role checks (`staff` for notes, `admin` for status updates, payments approval, refunds).
    - Cache revalidation across `/orders`, `/payments`, `/customers`, and `/inventory`.
  - **Automated Test Suite (`src/scripts/test-orders-customers-payments.ts`, `npm run orders:test`):** 60/60 assertions passed across 8 categories.
- [x] **Remaining ScrubX Admin Backends (Phase 6D):**
  - **Coupon Repository & Service (`src/server/repositories/coupon.repository.ts`, `src/server/services/coupon.service.ts`):**
    - Dynamic search, status filter (`all`, `active`, `scheduled`, `inactive`, `expired`), sorting, pagination.
    - Authoritative single-point validation & row-level locking (`validateAndLockForOrder` via `SELECT ... FOR UPDATE`).
    - Enforces start/end dates, minimum order amount, global usage limit, per-customer limit, and `firstOrderOnly`.
    - Integrated with Phase 6C `OrderService.createOrder` and `OrderRepository.createOrderBundle` using `recordRedemption`.
    - Extended global lock hierarchy: $\text{orders} \to \text{payments} \to \text{inventory} \to \text{coupons}$.
    - Safe deactivation (`isActive = false`) when coupon has existing `order_coupons` usages.
  - **Shipping Repository & Service (`src/server/repositories/shipping.repository.ts`, `src/server/services/shipping.service.ts`):**
    - Complete CRUD, status toggling, `freeAbove` threshold calculation (`calculateShippingCost`).
    - Atomic transaction reordering (`reorderShippingMethods`) with duplicate ID detection.
    - Partial update merged-entity validation ensuring `minDays <= maxDays`.
    - Safe deactivation when referenced by existing orders (`orders.shippingMethodId`).
  - **Engraving Repository & Service (`src/server/repositories/engraving.repository.ts`, `src/server/services/engraving.service.ts`):**
    - Name and logo engraving management with pricing and `maxCharacters` validation.
    - Partial update merged-entity validation for text character requirements.
    - Safe deactivation when referenced by existing order items (`order_item_engraving`).
  - **Payment Method Repository & Service (`src/server/repositories/payment-method.repository.ts`, `src/server/services/payment-method.service.ts`):**
    - System payment method settings management (JazzCash, Easypaisa, SadaPay, NayaPay, Bank Transfer, COD).
    - Strict business invariant: COD strictly prohibits `allowedWithEngraving = true` (aligned with PostgreSQL trigger `trg_check_engraving_cod`).
    - Atomic payment method reordering within `db.transaction`.
  - **Store Settings Service & Repository Refinements (`src/server/repositories/settings.repository.ts`, `src/server/services/settings.service.ts`):**
    - Added `currency: "PKR"` to default settings and schema validation.
    - Added `updateSettingsBatch` utilizing `db.transaction` and `.onConflictDoUpdate()` with transaction-scoped visibility.
  - **Server Actions Layer (`src/actions/coupons.ts`, `src/actions/shipping.ts`, `src/actions/engraving.ts`, `src/actions/payment-methods.ts`, `src/actions/settings.ts`):**
    - Thin wrappers around services protected by `createSafeAction` (`staff` for reads, `admin` for mutations).
    - Cache revalidation across `/coupons`, `/shipping`, `/engraving`, `/payment-methods`, and `/settings`.
  - **Automated Test Suite (`src/scripts/test-remaining-backends.ts`, `npm run backends:test`):** 78/78 assertions passed across 6 categories.
- [x] **Next.js Production Build:** `npm run build` compiled all 18 static and dynamic routes cleanly in Turbopack.

---

## 3. Completed Phases (Phases 1 through 7)

- [x] **Phase 1: Project Setup & Next.js 16 Foundation** (Completed)
- [x] **Phase 2: Better Auth & RBAC Security Layer** (Completed)
- [x] **Phase 3: Supabase PostgreSQL Schema & Migrations** (Completed)
- [x] **Phase 4: ImageKit Media Integration** (Completed)
- [x] **Phase 5: Backend Architecture Foundations** (Completed)
- [x] **Phase 6A: Catalog Business Logic & Services** (Completed)
- [x] **Phase 6B: Inventory Management & Stock Reservations** (Completed)
- [x] **Phase 6C: Orders, Payments & Customer Verification** (Completed)
- [x] **Phase 6D: Coupons, Shipping, Engraving & Store Settings** (Completed)
- [x] **Phase 6E: View Migration to React Server Components (RSC)** (Completed November 2026)
  - All 18 administration views migrated to Server Component data fetching and typed Server Action mutations.
- [x] **Phase 7: End-to-End Database Integration & Mock Data Decommissioning** (Completed November 2026)

---

## 4. Completed Milestone: Production Remediation Execution (Batches B1–B14)

The authoritative remediation specification located in [`docs/ai-context/PRODUCTION_REMEDIATION_PLAN.md`](file:///home/rehan/Downloads/scrubX-admin/docs/ai-context/PRODUCTION_REMEDIATION_PLAN.md) is **100% COMPLETE**.

- **All 105 Remediation Issues (P0–P3) Fully Resolved & Verified**:
  - **Batch 1 to 12 (B1–B12)**: Security, functional bugs, database constraints, performance optimizations, and architectural alignment.
  - **Batch 13 (B13) — E-Commerce Lifecycle Completion**:
    - `ECOM-001` (Unpaid Order Expiration cron job & alert banner).
    - `ECOM-002` & `ECOM-003` (Returns & Product Exchanges / RMA workflows).
    - `ECOM-004` & `ECOM-010` (Customer Notes pin/soft-delete & Unified Activity Feed).
    - `ECOM-005` (Staff Team Management UI & Better Auth session revocation).
    - `ECOM-006` (Duplicate TID Warning & Super Admin Override).
    - `ECOM-007` (Printable Invoice & Packing Slip with `@media print` styling).
    - `ECOM-008` (Orphan Media Asset Tracking & Cleanup).
    - `ECOM-009` (Bulk Order Status Operations with floating action bar).
    - `ECOM-011` (Stateful Read-Tracked Notifications).
    - `ECOM-012` (Storefront Settings Contract & Registry).
  - **Batch 14 (B14) — Automated Test Harness & Final CI Gates**:
    - `TEST-001`: Vitest test runner configured with `npm test`, `test:watch`, `test:load`.
    - `TEST-002`: Master declarative authorization matrix test suite (`test/unit/auth-matrix.test.ts`).
    - `TEST-003`: DTO snapshots and anti-fabrication test suite (`test/unit/dto-snapshots.test.ts`).
    - `TEST-004`: Concurrency and transaction invariants test suite (`test/integration/concurrency.test.ts`).
    - `TEST-005`: Security assertions and proxy verification suite (`test/unit/security.test.ts`).
    - `TEST-006`: 10 static regression guards (`scripts/check-guards.mjs`) wired into `npm run lint`.
    - `TEST-007`: Zero-dependency load & capacity benchmark harness (`scripts/load-test.mjs`).
    - `ARCH-009`: Multi-job GitHub Actions CI workflow (`.github/workflows/ci.yml`), PR template (`.github/pull_request_template.md`), and branch protection rules documented in `ARCHITECTURE.md`.
    - `DB-016`: 100% schema parity across all 31 tables, columns, indexes, foreign keys, triggers, and RLS (`npm run db:parity`).

---

## 5. Architectural Conventions & Notes

1. **Next.js 16 Proxy Convention:** `src/proxy.ts` replaces legacy middleware using an explicit inclusion matcher.
2. **Peer Dependency Resolution (ARCH-008):** `drizzle-orm` upgraded to `^0.45.4` and `drizzle-kit` to `^0.31.11`, satisfying `better-auth@1.7.17` peer dependency contracts. Standard `npm ci` installs cleanly without `--legacy-peer-deps`.
3. **Single Auth Module:** `src/server/auth.ts` is the single source of truth for administrative authentication and authorization. Role fallback to staff is strictly removed.

---

## 6. Security Advisory & Dependency Triage (ARCH-008)

| Package | Advisory ID | Severity | Description | Production Reachability | Resolution / Mitigation |
|---|---|---|---|---|---|
| `drizzle-orm` | GHSA-gpj5-g38j-94v9 | High | SQL injection via improperly escaped SQL identifiers in older Drizzle ORM | **Direct runtime dependency** | **RESOLVED**: Upgraded `drizzle-orm` to `^0.45.4`. Vulnerability eliminated. |
| `esbuild` | GHSA-67mh-4wv8-2f99 | Moderate | Dev server request reading vulnerability | **Not reachable** (CLI dev tooling via `drizzle-kit` only; not included in production server bundles) | **RESOLVED**: Upgraded `drizzle-kit` to `^0.31.11`. |
| `minimatch` | GHSA-g3hv-75wg-m249 | Moderate | Potential denial of service via globparts amplification | **Not reachable** (Build/lint tooling dependency inside `@typescript-eslint` used solely during `npm run lint`) | Triaged as acceptable development-only risk; pending upstream `eslint-config-next` / `typescript-eslint` upgrade. |
| `uuid` | GHSA-w5hq-g745-h8pq | Moderate | Missing buffer bounds check in v3/v5/v6 when `buf` is provided | **Not reachable** (`imagekit` SDK invokes `uuid.v4()` without buffer parameters) | Triaged as non-exploitable vendor dependency within `imagekit@^6.0.0`. |

