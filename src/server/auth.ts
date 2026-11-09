import { auth } from "../lib/auth.ts";
import type { AdminRole } from "../db/schema/index.ts";
import { AuthenticationError, AuthorizationError } from "./errors.ts";

export type { AdminRole };

export interface AdminContext {
  id: string;
  userId?: string;
  email: string;
  name: string;
  role: AdminRole;
}

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 3,
  admin: 2,
  staff: 1,
};

/**
 * Checks whether a given role satisfies the required minimum role in the hierarchy.
 */
export function hasMinimumRole(userRole: string | undefined, minimumRole: AdminRole): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY[userRole as AdminRole] || 0;
  const minLevel = ROLE_HIERARCHY[minimumRole] || 0;
  return userLevel >= minLevel;
}

/**
 * Retrieves the current authenticated admin context on the server.
 * Throws AuthenticationError if unauthenticated or suspended.
 */
export async function getCurrentAdmin(): Promise<AdminContext> {
  let session = null;

  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();
    session = await auth.api.getSession({
      headers: headerList,
    });
  } catch (err) {
    if (err instanceof AuthenticationError || err instanceof AuthorizationError) {
      throw err;
    }
    console.warn("[Auth Session Retrieval Warning]:", err);
    throw new AuthenticationError("Failed to verify authentication session.");
  }

  if (!session || !session.user) {
    throw new AuthenticationError("Authentication required. Please sign in.");
  }

  const user = session.user as typeof session.user & {
    banned?: boolean;
    banReason?: string;
    role?: string;
  };

  if (user.banned) {
    throw new AuthenticationError(
      user.banReason
        ? `Your account has been suspended: ${user.banReason}`
        : "Your account has been suspended. Please contact a Super Administrator."
    );
  }

  const ROLE_SET = new Set<AdminRole>(["super_admin", "admin", "staff"]);
  const rawRole = typeof user.role === "string" ? user.role.trim() : "";
  if (!ROLE_SET.has(rawRole as AdminRole)) {
    throw new AuthorizationError(
      "Your account does not have administrative access. Contact a Super Administrator."
    );
  }
  const role = rawRole as AdminRole;

  return {
    id: user.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
  };
}

/**
 * Asserts that the admin has one of the allowed roles (accounting for hierarchy).
 * Throws AuthorizationError if privileges are insufficient.
 */
export function assertRole(admin: AdminContext, allowedRoles: AdminRole[]): void {
  // If allowedRoles contains a minimum threshold, check hierarchy against the lowest allowed role
  const isAuthorized = allowedRoles.some((allowedRole) =>
    hasMinimumRole(admin.role, allowedRole)
  );

  if (!isAuthorized) {
    throw new AuthorizationError(
      `Forbidden: Action requires ${allowedRoles.join(" or ")} privileges. Your current role is '${admin.role}'.`
    );
  }
}

export interface StaffContextOptions {
  redirect?: boolean;
}

/**
 * Enforces staff privileges (super_admin, admin, or staff).
 * In React Server Components, automatically redirects unauthenticated visits to /login.
 */
export async function requireStaffContext(options: StaffContextOptions = { redirect: true }): Promise<AdminContext> {
  try {
    const admin = await getCurrentAdmin();
    assertRole(admin, ["staff"]);
    return admin;
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && String((err as any).digest).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (options.redirect) {
      const { redirect } = await import("next/navigation");
      if (err instanceof AuthorizationError) {
        redirect("/login?error=forbidden");
      }
      redirect("/login?error=session");
    }
    throw err;
  }
}

/**
 * Enforces administrator privileges (super_admin or admin).
 */
export async function requireAdminContext(options: StaffContextOptions = { redirect: true }): Promise<AdminContext> {
  try {
    const admin = await getCurrentAdmin();
    assertRole(admin, ["admin"]);
    return admin;
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && String((err as any).digest).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (options.redirect) {
      const { redirect } = await import("next/navigation");
      if (err instanceof AuthorizationError) {
        redirect("/login?error=forbidden");
      }
      redirect("/login?error=session");
    }
    throw err;
  }
}

/**
 * Enforces super administrator privileges (super_admin only).
 */
export async function requireSuperAdminContext(options: StaffContextOptions = { redirect: true }): Promise<AdminContext> {
  try {
    const admin = await getCurrentAdmin();
    assertRole(admin, ["super_admin"]);
    return admin;
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && String((err as any).digest).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (options.redirect) {
      const { redirect } = await import("next/navigation");
      if (err instanceof AuthorizationError) {
        redirect("/login?error=forbidden");
      }
      redirect("/login?error=session");
    }
    throw err;
  }
}

/**
 * Convenience helper for React Server Component pages.
 * Enforces the required minimum administrative role and performs clean error redirects.
 */
export async function requirePage(role: AdminRole = "staff"): Promise<AdminContext> {
  const { redirect } = await import("next/navigation");
  try {
    if (role === "super_admin") {
      return await requireSuperAdminContext({ redirect: false });
    }
    if (role === "admin") {
      return await requireAdminContext({ redirect: false });
    }
    return await requireStaffContext({ redirect: false });
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && String((err as any).digest).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof AuthorizationError) {
      redirect("/login?error=forbidden");
    }
    redirect("/login?error=session");
    throw err;
  }
}
