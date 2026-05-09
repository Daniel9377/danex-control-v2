"use client";

import { Menu, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Props = {
  onMenuClick: () => void;
  locale: string;
};

export function TopBar({ onMenuClick, locale }: Props) {
  const t = useTranslations("auth");
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-950 px-4">
      {/* Hamburger: visible only on mobile via CSS — no hydration dependency */}
      <button
        onClick={onMenuClick}
        className="md:hidden min-h-[44px] min-w-[44px] rounded-lg p-2 text-slate-400 hover:bg-slate-800"
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>
      <span className="text-sm font-bold tracking-tight text-orange-500 md:hidden">
        DANEX
      </span>
      <div className="ml-auto">
        <button
          onClick={handleLogout}
          className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">{t("logout")}</span>
        </button>
      </div>
    </header>
  );
}
