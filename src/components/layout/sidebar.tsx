'use client';

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  Boxes,
  CreditCard,
  FolderTree,
  LayoutDashboard,
  Package,
  PenTool,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { can } from "../../lib/permissions";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  end?: boolean;
}

export function SidebarNav({
  onNavigate,
  pendingPayments = 0,
  lowStock = 0,
  userRole,
}: {
  onNavigate?: () => void;
  pendingPayments?: number;
  lowStock?: number;
  userRole?: string;
}) {
  const pathname = usePathname() || "";

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: "Overview",
      items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
    },
    {
      title: "Catalogue",
      items: [
        { to: "/products", label: "Products", icon: Package },
        { to: "/categories", label: "Categories", icon: FolderTree },
        { to: "/inventory", label: "Inventory", icon: Boxes, badge: lowStock },
      ],
    },
    {
      title: "Sales",
      items: [
        { to: "/orders", label: "Orders", icon: ShoppingBag },
        { to: "/payments", label: "Payment Verification", icon: CreditCard, badge: pendingPayments },
        { to: "/customers", label: "Customers", icon: Users },
        { to: "/coupons", label: "Coupons", icon: BadgePercent },
      ],
    },
    {
      title: "Configuration",
      items: [
        { to: "/payment-methods", label: "Payment Methods", icon: Wallet },
        { to: "/engraving", label: "Engraving Options", icon: PenTool },
        { to: "/shipping", label: "Shipping", icon: Truck },
        ...(userRole === "super_admin"
          ? [{ to: "/staff", label: "Staff Team", icon: ShieldCheck }]
          : []),
        ...(can(userRole, "settings:write")
          ? [{ to: "/settings", label: "Store Settings", icon: Settings }]
          : []),
      ],
    },
  ];

  return (
    <nav className="flex flex-col gap-5 px-3 pb-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const isActive = item.end
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(`${item.to}/`);

              return (
                <li key={item.to}>
                  <Link
                    href={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-soft hover:bg-surface-muted hover:text-ink",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive ? "text-brand-600" : "text-ink-muted group-hover:text-ink-soft",
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 tabular">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <Image
        src="/brand/logo-mark.png"
        alt="ScrubX"
        width={32}
        height={32}
        className="h-8 w-8 rounded-lg"
      />
      <div className="leading-tight">
        <p className="font-display text-[15px] font-bold tracking-tight text-ink">ScrubX</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">Admin</p>
      </div>
    </div>
  );
}
