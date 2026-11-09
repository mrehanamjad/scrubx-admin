# ScrubX Admin — Implementation Log

> **Permanent AI Context Documentation**  
> *Chronological Development & Mutation History*

---

## Pre-Audit Phase: Vite SPA to Next.js 16 App Router Migration

### Objective
Convert the original Vite + React Router SPA into a modern Next.js 16 App Router TypeScript application with zero loss of UI fidelity.

### What Was Implemented
- Converted `react-router-dom` navigation (`Link`, `useNavigate`, `useLocation`, `useParams`) to Next.js App Router primitives (`next/link`, `useRouter`, `usePathname`, `useParams`).
- Replaced `<Outlet />` with React `children: React.ReactNode` in `AppShell`.
- Moved page components from `src/pages/` to `src/views/` to avoid naming conflicts with Next.js Pages Router conventions.
- Created `src/app/` file hierarchy with 15 routes, wrapping view components as leaves.
- Added `RootLayout` (`src/app/layout.tsx`) utilizing `next/font/google` for Inter, Plus Jakarta Sans, and JetBrains Mono.
- Added `'use client'` directives to all interactive components and the React Context store.
- Replaced Vite configuration with `next.config.ts`, `postcss.config.mjs`, and Tailwind CSS v4.

### Files Created
- `next.config.ts`, `postcss.config.mjs`
- `src/app/layout.tsx`, `src/app/globals.css`, `src/app/not-found.tsx`
- 15 route entrypoints: `src/app/**/page.tsx`
- `src/components/providers.tsx`
- 17 view components moved into `src/views/`

### Dependencies
- Installed: `next@16.4.5`, `react@19.2.0`, `react-dom@19.2.0`, `@tailwindcss/postcss@^4.3.4`, `tailwindcss@^4.3.4`
- Removed: `vite`, `@vitejs/plugin-react`, `react-router-dom`

### Verification & Tests
- `npm run build` compiled all 15 routes with 0 errors.

---

## Agent Skills Setup Phase

### Objective
Create custom workspace Agent Skills to govern code patterns, security guardrails, and architectural conventions for subsequent AI coding sessions.

### What Was Implemented
- Created plugin manifest `.agent/plugin.json`.
- Authored four specialized `SKILL.md` documents:
  1. `.agent/skills/better-auth/SKILL.md` (Authentication, sessions, RBAC, cookie security)
  2. `.agent/skills/supabase-postgres/SKILL.md` (Supabase as PostgreSQL layer, Drizzle ORM, RLS, triggers)
  3. `.agent/skills/imagekit/SKILL.md` (ImageKit SDK, direct uploads, transformations, asset lifecycle)
  4. `.agent/skills/nextjs-admin-best-practices/SKILL.md` (RSC conventions, async request APIs, Server Actions)

### Files Created
- `.agent/plugin.json`
- `.agent/skills/better-auth/SKILL.md`
- `.agent/skills/supabase-postgres/SKILL.md`
- `.agent/skills/imagekit/SKILL.md`
- `.agent/skills/nextjs-admin-best-practices/SKILL.md`

---

## Phase 0: Comprehensive Technical Audit

### Objective
Execute a non-destructive, read-only architectural audit of the entire codebase, identifying missing configurations, schema alignment, mock data dependencies, and required implementation phases.

### Findings
- Found 24 database tables designed in `database.md` and `supabase/migrations/20261105000000_initial_schema.sql`.
- Discovered `src/db/schema.ts` lacked inferred types (`$inferSelect`, `$inferInsert`) and secondary table relations.
- Noted `drizzle.config.ts`, `.env`, and `.env.example` were missing.
- Identified that all 16 views and layout navigation depended completely on `useStore()` and `src/data/mock.ts`.
- Mapped discrepancies between mock types (`types.ts`) and database schema (`schema.ts`).
- Identified missing dependencies (`better-auth`, `imagekit`).

### Actions Taken
- Zero code modified (audit-only constraint respected).
- Produced comprehensive Phase 0 audit report and implementation sequence.

---

## Phase 1: Supabase PostgreSQL Infrastructure Implementation

### Objective
Establish the database layer connecting Next.js 16 to Supabase PostgreSQL using Drizzle ORM, enforcing strict server-only boundaries, connection pooling, and schema validation.

### What Was Implemented
- Created `drizzle.config.ts` configured for PostgreSQL dialect with automatic `.env.local` loading.
- Created `.env.example` with documented placeholders for Supavisor transaction pooler on port 6543.
- Created `.env.local` (developer added active Supabase connection string).
- Updated `.gitignore` to explicitly ignore `.env`, `.env.local`, and `.env*.local`.
- Rewrote `src/db/index.ts` with:
  - `typeof window !== "undefined"` server-only boundary check.
  - Connection pooling via `postgres` driver (`prepare: false` for Supavisor).
  - Dev connection caching on `globalThis.__scrubx_postgres_client__` to prevent connection leaks during Next.js HMR.
  - Re-exports of `db`, `client`, and schema models.
- Enhanced `src/db/schema.ts`:
  - Added full bidirectional Drizzle relations for all 24 tables.
  - Exported `$inferSelect` and `$inferInsert` types for every table.
- Created `src/db/verify-connection.ts` to test connectivity, table counts, latency, and sanitize output.
- Added npm scripts: `db:verify`, `db:check`, `db:generate`.

### Files Created
- `drizzle.config.ts`
- `.env.example`, `.env.local`
- `src/db/verify-connection.ts`

### Files Modified
- `.gitignore`
- `package.json`
- `src/db/index.ts`
- `src/db/schema.ts`

### Verification & Tests
1. `npm run db:check`: Passed (`Everything's fine 🐶🔥`).
2. `npx tsc --noEmit`: Clean (0 errors).
3. `npm run db:verify`: Connected to live Supabase PostgreSQL (PostgreSQL v17.11, latency 1392ms, 0 tables found prior to migration).
4. `npm run build`: Compiled all 15 routes successfully.

---

## Phase 2: Better Auth Production Integration

### Objective
Integrate production-ready authentication and role-based access control (RBAC) using Better Auth with Drizzle PostgreSQL adapter, protect all admin routes, build login UI, and seed initial administrator.

### What Was Implemented
- Installed `better-auth` (`^1.7.17`) using `--legacy-peer-deps` to resolve Drizzle ORM peerOptional conflict.
- Created `src/lib/auth.ts`: Better Auth server instance using `drizzleAdapter` linked to `ba_user`, `ba_session`, `ba_account`, and `ba_verification`.
  - Configured `emailAndPassword: { enabled: true, disableSignUp: true }` — public sign-up blocked.
  - Configured `admin()` plugin with roles: `SUPER_ADMIN`, `ADMIN`, `STAFF`.
- Created `src/lib/auth-client.ts`: React client SDK with `adminClient()` plugin.
- Created `src/app/api/auth/[...all]/route.ts`: Route handler exporting `GET` and `POST`.
- Created `src/lib/auth-guard.ts`: Server-side authorization helpers (`getSession`, `requireAuth`, `requireRole`, `requireSuperAdmin`, `requireAdmin`, `requireStaff`, `hasMinimumRole`).
- Created `src/middleware.ts`: Edge route protection inspecting `better-auth.session_token` via `getSessionCookie(request)`. Redirects unauthenticated requests to `/login?from=<pathname>` and authenticated users away from `/login`.
- Created `src/views/Login.tsx` & `src/app/login/page.tsx`: Full login page matching ScrubX design, with `<Suspense>` boundary.
- Updated `src/components/layout/app-shell.tsx`: Bypasses admin sidebar and topbar when visiting `/login`.
- Updated `src/components/layout/topbar.tsx`: Replaced prototype user with live session data and interactive Sign out action.
- Created `src/db/migrate.ts`: Executed `supabase/migrations/20261105000000_initial_schema.sql` against live Supabase database, creating all 24 tables.
- Updated `ba_user_role_check` constraint in PostgreSQL and migration SQL to support `SUPER_ADMIN`, `ADMIN`, `STAFF`.
- Created `src/scripts/create-admin.ts`: Seeded initial `SUPER_ADMIN` account (`admin@scrubx.pk`).
- Created `src/app/api/auth/verify/route.ts`: Comprehensive verification suite endpoint.

### Files Created
- `src/lib/auth.ts`
- `src/lib/auth-client.ts`
- `src/lib/auth-guard.ts`
- `src/middleware.ts`
- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/auth/verify/route.ts`
- `src/app/login/page.tsx`
- `src/views/Login.tsx`
- `src/db/migrate.ts`
- `src/scripts/create-admin.ts`
- `src/scripts/test-auth.ts`

### Files Modified
- `package.json` (added `better-auth`, scripts: `db:migrate`, `auth:seed-admin`, `auth:test`)
- `.env.local` (added `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`)
- `src/components/layout/app-shell.tsx`
- `src/components/layout/topbar.tsx`
- `supabase/migrations/20261105000000_initial_schema.sql` (updated `ba_user_role_check` constraint)

### Verification & Tests
1. **Live Schema Migration (`npm run db:migrate`):** Successfully executed in 2269ms. Verified all 24 tables present in Supabase public schema.
2. **Admin Provisioning (`npm run auth:seed-admin`):** Seeded `admin@scrubx.pk` with `SUPER_ADMIN` role and scrypt/argon2 hashed password.
3. **TypeScript Check (`npx tsc --noEmit`):** Clean (0 errors).
4. **Drizzle Check (`npm run db:check`):** Clean (`Everything's fine 🐶🔥`).
5. **Next.js Production Build (`npm run build`):** Clean compilation of all 17 routes.
6. **Full Verification Suite (`/api/auth/verify`):**
   - Admin Login with Valid Credentials: **PASS** (Status 200, role `SUPER_ADMIN`)
   - Rejection of Invalid Credentials: **PASS** (Status 401)
   - Session Persistence & PostgreSQL Retrieval: **PASS** (Session verified via cookie)
   - Role-Based Access Control Hierarchy: **PASS**
   - Public Sign-Up Disabled: **PASS** (Status 400 rejected)
   - Logout & Session Revocation: **PASS** (Session destroyed in DB)
7. **Middleware Route Protection Tests:**
   - `GET /` $\to$ 307 Redirect to `/login`
   - `GET /products` $\to$ 307 Redirect to `/login?from=%2Fproducts`
   - `GET /login` $\to$ 200 OK

### Known Quirks / Technical Notes
- Next.js 16 displays a warning during build: `The "middleware" file convention is deprecated. Please use "proxy" instead.` The Next.js team introduced `proxy.ts` in Next.js 16 canary, but `middleware.ts` remains fully functional and standard.


---

## Phase 2.5: AI Development Context System & Skill Establishment

### Objective
Establish a permanent, multi-document AI context system under `docs/ai-context/` and create an Agent Skill (`project-context-management`) to govern documentation synchronization after every future prompt.

### What Was Implemented
- Created `docs/ai-context/` repository documentation system containing 8 core documents:
  - `PROJECT_OVERVIEW.md`: Stack, workflows, restrictions.
  - `ARCHITECTURE.md`: Directory structure, system boundaries, and data flow.
  - `IMPLEMENTATION_LOG.md`: Chronological log of all completed phases and verifications.
  - `DATABASE_CONTEXT.md`: 24 PostgreSQL tables, Drizzle schema, triggers, and connection parameters.
  - `AUTH_CONTEXT.md`: Better Auth engine, RBAC, middleware, login UI, and seed workflow.
  - `IMAGEKIT_CONTEXT.md`: ImageKit integration blueprint (explicitly marked as Not Yet Implemented).
  - `PENDING_TASKS.md`: Master roadmap and checklist of completed vs remaining phases.
  - `DECISIONS.md`: 11 Architectural Decision Records (ADRs).
- Authored `.agent/skills/project-context-management/SKILL.md`:
  - Pre-execution checklist (reading context, verifying against code).
  - Post-execution documentation update protocol.
  - Implementation logging standards.
  - Accuracy and integrity rules (no hallucinated features, masked secrets, immutable logs).
- Updated `.agent/plugin.json` to register the new skill and suggested prompt.

### Files Created
- `docs/ai-context/PROJECT_OVERVIEW.md`
- `docs/ai-context/ARCHITECTURE.md`
- `docs/ai-context/IMPLEMENTATION_LOG.md`
- `docs/ai-context/DATABASE_CONTEXT.md`
- `docs/ai-context/AUTH_CONTEXT.md`
- `docs/ai-context/IMAGEKIT_CONTEXT.md`
- `docs/ai-context/PENDING_TASKS.md`
- `docs/ai-context/DECISIONS.md`
- `.agent/skills/project-context-management/SKILL.md`

### Files Modified
- `.agent/plugin.json` (registered project-context-management skill)

### Dependencies
- Installed: None
- Removed: None

### Key Technical Decisions
- All operational context is centralized in `docs/ai-context/` so any AI model in future sessions can immediately resume work without context loss.
- Documentation must always reflect verified source code reality, never speculative or untested claims.

### Verification & Tests
1. **Directory Inspection:** Verified all 8 markdown documents exist under `docs/ai-context/`.
2. **Skill Format Check:** Verified `.agent/skills/project-context-management/SKILL.md` contains valid YAML frontmatter and actionable instructions.
3. **Plugin Manifest Validation:** Verified `.agent/plugin.json` is well-formed JSON.
4. **TypeScript Sanity:** `npx tsc --noEmit` exited 0 (clean).
5. **Drizzle Sanity:** `npm run db:check` exited 0 (clean).

### Known Issues & Minor Warnings
- None.

### Manual Configuration Required
- None.


---

## Phase 3: PostgreSQL Database Schema Finalization & Modular Drizzle Reorganization

### Objective
Transition the Drizzle ORM schema into a pure domain-driven modular structure (`src/db/schema/`), eliminate the monolithic `src/db/schema.ts` facade, apply new schema migrations (`order_notes`, `image_file_id`, UI alignment columns), normalize user roles to canonical lowercase (`super_admin`, `admin`, `staff`, `customer`), enforce strict non-circular JSONB typing with matching Zod schemas, configure stored generated column `line_total`, and validate the live database with a 3-pillar verification suite.

### What Was Implemented
- **Modular Schema Directory (`src/db/schema/`):**
  - Created 16 modular schema files (`enums.ts`, `json-types.ts`, `json-schemas.ts`, `auth.ts`, `catalog.ts`, `inventory.ts`, `engraving.ts`, `customers.ts`, `shipping.ts`, `coupons.ts`, `payment-methods.ts`, `orders.ts`, `payments.ts`, `settings.ts`, `relations.ts`, `types.ts`, `index.ts`).
  - Deleted legacy monolithic `src/db/schema.ts` file.
  - Updated `drizzle.config.ts` to `./src/db/schema/index.ts`.
  - Updated `src/db/index.ts` and `src/lib/auth.ts` imports.
- **Strict JSONB Column Typings & Validation:**
  - `json-types.ts`: Pure TypeScript interfaces without table imports or index signatures (`[key: string]: unknown`).
  - `VariantAttributes`: Only `{ manual?: boolean }` (used by product form variant matrix generator).
  - `ShippingAddressSnapshot`: Immutable delivery address snapshot (`fullName`, `phone`, `addressLine1`, `addressLine2`, `city`, `province`, `postalCode`, `country`).
  - `PaymentMetadata`: Only `{ customerNotes?: string }` (dropped `ipAddress`).
  - `StoreSettingsMap`: Per-key typed mapping for store settings.
  - `json-schemas.ts`: Runtime Zod validation schemas matching each JSONB type.
- **Canonical Lowercase Role Normalization:**
  - Standardized user roles to `super_admin`, `admin`, `staff`, `customer`.
  - Replaced `ba_user_role_check` constraint in PostgreSQL.
  - Updated Better Auth admin plugin: `adminRole: ["super_admin", "admin"]`, `defaultRole: "staff"`.
  - Updated `src/lib/auth-guard.ts`, `src/scripts/create-admin.ts`, and `src/app/api/auth/verify/route.ts`.
- **Database Migration (`20261105000001_phase3_schema_refinements.sql`):**
  - Applied lowercase role normalization constraint.
  - Created `order_notes` table (UUID PK, order_id cascade, body non-empty check, created_by FK, RLS enabled).
  - Added `product_categories.image_file_id text` for ImageKit.
  - Added missing UI columns: `products.is_featured`, `shipping_methods.min_days`, `shipping_methods.max_days`, `payment_methods.supports_proof`.
  - All migrations recorded in journal table `_app_migrations`.
- **Stored Generated Column:**
  - `order_items.line_total` declared with `.generatedAlwaysAs(sql\`("unit_price" * "quantity")\`)`.
  - Excluded from `NewOrderItem` insert type; tested rejection on explicit insert and verified automatic calculation.
- **Three-Pillar Verification Suite:**
  - **Pillar A:** Temporary introspection diff using `drizzle-kit pull`.
  - **Pillar B:** `src/scripts/verify-schema-parity.ts` (`npm run db:parity`) checking 25 tables, column types, nullability, enums, FKs, indexes, triggers, and RLS on every table.
  - **Pillar C:** `src/scripts/test-schema-integrity.ts` (`npm run db:integrity`) running within a rolled-back transaction testing COD+engraving trigger rejection, order number sequence generation, generated `line_total` behavior, inventory check constraints, and composite unique variant constraints.

### Files Created
- `supabase/migrations/20261105000001_phase3_schema_refinements.sql`
- `src/db/schema/enums.ts`
- `src/db/schema/json-types.ts`
- `src/db/schema/json-schemas.ts`
- `src/db/schema/auth.ts`
- `src/db/schema/catalog.ts`
- `src/db/schema/inventory.ts`
- `src/db/schema/engraving.ts`
- `src/db/schema/customers.ts`
- `src/db/schema/shipping.ts`
- `src/db/schema/coupons.ts`
- `src/db/schema/payment-methods.ts`
- `src/db/schema/orders.ts`
- `src/db/schema/payments.ts`
- `src/db/schema/settings.ts`
- `src/db/schema/relations.ts`
- `src/db/schema/types.ts`
- `src/db/schema/index.ts`
- `src/scripts/verify-schema-parity.ts`
- `src/scripts/test-schema-integrity.ts`

### Files Modified
- `package.json` (added `db:parity`, `db:integrity` scripts)
- `drizzle.config.ts` (updated schema path to `./src/db/schema/index.ts`)
- `src/db/index.ts` (updated imports to `./schema/index.ts`, added env loader)
- `src/db/migrate.ts` (added journal table `_app_migrations` and transaction runner)
- `src/lib/auth.ts` (updated admin plugin to lowercase roles)
- `src/lib/auth-guard.ts` (updated role types and helpers to lowercase roles)
- `src/scripts/create-admin.ts` (updated role to super_admin)
- `src/app/api/auth/verify/route.ts` (updated test suite for lowercase roles)
- `src/scripts/test-auth.ts` (updated test assertions for super_admin)
- `tsconfig.json` (added `"allowImportingTsExtensions": true`)

### Files Removed
- `src/db/schema.ts` (monolithic facade eliminated)

### Dependencies
- Installed: None
- Removed: None

### Verification & Tests
1. **Pillar B Parity Verification (`npm run db:parity`):** 8/8 test categories passed. All 25 tables, column types, enums, 31 foreign keys, indexes, triggers, and RLS verified.
2. **Pillar C Schema Integrity (`npm run db:integrity`):** 5/5 business rule and constraint tests passed inside rolled-back transaction (COD trigger rejection, SX-1003 sequence generation, line_total generated column calculation, inventory check rejection, unique variant rejection).
3. **Better Auth Test Suite (`npm run auth:test`):** 22/22 assertions passed with `super_admin` role.
4. **TypeScript Type Check (`npx tsc --noEmit`):** 0 errors.
5. **Next.js Production Build (`npm run build`):** 17 static and dynamic routes compiled cleanly in 10.3s.


---

## [Phase 4] ImageKit Media Pipeline Integration

- **Date:** November 2026
- **Status:** Completed
- **Lead / Agent:** Antigravity

### Objectives
1. Integrate ImageKit as the sole image storage and delivery provider for ScrubX admin.
2. Provide direct client-side uploads with server-generated ephemeral signatures, bypassing serverless function payload limits.
3. Implement edge URL transformations and responsive presets for high-performance CDN delivery.
4. Build reusable, accessible `ImageUpload` UI component with drag-and-drop, progress tracking, color variant tagging, and backward-compatible manual URL input.
5. Integrate ImageKit upload and deletion into Product Form (`ProductForm.tsx`) and Category Dialog (`Categories.tsx`).
6. Build and pass automated connection and live lifecycle test suites (`test-imagekit-connection.ts`, `test-imagekit-lifecycle.ts`).

### Implementation Summary
- **Dependencies Installed:**
  - `imagekit@^6.0.0` (Official Node.js SDK for server operations)
  - `@imagekit/next@^2.1.6`
- **Next.js Configuration:**
  - Updated `next.config.ts` with `remotePatterns` for `ik.imagekit.io`.
- **Server SDK Architecture (`src/lib/imagekit.ts`):**
  - Strict server-side boundary guard throwing error if imported into browser bundles.
  - Lazy Proxy singleton `imagekit` avoiding premature environment variable evaluation during builds or testing.
- **Upload Authentication Handler (`src/app/api/upload/auth/route.ts`):**
  - Dynamically rendered GET route handler protected by `requireStaff()`.
  - Generates HMAC-SHA1 signature, unique token, and expiration timestamp using `imagekit.getAuthenticationParameters()`.
- **Server Actions (`src/actions/media.ts`):**
  - `deleteMediaAction(fileId: string)`: Protected with `requireAdmin()`, calls `imagekit.deleteFile(fileId)`.
  - `uploadServerMediaAction(formData: FormData)`: Protected with `requireAdmin()`, validates 5MB limit and MIME type, uploads via buffer.
- **Client Upload Utility (`src/lib/imagekit-upload.ts`):**
  - `uploadToImageKit(file, options)` directly posts `FormData` to `https://upload.imagekit.io/api/v1/files/upload`.
  - Uses `XMLHttpRequest` to provide real-time 0-100% upload progress events.
- **Edge URL Transformations (`src/lib/imagekit-url.ts`):**
  - `getImageKitUrl(pathOrUrl, options)` generating path syntax `tr:w-...,h-...,q-...,f-...`.
  - Presets: `getImageThumbnailUrl` (150x150, q-80), `getProductCardImageUrl` (400x500, q-85), `getProductHeroImageUrl` (800x1000, q-90), `getCategoryBannerUrl` (600x300, q-85).
  - Handles relative paths, existing ImageKit URLs, and non-ImageKit URLs gracefully.
- **UI Component (`src/components/shared/image-upload.tsx`):**
  - Drag-and-drop dropzone with custom styling and accessible hidden file input.
  - Multiple vs. single modes, in-flight progress bar with status indicators, color selector for product variants, manual URL input toggle, and ImageKit deletion callback.
- **Admin Form Integrations:**
  - `src/views/ProductForm.tsx`: Added `ImageUpload` with color tagging (`shared` vs variant colors), `IK` badge on uploaded cards, background purge on delete, preserving mock library thumbnails.
  - `src/views/Categories.tsx`: Integrated `ImageUpload` in `CategoryDialog`, updating `draft.image` and `draft.imageFileId`, preserving mock presets.
  - `src/lib/types.ts`: Added `fileId?: string` to `ProductImage` and `imageFileId?: string` to `Category`.

### Files Created
- `src/lib/imagekit.ts`
- `src/app/api/upload/auth/route.ts`
- `src/actions/media.ts`
- `src/lib/imagekit-upload.ts`
- `src/lib/imagekit-url.ts`
- `src/components/shared/image-upload.tsx`
- `src/scripts/test-imagekit-connection.ts`
- `src/scripts/test-imagekit-lifecycle.ts`

### Files Modified
- `package.json` (added `imagekit`, `@imagekit/next`, `imagekit:test`, `imagekit:lifecycle` scripts)
- `next.config.ts` (added `ik.imagekit.io` remote pattern)
- `.env.example` (labeled Phase 4 ImageKit variables)
- `src/lib/types.ts` (added `fileId` and `imageFileId`)
- `src/views/ProductForm.tsx` (integrated `ImageUpload`, color tagging, background delete)
- `src/views/Categories.tsx` (integrated `ImageUpload` into category dialog)
- `docs/ai-context/IMAGEKIT_CONTEXT.md` (updated to IMPLEMENTED & ACTIVE)
- `docs/ai-context/PENDING_TASKS.md` (marked Phase 4 completed)

### Verification & Tests
1. **ImageKit Connection & URL Suite (`npm run imagekit:test`):** 17/17 assertions passed (SDK init, auth token generation, HMAC signature, future expiration, edge URL transformations, presets, full URL handling).
2. **ImageKit Live Lifecycle Test (`npm run imagekit:lifecycle`):** 6/6 assertions passed (uploaded buffer to `/scrubx/products`, received `fileId`, verified URL, generated edge transformations, deleted asset via `deleteFile()`, confirmed cleanup).
3. **TypeScript Type Check (`npx tsc --noEmit`):** 0 errors.
4. **Next.js Production Build (`npm run build`):** All 18 static and dynamic routes compiled successfully in Turbopack.


---

## [Phase 5] Production-Ready Backend Architecture (DAL & Foundation)

- **Date:** November 2026
- **Status:** Completed
- **Lead / Agent:** Antigravity

### Objectives
1. Create a clean, reusable, type-safe, and scalable backend architecture for the ScrubX admin panel before implementing individual business modules.
2. Establish explicit boundaries between Database Access, Repositories, Services, Validation, Action Middleware, Server Actions, and Route Handlers.
3. Implement centralized, sanitized error handling preventing internal database error or credential leakage to clients.
4. Provide reusable authentication and role authorization helpers (`getCurrentAdmin`, `assertRole`, `hasMinimumRole`).
5. Build composable Zod validation schemas for monetary values, UUIDs, slugs, quantities, pagination, date ranges, and file uploads.
6. Create higher-order `createSafeAction` wrapper eliminating repetitive boilerplate in Server Actions.
7. Implement demonstration repository, service, and server action for Store Settings and verify live PostgreSQL query connectivity.

### Implementation Summary
- **Layer 1: Error Handling & Sanitization (`src/server/errors.ts`):**
  - Base `AppError` class with `statusCode`, `code`, `isOperational`, and `details`.
  - Concrete subclasses: `AuthenticationError` (401), `AuthorizationError` (403), `ValidationError` (400), `NotFoundError` (404), `ConflictError` (409), `DatabaseError` (500).
  - Universal `toActionError()` serializer converting `ZodError` into structured `fieldErrors` map, masking PostgreSQL constraint error codes (`23505`, `23503`, `23514`, `P0001`), and preventing internal credential leaks.
- **Layer 2: Authentication & Authorization Engine (`src/server/auth.ts`):**
  - Server-side context extractor `getCurrentAdmin()` retrieving Better Auth session from `next/headers`, enforcing active user existence, and verifying non-banned status.
  - Role hierarchy evaluator: `super_admin` (3) $\ge$ `admin` (2) $\ge$ `staff` (1).
  - `assertRole(admin, allowedRoles)` throwing `AuthorizationError` on insufficient privileges.
  - Convenience guard helpers: `requireStaffContext()`, `requireAdminContext()`, `requireSuperAdminContext()`.
- **Layer 3: Validation Schemas (`src/server/validation/`):**
  - `common.ts`: Reusable Zod schemas for `uuidSchema`, `slugSchema`, `pricePkrSchema` (coerced non-negative max 2 decimals), `quantitySchema` (whole non-negative integer), `percentageSchema` (0-100), `paginationSchema` (page $\ge 1$, limit 1-100, default 20), `searchQuerySchema`, `dateRangeSchema` (chronological order invariant), and `fileUploadMetaSchema` (size $\le 5\text{MB}$, allowed MIME types, allowed folder namespace).
  - `settings.ts`: Schemas for single-setting updates (`updateStoreSettingSchema`) with dynamic value validation and retrieval (`getStoreSettingSchema`).
  - `index.ts`: Barrel export.
- **Layer 4: Types & Standard Contracts (`src/server/types.ts`):**
  - Universal `ActionResponse<T>` contract with mutually exclusive `success: true, data: T` vs `success: false, error: string, code?: string, fieldErrors?: Record<string, string[]>`.
  - Standard `PaginationParams` and `PaginatedResult<T>` interfaces.
- **Layer 5: Action Pipeline Wrapper (`src/server/action-client.ts`):**
  - `createSafeAction(config, handler)` higher-order function automating session authentication, role hierarchy verification, Zod input parsing, domain execution, and sanitized error mapping.
- **Layer 6: Repositories Layer (`src/server/repositories/`):**
  - `base.repository.ts`: Universal `DatabaseExecutor` type (accepting `db` or `tx`), `buildPaginationOffset`, and `buildPaginatedResult`.
  - `settings.repository.ts`: Pure Drizzle operations querying `store_settings` (`getAllSettings`, `getSettingByKey`, `upsertSetting` via `.onConflictDoUpdate()`, `checkDatabaseHealth` via `SELECT NOW()`).
- **Layer 7: Services Layer (`src/server/services/`):**
  - `settings.service.ts`: Business logic orchestration enforcing staff read / admin write permissions, default settings fallback, and audit logging (`updatedBy = admin.id`).
- **Layer 8: Server Actions Layer (`src/actions/settings.ts`):**
  - `getStoreSettingsAction`: Authenticated server query fetching store settings.
  - `getStoreSettingByKeyAction`: Single-setting query.
  - `updateStoreSettingAction`: Authenticated mutation validating input via Zod, enforcing admin privileges, updating database via service, and revalidating `/settings` cache.
  - `getDatabaseHealthAction`: Live database connectivity health query.
- **Layer 9: Automated Test Suite (`src/scripts/test-backend-architecture.ts`):**
  - 46 comprehensive automated test cases across Validation, Error Handling, Authentication/Authorization, Repositories, Services, and Safe Actions.

### Files Created
- `src/server/errors.ts`
- `src/server/auth.ts`
- `src/server/validation/common.ts`
- `src/server/validation/settings.ts`
- `src/server/validation/index.ts`
- `src/server/types.ts`
- `src/server/action-client.ts`
- `src/server/repositories/base.repository.ts`
- `src/server/repositories/settings.repository.ts`
- `src/server/repositories/index.ts`
- `src/server/services/settings.service.ts`
- `src/server/services/index.ts`
- `src/actions/settings.ts`
- `src/scripts/test-backend-architecture.ts`

### Files Modified
- `package.json` (added `"backend:test"` script)
- `docs/ai-context/PENDING_TASKS.md` (marked Phase 5 completed, detailed deliverables)

### Verification & Tests
1. **Backend Architecture Test Suite (`npm run backend:test`):** 46/46 assertions passed across all 6 categories (Validation, Error Sanitization, Auth Hierarchy, Repositories, Services, Safe Action Pipeline).
2. **ImageKit Connection Suite (`npm run imagekit:test`):** 17/17 passed.
3. **Better Auth Test Suite (`npm run auth:test`):** 22/22 passed.
4. **PostgreSQL Parity Check (`npm run db:parity`):** 8/8 categories passed.
5. **TypeScript Type Check (`npx tsc --noEmit`):** 0 errors.
6. **Next.js Production Build (`npm run build`):** 18/18 routes compiled successfully in Turbopack.

---

## 2026-11-06 — Phase 6A: Implement Product and Category Backend

### Objective
Implement the complete backend engine for Products, Categories, Product Variants, Inventory Records, and Product Images in ScrubX Admin using Next.js 16 App Router, TypeScript, Drizzle ORM, Supabase PostgreSQL, Better Auth, ImageKit, and Zod.

### Architecture & Implementation Summary
1. **Validation Schemas (`src/server/validation/catalog.ts`):**
   - Implemented Zod schemas for Categories: `createCategorySchema`, `updateCategorySchema`, `deleteCategorySchema`, `categoryFilterSchema`, `getCategoryByIdSchema`, `toggleCategoryStatusSchema`.
   - Implemented Zod schemas for Product Sub-Entities: `productColorInputSchema`, `productVariantInputSchema`, `productImageInputSchema`.
   - Implemented Zod schemas for Products: `createProductSchema`, `updateProductSchema`, `productFilterSchema` (search, faceted filtering, pagination, sorting), `getProductByIdSchema`, `archiveProductSchema`, `deleteProductSchema`.
   - Exported through `src/server/validation/index.ts`.
2. **Category Repository (`src/server/repositories/category.repository.ts`):**
   - `findAll(options)`: Left joins `products` table and computes live `productCount` using SQL count filter excluding soft-deleted products.
   - `findById(id)`, `findBySlug(slug)`.
   - `create(data)`, `update(id, data)`, `delete(id)`.
   - Safe deletion helpers: `getProductCount(categoryId)`, `reassignProducts(fromId, toId)`, `unparentChildren(categoryId, newParentId)`.
3. **Product Repository (`src/server/repositories/product.repository.ts`):**
   - `findPaginated(filter)`: Multi-faceted filtering (`q` search across product name and SKU, `categoryId`, `status`, `gender`, `isFeatured`, `inStock`), dynamic order clause, limit/offset pagination with total count, primary image extraction, color counts, variant counts, price ranges (`minPrice`, `maxPrice`), and total stock.
   - `findById(id)`: Deep bundle query joining product base, category, sorted colors, variants with live inventory levels, and sorted images.
   - `findBySlug(slug)`, `isSlugTaken(slug, ignoreId)`.
   - `createProductRow(data)`, `updateProductRow(id, data)`, `softDelete(id)`, `permanentDelete(id)`.
4. **Category Business Service (`src/server/services/category.service.ts`):**
   - Role enforcement (`staff` for reads, `admin` for mutations).
   - Hierarchy tree assembly (`getAllCategories(admin, { tree: true })`).
   - Slug uniqueness validation.
   - Circular hierarchy prevention (`isDescendant` traversal preventing assigning descendants as parents).
   - Safe deletion guard: prevents deletion if active products reference the category unless `reassignToCategoryId` is provided; unparents child categories to prevent broken references.
   - Post-commit ImageKit media cleanup via `safeDeleteImageKitFile()`.
5. **Product Business Service (`src/server/services/product.service.ts`):**
   - Atomic product creation (`db.transaction`): base product, colors with mapped UUIDs, variants with unique SKU validation, automatic `inventory` table initialization (`quantityOnHand = variant.stock`), automatic `inventory_movements` restock log with admin attribution, and images.
   - Atomic product update & stock reconciliation: updates product row, reconciles colors, reconciles variants, calculates stock deltas and logs `inventory_movements` with `reason = 'adjustment'`, preserves customer order history by safe deactivating variants that have historical orders instead of deleting, and purges removed media from ImageKit.
   - Product archival (`archiveProduct`) setting `status = 'archived'` and `deletedAt`.
   - Product permanent deletion (`deleteProduct`) guarded against hard deleting products with historical orders, and purging all media assets from ImageKit post-commit.
6. **Server Actions (`src/actions/categories.ts`, `src/actions/products.ts`):**
   - Wrapped with `createSafeAction`: validates input with Zod, checks session role hierarchy, masks database exceptions, and revalidates `/categories`, `/products`, `/inventory`.
7. **Automated Test Suite (`src/scripts/test-catalog-backend.ts`):**
   - 43 test assertions covering Category tree, toggle, circular hierarchy, duplicate slug, product atomic transaction, inventory stock, restock movement, catalog search/filters, variant stock adjustment movement, safe category deletion with reassignment, archival, hard deletion, and role protection.

### Files Created
- `src/server/validation/catalog.ts`
- `src/server/repositories/category.repository.ts`
- `src/server/repositories/product.repository.ts`
- `src/server/services/category.service.ts`
- `src/server/services/product.service.ts`
- `src/actions/categories.ts`
- `src/actions/products.ts`
- `src/scripts/test-catalog-backend.ts`

### Files Modified
- `src/server/validation/index.ts` (exported catalog schemas)
- `src/server/repositories/index.ts` (exported category and product repositories)
- `src/server/services/index.ts` (exported category and product services)
- `package.json` (added `"catalog:test"` script)
- `docs/ai-context/PENDING_TASKS.md` (updated roadmap and deliverables)
- `docs/ai-context/ARCHITECTURE.md` (documented catalog data access and services)
- `docs/ai-context/DECISIONS.md` (documented catalog decisions)

### Verification & Tests
1. **Catalog Backend Suite (`npm run catalog:test`):** 43/43 assertions passed.
2. **Backend Architecture Suite (`npm run backend:test`):** 46/46 passed.
3. **ImageKit Tests (`npm run imagekit:test`):** 17/17 passed.
4. **Better Auth Tests (`npm run auth:test`):** 22/22 passed.
5. **Database Schema Parity (`npm run db:parity`):** 8/8 passed.
6. **TypeScript Strict Typecheck (`npx tsc --noEmit`):** 0 errors.
7. **Next.js Production Build (`npm run build`):** 18/18 routes compiled successfully in Turbopack.

---

## 2026-11-06 — Phase 6B: Implement Inventory Management Backend

### Objective
Implement the complete backend engine for Inventory Management and Stock Audit History in ScrubX Admin using Next.js 16 App Router, TypeScript, Drizzle ORM, Supabase PostgreSQL, Better Auth, and Zod. Ensure transactional locking (`SELECT ... FOR UPDATE`) prevents concurrent update anomalies and guarantees non-negative stock invariants.

### Architecture & Implementation Summary
1. **Validation Schemas (`src/server/validation/inventory.ts`):**
   - `inventoryStatusEnum`: `"healthy" | "low" | "out"`.
   - `inventoryFilterSchema`: Search keyword `q`, category ID, stock status filter, pagination (`page`, `limit`), and sorting (`sortBy`, `sortOrder`).
   - `getVariantInventorySchema`, `getProductInventorySchema`.
   - `adjustStockModeEnum`: `"add" | "remove" | "set"`.
   - `inventoryMovementReasonEnum`: `"restock" | "adjustment" | "sale" | "cancellation" | "return"`.
   - `adjustStockSchema`, `restockSchema`, `inventoryMovementFilterSchema`.
   - Exported through `src/server/validation/index.ts`.
2. **Inventory Repository (`src/server/repositories/inventory.repository.ts`):**
   - `findPaginated(filter, executor)`: Multi-search (`q`) matching product title or SKU, category filter, status filter (`low`, `out`, `healthy`), dynamic sorting, pagination, calculated `availableStock` (`quantityOnHand - quantityReserved`), computed `stockStatus`, and computed `stockValue` (`availableStock * variant.price`).
   - `getSummaryMetrics(executor)`: Aggregated SQL KPIs (`totalUnitsInStock`, `totalReservedUnits`, `totalStockValue`, `totalSkus`, `lowStockCount`, `outOfStockCount`, `healthyStockCount`).
   - `findByVariantId(variantId, executor)`: Deep fetch joining variant, product, category, and color details.
   - `findByProductId(productId, executor)`: Complete variant inventory array for product detail views.
   - `findForUpdate(variantId, tx)`: Row-level exclusive lock `tx.select().from(inventory).where(eq(inventory.variantId, variantId)).for("update")`.
   - `updateInventoryRow(id, data, executor)`, `insertMovement(data, executor)`, and `findMovementsPaginated(filter, executor)`.
   - Exported through `src/server/repositories/index.ts`.
3. **Inventory Business Service (`src/server/services/inventory.service.ts`):**
   - Role enforcement (`staff` for read queries, `admin` or `super_admin` for adjustments).
   - `getInventory(filter, admin)`: Staff RBAC, normalized pagination/sorting.
   - `getInventorySummary(admin)`: Staff RBAC KPI overview.
   - `getVariantInventory(variantId, admin)`, `getProductInventory(productId, admin)`.
   - `adjustStock(input, admin)`: Admin RBAC, executed in `db.transaction`, row lock `findForUpdate`, verifies `nextOnHand >= 0` invariant, verifies `nextOnHand >= quantityReserved` to protect open customer orders, updates row, and logs `inventory_movements` with admin attribution.
   - `restock(input, admin)`: Helper calling `adjustStock` with mode `"add"`, reason `"restock"`.
   - `getMovements(filter, admin)`: Staff RBAC audit trail.
   - Order lifecycle primitives:
     - `reserveStock(variantId, quantity, orderId?, executor?)`: Pessimistically locks row, verifies `availableStock >= quantity`, updates `quantityReserved`, and throws `ConflictError` on insufficient stock.
     - `releaseReservedStock(variantId, quantity, orderId?, executor?)`: Safely decrements `quantityReserved`.
     - `commitOrderSale(variantId, quantity, orderId?, adminId?, executor?)`: Permanently deducts `quantityOnHand`, clears reservation, and logs `"sale"` movement.
     - `cancelOrderStock(variantId, quantity, orderId?, wasCommitted, adminId?, executor?)`: Restores stock or releases reservation with `"cancellation"` movement.
     - `returnOrderStock(variantId, quantity, orderId?, adminId?, executor?)`: Increments `quantityOnHand` with `"return"` movement.
   - Exported through `src/server/services/index.ts`.
4. **Server Actions (`src/actions/inventory.ts`):**
   - `getInventoryAction`, `getInventorySummaryAction`, `getVariantInventoryAction`, `getProductInventoryAction`, `adjustStockAction`, `restockAction`, `getInventoryMovementsAction`.
   - Wrapped with `createSafeAction`, revalidating `/inventory` and `/products`.
5. **Next.js 16 Route Handlers (`src/app/api/inventory/**`):**
   - `GET /api/inventory`: Returns paginated inventory items or summary metrics.
   - `POST /api/inventory/adjust`: Admin manual stock adjustment endpoint.
   - `GET /api/inventory/movements`: Historical audit trail query endpoint.
6. **Automated Test Suite (`src/scripts/test-inventory-backend.ts`):**
   - 47 test assertions covering queries, computed status, summary KPIs, search/filter/pagination, manual stock adjustment modes, restocking, audit movements, order lifecycle primitives (reserve, commit, cancel, return), negative stock guards, reservation underflow protection, concurrent row locking under parallel `Promise.all` transactions, and role authorization.

### Files Created
- `src/server/validation/inventory.ts`
- `src/server/repositories/inventory.repository.ts`
- `src/server/services/inventory.service.ts`
- `src/actions/inventory.ts`
- `src/app/api/inventory/route.ts`
- `src/app/api/inventory/adjust/route.ts`
- `src/app/api/inventory/movements/route.ts`
- `src/scripts/test-inventory-backend.ts`

### Files Modified
- `src/server/validation/index.ts` (exported inventory schemas)
- `src/server/repositories/index.ts` (exported inventory repository)
- `src/server/services/index.ts` (exported inventory service)
- `package.json` (added `"inventory:test"` script)
- `docs/ai-context/PENDING_TASKS.md` (updated roadmap and deliverables)
- `docs/ai-context/ARCHITECTURE.md` (documented inventory data access and services)
- `docs/ai-context/DECISIONS.md` (added ADR 018 for pessimistic locking and order ledger lifecycle)

### Verification & Tests
1. **Inventory Backend Suite (`npm run inventory:test`):** 47/47 assertions passed (including parallel concurrent locking).
2. **Catalog Backend Suite (`npm run catalog:test`):** 43/43 assertions passed.
3. **Backend Architecture Suite (`npm run backend:test`):** 46/46 assertions passed.
4. **Better Auth Tests (`npm run auth:test`):** 22/22 assertions passed.
5. **Database Schema Parity (`npm run db:parity`):** 8/8 checks passed.
6. **TypeScript Strict Typecheck (`npx tsc --noEmit`):** 0 errors.
7. **Next.js Production Build (`npm run build`):** 18/18 routes compiled successfully in Turbopack.

---

## 2026-11-07 — Phase 6C: Implement Orders, Customers and Payments Backend (Server Actions First)

### Objective
Implement the complete backend engine for Order Management, Customer Management, and Payment Verification in ScrubX Admin using Next.js 16 App Router, TypeScript, Drizzle ORM, Supabase PostgreSQL, Better Auth, and Zod. Adhere to a "Server Actions First" architecture eliminating redundant REST Route Handlers, enforcing global lock ordering (`orders` $\to$ `payments` $\to$ `inventory`), ensuring idempotent inventory sales, handling distinct cancellation and refund semantics, and maintaining strict audit trails.

### Architecture & Implementation Summary
1. **Schema & JSONB Updates (`src/db/schema/`):**
   - Added `PaymentRejectionRecord` type and updated `PaymentMetadata` in `src/db/schema/json-types.ts` (`imagekitFileId`, `proofUploadedAt`, `rejectionHistory: PaymentRejectionRecord[]`).
   - Updated `paymentMetadataSchema` in `src/db/schema/json-schemas.ts` for strict compile-time and runtime validation parity.
2. **Inventory Service Idempotency Safeguard (`src/server/services/inventory.service.ts`):**
   - Updated `commitOrderSale` to check `inventory_movements` for existing `(orderId, variantId, reason: 'sale')` within the exclusive row lock before decrementing stock, eliminating accidental double-deductions.
3. **Validation Layer (`src/server/validation/`):**
   - `customers.ts`: `customerFilterSchema`, `updateCustomerSchema`, `customerAddressSchema`, `deleteCustomerAddressSchema`. Note: `createCustomerSchema` excluded as customers are created on checkout or via internal upsert, matching the admin UI.
   - `orders.ts`: `orderStatusEnumSchema` (9 statuses), `orderItemInputSchema` (with personalization snapshot), `createOrderSchema`, `orderFilterSchema`, `updateOrderStatusSchema`, `updateOrderShippingSchema`, `addOrderNoteSchema`.
   - `payments.ts`: `paymentFilterSchema`, `submitPaymentProofSchema`, `verifyPaymentSchema`, `refundPaymentSchema`.
   - Exported through `src/server/validation/index.ts`.
4. **Repository Layer (`src/server/repositories/`):**
   - `customer.repository.ts`: `findPaginated` with total count, `findById` (with addresses array), `findByEmail`, `upsertCustomer` (safe normalized email lookup and insert/update avoiding non-unique ON CONFLICT issues), `update`, `addAddress`, `updateAddress`, `deleteAddress`.
   - `order.repository.ts`: `findPaginated`, `findById` (deep fetch with customer, items, engravings, coupon, internal notes, status timeline), `findForUpdate` (row lock `SELECT ... FOR UPDATE`), `createOrderBundle` (atomic transaction for order, items, engravings, timeline, customer total spend update), `updateOrderStatus`, `updateShippingInfo`, `addNote`, `getOrderMetrics`.
   - `payment.repository.ts`: `findPaginated`, `findById`, `findForUpdate` (row lock), `findByOrderId`, `create`, `update`, `getPendingCount`.
   - Exported through `src/server/repositories/index.ts`.
5. **Business Services Layer (`src/server/services/`):**
   - `customer.service.ts`: `getCustomers`, `getCustomerById`, `updateCustomer`, `findOrCreateCustomer`, `saveAddress`, `deleteAddress`.
   - `order.service.ts`: `getOrders`, `getOrderById`, `getOrderMetrics`, `createOrder` (mandatory `admin: AdminContext`, COD + Custom Engraving guard, price snapshots, stock reservation), `updateOrderStatus` (validates allowed status transition matrix, acquires row lock, executes distinct 4-way cancellation semantics), `updateOrderShipping`, `addOrderNote`.
   - `payment.service.ts`: `getPayments`, `getPaymentById`, `getPendingCount`, `submitPaymentProof`, `approvePayment` (enforces lock order `orders` $\to$ `payments`, idempotently commits stock sale, sets order to `confirmed`), `rejectPayment` (enforces lock order, records rejection reason and metadata audit history, reverts order to `awaiting_payment`), `refundPayment` (enforces lock order, updates payment and order to `refunded` only upon actual refund).
   - Exported through `src/server/services/index.ts`.
6. **Server Actions Layer (`src/actions/`):**
   - `customers.ts`: `updateCustomerAction`, `saveCustomerAddressAction`, `deleteCustomerAddressAction`.
   - `orders.ts`: `createOrderAction`, `updateOrderStatusAction`, `updateOrderShippingAction`, `addOrderNoteAction`.
   - `payments.ts`: `submitPaymentProofAction`, `approvePaymentAction`, `rejectPaymentAction`, `refundPaymentAction`.
   - Thin wrappers using `createSafeAction`, performing authorization, validation, and targeted cache revalidation (`/orders`, `/payments`, `/customers`, `/inventory`). Zero redundant Route Handlers introduced.
7. **Automated Test Suite (`src/scripts/test-orders-customers-payments.ts`):**
   - 60 comprehensive assertions covering:
     - Category 1: Customer Management & Atomic Deduplication (case-insensitive email normalization, addresses, notes).
     - Category 2: Order Placement, Snapshots & Stock Reservation (catalog price changes do not mutate historical snapshots, stock reservation updates dual-counter ledger).
     - Category 3: Engraving & COD Business Rule Enforcement (prohibits COD on custom engraved scrubs).
     - Category 4: Payment Proof Submission & Rejection Workflow (proof submission advances status, rejection logs audit history in metadata and safely reverts order).
     - Category 5: Payment Approval & Idempotent Stock Commitment (stock permanently committed, duplicate approvals do not double-deduct).
     - Category 6: Order Fulfillment Flow & State Transition Matrix (tracks courier, dates, rejects invalid transitions).
     - Category 7: Distinct Cancellation Scenarios & Refund Processing (unpaid cancellation releases reservation; paid unshipped cancellation restores warehouse on-hand stock without refunding payment; shipped cancellation does not alter warehouse stock; refunding records refund).
     - Category 8: Role Authorization Enforcement (staff blocked from approval, refunds, or confirmation; staff allowed to add notes).

### Files Created
- `src/server/validation/customers.ts`
- `src/server/validation/orders.ts`
- `src/server/validation/payments.ts`
- `src/server/repositories/customer.repository.ts`
- `src/server/repositories/order.repository.ts`
- `src/server/repositories/payment.repository.ts`
- `src/server/services/customer.service.ts`
- `src/server/services/order.service.ts`
- `src/server/services/payment.service.ts`
- `src/actions/customers.ts`
- `src/actions/orders.ts`
- `src/actions/payments.ts`
- `src/scripts/test-orders-customers-payments.ts`

### Files Modified
- `src/db/schema/json-types.ts` (added `PaymentRejectionRecord`, updated `PaymentMetadata`)
- `src/db/schema/json-schemas.ts` (updated `paymentMetadataSchema`)
- `src/server/services/inventory.service.ts` (added idempotent movement check to `commitOrderSale`)
- `src/server/validation/index.ts` (exported customer, order, payment schemas)
- `src/server/repositories/index.ts` (exported customer, order, payment repositories)
- `src/server/services/index.ts` (exported customer, order, payment services)
- `package.json` (added `"orders:test"` script)
- `docs/ai-context/PENDING_TASKS.md`
- `docs/ai-context/IMPLEMENTATION_LOG.md`
- `docs/ai-context/ARCHITECTURE.md`
- `docs/ai-context/DECISIONS.md`

### Verification & Tests
1. **Orders, Customers & Payments Test Suite (`npm run orders:test`):** 60/60 assertions passed.
2. **Inventory Backend Suite (`npm run inventory:test`):** 47/47 assertions passed.
3. **Catalog Backend Suite (`npm run catalog:test`):** 43/43 assertions passed.
4. **Backend Architecture Suite (`npm run backend:test`):** 46/46 assertions passed.
5. **Better Auth Tests (`npm run auth:test`):** 22/22 assertions passed.
6. **Database Schema Parity (`npm run db:parity`):** 8/8 checks passed.
7. **TypeScript Strict Typecheck (`npx tsc --noEmit`):** 0 errors.
8. **Next.js Production Build (`npm run build`):** 18/18 routes compiled successfully in Turbopack.

---

## Phase 6D: Remaining ScrubX Admin Backends (Coupons, Shipping, Engraving, Payments, Store Settings)

### Objective
Implement the complete backend data access, business services, validation, and Server Actions for the remaining administrative modules using the existing PostgreSQL schema:
1. **Coupon Management** (`coupons`, `order_coupons`)
2. **Shipping Management** (`shipping_methods`)
3. **Engraving Management** (`engraving_options`)
4. **Payment Method Settings** (`payment_methods`)
5. **Store Settings** (`store_settings`)

Strictly adhere to:
- **Server Actions First (ADR 019):** No redundant internal REST Route Handlers or read Server Actions. Direct database/service access in RSC.
- **Global Lock Hierarchy (ADR 020 & ADR 021):** $\text{orders} \to \text{payments} \to \text{inventory} \to \text{coupons}$.
- **Authoritative Coupon Redemption (ADR 021):** Row-level locking via `SELECT ... FOR UPDATE`, single source of truth in `CouponService` / `CouponRepository`.
- **Safe Deactivation for Referential Integrity (ADR 021):** Entities with historical order usages (`order_coupons`, `orders.shippingMethodId`, `order_item_engraving`) safely deactivate instead of violating foreign keys (`ON DELETE RESTRICT`).
- **COD Engraving Invariant (ADR 022):** Strictly enforce `allowedWithEngraving = false` for Cash on Delivery.
- **Atomic Operations (ADR 022):** Transactional reordering of shipping and payment methods; transaction-scoped batch store settings updates.

### What Was Implemented
1. **Schema & JSON Refinements:**
   - `src/db/schema/json-types.ts`: Added `currency: string;` to `StoreSettingsMap`.
   - `src/db/schema/json-schemas.ts`: Added `currency: z.string().min(1)` to `storeSettingsValueSchemas` and `storeSettingKeySchema`.
2. **Validation Schemas (`src/server/validation/`):**
   - `coupons.ts`: `discountTypeEnumSchema` (supports `"percentage" | "fixed_amount"`, transforming `"fixed"` to `"fixed_amount"`), `couponFilterSchema`, `createCouponSchema`, `updateCouponSchema`, `toggleCouponStatusSchema`, `deleteCouponSchema`, `couponUsageFilterSchema`.
   - `shipping.ts`: `createShippingMethodSchema`, `updateShippingMethodSchema`, `toggleShippingMethodStatusSchema`, `deleteShippingMethodSchema`, `reorderShippingMethodsSchema`, `shippingMethodFilterSchema`.
   - `engraving.ts`: `engravingTypeEnumSchema`, `createEngravingOptionSchema`, `updateEngravingOptionSchema`, `toggleEngravingOptionStatusSchema`, `deleteEngravingOptionSchema`, `engravingOptionFilterSchema`.
   - `payment-methods.ts`: `updatePaymentMethodSchema`, `togglePaymentMethodStatusSchema`, `reorderPaymentMethodsSchema`.
   - `settings.ts`: `batchUpdateStoreSettingsSchema`.
   - Re-exported all new schemas in `src/server/validation/index.ts`.
3. **Repository Layer (`src/server/repositories/`):**
   - `coupon.repository.ts`: `findPaginated`, `findById`, `findByCode`, `findForUpdateByCode` (`SELECT ... FOR UPDATE`), `create`, `update`, `delete`, `checkHasOrderUsages`, `findUsageHistory`, `getCustomerUsageCount`, `getCustomerOrderCount`, `recordRedemption` (inserts `order_coupons` and atomically increments `coupons.usageCount`).
   - `shipping.repository.ts`: `findAll`, `findById`, `create`, `update`, `delete`, `checkHasOrderReferences`, `updateSortOrders`.
   - `engraving.repository.ts`: `findAll`, `findById`, `create`, `update`, `delete`, `checkHasOrderUsages`.
   - `payment-method.repository.ts`: `findAll`, `findById`, `findByCode`, `update`, `updateSortOrders`.
   - `settings.repository.ts`: Added `upsertSettingsBatch` with executor injection.
   - Re-exported all repositories in `src/server/repositories/index.ts`.
4. **Business Services Layer (`src/server/services/`):**
   - `coupon.service.ts`: `getCoupons`, `getCouponById`, `createCoupon`, `updateCoupon` (merged entity validation), `toggleCouponStatus`, `deleteCoupon` (safe deactivation when used), `getCouponUsageHistory`, `validateAndLockForOrder` (enforces dates, minimum order, global limit, customer limit, `firstOrderOnly`, discount calculation).
   - `shipping.service.ts`: `getShippingMethods`, `getShippingMethodById`, `createShippingMethod`, `updateShippingMethod` (merged entity validation for `minDays <= maxDays`), `toggleShippingMethodStatus`, `deleteShippingMethod` (safe deactivation), `reorderShippingMethods` (atomic transaction, duplicate ID check), `calculateShippingCost`.
   - `engraving.service.ts`: `getEngravingOptions`, `getEngravingOptionById`, `createEngravingOption`, `updateEngravingOption` (merged entity validation for text `maxCharacters`), `toggleEngravingOptionStatus`, `deleteEngravingOption` (safe deactivation).
   - `payment-method.service.ts`: `getPaymentMethods`, `getPaymentMethodById`, `updatePaymentMethod` (strictly enforces COD `allowedWithEngraving = false`), `togglePaymentMethodStatus`, `reorderPaymentMethods`.
   - `settings.service.ts`: Added default `currency: "PKR"`, updated `getAllSettings(admin, executor)`, added `updateSettingsBatch` inside `db.transaction`.
   - Re-exported all services in `src/server/services/index.ts`.
5. **Phase 6C Order Integration:**
   - Injected `CouponRepository` into `OrderRepository` to handle `recordRedemption` in `createOrderBundle`.
   - Injected `CouponService` into `OrderService` to call `validateAndLockForOrder` following the extended lock hierarchy ($\text{inventory} \to \text{coupons}$).
6. **Server Actions Layer (`src/actions/`):**
   - `coupons.ts`: `createCouponAction`, `updateCouponAction`, `toggleCouponStatusAction`, `deleteCouponAction`.
   - `shipping.ts`: `createShippingMethodAction`, `updateShippingMethodAction`, `toggleShippingMethodStatusAction`, `deleteShippingMethodAction`, `reorderShippingMethodsAction`.
   - `engraving.ts`: `createEngravingOptionAction`, `updateEngravingOptionAction`, `toggleEngravingOptionStatusAction`, `deleteEngravingOptionAction`.
   - `payment-methods.ts`: `updatePaymentMethodAction`, `togglePaymentMethodStatusAction`, `reorderPaymentMethodsAction`.
   - `settings.ts`: `updateStoreSettingsBatchAction`.
7. **Automated Test Suite (`src/scripts/test-remaining-backends.ts`):**
   - 78 test assertions across 6 categories:
     - Category 1: Coupon Management & Authoritative Redemption (percentage/fixed discounts, bounds, scheduling, expiration, row-level locking, usage counter increments, customer usage limit, first-order restriction, rollback safety).
     - Category 2: Shipping Methods & Delivery Thresholds (CRUD, delivery windows, free threshold calculations, atomic reordering, safe deactivation).
     - Category 3: Engraving Options & Add-On Rules (name/logo validation, character limits, price updates, safe deactivation).
     - Category 4: Payment Method Settings & COD Engraving Rule (retrieval, details update, COD engraving prevention invariant, atomic reordering).
     - Category 5: Store Settings Management & Batch Updates (single update, batch upsert, atomic rollback on error, partial updates).
     - Category 6: Role Authorization Enforcement (staff read authorization, staff mutation rejection, super_admin execution).

### Files Created
- `src/server/validation/coupons.ts`
- `src/server/validation/shipping.ts`
- `src/server/validation/engraving.ts`
- `src/server/validation/payment-methods.ts`
- `src/server/repositories/coupon.repository.ts`
- `src/server/repositories/shipping.repository.ts`
- `src/server/repositories/engraving.repository.ts`
- `src/server/repositories/payment-method.repository.ts`
- `src/server/services/coupon.service.ts`
- `src/server/services/shipping.service.ts`
- `src/server/services/engraving.service.ts`
- `src/server/services/payment-method.service.ts`
- `src/actions/coupons.ts`
- `src/actions/shipping.ts`
- `src/actions/engraving.ts`
- `src/actions/payment-methods.ts`
- `src/scripts/test-remaining-backends.ts`

### Files Modified
- `src/db/schema/json-types.ts` (added `currency: string;` to `StoreSettingsMap`)
- `src/db/schema/json-schemas.ts` (added `currency` schema validation)
- `src/server/repositories/base.repository.ts` (re-exported `PaginatedResult`)
- `src/server/repositories/settings.repository.ts` (added `upsertSettingsBatch` with executor)
- `src/server/repositories/order.repository.ts` (integrated `CouponRepository.recordRedemption`)
- `src/server/services/settings.service.ts` (added default `currency: "PKR"` and `updateSettingsBatch`)
- `src/server/services/order.service.ts` (integrated `CouponService.validateAndLockForOrder`)
- `src/server/validation/settings.ts` (added `batchUpdateStoreSettingsSchema`)
- `src/server/validation/index.ts` (exported all new schemas)
- `src/server/repositories/index.ts` (exported all new repositories)
- `src/server/services/index.ts` (exported all new services)
- `src/actions/settings.ts` (added `updateStoreSettingsBatchAction`)
- `package.json` (added `"backends:test"` script)
- `docs/ai-context/PENDING_TASKS.md`
- `docs/ai-context/DECISIONS.md` (added ADR 021, ADR 022)
- `docs/ai-context/ARCHITECTURE.md`
- `docs/ai-context/IMPLEMENTATION_LOG.md`

### Verification & Tests
1. **Remaining Backends Suite (`npm run backends:test`):** 78/78 assertions passed.
2. **TypeScript Strict Typecheck (`npx tsc --noEmit`):** 0 errors.




---

## 2026-11-07 — Phase 7: Frontend-to-Backend Full Integration & Zero-Mock Decommissioning

### Core Objectives Achieved
- **100% UI Design & Interaction Preservation:** Preserved every layout, sidebar, topbar, table, card, dialog, form, button, badge, typography rule, and user interaction. No UI redesign or visual simplification was introduced.
- **Strict ADR 019 Compliance:** Server Components directly invoke backend domain services for reads. Client Components exclusively invoke type-safe Server Actions for mutations (`createSafeAction`). Zero read Server Actions.
- **Full Serialization & DTO Layer (`src/lib/dto.ts`):** Created pure transformer functions converting PostgreSQL date/timestamp fields, `numeric(10,2)` decimal strings, and foreign relation bundles into serialized client DTOs across Categories, Products, Customers, Orders, Payments, Coupons, Shipping, Engraving, and Payment Methods.
- **Zero-Mock Decommissioning:** Replaced all 13 view modules' mock data dependencies (`useStore()`) with real database data and Server Actions. Completely unmounted `StoreProvider` from `Providers` and extracted shared display dictionaries into `src/lib/constants.ts`.
- **Global Layout & Navigation Real-Time Counts:** Replaced hardcoded order, payment, and inventory counters in `sidebar.tsx` and `app-shell.tsx` with live database aggregates fetched in Server Component `layout.tsx`.

### What Was Implemented
1. **DTO Transformer Layer (`src/lib/dto.ts`):**
   - Implemented `serializeDate`, `serializeNumber`, `toCategoryDTO`, `toProductDTO`, `toCustomerDTO`, `toOrderDTO`, `toPaymentDTO`, `toCouponDTO`, `toShippingMethodDTO`, `toEngravingOptionDTO`, and `toPaymentMethodDTO`.
2. **Module-by-Module Integration:**
   - **Dashboard (`/`):** Server Component `src/app/page.tsx` directly calls `orderService.getOrders`, `orderService.getOrderMetrics`, `inventoryService.getInventorySummary`, `inventoryService.getInventory`, and SQL aggregate product counts.
   - **Categories (`/categories`):** Connected to `categoryService.getAllCategories` and `createCategoryAction`, `updateCategoryAction`, `toggleCategoryStatusAction`, `deleteCategoryAction`.
   - **Products Catalog & Details (`/products`, `/products/[id]`):** Server Component reads via `productService.getProducts` and `productService.getProductById`. Mutations connected to `createProductAction`, `updateProductAction`, `archiveProductAction`, and `deleteProductAction`.
   - **Product Form (`/products/new`, `/products/[id]/edit`):** Reads categories via `categoryService.getAllCategories`, handles multi-variant matrix creation/updates and ImageKit media linkage.
   - **Inventory (`/inventory`):** Connected to `inventoryService.getInventory`, `inventoryService.getInventorySummary`, `inventoryService.getMovements`, and `adjustStockAction`.
   - **Orders & Order Detail (`/orders`, `/orders/[id]`):** Connected to `orderService.getOrders`, `orderService.getOrderById`, `updateOrderStatusAction`, `updateOrderShippingAction`, and `addOrderNoteAction`.
   - **Customers & Customer Detail (`/customers`, `/customers/[id]`):** Connected to `customerService.getCustomers`, `customerService.getCustomerById`, `orderService.getOrders({ customerId })`, and `updateCustomerAction`.
   - **Payments (`/payments`):** Connected to `paymentService.getPayments`, `approvePaymentAction`, and `rejectPaymentAction`.
   - **Coupons (`/coupons`):** Connected to `couponService.getCoupons`, `createCouponAction`, `updateCouponAction`, `toggleCouponStatusAction`, and `deleteCouponAction`.
   - **Shipping Methods (`/shipping`):** Connected to `shippingService.getShippingMethods`, `createShippingMethodAction`, `updateShippingMethodAction`, `toggleShippingMethodStatusAction`, and `deleteShippingMethodAction`.
   - **Engraving Options (`/engraving`):** Connected to `engravingService.getEngravingOptions`, `createEngravingOptionAction`, `updateEngravingOptionAction`, `toggleEngravingOptionStatusAction`, and `deleteEngravingOptionAction`.
   - **Payment Methods (`/payment-methods`):** Connected to `paymentMethodService.getPaymentMethods`, `updatePaymentMethodAction`, and `togglePaymentMethodStatusAction`, strictly respecting the COD engraving prohibition.
   - **Store Settings (`/settings`):** Connected to `settingsService.getAllSettings` and `updateStoreSettingsBatchAction`.
3. **Global Layout & Navigation:**
   - `src/app/layout.tsx`: Async Server Component fetching live layout stats (pending orders, pending payment proofs, low stock alert SKU count, today's revenue, recent notifications) directly from PostgreSQL.
   - `src/components/layout/app-shell.tsx`: Renders real daily revenue and order counts without mock state.
   - `src/components/layout/sidebar.tsx`: Renders real pending payment and low stock badge counts.
   - `src/components/layout/topbar.tsx`: Replaced in-memory mock search with URL navigation to `/products?q=...`, `/orders?q=...`, and `/customers?q=...`.
4. **Zero-Mock Decommissioning:**
   - Removed `<StoreProvider>` from `src/components/providers.tsx`.
   - Extracted `ORDER_STATUS_LABEL`, `PAYMENT_METHOD_LABEL`, `ORDER_STATUS_ORDER`, and `COLOR_LIBRARY` into `src/lib/constants.ts`.
   - Verified 0 remaining usages of `useStore` across all application views and components.
5. **Quality & Build Verification:**
   - `npx tsc --noEmit`: 0 errors.
   - `npm run db:parity`: All 25 tables, column types, enums, triggers, and RLS policies passed.
   - `npm run db:integrity`: 5/5 business rule constraint tests passed.
   - `npm run catalog:test`: 43/43 tests passed.
   - `npm run inventory:test`: 47/47 tests passed.
   - `npm run orders:test`: 60/60 tests passed.
   - `npm run backends:test`: 78/78 tests passed.
   - `npm run build`: Production Next.js 16 App Router build compiled successfully with dynamic SSR routes.


---

## 2026-11-07 — Next.js 16 Proxy Migration & ESLint Image Optimization Cleanup

### Core Objectives Achieved
1. **Next.js 16 Proxy Convention Migration:**
   - Migrated deprecated `src/middleware.ts` to `src/proxy.ts` exporting `export async function proxy(request: NextRequest)`.
   - Eliminated the `The "middleware" file convention is deprecated. Please use "proxy" instead.` build warning.
2. **ESLint `<Image>` Modernization (13 Warnings + 1 Error Resolved):**
   - Converted all 13 unoptimized `<img>` tags to Next.js `<Image />` with responsive layout sizing, `fill`, and `unoptimized` handling for dynamic client blob/proof uploads:
     - `src/components/shared/thumb.tsx` (ProductThumb)
     - `src/components/shared/image-upload.tsx` (In-flight upload progress & single mode preview)
     - `src/views/Categories.tsx` (Category row thumb & modal preset selector)
     - `src/views/Payments.tsx` (Proof inspection dialog & list view thumb)
     - `src/views/ProductForm.tsx` (Image matrix tile, library picker, and live card preview)
     - `src/views/ProductView.tsx` (Main gallery hero, thumbnail strip, and color variant swatches)
   - Fixed `react-hooks/error-boundaries` error in `src/app/page.tsx` by moving JSX construction out of `try...catch`.
3. **Verification:**
   - `npm run lint`: **0 errors, 0 warnings**.
   - `npx tsc --noEmit`: **0 errors**.
   - `npm run build`: Production Next.js 16 build succeeded with 0 warnings.

---

## 2026-11-09 — Phase 0 Baseline & Remediation Batch 1 (SEC-001, SEC-002, SEC-003, SEC-011, ARCH-010)

### Objective
Execute Phase 0 baseline verification and remediate critical security entry points, secret fallbacks, proxy bypasses, and documentation synchronization.

### What Was Implemented
1. **SEC-001 (Delete `/api/auth/verify`):**
   - Removed diagnostic route handler `src/app/api/auth/verify/route.ts` that performed live super_admin sign-ins with default passwords.
   - Verified zero remaining references across `src/`.
2. **SEC-002 (Hardcoded Credential Fallbacks):**
   - In `src/scripts/create-admin.ts`: Removed default password literal `Admin@ScrubX2026!`. Enforced mandatory `ADMIN_PASSWORD` (min 12 chars) with fail-fast process exit. Validated `ADMIN_ROLE` against allowed admin roles (`super_admin`, `admin`, `staff`).
   - In `src/scripts/test-auth.ts`: Gracefully skips test suite (exit 0) when `ADMIN_PASSWORD` is unset instead of falling back to default credentials.
   - Documented `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_ROLE` in `.env.example`.
   - Recorded mandatory admin password rotation requirement in `docs/ai-context/AUTH_CONTEXT.md`.
3. **SEC-003 (Better Auth Secret Fallback):**
   - In `src/lib/auth.ts`: Removed hardcoded 64-hex secret fallback (`17f75554...`).
   - Added `requireAuthSecret` throwing descriptive error if absent or < 32 characters.
   - Fixed `getTrustedOrigins()` and `getBaseUrl()` to enforce explicit environment variables in production.
   - Documented `BETTER_AUTH_TRUSTED_ORIGINS` in `.env.example` and noted session invalidation consequence in `AUTH_CONTEXT.md`.
4. **SEC-011 (Proxy Matcher & API Auth):**
   - In `src/proxy.ts`: Replaced negative-lookahead regex with an explicit route inclusion list.
   - Enforced 401 JSON response for unauthenticated `/api/*` routes instead of redirecting to login page.
   - Added `!request.nextUrl.searchParams.has("error")` check to prevent infinite redirect loops on invalid sessions (BUG-032).
   - Created in-memory window rate limiter `src/server/rate-limit.ts` for authentication and signature endpoints.
5. **ARCH-010 (Documentation Synchronization):**
   - Symlinked `docs/AI context` -> `docs/ai-context` to resolve path case mismatch on Linux filesystems.
   - Synchronized `ARCHITECTURE.md`, `PROJECT_OVERVIEW.md`, `PENDING_TASKS.md`, `README.md`, and `SKILL.md` to reflect RSC architecture and eliminate stale mock-store references.

### Files Created
- `src/server/rate-limit.ts`
- `docs/AI context` (symlink to `docs/ai-context`)

### Files Modified
- `src/lib/auth.ts`
- `src/proxy.ts`
- `src/scripts/create-admin.ts`
- `src/scripts/test-auth.ts`
- `.env.example`
- `README.md`
- `docs/ai-context/AUTH_CONTEXT.md`
- `docs/ai-context/ARCHITECTURE.md`
- `docs/ai-context/PROJECT_OVERVIEW.md`
- `docs/ai-context/PENDING_TASKS.md`
- `.agent/skills/project-context-management/SKILL.md`

### Files Deleted
- `src/app/api/auth/verify/route.ts`

### Verification & Tests
1. `npx tsc --noEmit`: Clean (0 errors).
2. `npm run lint`: Clean (0 errors, 0 warnings).
3. `npm run db:verify`: Successfully connected to Supabase PostgreSQL 17.
4. `npm run auth:test`: Skipped cleanly when credentials unconfigured.
5. `grep -rn "17f75554" src/`: 0 matches.
6. `grep -rn "Admin@ScrubX2026" src/`: 0 matches.

---

## 2026-11-09: Batch 11 — UX, Search, Notes & Authorization Honesty (BUG-023, BUG-024, BUG-025, BUG-026, DB-011)

### Objectives
Resolve and verify all 5 Batch 11 issues in §12.4:
1. `BUG-023`: Topbar search `?q=` ignored across list pages.
2. `BUG-024`: Orders list missing payment-method filters (`sadapay`, `nayapay`) and false "this month" badge count.
3. `BUG-025` & `DB-011`: Dedicated `customer_notes` database table with foreign key cascade, auditability, delimiter preservation, and server action + DTO mapping.
4. `BUG-026`: UI authorization gating with isomorphic capability matrix (`src/lib/permissions.ts`), `RoleProvider`, and leaf component capability checks across staff, admin, and super_admin.

### Key Changes
1. **BUG-023 (Search Query Contract):**
   - In `src/components/layout/topbar.tsx`: `handleSearchSubmit` detects pathname to navigate to `/orders?q=...` when on orders, `/customers?q=...` when on customers, and `/products?q=...` elsewhere.
   - Updated `src/app/products/page.tsx`, `src/app/orders/page.tsx`, and `src/app/customers/page.tsx` to pass `initialQuery={sp?.q ?? ""}` down to their respective views.
   - In `Products.tsx`, `Orders.tsx`, `Customers.tsx`: Initialized query state from `initialQuery` and bound `onSubmit` on `SearchInput` to `router.replace` with `?q=...` on Enter.
2. **BUG-024 (Payment Filters & Month Delivery Badge):**
   - In `src/views/Orders.tsx`: Added `sadapay` and `nayapay` to payment method filter select.
   - In `src/server/repositories/order.repository.ts` & `order.service.ts`: Added `getDeliveredThisMonthCount` querying orders with status `delivered` within current month in `Asia/Karachi` timezone.
   - In `src/app/orders/page.tsx`: Loaded `deliveredThisMonthCount` in parallel via `Promise.all` and passed to view.
   - In `src/views/Orders.tsx`: Replaced misleading badge with truthful `{deliveredThisMonthCount} delivered this month`.
   - In `src/lib/dto.ts`: In `toOrderDTO`, normalized `bank_transfer` to `bank` and recognized `paymentMethodCode`.
3. **BUG-025 & DB-011 (Dedicated Customer Notes):**
   - Migration `supabase/migrations/20261109000005_customer_notes.sql`: Created `customer_notes` table (`id uuid pk`, `customer_id uuid fk cascade`, `body text`, `created_by text fk ba_user`, `created_at timestamptz`), index on `(customer_id, created_at desc)`, enabled RLS, and safe one-time backfill from legacy blobs.
   - In `src/db/schema/customers.ts`, `relations.ts`, `types.ts`: Defined `customerNotes` table and relations.
   - In `src/server/repositories/customer.repository.ts`: Added `addNote`, `listNotes`, `deleteNote`, and joined `baUser` in `findById` to return structured note history with author name.
   - In `src/server/services/customer.service.ts`: Added `addNote` (`assertRole(["admin"])`), `listNotes` (`assertRole(["staff"])`), `deleteNote` (`assertRole(["super_admin"])`).
   - In `src/server/validation/customers.ts`: Added `addCustomerNoteSchema` and `deleteCustomerNoteSchema`.
   - In `src/actions/customers.ts`: Created `addCustomerNoteAction` and `deleteCustomerNoteAction`.
   - In `src/views/CustomerDetail.tsx`: Updated `handleAddNote` to call `addCustomerNoteAction` without delimiter string-concatenation; displayed author names.
4. **BUG-026 (UI Authorization Gating):**
   - Created pure isomorphic `src/lib/permissions.ts` defining `CAPABILITIES` mirroring §6.1.1 matrix and `can(role, capability)`.
   - Created `src/components/providers/role-provider.tsx` with `RoleProvider`, `useRole`, and `useCan`.
   - In `src/components/layout/app-shell.tsx`: Wrapped shell in `<RoleProvider role={userRole}>`.
   - In `src/components/layout/sidebar.tsx`: Used `can(userRole, "settings:write")` for Settings nav item.
   - In `Products.tsx`: Gated "Add product", row duplicate/archive/delete actions, and bulk actions behind `can("product:write")`.
   - In `OrderDetail.tsx`: Gated status transitions behind `can("order:status")`, courier save behind `can("order:ship")`, and payment approvals/refunds/rejections behind `can("payment:verify")`.
   - In `Payments.tsx`: Gated Approve and Reject buttons behind `can("payment:verify")`.
   - In `ProductForm.tsx`: Gated Save/Publish buttons behind `can("product:write")`.
   - In `Settings.tsx`: Gated Save buttons behind `can("settings:write")`.
   - In `CustomerDetail.tsx`: Gated note-adding form behind `can("customer:write")`.

### Files Created
- `supabase/migrations/20261109000005_customer_notes.sql`
- `src/lib/permissions.ts`
- `src/components/providers/role-provider.tsx`
- `src/scripts/test-batch11-ux-and-auth.ts`

### Files Modified
- `src/db/schema/customers.ts`
- `src/db/schema/relations.ts`
- `src/db/schema/types.ts`
- `src/server/repositories/customer.repository.ts`
- `src/server/services/customer.service.ts`
- `src/server/validation/customers.ts`
- `src/actions/customers.ts`
- `src/lib/types.ts`
- `src/lib/dto.ts`
- `src/components/shared/search-input.tsx`
- `src/components/layout/topbar.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/sidebar.tsx`
- `src/app/products/page.tsx`
- `src/app/orders/page.tsx`
- `src/app/customers/page.tsx`
- `src/server/repositories/order.repository.ts`
- `src/server/services/order.service.ts`
- `src/views/Products.tsx`
- `src/views/Orders.tsx`
- `src/views/Customers.tsx`
- `src/views/CustomerDetail.tsx`
- `src/views/OrderDetail.tsx`
- `src/views/Payments.tsx`
- `src/views/ProductForm.tsx`
- `src/views/Settings.tsx`
- `package.json`
- `docs/ai-context/PRODUCTION_REMEDIATION_PLAN.md`

### Verification & Tests
1. `npm run db:parity`: 100% PASS (26 tables verified).
2. `npm run ux:test`: 12 Passed, 0 Failed.
3. `npm run orders:test`: 59 Passed, 0 Failed.
4. `npx tsc --noEmit`: Clean (0 errors).
5. `npm run lint`: Clean (0 errors, 0 warnings).
6. `npm run build`: Production build succeeded with all routes dynamic.


---

## 2026-11-09: Batch 12 — Hardening, Security, Dependency Reconciliation & Codebase Cleanup (SEC-010, SEC-012, ARCH-002, ARCH-003, ARCH-004, ARCH-006, ARCH-007, ARCH-008, PERF-010, PERF-011, PERF-012)

### Objectives
Resolve and verify all 11 Batch 12 issues in §12.4:
1. `SEC-010`: Missing HTTP security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy).
2. `SEC-012`: Raw error messages leaked to the browser; domain error sanitization and masking of Postgres codes (23505, 23503, 23514).
3. `ARCH-002`: Eliminate redundant internal Route Handlers; maintain strict Server Actions First architecture for all mutations (ADR 019).
4. `ARCH-003`: Single source of truth for session retrieval and administrative context (`src/server/auth.ts`).
5. `ARCH-004`: Complete deletion of legacy mock files (`src/data/mock.ts`, `src/data/store.tsx`) and removed UI scaffolding.
6. `ARCH-006`: Structured error and event logging via `src/lib/logger.ts` with sanitized metadata and zero raw object leaks.
7. `ARCH-007`: Pruning of unreferenced dependencies from `package.json`.
8. `ARCH-008`: Resolution of npm peer dependency conflict; upgrade `drizzle-orm` to `^0.45.4` and `drizzle-kit` to `^0.31.11` to eliminate `--legacy-peer-deps`.
9. `PERF-010`, `PERF-011`, `PERF-012`: Code splitting, dynamic imports for modals, ImageKit responsive URL presets, and production bundle size reduction.

### Key Changes
1. **SEC-010 (HTTP Security Headers):** Configured strict security headers in `next.config.ts` including Content Security Policy (`default-src 'self'`), Strict-Transport-Security (`max-age=63072000; includeSubDomains; preload`), X-Content-Type-Options (`nosniff`), X-Frame-Options (`DENY`), and Referrer-Policy (`strict-origin-when-cross-origin`).
2. **SEC-012 (Error Masking):** Implemented `toActionError()` in `src/server/errors.ts` translating Postgres constraint errors into safe, user-facing error messages while concealing raw query strings, column names, and stack traces.
3. **ARCH-002 & ARCH-003 (Server Actions First & Single Auth Module):** Removed unused API endpoints; restricted Route Handlers strictly to external integration webhooks/jobs (`/api/auth`, `/api/upload/auth`, `/api/admin/jobs/expire-orders`). Standardized all session resolution onto `src/server/auth.ts`.
4. **ARCH-004 & ARCH-007 (Mock Data Decommissioning & Pruning):** Removed obsolete mock stores and cleaned up `package.json` dependencies.
5. **ARCH-008 (Peer Dependency Resolution):** Upgraded `drizzle-orm` and `drizzle-kit`, enabling standard clean `npm ci` executions without legacy flags.
6. **PERF-010, PERF-011, PERF-012 (Performance Optimization):** Configured Turbopack optimizations, image lazy loading, and dynamic chunking.

---

## 2026-11-09: Batch 13 — E-Commerce Lifecycle Completion (ECOM-001 through ECOM-012)

### Objectives
Implement and verify all 12 e-commerce lifecycle workflows in §12.4:
1. `ECOM-001`: Unpaid Order Expiration cron job with `CRON_SECRET` and `SKIP LOCKED`.
2. `ECOM-002` & `ECOM-003`: Returns and Product Exchanges / RMA workflows.
3. `ECOM-004` & `ECOM-010`: Customer notes pinned/soft-delete lifecycle and unified 4-source activity feed.
4. `ECOM-005`: Staff team management UI and actions with session invalidation.
5. `ECOM-006`: Duplicate transaction reference detection and super admin override.
6. `ECOM-007`: Printable Invoice and Packing Slip with print media styling.
7. `ECOM-008`: Orphan media asset tracking and cleanup pipeline.
8. `ECOM-009`: Bulk order operations with multi-select table rows and floating action bar.
9. `ECOM-011`: Stateful read-tracked operational notifications.
10. `ECOM-012`: Storefront settings registry and strict contract validation.

### Key Changes
1. **ECOM-001 (Unpaid Order Expiration):** Created `src/app/api/admin/jobs/expire-orders/route.ts` with `CRON_SECRET` authentication, querying expired unpaid orders via PostgreSQL `SKIP LOCKED`, releasing reserved stock, updating status to `cancelled`, and displaying expiration countdown banners in `OrderDetail.tsx`.
2. **ECOM-006 (Duplicate TID Detection & Override):** Added soft duplicate check on proof submission, blocked approval on duplicate transaction references without explicit `allowDuplicateTid` override, restricted override to `super_admin` with audit logging, and displayed warning badges in `Payments.tsx`.
3. **ECOM-002 & ECOM-003 (Returns & Product Exchanges / RMA):** Migration `20261109000009_ecommerce_lifecycle.sql` created `order_returns` and `order_return_items`. Implemented `requestReturn`, `approveReturn`, `receiveReturn`, `completeReturn`, and `createExchange` in `OrderRepository` and `OrderService`. Exposed safe actions in `src/actions/orders.ts` and interactive RMA modal in `OrderDetail.tsx`.
4. **ECOM-007 (Printable Invoice & Packing Slip):** Built `src/app/orders/[id]/print/page.tsx` and `print-controls.tsx` with dedicated `@media print` CSS, clean receipt typography, toggleable packing slip mode, and AppShell print bypass.
5. **ECOM-004 & ECOM-010 (Customer Notes & Unified Activity Timeline):** Added `is_pinned`, `deleted_at`, and `deleted_by` to `customer_notes`. Built note composer with keyboard shortcuts, pinning, relative time formatting (`src/lib/format.ts`), and keyset-paginated 4-source activity feed (`orders`, `order_status_history`, `payments`, `customer_notes`) via unified `UNION ALL` query.
6. **ECOM-005 (Staff Team Management UI & Actions):** Created `src/server/validation/staff.ts`, `src/server/services/staff.service.ts`, `src/actions/staff.ts`, `src/views/Staff.tsx`, and `src/app/staff/page.tsx`. Implemented secure temporary password generation, Better Auth scrypt password hashing, audit logging, and immediate `ba_session` deletion upon staff account ban.
7. **ECOM-008 (Orphan Media Tracking & Cleanup):** Tracked ImageKit uploads in `media_uploads` table, updated attachment timestamps in `ProductService`, and exposed list/cleanup server actions with dry-run support in `src/actions/media.ts`.
8. **ECOM-009 (Bulk Order Operations):** Implemented multi-select table rows and floating action bar in `src/views/Orders.tsx`, backed by `bulkUpdateOrderStatusAction` in `src/actions/orders.ts`.
9. **ECOM-011 (Stateful Read-Tracked Notifications):** Implemented `notification_reads` tracking in `shell.service.ts`, `markNotificationReadAction` in `src/actions/settings.ts`, and topbar notification dropdown integration.
10. **ECOM-012 (Storefront Settings Contract & Registry):** Created `src/lib/store-settings-registry.ts` with strict validators (IBAN, phone, currency, URL), integrated into `settings.service.ts`, and published specification document `docs/ai-context/STOREFRONT_SETTINGS_CONTRACT.md`.

---

## 2026-11-09: Batch 14 — Automated Test Harness & Final CI Gates (TEST-001 through TEST-007, ARCH-009, DB-016)

### Objectives
Establish comprehensive automated testing, static regression guards, and CI pipeline for continuous verification:
1. `TEST-001`: Vitest test runner configuration and pure logic unit test suite.
2. `TEST-002`: Master declarative authorization matrix test suite.
3. `TEST-003`: DTO snapshot parity and anti-fabrication test suite.
4. `TEST-004`: Concurrency and transaction invariants integration test suite.
5. `TEST-005`: Security assertions and proxy verification test suite.
6. `TEST-006`: Static regression guards (G1–G10) integrated into lint pipeline.
7. `TEST-007`: Zero-dependency load and capacity benchmark harness.
8. `ARCH-009`: Multi-job GitHub Actions CI workflow, PR template, and branch protection specification.
9. `DB-016`: 100% database schema parity audit across all 31 tables.

### Key Changes
1. **TEST-001 (Vitest Runner & Pure Logic Suite):** Installed `vitest@5.1.0` devDependency without legacy flags. Configured `vitest.config.ts` with path aliases and 60s timeout for remote DB transactions. Added `npm test`, `npm run test:watch`, and `npm run test:load` scripts. Created `test/unit/pure-logic.test.ts` (16 tests verifying formatting, permissions, registry validation, errors, safeInternalPath, and schemas).
2. **TEST-002 (Authorization Matrix):** Created `test/unit/auth-matrix.test.ts` (3 tests) dynamically verifying AST extracted roles from all Server Actions against the master RBAC matrix, enforcing strict role hierarchy and customer role isolation.
3. **TEST-003 (DTO Snapshots & Anti-Fabrication):** Created `test/unit/dto-snapshots.test.ts` (7 tests) validating category, coupon, shipping, engraving, and payment method DTO transformers, asserting that missing database fields return `undefined` rather than fabricated placeholder values.
4. **TEST-004 (Concurrency Invariants):** Created `test/integration/concurrency.test.ts` (4 integration tests) verifying:
   - Scenario 1: Stock oversell prevention with parallel order placements on last remaining unit.
   - Scenario 2: Deadlock-free multi-item reservation under inverted item sequence ([A,B] vs [B,A]).
   - Scenario 3: Idempotent payment approvals under parallel submission.
   - Scenario 4: Single-use coupon race condition prevention.
5. **TEST-005 (Security Verification Suite):** Created `test/unit/security.test.ts` (6 tests) verifying SEC-001 diagnostic route deletion, Next.js 16 security headers, open-redirect sanitization, proxy status codes (401 JSON / 307 redirect), and customer privilege escalation rejection.
6. **TEST-006 (Static Regression Guards):** Created `scripts/check-guards.mjs` enforcing 10 automated guards:
   - `[G1]`: Zero hardcoded credentials or secrets in `src/`.
   - `[G2]`: No `redirect()` calls in Server Actions or Route Handlers.
   - `[G3]`: Explicit non-null `requiredRole` on all Server Actions.
   - `[G4]`: Preservation and rethrowing of `NEXT_REDIRECT` errors.
   - `[G5]`: DTO `as any` count bounded below threshold.
   - `[G6]`: Verification of all file links in `docs/ai-context/`.
   - `[G7]`: Zero usage of `dangerouslySetInnerHTML`.
   - `[G8]`: No raw object console logging in server domain services.
   - `[G9]`: Dependency usage hygiene check.
   - `[G10]`: Proxy route matcher uses explicit prefixes without negative lookaheads.
   Wired into `npm run lint` (`eslint . && node scripts/check-guards.mjs`).
7. **TEST-007 (Load & Capacity Harness):** Created `scripts/load-test.mjs` measuring p50, p90, p95, and p99 latency, throughput, and error rates across 50 operations with 10 concurrent workers.
8. **ARCH-009 (CI/CD Pipeline & Branch Protection):** Created `.github/workflows/ci.yml` with 4 parallel jobs (`install-and-verify`, `audit`, `schema-parity`, `test`). Created `.github/pull_request_template.md` with §4.3 Definition of Done checklist. Documented branch protection requirements in `docs/ai-context/ARCHITECTURE.md` §11.
9. **DB-016 (Schema Parity):** Audited all 31 tables, 45 foreign keys, CHECK constraints, indexes, triggers, and Row Level Security via `npm run db:parity`.

### Files Created
- `vitest.config.ts`
- `test/unit/pure-logic.test.ts`
- `test/unit/auth-matrix.test.ts`
- `test/unit/dto-snapshots.test.ts`
- `test/integration/concurrency.test.ts`
- `test/unit/security.test.ts`
- `scripts/check-guards.mjs`
- `scripts/load-test.mjs`
- `.github/workflows/ci.yml`
- `.github/pull_request_template.md`
- `docs/ai-context/STOREFRONT_SETTINGS_CONTRACT.md`
- `supabase/migrations/20261109000009_ecommerce_lifecycle.sql`
- `src/lib/store-settings-registry.ts`
- `src/server/validation/staff.ts`
- `src/server/services/staff.service.ts`
- `src/actions/staff.ts`
- `src/views/Staff.tsx`
- `src/app/staff/page.tsx`
- `src/app/api/admin/jobs/expire-orders/route.ts`
- `src/app/orders/[id]/print/page.tsx`
- `src/app/orders/[id]/print/print-controls.tsx`

### Verification & Tests Summary
1. `npm test`: **36/36 tests PASSED** across 5 test suites (16 pure logic, 3 auth matrix, 7 DTO snapshots, 6 security, 4 concurrency invariants).
2. `npm run lint`: **0 errors**, all 10 static regression guards PASSED.
3. `npm run db:parity`: **100% PASS** across all 31 tables, foreign keys, constraints, indexes, triggers, and RLS.
4. `npx tsc --noEmit`: **0 errors** across all application and test TypeScript files.
5. `npm run build`: Turbopack production build succeeded cleanly with all 24 routes server-rendered dynamically.
6. `npm run test:load`: **50/50 requests succeeded** (0 errors) at 7.9 req/s with p50 latency of 637.83ms.
