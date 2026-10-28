import { NextRequest, NextResponse } from "next/server";

import {
  filterSchedule,
  normalizeSchedule,
  rankTeams,
} from "@/lib/schedule";

const NBA_SCHEDULE_URL =
  "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    return NextResponse.json(
      { error: "Provide valid start and end dates in chronological order." },
      { status: 400 },
    );
  }

  const daySpan =
    Math.round(
      (new Date(`${end}T12:00:00Z`).getTime() -
        new Date(`${start}T12:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  if (daySpan > 14) {
    return NextResponse.json(
      { error: "Choose a date range of 14 days or fewer." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(NBA_SCHEDULE_URL, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Origin: "https://www.nba.com",
        Referer: "https://www.nba.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; FantasyBasketballWeekOptimizer/1.0)",
      },
      next: { revalidate: 21_600 },
    });

    if (!response.ok) {
      throw new Error(`NBA schedule returned HTTP ${response.status}`);
    }

    const allGames = normalizeSchedule(await response.json());
    const games = filterSchedule(allGames, start, end);
    const firstDate = allGames.at(0)?.date ?? null;
    const lastDate = allGames.at(-1)?.date ?? null;

    return NextResponse.json({
      games,
      rankings: rankTeams(games),
      availableRange: { start: firstDate, end: lastDate },
    });
  } catch (error) {
    console.error("Unable to load NBA schedule", error);
    return NextResponse.json(
      {
        error:
          "The NBA schedule is temporarily unavailable. Please try again shortly.",
      },
      { status: 502 },
    );
  }
}
