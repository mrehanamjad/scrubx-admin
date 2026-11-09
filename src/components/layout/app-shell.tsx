'use client';

import { useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarBrand, SidebarNav } from "./sidebar";
import { MobileNav, Topbar, type LayoutNotification } from "./topbar";
import { formatPKR } from "../../lib/format";
import { Clock } from "lucide-react";
import { RoleProvider } from "../providers/role-provider";

export interface LayoutStats {
  pendingOrders: number;
  pendingPayments: number;
  lowStockCount: number;
  todaysRevenue: number;
}

export function AppShell({
  children,
  layoutStats = { pendingOrders: 0, pendingPayments: 0, lowStockCount: 0, todaysRevenue: 0 },
  notifications = [],
  userRole,
}: {
  children: React.ReactNode;
  layoutStats?: LayoutStats;
  notifications?: LayoutNotification[];
  userRole?: string;
}) {
  const pathname = usePathname() || "";
  const [menuOpen, setMenuOpen] = useState(false);

  // For unauthenticated standalone pages like /login or printable documents like /orders/[id]/print, render without sidebar/topbar shell
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname.endsWith("/print")) {
    return <main className="min-h-screen bg-canvas print:bg-white">{children}</main>;
  }

  return (
    <RoleProvider role={userRole}>
      <div className="flex min-h-screen bg-canvas">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <SidebarBrand />
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            <SidebarNav
              pendingPayments={layoutStats.pendingPayments}
              lowStock={layoutStats.lowStockCount}
              userRole={userRole}
            />
          </div>
          <div className="border-t border-line p-3">
            <div className="rounded-lg border border-brand-100 bg-brand-50/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                <Clock className="h-3.5 w-3.5" />
                Today
              </div>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{formatPKR(layoutStats.todaysRevenue)}</p>
              <p className="text-[11px] text-ink-muted">
                {layoutStats.pendingOrders} order{layoutStats.pendingOrders === 1 ? "" : "s"} awaiting action
              </p>
            </div>
          </div>
        </aside>

        <MobileNav
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          pendingPayments={layoutStats.pendingPayments}
          lowStock={layoutStats.lowStockCount}
          userRole={userRole}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onOpenMenu={() => setMenuOpen(true)}
            notifications={notifications}
          />
          <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1400px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </RoleProvider>
  );
}
