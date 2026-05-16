import type { AccountingType } from "@/lib/supabase/types";

export type DomainType =
  | "all"
  | "personal"
  | "business"
  | "investment"
  | "debt"
  | "client"
  | "other";

export const DOMAIN_LABELS: Record<DomainType, string> = {
  all: "Tous",
  personal: "Personnel",
  business: "Business",
  investment: "Investissement",
  debt: "Dette",
  client: "Client",
  other: "Autre",
};

export const DOMAINS: DomainType[] = [
  "all", "personal", "business", "investment", "debt", "client", "other",
];

// ── Category lists for the transaction form ──────────────────────────────────

export const EXPENSE_CATEGORIES = [
  // Dépenses personnelles réelles
  "Alimentation",
  "Transport",
  "Logement / Loyer",
  "Hôtel & Voyage",
  "Santé",
  "Études / École",
  "Internet & Téléphone",
  "Abonnements",
  "Shopping / Achats personnels",
  "Restaurant / Sorties",
  "Cadeaux / Aide familiale",
  "Urgence",
  // Dépenses business réelles
  "Business / Sourcing",
  "Marketing",
  "Frais bancaires",
  "Commission payée",
  "Salaire payé",
  "Livraison / Transport colis",
  "Douane / Taxes",
  "Équipement / Matériel",
  // Sorties non-dépense (argent qui sort mais reviendra ou appartient à quelqu'un)
  "Argent prêté",
  "Achat pour client",
  "Remboursement de dette",
  "Compensation / Règlement",
  // Correction de solde
  "Correction de solde",
  // Autre
  "Autre",
] as const;

export const INCOME_CATEGORIES = [
  // Revenus réels
  "Salaire reçu",
  "Bénéfice business",
  "Commission reçue",
  "Vente produit",
  "Service vendu",
  "Bonus",
  "Investissement reçu",
  "Aide familiale",
  "Don reçu",
  // Entrées non-revenu (argent reçu mais pas un bénéfice)
  "Paiement client",
  "Avance client",
  "Argent reçu pour client",
  "Remboursement de prêt",
  "Remboursement de dépense",
  "Compensation reçue",
  // Correction de solde
  "Correction de solde",
  // Autre
  "Autre",
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export type IncomeCategory = typeof INCOME_CATEGORIES[number];

// ── Domain mapping (for dashboard filter) ───────────────────────────────────

export const CATEGORY_DOMAIN: Record<string, DomainType> = {
  // Personnel — dépenses
  "Alimentation": "personal",
  "Transport": "personal",
  "Logement / Loyer": "personal",
  "Hôtel & Voyage": "personal",
  "Santé": "personal",
  "Études / École": "personal",
  "Internet & Téléphone": "personal",
  "Abonnements": "personal",
  "Shopping / Achats personnels": "personal",
  "Restaurant / Sorties": "personal",
  "Cadeaux / Aide familiale": "personal",
  "Urgence": "personal",
  // Personnel — revenus
  "Salaire reçu": "personal",
  "Aide familiale": "personal",
  "Don reçu": "personal",
  // Business — dépenses
  "Business / Sourcing": "business",
  "Marketing": "business",
  "Frais bancaires": "business",
  "Commission payée": "business",
  "Salaire payé": "business",
  "Livraison / Transport colis": "business",
  "Douane / Taxes": "business",
  "Équipement / Matériel": "business",
  // Business — revenus
  "Bénéfice business": "business",
  "Commission reçue": "business",
  "Vente produit": "business",
  "Service vendu": "business",
  "Bonus": "business",
  // Investissement
  "Investissement reçu": "investment",
  // Dette / Prêt
  "Remboursement": "debt",
  "Remboursement de prêt": "debt",
  "Remboursement de dépense": "debt",
  "Remboursement de dette": "debt",
  "Argent prêté": "debt",
  // Client
  "Paiement client": "client",
  "Avance client": "client",
  "Argent reçu pour client": "client",
  "Achat pour client": "client",
  // Neutre
  "Compensation / Règlement": "other",
  "Compensation reçue": "other",
  "Correction de solde": "other",
  // Autre
  "Autre": "other",
};

// ── Accounting type inference from category ──────────────────────────────────
// Used to automatically suggest the accounting_type when the user picks a category.

export const CATEGORY_ACCOUNTING_TYPE: Record<string, AccountingType> = {
  // Real income
  "Salaire reçu": "real_income",
  "Bénéfice business": "real_income",
  "Commission reçue": "real_income",
  "Vente produit": "real_income",
  "Service vendu": "real_income",
  "Bonus": "real_income",
  "Investissement reçu": "real_income",
  "Aide familiale": "real_income",
  "Don reçu": "real_income",
  // Non-income inflows
  "Paiement client": "non_income_inflow",
  "Avance client": "non_income_inflow",
  "Argent reçu pour client": "non_income_inflow",
  "Remboursement de prêt": "non_income_inflow",
  "Remboursement de dépense": "non_income_inflow",
  "Compensation reçue": "non_income_inflow",
  // Real expenses
  "Alimentation": "real_expense",
  "Transport": "real_expense",
  "Logement / Loyer": "real_expense",
  "Hôtel & Voyage": "real_expense",
  "Santé": "real_expense",
  "Études / École": "real_expense",
  "Internet & Téléphone": "real_expense",
  "Abonnements": "real_expense",
  "Shopping / Achats personnels": "real_expense",
  "Restaurant / Sorties": "real_expense",
  "Cadeaux / Aide familiale": "real_expense",
  "Urgence": "real_expense",
  "Business / Sourcing": "real_expense",
  "Marketing": "real_expense",
  "Frais bancaires": "real_expense",
  "Commission payée": "real_expense",
  "Salaire payé": "real_expense",
  "Livraison / Transport colis": "real_expense",
  "Douane / Taxes": "real_expense",
  "Équipement / Matériel": "real_expense",
  // Non-expense outflows
  "Argent prêté": "non_expense_outflow",
  "Achat pour client": "non_expense_outflow",
  "Remboursement de dette": "non_expense_outflow",
  "Compensation / Règlement": "non_expense_outflow",
  // Adjustment
  "Correction de solde": "adjustment",
};
