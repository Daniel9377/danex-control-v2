"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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
  BarChart2,
  Download,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type NavItem = { navKey: string; href: string; icon: LucideIcon };
type NavGroup = { labelKey: string | null; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    labelKey: null,
    items: [
      { navKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { navKey: "accounts", href: "/accounts", icon: Wallet },
      { navKey: "transactions", href: "/transactions", icon: Receipt },
    ],
  },
  {
    labelKey: "group_business",
    items: [
      { navKey: "clients", href: "/clients", icon: Users },
      { navKey: "orders", href: "/orders", icon: ShoppingBag },
      { navKey: "debts", href: "/debts", icon: HandCoins },
      { navKey: "transfers", href: "/transfers", icon: ArrowLeftRight },
    ],
  },
  {
    labelKey: "group_tools",
    items: [
      { navKey: "reports", href: "/reports", icon: BarChart2 },
      { navKey: "export", href: "/export", icon: Download },
      { navKey: "legacy", href: "/legacy", icon: Tag },
    ],
  },
];

const bottomItems: NavItem[] = [
  { navKey: "alerts", href: "/alerts", icon: Bell },
  { navKey: "settings", href: "/settings", icon: Settings },
];

type Props = {
  locale: string;
  onClose?: () => void;
};

export function Sidebar({ locale, onClose }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  const renderItem = ({ navKey, href, icon: Icon }: NavItem) => {
    const fullHref = `/${locale}${href}`;
    const isActive =
      pathname === fullHref ||
      (href !== "/dashboard" && pathname.startsWith(fullHref));
    return (
      <li key={navKey}>
        <Link
          href={fullHref}
          prefetch={true}
          onClick={() => {
            if (!isActive) setNavigating(true);
            onClose?.();
          }}
          className={cn(
            "relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
            isActive
              ? "bg-slate-800/70 text-slate-100 before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:w-0.5 before:rounded-full before:bg-orange-500 before:content-['']"
              : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
          )}
        >
          <Icon size={18} className="shrink-0" />
          <span>{t(navKey as Parameters<typeof t>[0])}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav className="relative flex h-full flex-col">
      {navigating && (
        <div className="absolute left-0 top-0 z-10 h-0.5 w-full overflow-hidden">
          <div className="h-full animate-[progress_1.5s_ease-in-out_infinite] bg-orange-500" />
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-5">
        <span className="text-lg font-bold tracking-tight text-orange-500">DANEX</span>
        {onClose && (
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg p-1 text-slate-400 hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-2">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.labelKey && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                {t(group.labelKey as Parameters<typeof t>[0])}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(renderItem)}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800/60 px-2 pb-2 pt-2">
        <ul className="space-y-0.5">
          {bottomItems.map(renderItem)}
        </ul>
      </div>

      <div className="px-4 py-3 text-xs text-slate-600">v2.0</div>
    </nav>
  );
}
