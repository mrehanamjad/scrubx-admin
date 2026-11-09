import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentAdmin } from "@/server/auth";
import { getShellSummary } from "@/server/services/shell.service";

export const runtime = "nodejs";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | ScrubX Admin",
    default: "ScrubX Admin — Medical Apparel Storefront",
  },
  description:
    "ScrubX admin panel — manage medical scrubs, lab coats and accessories across Pakistan.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let layoutStats = {
    pendingOrders: 0,
    pendingPayments: 0,
    lowStockCount: 0,
    todaysRevenue: 0,
  };
  let notifications: Array<{ id: string; title: string; body: string; at: string; to: string }> = [];
  let userRole: string | undefined;

  try {
    const admin = await getCurrentAdmin();
    if (admin) {
      userRole = admin.role;
      const summary = await getShellSummary(admin.id);
      layoutStats = summary.stats;
      notifications = summary.notifications;
    }
  } catch (err) {
    console.error("[Root Layout Error]: Failed to resolve admin session / shell summary:", err);
  }

  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <Providers>
          <AppShell
            layoutStats={layoutStats}
            notifications={notifications}
            userRole={userRole}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
