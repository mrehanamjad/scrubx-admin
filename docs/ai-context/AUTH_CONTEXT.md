# ScrubX Admin — Authentication & Authorization Context

> **Permanent AI Context Documentation**  
> *Last Updated: November 2026*

---

## 1. Authentication Engine: Better Auth

ScrubX Admin utilizes **Better Auth** (`better-auth` v1.7.x) self-hosted on PostgreSQL with Drizzle ORM.

### Architectural Principles
- **PostgreSQL Self-Hosted:** All credentials, sessions, and accounts reside in dedicated tables (`ba_user`, `ba_session`, `ba_account`, `ba_verification`) in the Supabase PostgreSQL database. No external SaaS auth vendor is used.
- **Strictly Internal Admin Portal:** Public registration is disabled via `emailAndPassword: { enabled: true, disableSignUp: true }`. Users cannot self-register through API or client interfaces.
- **Role-Based Access Control (RBAC):** Native support for three administrative tiers (`SUPER_ADMIN`, `ADMIN`, `STAFF`) through the Better Auth `admin()` plugin.

---

## 2. Core Authentication Files

| File | Purpose |
|---|---|
| [`src/lib/auth.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth.ts) | Better Auth server configuration with Drizzle adapter and RBAC |
| [`src/lib/auth-client.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth-client.ts) | React client SDK (`useSession`, `signIn.email`, `signOut`, `adminClient`) |
| [`src/lib/auth-guard.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth-guard.ts) | Server-side security guards for Server Actions and RSCs |
| [`src/middleware.ts`](file:///home/rehan/Downloads/scrubX-admin/src/middleware.ts) | Edge middleware route protection inspecting session cookies |
| [`src/app/api/auth/[...all]/route.ts`](file:///home/rehan/Downloads/scrubX-admin/src/app/api/auth/[...all]/route.ts) | Next.js App Router Route Handler for Better Auth endpoints |
| [`src/app/api/auth/verify/route.ts`](file:///home/rehan/Downloads/scrubX-admin/src/app/api/auth/verify/route.ts) | Complete programmatic auth test suite endpoint |
| [`src/app/login/page.tsx`](file:///home/rehan/Downloads/scrubX-admin/src/app/login/page.tsx) | Server Component container for `/login` with Suspense |
| [`src/views/Login.tsx`](file:///home/rehan/Downloads/scrubX-admin/src/views/Login.tsx) | Client login form matching ScrubX design language |
| [`src/scripts/create-admin.ts`](file:///home/rehan/Downloads/scrubX-admin/src/scripts/create-admin.ts) | CLI provisioning script using `better-auth/crypto` password hashing |

---

## 3. Session & Cookie Lifecycle

- **Cookie Name:** `better-auth.session_token` (HTTP) / `__Secure-better-auth.session_token` (HTTPS in production).
- **Session Duration:** 7 days (`60 * 60 * 24 * 7`).
- **Update Frequency:** Session refreshed in PostgreSQL every 24 hours.
- **Cookie Cache:** Cached for 5 minutes (`maxAge: 300`) to avoid redundant database reads on consecutive requests.
- **SameSite / Security:** `sameSite: "lax"`, `httpOnly: true`, `secure: true` in production.

---

## 4. Route Protection & Authorization

### A. Edge Route Protection ([`src/middleware.ts`](file:///home/rehan/Downloads/scrubX-admin/src/middleware.ts))
Uses `getSessionCookie(request)` from `better-auth/cookies` for zero-latency Edge checks:
- Unauthenticated requests to any dashboard route are redirected to `/login?from=<pathname>`.
- Authenticated requests to `/login` are automatically redirected to `/`.
- Public assets (`/brand`, `/products`, `/proofs`, static files) and `/api/auth` bypass middleware.

### B. Server-Side Protection ([`src/lib/auth-guard.ts`](file:///home/rehan/Downloads/scrubX-admin/src/lib/auth-guard.ts))
Edge cookies can only check presence; Server Actions and Server Components re-verify database authenticity and enforce role permissions:
```typescript
import { requireAdmin, requireSuperAdmin } from "@/lib/auth-guard";

// For product creation, stock adjustment, payment verification
const adminSession = await requireAdmin();

// For store settings, managing staff accounts
const superAdminSession = await requireSuperAdmin();
```

### C. Role Hierarchy
```typescript
export type AdminRole = "super_admin" | "admin" | "staff";

export const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 3,
  admin: 2,
  staff: 1,
};
```

### Authorization Capability Matrix
- `super_admin`: Store settings configuration mutations (`/settings`), staff management, irreversible system deletions.
- `admin`: Catalog mutations (products, categories), order processing, payment verification/refunds, inventory adjustments, coupons, shipping methods, engraving options.
- `staff`: Read-only access to catalog, inventory, orders, customers, payments; order notes and initial proof submissions.

> [!IMPORTANT]
> **Strict Role Resolution (SEC-004 & ADR 008):**
> Unrecognized, missing, or storefront customer roles (`customer`, `NULL`, etc.) are strictly rejected with an `AuthorizationError` and redirected to `/login?error=forbidden`. Roles are never coerced or defaulted to `staff`.

---

## 5. Administrator Provisioning

Because public registration is disabled, admin accounts are created via server script:

```bash
# Provision admin account (ADMIN_PASSWORD is required, min 12 chars)
ADMIN_EMAIL="admin@scrubx.pk" \
ADMIN_NAME="Ayesha Rehman" \
ADMIN_PASSWORD="SecurePassphraseMin12Chars" \
ADMIN_ROLE="super_admin" \
npm run auth:seed-admin
```

> [!CAUTION]
> **Admin Password Rotation Required:**
> Any environment provisioned prior to remediation with the legacy hardcoded password fallback must immediately rotate the admin password (`npm run auth:seed-admin` with a fresh `ADMIN_PASSWORD`), as the legacy default was publicly committed to git.
The script uses `hashPassword` from `better-auth/crypto` (scrypt/argon2 algorithm) and creates records in `ba_user` and `ba_account`.

---

## 6. Verification Status

All 6 core authentication capabilities were verified against the live Supabase PostgreSQL database:
- Admin login with valid credentials: **PASS** (Status 200, role `super_admin`)
- Rejection of invalid credentials: **PASS** (Status 401)
- Session persistence via cookie: **PASS** (Verified from PostgreSQL)
- RBAC hierarchy check: **PASS**
- Public registration blocked: **PASS** (Status 400 rejected)
- Logout & session revocation: **PASS** (Database session invalidated)

---

## 7. Environment Variables Required

Configured in `.env.local` (and documented in `.env.example`):
```env
# Better Auth Secret (minimum 32 random characters: openssl rand -hex 32)
BETTER_AUTH_SECRET="your-secure-random-secret-min-32-chars"

# Better Auth URLs & Trusted Origins
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> [!NOTE]
> **Secret Rotation Consequence:**
> Rotating `BETTER_AUTH_SECRET` immediately invalidates all active session tokens. All staff and administrators will be required to sign in again.

---

## 8. Remaining Authentication Work
- Build a Staff Management UI page for `SUPER_ADMIN` to invite/manage staff members and change roles.
- Implement a password change flow in `/settings`.
- Add audit logging on administrative actions linked to `session.user.id`.
