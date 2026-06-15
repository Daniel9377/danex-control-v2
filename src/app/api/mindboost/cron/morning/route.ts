import { NextRequest, NextResponse } from 'next/server';
import { getMindboostTodaySummary } from '@/lib/mindboost/today-summary';
import { sendTelegramMessage } from '@/lib/mindboost/telegram';

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    authHeader === `Bearer ${secret}` ||
    cronSecret === secret
  );
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

  try {
    const yesterday = getYesterdayChina();
    const summary = await getMindboostTodaySummary(yesterday);

    if (summary.appCompleted) {
      return NextResponse.json({
        ok: true,
        date: yesterday,
        appCompleted: true,
        sent: false,
        reason: 'App completee hier - aucun rappel envoye.',
      });
    }

    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (!chatId) {
      return NextResponse.json({ error: 'TELEGRAM_ALLOWED_CHAT_ID manquant' }, { status: 500 });
    }

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

    return NextResponse.json({
      ok: true,
      date: yesterday,
      appCompleted: false,
      sent: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}