'use client';

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Staff Error]:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-line bg-surface p-8 text-center shadow-2xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 mb-4">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-ink">Staff Management Unavailable</h2>
      <p className="mt-1 text-xs text-ink-muted max-w-md">
        An error occurred while loading team accounts. Super Administrator access is strictly required.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-ink-soft">Error Code: {error.digest}</p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => reset()} className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
        <Button size="sm" asChild>
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
