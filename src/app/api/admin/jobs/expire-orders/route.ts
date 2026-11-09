import { NextRequest, NextResponse } from "next/server";
import { orderService } from "@/server/services/order.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ECOM-001: Background job endpoint to expire unpaid orders past their deadline.
 * Secured via CRON_SECRET authorization header.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : cronSecretHeader;

  if (!expectedSecret || token !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing cron secret" },
      { status: 401 }
    );
  }

  try {
    const result = await orderService.expireUnpaidOrders();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    console.error("[Cron Expire Orders Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process unpaid order expiration" },
      { status: 500 }
    );
  }
}
