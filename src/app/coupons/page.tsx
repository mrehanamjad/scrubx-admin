import type { Metadata } from "next";
import CouponsPage from "@/views/Coupons";
import { couponService } from "@/server/services/coupon.service";
import { requireStaffContext } from "@/server/auth";
import { toCouponDTO } from "@/lib/dto";
import type { Coupon } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coupons",
  description: "Create and manage promotional voucher codes, minimum spends, and usage limits.",
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    status?: string;
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

  let initialCoupons: Coupon[] = [];
  let pagination = {
    totalItems: 0,
    totalPages: 1,
    currentPage: page,
    limit,
  };

  try {
    const couponsResult = await couponService.getCoupons(
      {
        page,
        limit,
        sortBy: (sp?.sortBy as any) || "createdAt",
        sortOrder: sp?.sortOrder === "asc" ? "asc" : "desc",
        status: (sp?.status as any) || "all",
        q: typeof sp?.q === "string" ? sp.q : undefined,
      },
      admin
    );

    initialCoupons = couponsResult.items.map(toCouponDTO);
    pagination = {
      totalItems: couponsResult.pagination.totalItems,
      totalPages: couponsResult.pagination.totalPages,
      currentPage: couponsResult.pagination.page,
      limit: couponsResult.pagination.limit,
    };
  } catch (err) {
    console.error("[Coupons Page Error]: Failed to fetch coupons:", err);
  }

  return <CouponsPage initialCoupons={initialCoupons} initialPagination={pagination} />;
}
