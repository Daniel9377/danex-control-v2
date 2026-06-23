"use client";

import { useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrencies } from "@/hooks/useCurrencies";

type Props = {
  params: Promise<{ locale: string }>;
};

type PasswordStrength = "weak" | "medium" | "strong";

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "th", label: "ไทย" },
  { code: "pt", label: "Português" },
];

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

export default function LoginPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("auth");
  const router = useRouter();
  const { seedIfEmpty } = useCurrencies();

  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const passwordStrength: PasswordStrength | null =
    mode === "signup" && password.length > 0
      ? getPasswordStrength(password)
      : null;

  function handleLanguageChange(newLocale: string) {
    window.location.href = `/${newLocale}/login`;
  }

  function switchMode() {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function goToForgot() {
    setMode("forgot");
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function backToLogin() {
    setMode("login");
    setError(null);
    setResetSent(false);
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${locale}/reset-password`,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setResetSent(true);
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (password.length < 8) {
        setError(t("password_too_short"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("passwords_do_not_match"));
        return;
      }
    }

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
        // Check if user got a session (email confirmation disabled) or needs to verify email
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setEmailSent(true);
          setLoading(false);
          return;
        }
        if (session.user) {
          await seedIfEmpty(session.user.id);
        }
        router.push(`/${locale}/dashboard`);
        router.refresh();
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await seedIfEmpty(user.id);
      }

      router.push(`/${locale}/dashboard`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-orange-500">DANEX</h1>
          <p className="mt-1 text-sm text-slate-500">Control v2</p>
        </div>
        <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="mb-3 text-4xl">✉️</div>
          <h2 className="mb-2 text-lg font-semibold text-slate-100">
            {t("check_email_title")}
          </h2>
          <p className="text-sm text-slate-400">{t("check_email_message")}</p>
          <button
            onClick={() => { setEmailSent(false); setMode("login"); }}
            className="mt-5 text-sm text-orange-400 hover:text-orange-300"
          >
            ← {t("login")}
          </button>
        </div>
      </div>
    );
  }

  if (resetSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-orange-500">DANEX</h1>
          <p className="mt-1 text-sm text-slate-500">Control v2</p>
        </div>
        <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="mb-3 text-4xl">✉️</div>
          <h2 className="mb-2 text-lg font-semibold text-slate-100">
            {t("reset_link_sent_title")}
          </h2>
          <p className="text-sm text-slate-400">{t("reset_link_sent_message")}</p>
          <button
            onClick={backToLogin}
            className="mt-5 text-sm text-orange-400 hover:text-orange-300"
          >
            ← {t("login")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-orange-500">DANEX</h1>
        <p className="mt-1 text-sm text-slate-500">Control v2</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
        {/* Header: title + language selector */}
        <div className="mb-6 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-100">
            {mode === "login"
              ? t("login")
              : mode === "signup"
              ? t("signup")
              : t("reset_title")}
          </h2>
          <select
            value={locale}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:border-orange-500 focus:outline-none"
            aria-label={t("choose_language")}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {mode === "forgot" ? (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <p className="text-sm text-slate-400">{t("reset_subtitle")}</p>
            <div>
              <label className="mb-1 block text-sm text-slate-400">
                {t("email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
                placeholder="email@example.com"
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
              {loading ? "..." : t("send_reset_link")}
            </button>
            <button
              type="button"
              onClick={backToLogin}
              className="w-full text-center text-sm text-orange-400 hover:text-orange-300"
            >
              ← {t("login")}
            </button>
          </form>
        ) : (
        <>
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
                autoComplete="name"
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
              autoComplete="email"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
              placeholder="email@example.com"
            />
          </div>

          {/* Password field with eye toggle */}
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              {t("password")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? t("hide_password") : t("show_password")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {/* Password strength bar (signup only) */}
            {passwordStrength && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex flex-1 gap-0.5">
                  <div className={`h-1 flex-1 rounded-full ${passwordStrength !== "weak" ? strengthColors[passwordStrength] : "bg-slate-700"}`} />
                  <div className={`h-1 flex-1 rounded-full ${passwordStrength === "strong" ? strengthColors.strong : passwordStrength === "medium" ? strengthColors.medium : "bg-slate-700"}`} />
                  <div className={`h-1 flex-1 rounded-full ${passwordStrength === "strong" ? strengthColors.strong : "bg-slate-700"}`} />
                </div>
                <span className={`shrink-0 text-xs ${strengthTextColors[passwordStrength]}`}>
                  {t(`password_strength_${passwordStrength}`)}
                </span>
              </div>
            )}
            {mode === "login" && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={goToForgot}
                  className="text-xs text-orange-400 hover:text-orange-300"
                >
                  {t("forgot_password")}
                </button>
              </div>
            )}
          </div>

          {/* Confirm password (signup only) */}
          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">
                {t("confirm_password")}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? t("hide_password") : t("show_password")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          )}

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
            onClick={switchMode}
            className="text-orange-400 hover:text-orange-300"
          >
            {mode === "login" ? t("signup") : t("login")}
          </button>
        </p>
        </>
        )}
      </div>
    </div>
  );
}
