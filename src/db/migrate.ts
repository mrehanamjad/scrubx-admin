import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import postgres from "postgres";

// Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

function calculateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDollarQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || "";

    // Line comments: --
    if (!inSingleQuote && !inDollarQuote && !inBlockComment && char === "-" && nextChar === "-") {
      inLineComment = true;
    }
    if (inLineComment && (char === "\n" || char === "\r")) {
      inLineComment = false;
    }

    // Block comments: /* ... */
    if (!inSingleQuote && !inDollarQuote && !inLineComment && char === "/" && nextChar === "*") {
      inBlockComment = true;
    }
    if (inBlockComment && char === "*" && nextChar === "/") {
      inBlockComment = false;
      current += "*/";
      i++;
      continue;
    }

    // String literals: '...'
    if (!inLineComment && !inBlockComment && !inDollarQuote && char === "'") {
      if (inSingleQuote && nextChar === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    }

    // Semicolon separator outside quotes and comments
    if (char === ";" && !inSingleQuote && !inDollarQuote && !inLineComment && !inBlockComment) {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const remainder = current.trim();
  if (remainder) {
    statements.push(remainder);
  }

  return statements;
}

async function runMigration() {
  console.log("\n========================================================");
  console.log("       ScrubX Database Schema Migration Runner         ");
  console.log("========================================================\n");

  const isDryRun = process.argv.includes("--dry-run");
  if (isDryRun) {
    console.log("🔍 DRY RUN MODE ACTIVATED - No database modifications will occur.\n");
  }

  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "";

  if (!connectionString.trim()) {
    console.error("Error: DATABASE_URL is not set in .env.local.");
    process.exit(1);
  }

  const migrationsDir = path.join(process.cwd(), "supabase/migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found at ${migrationsDir}`);
    process.exit(1);
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (migrationFiles.length === 0) {
    console.log("No SQL migration files found in supabase/migrations/.");
    process.exit(0);
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  try {
    // 1. Create migration journal table if it does not exist (DB-015)
    await client`
      CREATE TABLE IF NOT EXISTS _app_migrations (
        name text PRIMARY KEY,
        executed_at timestamptz NOT NULL DEFAULT now(),
        non_transactional boolean NOT NULL DEFAULT false,
        checksum text
      )
    `;

    // Ensure columns exist on older instances
    await client`
      ALTER TABLE _app_migrations 
      ADD COLUMN IF NOT EXISTS non_transactional boolean NOT NULL DEFAULT false
    `;
    await client`
      ALTER TABLE _app_migrations 
      ADD COLUMN IF NOT EXISTS checksum text
    `;

    // 2. Fetch already executed migrations
    const executedRows = await client<{
      name: string;
      non_transactional: boolean;
      checksum: string | null;
    }[]>`
      SELECT name, non_transactional, checksum FROM _app_migrations
    `;
    const executedMap = new Map(executedRows.map((r) => [r.name, r]));

    // If initial migration is not recorded but products table exists, baseline it
    if (!executedMap.has("20261105000000_initial_schema.sql")) {
      const [existingTable] = await client<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'products'
        ) as exists
      `;
      if (existingTable?.exists) {
        const initialContent = fs.readFileSync(
          path.join(migrationsDir, "20261105000000_initial_schema.sql"),
          "utf-8"
        );
        const initialChecksum = calculateChecksum(initialContent);
        console.log("Baseline: 'products' table already exists. Marking '20261105000000_initial_schema.sql' as applied.");
        await client`
          INSERT INTO _app_migrations (name, non_transactional, checksum)
          VALUES ('20261105000000_initial_schema.sql', false, ${initialChecksum})
          ON CONFLICT (name) DO UPDATE 
          SET checksum = EXCLUDED.checksum
        `;
        executedMap.set("20261105000000_initial_schema.sql", {
          name: "20261105000000_initial_schema.sql",
          non_transactional: false,
          checksum: initialChecksum,
        });
      }
    }

    console.log(`Discovered ${migrationFiles.length} migration file(s):`);

    // Verify integrity of applied migrations
    for (const file of migrationFiles) {
      const fullPath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(fullPath, "utf-8");
      const currentChecksum = calculateChecksum(sqlContent);
      const isNoTx = sqlContent.trimStart().startsWith("-- migrate:no-transaction");
      const modeLabel = isNoTx ? "[Non-Transactional]" : "[Transactional]";

      const recorded = executedMap.get(file);
      if (recorded) {
        if (recorded.checksum && recorded.checksum !== currentChecksum) {
          console.error(
            `\n❌ INTEGRITY ERROR: Migration file '${file}' has been modified after being applied!`
          );
          console.error(`   Recorded Checksum: ${recorded.checksum}`);
          console.error(`   Current Checksum:  ${currentChecksum}`);
          throw new Error(`Checksum mismatch for already applied migration '${file}'.`);
        } else if (!recorded.checksum) {
          // Backfill missing checksum for legacy applied migration
          await client`
            UPDATE _app_migrations SET checksum = ${currentChecksum} WHERE name = ${file}
          `;
        }
        console.log(`  - ${file} ${modeLabel} [Applied] (sha256: ${currentChecksum.slice(0, 8)}...)`);
      } else {
        console.log(`  - ${file} ${modeLabel} [Pending] (sha256: ${currentChecksum.slice(0, 8)}...)`);
      }
    }

    if (isDryRun) {
      console.log("\nDry run completed successfully. No changes made.");
      return;
    }

    // 3. Execute pending migrations sequentially
    for (const file of migrationFiles) {
      if (executedMap.has(file)) continue;

      const fullPath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(fullPath, "utf-8");
      const checksum = calculateChecksum(sqlContent);
      const isNoTx = sqlContent.trimStart().startsWith("-- migrate:no-transaction");
      const modeLabel = isNoTx ? "non-transactional" : "transactional";

      console.log(`\nExecuting pending ${modeLabel} migration: ${file}...`);
      const start = performance.now();

      if (isNoTx) {
        // DB-015: Non-transactional execution (e.g. CREATE INDEX CONCURRENTLY, VACUUM)
        // PostgreSQL simple query protocol requires separate statements to avoid implicit transaction block
        const statements = splitSqlStatements(sqlContent);
        for (const statement of statements) {
          await client.unsafe(statement);
        }
        await client`
          INSERT INTO _app_migrations (name, non_transactional, checksum)
          VALUES (${file}, true, ${checksum})
          ON CONFLICT (name) DO UPDATE 
          SET non_transactional = true, checksum = ${checksum}
        `;
      } else {
        // Standard transactional migration
        await client.begin(async (sql) => {
          await sql.unsafe(sqlContent);
          await sql`
            INSERT INTO _app_migrations (name, non_transactional, checksum)
            VALUES (${file}, false, ${checksum})
            ON CONFLICT (name) DO UPDATE 
            SET non_transactional = false, checksum = ${checksum}
          `;
        });
      }

      const elapsed = Math.round(performance.now() - start);
      console.log(`  ✓ Successfully applied ${file} in ${elapsed}ms!`);
    }

    console.log("\nAll pending migrations applied successfully!");

    // Verify created tables
    const tables = await client<{ table_name: string }[]>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != '_app_migrations'
      ORDER BY table_name;
    `;

    console.log(`\nVerified ${tables.length} application tables in 'public' schema:`);
    console.log(tables.map((t) => `  - ${t.table_name}`).join("\n"));
    console.log("\n========================================================\n");
  } catch (err: unknown) {
    const error = err as Error;
    console.error("\nMigration Failed!");
    console.error(`Error: ${error.message.replace(/:[^:@]+@/, ":******@")}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
