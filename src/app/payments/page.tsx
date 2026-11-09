import type { Metadata } from "next";
import PaymentsPage from "@/views/Payments";
import { paymentService } from "@/server/services/payment.service";
import { requireStaffContext } from "@/server/auth";
import { toPaymentSubmissionDTO } from "@/lib/dto";
import type { PaymentSubmission } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment Verification",
  description: "Review screenshot payment proofs for JazzCash, EasyPaisa, and Bank Transfers.",
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

  let initialSubmissions: PaymentSubmission[] = [];
  let pagination = {
    totalItems: 0,
    totalPages: 1,
    currentPage: page,
    limit,
  };

  try {
    const paymentsResult = await paymentService.getPayments(
      {
        page,
        limit,
        status: (sp?.status as any) || undefined,
        q: typeof sp?.q === "string" ? sp.q : undefined,
        sortBy: (sp?.sortBy as any) || "createdAt",
        sortOrder: sp?.sortOrder === "asc" ? "asc" : "desc",
      },
      admin
    );

    initialSubmissions = paymentsResult.items.map((p) => toPaymentSubmissionDTO(p));
    pagination = {
      totalItems: paymentsResult.pagination.totalItems,
      totalPages: paymentsResult.pagination.totalPages,
      currentPage: paymentsResult.pagination.page,
      limit: paymentsResult.pagination.limit,
    };
  } catch (err) {
    console.error("[Payments Page Error]: Failed to fetch payments:", err);
  }

  return (
    <PaymentsPage
      initialSubmissions={initialSubmissions}
      initialPagination={pagination}
    />
  );
}
