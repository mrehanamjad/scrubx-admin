import { db } from "../db/index.ts";
import { getShellSummary } from "../server/services/shell.service.ts";
import { analyticsService, type DashboardPeriod } from "../server/services/analytics.service.ts";
import type { AdminContext } from "../server/types.ts";

const mockStaffAdmin: AdminContext = {
  id: "test-admin-shell",
  email: "admin@scrubx.pk",
  role: "admin",
  name: "Test Admin",
};

const mockCustomer: AdminContext = {
  id: "test-customer",
  email: "customer@example.com",
  role: "customer" as any,
  name: "Customer",
};

async function runTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 📊 ScrubX Batch 9: Dashboard & Shell Correctness Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // Category 1: Shell Summary Service (PERF-001, BUG-034)
    console.log("Category 1: Root Layout Shell Service & Timezone");
    const shellSummary = await getShellSummary(mockStaffAdmin.id);

    assert(typeof shellSummary.stats.pendingOrders === "number", "pendingOrders is a number");
    assert(typeof shellSummary.stats.pendingPayments === "number", "pendingPayments is a number");
    assert(typeof shellSummary.stats.lowStockCount === "number", "lowStockCount is a number");
    assert(typeof shellSummary.stats.todaysRevenue === "number", "todaysRevenue is a number");
    assert(Array.isArray(shellSummary.notifications), "notifications is an array");

    // Null admin returns zeroed default stats gracefully
    const unauthSummary = await getShellSummary(null);
    assert(unauthSummary.stats.pendingOrders === 0, "Unauthenticated request returns 0 pending orders");
    assert(unauthSummary.stats.todaysRevenue === 0, "Unauthenticated request returns 0 revenue");
    assert(unauthSummary.notifications.length === 0, "Unauthenticated request returns empty notifications");

    // Category 2: Dashboard Analytics Multi-Period Aggregations (BUG-027, BUG-028)
    console.log("\nCategory 2: Dashboard Analytics Multi-Period Aggregations");
    const periods: DashboardPeriod[] = ["7d", "30d", "90d", "12m"];
    const expectedBucketCounts: Record<DashboardPeriod, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 13,
      "12m": 12,
    };

    for (const p of periods) {
      const analytics = await analyticsService.getDashboardAnalytics(p, mockStaffAdmin);

      assert(
        analytics.chartData.length === expectedBucketCounts[p],
        `Period '${p}' deterministic chartData buckets count = ${expectedBucketCounts[p]}`
      );
      assert(
        typeof analytics.previousPeriod.currentTotal === "number",
        `Period '${p}' currentTotal is number (${analytics.previousPeriod.currentTotal})`
      );
      assert(
        typeof analytics.previousPeriod.previousTotal === "number",
        `Period '${p}' previousTotal is number (${analytics.previousPeriod.previousTotal})`
      );
      assert(
        typeof analytics.previousPeriod.change === "number" && !isNaN(analytics.previousPeriod.change),
        `Period '${p}' change percentage is valid number (${analytics.previousPeriod.change.toFixed(1)}%)`
      );
      assert(Array.isArray(analytics.statusBreakdown), `Period '${p}' statusBreakdown is array`);
      assert(Array.isArray(analytics.topProducts), `Period '${p}' topProducts is array`);
      assert(
        typeof analytics.metrics.totalRevenue === "number",
        `Period '${p}' metrics.totalRevenue is number (${analytics.metrics.totalRevenue})`
      );
    }

    // Category 3: Role Authorization Enforcement
    console.log("\nCategory 3: Authorization Enforcement");
    let unauthorizedThrown = false;
    try {
      await analyticsService.getDashboardAnalytics("30d", mockCustomer);
    } catch (err: any) {
      unauthorizedThrown = true;
      assert(err.name === "AuthorizationError", "Customer role strictly prohibited from accessing analytics");
    }
    assert(unauthorizedThrown, "Customer role throws AuthorizationError");

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(` Summary: ${passed} Passed, ${failed} Failed`);
    console.log("═══════════════════════════════════════════════════════════\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution encountered unexpected error:", error);
    process.exit(1);
  }
}

runTests();
