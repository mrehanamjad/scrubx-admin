import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import nextConfig from "../../next.config.ts";
import { safeInternalPath } from "../../src/lib/safe-redirect.ts";
import { proxy } from "../../src/proxy.ts";
import { NextRequest } from "next/server";
import { assertRole } from "../../src/server/auth.ts";
import { AuthorizationError } from "../../src/server/errors.ts";

describe("TEST-005: Security & Invariant Verification Suite", () => {
  it("SEC-001: Verifies that diagnostic backdoor /api/auth/verify is completely deleted", () => {
    const verifyRoutePath = path.resolve(
      import.meta.dirname,
      "../../src/app/api/auth/verify"
    );
    expect(fs.existsSync(verifyRoutePath)).toBe(false);
  });

  it("SEC-010: Verifies Next.js 16 HTTP security headers configuration", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);

    if (nextConfig.headers) {
      const headersList = await nextConfig.headers();
      const rootHeaders = headersList.find((h) => h.source === "/(.*)");
      expect(rootHeaders).toBeDefined();

      const headerMap = new Map(rootHeaders!.headers.map((h) => [h.key, h.value]));
      expect(headerMap.get("X-Frame-Options")).toBe("DENY");
      expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headerMap.get("Strict-Transport-Security")).toContain("max-age=");
    }
  });

  it("SEC-008: Open-redirect mitigation strictly sanitizes inputs", () => {
    expect(safeInternalPath("/orders")).toBe("/orders");
    expect(safeInternalPath("/products/new?category=scrubs")).toBe("/products/new?category=scrubs");
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("https://attacker.com/steal")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
    expect(safeInternalPath("")).toBe("/");
    expect(safeInternalPath(null)).toBe("/");
  });

  it("SEC-011: Proxy enforces 401 JSON on unauthenticated API requests", async () => {
    const req = new NextRequest("http://localhost:3000/api/upload/auth", {
      headers: new Headers(),
    });

    const res = await proxy(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  it("SEC-011: Proxy redirects unauthenticated UI page requests to /login?from=", async () => {
    const req = new NextRequest("http://localhost:3000/products", {
      headers: new Headers(),
    });

    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login?from=%2Fproducts");
  });

  it("SEC-004 & SEC-013: Prohibits customer role from all administrative operations", () => {
    const customer = {
      id: "cust-1",
      name: "Customer",
      email: "cust@gmail.com",
      role: "customer" as any,
    };

    expect(() => assertRole(customer, ["staff"])).toThrow(AuthorizationError);
    expect(() => assertRole(customer, ["admin"])).toThrow(AuthorizationError);
    expect(() => assertRole(customer, ["super_admin"])).toThrow(AuthorizationError);
  });
});
