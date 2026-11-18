import { NextResponse } from "next/server";

import { parseLeagueSnapshot } from "@/lib/espn-fantasy";
import { parseOpponentFactors } from "@/lib/opponent";

export const dynamic = "force-dynamic";

const LEAGUE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba";
const STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Add ${name} to .env.local. League id, season year, SWID, and espn_s2 are all required.`,
    );
  }
  return value;
}

async function readJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("ESPN refused these cookies. Copy a fresh SWID and espn_s2.");
    }
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  return response.json();
}

export async function GET() {
  try {
    const leagueId = requiredEnv("ESPN_LEAGUE_ID");
    const year = Number(requiredEnv("ESPN_YEAR"));
    const swid = requiredEnv("ESPN_SWID");
    const espnS2 = requiredEnv("ESPN_S2");
    if (!Number.isInteger(year)) {
      throw new Error("ESPN_YEAR must be the season's ending year, such as 2027.");
    }

    const leagueUrl = `${LEAGUE_URL}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster`;
    const cookie = `SWID=${swid}; espn_s2=${espnS2}`;
    const [leagueResponse, standingsResponse] = await Promise.all([
      fetch(leagueUrl, {
        headers: { Cookie: cookie, Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(STANDINGS_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 21_600 },
      }),
    ]);

    const league = (await readJson(leagueResponse, "ESPN league")) as {
      status?: { latestScoringPeriod?: number };
    };
    const standings = await readJson(standingsResponse, "ESPN standings");
    const scoringPeriod = league.status?.latestScoringPeriod || 1;
    const freeAgentUrl = `${LEAGUE_URL}/seasons/${year}/segments/0/leagues/${leagueId}?view=kona_player_info&scoringPeriodId=${scoringPeriod}`;
    const freeAgentResponse = await fetch(freeAgentUrl, {
      headers: {
        Cookie: cookie,
        Accept: "application/json",
        "x-fantasy-filter": JSON.stringify({
          players: {
            filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
            filterSlotIds: { value: [] },
            limit: 75,
            sortPercOwned: { sortPriority: 1, sortAsc: false },
          },
        }),
      },
      cache: "no-store",
    });
    const freeAgents = await readJson(freeAgentResponse, "ESPN free agents");
    const snapshot = parseLeagueSnapshot(league, freeAgents, swid, year);

    return NextResponse.json({
      ...snapshot,
      opponentFactors: parseOpponentFactors(standings),
    });
  } catch (error) {
    console.error("Unable to load ESPN league", error);
    const message =
      error instanceof Error
        ? error.message
        : "ESPN league data is temporarily unavailable.";
    const status = message.startsWith("Add ESPN_") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
