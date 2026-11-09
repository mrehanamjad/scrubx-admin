import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import OrderDetailPage from "@/views/OrderDetail";
import { orderService } from "@/server/services/order.service";
import { requireStaffContext } from "@/server/auth";
import { toOrderDTO } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const getOrderData = cache(async (id: string) => {
  const admin = await requireStaffContext();
  return orderService.getOrderById(id, admin);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const order = await getOrderData(id);
    return {
      title: `${order.orderNumber} | ScrubX Orders`,
      description: `Fulfilment and status for order ${order.orderNumber}.`,
    };
  } catch {
    return {
      title: "Order Details | ScrubX",
      description: "Order fulfilment and payment proof details.",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  let initialOrder;
  let initialReturns: any[] = [];

  try {
    const admin = await requireStaffContext();
    const orderBundle = await getOrderData(id);
    initialOrder = toOrderDTO(orderBundle);
    const rawReturns = await orderService.getOrderReturns(id, admin);
    initialReturns = rawReturns.map((r) => ({
      ...r,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
    }));
  } catch (err) {
    console.error(`[Order Page Error]: Failed to fetch order ${id}:`, err);
    notFound();
  }

  return <OrderDetailPage id={id} initialOrder={initialOrder} initialReturns={initialReturns} />;
}
