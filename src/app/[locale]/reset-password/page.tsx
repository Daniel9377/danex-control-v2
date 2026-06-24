"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  params: Promise<{ locale: string }>;
};

type PasswordStrength = "weak" | "medium" | "strong";

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return "weak";
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (hasLetter && hasNumber) return "strong";
  return "medium";
}

const strengthColors: Record<PasswordStrength, string> = {
  weak: "bg-red-500",
  medium: "bg-yellow-500",
  strong: "bg-emerald-500",
};

const strengthTextColors: Record<PasswordStrength, string> = {
  weak: "text-red-400",
  medium: "text-yellow-400",
  strong: "text-emerald-400",
};

type Status = "verifying" | "ready" | "invalid" | "done";

export default function ResetPasswordPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("auth");
  const router = useRouter();

  const [status, setStatus] = useState<Status>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The Supabase browser client auto-detects the recovery code in the URL
  // (detectSessionInUrl is on by default) and emits a PASSWORD_RECOVERY event.
  // We also check for an existing session in case the exchange already happened.
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      setStatus("invalid");
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          setStatus("ready");
        }
      }
    );

    // Fallback: if a session already exists (code exchanged before listener
    // attached), allow the form immediately. Otherwise mark invalid after a
    // short grace period so a bad/expired link doesn't hang on "verifying".
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setStatus((s) => (s === "ready" ? s : session ? "ready" : "invalid"));
    }, 2500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const passwordStrength: PasswordStrength | null =
    password.length > 0 ? getPasswordStrength(password) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("password_too_short"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwords_do_not_match"));
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setStatus("done");
      // Sign out the temporary recovery session, then send to login.
      await supabase.auth.signOut();
      setTimeout(() => {
        router.push(`/${locale}/login`);
      }, 2000);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-app)] px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-orange-500">DANEX</h1>
        <p className="mt-1 text-sm text-[var(--text-label)]">Control v2</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6">
        {status === "verifying" && (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">
            {t("reset_verifying")}
          </p>
        )}

        {status === "invalid" && (
          <div className="text-center">
            <div className="mb-3 text-4xl">⚠️</div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">
              {t("reset_invalid_title")}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{t("reset_invalid_message")}</p>
            <button
              onClick={() => router.push(`/${locale}/login`)}
              className="mt-5 text-sm text-orange-400 hover:text-orange-300"
            >
              ← {t("login")}
            </button>
          </div>
        )}

        {status === "done" && (
          <div className="text-center">
            <div className="mb-3 text-4xl">✅</div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">
              {t("reset_success_title")}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{t("reset_success_message")}</p>
          </div>
        )}

        {status === "ready" && (
          <>
            <h2 className="mb-6 text-lg font-semibold text-[var(--text-strong)]">
              {t("reset_set_new_title")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[var(--text-muted)]">
                  {t("new_password")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-chip)] px-3 py-2.5 pr-10 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-orange-500 focus:outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? t("hide_password") : t("show_password")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-label)] hover:text-[var(--text-body)]"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {passwordStrength && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex flex-1 gap-0.5">
                      <div className={`h-1 flex-1 rounded-full ${passwordStrength !== "weak" ? strengthColors[passwordStrength] : "bg-[var(--border-strong)]"}`} />
                      <div className={`h-1 flex-1 rounded-full ${passwordStrength === "strong" ? strengthColors.strong : passwordStrength === "medium" ? strengthColors.medium : "bg-[var(--border-strong)]"}`} />
                      <div className={`h-1 flex-1 rounded-full ${passwordStrength === "strong" ? strengthColors.strong : "bg-[var(--border-strong)]"}`} />
                    </div>
                    <span className={`shrink-0 text-xs ${strengthTextColors[passwordStrength]}`}>
                      {t(`password_strength_${passwordStrength}`)}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-[var(--text-muted)]">
                  {t("confirm_password")}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-chip)] px-3 py-2.5 pr-10 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-orange-500 focus:outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? t("hide_password") : t("show_password")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-label)] hover:text-[var(--text-body)]"
                  >
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
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
                {loading ? "..." : t("update_password_button")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
