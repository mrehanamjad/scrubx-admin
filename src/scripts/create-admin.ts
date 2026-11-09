import fs from "node:fs";
import crypto from "node:crypto";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";

// Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

async function createAdmin() {
  console.log("\n========================================================");
  console.log("       ScrubX Secure Admin Account Provisioning        ");
  console.log("========================================================\n");

  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "";

  if (!connectionString.trim()) {
    console.error("Error: DATABASE_URL is not set in .env.local.");
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL || "admin@scrubx.pk").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || "Ayesha Rehman").trim();
  const password = process.env.ADMIN_PASSWORD;
  const role = (process.env.ADMIN_ROLE || "super_admin").trim().toLowerCase();

  const VALID_ADMIN_ROLES = ["super_admin", "admin", "staff"] as const;
  if (!VALID_ADMIN_ROLES.includes(role as (typeof VALID_ADMIN_ROLES)[number])) {
    console.error(
      `Error: Invalid ADMIN_ROLE '${role}'. Must be one of: ${VALID_ADMIN_ROLES.join(", ")}.`
    );
    process.exit(1);
  }

  if (!password || password.trim().length === 0) {
    console.error("Error: ADMIN_PASSWORD environment variable is required and must not be empty.");
    console.error("Please set ADMIN_PASSWORD in your environment (minimum 12 characters).");
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("Error: ADMIN_PASSWORD must be at least 12 characters long.");
    process.exit(1);
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  try {
    console.log(`Target Email: ${email}`);
    console.log(`Admin Name:   ${name}`);
    console.log(`Role:         ${role}`);
    console.log("\nHashing password using Better Auth secure scrypt/argon2 algorithm...");

    const hashedPassword = await hashPassword(password);

    // Check if user already exists
    const [existingUser] = await client<{ id: string; email: string; role: string }[]>`
      SELECT id, email, role FROM ba_user WHERE lower(email) = lower(${email})
    `;

    if (existingUser) {
      console.log(`\nUser '${email}' already exists (ID: ${existingUser.id}).`);
      console.log("Updating password and ensuring role is set to:", role);

      await client`
        UPDATE ba_user 
        SET role = ${role}, name = ${name}, updated_at = now() 
        WHERE id = ${existingUser.id}
      `;

      // Update or create credential account
      const [existingAccount] = await client<{ id: string }[]>`
        SELECT id FROM ba_account WHERE user_id = ${existingUser.id} AND provider_id = 'credential'
      `;

      if (existingAccount) {
        await client`
          UPDATE ba_account 
          SET password = ${hashedPassword}, updated_at = now() 
          WHERE id = ${existingAccount.id}
        `;
      } else {
        const accountId = crypto.randomUUID();
        await client`
          INSERT INTO ba_account (
            id, account_id, provider_id, user_id, password, created_at, updated_at
          ) VALUES (
            ${accountId}, ${existingUser.id}, 'credential', ${existingUser.id}, ${hashedPassword}, now(), now()
          )
        `;
      }

      console.log("\n✅ Admin credentials successfully updated!");
    } else {
      console.log("\nProvisioning new administrative user...");
      const userId = crypto.randomUUID();
      const accountId = crypto.randomUUID();

      // 1. Insert into ba_user
      await client`
        INSERT INTO ba_user (
          id, name, email, email_verified, role, banned, created_at, updated_at
        ) VALUES (
          ${userId}, ${name}, ${email}, true, ${role}, false, now(), now()
        )
      `;

      // 2. Insert into ba_account
      await client`
        INSERT INTO ba_account (
          id, account_id, provider_id, user_id, password, created_at, updated_at
        ) VALUES (
          ${accountId}, ${userId}, 'credential', ${userId}, ${hashedPassword}, now(), now()
        )
      `;

      console.log(`\n✅ Administrator '${name}' successfully created!`);
      console.log(`User ID: ${userId}`);
    }

    console.log("\n========================================================");
    console.log("Setup complete. You can now sign in at /login with:");
    console.log(`  Email:    ${email}`);
    console.log(`  Password: [configured in ADMIN_PASSWORD or default]`);
    console.log("========================================================\n");
  } catch (err: unknown) {
    const error = err as Error;
    console.error("\nAdmin Provisioning Failed!");
    console.error(`Error: ${error.message.replace(/:[^:@]+@/, ":******@")}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createAdmin();
