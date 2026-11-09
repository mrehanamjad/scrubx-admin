import type { Metadata } from "next";
import CustomersPage from "@/views/Customers";
import { customerService } from "@/server/services/customer.service";
import { requireStaffContext } from "@/server/auth";
import { toCustomerDTO } from "@/lib/dto";
import type { Customer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers",
  description: "View customer profiles, order histories, and lifetime spend across Pakistan.",
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    q?: string;
    isRegistered?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function Page({ searchParams }: PageProps) {
  const admin = await requireStaffContext();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp?.limit) || 20));

  let initialCustomers: Customer[] = [];
  const initialCustomerStats: Record<string, { orders: number; spend: number }> = {};
  let registeredCount = 0;
  let totalSpend = 0;
  let guestCount = 0;
  let pagination = {
    totalItems: 0,
    totalPages: 1,
    currentPage: page,
    limit,
  };

  try {
    const customersResult = await customerService.getCustomers(
      {
        page,
        limit,
        q: typeof sp?.q === "string" ? sp.q : undefined,
        isRegistered: sp?.isRegistered !== undefined ? sp.isRegistered === "true" : undefined,
        sortBy: (sp?.sortBy as any) || "createdAt",
        sortOrder: sp?.sortOrder === "asc" ? "asc" : "desc",
      },
      admin
    );

    initialCustomers = customersResult.items.map(toCustomerDTO);
    pagination = {
      totalItems: customersResult.pagination.totalItems,
      totalPages: customersResult.pagination.totalPages,
      currentPage: customersResult.pagination.page,
      limit: customersResult.pagination.limit,
    };
    customersResult.items.forEach((c) => {
      initialCustomerStats[c.id] = {
        orders: c.ordersCount,
        spend: c.totalSpend,
      };
      if (c.isRegistered) registeredCount += 1;
      totalSpend += c.totalSpend;
    });

    guestCount = customersResult.items.length - registeredCount;
  } catch (err) {
    console.error("[Customers Page Error]: Failed to fetch customers:", err);
  }

  return (
    <CustomersPage
      initialCustomers={initialCustomers}
      initialCustomerStats={initialCustomerStats}
      initialRegisteredCount={registeredCount}
      initialGuestCount={guestCount}
      initialLifetimeValue={totalSpend}
      initialPagination={pagination}
      initialQuery={sp?.q ?? ""}
    />
  );
}
