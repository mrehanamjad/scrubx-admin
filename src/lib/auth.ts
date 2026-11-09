import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "../db/index.ts";
import * as schema from "../db/schema/index.ts";

function requireAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("Missing required environment variable: BETTER_AUTH_SECRET");
  }
  if (secret.length < 32) {
    throw new Error("Environment variable BETTER_AUTH_SECRET must be at least 32 characters long");
  }
  return secret;
}

function getTrustedOrigins(): string[] {
  if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
    return process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    return [appUrl];
  }
  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:3000"];
  }
  throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL or BETTER_AUTH_TRUSTED_ORIGINS");
}

function getBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  throw new Error("Missing required environment variable: BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.baUser,
      session: schema.baSession,
      account: schema.baAccount,
      verification: schema.baVerification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // Internal admin panel: public registration is strictly disabled
    requireEmailVerification: false,
  },
  plugins: [
    admin({
      defaultRole: "staff",
      adminRole: ["super_admin", "admin"],
    }),
  ],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "staff",
        input: false, // Prevent self-assignment of roles during sign in
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes cache
    },
  },
  trustedOrigins: getTrustedOrigins(),
  get secret() {
    return requireAuthSecret();
  },
  baseURL: getBaseUrl(),
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
