/**
 * Shared date helpers for Mindboost.
 * China = UTC+8 — daily operations follow China's calendar day.
 */
export function getChinaDateISO(): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function getChinaHour(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours();
}

export function getChinaNow(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}
