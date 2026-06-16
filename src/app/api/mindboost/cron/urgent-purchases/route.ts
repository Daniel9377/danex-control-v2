import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/mindboost/telegram';
import { getUrgentPurchaseAlerts, wasUrgentPurchaseAlertSent, markUrgentPurchaseAlertSent } from '@/lib/mindboost/alerts';

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
    const urgentPurchases = await getUrgentPurchaseAlerts(userId);
    let sent = 0;

    for (const purchase of urgentPurchases) {
      const alreadySent = await wasUrgentPurchaseAlertSent(userId, purchase.order_id);
      if (alreadySent) continue;
      const msg = [
        `ACHAT URGENT — ${purchase.client_name}`,
        `Avance recue : ${purchase.advance_received} ${purchase.currency} (il y a ${purchase.days_since_advance} jour(s))`,
        `Produit : ${purchase.product_name}`,
        `Statut commande : ${purchase.order_status}`,
        `L achat n est pas fait. Fais-le aujourd hui.`,
      ].join('\n');
      await sendTelegramMessage(chatId, msg);
      await markUrgentPurchaseAlertSent(userId, purchase.order_id);
      sent++;
    }

    return NextResponse.json({ ok: true, checked: urgentPurchases.length, sent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
