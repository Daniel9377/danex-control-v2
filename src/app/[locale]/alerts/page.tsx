"use client";

import { use, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useFinancialAlerts } from "@/hooks/useFinancialAlerts";
import { SmartAlert, AlertSeverity, AlertCategory } from "@/lib/alert-calculations";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Search,
  ArrowRight,
  Users,
  HandCoins,
  Tag,
  Settings2,
  ChevronDown,
  X,
} from "lucide-react";
import { PageWrapper } from "@/components/layout/PageWrapper";

type Props = { params: Promise<{ locale: string }> };

type TabKey = "all" | "critical" | "client" | "debt" | "legacy" | "system";

// ── Severity config ───────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { label: string; color: string; bg: string; border: string; Icon: React.ElementType }
> = {
  critical: {
    label: "Critique",
    color: "text-red-400",
    bg: "bg-red-950/30",
    border: "border-red-800/50",
    Icon: AlertCircle,
  },
  high: {
    label: "Haute",
    color: "text-orange-400",
    bg: "bg-orange-950/20",
    border: "border-orange-800/40",
    Icon: AlertTriangle,
  },
  medium: {
    label: "Moyenne",
    color: "text-yellow-400",
    bg: "bg-yellow-950/20",
    border: "border-yellow-800/30",
    Icon: AlertTriangle,
  },
  low: {
    label: "Faible",
    color: "text-slate-400",
    bg: "bg-slate-800/30",
    border: "border-slate-700",
    Icon: Info,
  },
};

// ── Alert messages ────────────────────────────────────────────────────────────

type AlertMessages = { title: string; message: string };

function getAlertMessages(alert: SmartAlert): AlertMessages {
  const p = alert.titleParams;
  const m = alert.messageParams;
  switch (alert.type) {
    case "client_deficit":
      return {
        title: `Déficit client : ${p.clientName}`,
        message: `Balance négative (−${m.deficit} ${m.currency}). Fonds personnels probablement utilisés.`,
      };
    case "order_deficit":
      return {
        title: `Commande déficitaire : ${p.orderName}`,
        message: `Reçu : ${m.received} · Coûts : ${m.costs} · Déficit : ${m.deficit} USD (${m.clientName}).`,
      };
    case "order_no_purchase":
      return {
        title: `Argent reçu sans achat`,
        message: `"${m.orderName}" (${m.clientName}) : argent reçu mais aucun achat depuis ${m.days} jours.`,
      };
    case "order_stale":
      return {
        title: `Commande ouverte trop longtemps`,
        message: `"${m.orderName}" (${m.clientName}) au statut "${m.status}" depuis ${m.days} jours.`,
      };
    case "debt_overdue":
      return {
        title: `Dette en retard : ${p.person}`,
        message: `Tu dois ${m.amount} ${m.currency} à ${m.person} depuis ${m.days} jours.`,
      };
    case "debt_due_soon":
      return {
        title: `Dette bientôt échue : ${p.person}`,
        message: `Tu dois ${m.amount} ${m.currency} à ${m.person} dans ${m.days} jours.`,
      };
    case "receivable_overdue":
      return {
        title: `Créance en retard : ${p.person}`,
        message: `${m.person} te doit ${m.amount} ${m.currency} depuis ${m.days} jours.`,
      };
    case "receivable_due_soon":
      return {
        title: `Créance bientôt échue : ${p.person}`,
        message: `${m.person} te doit ${m.amount} ${m.currency} dans ${m.days} jours.`,
      };
    case "personal_balance_negative":
      return {
        title: `Solde personnel estimé négatif`,
        message: `Estimation : −${m.balance} USD (solde physique − argent client − dettes).`,
      };
    case "legacy_unprocessed":
      return {
        title: `Transactions legacy non traitées`,
        message: `${m.count} transaction(s) sans classification. Reclassifie-les pour qu'elles apparaissent dans les rapports.`,
      };
    case "orphan_transaction":
      return {
        title: `Transaction(s) sans compte`,
        message: `${m.count} transaction(s) affectent le solde physique mais n'ont pas de compte associé.`,
      };
    case "duplicate_suspected":
      return {
        title: `Doublons potentiels détectés`,
        message: `${m.count} paire(s) de transactions avec montant, type et date identiques.`,
      };
    case "excessive_corrections":
      return {
        title: `Corrections de solde fréquentes`,
        message: `${m.count} correction(s) sur les 30 derniers jours. Vérifie s'il y a une erreur récurrente.`,
      };
    case "client_money_stale":
      return {
        title: `Argent client inactif : ${p.clientName}`,
        message: `≈${m.amount} ${m.currency} détenus pour ${m.clientName} sans activité depuis ${m.days} jours.`,
      };
    default:
      return { title: String(alert.type), message: "" };
  }
}

// ── Category icon ─────────────────────────────────────────────────────────────

function CategoryIcon({ category }: { category: AlertCategory }) {
  switch (category) {
    case "client": return <Users  size={12} className="shrink-0 text-blue-400/80" />;
    case "debt":   return <HandCoins size={12} className="shrink-0 text-amber-400/80" />;
    case "legacy": return <Tag    size={12} className="shrink-0 text-slate-500" />;
    case "system": return <Settings2 size={12} className="shrink-0 text-purple-400/80" />;
  }
}

// ── Alert row (unified list item) ──────────────────────────────────────────────

function AlertRow({ alert, locale }: { alert: SmartAlert; locale: string }) {
  const cfg = SEVERITY_CONFIG[alert.severity];
  const { Icon } = cfg;
  const { title, message } = getAlertMessages(alert);

  // Severity border-left accent (matching the severity color)
  const severityBorder = {
    critical: "border-l-2 border-red-500/60",
    high:     "border-l-2 border-orange-500/50",
    medium:   "border-l-2 border-yellow-500/40",
    low:      "",
  }[alert.severity];

  return (
    <li className={cn("transition-colors hover:bg-slate-800/20", severityBorder)}>
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon size={15} className={cn("mt-0.5 shrink-0", cfg.color)} />

        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold text-slate-100">
              {title}
            </span>
            <span className={cn(
              "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              cfg.bg, cfg.color, cfg.border
            )}>
              {cfg.label}
            </span>
            <CategoryIcon category={alert.category} />
          </div>
          {/* Message */}
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">{message}</p>
        </div>

        {/* Action link */}
        <Link
          href={`/${locale}${alert.actionHref}`}
          aria-label={`Voir les détails : ${title}`}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
        >
          Voir <ArrowRight size={11} />
        </Link>
      </div>
    </li>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TAB_CONFIG: {
  key: TabKey;
  labelKey: string;
  filter: (a: SmartAlert) => boolean;
}[] = [
  { key: "all",      labelKey: "tab_all",      filter: () => true },
  { key: "critical", labelKey: "tab_critical",  filter: (a) => a.severity === "critical" || a.severity === "high" },
  { key: "client",   labelKey: "tab_client",    filter: (a) => a.category === "client" },
  { key: "debt",     labelKey: "tab_debt",      filter: (a) => a.category === "debt" },
  { key: "legacy",   labelKey: "tab_legacy",    filter: (a) => a.category === "legacy" },
  { key: "system",   labelKey: "tab_system",    filter: (a) => a.category === "system" },
];

const SEVERITY_OPTIONS: { value: AlertSeverity | "all"; label: string }[] = [
  { value: "all",      label: "Toutes les sévérités" },
  { value: "critical", label: "Critique" },
  { value: "high",     label: "Haute" },
  { value: "medium",   label: "Moyenne" },
  { value: "low",      label: "Faible" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlertsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("alerts_smart");

  const { alerts, loading, criticalCount, highCount } = useFinancialAlerts();

  const [activeTab, setActiveTab]         = useState<TabKey>("all");
  const [search, setSearch]               = useState("");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">("all");
  const [openSeverity, setOpenSeverity]   = useState(false);

  const displayedAlerts = useMemo(() => {
    const tabDef = TAB_CONFIG.find((tab) => tab.key === activeTab)!;
    return alerts.filter((alert) => {
      if (!tabDef.filter(alert)) return false;
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const { title, message } = getAlertMessages(alert);
        if (!title.toLowerCase().includes(q) && !message.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [alerts, activeTab, search, severityFilter]);

  const tabCount = (key: TabKey) => {
    const def = TAB_CONFIG.find((tab) => tab.key === key)!;
    return alerts.filter(def.filter).length;
  };

  const activeSeverityLabel =
    SEVERITY_OPTIONS.find((o) => o.value === severityFilter)?.label ?? "Sévérité";

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageWrapper locale={locale}>
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-800" />
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-slate-800" />
            ))}
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-900" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="mx-auto max-w-3xl space-y-4">

        {/* ── Header ── */}
        <div>
          <h1 className="text-xl font-bold text-slate-100">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("subtitle")}</p>
        </div>

        {/* ── Summary pills ── */}
        <div className="flex flex-wrap items-center gap-2">
          {criticalCount > 0 && (
            <button
              onClick={() => { setActiveTab("critical"); setSeverityFilter("critical"); }}
              className="flex items-center gap-1.5 rounded-full border border-red-800/50 bg-red-950/30 px-3 py-1.5 transition-colors hover:border-red-700/60"
            >
              <AlertCircle size={12} className="text-red-400" />
              <span className="text-xs font-semibold text-red-300">
                {criticalCount} critique{criticalCount > 1 ? "s" : ""}
              </span>
            </button>
          )}
          {highCount > 0 && (
            <button
              onClick={() => { setActiveTab("critical"); setSeverityFilter("high"); }}
              className="flex items-center gap-1.5 rounded-full border border-orange-800/40 bg-orange-950/20 px-3 py-1.5 transition-colors hover:border-orange-700/50"
            >
              <AlertTriangle size={12} className="text-orange-400" />
              <span className="text-xs font-semibold text-orange-300">
                {highCount} haute{highCount > 1 ? "s" : ""}
              </span>
            </button>
          )}
          {alerts.length === 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-800/40 bg-emerald-950/20 px-3 py-1.5">
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">{t("all_clear")}</span>
            </div>
          )}
          <span className="ml-auto text-xs text-slate-600">
            {alerts.length} alerte{alerts.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Tab bar — wraps on narrow viewports instead of overflowing ── */}
        <div className="flex flex-wrap gap-0.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
          {TAB_CONFIG.map(({ key, labelKey }) => {
            const count = key !== "all" ? tabCount(key) : undefined;
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-slate-800 text-slate-100 shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t(labelKey as Parameters<typeof t>[0])}
                {count !== undefined && count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? "bg-slate-700 text-slate-300" : "bg-slate-800/80 text-slate-500"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Filters ── */}
        {openSeverity && (
          <div className="fixed inset-0 z-30" onClick={() => setOpenSeverity(false)} />
        )}
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              placeholder={t("search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900 py-2.5 pl-8 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 transition-colors hover:text-slate-400"
                aria-label="Effacer la recherche"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Severity dropdown */}
          <div className="relative z-40 shrink-0">
            <button
              onClick={() => setOpenSeverity(!openSeverity)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                severityFilter !== "all"
                  ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                  : "border-slate-700/80 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              <span className="max-w-[80px] truncate">
                {severityFilter !== "all"
                  ? SEVERITY_OPTIONS.find((o) => o.value === severityFilter)?.label
                  : "Sévérité"}
              </span>
              <ChevronDown
                size={10}
                className={`shrink-0 transition-transform ${openSeverity ? "rotate-180" : ""}`}
              />
            </button>
            {openSeverity && (
              <div className="absolute right-0 top-full z-40 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSeverityFilter(opt.value); setOpenSeverity(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800 ${
                      severityFilter === opt.value ? "text-orange-300" : "text-slate-300"
                    }`}
                  >
                    {severityFilter === opt.value && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active filters strip */}
        {(search || severityFilter !== "all") && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-600">
              {displayedAlerts.length} résultat{displayedAlerts.length !== 1 ? "s" : ""}
            </span>
            {(search || severityFilter !== "all") && (
              <button
                onClick={() => { setSearch(""); setSeverityFilter("all"); }}
                className="flex items-center gap-1 text-[11px] text-slate-600 transition-colors hover:text-slate-400"
              >
                <X size={9} />
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {/* ── Alert list ── */}
        {displayedAlerts.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-14 text-center">
            <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-500/60" />
            <p className="text-sm text-slate-500">{t("empty")}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <ul className="divide-y divide-slate-800/50">
              {displayedAlerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} locale={locale} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
