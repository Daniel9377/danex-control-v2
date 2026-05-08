"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Receipt,
  Users,
  ShoppingBag,
  Bell,
  Settings,
  HandCoins,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "accounts", href: "/accounts", icon: Wallet },
  { key: "transactions", href: "/transactions", icon: Receipt },
  { key: "transfers", href: "/transfers", icon: ArrowLeftRight },
  { key: "debts", href: "/debts", icon: HandCoins },
  { key: "clients", href: "/clients", icon: Users },
  { key: "orders", href: "/orders", icon: ShoppingBag },
  { key: "alerts", href: "/alerts", icon: Bell },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

type Props = {
  locale: string;
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ locale, open, onClose }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const sidebarContent = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-5">
        <span className="text-lg font-bold tracking-tight text-orange-500">
          DANEX
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <ul className="flex-1 space-y-0.5 px-2">
        {navItems.map(({ key, href, icon: Icon }) => {
          const fullHref = `/${locale}${href}`;
          const isActive =
            pathname === fullHref ||
            (href !== "/dashboard" && pathname.startsWith(fullHref));
          return (
            <li key={key}>
              <Link
                href={fullHref}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-orange-600/20 text-orange-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span>{t(key as keyof typeof t)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-4 text-xs text-slate-600">v2.0</div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-56 shrink-0 border-r border-slate-800 bg-slate-950 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <aside className="relative z-50 h-full w-56 border-r border-slate-800 bg-slate-950">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
