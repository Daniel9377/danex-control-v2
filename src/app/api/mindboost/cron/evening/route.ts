import { NextRequest, NextResponse } from 'next/server';
import { getMindboostTodaySummary } from '@/lib/mindboost/today-summary';
import { formatEveningReport } from '@/lib/mindboost/evening-report';
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

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const chinaOffset = 8 * 60;
    const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
    const date = chinaTime.toISOString().split('T')[0];

    const summary = await getMindboostTodaySummary(date);
    const message = formatEveningReport(summary);

    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (!chatId) {
      return NextResponse.json({ error: 'TELEGRAM_ALLOWED_CHAT_ID manquant' }, { status: 500 });
    }

    await sendTelegramMessage(chatId, message);

    return NextResponse.json({
      ok: true,
      date,
      appCompleted: summary.appCompleted,
      sent: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}