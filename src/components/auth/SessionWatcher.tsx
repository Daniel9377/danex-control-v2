"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { locale: string };

/**
 * Listens to Supabase auth state changes.
 * When the refresh token is invalid (SIGNED_OUT event), cleans the local
 * session and redirects to the login page.
 * Must be rendered inside every authenticated route layout.
 */
export function SessionWatcher({ locale }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string) => {
        if (event === "SIGNED_OUT") {
          // Avoid redirect loop if already on login
          if (!pathnameRef.current.includes("/login")) {
            // Clear any remaining local session data
            try {
              await supabase.auth.signOut({ scope: "local" });
            } catch {
              // already signed out — ignore
            }
            router.replace(`/${locale}/login`);
            router.refresh();
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [locale, router]);

  return null;
}
