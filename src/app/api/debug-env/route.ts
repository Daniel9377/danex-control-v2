import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return NextResponse.json({
    supabaseUrl: url ?? null,
    supabaseKeyPreview: key ? `${key.slice(0, 12)}...${key.slice(-8)}` : null,
    hasUrl: !!url,
    hasKey: !!key,
    nodeEnv: process.env.NODE_ENV,
  });
}
