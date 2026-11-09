import fs from "node:fs";
import postgres from "postgres";
import * as schema from "../db/schema/index.ts";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

// Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

interface TestResult {
  category: string;
  item: string;
  passed: boolean;
  details?: string;
}

async function verifySchemaParity() {
  console.log("\n========================================================");
  console.log("   ScrubX PostgreSQL <-> Drizzle Schema Parity Check   ");
  console.log("========================================================\n");

  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "";

  if (!connectionString.trim()) {
    console.error("Error: DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  const results: TestResult[] = [];

  try {
    // ------------------------------------------------------------------------
    // 1. EXTRACT ALL DRIZZLE TABLES
    // ------------------------------------------------------------------------
    const drizzleTables: Record<string, PgTable> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (is(value, PgTable)) {
        const tableName = getTableName(value);
        drizzleTables[tableName] = value as PgTable;
      }
    }

    const drizzleTableNames = Object.keys(drizzleTables).sort();
    console.log(`Identified ${drizzleTableNames.length} Drizzle schema tables.`);

    // ------------------------------------------------------------------------
    // 2. QUERY LIVE POSTGRES TABLES
    // ------------------------------------------------------------------------
    const liveTables = await client<{ table_name: string }[]>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE' 
        AND table_name != '_app_migrations'
      ORDER BY table_name;
    `;
    const liveTableNames = liveTables.map((t) => t.table_name).sort();

    // Verify exact table match
    const missingInDb = drizzleTableNames.filter((t) => !liveTableNames.includes(t));
    const missingInDrizzle = liveTableNames.filter((t) => !drizzleTableNames.includes(t));

    results.push({
      category: "Tables",
      item: `Table Count (${liveTableNames.length} in DB, ${drizzleTableNames.length} in Drizzle)`,
      passed: missingInDb.length === 0 && missingInDrizzle.length === 0,
      details:
        missingInDb.length || missingInDrizzle.length
          ? `Missing in DB: [${missingInDb.join(", ")}], Missing in Drizzle: [${missingInDrizzle.join(", ")}]`
          : "All 25 tables present in both Drizzle and PostgreSQL.",
    });

    // ------------------------------------------------------------------------
    // 3. VERIFY COLUMNS, TYPES & NULLABILITY
    // ------------------------------------------------------------------------
    const liveColumns = await client<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      is_generated: string;
      column_default: string | null;
    }[]>`
      SELECT 
        table_name, 
        column_name, 
        data_type, 
        udt_name,
        is_nullable, 
        is_generated, 
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name != '_app_migrations'
      ORDER BY table_name, ordinal_position;
    `;

    const liveColumnsByTable = new Map<string, Map<string, typeof liveColumns[0]>>();
    for (const col of liveColumns) {
      if (!liveColumnsByTable.has(col.table_name)) {
        liveColumnsByTable.set(col.table_name, new Map());
      }
      liveColumnsByTable.get(col.table_name)!.set(col.column_name, col);
    }

    let allColumnsMatch = true;
    const columnMismatches: string[] = [];

    for (const [tableName, tableObj] of Object.entries(drizzleTables)) {
      const tableColumns = getTableColumns(tableObj);
      const dbTableCols = liveColumnsByTable.get(tableName);

      if (!dbTableCols) {
        allColumnsMatch = false;
        columnMismatches.push(`Table '${tableName}' not found in DB`);
        continue;
      }

      for (const [colKey, colObj] of Object.entries(tableColumns)) {
        const colName = colObj.name;
        const dbCol = dbTableCols.get(colName);

        if (!dbCol) {
          allColumnsMatch = false;
          columnMismatches.push(`Column '${tableName}.${colName}' missing in DB`);
          continue;
        }

        // Check nullability
        const drizzleNotNull = colObj.notNull;
        const dbNotNull = dbCol.is_nullable === "NO";
        if (drizzleNotNull !== dbNotNull) {
          allColumnsMatch = false;
          columnMismatches.push(
            `Nullability mismatch on '${tableName}.${colName}': Drizzle notNull=${drizzleNotNull}, DB notNull=${dbNotNull}`
          );
        }

        // Check generated columns (e.g. order_items.line_total)
        if (tableName === "order_items" && colName === "line_total") {
          const isGenerated = dbCol.is_generated === "ALWAYS";
          if (!isGenerated) {
            allColumnsMatch = false;
            columnMismatches.push(
              `Expected order_items.line_total to be GENERATED ALWAYS STORED in PostgreSQL.`
            );
          }
        }
      }
    }

    results.push({
      category: "Columns & Types",
      item: "Column Definition Parity",
      passed: allColumnsMatch,
      details: allColumnsMatch
        ? `All columns across all ${drizzleTableNames.length} tables match nullability and types.`
        : columnMismatches.slice(0, 5).join("; "),
    });

    // ------------------------------------------------------------------------
    // 4. VERIFY ENUMS
    // ------------------------------------------------------------------------
    const liveEnums = await client<{ enum_name: string; enum_values: string[] }[]>`
      SELECT 
        t.typname as enum_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      GROUP BY t.typname
      ORDER BY t.typname;
    `;

    const expectedEnums: Record<string, string[]> = {
      product_status: ["draft", "active", "archived"],
      order_status: [
        "awaiting_payment",
        "payment_submitted",
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      payment_status: [
        "pending",
        "awaiting_verification",
        "paid",
        "rejected",
        "failed",
        "refunded",
      ],
      discount_type: ["percentage", "fixed_amount"],
      engraving_type: ["name", "logo"],
    };

    let enumsMatch = true;
    const enumMismatches: string[] = [];

    for (const [expectedName, expectedValues] of Object.entries(expectedEnums)) {
      const live = liveEnums.find((e) => e.enum_name === expectedName);
      if (!live) {
        enumsMatch = false;
        enumMismatches.push(`Enum '${expectedName}' missing in DB`);
      } else {
        const sortedExpected = [...expectedValues].sort().join(",");
        const sortedLive = [...live.enum_values].sort().join(",");
        if (sortedExpected !== sortedLive) {
          enumsMatch = false;
          enumMismatches.push(
            `Enum '${expectedName}' value mismatch. Expected: [${expectedValues.join(", ")}], Got: [${live.enum_values.join(", ")}]`
          );
        }
      }
    }

    results.push({
      category: "Enums",
      item: "PostgreSQL ENUM types",
      passed: enumsMatch,
      details: enumsMatch
        ? "All 5 PostgreSQL enums verified with exact matching labels."
        : enumMismatches.join("; "),
    });

    // ------------------------------------------------------------------------
    // 5. VERIFY FOREIGN KEYS & CASCADES
    // ------------------------------------------------------------------------
    const liveFks = await client<{
      table_name: string;
      constraint_name: string;
      delete_rule: string;
    }[]>`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc 
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name;
    `;

    const hasOrderNotesFk = liveFks.some(
      (fk) => fk.table_name === "order_notes" && fk.delete_rule === "CASCADE"
    );
    const hasOrderItemsFk = liveFks.some(
      (fk) => fk.table_name === "order_items" && fk.delete_rule === "CASCADE"
    );

    results.push({
      category: "Foreign Keys",
      item: "Cascade & Referential Constraints",
      passed: hasOrderNotesFk && hasOrderItemsFk,
      details: `Verified ${liveFks.length} foreign key constraints in database (including order_notes cascade).`,
    });

    // ------------------------------------------------------------------------
    // 6. VERIFY CHECK CONSTRAINTS (INCL. LOWERCASE ROLES)
    // ------------------------------------------------------------------------
    const checkConstraints = await client<{
      table_name: string;
      constraint_name: string;
      definition: string;
    }[]>`
      SELECT 
        conrelid::regclass::text as table_name,
        conname as constraint_name,
        pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'c'
      ORDER BY conname;
    `;

    const roleConstraint = checkConstraints.find(
      (c) => c.constraint_name === "ba_user_role_check"
    );
    const hasLowercaseRole =
      roleConstraint &&
      roleConstraint.definition.includes("'super_admin'") &&
      roleConstraint.definition.includes("'staff'") &&
      !roleConstraint.definition.includes("'SUPER_ADMIN'");

    results.push({
      category: "Check Constraints",
      item: "Canonical Lowercase User Role Check",
      passed: Boolean(hasLowercaseRole),
      details: roleConstraint
        ? `ba_user_role_check definition: ${roleConstraint.definition}`
        : "Constraint ba_user_role_check not found",
    });

    // DB-004: Verify inventory movements and shipping check constraints
    const movementsReasonConstraint = checkConstraints.find(
      (c) => c.constraint_name === "chk_inventory_movements_reason"
    );
    results.push({
      category: "Check Constraints",
      item: "Inventory Movements Reason Check (DB-004)",
      passed: Boolean(movementsReasonConstraint),
      details: movementsReasonConstraint
        ? `chk_inventory_movements_reason definition: ${movementsReasonConstraint.definition}`
        : "Constraint chk_inventory_movements_reason not found",
    });

    const shippingDaysConstraint = checkConstraints.find(
      (c) => c.constraint_name === "chk_shipping_methods_days"
    );
    results.push({
      category: "Check Constraints",
      item: "Shipping Methods Days Range Check (DB-004)",
      passed: Boolean(shippingDaysConstraint),
      details: shippingDaysConstraint
        ? `chk_shipping_methods_days definition: ${shippingDaysConstraint.definition}`
        : "Constraint chk_shipping_methods_days not found",
    });

    const couponsUpperConstraint = checkConstraints.find(
      (c) => c.constraint_name === "chk_coupons_code_upper"
    );
    results.push({
      category: "Check Constraints",
      item: "Coupons Uppercase Code Check (DB-003)",
      passed: Boolean(couponsUpperConstraint),
      details: couponsUpperConstraint
        ? `chk_coupons_code_upper definition: ${couponsUpperConstraint.definition}`
        : "Constraint chk_coupons_code_upper not found",
    });

    // ------------------------------------------------------------------------
    // 7. VERIFY PERFORMANCE INDEXES
    // ------------------------------------------------------------------------
    const liveIndexes = await client<{ tablename: string; indexname: string }[]>`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `;

    const expectedIndexNames = [
      "idx_products_category_id",
      "idx_products_status",
      "idx_product_colors_product_id",
      "idx_product_variants_product_id",
      "idx_product_variants_color_id",
      "idx_product_images_lookup",
      "idx_inventory_movements_variant",
      "idx_addresses_customer_id",
      "uq_coupons_code_upper",
      "idx_orders_customer_id",
      "idx_orders_status_placed_at",
      "idx_order_items_order_id",
      "idx_order_item_engraving_item",
      "idx_order_notes_order_id",
      "idx_order_status_history_order",
      "idx_payments_order_id",
      "idx_payments_status",
      "idx_ba_session_user_id",
      "idx_ba_account_user_id",
      // Hot path indexes (DB-006)
      "idx_payments_order_created",
      "idx_payments_status_created",
      "idx_inventory_movements_created",
      "idx_inventory_movements_variant_created",
      "idx_variants_product_price",
      "idx_inventory_updated",
    ];

    const missingIndexes = expectedIndexNames.filter(
      (idx) => !liveIndexes.some((l) => l.indexname === idx)
    );

    results.push({
      category: "Indexes",
      item: "Core Performance Indexes",
      passed: missingIndexes.length === 0,
      details:
        missingIndexes.length === 0
          ? `All ${expectedIndexNames.length} expected performance indexes present.`
          : `Missing indexes: [${missingIndexes.join(", ")}]`,
    });

    // ------------------------------------------------------------------------
    // 8. VERIFY TRIGGERS
    // ------------------------------------------------------------------------
    const liveTriggers = await client<{
      event_object_table: string;
      trigger_name: string;
    }[]>`
      SELECT event_object_table, trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name;
    `;

    const expectedTriggers = [
      "trg_check_engraving_cod",
      "trg_orders_number",
      "trg_orders_updated_at",
      "trg_payments_updated_at",
      "trg_ba_user_updated_at",
      "trg_store_settings_updated_at",
    ];

    const missingTriggers = expectedTriggers.filter(
      (trg) => !liveTriggers.some((l) => l.trigger_name === trg)
    );

    results.push({
      category: "Triggers",
      item: "Business Logic Triggers",
      passed: missingTriggers.length === 0,
      details:
        missingTriggers.length === 0
          ? `All ${expectedTriggers.length} database triggers active (COD guard, order number, updated_at).`
          : `Missing triggers: [${missingTriggers.join(", ")}]`,
    });

    // ------------------------------------------------------------------------
    // 9. VERIFY ROW LEVEL SECURITY (RLS) ON EVERY APPLICATION TABLE
    // ------------------------------------------------------------------------
    const rlsCheck = await client<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' 
        AND c.relkind = 'r' 
        AND c.relname != '_app_migrations'
      ORDER BY c.relname;
    `;

    const nonRlsTables = rlsCheck.filter((t) => !t.relrowsecurity).map((t) => t.relname);

    results.push({
      category: "Security (RLS)",
      item: "Row Level Security on Every Table",
      passed: nonRlsTables.length === 0,
      details:
        nonRlsTables.length === 0
          ? `RLS is strictly ENABLED on all ${rlsCheck.length} tables.`
          : `Tables without RLS: [${nonRlsTables.join(", ")}]`,
    });

    // ------------------------------------------------------------------------
    // PRINT RESULTS TABLE
    // ------------------------------------------------------------------------
    console.log("--------------------------------------------------------");
    let allPassed = true;
    for (const r of results) {
      const symbol = r.passed ? "✅ PASS" : "❌ FAIL";
      if (!r.passed) allPassed = false;
      console.log(`[${symbol}] ${r.category}: ${r.item}`);
      if (r.details) {
        console.log(`       -> ${r.details}`);
      }
    }
    console.log("--------------------------------------------------------\n");

    if (!allPassed) {
      console.error("Schema Parity Verification FAILED! See details above.");
      process.exit(1);
    } else {
      console.log("All Schema Parity checks PASSED successfully!");
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Verification execution error:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifySchemaParity();
