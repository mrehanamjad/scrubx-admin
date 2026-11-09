import type { Metadata } from "next";
import OrdersPage from "@/views/Orders";
import { orderService } from "@/server/services/order.service";
import { requireStaffContext } from "@/server/auth";
import { toOrderDTO } from "@/lib/dto";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders",
  description: "Manage orders, payment verifications, and order fulfilment across Pakistan.",
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    status?: string;
    paymentStatus?: string;
    q?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function Page({ searchParams }: PageProps) {
  const admin = await requireStaffContext();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp?.limit) || 20));

  let initialOrders: Order[] = [];
  let deliveredThisMonthCount = 0;
  let pagination = {
    totalItems: 0,
    totalPages: 1,
    currentPage: page,
    limit,
  };

  try {
    const [ordersResult, deliveredCount] = await Promise.all([
      orderService.getOrders(
        {
          page,
          limit,
          status: (sp?.status as any) || undefined,
          paymentStatus: (sp?.paymentStatus as any) || undefined,
          q: typeof sp?.q === "string" ? sp.q : undefined,
          sortBy: (sp?.sortBy as any) || "placedAt",
          sortOrder: sp?.sortOrder === "asc" ? "asc" : "desc",
        },
        admin
      ),
      orderService.getDeliveredThisMonthCount(admin).catch((err) => {
        console.error("[Orders Page]: Failed to fetch delivered count:", err);
        return 0;
      }),
    ]);

    initialOrders = ordersResult.items.map(toOrderDTO);
    deliveredThisMonthCount = deliveredCount;
    pagination = {
      totalItems: ordersResult.pagination.totalItems,
      totalPages: ordersResult.pagination.totalPages,
      currentPage: ordersResult.pagination.page,
      limit: ordersResult.pagination.limit,
    };
  } catch (err) {
    console.error("[Orders Page Error]: Failed to fetch orders:", err);
  }

  return (
    <OrdersPage
      initialOrders={initialOrders}
      initialPagination={pagination}
      initialQuery={sp?.q ?? ""}
      deliveredThisMonthCount={deliveredThisMonthCount}
    />
  );
}
