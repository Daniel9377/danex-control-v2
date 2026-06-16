import { NextRequest, NextResponse } from 'next/server';
import { getMindboostTodaySummary } from '@/lib/mindboost/today-summary';
import { getMindboostAlerts, getUrgentPurchaseAlerts } from '@/lib/mindboost/alerts';
import { sendTelegramMessage } from '@/lib/mindboost/telegram';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}` || cronSecret === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  const userId = process.env.MINDBOOST_USER_ID;
  if (!chatId || !userId) {
    return NextResponse.json({ error: 'Env vars manquants' }, { status: 500 });
  }

  try {
    const [summary, alerts, urgentPurchases] = await Promise.all([
      getMindboostTodaySummary(),
      getMindboostAlerts(),
      getUrgentPurchaseAlerts(userId),
    ]);

    const urgentDebts = alerts.debts.filter((d) => d.daysOld >= 7);
    const hasUrgency = urgentPurchases.length > 0 || urgentDebts.length > 0 || summary.transactionCount === 0;

    if (!hasUrgency) {
      return NextResponse.json({ ok: true, sent: false, reason: 'Rien d urgent, app active.' });
    }

    const lines = ['Controle midi.', `Transactions aujourd hui : ${summary.transactionCount} (${summary.realExpenseCount} vraies depenses).`];

    if (urgentPurchases.length > 0) {
      const p = urgentPurchases[0];
      lines.push(`ACHAT EN ATTENTE : ${p.client_name} — ${p.product_name}. Pas encore fait.`);
    }

    if (urgentDebts.length > 0) {
      lines.push(`Dette a surveiller : ${urgentDebts.length} dette(s) active(s).`);
    }

    if (urgentPurchases.length === 0 && urgentDebts.length === 0) {
      lines.push('Rien d urgent. Continue.');
    }

    await sendTelegramMessage(chatId, lines.join('\n'));

    return NextResponse.json({ ok: true, sent: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
