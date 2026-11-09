import type { Metadata } from "next";
import SettingsPage from "@/views/Settings";
import { settingsService } from "@/server/services/settings.service";
import { shippingService } from "@/server/services/shipping.service";
import { requireSuperAdminContext } from "@/server/auth";
import { db } from "@/db";
import { products, customers, orders } from "@/db/schema";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Store Settings",
  description: "General configuration for store contact info, currency, tax, and order notifications.",
};

export default async function Page() {
  const admin = await requireSuperAdminContext();

  let initialSettings = {
    storeName: "ScrubX Pakistan",
    tagline: "Medical Scrubs & Professional Uniforms",
    supportEmail: "support@scrubx.pk",
    supportPhone: "+92 42 35789000",
    whatsapp: "+92 300 1234567",
    address: "Building 14-B, Sector C, DHA Phase 5",
    city: "Lahore",
    province: "Punjab",
    postcode: "54000",
    paymentDeadlineHours: 24,
    defaultShippingMethodId: undefined as string | undefined,
    orderConfirmationAuto: true,
    lowStockAlerts: true,
    newOrderEmail: true,
    newOrderWhatsapp: true,
    paymentSubmittedAlert: true,
    dailySummary: false,
  };
  let simpleShippingMethods: Array<{ id: string; name: string }> = [];
  let counts = {
    products: 0,
    customers: 0,
    orders: 0,
  };

  try {
    const [settings, shippingMethods, [pCount], [cCount], [oCount]] = await Promise.all([
      settingsService.getAllSettings(admin),
      shippingService.getShippingMethods({}, admin),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(products),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(customers),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(orders),
    ]);

    initialSettings = {
      storeName: settings.store_name ?? "ScrubX Pakistan",
      tagline: settings.tagline ?? "Medical Scrubs & Professional Uniforms",
      supportEmail: settings.support_email ?? "support@scrubx.pk",
      supportPhone: settings.support_phone ?? "+92 42 35789000",
      whatsapp: settings.whatsapp_number ?? "+92 300 1234567",
      address: settings.address ?? "Building 14-B, Sector C, DHA Phase 5",
      city: settings.city ?? "Lahore",
      province: settings.province ?? "Punjab",
      postcode: settings.postal_code ?? "54000",
      paymentDeadlineHours: settings.payment_deadline_hours ?? 24,
      defaultShippingMethodId: settings.default_shipping_method_id,
      orderConfirmationAuto: settings.order_confirmation_auto ?? true,
      lowStockAlerts: settings.low_stock_alerts ?? true,
      newOrderEmail: settings.new_order_email ?? true,
      newOrderWhatsapp: settings.new_order_whatsapp ?? true,
      paymentSubmittedAlert: settings.payment_submitted_alert ?? true,
      dailySummary: settings.daily_summary ?? false,
    };

    simpleShippingMethods = shippingMethods.map((m) => ({
      id: m.id,
      name: m.name,
    }));

    counts = {
      products: pCount?.count ?? 0,
      customers: cCount?.count ?? 0,
      orders: oCount?.count ?? 0,
    };
  } catch (err) {
    console.error("[Settings Page Error]: Failed to fetch settings data:", err);
  }

  return (
    <SettingsPage
      initialSettings={initialSettings}
      shippingMethods={simpleShippingMethods}
      counts={counts}
    />
  );
}
