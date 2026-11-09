'use client';

import Link from "next/link";
import { ArrowLeft, Printer, FileText, Package } from "lucide-react";

export function PrintControls({
  orderId,
  docType,
}: {
  orderId: string;
  docType: "invoice" | "packing-slip";
}) {
  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-between border-b border-gray-200 bg-white/95 px-6 py-3.5 backdrop-blur shadow-xs">
      <div className="flex items-center gap-4">
        <Link
          href={`/orders/${orderId}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Order
        </Link>
        <span className="text-gray-300">|</span>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          <Link
            href={`/orders/${orderId}/print?doc=invoice`}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              docType === "invoice"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Tax Invoice
          </Link>
          <Link
            href={`/orders/${orderId}/print?doc=packing-slip`}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              docType === "packing-slip"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            Packing Slip
          </Link>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
      >
        <Printer className="h-4 w-4" />
        Print Document
      </button>
    </div>
  );
}
