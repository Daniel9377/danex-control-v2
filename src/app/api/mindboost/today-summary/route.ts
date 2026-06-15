import { NextRequest, NextResponse } from "next/server";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";

function isAuthorized(request: NextRequest) {
  const expectedSecret = process.env.MINDBOOST_API_SECRET;

  if (!expectedSecret) {
    throw new Error("Missing env var: MINDBOOST_API_SECRET");
  }

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expectedSecret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;

    const summary = await getMindboostTodaySummary(date);

    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Mindboost error";

    return NextResponse.json(
      {
        error: "Mindboost today summary failed",
        message,
      },
      { status: 500 }
    );
  }
}
