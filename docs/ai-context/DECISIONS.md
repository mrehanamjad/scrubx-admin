# ScrubX Admin — Architectural Decision Records (ADRs)

> **Permanent AI Context Documentation**  
> *Last Updated: November 2026 (Phase 3 Completed)*

---

## ADR 001: Next.js 16 App Router as Application Framework

### Context
The original project was a Single Page Application (SPA) built using Vite and React Router. As the application transitions into a production full-stack e-commerce back office with sensitive customer, order, and financial data, a secure server-first architecture was required.

### Decision
Migrated to **Next.js 16 App Router** with React 19, TypeScript, and Turbopack.

### Rationale
- React Server Components (RSC) allow direct, low-latency database querying without exposing internal REST APIs or database secrets to the browser.
- Built-in Server Actions (`'use server'`) simplify form submissions and mutations with native type safety and cache revalidation (`revalidatePath`).
- Edge Middleware allows high-performance session validation before requests reach application routes.

### Consequences
- Requires strict adherence to Next.js 16 async request APIs (`params` and `searchParams` are Promises and must be awaited).
- Client state must be pushed to leaf components; page containers remain Server Components.

---

## ADR 002: Supabase Strictly as a Managed PostgreSQL Database Layer

### Context
Supabase offers an ecosystem of integrated services, including Supabase Auth, Supabase Storage, and PostgREST client libraries.

### Decision
Use **Supabase strictly as a managed PostgreSQL hosting instance**. Explicitly reject Supabase Auth and Supabase Storage.

### Rationale
- ScrubX requires specialized authentication logic (Better Auth with role-based staff administration and internal database sessions) that does not depend on Supabase's proprietary GoTrue authentication server.
- Media management requires on-the-fly transformations and private/public CDN delivery optimized for e-commerce, which ImageKit provides.
- Avoids vendor lock-in. The application interacts with PostgreSQL via standard TCP connection strings using standard SQL and Drizzle ORM, allowing migration to AWS RDS, Neon, or self-hosted PostgreSQL without code refactoring.

### Consequences
- `@supabase/supabase-js` and `@supabase/auth-helpers` must never be installed.
- All access control is managed via application Server Actions, Better Auth sessions, and server-side SQL connections bypassing client-side RLS.

---

## ADR 003: Better Auth for Authentication and Authorization

### Context
The admin portal requires secure authentication, session management, and role-based access control (RBAC) with self-hosted data storage.

### Decision
Adopt **Better Auth** (`better-auth`) with `@better-auth/drizzle-adapter` connected directly to dedicated PostgreSQL tables (`ba_user`, `ba_session`, `ba_account`, `ba_verification`).

### Rationale
- Better Auth is open-source, framework-agnostic, and natively designed for modern Next.js App Router and TypeScript.
- Stores all credentials and sessions directly in our PostgreSQL database using standard tables.
- Supports first-class plugin architecture, including `admin()` for RBAC, session revocation, and staff management.
- Handles password hashing via secure scrypt/argon2 algorithms natively (`better-auth/crypto`).

### Consequences
- Peer dependency resolution requires `--legacy-peer-deps` during package installation due to an internal peerOptional constraint on `drizzle-orm`.

---

## ADR 004: ImageKit for Digital Media Pipeline

### Context
E-commerce operations require responsive product photography delivery, customer payment proof screenshot uploads, and vector logo asset handling.

### Decision
Adopt **ImageKit** as the sole media asset pipeline for catalog photography, category banners, payment receipts, and custom engraving logo files.

### Rationale
- Provides real-time URL-based transformations (`w-`, `h-`, `q-`, `f-auto`) for WebP/AVIF delivery.
- Allows direct browser-to-CDN uploads using temporary signed authorization tokens, avoiding routing heavy multi-megabyte payloads through serverless function runtimes.
- Supports private folders with signed URLs for sensitive payment receipts and custom logos.

### Consequences
- Every uploaded asset in PostgreSQL must track both its public/signed `url` and its `imagekit_file_id` to enable automated purge on entity deletion.

---

## ADR 005: Drizzle ORM for Database Operations

### Context
A TypeScript-native ORM was needed to interface with the 25-table relational schema in Supabase PostgreSQL.

### Decision
Selected **Drizzle ORM** with `postgres.js` over Prisma and raw SQL.

### Rationale
- Drizzle is lightweight, zero-dependency, and compiles directly to standard SQL with zero runtime engine overhead.
- Supports both a fluent query builder and the Relational Query API (`db.query.*.findMany({ with: { ... } })`), matching the exact relational schema.
- Schema declarations in TypeScript serve as the single source of truth for table definitions, relations, and type inference (`$inferSelect`, `$inferInsert`).

### Consequences
- Drizzle returns PostgreSQL `numeric(12, 2)` columns as strings to prevent JavaScript floating-point precision loss; formatting utilities must parse or format strings accordingly.

---

## ADR 006: Row Level Security (RLS) Lockdown with Zero Public Access

### Context
Supabase enables an HTTP Data API by default via PostgREST. If tables lack RLS policies, unauthenticated users holding the public anonymous API key could query or alter sensitive business records.

### Decision
Executed `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` on all 25 tables with **no public policies**.

### Rationale
- Completely denies all incoming requests originating from PostgREST using the public anonymous key.
- Server applications connect directly to PostgreSQL via connection strings with privileged service credentials, bypassing RLS entirely.

---

## ADR 007: Supavisor Transaction Pooler Configuration

### Context
Next.js serverless functions and development server fast refreshes (HMR) can rapidly open dozens of concurrent TCP connections, crashing PostgreSQL.

### Decision
Connect via port `6543` using Supavisor with `prepare: false` and a development singleton.

### Rationale
- Port `6543` operates in Transaction Pooling mode, safely scaling to thousands of client requests over a compact pool of underlying Postgres connections.
- Requires `prepare: false` because transaction poolers distribute consecutive queries across arbitrary server processes.

---

## ADR 008: Canonical Lowercase Roles (`super_admin`, `admin`, `staff`, `customer`)

### Context
Phase 1 and 2 had mixed casing between uppercase roles (`SUPER_ADMIN`, `ADMIN`, `STAFF`) and lowercase roles (`admin`, `customer`).

### Decision
Standardized on a single, canonical, lowercase set: `'super_admin' | 'admin' | 'staff' | 'customer'`.

### Rationale
- Eliminates case-mismatch bugs across database constraints, Better Auth plugin config, and TypeScript guard types.
- Aligns with standard PostgreSQL identifier and enum conventions.

### Consequences
- Applied via migration `20261105000001_phase3_schema_refinements.sql`.
- Updated Better Auth admin plugin: `adminRole: ["super_admin", "admin"]`, `defaultRole: "staff"`.

---

## ADR 009: Pure Modular Schema Architecture (`src/db/schema/`) & Circular Import Prevention

### Context
The monolithic `src/db/schema.ts` (812 lines) was growing unwieldy and lacked modular domain boundaries.

### Decision
Removed `src/db/schema.ts` facade entirely and created a pure modular directory under `src/db/schema/` with a root `index.ts`. Isolated `json-types.ts` (no table imports) and `types.ts` (inferred Select/Insert models).

### Rationale
- Implements strict domain separation (`auth.ts`, `catalog.ts`, `inventory.ts`, `orders.ts`, `payments.ts`, etc.).
- Eliminates circular dependencies by placing JSONB interfaces in `json-types.ts` without any table references.
- Centralizes all relational mappings in `relations.ts`.

---

## ADR 010: Strict JSONB Typing without Index Signatures & StoreSettingsMap

### Context
Loose `jsonb` declarations previously accepted arbitrary JSON, risking data drift.

### Decision
Attached strict TypeScript interfaces using Drizzle's `.$type<T>()` without index signatures (`[key: string]: unknown`) and without invented fields. Created `StoreSettingsMap` for key-specific typing. Provided runtime Zod schemas in `json-schemas.ts`.

### Rationale
- `VariantAttributes`: Only `{ manual?: boolean }` (used by product form generator).
- `ShippingAddressSnapshot`: Immutable customer delivery address snapshot.
- `PaymentMetadata`: Only `{ customerNotes?: string }` (dropped `ipAddress`).
- `StoreSettingsMap`: Per-key type mapping for all supported configuration entries.

---

## ADR 011: Supabase SQL Migrations as Single Source of Truth & 3-Pillar Verification

### Context
Relying on `drizzle-kit push` or automated migration generation can cause drift or destructive operations on live databases with triggers and sequences.

### Decision
Raw SQL files in `supabase/migrations/` remain the single source of truth. All changes are verified via three pillars:
1. Temporary introspection diff via `drizzle-kit pull`.
2. Live catalog parity testing via `src/scripts/verify-schema-parity.ts`.
3. Rolled-back transactional integration testing via `src/scripts/test-schema-integrity.ts`.

### Rationale
- Guarantees zero schema drift, verifies that PostgreSQL triggers (`check_engraving_cod_rule`, `generate_order_number`) and RLS policies are active, and tests database constraints without polluting live data.


---

## ADR 012: Direct Client Upload to ImageKit with Ephemeral Auth Tokens

### Context
Uploading large product images and high-resolution camera photos through Next.js Server Actions or Route Handlers consumes significant serverless bandwidth, incurs compute execution costs, and can trigger HTTP payload limit errors (e.g. Vercel's 4.5MB request body ceiling).

### Decision
Implement direct client-to-ImageKit uploads via `https://upload.imagekit.io/api/v1/files/upload`:
1. Client requests an ephemeral HMAC-SHA1 upload signature and token from `GET /api/upload/auth`.
2. Route handler authorizes request using `requireStaff()`.
3. Client directly posts `FormData` using `XMLHttpRequest`, tracking fine-grained upload progress (0-100%).
4. Client persists returned `fileId` and `url` into form state and database records.

### Rationale
- Completely eliminates file payload traffic from the Next.js server runtime.
- Provides native, smooth, responsive upload progress indicators to admin users.
- Server maintains strict control over who can generate upload signatures.

---

## ADR 013: Server-Side ImageKit SDK Singleton Proxy & Separation from Client Bundles

### Context
The `@imagekit/next` package has packaging constraints in Node ESM environments. Furthermore, ImageKit private credentials (`IMAGEKIT_PRIVATE_KEY`) must never be leaked to the browser. Finally, evaluating environment variables at module import time can cause fatal crashes during test runs or build steps before `.env.local` is fully loaded.

### Decision
1. Standardize on the official `imagekit@^6.0.0` Node.js SDK on the server in `src/lib/imagekit.ts`.
2. Wrap the singleton in a lazy `Proxy` that evaluates `process.env` upon first method invocation.
3. Enforce strict server boundary guard (`typeof window !== "undefined"` throws immediately).
4. Use standard browser `fetch` and `XMLHttpRequest` in client utilities (`src/lib/imagekit-upload.ts`) without bundling the server SDK.

### Rationale
- 100% type-safe, rock-solid across Node 20+, Next.js Turbopack, and CLI test scripts.
- Guarantees zero risk of credential exposure to client components.
- Zero premature crashes during build or unit test execution.


---

## ADR 014: 7-Layer Backend Architecture & Action Pipeline Wrapper (`createSafeAction`)

### Context
As ScrubX expands across catalog, inventory, orders, payments, coupons, shipping, and settings, writing repetitive `try/catch` blocks, manual session extractions, manual Zod parsing, and manual role checks inside dozens of Server Actions invites security vulnerabilities and inconsistent error formats.

### Decision
Organize backend responsibilities into a 7-layer architecture:
1. `src/db/`: Connection pooler and modular schema.
2. `src/server/repositories/`: Pure Drizzle queries with pagination and transaction support.
3. `src/server/services/`: Domain business logic, multi-table transactions, audit tracking, ImageKit calls.
4. `src/server/validation/`: Reusable, composable Zod schemas for all domain entities and parameters.
5. `src/server/errors.ts`: Centralized application error hierarchy and database error masking.
6. `src/server/action-client.ts`: `createSafeAction` higher-order wrapper.
7. `src/actions/`: Thin Server Action endpoints returning typed `ActionResponse<T>`.

### Rationale
- Decouples business logic from Next.js request life-cycles, enabling automated unit and CLI testing.
- `createSafeAction` guarantees that authorization and input validation can never be accidentally bypassed.
- Standardizes all Server Action responses to `{ success: true, data }` or `{ success: false, error, code, fieldErrors }`.

---

## ADR 015: Standardized Error Hierarchy & Database Constraint Masking

### Context
Exposing raw PostgreSQL errors or unhandled exception stack traces to admin clients can leak internal database table names, constraint details, SQL query fragments, or environment secrets.

### Decision
Implement `toActionError()` in `src/server/errors.ts`:
1. Maps `ZodError` to a structured field errors dictionary (`Record<string, string[]>`) with code `VALIDATION_ERROR`.
2. Intercepts PostgreSQL constraint codes:
   - `23505` (unique violation) $\to$ `CONFLICT` ("A record with this identifier already exists.")
   - `23503` (foreign key violation) $\to$ `FOREIGN_KEY_VIOLATION` ("Referenced record does not exist or cannot be linked.")
   - `23514` (check constraint violation) $\to$ `CHECK_CONSTRAINT_VIOLATION`
   - `P0001` (trigger exception) $\to$ `TRIGGER_POLICY_VIOLATION` with trigger message.
3. Conceals unexpected errors behind a generic message while preserving server-side logs.

### Rationale
- Completely prevents database metadata and credential leaks to the client.
- Provides predictable, machine-readable error codes for client toast notifications and form field error highlighting.

---

## ADR 016: Safe Category Deletion & Reassignment Policy

### Context
Categories in an e-commerce catalog are referenced by products via `products.categoryId`. Blindly deleting a category would either fail with a foreign key violation, set products to `null` (leaving orphaned catalog items), or delete products.

### Decision
Implement safe deletion enforcement in `CategoryService.deleteCategory`:
1. Check `getProductCount(categoryId)`. If active products reference the category:
   - If `reassignToCategoryId` is not specified, reject deletion and throw `ConflictError`.
   - If `reassignToCategoryId` is provided and valid, update all referencing products to the new category within an atomic database transaction.
2. Unparent direct child categories (set `parentId = null`) inside the transaction to avoid broken parent links.
3. If the deleted category had an associated `imageFileId`, safely trigger an asynchronous ImageKit purge after transaction commit.

### Rationale
- Completely avoids orphaned products in catalog queries.
- Prevents accidental bulk data misplacement by requiring explicit reassignment target selection.
- Cleans up ImageKit storage automatically without blocking database transactions.

---

## ADR 017: Atomic Product-Variant-Inventory Reconciliation & Order History Preservation

### Context
In ScrubX, each product has a matrix of colors, sizes, and SKUs. Each variant has an inventory record in `inventory` and a historical stock audit trail in `inventory_movements`. If a variant is ordered by a customer, `order_items.variantId` references `product_variants.id` with `onDelete: "restrict"`. When an admin updates a product and removes a variant, deleting the variant directly would crash with a foreign key violation or destroy historical order snapshots.

### Decision
Implement atomic product update reconciliation in `ProductService`:
1. **Creation:** Execute base product, colors, variants, initial inventory rows, and restock `inventory_movements` rows within a single `db.transaction`.
2. **Stock Adjustments:** On variant update, compute `delta = newStock - currentStock`. Update `inventory.quantityOnHand` and log an `inventory_movements` row with `reason: "adjustment"` and admin ID attribution.
3. **Variant Removals & Order History:** When a variant is omitted from the update payload, query `order_items` for that variant. If order items exist, deactivate the variant (`isActive = false`) rather than deleting it. If no orders exist, delete the variant and cascade its inventory row.
4. **Media Lifecycle:** Track replaced or deleted ImageKit file IDs and purge them via `safeDeleteImageKitFile` only after the database transaction successfully commits.

### Rationale
- 100% transactional integrity: prevents partial product creation (e.g., product exists but inventory fails).
- Preserves complete customer order and invoicing history.
- Automatically maintains real-time inventory ledger and movement logs without manual stock adjustments.

---

## ADR 018: Pessimistic Row Locking (`SELECT ... FOR UPDATE`) and Order-Driven Dual-Counter Stock Ledger for Inventory Concurrency

### Context
In an e-commerce platform with concurrent orders and administrative restocking, simultaneous updates to a variant's stock balance can produce race conditions (e.g., lost updates, overselling stock, or negative balances). Furthermore, orders undergo multi-stage fulfillment (placed $\to$ paid $\to$ fulfilled $\to$ cancelled/returned), requiring an inventory ledger that distinguishes physical warehouse units from units reserved for pending orders.

### Decision
1. **Pessimistic Row-Level Locking:**
   All stock mutation methods (`adjustStock`, `restock`, `reserveStock`, `releaseReservedStock`, `commitOrderSale`, `cancelOrderStock`, `returnOrderStock`) run inside database transactions using Drizzle's `.for("update")`:
   ```ts
   tx.select().from(inventory).where(eq(inventory.variantId, variantId)).for("update")
   ```
   This acquires an exclusive row-level lock on the variant's `inventory` record for the transaction duration, queuing concurrent operations and eliminating race conditions.
2. **Dual-Counter Stock Architecture:**
   - Maintain physical stock in `inventory.quantityOnHand`.
   - Maintain allocated units in `inventory.quantityReserved`.
   - Calculate available stock dynamically as `availableStock = quantityOnHand - quantityReserved`.
   - Compute real-time status: `healthy` (`available > reorderLevel`), `low` (`0 < available <= reorderLevel`), `out` (`available === 0`).
3. **Safety Invariants:**
   - Physical stock cannot become negative (`nextOnHand >= 0`).
   - Physical stock cannot be manually set below active reservations (`nextOnHand >= quantityReserved`), protecting open customer orders from administrative accidental cancellation.
4. **Order-Driven Lifecycle Ledgers:**
   - On checkout: call `reserveStock` to allocate units.
   - On payment verification/fulfillment: call `commitOrderSale` to deduct physical stock, clear reservation, and log a `sale` movement.
   - On cancellation: call `cancelOrderStock` (restoring physical stock if already committed, or releasing reservation).
   - On customer return: call `returnOrderStock` to restock physical units with a `return` movement.

### Rationale
- Row-level pessimistic locking is natively supported by PostgreSQL and Drizzle ORM, providing deterministic concurrency safety without the retry complexity of optimistic locking.
- Dual-counter inventory prevents overselling during high-traffic checkout events while preserving exact visibility of warehouse goods.
- Complete auditability through immutable `inventory_movements` rows tracking every unit change with reason and admin ID attribution.

---

## ADR 019: Server Actions First for Admin Mutations and Direct Service Calls in RSC (No Redundant Route Handlers)

### Context
In Next.js App Router applications, teams often duplicate backend interfaces by creating both Route Handlers (`app/api/**/route.ts`) and Server Actions (`actions/**.ts`) for the same operations. In an administrative back-office, Route Handlers introduce maintenance overhead, require secondary request parsing, and risk exposing sensitive admin endpoints to unauthorized network access. Furthermore, fetching data from internal Route Handlers inside Server Components incurs unnecessary HTTP roundtrips, serialization overhead, and header forwarding complexity.

### Decision
1. **Server Actions for Mutations:**
   All administrative state mutations (e.g., updating order status, approving payments, adding notes, modifying customers) must be implemented strictly as Next.js Server Actions wrapped by `createSafeAction`.
2. **Zero Internal Route Handlers for Admin Operations:**
   Do not create internal REST endpoints for orders, customers, or payments. Route Handlers are reserved strictly for external third-party integrations (e.g. ImageKit upload authentication, webhooks, or public customer checkout APIs).
3. **Direct Server Component Data Fetching:**
   React Server Components (RSC) must query repositories and services directly in the Node.js runtime instead of making `fetch('/api/...')` calls.

### Rationale
- Eliminates duplicate code and diverging validation logic.
- Reduces network overhead and improves rendering performance by eliminating localhost HTTP roundtrips.
- Server Actions provide built-in CSRF protection, native integration with React 19 hooks (`useActionState`, `useTransition`), and automatic cache revalidation (`revalidatePath`).

---

## ADR 020: Global Consistent Lock Ordering (`orders` $\to$ `payments` $\to$ `inventory`) and Distinct 4-Way Cancellation/Refund State Handling

### Context
In ScrubX, order fulfillment involves concurrent operations across multiple tables: an admin may approve a payment while a background cron updates order statuses, or another admin cancels an order. If one transaction locks `payments` then `orders`, while another locks `orders` then `payments`, PostgreSQL deadlocks occur. Additionally, conflating order cancellation with payment refunding or warehouse stock restoration causes inventory inaccuracies and accounting discrepancies.

### Decision
1. **Global Consistent Lock Ordering:**
   All operations requiring multi-table locks must acquire row-level locks strictly in the following sequence:
   $$\text{orders} \longrightarrow \text{payments} \longrightarrow \text{inventory} \longrightarrow \text{coupons}$$
   Acquiring locks in any other order is strictly prohibited.
   **Intra-Table Deterministic Ordering (BUG-004):** Within any table, multi-row locks must be acquired in ascending primary-key order (e.g. `[...variantIds].sort()`). Multi-row operations must aggregate and sort entity keys before acquiring row locks to eliminate lock-cycle deadlocks between concurrent orders.
2. **Distinct 4-Way Cancellation & Refund Semantics:**
   State transitions must clearly separate physical warehouse inventory from financial transaction records:
   - **Unpaid Order Cancellation:** Release reserved units back to available stock; physical stock unchanged; payment not involved.
   - **Paid but Unshipped Cancellation:** Restore warehouse physical on-hand stock (`wasCommitted = true`); payment remains `paid` (not automatically refunded) until actual merchant payment refund.
   - **Shipped / Delivered Cancellation:** Do not alter warehouse inventory (merchandise is physically outside the warehouse); payment remains `paid`.
   - **Payment Refund Processing:** Dedicated `refundPayment` workflow marks the payment and order as `refunded` only after actual refund processed; does not alter physical warehouse stock.
3. **Inventory Idempotency Guard:**
   `commitOrderSale` queries `inventory_movements` for existing `(orderId, variantId, reason: 'sale')` within the locked transaction, guaranteeing that redundant or retried payment approvals never double-deduct warehouse stock.

### Rationale
- Global lock hierarchy mathematically eliminates cycle deadlocks in PostgreSQL.
- Clear separation between inventory restoration and payment refunding prevents accounting discrepancies and phantom warehouse inventory.
- Guarantees idempotent stock deductions under high-concurrency conditions.

---

## ADR 021: Authoritative Coupon Concurrency via Row-Level Locking, Unified Single-Point Redemption, and Safe Deactivation

### Context
Coupons and discounts are subject to severe race conditions during concurrent checkouts (e.g. multiple shoppers redeeming the final use of a limited coupon simultaneously, or circumventing per-customer usage limits). In Phase 6C, order creation performed preliminary coupon calculations, risking duplicate redemption logic or divergence if a separate coupon service was introduced. Furthermore, marketing coupons, shipping methods, and engraving options are referenced by historical orders and invoice snapshots via foreign keys (`ON DELETE RESTRICT`). Hard deletion of referenced entities violates referential integrity or destroys order auditability.

### Decision
1. **Unified Authoritative Redemption Workflow:**
   Eliminated duplicate coupon logic. All coupon validation, lock acquisition, discount calculation, and redemption recording are centralized exclusively in `CouponService` and `CouponRepository`:
   - During `OrderService.createOrder`, inside the order transaction (`db.transaction`), the service invokes `couponService.validateAndLockForOrder(couponCode, subtotal, customerId, tx)`.
   - `validateAndLockForOrder` executes `SELECT ... FOR UPDATE` on `coupons` using Drizzle:
     ```ts
     tx.select().from(coupons).where(eq(coupons.code, code)).for("update")
     ```
   - Checks `isActive`, start date (`startsAt <= now`), expiration date (`expiresAt == null || expiresAt > now`), minimum order amount (`subtotal >= minimumOrderAmount`), global usage limit (`usageLimit == null || usageCount < usageLimit`), per-customer usage limit (`getCustomerUsageCount(coupon.id, customerId) < usageLimitPerCustomer`), and first-order-only rules (`getCustomerOrderCount(customerId) === 0`).
   - Computes discount rounded to 2 decimal places, applying `maximumDiscountAmount` cap when present.
   - `OrderRepository.createOrderBundle` delegates order-coupon association and counter incrementation to `CouponRepository.recordRedemption(orderId, couponId, discountAmount, tx)`, inserting an `order_coupons` record and incrementing `coupons.usageCount = usageCount + 1` atomically within the same transaction.
2. **Global Lock Hierarchy Extension:**
   Extended the ADR 020 locking sequence to strictly enforce:
   $$\text{orders} \longrightarrow \text{payments} \longrightarrow \text{inventory} \longrightarrow \text{coupons}$$
   Coupons are locked after inventory reservation within order creation, preventing deadlocks between concurrent checkouts and coupon administrative updates.
3. **Safe Deactivation for Referential Integrity:**
   Entities with historical order references (`coupons` with `order_coupons`, `shipping_methods` referenced by `orders.shipping_method_id`, and `engraving_options` referenced by `order_item_engraving`) cannot be hard-deleted. When deletion is requested for an entity with existing references:
   - The deletion operation automatically performs a safe soft deactivation (`isActive = false`).
   - Hard deletion is only executed if zero historical order records reference the entity.
4. **Complete Entity Validation on Partial Updates:**
   In `CouponService`, `ShippingService`, and `EngravingService`, partial updates fetch the existing record from the database, merge incoming patch fields with existing values, and run the complete validation schema against the merged entity. This prevents contradictory states (e.g., updating `minDays` to be greater than existing `maxDays`, or setting `expiresAt` before existing `startsAt`).

### Rationale
- Row-level locking guarantees that coupon usage counters and per-customer limits are strictly enforced without race conditions.
- Single authoritative redemption in `CouponService` prevents logic drift between checkout and back-office modules.
- Safe deactivation preserves complete historical order and invoice audit trails without foreign key constraint violations.
- Merged entity validation prevents database-level check constraint violations resulting from partial updates.

---

## ADR 022: Strict Cash-on-Delivery (COD) Engraving Invariant, Atomic Reordering, and Transaction-Scoped Batch Settings

### Context
Custom engraving requires upfront payment because personalized merchandise cannot be restocked or resold if a customer refuses delivery. The PostgreSQL database enforces this business invariant via the trigger `check_engraving_cod_rule` (`trg_check_engraving_cod`), which aborts order creation if `orders.has_engraving = true` and `payment_methods.allowed_with_engraving = false`. If an administrator inadvertently marks Cash on Delivery as `allowedWithEngraving = true`, checkout orders will violate this core business model. Furthermore, ordering of courier methods and payment options requires deterministic display sequencing, and store settings require atomic multi-key updates.

### Decision
1. **Strict COD Engraving Invariant in Application Layer:**
   In `PaymentMethodService.updatePaymentMethod`:
   - Enforce that payment methods with code `cod` or type `cod` can never have `allowedWithEngraving: true`.
   - Any administrative payload attempting to set `allowedWithEngraving = true` on COD is rejected with `ValidationError("Cash on Delivery (COD) cannot be enabled for customized/engraved orders.")`.
2. **Atomic Entity Reordering:**
   In `ShippingService.reorderShippingMethods` and `PaymentMethodService.reorderPaymentMethods`:
   - Reordering operations execute inside an atomic `db.transaction`.
   - Validates input arrays to ensure no duplicate IDs are submitted.
   - Updates `sortOrder` for each entity using batch updates, ensuring consistent visual ranking in admin and storefront interfaces without race conditions.
3. **Transaction-Scoped Batch Settings Upsert:**
   In `SettingsService.updateSettingsBatch`:
   - All settings entries are validated against strict Zod schemas (`storeSettingsValueSchemas`).
   - Updates run within a `db.transaction`, executing PostgreSQL `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`.
   - Post-update verification (`getAllSettings`) accepts the active transaction executor (`tx`), ensuring immediate transactional read visibility of newly upserted settings before commit.

### Rationale
- Enforcing the COD engraving rule in the application layer prevents confusing database trigger exceptions and protects company cash flow from uncollectible personalized inventory.
- Atomic reordering eliminates intermediate corrupted sorting states.
- Passing the transaction executor to `getAllSettings` avoids stale reads of uncommitted settings within the same transaction.

---

## ADR 023: Single Authentication Stack, Strict Role Resolution, and Defense-in-Depth Session Guardrails

### Context
Previous implementations had two parallel authentication modules (`src/server/auth.ts` and `src/lib/auth-guard.ts`) with conflicting failure modes (throwing errors vs. issuing HTTP redirects). Crucially, unrecognized or missing roles (such as storefront users with `role = 'customer'`) were coerced to `'staff'`, allowing unauthorized principals to access internal administrative screens and operations. Additionally, proxy redirection on expired sessions led to infinite redirect loops.

### Decision
1. **Single Authoritative Auth Stack (`src/server/auth.ts`):**
   - Retired `src/lib/auth-guard.ts` completely. All RSC pages, route handlers, and Server Actions use `src/server/auth.ts`.
   - Pages use `requirePage(role)` or `require*Context({ redirect: true })` which redirects to `/login?error=session` or `/login?error=forbidden`.
   - Server Actions and route handlers use context helpers with `{ redirect: false }` to avoid throwing `NEXT_REDIRECT` into action catch blocks.
2. **Zero Role Coercion (SEC-004):**
   - In `getCurrentAdmin()`: Valid admin roles are strictly limited to `super_admin`, `admin`, and `staff`.
   - Any unrecognised role, customer role, or empty role throws `AuthorizationError` immediately. Roles are never defaulted to `staff`.
3. **Loop Prevention & Parameterized Redirects (BUG-032):**
   - The proxy's `/login` route bypasses redirecting to `/` when arriving with an `error` query parameter.
   - Stale or unauthorized sessions are redirected to `/login?error=session` or `/login?error=forbidden`, rendering an explanatory alert instead of looping infinitely.
4. **No Anonymous Server Action Principals (ARCH-003):**
   - Removed `requiredRole: null` from `createSafeAction`. All actions require at least `staff` privileges.
   - Asserted `admin.id !== "anonymous"` on all action executions.
5. **Super Administrator Lockdown for Settings (SEC-013):**
   - `/settings` page, `updateStoreSettingAction`, `updateStoreSettingsBatchAction`, and `SettingsService` mutations strictly require `super_admin` privileges.

### Rationale
- Prevents horizontal customer-to-staff privilege escalation.
- Standardizes server-side authentication error handling and eliminates unhandled `NEXT_REDIRECT` errors.
- Protects store-wide sensitive banking, tax, and notification configurations from unauthorized modification.



