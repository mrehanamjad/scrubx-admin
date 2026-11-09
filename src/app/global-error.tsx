'use client';

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Root Error]:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4 antialiased">
        <div className="flex max-w-md flex-col items-center justify-center rounded-xl border border-line bg-surface p-8 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-ink">System Error</h2>
          <p className="mt-1 text-sm text-ink-muted">
            A critical system error occurred. If this problem persists, please contact a Super Administrator.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-[11.5px] text-ink-muted">
              Reference: {error.digest}
            </p>
          )}
          <div className="mt-6 flex gap-3">
            <Button onClick={() => reset()} variant="default">
              Reload Application
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
