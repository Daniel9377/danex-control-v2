"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { Profile, Transaction, Account } from "@/lib/supabase/types";
import { Check, Save, Download } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

const TABS = ["profile", "currencies", "export", "integrations"] as const;
type Tab = (typeof TABS)[number];

function exportTransactionsPDF(transactions: Transaction[], accounts: Account[], title: string) {
  import("jspdf").then(({ jsPDF }) => {
    import("jspdf-autotable").then(() => {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text(title, 14, 18);
      doc.setFontSize(10);
      doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, 25);

      const rows = transactions.map((tx) => {
        const acc = accounts.find((a) => a.id === tx.account_id);
        return [
          tx.transaction_date,
          tx.type === "income" ? "Revenu" : "Dépense",
          acc?.name ?? "—",
          tx.category ?? "—",
          Number(tx.amount).toFixed(2),
          tx.currency,
          tx.note ?? "",
        ];
      });

      (doc as any).autoTable({
        startY: 30,
        head: [["Date", "Type", "Compte", "Catégorie", "Montant", "Devise", "Note"]],
        body: rows,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [194, 85, 10], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });

      const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_");
      doc.save(`${safeTitle}.pdf`);
    });
  });
}

export default function SettingsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const { currencies, upsertCurrency, loading: currLoading } = useCurrencies();
  const { transactions } = useTransactions();
  const { accounts } = useAccounts();

  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState(locale);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

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

  function handleExport(period: "week" | "month" | "all") {
    const now = new Date();
    let filtered: Transaction[];
    let title: string;

    if (period === "week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = transactions.filter((tx) => new Date(tx.transaction_date) >= weekAgo);
      title = `Transactions_semaine_${now.toLocaleDateString("fr-FR").replace(/\//g, "-")}`;
    } else if (period === "month") {
      filtered = transactions.filter((tx) => {
        const d = new Date(tx.transaction_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const monthLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      title = `Transactions_${monthLabel.replace(/ /g, "_")}`;
    } else {
      filtered = transactions;
      title = `Toutes_les_transactions_${now.toLocaleDateString("fr-FR").replace(/\//g, "-")}`;
    }

    const displayTitle =
      period === "week" ? "Transactions — Cette semaine" :
      period === "month" ? `Transactions — ${now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}` :
      "Toutes les transactions";

    setExporting(period);
    exportTransactionsPDF(filtered, accounts, displayTitle);
    setTimeout(() => setExporting(null), 1500);
  }

  if (currLoading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
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

        {/* Export tab */}
        {tab === "export" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Exportez vos transactions au format PDF.
            </p>
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">Cette semaine</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Transactions des 7 derniers jours
                  </p>
                </div>
                <button
                  onClick={() => handleExport("week")}
                  disabled={exporting === "week"}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <Download size={14} />
                  {exporting === "week" ? "Génération..." : "PDF"}
                </button>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">Ce mois</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Transactions du mois en cours
                  </p>
                </div>
                <button
                  onClick={() => handleExport("month")}
                  disabled={exporting === "month"}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <Download size={14} />
                  {exporting === "month" ? "Génération..." : "PDF"}
                </button>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">Toutes les données</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Export complet de toutes vos transactions
                  </p>
                </div>
                <button
                  onClick={() => handleExport("all")}
                  disabled={exporting === "all"}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <Download size={14} />
                  {exporting === "all" ? "Génération..." : "PDF"}
                </button>
              </div>
            </Card>
            {transactions.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-4">
                Aucune transaction à exporter.
              </p>
            )}
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
