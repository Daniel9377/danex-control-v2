"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type Props = {
  children: React.ReactNode;
  locale: string;
};

export function PageWrapper({ children, locale }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/${locale}/login`);
      }
    }
    checkAuth();
  }, [locale, router]);

  return (
    <div className="danex-bg flex h-screen overflow-hidden">
      {/* Permanent sidebar: hidden on mobile, visible on md+ via CSS (no hydration flash) */}
      <aside className="hidden md:flex h-screen w-56 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-app)]">
        <Sidebar locale={locale} />
      </aside>

      {/* Mobile: overlay sidebar toggled by hamburger */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-50 h-full w-56 border-r border-[var(--border-default)] bg-[var(--bg-app)]">
            <Sidebar locale={locale} onClose={() => setMobileSidebarOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setMobileSidebarOpen(true)}
          locale={locale}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
