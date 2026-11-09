'use client';

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function OrderDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Order detail error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-line bg-surface p-8 text-center shadow-xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-ink">Failed to load order</h2>
      <p className="mt-1 max-w-md text-sm text-ink-muted">
        An error occurred while fetching order details. You can try refreshing or return to the orders list.
      </p>
      {error.digest && (
        <p className="mt-1.5 font-mono text-[11.5px] text-ink-muted">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => reset()} variant="default">
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/orders">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Orders
          </Link>
        </Button>
      </div>
    </div>
  );
}
