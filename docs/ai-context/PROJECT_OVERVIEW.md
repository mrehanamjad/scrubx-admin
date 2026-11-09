# ScrubX Admin — Project Overview

> **Permanent AI Context Documentation**  
> *Last Updated: November 2026*

---

## 1. Project Purpose & Scope

**ScrubX** is a specialized e-commerce brand based in Pakistan catering to healthcare professionals (doctors, surgeons, nurses, medical students). The store provides:
- Medical scrubs (sets, tops, pants)
- Lab coats and consultation jackets
- Medical accessories (caps, stethoscopes)
- Custom personalization: Name embroidery and hospital/clinic logo engraving

This repository contains the **ScrubX Admin Panel**, an internal operations platform used by store managers and staff to manage catalog inventory, review orders, verify manual bank and wallet payments, process custom engraving requests, dispatch shipments, and track store performance.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Next.js App Router | `16.4.5` | React Server Components (RSC), Turbopack, route handlers, middleware |
| **Runtime & Language** | Node.js / TypeScript | Node `22.x` / TS `~5.9.3` | Server execution, strict type-checking, native TypeScript stripping |
| **UI Library** | React | `19.2.0` | UI component tree, hooks, Server Actions integration |
| **Styling** | Tailwind CSS / PostCSS | `4.3.4` | Utility-first styling via `@tailwindcss/postcss` |
| **Component Primitives** | Radix UI | Various | Accessible dialogs, dropdowns, tabs, tooltips, select menus |
| **Icons & Animations** | Lucide React / Framer Motion | `0.577.0` / `12.35.0` | Design system iconography and micro-interactions |
| **Charts** | Recharts | `3.10.1` | Dashboard revenue and order analytics visualizations |
| **Database** | Managed PostgreSQL (Supabase) | PostgreSQL `17.x` | Relational database (24 tables, RLS lockdown) |
| **ORM & Migrations** | Drizzle ORM / Drizzle Kit | `^0.38.4` / `^0.30.2` | Type-safe SQL queries, schema definitions, migration CLI |
| **Authentication** | Better Auth | `^1.7.17` | Self-hosted PostgreSQL auth, sessions, RBAC, edge route protection |
| **Media Storage** | ImageKit (`imagekit` / `@imagekit/next`) | `^6.0.0` | Product photography, payment proof screenshots, logo uploads |
| **Validation** | Zod / React Hook Form | `^4.6.7` / `^7.91.0` | Server Action schemas and client form validation |

---

## 3. Core Business Workflows

1. **Catalog & Matrix Management:** Products with complex multi-color and multi-size matrices (XS to 2XL), color swatches (`hex_code`), size-specific pricing, and compare-at ("was") pricing.
2. **Custom Engraving Processing:** Products marked `is_engravable` accept custom name text or customer-uploaded logo vector files per order item.
3. **Pakistani Manual Payment Verification:** Cashless commerce in Pakistan relies heavily on direct wallet-to-wallet and bank transfers (JazzCash, Easypaisa, SadaPay, NayaPay, Bank Deposit). Customers submit Transaction Reference IDs (TIDs) and payment screenshots on WhatsApp or during checkout; administrators review and approve/reject these in a dedicated verification queue.
4. **Stock Reservation & Audit:** Differentiates `quantity_on_hand` and `quantity_reserved` with immutable audit logging via `inventory_movements`.
5. **Coupons & Promotions:** Percentage or fixed PKR discounts with usage limits, minimum order amounts, and first-order-only restrictions.
6. **Delivery & Logistics:** Courier assignment (TCS, Leopards, Trax, Call Courier) with tracking numbers and automated sequential order numbers (`SX-1001`).

---

## 4. Important Architectural Restrictions

1. **Strictly Managed PostgreSQL (No Supabase Auth / No Supabase Storage):**
   - Supabase is used **only** as a managed PostgreSQL hosting layer.
   - Authentication is handled exclusively by **Better Auth** (storing credentials in `ba_*` tables).
   - Media storage is handled exclusively by **ImageKit** (`imagekit` SDK and direct client uploads).
   - Supabase client libraries (`@supabase/supabase-js`, `@supabase/auth-helpers`) MUST NOT be installed or used.
2. **Zero Direct Client Database Access:**
   - Database operations are strictly server-only (`src/db/`).
   - Browser components must never import database clients, execute SQL, or access database connection strings.
3. **No Unrestricted Public Sign-ups:**
   - This is an internal administrative portal. Public user registration is explicitly disabled (`disableSignUp: true`).
   - Administrator accounts are provisioned via secure server CLI scripts.
4. **Currency & Precision:**
   - All monetary values are Pakistani Rupees (PKR) stored in the database as `numeric(12, 2)`.
   - Never use floating point math for prices or totals.
5. **Business Rule Database Triggers:**
   - Orders with custom engraving **cannot** select Cash on Delivery (COD) as a payment method. This is enforced at the database level via the `check_engraving_cod_rule` trigger.
6. **Server Actions First Architecture:**
   - All 18 administrative views are fully wired to live database Server Components and Server Actions. Legacy mock data in `src/data/*` is deprecated.
