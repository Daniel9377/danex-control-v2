const intlUnsupported: Record<string, string> = {
  CDF: "FC",
};

export function formatMoney(
  amount: number | string | null,
  currency: string
): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "—";
  const symbol = intlUnsupported[currency];
  if (symbol) {
    return `${n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${symbol}`;
  }
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
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
