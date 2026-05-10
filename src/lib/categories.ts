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
  // Dette
  "Remboursement": "debt",
  // Client
  "Paiement client": "client",
  // Autre
  "Autre": "other",
};
