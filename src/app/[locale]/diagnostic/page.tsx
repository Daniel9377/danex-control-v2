"use client";

/**
 * DIAGNOSTIC PAGE — Supabase Schema Checker
 *
 * Route: /[locale]/diagnostic
 *
 * Purpose: Verifies that all required tables and columns exist in Supabase
 * before going live. Safe to run multiple times (only reads, never writes).
 *
 * Remove or protect this page before production if needed.
 */

import { useEffect, useState } from "react";
import { use } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageWrapper } from "@/components/layout/PageWrapper";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Database,
  Table2,
  Columns,
  Wifi,
} from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

type CheckStatus = "pending" | "ok" | "error" | "warning";

interface CheckResult {
  id: string;
  label: string;
  detail?: string;
  status: CheckStatus;
  errorCode?: string;
  hint?: string;
}

// ── All checks to run ─────────────────────────────────────────────────────────

type CheckDef = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: (sb: ReturnType<typeof createClient>) => Promise<{ ok: boolean; detail?: string; code?: string }>;
};

const CHECKS: CheckDef[] = [
  // ── Connection ────────────────────────────────────────────────────────────
  {
    id: "connection",
    group: "Connexion",
    label: "Connexion Supabase",
    hint: "Vérifie que l'application peut se connecter à Supabase.",
    run: async (sb) => {
      const { data, error } = await sb.from("profiles").select("id").limit(1);
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true, detail: "Connexion établie" };
    },
  },

  // ── Tables originales ─────────────────────────────────────────────────────
  {
    id: "tbl_profiles",
    group: "Tables originales",
    label: "Table: profiles",
    run: async (sb) => {
      const { error } = await sb.from("profiles").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_accounts",
    group: "Tables originales",
    label: "Table: accounts",
    run: async (sb) => {
      const { error } = await sb.from("accounts").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_transactions",
    group: "Tables originales",
    label: "Table: transactions",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_transfers",
    group: "Tables originales",
    label: "Table: transfers",
    run: async (sb) => {
      const { error } = await sb.from("transfers").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_debts",
    group: "Tables originales",
    label: "Table: debts",
    run: async (sb) => {
      const { error } = await sb.from("debts").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_debt_payments",
    group: "Tables originales",
    label: "Table: debt_payments",
    run: async (sb) => {
      const { error } = await sb.from("debt_payments").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_clients",
    group: "Tables originales",
    label: "Table: clients",
    run: async (sb) => {
      const { error } = await sb.from("clients").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_orders",
    group: "Tables originales",
    label: "Table: orders",
    run: async (sb) => {
      const { error } = await sb.from("orders").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "tbl_alerts",
    group: "Tables originales",
    label: "Table: alerts",
    run: async (sb) => {
      const { error } = await sb.from("alerts").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },

  // ── Migration 001 — colonnes comptables ───────────────────────────────────
  {
    id: "col_tx_accounting_type",
    group: "Migration 001 (colonnes comptables)",
    label: "transactions.accounting_type",
    hint: "Ajoutée par migration 001_accounting_improvements.sql",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("accounting_type").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 001", code: error.code };
      if (error?.code === "42P01") return { ok: false, detail: "Table transactions absente", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_tx_balance_after",
    group: "Migration 001 (colonnes comptables)",
    label: "transactions.balance_after",
    hint: "Ajoutée par migration 001_accounting_improvements.sql",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("balance_after").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 001", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_debts_affects_balance",
    group: "Migration 001 (colonnes comptables)",
    label: "debts.affects_balance",
    hint: "Ajoutée par migration 001_accounting_improvements.sql",
    run: async (sb) => {
      const { error } = await sb.from("debts").select("affects_balance").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 001", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_dp_settlement_method",
    group: "Migration 001 (colonnes comptables)",
    label: "debt_payments.settlement_method",
    hint: "Ajoutée par migration 001_accounting_improvements.sql",
    run: async (sb) => {
      const { error } = await sb.from("debt_payments").select("settlement_method").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 001", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },

  // ── Migration 002 — nouvelles colonnes transactions ───────────────────────
  {
    id: "col_tx_sub_type",
    group: "Migration 002 (sous-types & liaisons)",
    label: "transactions.sub_type",
    hint: "Colonne clé du nouveau système de classification",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("sub_type").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_tx_client_id",
    group: "Migration 002 (sous-types & liaisons)",
    label: "transactions.client_id",
    hint: "Lien transaction → client DANEX",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("client_id").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_tx_order_id",
    group: "Migration 002 (sous-types & liaisons)",
    label: "transactions.order_id",
    hint: "Lien transaction → commande",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("order_id").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_tx_idempotency_key",
    group: "Migration 002 (sous-types & liaisons)",
    label: "transactions.idempotency_key",
    hint: "Protection anti-double-clic",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("idempotency_key").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_tx_exchange_rate",
    group: "Migration 002 (sous-types & liaisons)",
    label: "transactions.exchange_rate",
    hint: "Multi-devises — taux de change",
    run: async (sb) => {
      const { error } = await sb.from("transactions").select("exchange_rate").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },

  // ── Migration 002 — colonnes orders ──────────────────────────────────────
  {
    id: "col_orders_real_profit",
    group: "Migration 002 (suivi bénéfice commandes)",
    label: "orders.real_profit_amount",
    hint: "Montant du bénéfice validé par commande",
    run: async (sb) => {
      const { error } = await sb.from("orders").select("real_profit_amount").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
  {
    id: "col_orders_profit_validated_at",
    group: "Migration 002 (suivi bénéfice commandes)",
    label: "orders.profit_validated_at",
    hint: "Date de validation du bénéfice",
    run: async (sb) => {
      const { error } = await sb.from("orders").select("profit_validated_at").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },

  // ── Migration 002 — colonnes debts ────────────────────────────────────────
  {
    id: "col_debts_creation_tx_id",
    group: "Migration 002 (liaison dettes)",
    label: "debts.creation_tx_id",
    hint: "Lien dette → transaction créatrice",
    run: async (sb) => {
      const { error } = await sb.from("debts").select("creation_tx_id").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },

  // ── Migration 002 — colonne accounts.availability ─────────────────────────
  {
    id: "col_accounts_availability",
    group: "Migration 002 (disponibilité comptes)",
    label: "accounts.availability",
    hint: "immediate / close / distant / blocked",
    run: async (sb) => {
      const { error } = await sb.from("accounts").select("availability").limit(1);
      if (error?.code === "42703") return { ok: false, detail: "Colonne absente → exécute migration 002", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },

  // ── Migration 002 — nouvelle table shared_fee_allocations ─────────────────
  {
    id: "tbl_shared_fee_allocations",
    group: "Migration 002 (frais partagés)",
    label: "Table: shared_fee_allocations",
    hint: "Répartition des frais entre plusieurs clients",
    run: async (sb) => {
      const { error } = await sb.from("shared_fee_allocations").select("id").limit(1);
      if (error?.code === "42P01") return { ok: false, detail: "Table absente → exécute migration 002", code: error.code };
      if (error?.code === "42703") return { ok: false, detail: "Table existante mais colonnes manquantes", code: error.code };
      if (error) return { ok: false, detail: error.message, code: error.code };
      return { ok: true };
    },
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiagnosticPage({ params }: Props) {
  const { locale } = use(params);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  async function runChecks() {
    setRunning(true);
    const sb = createClient();

    // Initialise all as pending
    const initial: CheckResult[] = CHECKS.map((c) => ({
      id: c.id,
      label: c.label,
      status: "pending" as CheckStatus,
      hint: c.hint,
    }));
    setResults(initial);

    // Run each check sequentially for clear progress feedback
    const final: CheckResult[] = [];
    for (const check of CHECKS) {
      try {
        const res = await check.run(sb);
        final.push({
          id: check.id,
          label: check.label,
          status: res.ok ? "ok" : "error",
          detail: res.detail,
          errorCode: res.code,
          hint: check.hint,
        });
      } catch (e) {
        final.push({
          id: check.id,
          label: check.label,
          status: "error",
          detail: e instanceof Error ? e.message : "Erreur inconnue",
          hint: check.hint,
        });
      }
      setResults([...final, ...CHECKS.slice(final.length).map((c) => ({
        id: c.id, label: c.label, status: "pending" as CheckStatus, hint: c.hint,
      }))]);
    }

    setLastRun(new Date());
    setRunning(false);
  }

  useEffect(() => {
    runChecks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grouping
  const groups = CHECKS.reduce<Record<string, { label: string; checks: CheckResult[] }>>((acc, check) => {
    if (!acc[check.group]) acc[check.group] = { label: check.group, checks: [] };
    const result = results.find((r) => r.id === check.id);
    if (result) acc[check.group].checks.push(result);
    return acc;
  }, {});

  const total = results.length;
  const passed = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;
  const pending = results.filter((r) => r.status === "pending").length;

  const migration001Ok = [
    "col_tx_accounting_type", "col_tx_balance_after",
    "col_debts_affects_balance", "col_dp_settlement_method",
  ].every((id) => results.find((r) => r.id === id)?.status === "ok");

  const migration002Ok = results
    .filter((r) => r.id.startsWith("col_tx_sub") || r.id.startsWith("col_tx_client") || r.id.startsWith("col_tx_order") || r.id === "tbl_shared_fee_allocations")
    .every((r) => r.status === "ok");

  const allOk = failed === 0 && pending === 0;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-5 pb-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-strong)] flex items-center gap-2">
              <Database size={20} className="text-[var(--brand-text)]" />
              Diagnostic Supabase
            </h1>
            <p className="mt-1 text-xs text-[var(--text-label)]">
              Vérifie que toutes les tables et colonnes requises existent dans ta base de données.
            </p>
          </div>
          <button
            onClick={runChecks}
            disabled={running}
            className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--text-body)] hover:bg-[var(--surface-chip)] disabled:opacity-40"
          >
            <RefreshCw size={14} className={running ? "animate-spin" : ""} />
            {running ? "Vérification…" : "Relancer"}
          </button>
        </div>

        {/* Summary banner */}
        {!running && total > 0 && (
          <div className={`rounded-xl border p-4 ${
            allOk
              ? "border-emerald-800/60 bg-emerald-950/30"
              : failed > 0
              ? "border-red-800/60 bg-red-950/30"
              : "border-[var(--border-strong)] bg-[var(--surface-glass)]"
          }`}>
            <div className="flex items-center gap-3">
              {allOk ? (
                <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
              ) : failed > 0 ? (
                <XCircle size={22} className="text-red-400 shrink-0" />
              ) : (
                <AlertCircle size={22} className="text-amber-400 shrink-0" />
              )}
              <div>
                <p className={`font-semibold ${allOk ? "text-emerald-400" : failed > 0 ? "text-red-400" : "text-[var(--text-body)]"}`}>
                  {allOk
                    ? "✅ Toutes les vérifications passent — prêt pour Vercel"
                    : failed > 0
                    ? `❌ ${failed} vérification${failed > 1 ? "s" : ""} échouée${failed > 1 ? "s" : ""} — migration incomplète`
                    : "⏳ Vérification en cours…"}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {passed}/{total} OK
                  {lastRun && ` · Dernière vérification : ${lastRun.toLocaleTimeString()}`}
                </p>
              </div>
            </div>

            {/* Migration status quick view */}
            {!running && (
              <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-3">
                <MigrationBadge
                  label="Migration 001 (comptabilité)"
                  ok={migration001Ok}
                  file="001_accounting_improvements.sql"
                />
                <MigrationBadge
                  label="Migration 002 (clients/orders)"
                  ok={migration002Ok}
                  file="002_client_order_tracking.sql"
                />
              </div>
            )}
          </div>
        )}

        {/* Results by group */}
        {Object.values(groups).map((group) => (
          <section key={group.label} className="space-y-1.5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-label)]">
              <Columns size={12} />
              {group.label}
            </h2>
            <div className="space-y-1">
              {group.checks.map((result) => (
                <CheckRow key={result.id} result={result} />
              ))}
            </div>
          </section>
        ))}

        {/* Instructions */}
        <section className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-body)]">
            Comment appliquer une migration manquante
          </h2>

          <div className="space-y-3 text-xs text-[var(--text-muted)] leading-relaxed">
            <Step n={1} title="Ouvrir Supabase Dashboard">
              Va sur <span className="text-[var(--brand-text)]">supabase.com → ton projet → SQL Editor</span>
            </Step>
            <Step n={2} title="Si migration 001 manque">
              Ouvre le fichier <code className="rounded bg-[var(--surface-chip)] px-1 text-[var(--text-body)]">supabase/migrations/001_accounting_improvements.sql</code>,
              copie tout le contenu, colle-le dans l'éditeur SQL, clique <strong className="text-[var(--text-body)]">Run</strong>.
            </Step>
            <Step n={3} title="Si migration 002 manque">
              Ouvre le fichier <code className="rounded bg-[var(--surface-chip)] px-1 text-[var(--text-body)]">supabase/migrations/002_client_order_tracking.sql</code>,
              copie tout le contenu, colle-le dans l'éditeur SQL, clique <strong className="text-[var(--text-body)]">Run</strong>.
            </Step>
            <Step n={4} title="Revenir ici">
              Clique <strong className="text-[var(--text-body)]">Relancer</strong> en haut pour re-vérifier. Tout doit passer au vert.
            </Step>
            <Step n={5} title="Si une partie était déjà exécutée">
              Le SQL utilise <code className="rounded bg-[var(--surface-chip)] px-1 text-[var(--text-body)]">IF NOT EXISTS</code> et <code className="rounded bg-[var(--surface-chip)] px-1 text-[var(--text-body)]">DROP CONSTRAINT IF EXISTS</code> — tu peux le relancer sans risque même si certaines colonnes existent déjà.
            </Step>
          </div>
        </section>

        {/* Tables reference */}
        <section className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-body)]">
            <Table2 size={14} />
            Référence : colonnes attendues dans transactions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-[var(--text-muted)]">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-left text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                  <th className="pb-1.5 pr-4">Colonne</th>
                  <th className="pb-1.5 pr-4">Type</th>
                  <th className="pb-1.5">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {[
                  ["id", "UUID PK", "original"],
                  ["user_id", "UUID FK", "original"],
                  ["account_id", "UUID FK", "original"],
                  ["type", "TEXT", "original"],
                  ["amount", "NUMERIC", "original"],
                  ["currency", "TEXT", "original"],
                  ["category", "TEXT", "original"],
                  ["note", "TEXT", "original"],
                  ["transaction_date", "DATE", "original"],
                  ["accounting_type", "TEXT", "migration 001"],
                  ["balance_after", "NUMERIC", "migration 001"],
                  ["sub_type", "TEXT", "migration 002 ★"],
                  ["client_id", "UUID FK", "migration 002 ★"],
                  ["order_id", "UUID FK", "migration 002 ★"],
                  ["idempotency_key", "TEXT UNIQUE", "migration 002 ★"],
                  ["exchange_rate", "NUMERIC", "migration 002 ★"],
                  ["amount_base", "NUMERIC", "migration 002 ★"],
                  ["base_currency", "TEXT", "migration 002 ★"],
                  ["created_at", "TIMESTAMPTZ", "original"],
                ].map(([col, type, source]) => (
                  <tr key={col}>
                    <td className="py-1 pr-4 font-mono text-[var(--text-body)]">{col}</td>
                    <td className="py-1 pr-4 text-[var(--text-label)]">{type}</td>
                    <td className={`py-1 ${source.includes("★") ? "text-[var(--brand-text)]" : source.includes("001") ? "text-blue-400" : "text-[var(--text-faint)]"}`}>
                      {source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Warning: remove before production */}
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
          <p className="text-xs text-amber-400">
            <strong>Note :</strong> cette page est un outil de développement. Tu peux la supprimer ou la protéger avant de mettre en production publique.
            Route : <code className="text-amber-300">/fr/diagnostic</code> ou <code className="text-amber-300">/en/diagnostic</code>
          </p>
        </div>

      </div>
    </PageWrapper>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CheckRow({ result }: { result: CheckResult }) {
  const icons = {
    pending: <div className="h-4 w-4 animate-pulse rounded-full bg-[var(--border-strong)]" />,
    ok:      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />,
    error:   <XCircle size={16} className="text-red-400 shrink-0" />,
    warning: <AlertCircle size={16} className="text-amber-400 shrink-0" />,
  };

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
      result.status === "ok"      ? "border-emerald-900/40 bg-emerald-950/10"
      : result.status === "error" ? "border-red-900/40 bg-red-950/10"
      : result.status === "warning" ? "border-amber-900/40 bg-amber-950/10"
      : "border-[var(--border-default)] bg-[var(--surface-card)]/20"
    }`}>
      <div className="mt-0.5">{icons[result.status]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-mono ${
            result.status === "ok" ? "text-[var(--text-body)]"
            : result.status === "error" ? "text-red-300"
            : "text-[var(--text-muted)]"
          }`}>
            {result.label}
          </span>
          {result.errorCode && (
            <span className="rounded bg-red-950/60 px-1 py-0.5 text-[10px] text-red-400 font-mono">
              PG {result.errorCode}
            </span>
          )}
        </div>
        {result.detail && result.status !== "ok" && (
          <p className="mt-0.5 text-xs text-red-400">{result.detail}</p>
        )}
        {result.hint && result.status === "error" && (
          <p className="mt-0.5 text-xs text-[var(--text-label)]">{result.hint}</p>
        )}
      </div>
    </div>
  );
}

function MigrationBadge({ label, ok, file }: { label: string; ok: boolean; file: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
      ok ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/40"
         : "bg-red-900/30 text-red-400 border border-red-800/40"
    }`}>
      {ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {ok ? "✓" : "✗"} {label}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-fill)]/30 text-[10px] font-bold text-[var(--brand-text)]">
        {n}
      </span>
      <div>
        <span className="font-medium text-[var(--text-body)]">{title} — </span>
        {children}
      </div>
    </div>
  );
}
