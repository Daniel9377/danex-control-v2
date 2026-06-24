"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Profile } from "@/lib/supabase/types";
import {
  Check, Save, ExternalLink, Globe, DollarSign,
  Plug, Lock, User, AlertTriangle,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

type Props = { params: Promise<{ locale: string }> };

const fieldCls =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 text-sm text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20";

export default function SettingsPage({ params }: Props) {
  const { locale } = use(params);
  const t  = useTranslations("settings");
  const tc = useTranslations("common");
  const { currencies, upsertCurrency, loading: currLoading } = useCurrencies();

  const [profile, setProfile]       = useState<Profile | null>(null);
  const [fullName, setFullName]     = useState("");
  const [language, setLanguage]     = useState(locale);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Theme toggle
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme((localStorage.getItem("danex-theme") as "dark" | "light") || "dark");
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(next);
    localStorage.setItem("danex-theme", next);
    setTheme(next);
  }

  const [rates, setRates]           = useState<Record<string, string>>({});
  const [savedCodes, setSavedCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const init: Record<string, string> = {};
    currencies.forEach((c) => { init[c.code] = String(c.rate_to_usd); });
    setRates(init);
  }, [currencies]);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setProfile(data);
        setFullName(data.full_name ?? "");
        setLanguage(data.preferred_language ?? locale);
      }
    }
    loadProfile();
  }, [locale]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setProfileSaving(false); return; }
    await supabase
      .from("profiles")
      .update({ full_name: fullName, preferred_language: language })
      .eq("id", session.user.id);
    setProfileSaving(false);
    setProfileSaved(true);
    if (language !== locale) {
      window.location.href = `/${language}/settings`;
    } else {
      setTimeout(() => setProfileSaved(false), 2500);
    }
  }

  async function saveCurrencyRate(code: string) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const currency = currencies.find((c) => c.code === code);
    if (!currency) return;
    await upsertCurrency(session.user.id, code, currency.name, currency.symbol, Number(rates[code]));
    setSavedCodes((prev) => new Set([...prev, code]));
    setTimeout(() => setSavedCodes((prev) => {
      const s = new Set(prev); s.delete(code); return s;
    }), 2500);
  }

  const languageChanged = language !== (profile?.preferred_language ?? locale);

  if (currLoading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="mx-auto max-w-2xl space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-strong)]">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--text-label)]">Gérez votre profil, devises et intégrations.</p>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section: Profil                                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader label="Profil" />

          {/* User info card */}
          {profile?.email && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-600/20 text-orange-400">
                <User size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--text-body)]">
                  {profile.full_name || "Nom non défini"}
                </p>
                <p className="truncate text-xs text-[var(--text-label)]">{profile.email}</p>
              </div>
            </div>
          )}

          <Card>
            <form onSubmit={saveProfile} className="space-y-4">
              {/* Full name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                  {t("full_name")}
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Votre nom complet"
                  className={fieldCls}
                />
              </div>

              {/* Language */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                  {t("language")}
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={fieldCls}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="th">ไทย</option>
                  <option value="pt">Português</option>
                </select>
                {languageChanged && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-400/80">
                    <Globe size={10} />
                    La langue changera après enregistrement.
                  </p>
                )}
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                  Email
                  <span className="flex items-center gap-0.5 rounded-full bg-[var(--surface-chip)] px-1.5 py-0.5 text-[10px] text-[var(--text-label)]">
                    <Lock size={8} /> non modifiable
                  </span>
                </label>
                <input
                  value={profile?.email ?? ""}
                  readOnly
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] px-3.5 py-2.5 text-sm text-[var(--text-label)] opacity-70 cursor-not-allowed"
                />
              </div>

              {/* Success feedback */}
              {profileSaved && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3.5 py-2.5">
                  <Check size={13} className="text-emerald-400" />
                  <p className="text-xs text-emerald-400">{t("saved")}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={profileSaving}
                aria-label={profileSaving ? "Enregistrement…" : tc("save")}
                className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-[var(--surface-chip)] disabled:text-[var(--text-label)]"
              >
                {profileSaved ? <Check size={14} /> : <Save size={14} />}
                {profileSaving ? "Enregistrement…" : profileSaved ? t("saved") : tc("save")}
              </button>
            </form>
          </Card>
        </section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section: Apparence                                                 */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader label="Apparence" />
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium text-[var(--text-body)]">Thème</span>
              <div className="flex rounded-lg bg-[var(--surface-chip)] p-0.5">
                <button
                  onClick={() => theme !== "dark" && toggleTheme()}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === "dark"
                      ? "bg-[var(--border-strong)] text-[var(--text-strong)] shadow-sm"
                      : "text-[var(--text-label)] hover:text-[var(--text-body)]"
                  }`}
                >
                  Sombre
                </button>
                <button
                  onClick={() => theme !== "light" && toggleTheme()}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === "light"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-[var(--text-label)] hover:text-[var(--text-body)]"
                  }`}
                >
                  Clair
                </button>
              </div>
            </div>
          </Card>
        </section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section: Devises                                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader label="Taux de change" />
          <div className="mb-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] px-4 py-3">
            <p className="text-xs text-[var(--text-label)]">
              Les taux servent à convertir tous les montants en USD pour les rapports.
              Mettez à jour régulièrement pour des rapports précis.
            </p>
          </div>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {currencies.map((c) => {
                const isSaved = savedCodes.has(c.code);
                return (
                  <li key={c.code} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[var(--text-strong)]">
                          {c.code}
                        </span>
                        <span className="text-xs text-[var(--text-label)]">{c.name}</span>
                        <span className="rounded-full bg-[var(--surface-chip)] px-1.5 py-0.5 text-[10px] text-[var(--text-label)]">
                          {c.symbol}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                        1 {c.code} = ? USD
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <input
                        type="number"
                        step="0.00001"
                        value={rates[c.code] ?? ""}
                        onChange={(e) => setRates((r) => ({ ...r, [c.code]: e.target.value }))}
                        aria-label={`Taux de change ${c.code} / USD`}
                        className="w-28 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2 text-right font-mono text-sm text-[var(--text-strong)] tabular-nums focus:border-orange-500/70 focus:outline-none"
                      />
                      <button
                        onClick={() => saveCurrencyRate(c.code)}
                        aria-label={isSaved ? "Taux sauvegardé" : `Sauvegarder le taux ${c.code}`}
                        className={`rounded-lg p-2 transition-colors ${
                          isSaved
                            ? "bg-emerald-950/40 text-emerald-400"
                            : "text-[var(--text-faint)] hover:bg-[var(--surface-chip)] hover:text-orange-400"
                        }`}
                      >
                        {isSaved ? <Check size={14} /> : <Save size={14} />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section: Intégrations                                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader label="Données & outils" />

          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {/* Export */}
              <li>
                <Link
                  href={`/${locale}/export`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <DollarSign size={15} className="shrink-0 text-orange-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-body)]">Export des données</p>
                      <p className="text-[11px] text-[var(--text-label)]">CSV, JSON, backup complet</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-[var(--text-faint)]" />
                </Link>
              </li>

              {/* Recovery */}
              <li>
                <Link
                  href={`/${locale}/recovery`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle size={15} className="shrink-0 text-red-400" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[var(--text-body)]">
                          Réinitialisation &amp; reprise historique
                        </p>
                        <span className="rounded-full border border-red-800/50 bg-red-950/30 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                          Avancé
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-label)]">
                        Sauvegarder, réinitialiser, reconstruire l'historique
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-[var(--text-faint)]" />
                </Link>
              </li>

              {/* Google Calendar */}
              <li className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Plug size={15} className="shrink-0 text-[var(--text-label)]" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-label)]">{t("google_calendar")}</p>
                      <span className="rounded-full bg-[var(--surface-chip)] px-1.5 py-0.5 text-[10px] text-[var(--text-label)]">
                        Bientôt
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-faint)]">{t("calendar_desc")}</p>
                  </div>
                </div>
              </li>

              {/* Notion */}
              <li className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Plug size={15} className="shrink-0 text-[var(--text-label)]" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-label)]">{t("notion")}</p>
                      <span className="rounded-full bg-[var(--surface-chip)] px-1.5 py-0.5 text-[10px] text-[var(--text-label)]">
                        Bientôt
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-faint)]">{t("notion_desc")}</p>
                  </div>
                </div>
              </li>
            </ul>
          </Card>
        </section>
      </div>
    </PageWrapper>
  );
}
