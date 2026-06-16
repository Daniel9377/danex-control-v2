import { NextRequest, NextResponse } from 'next/server';
import { getMindboostTodaySummary } from '@/lib/mindboost/today-summary';
import { sendTelegramMessage } from '@/lib/mindboost/telegram';
import { getUrgentPurchaseAlerts, wasUrgentPurchaseAlertSent, markUrgentPurchaseAlertSent } from '@/lib/mindboost/alerts';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteEveningCheckPending } from '@/lib/mindboost/conversation-memory';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}` || cronSecret === secret;
}

function getYesterdayChina(): string {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
  chinaTime.setUTCDate(chinaTime.getUTCDate() - 1);
  return chinaTime.toISOString().split('T')[0];
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
    const yesterday = getYesterdayChina();
    const summary = await getMindboostTodaySummary(yesterday);

    // Check if Daniel never answered last night's evening check (expired entry = no reply)
    const supabase = createAdminClient();
    const { data: eveningFlag } = await supabase
      .from('mindboost_memory')
      .select('expires_at')
      .eq('user_id', userId)
      .eq('memory_type', 'evening_check_pending')
      .single();

    if (eveningFlag) {
      // Entry still exists from yesterday = Daniel never replied
      await deleteEveningCheckPending(userId);
      await sendTelegramMessage(
        chatId,
        "Tu n'as pas complete ton app hier. Prends 2 minutes ce matin avant de commencer."
      );
    } else if (!summary.appCompleted) {
      // Classic morning reminder (no evening_check flow)
      const message = [
        `Mindboost - Rappel matinal ${yesterday}`,
        ``,
        `Tu n'as pas complete l'app hier.`,
        ``,
        `C'est trop tard pour corriger hier, mais note-le.`,
        `Aujourd'hui, complete DANEX Control avant 22h.`,
        ``,
        `Ouvre l'app et enregistre tes transactions du jour.`,
      ].join('\n');
      await sendTelegramMessage(chatId, message);
    }

    // Proactive urgent purchase alerts
    const urgentPurchases = await getUrgentPurchaseAlerts(userId);
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
    }

    return NextResponse.json({
      ok: true,
      date: yesterday,
      appCompleted: summary.appCompleted,
      urgentPurchasesCount: urgentPurchases.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
