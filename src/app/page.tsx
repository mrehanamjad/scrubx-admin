import type { Metadata } from "next";
import Dashboard from "@/views/Dashboard";
import { orderService } from "@/server/services/order.service";
import { inventoryService } from "@/server/services/inventory.service";
import { analyticsService, type DashboardAnalytics } from "@/server/services/analytics.service";
import { requireStaffContext } from "@/server/auth";
import { toOrderDTO } from "@/lib/dto";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Live performance across orders, revenue and inventory for ScrubX Pakistan.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const query = await searchParams;
  const period = typeof query?.period === "string" ? (query.period as "7d" | "30d" | "90d" | "12m") : "30d";

  let serializedOrders: Order[] = [];
  let analyticsData: DashboardAnalytics | undefined = undefined;
  let totalUnitsInStock = 0;
  let lowStockItems: Array<{
    product: { id: string; name: string };
    variant: { id: string; name: string; sku: string; stock: number; reorderLevel: number; price: number };
  }> = [];

  const admin = await requireStaffContext();

  try {
    // Parallel fetch across all genuine independent backend services (PERF-002 & BUG-034)
    const [analytics, inventorySummary, lowStockItemsResult, recentOrdersResult] = await Promise.all([
      analyticsService.getDashboardAnalytics(period, admin),
      inventoryService.getInventorySummary(admin),
      inventoryService.getInventory(
        {
          status: "low",
          limit: 6,
        },
        admin
      ),
      orderService.getOrders(
        {
          page: 1,
          limit: 5,
          sortBy: "placedAt",
          sortOrder: "desc",
        },
        admin
      ),
    ]);

    analyticsData = analytics;
    totalUnitsInStock = inventorySummary.totalUnitsInStock;
    serializedOrders = recentOrdersResult.items.map(toOrderDTO);

    lowStockItems = lowStockItemsResult.items.map((item) => ({
      product: {
        id: item.product.id,
        name: item.product.name,
      },
      variant: {
        id: item.variant.id,
        name: item.variant.name,
        sku: item.variant.sku,
        stock: item.quantityOnHand,
        reorderLevel: item.reorderLevel,
        price: item.variant.price,
      },
    }));
  } catch (err) {
    console.error("[Dashboard Page Error]: Failed to fetch dashboard data in parallel:", err);
  }

  const initialMetrics = analyticsData
    ? {
        ...analyticsData.metrics,
        totalUnits: totalUnitsInStock,
      }
    : undefined;

  return (
    <Dashboard
      initialOrders={serializedOrders}
      initialPeriod={period}
      initialMetrics={initialMetrics}
      lowStockItems={lowStockItems}
      chartData={analyticsData?.chartData}
      previousPeriod={analyticsData?.previousPeriod}
      statusBreakdown={analyticsData?.statusBreakdown}
      topProducts={analyticsData?.topProducts}
    />
  );
}
