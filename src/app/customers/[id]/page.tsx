import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import CustomerDetailPage from "@/views/CustomerDetail";
import { customerService } from "@/server/services/customer.service";
import { orderService } from "@/server/services/order.service";
import { requireStaffContext } from "@/server/auth";
import { toCustomerDTO, toOrderDTO } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string; limit?: string }>;
}

const getCustomerData = cache(async (id: string) => {
  const admin = await requireStaffContext();
  return customerService.getCustomerById(id, admin);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const customer = await getCustomerData(id);
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Customer";
    return {
      title: `${name} | ScrubX Customers`,
      description: `Customer profile and order history for ${name}.`,
    };
  } catch {
    return {
      title: "Customer Details | ScrubX",
      description: "Customer profile and order history.",
    };
  }
}

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const page = Math.max(1, Number(sp?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp?.limit) || 20));

  const admin = await requireStaffContext();

  let initialCustomer;
  let initialOrders: any[] = [];
  let initialActivityFeed: any[] = [];

  try {
    const [customerBundle, ordersResult, rawActivityFeed] = await Promise.all([
      getCustomerData(id),
      orderService.getOrders(
        {
          page,
          limit,
          sortBy: "placedAt",
          sortOrder: "desc",
          customerId: id,
        },
        admin
      ),
      customerService.getActivityFeed(id, admin, 50),
    ]);

    initialCustomer = toCustomerDTO(customerBundle);
    initialOrders = ordersResult.items.map(toOrderDTO);
    initialActivityFeed = rawActivityFeed.map((ev) => ({
      ...ev,
      occurredAt: ev.occurredAt.toISOString(),
    }));
  } catch (err) {
    console.error(`[Customer Page Error]: Failed to fetch customer ${id}:`, err);
    notFound();
  }

  return (
    <CustomerDetailPage
      id={id}
      initialCustomer={initialCustomer}
      initialOrders={initialOrders}
      initialActivityFeed={initialActivityFeed}
    />
  );
}
