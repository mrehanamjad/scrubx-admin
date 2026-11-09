import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { orderService } from "@/server/services/order.service";
import { settingsService } from "@/server/services/settings.service";
import { requireStaffContext } from "@/server/auth";
import { toOrderDTO } from "@/lib/dto";
import { formatPKR, formatDate, formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { PrintControls } from "./print-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; includeInternalNotes?: string }>;
}

export async function generateMetadata({ params }: PrintPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Print Document — ${id}`,
  };
}

export default async function OrderPrintPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const docType = sp.doc === "packing-slip" ? "packing-slip" : "invoice";
  const includeInternalNotes = sp.includeInternalNotes === "true";

  let order;
  let orderBundle;
  let storeSettings: Record<string, string> = {};

  try {
    const admin = await requireStaffContext();
    orderBundle = await orderService.getOrderById(id, admin);
    order = toOrderDTO(orderBundle);

    try {
      storeSettings = (await settingsService.getAllSettings(admin)) as Record<string, string>;
    } catch {
      // Non-fatal if settings fail
    }
  } catch (err) {
    console.error(`[Print Page Error]: Failed to load order ${id}:`, err);
    notFound();
  }

  const storeName = storeSettings["store_name"] || "ScrubX Pakistan";
  const storePhone = storeSettings["store_phone"] || "+92 300 1234567";
  const storeEmail = storeSettings["store_email"] || "support@scrubx.pk";
  const storeAddress = storeSettings["store_address"] || "Karachi, Pakistan";
  const storeNtn = storeSettings["store_ntn"] || "NTN-4920194-7";

  return (
    <div className="min-h-screen bg-white text-black text-[13px] leading-relaxed antialiased">
      <PrintControls orderId={id} docType={docType} />

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[800px] p-8 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{storeName}</h1>
            <p className="text-xs text-gray-600 mt-1">{storeAddress}</p>
            <p className="text-xs text-gray-600">Phone: {storePhone} · Email: {storeEmail}</p>
            {storeNtn && <p className="text-xs text-gray-600 font-mono">NTN: {storeNtn}</p>}
          </div>
          <div className="text-right">
            <span className="inline-block rounded border border-black px-3 py-1 text-sm font-bold uppercase tracking-wider">
              {docType === "invoice" ? "Official Tax Invoice" : "Warehouse Packing Slip"}
            </span>
            <p className="mt-2 text-base font-bold font-mono">{order.orderNumber}</p>
            <p className="text-xs text-gray-600">Date: {formatDate(order.date)}</p>
          </div>
        </div>

        {/* Addresses / Summary Grid */}
        <div className="mt-6 grid grid-cols-2 gap-8 rounded border border-gray-300 p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              {docType === "invoice" ? "Billed / Shipped To:" : "Ship To Customer:"}
            </p>
            <p className="mt-1 font-semibold text-sm">{order.customerName}</p>
            <p className="text-xs text-gray-700">{order.customerEmail}</p>
            <p className="text-xs text-gray-700">{order.customerPhone}</p>
            <p className="mt-2 text-xs text-gray-800 leading-snug">
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.province || "Pakistan"}
            </p>
          </div>

          <div className="space-y-1 text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Order Details:
            </p>
            <p>
              <span className="font-semibold text-gray-600">Order ID:</span>{" "}
              <span className="font-mono">{order.id}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-600">Order Status:</span>{" "}
              <span className="font-medium capitalize">{ORDER_STATUS_LABEL[order.status] || order.status}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-600">Payment Method:</span>{" "}
              <span>{order.paymentMethodName || PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-600">Payment Status:</span>{" "}
              <span className="font-medium uppercase">{order.paymentStatus}</span>
            </p>
            {order.courier && (
              <p>
                <span className="font-semibold text-gray-600">Courier:</span>{" "}
                <span>{order.courier}</span>
              </p>
            )}
            {order.trackingNumber && (
              <p>
                <span className="font-semibold text-gray-600">Tracking Number:</span>{" "}
                <span className="font-mono font-medium">{order.trackingNumber}</span>
              </p>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="mt-6">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b-2 border-black bg-gray-100">
                <th className="py-2.5 px-3 font-bold uppercase tracking-wider">#</th>
                <th className="py-2.5 px-3 font-bold uppercase tracking-wider">Item & Specifications</th>
                <th className="py-2.5 px-3 font-bold uppercase tracking-wider">SKU</th>
                <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-center">Qty</th>
                {docType === "invoice" && (
                  <>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-right">Unit Price</th>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-right">Line Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {order.items.map((item, idx) => (
                <tr key={item.id} className="print-break-inside-avoid">
                  <td className="py-3 px-3 text-gray-500 font-mono">{idx + 1}</td>
                  <td className="py-3 px-3">
                    <p className="font-bold text-gray-900">{item.productName}</p>
                    <p className="text-[11.5px] text-gray-600">
                      Color: {item.colorName || "Standard"} · Size: {item.size || "M"}
                    </p>
                    {item.engraving && (
                      <div className="mt-1 rounded bg-gray-50 border border-gray-200 p-2 text-[11px]">
                        <span className="font-bold uppercase tracking-wide text-purple-900">
                          {item.engraving.type === "logo" ? "Custom Logo Embroidery" : "Custom Name Engraving"}
                        </span>
                        {item.engraving.text && (
                          <p className="mt-0.5 font-semibold text-gray-900">
                            Text: &ldquo;{item.engraving.text}&rdquo;
                          </p>
                        )}
                        {item.engraving.logoUrl && (
                          <p className="mt-0.5 text-gray-600 font-mono text-[10px] break-all">
                            Artwork File: {item.engraving.logoUrl}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono text-gray-600">{item.sku}</td>
                  <td className="py-3 px-3 text-center font-bold text-sm">{item.quantity}</td>
                  {docType === "invoice" && (
                    <>
                      <td className="py-3 px-3 text-right font-mono">{formatPKR(item.price)}</td>
                      <td className="py-3 px-3 text-right font-bold font-mono">
                        {formatPKR(item.price * item.quantity)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary (Invoice Only) */}
        {docType === "invoice" && (
          <div className="mt-6 flex justify-end print-break-inside-avoid">
            <div className="w-72 space-y-2 rounded border border-gray-300 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-mono">{formatPKR(order.subtotal)}</span>
              </div>
              {order.engravingCharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Engraving / Embroidery:</span>
                  <span className="font-mono">{formatPKR(order.engravingCharges)}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span className="font-mono">-{formatPKR(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping Charges:</span>
                <span className="font-mono">{formatPKR(order.shipping)}</span>
              </div>
              <div className="border-t border-black pt-2 flex justify-between font-bold text-sm">
                <span>Total Amount:</span>
                <span className="font-mono">{formatPKR(order.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Packing Slip Check-off block (Packing Slip Only) */}
        {docType === "packing-slip" && (
          <div className="mt-8 border-t-2 border-black pt-6 print-break-inside-avoid">
            {includeInternalNotes && order.internalNotes && order.internalNotes.length > 0 && (
              <div className="mb-6 rounded border border-amber-300 bg-amber-50/50 p-3 text-xs">
                <p className="font-bold uppercase text-amber-900 mb-1">Internal Fulfilment Notes:</p>
                {order.internalNotes.map((n, i) => (
                  <p key={i} className="text-gray-800">· {n.text || (n as any).body}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-6 text-xs">
              <div>
                <p className="font-semibold text-gray-700">Packed By (Sign & Date):</p>
                <div className="mt-6 border-b border-black"></div>
              </div>
              <div>
                <p className="font-semibold text-gray-700">QC Verified By (Sign & Date):</p>
                <div className="mt-6 border-b border-black"></div>
              </div>
              <div>
                <p className="font-semibold text-gray-700">Dispatched Date & Time:</p>
                <div className="mt-6 border-b border-black"></div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Notes */}
        <div className="mt-10 border-t border-gray-200 pt-4 text-center text-[11px] text-gray-500 print-break-inside-avoid">
          <p>
            {docType === "invoice"
              ? "Thank you for choosing ScrubX. For support or returns within 14 days, contact support@scrubx.pk or call +92 300 1234567."
              : "ScrubX Pakistan · Warehouse Fulfilment Slip · Confidential Internal Document."}
          </p>
        </div>
      </div>
    </div>
  );
}
