"use client";

import { use, useEffect, useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useAccounts } from "@/hooks/useAccounts";
import { useClients } from "@/hooks/useClients";
import { useOrders } from "@/hooks/useOrders";
import {
  useReclassify,
  computeImpact,
  ReclassifyInput,
} from "@/hooks/useReclassify";
import { SUB_TYPE_GROUPS, SUB_TYPE_META } from "@/lib/transaction-types";
import { Transaction, TransactionSubType, AccountingType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  RotateCcw,
  Search,
  Tag,
  X,
  AlertTriangle,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewFilter = "all" | "pending" | "reviewed" | "ignored";

interface RowState {
  open: boolean;
  selectedSubType: TransactionSubType | null;
  selectedClientId: string;
  selectedOrderId: string;
  note: string;
  confirming: boolean;
}

// ── Field styles ──────────────────────────────────────────────────────────────

const inlineFieldCls =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 py-2 text-xs text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-orange-500/70 focus:outline-none";

const filterSelectCls =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 py-2 text-xs text-[var(--text-body)] focus:border-orange-500/70 focus:outline-none";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string) {
  const n = amount.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${currency} ${n}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "2-digit",
  });
}

function getMigrationStatusLabel(status: string | null): string {
  switch (status) {
    case "reviewed": return "Reclassifié";
    case "archived": return "Archivé";
    case "ignored_modern_reports": return "Ignoré";
    case "pending_review": return "En attente";
    default: return "Non traité";
  }
}

function getMigrationStatusColor(status: string | null): string {
  switch (status) {
    case "reviewed": return "bg-emerald-900/40 text-emerald-400";
    case "archived": return "bg-[var(--border-strong)]/60 text-[var(--text-muted)]";
    case "ignored_modern_reports": return "bg-amber-900/40 text-amber-400";
    default: return "bg-[var(--surface-chip)] text-[var(--text-label)]";
  }
}

function getAccountingTypeBadge(at: AccountingType | null) {
  switch (at) {
    case "real_income":          return { label: "Vrai revenu",        color: "text-emerald-400" };
    case "non_income_inflow":    return { label: "Entrée non-revenu",  color: "text-sky-400" };
    case "real_expense":         return { label: "Vraie dépense",      color: "text-red-400" };
    case "non_expense_outflow":  return { label: "Sortie non-dépense", color: "text-orange-400" };
    case "adjustment":           return { label: "Ajustement",         color: "text-[var(--text-muted)]" };
    default:                     return { label: "Non classifié",      color: "text-[var(--text-label)]" };
  }
}

function inPeriodFilter(dateStr: string, period: string, fromDate: string, toDate: string): boolean {
  if (period === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (period === "last_month") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
  }
  if (period === "year") return d.getFullYear() === now.getFullYear();
  if (period === "custom") {
    const from = fromDate ? new Date(fromDate) : null;
    const to   = toDate   ? new Date(toDate)   : null;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  }
  return true;
}

// ── ImpactPreview ─────────────────────────────────────────────────────────────

function ImpactPreview({ subType }: { subType: TransactionSubType }) {
  const impact = computeImpact(subType);
  return (
    <div className="mt-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-glass)] p-3.5 text-xs">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-label)]">
        Impact sur les rapports
      </p>
      <div className="grid grid-cols-2 gap-2">
        <span className={cn("flex items-center gap-1.5", impact.becomesRealIncome ? "text-emerald-400" : "text-[var(--text-faint)]")}>
          <TrendingUp size={11} /> Vrai revenu : {impact.becomesRealIncome ? "Oui" : "Non"}
        </span>
        <span className={cn("flex items-center gap-1.5", impact.becomesRealExpense ? "text-red-400" : "text-[var(--text-faint)]")}>
          <TrendingDown size={11} /> Vraie dépense : {impact.becomesRealExpense ? "Oui" : "Non"}
        </span>
        <span className={cn("flex items-center gap-1.5", impact.touchesClientMoney ? "text-sky-400" : "text-[var(--text-faint)]")}>
          <Users size={11} /> Argent client : {impact.touchesClientMoney ? "Oui" : "Non"}
        </span>
        <span className="flex items-center gap-1.5 text-[var(--text-faint)]">
          <Minus size={11} /> Solde physique : inchangé
        </span>
      </div>
    </div>
  );
}

// ── SubTypePicker ─────────────────────────────────────────────────────────────

function SubTypePicker({
  value,
  onChange,
}: {
  value: TransactionSubType | null;
  onChange: (v: TransactionSubType) => void;
}) {
  return (
    <div className="space-y-2.5">
      {SUB_TYPE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-label)]">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((st) => {
              const meta = SUB_TYPE_META[st];
              return (
                <button
                  key={st}
                  type="button"
                  title={meta.hint}
                  onClick={() => onChange(st)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    value === st
                      ? "bg-orange-600 text-white"
                      : "bg-[var(--surface-chip)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text-body)]"
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ locale: string }> };

export default function LegacyPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("legacy");
  const { accounts } = useAccounts();
  const { clients } = useClients();
  const { orders } = useOrders();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [viewFilter, setViewFilter]         = useState<ViewFilter>("pending");
  const [search, setSearch]                 = useState("");
  const [accountFilter, setAccountFilter]   = useState("all");
  const [periodFilter, setPeriodFilter]     = useState("all");
  const [fromDate, setFromDate]             = useState("");
  const [toDate, setToDate]                 = useState("");
  const [typeFilter, setTypeFilter]         = useState("all");
  const [accountingFilter, setAccountingFilter] = useState("all");
  const [showFilters, setShowFilters]       = useState(false);

  const [rowStates, setRowStates]           = useState<Record<string, RowState>>({});
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [bulkSubType, setBulkSubType]       = useState<TransactionSubType | null>(null);
  const [bulkNote, setBulkNote]             = useState("");
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [showBulkPicker, setShowBulkPicker] = useState(false);

  const loadTx = useCallback(async () => {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return;
    setUserId(uid);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", uid)
      .order("transaction_date", { ascending: false });
    if (data) setTransactions(data as Transaction[]);
    setLoadingTx(false);
  }, []);

  useEffect(() => { loadTx(); }, [loadTx]);

  const { reclassify, reclassifyBulk, markIgnored, revert, loading: rLoading, error: rError } =
    useReclassify(loadTx);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const isLegacy = tx.sub_type === null;
      if (viewFilter === "pending") {
        if (!isLegacy) return false;
        if (tx.migration_status && tx.migration_status !== "pending_review") return false;
      } else if (viewFilter === "reviewed") {
        const reclassified = !isLegacy && tx.migration_status === "reviewed";
        const legacyReviewed = isLegacy && tx.migration_status === "reviewed";
        if (!reclassified && !legacyReviewed) return false;
      } else if (viewFilter === "ignored") {
        if (tx.migration_status !== "ignored_modern_reports" && tx.migration_status !== "archived") return false;
      } else {
        if (tx.sub_type !== null && tx.migration_status === null) return false;
      }
      if (accountFilter !== "all" && tx.account_id !== accountFilter) return false;
      if (!inPeriodFilter(tx.transaction_date, periodFilter, fromDate, toDate)) return false;
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (accountingFilter !== "all" && tx.accounting_type !== accountingFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(tx.note ?? "").toLowerCase().includes(q) &&
          !(tx.category ?? "").toLowerCase().includes(q) &&
          !String(tx.amount).includes(q)
        ) return false;
      }
      return true;
    });
  }, [transactions, viewFilter, accountFilter, periodFilter, fromDate, toDate, typeFilter, accountingFilter, search]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const legacy   = transactions.filter((tx) => tx.sub_type === null);
    const pending  = legacy.filter((tx) => !tx.migration_status || tx.migration_status === "pending_review");
    const reviewed = transactions.filter((tx) => tx.migration_status === "reviewed");
    const ignored  = legacy.filter(
      (tx) => tx.migration_status === "ignored_modern_reports" || tx.migration_status === "archived"
    );
    return { total: legacy.length, pending: pending.length, reviewed: reviewed.length, ignored: ignored.length };
  }, [transactions]);

  const progressPct = stats.total > 0
    ? Math.round(((stats.reviewed + stats.ignored) / stats.total) * 100)
    : 100;
  const isDone = stats.pending === 0 && stats.total > 0;

  // ── Row helpers ───────────────────────────────────────────────────────────

  function getRow(id: string): RowState {
    return rowStates[id] ?? {
      open: false, selectedSubType: null,
      selectedClientId: "", selectedOrderId: "",
      note: "", confirming: false,
    };
  }

  function patchRow(id: string, patch: Partial<RowState>) {
    setRowStates((prev) => ({ ...prev, [id]: { ...getRow(id), ...patch } }));
  }

  function toggleRow(id: string) {
    patchRow(id, { open: !getRow(id).open, confirming: false });
  }

  // ── Reclassify single ─────────────────────────────────────────────────────

  async function handleReclassify(tx: Transaction) {
    const row = getRow(tx.id);
    if (!row.selectedSubType) return;
    const input: ReclassifyInput = {
      transactionId: tx.id, subType: row.selectedSubType,
      note: row.note || undefined,
      clientId: row.selectedClientId || null,
      orderId:  row.selectedOrderId  || null,
    };
    const ok = await reclassify(input);
    if (ok) patchRow(tx.id, {
      open: false, selectedSubType: null,
      selectedClientId: "", selectedOrderId: "",
      note: "", confirming: false,
    });
  }

  async function handleIgnore(txId: string)  { await markIgnored(txId); }
  async function handleRevert(txId: string)  { await revert(txId); }

  // ── Bulk ─────────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function selectAll()      { setSelected(new Set(filtered.map((tx) => tx.id))); }
  function clearSelection() {
    setSelected(new Set()); setBulkSubType(null); setBulkNote("");
    setBulkConfirming(false); setShowBulkPicker(false);
  }

  async function handleBulkReclassify() {
    if (!bulkSubType || selected.size === 0) return;
    const ok = await reclassifyBulk({
      transactionIds: Array.from(selected), subType: bulkSubType,
      note: bulkNote || undefined,
    });
    if (ok) clearSelection();
  }

  // ── Render row ────────────────────────────────────────────────────────────

  function renderRow(tx: Transaction) {
    const row       = getRow(tx.id);
    const account   = accounts.find((a) => a.id === tx.account_id);
    const client    = clients.find((c) => c.id === tx.client_id);
    const order     = orders.find((o) => o.id === tx.order_id);
    const atBadge   = getAccountingTypeBadge(tx.accounting_type);
    const isSelected = selected.has(tx.id);
    const meta      = row.selectedSubType ? SUB_TYPE_META[row.selectedSubType] : null;

    return (
      <div
        key={tx.id}
        className={cn(
          "rounded-xl border transition-colors",
          isSelected ? "border-orange-600/50 bg-orange-950/20" : "border-[var(--border-default)] bg-[var(--surface-card)]"
        )}
      >
        {/* Row summary */}
        <div className="flex items-start gap-3 p-3.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(tx.id)}
            className="mt-1 h-4 w-4 accent-orange-500"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--text-label)]">{formatDate(tx.transaction_date)}</span>
              <span className={cn("text-sm font-semibold tabular-nums", tx.type === "income" ? "text-emerald-400" : "text-red-400")}>
                {tx.type === "income" ? "+" : "−"}{formatAmount(tx.amount, tx.currency)}
              </span>
              {account && (
                <span className="rounded-full bg-[var(--surface-chip)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {account.name}
                </span>
              )}
              {tx.sub_type ? (
                <span className="rounded-full bg-sky-900/40 px-2 py-0.5 text-[10px] text-sky-400">
                  {SUB_TYPE_META[tx.sub_type]?.label ?? tx.sub_type}
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-[var(--surface-chip)] px-2 py-0.5 text-[10px] text-[var(--text-label)]">
                    {tx.type === "income" ? "Entrée" : "Sortie"}
                    {tx.category ? ` · ${tx.category}` : ""}
                  </span>
                  <span className={cn("text-[10px]", atBadge.color)}>{atBadge.label}</span>
                </>
              )}
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", getMigrationStatusColor(tx.migration_status))}>
                {getMigrationStatusLabel(tx.migration_status)}
              </span>
            </div>
            {tx.note && (
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">{tx.note}</p>
            )}
            {client && (
              <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                {client.name}{order ? ` · ${order.product_name}` : ""}
              </p>
            )}
            {tx.legacy_review_note && (
              <p className="mt-0.5 text-[10px] italic text-[var(--text-faint)]">
                Note : {tx.legacy_review_note}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-0.5">
            {tx.sub_type && tx.migration_status === "reviewed" && (
              <button
                onClick={() => handleRevert(tx.id)}
                aria-label="Annuler la reclassification"
                title="Annuler la reclassification"
                className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
              >
                <RotateCcw size={13} />
              </button>
            )}
            {tx.sub_type === null && tx.migration_status !== "ignored_modern_reports" && (
              <button
                onClick={() => handleIgnore(tx.id)}
                aria-label="Ignorer cette transaction"
                title="Ignorer cette transaction"
                className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-chip)] hover:text-amber-400"
              >
                <Archive size={13} />
              </button>
            )}
            {tx.sub_type === null && (
              <button
                onClick={() => toggleRow(tx.id)}
                aria-label={row.open ? "Fermer le formulaire" : "Reclassifier cette transaction"}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  row.open
                    ? "bg-orange-600/20 text-orange-400"
                    : "bg-[var(--surface-chip)] text-[var(--text-body)] hover:bg-[var(--border-strong)]"
                )}
              >
                <Tag size={11} />
                {row.open ? "Fermer" : "Reclassifier"}
                {row.open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
          </div>
        </div>

        {/* Inline reclassification form */}
        {row.open && (
          <div className="border-t border-[var(--border-default)] px-4 pb-4 pt-3.5">
            {rError && (
              <div className="mb-3 rounded-xl border border-red-800/50 bg-red-950/30 px-3.5 py-2.5">
                <p className="text-xs text-red-400">{rError}</p>
              </div>
            )}

            <p className="mb-2.5 text-xs font-semibold text-[var(--text-muted)]">Choisir le nouveau type :</p>
            <SubTypePicker
              value={row.selectedSubType}
              onChange={(v) => patchRow(tx.id, { selectedSubType: v, confirming: false })}
            />

            {/* Client / Order */}
            {row.selectedSubType && meta?.needsClient && (
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1.5 block text-[11px] text-[var(--text-label)]">Client</label>
                  <select
                    value={row.selectedClientId}
                    onChange={(e) => patchRow(tx.id, { selectedClientId: e.target.value, selectedOrderId: "" })}
                    className={inlineFieldCls}
                  >
                    <option value="">— Aucun —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {meta.needsOrder && row.selectedClientId && (
                  <div>
                    <label className="mb-1.5 block text-[11px] text-[var(--text-label)]">Commande</label>
                    <select
                      value={row.selectedOrderId}
                      onChange={(e) => patchRow(tx.id, { selectedOrderId: e.target.value })}
                      className={inlineFieldCls}
                    >
                      <option value="">— Aucune —</option>
                      {orders
                        .filter((o) => o.client_id === row.selectedClientId)
                        .map((o) => <option key={o.id} value={o.id}>{o.product_name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Note */}
            {row.selectedSubType && (
              <div className="mt-3">
                <label className="mb-1.5 block text-[11px] text-[var(--text-label)]">
                  Note de reclassification <span className="text-[var(--text-faint)]">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={row.note}
                  onChange={(e) => patchRow(tx.id, { note: e.target.value })}
                  placeholder="Ex : reclassifié car salaire mensuel"
                  className={inlineFieldCls}
                />
              </div>
            )}

            {/* Impact */}
            {row.selectedSubType && <ImpactPreview subType={row.selectedSubType} />}

            {/* Confirm step */}
            {row.selectedSubType && (
              <div className="mt-3">
                {!row.confirming ? (
                  <button
                    onClick={() => patchRow(tx.id, { confirming: true })}
                    className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-500"
                  >
                    Prévisualiser et confirmer
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-xl border border-orange-600/50 bg-orange-950/30 px-3.5 py-2.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-orange-400" />
                      <p className="text-xs text-orange-300">
                        Reclassifier en &ldquo;{SUB_TYPE_META[row.selectedSubType].label}&rdquo; ?
                        <span className="ml-1 text-orange-400/60">Le solde physique ne change pas.</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReclassify(tx)}
                        disabled={rLoading}
                        className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-[var(--surface-chip)] disabled:text-[var(--text-label)]"
                      >
                        {rLoading ? "…" : "Confirmer"}
                      </button>
                      <button
                        onClick={() => patchRow(tx.id, { confirming: false })}
                        className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const VIEW_TABS: { key: ViewFilter; label: string; count: number }[] = [
    { key: "pending",  label: "À traiter",     count: stats.pending },
    { key: "reviewed", label: "Reclassifiés",  count: stats.reviewed },
    { key: "ignored",  label: "Ignorés",        count: stats.ignored },
    { key: "all",      label: "Tous (legacy)",  count: stats.total },
  ];

  const hasActiveFilter = accountFilter !== "all" || periodFilter !== "all"
    || typeFilter !== "all" || accountingFilter !== "all";

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-5">

        {/* ── Header ── */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-strong)]">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--text-label)]">
            {t("subtitle")}{" "}
            <span className="text-orange-400/80">{t("balance_unchanged_notice")}</span>
          </p>
        </div>

        {/* ── Tool notice ── */}
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chip)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-body)]">Outil temporaire de migration.</span>{" "}
            Reclasse les anciennes transactions créées avant la nouvelle architecture.
            Une fois toutes traitées, cette page ne sert plus.
          </p>
        </div>

        {/* ── Progress ── */}
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-[var(--text-label)]">
              {isDone ? "Migration terminée" : `${stats.reviewed + stats.ignored} / ${stats.total} traitées`}
            </span>
            <span className={`font-mono text-xs font-semibold ${isDone ? "text-emerald-400" : "text-orange-400"}`}>
              {progressPct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--surface-chip)]">
            <div
              className={`h-1.5 rounded-full transition-all ${isDone ? "bg-emerald-500" : "bg-orange-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {isDone && (
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">
                Toutes les anciennes transactions sont traitées.
              </span>
            </div>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total legacy",  value: stats.total,    color: "text-[var(--text-body)]",  icon: Clock },
            { label: "À traiter",     value: stats.pending,  color: "text-amber-400",  icon: AlertTriangle },
            { label: "Reclassifiés",  value: stats.reviewed, color: "text-emerald-400", icon: CheckCircle2 },
            { label: "Ignorés",       value: stats.ignored,  color: "text-[var(--text-label)]",  icon: Archive },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-3.5">
              <div className="flex items-center gap-2">
                <Icon size={13} className={color} />
                <span className="text-[11px] text-[var(--text-label)]">{label}</span>
              </div>
              <p className={cn("mt-1.5 font-mono text-2xl font-bold", color)}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── View tabs ── */}
        <SegmentedControl
          tabs={VIEW_TABS.map(({ key, label, count }) => ({ value: key, label, count }))}
          value={viewFilter}
          onChange={(v) => { setViewFilter(v); clearSelection(); }}
        />

        {/* ── Filters bar ── */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                type="text"
                placeholder="Rechercher (note, catégorie, montant)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] py-2.5 pl-8 pr-8 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:border-orange-500/70 focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Effacer la recherche"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters((f) => !f)}
              aria-label="Afficher/masquer les filtres avancés"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                showFilters || hasActiveFilter
                  ? "border-orange-600/50 bg-orange-950/30 text-orange-400"
                  : "border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-body)]"
              )}
            >
              <Filter size={13} />
              Filtres
              {hasActiveFilter && (
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              )}
            </button>
          </div>

          {showFilters && (
            <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-label)]">Compte</label>
                  <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className={filterSelectCls}>
                    <option value="all">Tous les comptes</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-label)]">Période</label>
                  <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className={filterSelectCls}>
                    <option value="all">Toute la période</option>
                    <option value="month">Ce mois</option>
                    <option value="last_month">Mois précédent</option>
                    <option value="year">Cette année</option>
                    <option value="custom">Personnalisé</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-label)]">Type</label>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={filterSelectCls}>
                    <option value="all">Entrée + Sortie</option>
                    <option value="income">Entrée seulement</option>
                    <option value="expense">Sortie seulement</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-label)]">Type comptable</label>
                  <select value={accountingFilter} onChange={(e) => setAccountingFilter(e.target.value)} className={filterSelectCls}>
                    <option value="all">Tous</option>
                    <option value="real_income">Vrai revenu</option>
                    <option value="non_income_inflow">Entrée non-revenu</option>
                    <option value="real_expense">Vraie dépense</option>
                    <option value="non_expense_outflow">Sortie non-dépense</option>
                    <option value="adjustment">Ajustement</option>
                  </select>
                </div>
                {periodFilter === "custom" && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-label)]">Du</label>
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={filterSelectCls} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-label)]">Au</label>
                      <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={filterSelectCls} />
                    </div>
                  </>
                )}
              </div>
              {hasActiveFilter && (
                <button
                  onClick={() => { setAccountFilter("all"); setPeriodFilter("all"); setTypeFilter("all"); setAccountingFilter("all"); setFromDate(""); setToDate(""); }}
                  className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
                >
                  <X size={10} /> Réinitialiser les filtres
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Bulk action bar ── */}
        {selected.size > 0 && (
          <div className="rounded-xl border border-orange-600/50 bg-orange-950/20 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-orange-300">
                {selected.size} transaction{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setShowBulkPicker((v) => !v)}
                className="rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-500"
              >
                {showBulkPicker ? "Masquer" : "Choisir le type en masse"}
              </button>
              <button
                onClick={selectAll}
                className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]"
              >
                Tout sélectionner ({filtered.length})
              </button>
              <button
                onClick={clearSelection}
                className="flex items-center gap-1 text-xs text-[var(--text-label)] transition-colors hover:text-[var(--text-body)]"
              >
                <X size={11} /> Désélectionner
              </button>
            </div>

            {showBulkPicker && (
              <div className="mt-4 border-t border-orange-800/40 pt-4">
                <SubTypePicker
                  value={bulkSubType}
                  onChange={(v) => { setBulkSubType(v); setBulkConfirming(false); }}
                />
                {bulkSubType && <ImpactPreview subType={bulkSubType} />}
                <div className="mt-3">
                  <label className="mb-1.5 block text-[11px] text-[var(--text-label)]">
                    Note commune <span className="text-[var(--text-faint)]">(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    placeholder="Note pour toutes les transactions sélectionnées"
                    className={inlineFieldCls}
                  />
                </div>
                {bulkSubType && (
                  <div className="mt-3">
                    {!bulkConfirming ? (
                      <button
                        onClick={() => setBulkConfirming(true)}
                        className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-500"
                      >
                        Appliquer à {selected.size} transaction{selected.size > 1 ? "s" : ""}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 rounded-xl border border-orange-600/50 bg-orange-950/40 px-3.5 py-2.5">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-orange-400" />
                          <p className="text-xs text-orange-300">
                            Reclassifier {selected.size} tx en &ldquo;{SUB_TYPE_META[bulkSubType].label}&rdquo; ?
                            <span className="ml-1 text-orange-400/60">Le solde physique ne change pas.</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleBulkReclassify}
                            disabled={rLoading}
                            className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-[var(--surface-chip)] disabled:text-[var(--text-label)]"
                          >
                            {rLoading ? "…" : "Confirmer"}
                          </button>
                          <button
                            onClick={() => setBulkConfirming(false)}
                            className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Transaction list ── */}
        {loadingTx ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[60px] animate-pulse rounded-xl bg-[var(--surface-card)]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] py-12 text-center">
            <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-500/60" />
            <p className="text-sm text-[var(--text-label)]">
              {viewFilter === "pending"
                ? "Toutes les transactions legacy ont été traitées."
                : "Aucune transaction correspondant aux filtres."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <SectionHeader label={`${filtered.length} transaction${filtered.length > 1 ? "s" : ""}`} />
            {filtered.map(renderRow)}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
