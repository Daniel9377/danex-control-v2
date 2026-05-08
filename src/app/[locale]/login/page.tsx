"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useCurrencies } from "@/hooks/useCurrencies";

type Props = {
  params: Promise<{ locale: string }>;
};

export default function LoginPage({ params }: Props) {
  const t = useTranslations("auth");
  const router = useRouter();
  const { seedIfEmpty } = useCurrencies();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState("fr");

  // Resolve locale from params
  params.then(({ locale: l }) => setLocale(l));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await seedIfEmpty(user.id);
      }

      router.push(`/${locale}/dashboard`);
      router.refresh();
    } catch (err) {
      console.error("[login] unexpected error:", err);
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-orange-500">
          DANEX
        </h1>
        <p className="mt-1 text-sm text-slate-500">Control v2</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-6 text-lg font-semibold text-slate-100">
          {mode === "login" ? t("login") : t("signup")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">
                {t("full_name")}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
                placeholder="Daniel Ngoy"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-slate-400">
              {t("email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">
              {t("password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50"
          >
            {loading
              ? "..."
              : mode === "login"
              ? t("login_button")
              : t("signup_button")}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "login" ? t("no_account") : t("has_account")}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-orange-400 hover:text-orange-300"
          >
            {mode === "login" ? t("signup") : t("login")}
          </button>
        </p>
      </div>
    </div>
  );
}
