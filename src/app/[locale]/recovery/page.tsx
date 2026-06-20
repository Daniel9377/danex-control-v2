"use client";

import { useState, useMemo, useCallback } from "react";
import { use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useAccounts } from "@/hooks/useAccounts";
import { exportJSONBackup, type JSONBackupData } from "@/lib/export-builders";
import { formatMoney } from "@/lib/currency";
import {
  ArrowLeft, Shield, Download, AlertTriangle, CheckCircle2,
  RotateCcw, Target, Upload, ChevronDown, ChevronUp,
  Plus, Trash2, X,
} from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

// ── Local types ───────────────────────────────────────────────────────────────

interface ImportRow {
  id: string;
  date: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
  description: string;
  category: string;
  status: "pending" | "validated" | "ignored";
}

interface SplitRow {
  id: string;
  amount: string;
  category: string;
  description: string;
  type: "income" | "expense";
}

interface ResetStats {
  txCount: number;
  accountCount: number;
  debtCount: number;
  debtPaymentCount: number;
}

// ── CSS helpers ───────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none";

const miniInputCls =
  "rounded-xl border border-slate-700/80 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none";

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(content: string): ImportRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const col = (...names: string[]) => {
    const idx = names.map((n) => headers.indexOf(n)).find((i) => i !== -1);
    return idx ?? -1;
  };

  const dateIdx = col("date", "date_transaction", "date transaction");
  const amtIdx  = col("montant", "amount", "montant_total");
  const currIdx = col("devise", "currency", "monnaie");
  const typeIdx = col("type");
  const descIdx = col("description", "libelle", "libellé", "note");
  const catIdx  = col("categorie", "category", "catégorie");

  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line, i) => {
      const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const rawType = (vals[typeIdx] ?? "expense").toLowerCase();
      const type: "income" | "expense" =
        rawType.includes("income") || rawType.includes("revenu") || rawType.includes("entrée")
          ? "income"
          : "expense";
      return {
        id: `csv_${i}_${Date.now()}`,
        date: vals[dateIdx] ?? new Date().toISOString().split("T")[0],
        amount: Math.abs(parseFloat(vals[amtIdx] ?? "0") || 0),
        currency: vals[currIdx]?.toUpperCase() ?? "USD",
        type,
        description: vals[descIdx] ?? "",
        category: vals[catIdx] ?? "",
        status: "pending" as const,
      };
    })
    .filter((r) => r.amount > 0);
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseJSONImport(content: string): ImportRow[] {
  try {
    const data = JSON.parse(content);
    const txs: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray(data.transactions)
      ? (data.transactions as Record<string, unknown>[])
      : [];
    return txs
      .map((tx, i) => ({
        id: `json_${i}_${Date.now()}`,
        date: String(tx.transaction_date ?? tx.date ?? new Date().toISOString().split("T")[0]),
        amount: Math.abs(Number(tx.amount ?? 0)),
        currency: String(tx.currency ?? "USD").toUpperCase(),
        type: tx.type === "income" ? ("income" as const) : ("expense" as const),
        description: String(tx.category ?? tx.note ?? tx.description ?? ""),
        category: String(tx.category ?? ""),
        status: "pending" as const,
      }))
      .filter((r) => r.amount > 0);
  } catch {
    return [];
  }
}

// ── Main component ────────────────────────────────────────────────────────────

const CONFIRM_WORD = "REINITIALISER";

export default function RecoveryPage({ params }: Props) {
  const { locale } = use(params);
  const { accounts } = useAccounts();

  // Backup
  const [backupLoading, setBackupLoading]   = useState(false);
  const [backupDone, setBackupDone]         = useState(false);
  const [stats, setStats]                   = useState<ResetStats | null>(null);

  // Section
  const [activeSection, setActiveSection]   = useState<"reset" | "zerop" | "import" | null>(null);

  // Reset
  const [confirmText, setConfirmText]       = useState("");
  const [resetting, setResetting]           = useState(false);
  const [resetDone, setResetDone]           = useState(false);
  const [resetError, setResetError]         = useState<string | null>(null);
  const [zeroError, setZeroError]           = useState<string | null>(null);

  // Zero Point
  const [zeroValues, setZeroValues]         = useState<Record<string, string>>({});
  const [zeroApplied, setZeroApplied]       = useState<Set<string>>(new Set());
  const [zeroApplying, setZeroApplying]     = useState<string | null>(null);

  // Import
  const [importQueue, setImportQueue]       = useState<ImportRow[]>([]);
  const [splitTargetId, setSplitTargetId]   = useState<string | null>(null);
  const [splitRows, setSplitRows]           = useState<SplitRow[]>([]);
  const [importing, setImporting]           = useState<string | null>(null);
  const [importError, setImportError]       = useState<string | null>(null);

  // ── Backup ────────────────────────────────────────────────────────────────

  async function handleDownloadBackup() {
    setBackupLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const [
        { data: accts }, { data: txs },   { data: cls },
        { data: ords },  { data: dbs },   { data: dps },
        { data: allocs },{ data: currs },
      ] = await Promise.all([
        supabase.from("accounts").select("*").eq("user_id", uid),
        supabase.from("transactions").select("*").eq("user_id", uid),
        supabase.from("clients").select("*").eq("user_id", uid),
        supabase.from("orders").select("*").eq("user_id", uid),
        supabase.from("debts").select("*").eq("user_id", uid),
        supabase.from("debt_payments").select("*"),
        supabase.from("shared_fee_allocations").select("*"),
        supabase.from("currencies").select("*").eq("user_id", uid),
      ]);

      exportJSONBackup({
        accounts:     (accts   ?? []) as JSONBackupData["accounts"],
        transactions: (txs     ?? []) as JSONBackupData["transactions"],
        clients:      (cls     ?? []) as JSONBackupData["clients"],
        orders:       (ords    ?? []) as JSONBackupData["orders"],
        debts:        (dbs     ?? []) as JSONBackupData["debts"],
        debtPayments: (dps     ?? []) as JSONBackupData["debtPayments"],
        allocations:  (allocs  ?? []) as JSONBackupData["allocations"],
        currencies:   (currs   ?? []) as JSONBackupData["currencies"],
      }, uid);

      setStats({
        txCount:          (txs   ?? []).length,
        accountCount:     (accts ?? []).length,
        debtCount:        (dbs   ?? []).length,
        debtPaymentCount: (dps   ?? []).length,
      });
      setBackupDone(true);
    } finally {
      setBackupLoading(false);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  async function handleReset() {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;
    setResetting(true);
    setResetError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setResetError("Session expirée."); return; }
      const uid = session.user.id;

      // 1. Récupérer les IDs de dettes pour supprimer les paiements liés
      const { data: debtRows } = await supabase.from("debts").select("id").eq("user_id", uid);
      const debtIds = (debtRows ?? []).map((d: { id: string }) => d.id);

      // 2. Supprimer les paiements de dettes (liés par debt_id)
      if (debtIds.length > 0) {
        const { error: dpErr } = await supabase.from("debt_payments").delete().in("debt_id", debtIds);
        if (dpErr) throw new Error(`Échec suppression paiements : ${dpErr.message}`);
      }

      // 3. Réinitialiser les dettes (paid_amount → 0, status → unpaid)
      const { error: debtErr } = await supabase.from("debts").update({
        paid_amount: 0,
        status: "unpaid",
        creation_tx_id: null,
      }).eq("user_id", uid);
      if (debtErr) throw new Error(`Échec réinitialisation dettes : ${debtErr.message}`);

      // 4. Supprimer toutes les transactions (CASCADE → shared_fee_allocations)
      const { error: txErr } = await supabase.from("transactions").delete().eq("user_id", uid);
      if (txErr) throw new Error(`Échec suppression transactions : ${txErr.message}`);

      // 5. Remettre les soldes à 0
      const { error: accErr } = await supabase.from("accounts").update({ balance: 0 }).eq("user_id", uid);
      if (accErr) throw new Error(`Échec remise à zéro des soldes : ${accErr.message}`);

      setResetDone(true);
      setConfirmText("");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Erreur lors de la réinitialisation.");
    } finally {
      setResetting(false);
    }
  }

  // ── Zero Point ────────────────────────────────────────────────────────────

  async function handleApplyZeroPoint(accountId: string) {
    const targetBalance = parseFloat(zeroValues[accountId] ?? "");
    if (isNaN(targetBalance)) return;
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    setZeroApplying(accountId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      // Mirror addAdjustment logic (from useTransactions)
      const { data: fresh } = await supabase.from("accounts").select("balance").eq("id", accountId).single();
      const currentBalance = fresh ? Number(fresh.balance) : Number(account.balance);
      const difference = targetBalance - currentBalance;

      if (Math.abs(difference) >= 0.001) {
        const now = new Date().toISOString().split("T")[0];
        const { error: txErr } = await supabase.from("transactions").insert({
          user_id: uid,
          account_id: accountId,
          type: difference > 0 ? "income" : "expense",
          sub_type: "balance_correction",
          accounting_type: "adjustment",
          amount: Math.abs(difference),
          currency: account.currency,
          transaction_date: now,
          category: "Point zéro",
          note: "Correction de solde — point zéro",
          affects_physical_balance: true,
          balance_after: targetBalance,
          idempotency_key: `zero_${accountId}_${Date.now()}`,
          migration_status: null,
        });
        if (txErr) throw new Error(`Échec correction point zéro : ${txErr.message}`);

        const { error: accErr } = await supabase.from("accounts").update({ balance: targetBalance }).eq("id", accountId);
        if (accErr) throw new Error(`Échec mise à jour solde : ${accErr.message}`);
      }

      setZeroApplied((prev) => new Set([...prev, accountId]));
    } catch (err) {
      setZeroError(err instanceof Error ? err.message : "Erreur lors du point zéro.");
    } finally {
      setZeroApplying(null);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const rows = file.name.endsWith(".json") ? parseJSONImport(content) : parseCSV(content);
      if (rows.length === 0) {
        setImportError("Aucune ligne valide détectée. Vérifiez le format du fichier.");
        return;
      }
      setImportQueue(rows);
      setSplitTargetId(null);
      setSplitRows([]);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  async function handleValidateRow(rowId: string) {
    const row = importQueue.find((r) => r.id === rowId);
    if (!row) return;
    setImporting(rowId);
    setImportError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: uid,
        account_id: null,
        type: row.type,
        sub_type: null,
        accounting_type: row.type === "income" ? "real_income" : "real_expense",
        amount: row.amount,
        currency: row.currency,
        transaction_date: row.date || new Date().toISOString().split("T")[0],
        category: row.category || row.description || null,
        note: row.description || null,
        affects_physical_balance: false,
        balance_after: null,
        idempotency_key: `hist_${rowId}`,
        migration_status: "pending_review",
      });
      if (txErr) throw new Error(`Échec import transaction : ${txErr.message}`);

      setImportQueue((prev) => prev.map((r) => r.id === rowId ? { ...r, status: "validated" } : r));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setImporting(null);
    }
  }

  function handleIgnoreRow(rowId: string) {
    setImportQueue((prev) => prev.map((r) => r.id === rowId ? { ...r, status: "ignored" } : r));
    if (splitTargetId === rowId) { setSplitTargetId(null); setSplitRows([]); }
  }

  function handleStartSplit(rowId: string) {
    const row = importQueue.find((r) => r.id === rowId);
    if (!row) return;
    setSplitTargetId(rowId);
    setSplitRows([
      { id: `s0_${Date.now()}`, amount: "", category: row.category, description: row.description, type: row.type },
    ]);
  }

  function handleAddSplitRow() {
    setSplitRows((prev) => [...prev, {
      id: `s${prev.length}_${Date.now()}`, amount: "", category: "", description: "", type: "expense",
    }]);
  }

  function handleRemoveSplitRow(splitId: string) {
    setSplitRows((prev) => prev.filter((r) => r.id !== splitId));
  }

  function handleUpdateSplitRow(splitId: string, field: keyof SplitRow, value: string) {
    setSplitRows((prev) => prev.map((r) => r.id === splitId ? { ...r, [field]: value } : r));
  }

  async function handleValidateSplit() {
    const targetRow = importQueue.find((r) => r.id === splitTargetId);
    if (!targetRow || !splitValid) return;
    setImporting(splitTargetId!);
    setImportError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      for (const split of splitRows) {
        const amt = Number(split.amount);
        if (amt <= 0) continue;
        const { error: splitErr } = await supabase.from("transactions").insert({
          user_id: uid,
          account_id: null,
          type: split.type,
          sub_type: null,
          accounting_type: split.type === "income" ? "real_income" : "real_expense",
          amount: amt,
          currency: targetRow.currency,
          transaction_date: targetRow.date || new Date().toISOString().split("T")[0],
          category: split.category || split.description || null,
          note: `[Divisé] ${split.description || targetRow.description || ""}`.trim() || null,
          affects_physical_balance: false,
          balance_after: null,
          idempotency_key: `hist_split_${split.id}`,
          migration_status: "pending_review",
        });
        if (splitErr) throw new Error(`Échec import transaction divisée : ${splitErr.message}`);
      }

      setImportQueue((prev) => prev.map((r) => r.id === splitTargetId ? { ...r, status: "validated" } : r));
      setSplitTargetId(null);
      setSplitRows([]);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur lors de la division.");
    } finally {
      setImporting(null);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const splitTarget = useMemo(
    () => importQueue.find((r) => r.id === splitTargetId) ?? null,
    [importQueue, splitTargetId]
  );
  const splitTotal     = splitRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const splitRemaining = splitTarget ? splitTarget.amount - splitTotal : 0;
  const splitValid     = splitTarget ? Math.abs(splitRemaining) < 0.001 && splitRows.length > 0 : false;

  const pendingCount   = importQueue.filter((r) => r.status === "pending").length;
  const validatedCount = importQueue.filter((r) => r.status === "validated").length;
  const ignoredCount   = importQueue.filter((r) => r.status === "ignored").length;

  const resetReady = confirmText.trim().toUpperCase() === CONFIRM_WORD && !resetDone;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-start gap-3">
          <Link
            href={`/${locale}/settings`}
            className="mt-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
            aria-label="Retour aux paramètres"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-50">
              Réinitialisation & reprise historique
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Outil avancé — nettoyer les données et reconstruire l&apos;historique proprement.
            </p>
          </div>
        </div>

        {/* Global warning */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">Outil sensible.</span> Toute réinitialisation peut modifier
            fortement vos données. Téléchargez un backup complet avant de continuer.
          </p>
        </div>

        {/* ── ÉTAPE 1: BACKUP ── */}
        <div className="space-y-3">
          <SectionHeader label="Étape 1 — Backup obligatoire" />
          <Card>
            <div className="space-y-4">
              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Transactions",  value: stats.txCount },
                    { label: "Comptes",        value: stats.accountCount },
                    { label: "Dettes",         value: stats.debtCount },
                    { label: "Paiements dettes", value: stats.debtPaymentCount },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                      <p className="font-mono text-lg font-bold text-slate-100">{value}</p>
                      <p className="text-[10px] text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleDownloadBackup}
                disabled={backupLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {backupLoading ? (
                  <>
                    <Shield size={15} className="animate-pulse" />
                    Génération du backup…
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    Télécharger le backup JSON complet
                  </>
                )}
              </button>

              {backupDone && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3.5 py-2.5">
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                  <p className="text-sm text-emerald-400">
                    Backup téléchargé. Vous pouvez utiliser les outils ci-dessous.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── ÉTAPE 2: OPÉRATIONS (visible après backup) ── */}
        {backupDone && (
          <div className="space-y-3">
            <SectionHeader label="Étape 2 — Choisir l'opération" />

            <div className="space-y-2">

              {/* A — Reset transactions */}
              <OperationCard
                icon={<RotateCcw size={15} className="text-red-400" />}
                title="Réinitialiser les transactions"
                description="Supprime toutes les transactions et remet les soldes à zéro. Clients, commandes et comptes sont conservés."
                danger
                open={activeSection === "reset"}
                onToggle={() => setActiveSection(activeSection === "reset" ? null : "reset")}
              >
                {resetDone ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3.5 py-3">
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                    <p className="text-sm text-emerald-400">
                      Réinitialisation effectuée. Utilisez &ldquo;Point Zéro&rdquo; pour calibrer les soldes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Impact */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                        Ce qui sera supprimé
                      </p>
                      <ul className="space-y-0.5 text-xs text-red-300/80">
                        <li>• {stats?.txCount ?? "?"} transaction(s)</li>
                        <li>• Toutes les allocations de frais partagés</li>
                        <li>• Tous les paiements de dettes ({stats?.debtPaymentCount ?? "?"})</li>
                        <li>• Soldes de comptes → remis à 0</li>
                        <li>• Montants remboursés des dettes → remis à 0</li>
                      </ul>
                      <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Ce qui est conservé
                      </p>
                      <ul className="space-y-0.5 text-xs text-slate-400">
                        <li>• Comptes (structure, noms)</li>
                        <li>• Clients &amp; Commandes</li>
                        <li>• Dettes &amp; Créances (structure)</li>
                        <li>• Transferts (enregistrements)</li>
                        <li>• Paramètres &amp; Devises</li>
                      </ul>
                    </div>

                    {/* Confirmation text */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Tapez{" "}
                        <span className="font-mono text-red-300">{CONFIRM_WORD}</span>{" "}
                        pour confirmer
                      </label>
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={CONFIRM_WORD}
                        className={`${inputCls} font-mono tracking-widest`}
                      />
                    </div>

                    {resetError && (
                      <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-3.5 py-2.5">
                        <p className="text-xs text-red-400">{resetError}</p>
                      </div>
                    )}

                    <button
                      onClick={handleReset}
                      disabled={!resetReady || resetting}
                      aria-label="Confirmer la réinitialisation"
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors bg-red-700 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      <RotateCcw size={14} />
                      {resetting ? "Réinitialisation en cours…" : "Confirmer la réinitialisation"}
                    </button>
                  </div>
                )}
              </OperationCard>

              {/* B — Point Zéro */}
              <OperationCard
                icon={<Target size={15} className="text-sky-400" />}
                title="Point zéro — Calibrer les soldes"
                description="Définissez le solde réel de chaque compte. Crée des corrections non comptées comme revenus ou dépenses."
                open={activeSection === "zerop"}
                onToggle={() => setActiveSection(activeSection === "zerop" ? null : "zerop")}
              >
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Le point zéro permet de repartir avec les vrais soldes actuels sans reconstruire
                    tout le passé. Chaque correction est enregistrée comme ajustement.
                  </p>
                  {accounts.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-600">Aucun compte disponible.</p>
                  ) : (
                    accounts.map((acc) => {
                      const applied  = zeroApplied.has(acc.id);
                      const applying = zeroApplying === acc.id;
                      return (
                        <div
                          key={acc.id}
                          className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-200">{acc.name}</p>
                            <p className="text-[11px] text-slate-600">
                              Solde app :{" "}
                              <span className="font-mono text-slate-400">
                                {formatMoney(acc.balance, acc.currency)}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {applied ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-400">
                                <CheckCircle2 size={12} /> Appliqué
                              </span>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder={`Solde réel (${acc.currency})`}
                                  value={zeroValues[acc.id] ?? ""}
                                  onChange={(e) => setZeroValues((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                                  aria-label={`Solde réel pour ${acc.name}`}
                                  className="w-36 rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-right font-mono text-sm text-slate-100 tabular-nums focus:border-orange-500/70 focus:outline-none"
                                />
                                <button
                                  onClick={() => handleApplyZeroPoint(acc.id)}
                                  disabled={!zeroValues[acc.id] || applying}
                                  aria-label={`Appliquer point zéro pour ${acc.name}`}
                                  className="rounded-xl bg-sky-700/80 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                                >
                                  {applying ? "…" : "Appliquer"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {zeroError && (
                    <div className="mt-3 rounded-xl border border-red-800/50 bg-red-950/30 px-3.5 py-2.5">
                      <p className="text-xs text-red-400">{zeroError}</p>
                    </div>
                  )}
                </div>
              </OperationCard>

              {/* C — Import historique */}
              <OperationCard
                icon={<Upload size={15} className="text-violet-400" />}
                title="Importer un historique"
                description="Importez un CSV ou JSON. Les lignes vont dans une file de validation. Elles n'affectent pas les soldes physiques."
                open={activeSection === "import"}
                onToggle={() => setActiveSection(activeSection === "import" ? null : "import")}
              >
                <div className="space-y-4">

                  {/* File upload */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Fichier CSV ou JSON
                    </label>
                    <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 py-4 text-sm text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-300">
                      <Upload size={14} />
                      Choisir un fichier
                      <input
                        type="file"
                        accept=".csv,.json"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    <p className="mt-1.5 text-[11px] text-slate-600">
                      CSV — colonnes : date, montant, devise, type, description, categorie{" · "}
                      JSON — format backup app ou tableau simple
                    </p>
                  </div>

                  {importError && (
                    <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-3.5 py-2.5">
                      <p className="text-xs text-red-400">{importError}</p>
                    </div>
                  )}

                  {/* Queue stats */}
                  {importQueue.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-slate-500">
                        {importQueue.length} ligne{importQueue.length > 1 ? "s" : ""}
                      </span>
                      {pendingCount > 0 && (
                        <span className="text-amber-400">{pendingCount} en attente</span>
                      )}
                      {validatedCount > 0 && (
                        <span className="text-emerald-400">
                          {validatedCount} importée{validatedCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {ignoredCount > 0 && (
                        <span className="text-slate-600">{ignoredCount} ignorée{ignoredCount > 1 ? "s" : ""}</span>
                      )}
                      {pendingCount === 0 && validatedCount > 0 && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 size={11} /> Import terminé — vérifiez la page Migration pour les valider.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Import queue */}
                  {importQueue.length > 0 && (
                    <div className="space-y-2">
                      {importQueue.map((row) => {
                        const isSplitting = splitTargetId === row.id;
                        return (
                          <div
                            key={row.id}
                            className={`rounded-xl border transition-colors ${
                              row.status === "validated"
                                ? "border-emerald-800/30 bg-emerald-950/10"
                                : row.status === "ignored"
                                ? "border-slate-800 bg-slate-900/20 opacity-40"
                                : "border-slate-800 bg-slate-900/40"
                            }`}
                          >
                            {/* Row summary */}
                            <div className="flex items-center gap-2.5 p-3">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${
                                row.status === "validated" ? "bg-emerald-500"
                                : row.status === "ignored"  ? "bg-slate-600"
                                : row.type === "income"     ? "bg-emerald-500/60"
                                : "bg-red-500/60"
                              }`} />

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] text-slate-500">{row.date}</span>
                                  <span className={`font-mono text-sm font-semibold tabular-nums ${
                                    row.type === "income" ? "text-emerald-400" : "text-red-400"
                                  }`}>
                                    {row.type === "income" ? "+" : "−"}
                                    {formatMoney(row.amount, row.currency)}
                                  </span>
                                </div>
                                {row.description && (
                                  <p className="truncate text-[11px] text-slate-600">{row.description}</p>
                                )}
                              </div>

                              {row.status === "pending" && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    onClick={() => handleValidateRow(row.id)}
                                    disabled={importing === row.id}
                                    aria-label="Valider et importer"
                                    className="rounded-lg bg-emerald-900/40 px-2 py-1.5 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-900/60"
                                  >
                                    {importing === row.id ? "…" : "Valider"}
                                  </button>
                                  <button
                                    onClick={() => handleStartSplit(row.id)}
                                    aria-label="Diviser cette transaction"
                                    className="rounded-lg bg-violet-900/30 px-2 py-1.5 text-[10px] font-semibold text-violet-400 transition-colors hover:bg-violet-900/50"
                                  >
                                    Diviser
                                  </button>
                                  <button
                                    onClick={() => handleIgnoreRow(row.id)}
                                    aria-label="Ignorer cette ligne"
                                    className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-400"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              )}

                              {row.status === "validated" && (
                                <span className="shrink-0 text-[10px] font-medium text-emerald-400">
                                  ✓ Importée
                                </span>
                              )}
                            </div>

                            {/* Split UI */}
                            {isSplitting && splitTarget && (
                              <div className="border-t border-slate-800 p-3.5">
                                {/* Split header */}
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-slate-400">
                                    Division de la transaction
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                                    <span className="text-slate-500">
                                      Original : {formatMoney(splitTarget.amount, splitTarget.currency)}
                                    </span>
                                    <span className={Math.abs(splitRemaining) < 0.001 ? "text-emerald-400" : "text-amber-400"}>
                                      Reste : {splitRemaining.toFixed(2)}
                                    </span>
                                  </div>
                                </div>

                                {/* Split rows */}
                                <div className="space-y-2">
                                  {splitRows.map((sr) => (
                                    <div key={sr.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                                      <div className="flex items-center gap-2">
                                        <select
                                          value={sr.type}
                                          onChange={(e) => handleUpdateSplitRow(sr.id, "type", e.target.value)}
                                          className={`${miniInputCls} w-28`}
                                        >
                                          <option value="expense">Dépense</option>
                                          <option value="income">Revenu</option>
                                        </select>
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="Montant"
                                          value={sr.amount}
                                          onChange={(e) => handleUpdateSplitRow(sr.id, "amount", e.target.value)}
                                          className={`${miniInputCls} w-24 text-right font-mono tabular-nums`}
                                        />
                                        <button
                                          onClick={() => handleRemoveSplitRow(sr.id)}
                                          aria-label="Supprimer cette ligne"
                                          className="ml-auto shrink-0 rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-red-400"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                      <div className="mt-2 flex gap-2">
                                        <input
                                          placeholder="Catégorie"
                                          value={sr.category}
                                          onChange={(e) => handleUpdateSplitRow(sr.id, "category", e.target.value)}
                                          className={`${miniInputCls} flex-1`}
                                        />
                                        <input
                                          placeholder="Note"
                                          value={sr.description}
                                          onChange={(e) => handleUpdateSplitRow(sr.id, "description", e.target.value)}
                                          className={`${miniInputCls} flex-1`}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* Split validation message */}
                                {!splitValid && splitRows.length > 0 && (
                                  <p className="mt-2 text-[11px] text-amber-400">
                                    Total divisé ({formatMoney(splitTotal, splitTarget.currency)}) ≠ montant original (
                                    {formatMoney(splitTarget.amount, splitTarget.currency)}).
                                  </p>
                                )}

                                {/* Split actions */}
                                <div className="mt-3 flex items-center gap-2">
                                  <button
                                    onClick={handleAddSplitRow}
                                    className="flex items-center gap-1 text-xs text-violet-400 transition-colors hover:text-violet-300"
                                  >
                                    <Plus size={11} /> Ajouter une ligne
                                  </button>
                                  <div className="flex-1" />
                                  <button
                                    onClick={() => { setSplitTargetId(null); setSplitRows([]); }}
                                    className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800"
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    onClick={handleValidateSplit}
                                    disabled={!splitValid || importing === splitTargetId}
                                    aria-label="Valider la division"
                                    className="rounded-xl bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                                  >
                                    {importing === splitTargetId ? "…" : "Valider la division"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </OperationCard>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

// ── OperationCard helper ──────────────────────────────────────────────────────

function OperationCard({
  icon, title, description, danger = false, open, onToggle, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  danger?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border transition-colors ${
      open
        ? danger
          ? "border-red-800/40 bg-red-950/10"
          : "border-orange-600/30 bg-slate-900"
        : "border-slate-800 bg-slate-900/40"
    }`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${danger ? "text-red-300" : "text-slate-100"}`}>
            {title}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <span className="shrink-0 text-slate-600">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-4">
          {children}
        </div>
      )}
    </div>
  );
}
