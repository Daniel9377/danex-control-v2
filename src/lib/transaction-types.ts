import type { TransactionSubType, TransactionType, AccountingType } from "@/lib/supabase/types";

// ── Sub-type → accounting mapping ────────────────────────────────────────────

export const SUB_TYPE_ACCOUNTING: Record<
  TransactionSubType,
  { type: TransactionType; accounting_type: AccountingType }
> = {
  personal_income:           { type: "income",  accounting_type: "real_income" },
  personal_expense:          { type: "expense", accounting_type: "real_expense" },
  business_income:           { type: "income",  accounting_type: "real_income" },
  business_expense:          { type: "expense", accounting_type: "real_expense" },
  client_money_received:     { type: "income",  accounting_type: "non_income_inflow" },
  client_product_purchase:   { type: "expense", accounting_type: "non_expense_outflow" },
  client_shipping_fee:       { type: "expense", accounting_type: "non_expense_outflow" },
  shared_client_fee:         { type: "expense", accounting_type: "non_expense_outflow" },
  client_refund:             { type: "expense", accounting_type: "non_expense_outflow" },
  profit_validated:          { type: "income",  accounting_type: "real_income" },
  debt_received:             { type: "income",  accounting_type: "non_income_inflow" },
  debt_repayment:            { type: "expense", accounting_type: "non_expense_outflow" },
  receivable_created:        { type: "expense", accounting_type: "non_expense_outflow" },
  receivable_repaid:         { type: "income",  accounting_type: "non_income_inflow" },
  balance_correction:        { type: "income",  accounting_type: "adjustment" }, // direction overridden at runtime
  transfer_in:               { type: "income",  accounting_type: "non_income_inflow" },
  transfer_out:              { type: "expense", accounting_type: "non_expense_outflow" },
};

// ── UI metadata per sub-type ──────────────────────────────────────────────────

export type SubTypeMeta = {
  label: string;
  hint: string;
  group: "personnel" | "business" | "client" | "dette" | "autre";
  /** Whether recording this also updates the physical account balance. */
  affectsBalance: boolean;
  /** Form fields required beyond amount, date, note. */
  needsAccount: boolean;
  needsCategory: boolean;
  needsClient: boolean;
  needsOrder: boolean;
  needsPerson: boolean;      // person_name for debt/receivable
  needsDebtSelect: boolean;  // pick existing i_owe debt
  needsReceivableSelect: boolean; // pick existing owes_me debt
  needsAllocations: boolean; // shared fee splits
};

export const SUB_TYPE_META: Record<TransactionSubType, SubTypeMeta> = {
  personal_income: {
    label: "Revenu personnel",
    hint: "Salaire, aide familiale, don… Compté comme vrai revenu.",
    group: "personnel",
    affectsBalance: true,
    needsAccount: true, needsCategory: true, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  personal_expense: {
    label: "Dépense personnelle",
    hint: "Alimentation, loyer, santé… Compté comme vraie dépense.",
    group: "personnel",
    affectsBalance: true,
    needsAccount: true, needsCategory: true, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  business_income: {
    label: "Revenu business",
    hint: "Commission, vente, service… Compté comme vrai revenu business.",
    group: "business",
    affectsBalance: true,
    needsAccount: true, needsCategory: true, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  business_expense: {
    label: "Dépense business",
    hint: "Sourcing, marketing, frais bancaires… Non lié à un client.",
    group: "business",
    affectsBalance: true,
    needsAccount: true, needsCategory: true, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  client_money_received: {
    label: "Argent client reçu",
    hint: "Le compte augmente, mais cet argent n'est PAS un revenu — il appartient au client.",
    group: "client",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: true,
    needsOrder: true, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  client_product_purchase: {
    label: "Achat produit client",
    hint: "Le compte diminue. Ce n'est pas une dépense perso — c'est un coût de commande client.",
    group: "client",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: true,
    needsOrder: true, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  client_shipping_fee: {
    label: "Frais client",
    hint: "Livraison, transport, emballage pour un seul client.",
    group: "client",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: true,
    needsOrder: true, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  shared_client_fee: {
    label: "Frais partagé",
    hint: "Frais payé pour plusieurs clients. Répartis automatiquement ou manuellement.",
    group: "client",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: true,
  },
  client_refund: {
    label: "Remboursement client",
    hint: "Le compte diminue. Ce remboursement réduit la dette envers le client.",
    group: "client",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: true,
    needsOrder: true, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  profit_validated: {
    label: "Bénéfice validé",
    hint: "Valide le bénéfice réel d'une commande. Ne change PAS le solde physique — transforme l'argent client en revenu réel.",
    group: "client",
    affectsBalance: false,
    needsAccount: false, needsCategory: false, needsClient: true,
    needsOrder: true, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  debt_received: {
    label: "Dette prise",
    hint: "Quelqu'un te prête de l'argent. Le compte augmente, mais c'est une dette à rembourser.",
    group: "dette",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: true, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  debt_repayment: {
    label: "Remboursement dette",
    hint: "Tu rembourses une dette. Le compte diminue.",
    group: "dette",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: true,
    needsReceivableSelect: false, needsAllocations: false,
  },
  receivable_created: {
    label: "Créance créée",
    hint: "Tu prêtes de l'argent. Le compte diminue, mais c'est à récupérer — pas une dépense perdue.",
    group: "dette",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: true, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  receivable_repaid: {
    label: "Créance remboursée",
    hint: "Quelqu'un te rembourse. Le compte augmente.",
    group: "dette",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: true, needsAllocations: false,
  },
  balance_correction: {
    label: "Correction de solde",
    hint: "Aligne le solde de l'application sur la réalité. Non compté comme revenu ou dépense.",
    group: "autre",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  transfer_in: {
    label: "Transfert reçu",
    hint: "Argent reçu d'un autre compte (côté réception).",
    group: "autre",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
  transfer_out: {
    label: "Transfert envoyé",
    hint: "Argent envoyé vers un autre compte (côté envoi).",
    group: "autre",
    affectsBalance: true,
    needsAccount: true, needsCategory: false, needsClient: false,
    needsOrder: false, needsPerson: false, needsDebtSelect: false,
    needsReceivableSelect: false, needsAllocations: false,
  },
};

// ── Grouped for the type picker UI ───────────────────────────────────────────

export type SubTypeGroup = {
  label: string;
  items: TransactionSubType[];
};

export const SUB_TYPE_GROUPS: SubTypeGroup[] = [
  {
    label: "Personnel",
    items: ["personal_income", "personal_expense"],
  },
  {
    label: "Business",
    items: ["business_income", "business_expense"],
  },
  {
    label: "Client DANEX",
    items: [
      "client_money_received",
      "client_product_purchase",
      "client_shipping_fee",
      "shared_client_fee",
      "client_refund",
      "profit_validated",
    ],
  },
  {
    label: "Dette & Créance",
    items: ["debt_received", "debt_repayment", "receivable_created", "receivable_repaid"],
  },
  {
    label: "Autre",
    items: ["balance_correction"],
  },
];

// ── Expense categories for personal/business sub-types ────────────────────────

export const PERSONAL_EXPENSE_CATEGORIES = [
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
  "Autre",
] as const;

export const PERSONAL_INCOME_CATEGORIES = [
  "Salaire reçu",
  "Aide familiale",
  "Don reçu",
  "Bonus",
  "Autre",
] as const;

export const BUSINESS_EXPENSE_CATEGORIES = [
  "Business / Sourcing",
  "Marketing",
  "Frais bancaires",
  "Commission payée",
  "Salaire payé",
  "Livraison / Transport colis",
  "Douane / Taxes",
  "Équipement / Matériel",
  "Autre",
] as const;

export const BUSINESS_INCOME_CATEGORIES = [
  "Bénéfice business",
  "Commission reçue",
  "Vente produit",
  "Service vendu",
  "Investissement reçu",
  "Autre",
] as const;

export function getCategoriesForSubType(subType: TransactionSubType): readonly string[] {
  switch (subType) {
    case "personal_expense": return PERSONAL_EXPENSE_CATEGORIES;
    case "personal_income":  return PERSONAL_INCOME_CATEGORIES;
    case "business_expense": return BUSINESS_EXPENSE_CATEGORIES;
    case "business_income":  return BUSINESS_INCOME_CATEGORIES;
    default: return [];
  }
}
