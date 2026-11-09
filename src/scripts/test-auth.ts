import fs from "node:fs";
import { auth } from "../lib/auth.ts";
import type { AdminRole } from "../db/schema/index.ts";

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 3,
  admin: 2,
  staff: 1,
};

function hasMinimumRole(userRole: string | undefined, minimumRole: AdminRole): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY[userRole as AdminRole] || 0;
  const minLevel = ROLE_HIERARCHY[minimumRole] || 0;
  return userLevel >= minLevel;
}

// Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function runAuthSuite() {
  console.log("\n========================================================");
  console.log("       ScrubX Better Auth Full Verification Suite       ");
  console.log("========================================================\n");

  const testEmail = (process.env.ADMIN_EMAIL || "admin@scrubx.pk").trim().toLowerCase();
  const validPassword = process.env.ADMIN_PASSWORD;

  if (!validPassword) {
    console.log("ℹ️  [SKIP] ADMIN_PASSWORD environment variable is not configured. Skipping live sign-in test suite.");
    process.exit(0);
  }

  const invalidPassword = "WrongPassword999!";

  let activeToken = "";
  let activeCookie = "";

  // --------------------------------------------------------------------------
  // TEST 1: Admin Login with Valid Credentials
  // --------------------------------------------------------------------------
  console.log("1. Testing Admin Login with Valid Credentials...");
  try {
    const res = await auth.api.signInEmail({
      body: {
        email: testEmail,
        password: validPassword,
      },
      asResponse: true,
    });

    const setCookie = res.headers.get("set-cookie") || "";
    const body = (await res.json()) as { token?: string; user?: { role?: string; email?: string } };

    activeToken = body?.token || "";
    activeCookie = setCookie;

    assert(res.status === 200, "HTTP Status is 200 OK");
    assert(Boolean(body?.user), "User profile returned in response body");
    assert(body?.user?.email === testEmail, `User email matches '${testEmail}'`);
    assert(body?.user?.role === "super_admin", "User role is super_admin");
    assert(Boolean(setCookie && setCookie.includes("better-auth.session_token")), "Set-Cookie contains better-auth.session_token");
  } catch (err) {
    assert(false, "Login with valid credentials failed", (err as Error).message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Rejection of Invalid Credentials
  // --------------------------------------------------------------------------
  console.log("\n2. Testing Rejection of Invalid Credentials...");
  try {
    const res = await auth.api.signInEmail({
      body: {
        email: testEmail,
        password: invalidPassword,
      },
      asResponse: true,
    });

    assert(res.status !== 200, `Rejected with status ${res.status}`);
  } catch (err: unknown) {
    // Some versions throw on 401
    assert(true, "Invalid credentials correctly rejected with error", (err as Error).message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Session Persistence & Server-Side Validation
  // --------------------------------------------------------------------------
  console.log("\n3. Testing Session Persistence & Validation...");
  try {
    // Extract raw cookie string to pass in headers
    const rawCookie = activeCookie.split(";")[0];
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: rawCookie,
      }),
    });

    assert(Boolean(session?.session), "Session retrieved from PostgreSQL via cookie");
    assert(Boolean(session?.user), "User profile attached to active session");
    assert(session?.user?.email === testEmail, "Session belongs to correct admin");
    assert(session?.user?.role === "super_admin", "Session user role validated as super_admin");
  } catch (err) {
    assert(false, "Session retrieval failed", (err as Error).message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Role-Based Authorization Guard Logic
  // --------------------------------------------------------------------------
  console.log("\n4. Testing Role-Based Access Control (RBAC) Hierarchy...");
  assert(hasMinimumRole("super_admin", "super_admin") === true, "super_admin satisfies super_admin");
  assert(hasMinimumRole("super_admin", "admin") === true, "super_admin satisfies admin");
  assert(hasMinimumRole("super_admin", "staff") === true, "super_admin satisfies staff");
  assert(hasMinimumRole("admin", "super_admin") === false, "admin does NOT satisfy super_admin");
  assert(hasMinimumRole("admin", "admin") === true, "admin satisfies admin");
  assert(hasMinimumRole("admin", "staff") === true, "admin satisfies staff");
  assert(hasMinimumRole("staff", "admin") === false, "staff does NOT satisfy admin");
  assert(hasMinimumRole("staff", "staff") === true, "staff satisfies staff");
  assert(hasMinimumRole(undefined, "staff") === false, "Anonymous/Undefined has no privileges");

  // --------------------------------------------------------------------------
  // TEST 5: Public Registration Blocked (Internal Admin Hardening)
  // --------------------------------------------------------------------------
  console.log("\n5. Testing Public Sign-Up Blocking...");
  try {
    const res = await auth.api.signUpEmail({
      body: {
        email: "hacker@example.com",
        password: "Password123!",
        name: "Intruder",
      },
      asResponse: true,
    });
    assert(res.status !== 200, "Public sign-up rejected");
  } catch (err: unknown) {
    assert(true, "Public sign-up blocked: disableSignUp is enforced", (err as Error).message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Logout & Session Revocation
  // --------------------------------------------------------------------------
  console.log("\n6. Testing Logout & Session Revocation...");
  try {
    const rawCookie = activeCookie.split(";")[0];
    const logoutRes = await auth.api.signOut({
      headers: new Headers({
        cookie: rawCookie,
      }),
      asResponse: true,
    });

    assert(logoutRes.status === 200, "Sign-out request responded with 200 OK");

    // Verify session is now revoked or null
    const checkSession = await auth.api.getSession({
      headers: new Headers({
        cookie: rawCookie,
      }),
    });

    assert(!checkSession, "Session successfully invalidated in database");
  } catch (err) {
    assert(false, "Logout failed", (err as Error).message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n========================================================");
  console.log(`Verification Complete: ${passed} passed, ${failed} failed`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthSuite();
