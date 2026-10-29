import { NextRequest, NextResponse } from "next/server";

import {
  listDates,
  normalizeEspnSchedule,
  rankTeams,
} from "@/lib/schedule";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

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
    const dates = listDates(start, end);
    const days = await Promise.all(
      dates.map(async (date) => {
        const response = await fetch(
          `${ESPN_SCOREBOARD_URL}?dates=${date.replaceAll("-", "")}`,
          {
            headers: { Accept: "application/json" },
            next: { revalidate: 21_600 },
          },
        );
        if (!response.ok) {
          throw new Error(`ESPN schedule returned HTTP ${response.status}`);
        }
        return normalizeEspnSchedule(await response.json(), date);
      }),
    );
    const games = days
      .flat()
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    return NextResponse.json({
      games,
      rankings: rankTeams(games),
      availableRange: { start, end },
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
