# ScrubX Admin — Architecture & System Design

> **Permanent AI Context Documentation**  
> *Last Updated: November 2026 (Phase 4 Completed)*

---

## 1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Browser ["Client Boundary (Browser)"]
        UI["18 Views (src/views/*.tsx)"]
        Nav["Sidebar & Topbar (src/components/layout/)"]
        ClientAuth["authClient (src/lib/auth-client.ts)"]
        ImageUploader["ImageUpload Component (src/components/shared/image-upload.tsx)"]
        
        Nav -->|"useSession / signOut"| ClientAuth
        UI -->|"signIn.email"| ClientAuth
        UI --> ImageUploader
        UI -->|"Server Action Mutations"| ServerActions
    end

    subgraph Edge ["Next.js 16 Edge / Routing Layer"]
        Proxy["Next.js 16 Proxy (src/proxy.ts)"]
        Proxy -->|"No Session Cookie"| RedirectLogin["307 Redirect to /login?from=..."]
        Proxy -->|"Active Cookie on /login"| RedirectDashboard["307 Redirect to /"]
        Proxy -->|"Valid Cookie"| AppRouter["App Router (src/app/**/page.tsx)"]
    end

    subgraph Server ["Server Boundary (Node.js RSC, Server Actions & Handlers)"]
        Pages["Page Containers (React Server Components)"]
        AuthHandler["Auth Handler (src/app/api/auth/[...all]/route.ts)"]
        UploadAuth["Upload Auth Handler (src/app/api/upload/auth/route.ts)"]
        ServerAuth["Single Auth Stack (src/server/auth.ts)"]
        BetterAuthServer["Better Auth Server (src/lib/auth.ts)"]
        ServerActions["Server Actions (src/actions/*.ts)"]
        DomainServices["Domain Services (src/server/services/*.ts)"]
        Repositories["Repositories (src/server/repositories/*.ts)"]
        ImageKitSDK["ImageKit Node SDK Singleton (src/lib/imagekit.ts)"]
        
        AppRouter --> Pages
        AuthHandler --> BetterAuthServer
        UploadAuth -->|"requireStaff()"| ImageKitSDK
        MediaActions -->|"deleteFile()"| ImageKitSDK
        Pages -.->|"requireRole()"| AuthGuards
    end

    subgraph DataAccess ["Data Access Layer (src/db/)"]
        Drizzle["Drizzle ORM (src/db/index.ts)"]
        ModularSchema["Modular Schema (src/db/schema/ - 25 Tables)"]
        
        BetterAuthServer -->|"drizzleAdapter"| Drizzle
        Pages -.->|"db.query.*"| Drizzle
        Drizzle --> ModularSchema
    end

    subgraph ExternalServices ["External Cloud Infrastructure"]
        PostgresDB[("Supabase PostgreSQL 17\n(AWS ap-northeast-2 · Port 6543)")]
        ImageKitCloud["ImageKit Media Cloud & CDN\n(upload.imagekit.io / ik.imagekit.io)")]
        
        Drizzle -->|"TLS (prepare: false)"| PostgresDB
        ImageUploader -->|"Direct multipart/form-data upload"| ImageKitCloud
        ImageKitSDK -->|"REST API / Admin Deletion"| ImageKitCloud
        Browser -->|"Edge Transformed WebP/AVIF"| ImageKitCloud
    end
```

---

## 2. Directory Structure & Responsibilities

```
scrubx-admin/
├── .agent/                               # Local plugin manifest & Agent Skills
│   ├── plugin.json                       # Plugin descriptor
│   └── skills/                           # Guidelines for AI coding agents
│       ├── better-auth/SKILL.md          # Better Auth enforcement rules
│       ├── supabase-postgres/SKILL.md    # PostgreSQL & Drizzle ORM standards
│       ├── imagekit/SKILL.md             # ImageKit media standards
│       ├── drizzle/SKILL.md              # Drizzle ORM standards
│       ├── project-context-management/   # Permanent AI development context rules
│       └── nextjs-admin-best-practices/SKILL.md # RSC & App Router standards
├── docs/
│   └── ai-context/                       # Permanent AI development context
│       ├── PROJECT_OVERVIEW.md
│       ├── ARCHITECTURE.md
│       ├── IMPLEMENTATION_LOG.md
│       ├── DATABASE_CONTEXT.md
│       ├── AUTH_CONTEXT.md
│       ├── IMAGEKIT_CONTEXT.md
│       ├── PENDING_TASKS.md
│       └── DECISIONS.md
├── public/                               # Static assets served at root
│   ├── brand/logo-mark.png               # Official ScrubX logo icon
│   ├── products/                         # Local demo product photography (mock fallback)
│   ├── proofs/                           # Local demo payment receipts (mock fallback)
│   └── favicon.svg                       # Browser tab icon
├── src/
│   ├── actions/                          # Next.js Server Actions ('use server')
│   │   ├── media.ts                      # deleteMediaAction, uploadServerMediaAction
│   │   └── settings.ts                   # getStoreSettingsAction, updateStoreSettingAction
│   ├── app/                              # Next.js 16 App Router
│   │   ├── layout.tsx                    # Root layout (Google Fonts, Providers, AppShell)
│   │   ├── page.tsx                      # Dashboard root route (/)
│   │   ├── globals.css                   # Tailwind CSS v4 styling rules
│   │   ├── not-found.tsx                 # Custom 404 handler
│   │   ├── api/auth/[...all]/route.ts    # Better Auth route handler
│   │   ├── api/auth/verify/route.ts      # Auth test & verification suite endpoint
│   │   ├── api/upload/auth/route.ts      # ImageKit ephemeral upload signature endpoint
│   │   ├── login/page.tsx                # Admin sign-in route with Suspense wrapper
│   │   ├── categories/page.tsx           # Category listing & hierarchy management
│   │   ├── coupons/page.tsx              # Discount coupon configuration
│   │   ├── customers/                    # Customer directory & [id] profile
│   │   ├── engraving/page.tsx            # Custom personalization options
│   │   ├── inventory/page.tsx            # Variant stock levels & movement logs
│   │   ├── orders/                       # Order queue & [id] detail with timeline
│   │   ├── payment-methods/page.tsx      # Admin bank/wallet accounts configuration
│   │   ├── payments/page.tsx             # Screenshot verification queue
│   │   ├── products/                     # Product catalog, new, [id], and [id]/edit
│   │   ├── settings/page.tsx             # Store settings & WhatsApp configuration
│   │   └── shipping/page.tsx             # Delivery methods & flat rates
│   ├── components/
│   │   ├── layout/                       # Shell structure
│   │   │   ├── app-shell.tsx             # Sidebar/Topbar wrapper (bypassed on /login)
│   │   │   ├── sidebar.tsx               # Primary navigation with badges
│   │   │   └── topbar.tsx                # Search, mobile trigger, live user dropdown
│   │   ├── shared/                       # Cross-cutting UI widgets
│   │   │   ├── confirm-dialog.tsx        # Deletion confirmation modal
│   │   │   ├── empty-state.tsx           # Empty catalog/queue placeholder
│   │   │   ├── image-upload.tsx          # Feature-rich ImageKit drag & drop uploader
│   │   │   ├── page-header.tsx           # Standardized title & action bar
│   │   │   ├── pagination.tsx            # Table pagination controls
│   │   │   ├── search-input.tsx          # Filter input
│   │   │   ├── status-badges.tsx         # Color-coded order & payment badges
│   │   │   ├── thumb.tsx                 # Image thumbnail with fallback initials
│   │   │   └── use-simulated-loading.ts  # Demo loading delay hook
│   │   ├── ui/                           # 16 Radix UI & Tailwind design primitives
│   │   └── providers.tsx                 # Client-side context providers wrapper
│   ├── data/
│   │   ├── mock.ts                       # In-memory demo data (1,988 lines, 11 collections)
│   │   └── store.tsx                     # In-memory React Context with localStorage sync
│   ├── db/
│   │   ├── index.ts                      # Drizzle Postgres client, pooling, server guard
│   │   ├── schema/                       # Modular schema (25 domain-driven files)
│   │   │   ├── auth.ts, catalog.ts, inventory.ts, engraving.ts, customers.ts
│   │   │   ├── shipping.ts, coupons.ts, payment-methods.ts, orders.ts, payments.ts
│   │   │   ├── settings.ts, relations.ts, types.ts, enums.ts, json-types.ts, json-schemas.ts
│   │   │   └── index.ts                  # Root schema exporter
│   │   ├── migrate.ts                    # DDL migration journal runner
│   │   └── verify-connection.ts          # Safe connectivity test script
│   ├── lib/
│   │   ├── auth.ts                       # Better Auth server configuration
│   │   ├── auth-client.ts                # Better Auth React client instance
│   │   ├── auth-guard.ts                 # Server-side RBAC guards & session fetchers
│   │   ├── format.ts                     # Currency (PKR), dates, relative formatting
│   │   ├── imagekit.ts                   # ImageKit Node.js SDK server singleton
│   │   ├── imagekit-upload.ts            # Client-side direct upload helper with XHR progress
│   │   ├── imagekit-url.ts               # Edge CDN URL transformation & responsive presets
│   │   ├── types.ts                      # Frontend TypeScript interfaces (mock & entity shapes)
│   │   └── utils.ts                      # cn() helper, uid() generator
│   ├── middleware.ts                     # Edge route protection & redirect logic
│   ├── scripts/
│   │   ├── create-admin.ts               # Secure administrator provisioning script
│   │   ├── test-auth.ts                  # CLI authentication test script
│   │   ├── verify-schema-parity.ts       # Database Pillar B schema parity test script
│   │   ├── test-schema-integrity.ts      # Database Pillar C constraint integrity test script
│   │   ├── test-imagekit-connection.ts   # ImageKit SDK & URL transformation test suite
│   │   ├── test-imagekit-lifecycle.ts    # ImageKit live upload/delete lifecycle test suite
│   │   ├── test-backend-architecture.ts  # Backend architecture, validation, DAL test suite
│   │   └── test-catalog-backend.ts       # Product & category catalog backend test suite
│   ├── server/                           # Backend architecture foundation
│   │   ├── action-client.ts              # createSafeAction higher-order wrapper
│   │   ├── auth.ts                       # Server auth context, session retrieval, role hierarchy
│   │   ├── errors.ts                     # Centralized domain error hierarchy & Postgres error masking
│   │   ├── types.ts                      # ActionResponse<T>, PaginatedResult<T>, PaginationParams
│   │   ├── repositories/                 # Data access repositories (pure Drizzle)
│   │   │   ├── base.repository.ts, settings.repository.ts
│   │   │   ├── category.repository.ts, product.repository.ts, index.ts
│   │   ├── services/                     # Business logic & domain services
│   │   │   ├── settings.service.ts, category.service.ts, product.service.ts, index.ts
│   │   └── validation/                   # Composable Zod input validation schemas
│   │       ├── common.ts, settings.ts, catalog.ts, index.ts
│   ├── actions/                          # Next.js Server Actions ('use server')
│   │   ├── settings.ts                   # Store settings mutations & health check
│   │   ├── media.ts                      # ImageKit upload & asset deletion
│   │   ├── categories.ts                 # Category CRUD, hierarchy & status toggles
│   │   └── products.ts                   # Product CRUD, variant matrix, stock reconciliation
│   │       ├── common.ts, settings.ts, index.ts
│   └── views/                            # 17 interactive Client Components
│       ├── Categories.tsx, Coupons.tsx, CustomerDetail.tsx, Customers.tsx
│       ├── Dashboard.tsx, Engraving.tsx, Inventory.tsx, Login.tsx, NotFound.tsx
│       ├── OrderDetail.tsx, Orders.tsx, PaymentMethods.tsx, Payments.tsx
│       ├── ProductForm.tsx, Products.tsx, ProductView.tsx, Settings.tsx, Shipping.tsx
│   supabase/
│   └── migrations/
│       ├── 20261105000000_initial_schema.sql             # Initial 24 tables, RLS, triggers
│       └── 20261105000001_phase3_schema_refinements.sql   # order_notes, roles, image_file_id
├── database.md                           # Schema specification document
├── drizzle.config.ts                     # Drizzle Kit CLI configuration
├── eslint.config.js                      # ESLint configuration
├── next.config.ts                        # Next.js configuration (remotePatterns for ImageKit)
├── package.json                          # Scripts & dependencies
├── postcss.config.mjs                    # PostCSS configuration
└── tsconfig.json                         # TypeScript compiler configuration
```

---

## 3. Frontend Architecture

- **Server Component Containers:** Every route `page.tsx` in `src/app/` is a React Server Component (RSC). Dynamic route parameters (`params` and `searchParams`) are asynchronous Promises and are strictly awaited:
  ```tsx
  interface PageProps {
    params: Promise<{ id: string }>;
  }

  export default async function Page({ params }: PageProps) {
    const { id } = await params;
    return <OrderDetailPage id={id} />;
  }
  ```
- **Client Leaf Views:** The view components in `src/views/` are marked `'use client'` to support interactive modals, form inputs, local state filters, and tab navigation.
- **Production Architecture:** All 18 views receive strongly-typed initial data as server-fetched DTO props directly from Server Component `page.tsx` containers (calling backend domain services and repositories). Mutations are dispatched through typed Next.js Server Actions wrapped by `createSafeAction`.
- **Navigation Shell:** `AppShell` provides a responsive desktop sidebar and mobile sliding drawer. It automatically inspects `usePathname()` and bypasses the navigation frame for `/login`.

---

## 4. Backend & Database Architecture

- **PostgreSQL Database Layer:** Hosted on Supabase (running PostgreSQL 17) in AWS `ap-northeast-2`.
- **Connection Strategy:**
  - Connects to Supabase Supavisor Transaction Pooler on port `6543`.
  - Configured with `prepare: false` (essential for transaction-mode poolers that do not retain prepared statements across client connections).
  - In development (`NODE_ENV !== "production"`), the connection pool is attached to `globalThis.__scrubx_postgres_client__` to avoid exhausting connection limits during Next.js Hot Module Reloading (HMR).
- **Server Boundary Protection:**
  - `src/db/index.ts` asserts `typeof window === "undefined"`, throwing an immediate security error if accidentally imported into any client component bundle.
- **Relational Schema (Drizzle ORM):**
  - All 25 tables declared in modular domain files in `src/db/schema/`.
  - Pure non-circular JSONB typings in `json-types.ts` and matching Zod validation in `json-schemas.ts`.
  - Full bidirectional relations defined for Drizzle Query API (`db.query.*`).
  - Strict type safety with exported `$inferSelect` and `$inferInsert` types.
- **Row Level Security (RLS):**
  - Enabled on all 25 tables with zero public access policies. All queries are issued from the server using privileged database credentials.

---

## 5. Authentication Architecture

- **Engine:** Better Auth (`better-auth` v1.7.x) with `@better-auth/drizzle-adapter`.
- **Database Tables:** `ba_user`, `ba_session`, `ba_account`, `ba_verification`.
- **Public Sign-ups:** Disabled via `emailAndPassword: { enabled: true, disableSignUp: true }`.
- **Admin Account Setup:** Provisioned via server script `src/scripts/create-admin.ts` using `better-auth/crypto`'s `hashPassword` algorithm.
- **Session Lifecycle:** 7-day session duration, 24-hour update interval, 5-minute cookie cache.
- **Route Protection:**
  - Edge middleware (`src/middleware.ts`) inspects `better-auth.session_token` cookie.
  - Server guards (`src/lib/auth-guard.ts`) re-validate sessions in Server Actions and RSCs against database records.
- **Canonical Lowercase Roles:**
  `super_admin` (3) $\ge$ `admin` (2) $\ge$ `staff` (1). Default user role is `customer` (0).

---

## 6. Media Pipeline & ImageKit Architecture

- **Engine:** Official ImageKit Node.js SDK (`imagekit@^6.0.0`) on the server, paired with direct client uploads and edge CDN transformations.
- **Direct Client Uploads:**
  1. The browser requests an ephemeral authentication token from `GET /api/upload/auth` (protected by `requireStaff()`).
  2. The browser sends the image file via `FormData` directly to `https://upload.imagekit.io/api/v1/files/upload`.
  3. `XMLHttpRequest` provides real-time progress callbacks for in-flight progress bars.
  4. The returned `fileId`, `url`, and metadata are stored in component state and persisted in database records (`product_images.imagekit_file_id`, `product_categories.image_file_id`).
- **Asset Deletion:**
  - Server Action `deleteMediaAction(fileId)` requires admin privileges and permanently purges the file from ImageKit via `imagekit.deleteFile(fileId)`.
- **Edge URL Transformations:**
  - URL builder `getImageKitUrl` dynamically inserts path-based transformation syntax `tr:w-...,h-...,q-...,f-...`.
  - Presets for thumbnails (`getImageThumbnailUrl`), product cards (`getProductCardImageUrl`), product heroes (`getProductHeroImageUrl`), and category banners (`getCategoryBannerUrl`).
- **Folder Namespaces:**
  - `/scrubx/products` (Catalog imagery)
  - `/scrubx/categories` (Category graphics)
  - `/scrubx/engraving-logos` (Custom personalization vector assets)
  - `/scrubx/payment-proofs` (Payment receipt screenshots)


---

## 7. Backend Architecture & Service-Repository Pattern

- **Layered Clean Architecture (`src/server/`):**
  - **Database Layer (`src/db/`):** Connection pooler, transaction runner, and 25-table modular schema.
  - **Repositories (`src/server/repositories/`):** Pure data-access methods using Drizzle ORM. Abstracted from HTTP concepts, session lookups, or Next.js route caches. Accepts optional transaction scopes `DatabaseExecutor`.
  - **Services (`src/server/services/`):** Encapsulates domain invariants, role-based business rules, multi-repository transactions, audit tracking (`updatedBy`), and ImageKit lifecycle calls.
  - **Validation (`src/server/validation/`):** Reusable Zod schemas validating monetary amounts, quantities, UUIDs, slugs, pagination, date ranges, and uploaded file metadata before reaching business logic.
  - **Error Handling & Sanitization (`src/server/errors.ts`):** Centralized `AppError` hierarchy (`AuthenticationError`, `AuthorizationError`, `ValidationError`, `NotFoundError`, `ConflictError`, `DatabaseError`). `toActionError()` maps Postgres constraint violations (e.g. `23505` $\to$ Conflict) and prevents database credential or query leaks.
  - **Action Pipeline Wrapper (`src/server/action-client.ts`):** `createSafeAction` higher-order function automating session extraction, role checking, Zod parsing, and standardized `ActionResponse<T>` wrapping.
  - **Server Actions (`src/actions/`):** Application mutation endpoints called from interactive client forms via `useActionState` and `useTransition`. Invalidate Next.js cache via `revalidatePath()`.
  - **Route Handlers (`src/app/api/`):** Dedicated HTTP endpoints for third-party webhooks, external integrations, and ImageKit upload authentication. Never used for internal Server Component data fetching.

---

## 8. Inventory Management & Concurrency Architecture

- **Dual-Counter Inventory Ledger:**
  - `quantityOnHand`: Physical stock currently present in the warehouse.
  - `quantityReserved`: Units allocated to active open orders awaiting fulfillment.
  - `availableStock`: Dynamically computed as `Math.max(0, quantityOnHand - quantityReserved)`. Customers can only purchase units up to `availableStock`.
- **Stock Status Computation:**
  - `"out"`: `availableStock === 0`.
  - `"low"`: `availableStock > 0 && availableStock <= variant.reorderLevel`.
  - `"healthy"`: `availableStock > variant.reorderLevel`.
- **Pessimistic Concurrency Control:**
  - All stock adjustments and reservations execute inside PostgreSQL transactions using `findForUpdate(variantId, tx)`:
    ```ts
    tx.select().from(inventory).where(eq(inventory.variantId, variantId)).for("update");
    ```
  - Acquires an exclusive row-level lock on the target variant's inventory row, serializing parallel requests and completely eliminating lost updates, overselling, and race conditions.
- **Stock Invariant Guarantees:**
  - Stock removal (`mode = "remove"`) checks `nextOnHand >= 0`, rejecting with `ValidationError` if requested deduction exceeds current physical stock.
  - Direct stock update (`mode = "set"`) checks `nextOnHand >= quantityReserved`, preventing admins from reducing on-hand inventory below quantities already committed to open customer orders.
- **Traceable Movement Ledger (`inventory_movements`):**
  - Every stock modification appends an immutable movement record tracking `variantId`, `change` (positive or negative), `reason` (`restock`, `adjustment`, `sale`, `cancellation`, `return`), optional `orderId`, and `createdBy` (admin user ID).
- **Order Lifecycle Integration:**
  - `reserveStock`: Locks row, checks `availableStock >= quantity`, increments `quantityReserved`.
  - `releaseReservedStock`: Decrements `quantityReserved`.
  - `commitOrderSale`: Decrements `quantityOnHand`, decrements `quantityReserved`, logs `"sale"`.
  - `cancelOrderStock`: Restores physical stock if committed or releases reservation.
  - `returnOrderStock`: Increments `quantityOnHand`, logs `"return"`.

---

## 9. Orders, Customers & Payments Architecture

- **Server Actions First Paradigm:**
  - Administrative mutations execute through Next.js Server Actions wrapped with `createSafeAction`.
  - Zero internal HTTP Route Handlers are used for orders, customers, or payments.
  - React Server Components (RSC) consume business services directly within the Node.js server runtime without HTTP overhead or network latency.
- **Global Consistent Lock Ordering (`orders` $\to$ `payments` $\to$ `inventory`):**
  - To mathematically eliminate database deadlocks in concurrent e-commerce flows, all operations that update multiple entities must acquire PostgreSQL row locks in a strict, fixed hierarchy:
    1. First: Lock the order row (`orderRepo.findForUpdate(orderId, tx)` via `SELECT ... FOR UPDATE`).
    2. Second: Lock the payment row (`paymentRepo.findForUpdate(paymentId, tx)`).
    3. Third: Lock the variant inventory row (`inventoryRepo.findForUpdate(variantId, tx)`).
  - Reverse locking (e.g. locking payment then order) is strictly forbidden.
- **Customer Deduplication & Guest/Registered Unification:**
  - Normalizes email addresses (lowercased and trimmed).
  - Finds existing customer records by email, updating missing contact info, or creates a new customer row.
  - Rejects manual customer creation from public admin contracts since the UI creates customers organically during checkout/order placement.
- **Inventory Idempotency Guard:**
  - Inside `inventoryService.commitOrderSale`, queries `inventory_movements` for existing `(orderId, variantId, reason: 'sale')` within the locked transaction.
  - If a sale movement is already recorded for that order and variant, stock deduction is bypassed, preventing double-deductions upon redundant payment approval calls.
- **Distinct 4-Way Cancellation & Refund Semantics:**
  - **Scenario A: Unpaid Order Cancellation:**
    Releases the reserved stock (`cancelOrderStock` with `wasCommitted = false`). Physical on-hand stock is untouched.
  - **Scenario B: Paid but Unshipped Order Cancellation:**
    Restores warehouse physical on-hand stock (`cancelOrderStock` with `wasCommitted = true`). Crucially, payment status remains `paid`; payment is NOT automatically marked as refunded.
  - **Scenario C: Shipped or Delivered Order Cancellation:**
    Does NOT restore warehouse inventory (merchandise is physically with the courier or customer). Payment status remains `paid`.
  - **Scenario D: Actual Payment Refund:**
    Dedicated `refundPayment` workflow. Marks the payment as `refunded` and transitions the order to `refunded` only after actual merchant refund processing. Does NOT adjust inventory.
- **State Transition Matrix:**
  - 9 order statuses: `awaiting_payment`, `payment_submitted`, `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`.
  - Rejects illegal transitions (e.g. `delivered` $\to$ `pending`) with structured `ValidationError`.

---

## 10. Coupons, Shipping, Engraving, Payment Methods & Store Settings Architecture

- **Authoritative Single-Point Coupon Validation & Concurrency (ADR 021):**
  - All coupon redemption logic is centralized exclusively in `CouponService` and `CouponRepository`.
  - `OrderService.createOrder` delegates coupon validation and locking to `couponService.validateAndLockForOrder(couponCode, subtotal, customerId, tx)`.
  - Row-level lock acquisition using PostgreSQL `SELECT ... FOR UPDATE` prevents concurrent race conditions (e.g., bypassing global limits or per-customer caps).
  - Extended Global Lock Hierarchy:
    $$\text{orders} \longrightarrow \text{payments} \longrightarrow \text{inventory} \longrightarrow \text{coupons}$$
  - `OrderRepository.createOrderBundle` delegates order-coupon association and counter incrementation to `CouponRepository.recordRedemption(orderId, couponId, discountAmount, tx)`, inserting an `order_coupons` record and incrementing `coupons.usageCount = usageCount + 1` atomically within the order transaction.
- **Safe Deactivation for Referential Integrity (ADR 021):**
  - Entities with historical order references cannot be hard deleted (`ON DELETE RESTRICT`):
    - `coupons` with existing `order_coupons` records.
    - `shipping_methods` referenced by `orders.shippingMethodId`.
    - `engraving_options` referenced by `order_item_engraving`.
  - Delete operations in respective services detect existing order references and perform safe soft deactivation (`isActive = false`) instead of throwing foreign key exceptions.
  - Hard deletion is only executed if zero order records reference the entity.
- **Partial Update Merged-Entity Validation:**
  - In `CouponService`, `ShippingService`, and `EngravingService`, partial updates retrieve the current record, merge incoming patch fields, and run the complete validation schema against the merged entity.
  - Prevents contradictory states (e.g. updating `minDays` to exceed existing `maxDays`, or setting `expiresAt` before existing `startsAt`).
- **Strict COD Engraving Business Invariant (ADR 022):**
  - Aligned with the database trigger `trg_check_engraving_cod` (`check_engraving_cod_rule`), custom engraved scrubs require digital advance payment.
  - `PaymentMethodService.updatePaymentMethod` strictly rejects any attempt to enable `allowedWithEngraving = true` on `cod`.
- **Atomic Entity Reordering & Batch Settings Persistence (ADR 022):**
  - `ShippingService.reorderShippingMethods` and `PaymentMethodService.reorderPaymentMethods` execute within `db.transaction`, detecting duplicate IDs and updating sort sequences atomically.
  - `SettingsService.updateSettingsBatch` validates entries against `storeSettingsValueSchemas` and persists them within `db.transaction` using `.onConflictDoUpdate()`.
  - Pass transaction executor to `getAllSettings(admin, tx)` to ensure uncommitted updates are visible within the same transaction scope.
- **Server Actions First (ADR 019):**
  - All admin mutations are exposed through Server Actions wrapped by `createSafeAction`.
  - Data loading in React Server Components consumes backend services/repositories directly in Node.js runtime.
  - Zero internal REST Route Handlers and zero read Server Actions.

---

## 11. CI/CD Pipeline, Branch Protection & Automated Testing Architecture (ARCH-009, TEST-001–007)

### Continuous Integration Pipeline (`.github/workflows/ci.yml`)
Every push and pull request to the `main` branch runs an automated multi-job pipeline on GitHub Actions:
1. **`install-and-verify`**:
   - `npm ci`
   - `npx tsc --noEmit` (strict TypeScript check, zero errors)
   - `npm run lint` (ESLint 9 + static regression guards via `scripts/check-guards.mjs`)
   - `npm run build` (Next.js 16 App Router production build with Turbopack)
2. **`audit`**:
   - `npm audit --audit-level=high`
3. **`schema-parity`**:
   - Ephemeral PostgreSQL 17 service container.
   - Runs `npm run db:migrate` followed by `npm run db:parity` (verifying all 31 tables, columns, indexes, enums, triggers, RLS, and foreign keys).
4. **`test`**:
   - Runs complete Vitest test harness (`npm test`) covering pure logic, declarative authorization matrix, DTO snapshots, security assertions, and concurrency invariants.

### Required Repository Branch Protection Rules (Manual GitHub Configuration)
For repository administrators, the following branch protection rules must be configured on the `main` branch:
- **Require a pull request before merging** (minimum 1 approving review).
- **Require status checks to pass before merging**:
  - `Typecheck, Lint & Build`
  - `Dependency Audit`
  - `PostgreSQL Schema Parity & Migrations`
  - `Automated Unit & Concurrency Test Harness`
- **Require branches to be up to date before merging** (strict linear history).
- **Do not allow bypassing the above settings**.
- **Include administrators in protection enforcement**.


