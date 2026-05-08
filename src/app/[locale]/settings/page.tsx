"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { Profile } from "@/lib/supabase/types";
import { Check, Save } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

const TABS = ["profile", "currencies", "integrations"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const { currencies, upsertCurrency, loading: currLoading } = useCurrencies();

  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState(locale);
  const [profileSaved, setProfileSaved] = useState(false);

  // Per-currency rate editing
  const [rates, setRates] = useState<Record<string, string>>({});
  const [savedCodes, setSavedCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const init: Record<string, string> = {};
    currencies.forEach((c) => { init[c.code] = String(c.rate_to_usd); });
    setRates(init);
  }, [currencies]);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
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
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ full_name: fullName, preferred_language: language })
      .eq("id", user.id);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
    if (language !== locale) {
      router.push(`/${language}/settings`);
    }
  }

  async function saveCurrencyRate(code: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const currency = currencies.find((c) => c.code === code);
    if (!currency) return;
    await upsertCurrency(user.id, code, currency.name, currency.symbol, Number(rates[code]));
    setSavedCodes((prev) => new Set([...prev, code]));
    setTimeout(() => setSavedCodes((prev) => { const s = new Set(prev); s.delete(code); return s; }), 2000);
  }

  if (currLoading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          {TABS.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                tab === tb
                  ? "bg-orange-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t(tb)}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {tab === "profile" && (
          <Card>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">{t("full_name")}</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">{t("language")}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Email</label>
                <input
                  value={profile?.email ?? ""}
                  readOnly
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-500"
                />
              </div>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                {profileSaved ? <Check size={14} /> : <Save size={14} />}
                {profileSaved ? "Sauvegardé !" : tc("save")}
              </button>
            </form>
          </Card>
        )}

        {/* Currencies tab */}
        {tab === "currencies" && (
          <div className="space-y-2">
            {currencies.map((c) => (
              <Card key={c.code}>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-100">
                      {c.code}
                      <span className="ml-2 font-normal text-slate-500">{c.name}</span>
                    </p>
                    <p className="text-xs text-slate-600">{c.symbol}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      type="number"
                      step="0.00001"
                      value={rates[c.code] ?? ""}
                      onChange={(e) => setRates((r) => ({ ...r, [c.code]: e.target.value }))}
                      className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-right text-sm font-mono text-slate-100 focus:border-orange-500 focus:outline-none"
                    />
                    <button
                      onClick={() => saveCurrencyRate(c.code)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-orange-400"
                    >
                      {savedCodes.has(c.code) ? <Check size={14} className="text-emerald-400" /> : <Save size={14} />}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Integrations tab */}
        {tab === "integrations" && (
          <div className="space-y-3">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-100">{t("google_calendar")}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{t("calendar_desc")}</p>
                </div>
                <div className="shrink-0">
                  <button
                    disabled
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-500 opacity-50 cursor-not-allowed"
                  >
                    {t("connect")}
                  </button>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-100">{t("notion")}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{t("notion_desc")}</p>
                </div>
                <div className="shrink-0">
                  <button
                    disabled
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-500 opacity-50 cursor-not-allowed"
                  >
                    {t("connect")}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
