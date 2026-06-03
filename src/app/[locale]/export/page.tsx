"use client";

import { useState, useEffect, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import {
  FileDown, Database, Filter, Receipt, TrendingUp, TrendingDown,
  Users, ShoppingBag, HandCoins, Tag, Shield, CheckCircle2,
} from "lucide-react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useFinancialReports } from "@/hooks/useFinancialReports";
import { createClient } from "@/lib/supabase/client";
import { isLegacy, isRealIncome, isRealExpense } from "@/lib/financial-calculations";
import {
  inPeriod,
  exportTransactionsCSV,
  exportRealIncomeCSV,
  exportRealExpenseCSV,
  exportClientMoneyCSV,
  exportLegacyCSV,
  exportClientDetailCSV,
  exportAllClientsSummaryCSV,
  exportOrderDetailCSV,
  exportAllOrdersSummaryCSV,
  exportDebtsCSV,
  exportJSONBackup,
  type ExportPeriod,
  type JSONBackupData,
} from "@/lib/export-builders";
import type { DebtPayment } from "@/lib/supabase/types";

type ExportType =
  | "all" | "real_income" | "real_expense" | "client_money"
  | "per_client" | "per_order" | "debts" | "receivables"
  | "legacy" | "json_backup";

const CLIENT_SUBTYPES = new Set([
  "client_money_received", "client_product_purchase", "client_shipping_fee",
  "shared_client_fee", "client_refund", "profit_validated",
]);

const fieldCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 focus:border-orange-500/70 focus:outline-none";

type Props = { params: Promise<{ locale: string }> };

export default function ExportPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("export");

  const {
    transactions, clients, orders, debts, accounts, allocations, ratesByCode, loading,
  } = useFinancialReports();

  const [exportType, setExportType]           = useState<ExportType>("all");
  const [period, setPeriod]                   = useState<ExportPeriod>("all");
  const [fromDate, setFromDate]               = useState("");
  const [toDate, setToDate]                   = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedOrderId, setSelectedOrderId]   = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [includeLegacy, setIncludeLegacy]     = useState(true);

  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [currencies, setCurrencies]     = useState<unknown[]>([]);
  const [userId, setUserId]             = useState("");
  const [extraLoading, setExtraLoading] = useState(true);
  const [busy, setBusy]                 = useState(false);
  const [exported, setExported]         = useState(false);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.auth.getSession(),
      supabase.from("debt_payments").select("*"),
      supabase.from("currencies").select("*"),
    ]).then(([sessionRes, dpRes, currRes]) => {
      setUserId(sessionRes.data.session?.user.id ?? "");
      setDebtPayments((dpRes.data as DebtPayment[]) ?? []);
      setCurrencies((currRes.data as unknown[]) ?? []);
      setExtraLoading(false);
    });
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filteredTx = useMemo(() => {
    const noFilter = ["debts", "receivables", "json_backup"].includes(exportType);
    let txs = noFilter
      ? transactions
      : transactions.filter((tx) => inPeriod(tx.transaction_date, period, fromDate, toDate));
    if (selectedAccountId) txs = txs.filter((tx) => tx.account_id === selectedAccountId);
    if (!includeLegacy && exportType !== "legacy") txs = txs.filter((tx) => !isLegacy(tx));
    return txs;
  }, [transactions, exportType, period, fromDate, toDate, selectedAccountId, includeLegacy]);

  const previewCount = useMemo((): number | null => {
    if (exportType === "json_backup") return null;
    if (exportType === "debts")        return debts.filter((d) => d.direction === "i_owe").length;
    if (exportType === "receivables")  return debts.filter((d) => d.direction === "owes_me").length;
    if (exportType === "real_income")  return filteredTx.filter(isRealIncome).length;
    if (exportType === "real_expense") return filteredTx.filter(isRealExpense).length;
    if (exportType === "client_money")
      return filteredTx.filter((tx) => tx.sub_type != null && CLIENT_SUBTYPES.has(tx.sub_type)).length;
    if (exportType === "legacy")  return filteredTx.filter(isLegacy).length;
    if (exportType === "per_client")
      return selectedClientId
        ? filteredTx.filter((tx) => tx.client_id === selectedClientId).length
        : filteredTx.filter((tx) => tx.client_id != null).length;
    if (exportType === "per_order")
      return selectedOrderId
        ? filteredTx.filter((tx) => tx.order_id === selectedOrderId).length
        : filteredTx.filter((tx) => tx.order_id != null).length;
    return filteredTx.length;
  }, [exportType, filteredTx, debts, selectedClientId, selectedOrderId]);

  const TYPE_LABELS: Record<ExportType, string> = {
    all: t("type_all"), real_income: t("type_real_income"), real_expense: t("type_real_expense"),
    client_money: t("type_client_money"), per_client: t("type_per_client"),
    per_order: t("type_per_order"), debts: t("type_debts"), receivables: t("type_receivables"),
    legacy: t("type_legacy"), json_backup: t("type_json_backup"),
  };

  const TYPE_ICONS: Record<ExportType, React.ElementType> = {
    all: Receipt, real_income: TrendingUp, real_expense: TrendingDown,
    client_money: Users, per_client: Users, per_order: ShoppingBag,
    debts: HandCoins, receivables: HandCoins, legacy: Tag, json_backup: Shield,
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function triggerExported() {
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  }

  function handleCSV() {
    if (exportType === "json_backup") return;
    setBusy(true);
    const now = new Date().toISOString().slice(0, 10);
    try {
      switch (exportType) {
        case "all":
          exportTransactionsCSV(filteredTx, accounts, clients, orders, `danex-transactions-${now}`); break;
        case "real_income":
          exportRealIncomeCSV(filteredTx, accounts, clients, orders, `danex-revenus-reels-${now}`); break;
        case "real_expense":
          exportRealExpenseCSV(filteredTx, accounts, clients, orders, `danex-depenses-reelles-${now}`); break;
        case "client_money":
          exportClientMoneyCSV(filteredTx, accounts, clients, orders, `danex-argent-client-${now}`); break;
        case "per_client": {
          if (selectedClientId) {
            const client = clients.find((c) => c.id === selectedClientId);
            if (client) {
              const safeName = client.name.toLowerCase().replace(/\s+/g, "-");
              exportClientDetailCSV(client, filteredTx.filter((tx) => tx.client_id === client.id),
                orders, allocations, ratesByCode, accounts, clients, orders,
                `danex-client-${safeName}-${now}`);
            }
          } else {
            exportAllClientsSummaryCSV(clients, filteredTx, orders, allocations, ratesByCode,
              `danex-tous-clients-${now}`);
          }
          break;
        }
        case "per_order": {
          if (selectedOrderId) {
            const order = orders.find((o) => o.id === selectedOrderId);
            if (order) {
              const clientName = clients.find((c) => c.id === order.client_id)?.name ?? "";
              const safeName = order.product_name.toLowerCase().replace(/\s+/g, "-");
              exportOrderDetailCSV(order, clientName,
                filteredTx.filter((tx) => tx.order_id === order.id),
                ratesByCode, accounts, clients, orders, `danex-commande-${safeName}-${now}`);
            }
          } else {
            exportAllOrdersSummaryCSV(orders, clients, filteredTx, ratesByCode,
              `danex-toutes-commandes-${now}`);
          }
          break;
        }
        case "debts":
          exportDebtsCSV(debts, debtPayments, accounts, "i_owe", `danex-dettes-${now}`); break;
        case "receivables":
          exportDebtsCSV(debts, debtPayments, accounts, "owes_me", `danex-creances-${now}`); break;
        case "legacy":
          exportLegacyCSV(filteredTx, accounts, clients, orders, `danex-legacy-${now}`); break;
      }
      triggerExported();
    } finally {
      setTimeout(() => setBusy(false), 1200);
    }
  }

  function handleJSONBackup() {
    setBusy(true);
    const data: JSONBackupData = {
      accounts, transactions, clients, orders, debts,
      debtPayments, allocations, currencies,
    };
    exportJSONBackup(data, userId);
    triggerExported();
    setTimeout(() => setBusy(false), 1200);
  }

  if (loading || extraLoading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  const showPeriodFilter   = !["debts", "receivables", "json_backup"].includes(exportType);
  const showClientFilter   = exportType === "per_client";
  const showOrderFilter    = exportType === "per_order";
  const showLegacyCheckbox = !["legacy", "json_backup", "debts", "receivables"].includes(exportType);

  const countSuffix =
    exportType === "debts"       ? t("count_debt") :
    exportType === "receivables" ? t("count_recv") : t("count_tx");

  const REGULAR_TYPES: ExportType[] = [
    "all", "real_income", "real_expense", "client_money",
    "per_client", "per_order", "debts", "receivables", "legacy",
  ];

  const PERIOD_OPTIONS: { value: ExportPeriod; label: string }[] = [
    { value: "month",      label: t("period_month") },
    { value: "last_month", label: t("period_last_month") },
    { value: "year",       label: t("period_year") },
    { value: "all",        label: t("period_all") },
    { value: "custom",     label: t("period_custom") },
  ];

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Exporte tes données en CSV ou sauvegarde complète JSON.
          </p>
        </div>

        {/* ── Section 1: Type d'export ── */}
        <div className="space-y-3">
          <SectionHeader label={t("type_label")} />

          {/* Regular types grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REGULAR_TYPES.map((type) => {
              const Icon   = TYPE_ICONS[type];
              const active = exportType === type;
              return (
                <button
                  key={type}
                  onClick={() => setExportType(type)}
                  aria-label={TYPE_LABELS[type]}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-orange-600/50 bg-orange-950/30 text-orange-200"
                      : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <Icon
                    size={14}
                    className={`mt-0.5 shrink-0 ${active ? "text-orange-400" : "text-slate-600"}`}
                  />
                  <span className="min-w-0 truncate text-xs font-medium leading-tight">
                    {TYPE_LABELS[type]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* JSON Backup — special card */}
          <button
            onClick={() => setExportType("json_backup")}
            aria-label={TYPE_LABELS["json_backup"]}
            className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
              exportType === "json_backup"
                ? "border-emerald-700/50 bg-emerald-950/20"
                : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
            }`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              exportType === "json_backup" ? "bg-emerald-900/50" : "bg-slate-800"
            }`}>
              <Shield size={16} className={exportType === "json_backup" ? "text-emerald-400" : "text-slate-500"} />
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${
                exportType === "json_backup" ? "text-emerald-300" : "text-slate-300"
              }`}>
                {TYPE_LABELS["json_backup"]}
              </p>
              <p className="text-xs text-slate-600">
                Backup complet · comptes, transactions, clients, commandes, dettes
              </p>
            </div>
          </button>
        </div>

        {/* ── Section 2: Filtres ── */}
        {exportType !== "json_backup" && (
          <div className="space-y-3">
            <SectionHeader label={t("filters_label")} />
            <Card>
              <div className="space-y-4">

                {/* Period pills */}
                {showPeriodFilter && (
                  <div className="space-y-2.5">
                    <label className="block text-xs font-medium text-slate-500">{t("period_label")}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PERIOD_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPeriod(opt.value)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            period === opt.value
                              ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                              : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {period === "custom" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-xs text-slate-500">{t("from_date")}</label>
                          <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className={fieldCls}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs text-slate-500">{t("to_date")}</label>
                          <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className={fieldCls}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Account / Client / Order selectors */}
                {(showPeriodFilter || showClientFilter || showOrderFilter) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {showPeriodFilter && (
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-500">
                          {t("account_label")}
                        </label>
                        <select
                          value={selectedAccountId}
                          onChange={(e) => setSelectedAccountId(e.target.value)}
                          className={fieldCls}
                        >
                          <option value="">{t("all_accounts")}</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {showClientFilter && (
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-500">
                          {t("client_label")}
                        </label>
                        <select
                          value={selectedClientId}
                          onChange={(e) => setSelectedClientId(e.target.value)}
                          className={fieldCls}
                        >
                          <option value="">{t("all_clients")}</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-600">{t("select_client_hint")}</p>
                      </div>
                    )}
                    {showOrderFilter && (
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-500">
                          {t("order_label")}
                        </label>
                        <select
                          value={selectedOrderId}
                          onChange={(e) => setSelectedOrderId(e.target.value)}
                          className={fieldCls}
                        >
                          <option value="">{t("all_orders")}</option>
                          {orders.map((o) => (
                            <option key={o.id} value={o.id}>{o.product_name}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-600">{t("select_order_hint")}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Legacy checkbox */}
                {showLegacyCheckbox && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeLegacy}
                      onChange={(e) => setIncludeLegacy(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 accent-orange-500"
                    />
                    <span className="text-xs text-slate-400">{t("include_legacy")}</span>
                  </label>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Contextual notes ── */}
        {exportType === "legacy" && (
          <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 px-4 py-3">
            <p className="text-xs text-amber-400">{t("legacy_note")}</p>
          </div>
        )}
        {exportType === "json_backup" && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 px-4 py-3">
            <p className="text-xs text-slate-400">{t("json_note")}</p>
          </div>
        )}

        {/* ── Preview count ── */}
        {previewCount !== null && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
            previewCount === 0
              ? "border-slate-800 bg-slate-900/40"
              : "border-slate-800 bg-slate-900/60"
          }`}>
            <Filter size={13} className={previewCount === 0 ? "text-slate-600" : "text-orange-400/80"} />
            <p className="text-sm text-slate-400">
              <span className={`font-semibold ${previewCount === 0 ? "text-slate-500" : "text-slate-200"}`}>
                {previewCount}
              </span>{" "}
              {countSuffix}
              {previewCount === 0 && (
                <span className="ml-2 text-slate-600">— {t("no_data")}</span>
              )}
            </p>
          </div>
        )}

        {/* ── Section 3: Export buttons ── */}
        <div className="space-y-3">
          <SectionHeader label="Exporter" />

          {/* Success feedback */}
          {exported && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-2.5">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <p className="text-xs text-emerald-400">Fichier téléchargé avec succès.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {exportType !== "json_backup" && (
              <button
                onClick={handleCSV}
                disabled={busy || previewCount === 0}
                aria-label={busy ? t("generating") : t("btn_csv")}
                className="flex items-center gap-2 rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                <FileDown size={15} />
                {busy ? t("generating") : t("btn_csv")}
              </button>
            )}
            <button
              onClick={handleJSONBackup}
              disabled={busy}
              aria-label={busy ? t("generating") : t("btn_json")}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Database size={15} />
              {busy ? t("generating") : t("btn_json")}
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
