"use client";

import { X } from "lucide-react";
import { formatMoney } from "@/lib/currency";

export type DetailItem = {
  name: string;
  subtitle?: string;
  originalAmount: number;
  currency: string;
  convertedAmount: number;
  isPositive?: boolean;
};

type Props = {
  open: boolean;
  title: string;
  items: DetailItem[];
  total: number;
  displayCurrency: string;
  onClose: () => void;
};

export function BalanceDetailSheet({ open, title, items, total, displayCurrency, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 md:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Items list */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucun élément</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {items.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{item.name}</p>
                    {item.subtitle && (
                      <p className="mt-0.5 text-xs text-slate-500">{item.subtitle}</p>
                    )}
                    <p className="mt-0.5 font-mono tabular-nums text-xs text-slate-500">
                      {formatMoney(item.originalAmount, item.currency)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-mono tabular-nums text-sm font-semibold whitespace-nowrap ${
                      item.isPositive === false
                        ? "text-red-400"
                        : item.isPositive === true
                        ? "text-emerald-400"
                        : item.convertedAmount < 0
                        ? "text-red-400"
                        : "text-slate-100"
                    }`}>
                      {formatMoney(item.convertedAmount, displayCurrency)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
          <span className="text-sm font-medium text-slate-400">Total</span>
          <span className={`font-mono tabular-nums text-base font-bold whitespace-nowrap ${
            total < 0 ? "text-red-400" : total > 0 ? "text-slate-50" : "text-slate-400"
          }`}>
            {total >= 0 && "+"}
            {formatMoney(total, displayCurrency)}
          </span>
        </div>
      </div>
    </div>
  );
}
