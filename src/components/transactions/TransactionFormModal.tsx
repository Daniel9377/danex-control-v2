"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Briefcase,
  Package,
  ShoppingBag,
  Truck,
  Users,
  RefreshCw,
  BadgeCheck,
  CreditCard,
  Landmark,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Plus,
  Trash2,
  X,
  Search,
} from "lucide-react";

import { Account, Client, Order, Debt, TransactionSubType } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/currency";
import {
  SUB_TYPE_META,
  SUB_TYPE_GROUPS,
  getCategoriesForSubType,
} from "@/lib/transaction-types";
import { CreateOperationInput } from "@/hooks/useTransactions";
import { useSubmit, generateIdempotencyKey } from "@/hooks/useSubmit";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  accounts: Account[];
  clients: Client[];
  orders: Order[];
  debts: Debt[];
  defaultSubType?: TransactionSubType;
  onClose: () => void;
  onSubmit: (input: CreateOperationInput) => Promise<void>;
}

interface AllocationRow {
  id: string;
  clientId: string;
  orderId: string;
  amount: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQUENT_TYPES: TransactionSubType[] = [
  "client_money_received",
  "client_product_purchase",
  "personal_expense",
  "balance_correction",
  "profit_validated",
];

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICONS: Record<TransactionSubType, React.ReactNode> = {
  personal_income:           <TrendingUp size={16} />,
  personal_expense:          <TrendingDown size={16} />,
  business_income:           <Briefcase size={16} />,
  business_expense:          <TrendingDown size={16} />,
  client_money_received:     <Package size={16} />,
  client_product_purchase:   <ShoppingBag size={16} />,
  client_shipping_fee:       <Truck size={16} />,
  shared_client_fee:         <Users size={16} />,
  client_refund:             <RefreshCw size={16} />,
  profit_validated:          <BadgeCheck size={16} />,
  debt_received:             <CreditCard size={16} />,
  debt_repayment:            <Landmark size={16} />,
  receivable_created:        <ArrowUpRight size={16} />,
  receivable_repaid:         <ArrowDownLeft size={16} />,
  balance_correction:        <Scale size={16} />,
  transfer_in:               <ArrowDownLeft size={16} />,
  transfer_out:              <ArrowUpRight size={16} />,
};

const GROUP_COLORS: Record<string, string> = {
  personnel: "text-blue-400",
  business:  "text-violet-400",
  client:    "text-orange-400",
  dette:     "text-amber-400",
  autre:     "text-[var(--text-muted)]",
};

const ITEM_COLORS: Record<string, string> = {
  personnel: "border-blue-800/40 bg-blue-950/20 hover:border-blue-600/60 hover:bg-blue-950/40 text-blue-300",
  business:  "border-violet-800/40 bg-violet-950/20 hover:border-violet-600/60 hover:bg-violet-950/40 text-violet-300",
  client:    "border-orange-800/40 bg-orange-950/20 hover:border-orange-600/60 hover:bg-orange-950/40 text-orange-300",
  dette:     "border-amber-800/40 bg-amber-950/20 hover:border-amber-600/60 hover:bg-amber-950/40 text-amber-300",
  autre:     "border-[var(--border-strong)] bg-[var(--surface-glass)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-chip)] text-[var(--text-body)]",
};

// ── Field style helper ────────────────────────────────────────────────────────

const fieldCls =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 text-sm text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20";

// ── Main component ────────────────────────────────────────────────────────────

export function TransactionFormModal({
  open,
  accounts,
  clients,
  orders,
  debts,
  defaultSubType,
  onClose,
  onSubmit,
}: Props) {
  const { submitting, error, submit, clearError } = useSubmit();

  const [subType, setSubType]           = useState<TransactionSubType | null>(defaultSubType ?? null);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [typeSearch, setTypeSearch]     = useState("");

  // Common fields
  const [amount, setAmount]       = useState("");
  const [currency, setCurrency]   = useState("USD");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [clientId, setClientId]   = useState("");
  const [orderId, setOrderId]     = useState("");
  const [category, setCategory]   = useState("");
  const [note, setNote]           = useState("");
  const [date, setDate]           = useState(new Date().toISOString().split("T")[0]);

  // Debt / receivable fields
  const [personName, setPersonName]   = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [dueDate, setDueDate]         = useState("");
  const [debtId, setDebtId]           = useState("");
  const [receivableId, setReceivableId] = useState("");

  // Balance correction
  const [targetBalance, setTargetBalance] = useState("");

  // Shared fee allocations
  const [allocations, setAllocations]   = useState<AllocationRow[]>([]);
  const [allocMethod, setAllocMethod]   = useState<"equal" | "manual">("equal");

  // Unexpected expense flag (only for client_shipping_fee)
  const [isUnexpected, setIsUnexpected] = useState(false);

  // Reset when subType changes
  useEffect(() => {
    if (!subType) return;
    setAmount(""); setCategory(""); setNote("");
    setPersonName(""); setPersonPhone(""); setDueDate("");
    setDebtId(""); setReceivableId(""); setTargetBalance("");
    setAllocations([]); setIsUnexpected(false);
    clearError();
    const acct = accounts.find((a) => a.id === accountId);
    if (acct) setCurrency(acct.currency);
  }, [subType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when modal opens/closes
  useEffect(() => {
    if (open) {
      setIdempotencyKey(generateIdempotencyKey());
      // Sync subType with the current defaultSubType prop — the component
      // is always mounted (never unmounted), so useState's initializer
      // only runs once. Without this, a second open with a different
      // defaultSubType would show the type picker instead of the form.
      setSubType(defaultSubType ?? null);
    } else {
      setTypeSearch("");
    }
  }, [open, defaultSubType]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const meta = subType ? SUB_TYPE_META[subType] : null;

  const clientOrders = useMemo(
    () => orders.filter((o) => o.client_id === clientId),
    [orders, clientId]
  );

  const openDebts = useMemo(
    () => debts.filter((d) => d.direction === "i_owe" && d.status !== "paid"),
    [debts]
  );

  const openReceivables = useMemo(
    () => debts.filter((d) => d.direction === "owes_me" && d.status !== "paid"),
    [debts]
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  const correctionDiff = useMemo(() => {
    if (!selectedAccount || targetBalance === "") return null;
    return Number(targetBalance) - Number(selectedAccount.balance);
  }, [selectedAccount, targetBalance]);

  const allocTotal = useMemo(
    () => allocations.reduce((s, a) => s + Number(a.amount || 0), 0),
    [allocations]
  );

  const amountNum  = Number(amount);
  const categories = subType ? getCategoriesForSubType(subType) : [];

  // Search results
  const searchResults = useMemo(() => {
    const q = typeSearch.toLowerCase().trim();
    if (!q) return null;
    return (Object.keys(SUB_TYPE_META) as TransactionSubType[]).filter((st) =>
      SUB_TYPE_META[st].label.toLowerCase().includes(q)
    );
  }, [typeSearch]);

  // Auto-fill equal allocations
  useEffect(() => {
    if (allocMethod !== "equal" || allocations.length === 0) return;
    const share = amountNum / allocations.length;
    setAllocations((prev) =>
      prev.map((a) => ({ ...a, amount: isNaN(share) ? "" : share.toFixed(2) }))
    );
  }, [amount, allocations.length, allocMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleBack() {
    setSubType(null);
    clearError();
  }

  function addAllocationRow() {
    setAllocations((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), clientId: "", orderId: "", amount: "" },
    ]);
  }

  function removeAllocationRow(id: string) {
    setAllocations((prev) => prev.filter((a) => a.id !== id));
  }

  function updateAllocation(id: string, field: keyof AllocationRow, value: string) {
    setAllocations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  }

  function pickSubType(st: TransactionSubType) {
    setSubType(st);
    setTypeSearch("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subType || !meta) return;

    const input: CreateOperationInput = {
      subType,
      amount: amountNum,
      currency,
      date,
      note: note || undefined,
      idempotencyKey,
      accountId: meta.needsAccount ? accountId : undefined,
      clientId:  meta.needsClient ? clientId || undefined : undefined,
      orderId:   meta.needsOrder  ? orderId  || undefined : undefined,
      category:  category || undefined,
      personName:   meta.needsPerson         ? personName   : undefined,
      personPhone:  personPhone  || undefined,
      dueDate:      dueDate      || undefined,
      debtId:       meta.needsDebtSelect       ? debtId       : undefined,
      receivableId: meta.needsReceivableSelect ? receivableId : undefined,
      targetBalance: subType === "balance_correction" ? Number(targetBalance) : undefined,
      isUnexpected: subType === "client_shipping_fee" ? isUnexpected : undefined,
      allocations:  meta.needsAllocations
        ? allocations.map((a) => ({
            clientId: a.clientId || undefined,
            orderId:  a.orderId  || undefined,
            amount:   Number(a.amount),
          }))
        : undefined,
    };

    await submit(async () => {
      await onSubmit(input);
      onClose();
    });
  }

  if (!open) return null;

  // ── Render: type picker ───────────────────────────────────────────────────────

  if (!subType) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border-default)] bg-[var(--bg-app)] shadow-2xl md:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 md:hidden">
            <div className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-base font-bold text-[var(--text-strong)]">Nouvelle opération</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-label)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5">
              <Search size={13} className="shrink-0 text-[var(--text-faint)]" />
              <input
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                placeholder="Rechercher un type d'opération…"
                className="flex-1 bg-transparent text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none"
              />
              {typeSearch && (
                <button
                  onClick={() => setTypeSearch("")}
                  className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-5" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
            {searchResults ? (
              /* Search results */
              searchResults.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--text-faint)]">Aucun résultat.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {searchResults.map((st) => {
                    const m = SUB_TYPE_META[st];
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => pickSubType(st)}
                        className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${ITEM_COLORS[m.group]}`}
                      >
                        <span className="shrink-0 opacity-70">{ICONS[st]}</span>
                        <span className="text-xs font-medium leading-tight">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-5">
                {/* Fréquents */}
                <div>
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    Fréquents
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {FREQUENT_TYPES.map((st) => {
                      const m = SUB_TYPE_META[st];
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => pickSubType(st)}
                          className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${ITEM_COLORS[m.group]}`}
                        >
                          <span className="shrink-0 opacity-70">{ICONS[st]}</span>
                          <span className="text-xs font-medium leading-tight">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* All groups */}
                {SUB_TYPE_GROUPS.map((group) => {
                  const groupKey = group.items[0] ? SUB_TYPE_META[group.items[0]].group : "autre";
                  return (
                    <div key={group.label}>
                      <p className={`mb-2.5 text-[10px] font-semibold uppercase tracking-wider ${GROUP_COLORS[groupKey]}`}>
                        {group.label}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {group.items.map((st) => {
                          const m = SUB_TYPE_META[st];
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => pickSubType(st)}
                              className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${ITEM_COLORS[m.group]}`}
                            >
                              <span className="shrink-0 opacity-70">{ICONS[st]}</span>
                              <span className="text-xs font-medium leading-tight">{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: form fields ───────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border-default)] bg-[var(--bg-app)] shadow-2xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 md:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-4">
          <button
            type="button"
            onClick={handleBack}
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-label)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-strong)]">
            {meta!.label}
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-label)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hint */}
        <div className="mx-5 mb-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] px-3.5 py-2.5">
          <p className="text-xs text-[var(--text-muted)]">{meta!.hint}</p>
        </div>

        {/* Scrollable form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            <div className="space-y-3.5 py-1">

              {/* Account */}
              {meta!.needsAccount && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Compte</label>
                  <select
                    value={accountId}
                    onChange={(e) => {
                      setAccountId(e.target.value);
                      const a = accounts.find((ac) => ac.id === e.target.value);
                      if (a) setCurrency(a.currency);
                    }}
                    required
                    className={fieldCls}
                  >
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatMoney(Number(a.balance), a.currency)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Balance correction */}
              {subType === "balance_correction" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                    Solde réel observé
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={targetBalance}
                    onChange={(e) => setTargetBalance(e.target.value)}
                    required
                    className={`${fieldCls} font-mono tabular-nums`}
                  />
                  {correctionDiff !== null && Math.abs(correctionDiff) >= 0.001 && (
                    <p className={`mt-1.5 text-xs ${correctionDiff > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      Correction : {correctionDiff > 0 ? "+" : ""}{selectedAccount ? formatMoney(correctionDiff, selectedAccount.currency) : `${correctionDiff.toFixed(2)}`}
                    </p>
                  )}
                  {correctionDiff !== null && Math.abs(correctionDiff) < 0.001 && targetBalance !== "" && (
                    <p className="mt-1.5 text-xs text-[var(--text-label)]">Aucune correction nécessaire.</p>
                  )}
                </div>
              ) : (
                /* Amount + currency */
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Montant</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      placeholder="0.00"
                      className={`${fieldCls} flex-1 font-mono tabular-nums`}
                    />
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      maxLength={4}
                      className="w-20 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-center font-mono text-sm text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Client */}
              {meta!.needsClient && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Client</label>
                  <select
                    value={clientId}
                    onChange={(e) => { setClientId(e.target.value); setOrderId(""); }}
                    required
                    className={fieldCls}
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Order */}
              {meta!.needsOrder && clientId && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                    Commande{" "}
                    {(subType === "client_money_received" || subType === "client_refund")
                      ? <span className="text-[var(--text-faint)]">(optionnel)</span>
                      : null}
                  </label>
                  <select
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    required={
                      subType === "client_product_purchase" ||
                      subType === "client_shipping_fee" ||
                      subType === "profit_validated"
                    }
                    className={fieldCls}
                  >
                    <option value="">— Aucune commande —</option>
                    {clientOrders.map((o) => (
                      <option key={o.id} value={o.id}>{o.product_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Person for debt/receivable creation */}
              {meta!.needsPerson && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                      {subType === "debt_received" ? "Créancier (qui te prête)" : "Débiteur (à qui tu prêtes)"}
                    </label>
                    <input
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      required
                      placeholder="Nom de la personne"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                      Téléphone <span className="text-[var(--text-faint)]">(optionnel)</span>
                    </label>
                    <input
                      value={personPhone}
                      onChange={(e) => setPersonPhone(e.target.value)}
                      placeholder="+243..."
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                      Date limite <span className="text-[var(--text-faint)]">(optionnel)</span>
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={fieldCls}
                    />
                  </div>
                </>
              )}

              {/* Debt select */}
              {meta!.needsDebtSelect && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Dette à rembourser</label>
                  {openDebts.length === 0 ? (
                    <p className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-400">
                      Aucune dette active. Crée d'abord une «&nbsp;Dette prise&nbsp;».
                    </p>
                  ) : (
                    <select
                      value={debtId}
                      onChange={(e) => setDebtId(e.target.value)}
                      required
                      className={fieldCls}
                    >
                      <option value="">Sélectionner</option>
                      {openDebts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.person_name} — {formatMoney(Number(d.amount) - Number(d.paid_amount), d.currency)} restant
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Receivable select */}
              {meta!.needsReceivableSelect && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Créance à récupérer</label>
                  {openReceivables.length === 0 ? (
                    <p className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-400">
                      Aucune créance active. Crée d'abord une «&nbsp;Créance créée&nbsp;».
                    </p>
                  ) : (
                    <select
                      value={receivableId}
                      onChange={(e) => setReceivableId(e.target.value)}
                      required
                      className={fieldCls}
                    >
                      <option value="">Sélectionner</option>
                      {openReceivables.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.person_name} — {formatMoney(Number(d.amount) - Number(d.paid_amount), d.currency)} à recevoir
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Shared fee allocations */}
              {meta!.needsAllocations && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-[var(--text-muted)]">Répartition par client</label>
                    <div className="flex gap-1">
                      {(["equal", "manual"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setAllocMethod(m)}
                          className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                            allocMethod === m
                              ? "bg-orange-600 text-white"
                              : "border border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-chip)]"
                          }`}
                        >
                          {m === "equal" ? "Égal" : "Manuel"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {allocations.map((row) => {
                    const rowOrders = orders.filter((o) => o.client_id === row.clientId);
                    return (
                      <div key={row.id} className="flex gap-2">
                        <select
                          value={row.clientId}
                          onChange={(e) => updateAllocation(row.id, "clientId", e.target.value)}
                          className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 py-2 text-xs text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none"
                        >
                          <option value="">Client</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {rowOrders.length > 0 && (
                          <select
                            value={row.orderId}
                            onChange={(e) => updateAllocation(row.id, "orderId", e.target.value)}
                            className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 py-2 text-xs text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none"
                          >
                            <option value="">Commande</option>
                            {rowOrders.map((o) => (
                              <option key={o.id} value={o.id}>{o.product_name}</option>
                            ))}
                          </select>
                        )}
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount}
                          onChange={(e) => updateAllocation(row.id, "amount", e.target.value)}
                          disabled={allocMethod === "equal"}
                          placeholder="Part"
                          className="w-20 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 py-2 text-right text-xs text-[var(--text-strong)] tabular-nums focus:border-orange-500/70 focus:outline-none disabled:opacity-40"
                        />
                        <button
                          type="button"
                          onClick={() => removeAllocationRow(row.id)}
                          className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-chip)] hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={addAllocationRow}
                    className="flex items-center gap-1.5 text-xs text-orange-400 transition-colors hover:text-orange-300"
                  >
                    <Plus size={12} />
                    Ajouter un client
                  </button>

                  {amountNum > 0 && allocations.length > 0 && (
                    <div className={`rounded-xl px-3 py-2 text-xs ${
                      Math.abs(allocTotal - amountNum) < 0.01
                        ? "border border-emerald-900/40 bg-emerald-950/20 text-emerald-400"
                        : "border border-red-900/40 bg-red-950/20 text-red-400"
                    }`}>
                      Total réparti : {formatMoney(allocTotal, currency)} / {formatMoney(amountNum, currency)}
                      {Math.abs(allocTotal - amountNum) >= 0.01 && " ← doit égaler le montant total"}
                    </div>
                  )}
                </div>
              )}

              {/* Category */}
              {categories.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">— Choisir —</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className={fieldCls}
                />
              </div>

              {/* Note */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                  Note <span className="text-[var(--text-faint)]">(optionnel)</span>
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Description, référence…"
                  className={fieldCls}
                />
              </div>

              {/* Unexpected expense flag (shipping fees only) */}
              {subType === "client_shipping_fee" && (
                <label className="flex items-center gap-2 rounded-xl border border-amber-800/40 bg-amber-950/20 px-3.5 py-2.5 cursor-pointer transition-colors hover:border-amber-700/50">
                  <input
                    type="checkbox"
                    checked={isUnexpected}
                    onChange={(e) => setIsUnexpected(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-strong)] bg-[var(--surface-card)] accent-amber-500"
                  />
                  <span className="text-xs text-amber-300">Dépense imprévue</span>
                  <span className="text-[10px] text-[var(--text-label)]">(surcoût, frais non anticipé)</span>
                </label>
              )}

              {/* Error */}
              {error && (
                <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-400">
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className="shrink-0 border-t border-[var(--border-default)] px-5 pt-3"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-[var(--border-strong)] py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={
                  submitting ||
                  (subType === "balance_correction" &&
                    (targetBalance === "" || Math.abs(correctionDiff ?? 1) < 0.001)) ||
                  (meta?.needsAllocations &&
                    allocations.length > 0 &&
                    Math.abs(allocTotal - amountNum) >= 0.01) ||
                  (meta?.needsDebtSelect && openDebts.length === 0) ||
                  (meta?.needsReceivableSelect && openReceivables.length === 0)
                }
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-[var(--surface-chip)] disabled:text-[var(--text-label)]"
              >
                {submitting ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
