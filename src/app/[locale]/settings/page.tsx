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
import { Profile } from "@/lib/supabase/types";
import type { Transaction, Account } from "@/lib/supabase/types";
import { Check, Save, FileDown } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

const TABS = ["profile", "currencies", "export", "integrations"] as const;
type Tab = (typeof TABS)[number];

interface ExportLabels {
  headers: string[];
  incomeLabel: string;
  expenseLabel: string;
}

function exportTransactionsCSV(
  transactions: Transaction[],
  accounts: Account[],
  filename: string,
  labels: ExportLabels,
) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const rows = transactions.map((tx) => {
    const acc = accounts.find((a) => a.id === tx.account_id);
    return [
      tx.transaction_date,
      tx.type === "income" ? labels.incomeLabel : labels.expenseLabel,
      acc?.name ?? "",
      tx.category ?? "",
      Number(tx.amount).toFixed(2),
      tx.currency,
      tx.note ?? "",
    ].map(escape).join(",");
  });

  const csv = "﻿" + [labels.headers.map(escape).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { currencies, upsertCurrency, loading: currLoading } = useCurrencies();
  const { transactions } = useTransactions();
  const { accounts } = useAccounts();

  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState(locale);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const user = session.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase
      .from("profiles")
      .update({ full_name: fullName, preferred_language: language })
      .eq("id", session.user.id);
    setProfileSaved(true);
    if (language !== locale) {
      window.location.href = `/${language}/settings`;
    } else {
      setTimeout(() => setProfileSaved(false), 2000);
    }
  }

  async function saveCurrencyRate(code: string) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const user = session.user;
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
      title = `Transactions_week_${now.toISOString().slice(0, 10)}`;
    } else if (period === "month") {
      filtered = transactions.filter((tx) => {
        const d = new Date(tx.transaction_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      title = `Transactions_month_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    } else {
      filtered = transactions;
      title = `Transactions_all_${now.toISOString().slice(0, 10)}`;
    }

    const csvLabels: ExportLabels = {
      headers: [
        t("col_date"), t("col_type"), t("col_account"),
        t("col_category"), t("col_amount"), t("col_currency"), t("col_note"),
      ],
      incomeLabel: t("income_type"),
      expenseLabel: t("expense_type"),
    };

    setExporting(period);
    exportTransactionsCSV(filtered, accounts, title, csvLabels);
    setTimeout(() => setExporting(null), 1500);
  }

  async function exportPDF() {
    const from = exportFrom ? new Date(exportFrom) : null;
    const to = exportTo ? new Date(exportTo + "T23:59:59") : null;
    const filtered = transactions.filter((tx) => {
      const d = new Date(tx.transaction_date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    const pdfHeaders = [
      t("col_date"), t("col_type"), t("col_account"),
      t("col_category"), t("col_amount"), t("col_currency"), t("col_note"),
    ];
    const incomeLabel = t("income_type");
    const expenseLabel = t("expense_type");
    const periodLabel = t("period_label");
    setExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Transactions", 14, 15);
      if (from || to) {
        doc.setFontSize(10);
        doc.text(
          `${periodLabel} : ${from ? exportFrom : "—"} → ${to ? exportTo : "—"}`,
          14,
          22
        );
      }
      const rows = filtered.map((tx) => {
        const acc = accounts.find((a) => a.id === tx.account_id);
        return [
          tx.transaction_date,
          tx.type === "income" ? incomeLabel : expenseLabel,
          acc?.name ?? "",
          tx.category ?? "",
          Number(tx.amount).toFixed(2),
          tx.currency,
          tx.note ?? "",
        ];
      });
      let y = from || to ? 30 : 24;
      const colWidths = [24, 22, 36, 36, 22, 16, 50];
      const colX = colWidths.reduce<number[]>((acc, w, i) => {
        acc.push(i === 0 ? 14 : acc[i - 1] + colWidths[i - 1]);
        return acc;
      }, []);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      pdfHeaders.forEach((h, i) => doc.text(h, colX[i], y));
      y += 6;
      doc.setFont("helvetica", "normal");
      rows.forEach((row) => {
        if (y > 195) { doc.addPage(); y = 14; }
        row.forEach((cell, i) => {
          const text = doc.splitTextToSize(String(cell), colWidths[i] - 2);
          doc.text(text[0], colX[i], y);
        });
        y += 6;
      });
      const label = from || to
        ? `Transactions_${exportFrom || "start"}_${exportTo || "end"}`
        : `Transactions_all`;
      doc.save(`${label}.pdf`);
    } finally {
      setExportingPdf(false);
    }
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
                  <option value="th">ไทย</option>
                  <option value="pt">Português</option>
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
                {profileSaved ? t("saved") : tc("save")}
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
            <p className="text-sm text-slate-400">{t("export_csv_desc")}</p>
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">{t("this_week")}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t("this_week_desc")}</p>
                </div>
                <button
                  onClick={() => handleExport("week")}
                  disabled={exporting === "week"}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <FileDown size={14} />
                  {exporting === "week" ? t("generating") : "CSV"}
                </button>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">{t("this_month")}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t("this_month_desc")}</p>
                </div>
                <button
                  onClick={() => handleExport("month")}
                  disabled={exporting === "month"}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <FileDown size={14} />
                  {exporting === "month" ? t("generating") : "CSV"}
                </button>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">{t("all_data")}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t("all_data_desc")}</p>
                </div>
                <button
                  onClick={() => handleExport("all")}
                  disabled={exporting === "all"}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <FileDown size={14} />
                  {exporting === "all" ? t("generating") : "CSV"}
                </button>
              </div>
            </Card>
            <Card>
              <p className="mb-3 text-sm font-semibold text-slate-100">{t("export_pdf_title")}</p>
              <p className="mb-3 text-xs text-slate-500">{t("export_pdf_desc")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[120px]">
                  <label className="mb-1 block text-xs text-slate-400">{t("from_date")}</label>
                  <input
                    type="date"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="mb-1 block text-xs text-slate-400">{t("to_date")}</label>
                  <input
                    type="date"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={exportPDF}
                  disabled={exportingPdf}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <FileDown size={14} />
                  {exportingPdf ? t("generating") : t("export_pdf_title")}
                </button>
              </div>
            </Card>
            {transactions.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-4">
                {t("no_transactions")}
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
