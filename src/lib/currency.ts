const currencyPrefix: Record<string, string> = {
  CDF: "FC",
};

/**
 * Format a number with the currency symbol/code BEFORE the amount.
 * Uses French number formatting (spaces, comma decimal) but
 * places the currency first — "$1 000,00", "CNY 5 000,00", etc.
 */
export function formatMoney(
  amount: number | string | null,
  currency: string
): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "—";

  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

  const prefix = currencyPrefix[currency];
  if (prefix) return `${prefix} ${formatted}`;

  // For USD/EUR/THB/etc., Intl gives us "1 000,00 $US" — extract the symbol
  // and place it before the number.
  try {
    const parts = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(n);

    // Reorder: symbol/code first, then the number
    const symbolPart = parts.find((p) => p.type === "currency");
    const symbol = symbolPart?.value ?? currency;
    const numberPart = parts
      .filter((p) => p.type !== "currency" && p.type !== "literal")
      .map((p) => p.value)
      .join("");

    // If the symbol looks like an ISO code (3 uppercase letters), add a space
    const isCode = /^[A-Z]{3}$/.test(symbol);
    return isCode ? `${symbol} ${numberPart}` : `${symbol}${numberPart}`;
  } catch {
    return `${currency} ${n.toFixed(2).replace(".", ",")}`;
  }
}

export function getValidRate(
  rate: number | string | null | undefined
): number | null {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sumAccountsInCurrency(
  accounts: { balance: number | string | null; currency: string }[],
  targetCurrency: string,
  ratesByCode: Record<string, number | string | null>
): { total: number; hasMissing: boolean } {
  const targetRate = getValidRate(ratesByCode[targetCurrency]);
  if (!targetRate) return { total: 0, hasMissing: true };

  let hasMissing = false;
  const total = accounts.reduce((sum, acc) => {
    const balance = Number(acc.balance ?? 0);
    const rate = getValidRate(ratesByCode[acc.currency]);
    if (!Number.isFinite(balance) || !rate) {
      hasMissing = true;
      return sum;
    }
    return sum + (balance * rate) / targetRate;
  }, 0);

  return { total, hasMissing };
}

export const DEFAULT_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", rate_to_usd: 1 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", rate_to_usd: 0.138 },
  { code: "THB", name: "Thai Baht", symbol: "฿", rate_to_usd: 0.027 },
  { code: "EUR", name: "Euro", symbol: "€", rate_to_usd: 1.08 },
  { code: "CDF", name: "Franc Congolais", symbol: "FC", rate_to_usd: 0.00035 },
] as const;
