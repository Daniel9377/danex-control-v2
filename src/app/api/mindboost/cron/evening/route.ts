import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/mindboost/telegram';
import { saveEveningCheckPending } from '@/lib/mindboost/conversation-memory';

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

  try {
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    const userId = process.env.MINDBOOST_USER_ID;
    if (!chatId || !userId) {
      return NextResponse.json({ error: 'Env vars manquants' }, { status: 500 });
    }

    await saveEveningCheckPending(userId);

    await sendTelegramMessage(
      chatId,
      "Daniel, as-tu complete ton app aujourd'hui ?\nReponds oui ou non — je verifie et je te donne le bilan."
    );

    return NextResponse.json({ ok: true, sent: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
