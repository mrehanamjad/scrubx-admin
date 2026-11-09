/**
 * UI Capability Matrix & Access Evaluator.
 *
 * NOTE: COSMETIC ONLY.
 * The server re-checks all roles on every mutation and query (assertRole / requiredRole).
 * Never rely on client-side capability checks for security enforcement.
 */

export const CAPABILITIES = {
  "product:write": ["admin", "super_admin"],
  "category:write": ["admin", "super_admin"],
  "inventory:adjust": ["admin", "super_admin"],
  "order:create": ["staff", "admin", "super_admin"],
  "order:status": ["admin", "super_admin"],
  "order:ship": ["admin", "super_admin"],
  "order:note": ["staff", "admin", "super_admin"],
  "payment:submit": ["staff", "admin", "super_admin"],
  "payment:verify": ["admin", "super_admin"],
  "customer:write": ["admin", "super_admin"],
  "coupon:write": ["admin", "super_admin"],
  "shipping:write": ["admin", "super_admin"],
  "engraving:write": ["admin", "super_admin"],
  "payment-method:write": ["admin", "super_admin"],
  "settings:write": ["super_admin"],
} as const;

export type Capability = keyof typeof CAPABILITIES;

/**
 * Checks whether a user role possesses a cosmetic UI capability.
 */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  const allowed = CAPABILITIES[capability] as readonly string[];
  return allowed.includes(role);
}
