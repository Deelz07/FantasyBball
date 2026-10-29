import { NBA_TEAMS, type TeamCode, isTeamCode } from "./teams";

export interface ScheduledGame {
  id: string;
  date: string;
  home: TeamCode;
  away: TeamCode;
}

export interface TeamSchedule {
  team: TeamCode;
  games: number;
  dates: string[];
}

interface NbaSchedulePayload {
  leagueSchedule?: {
    gameDates?: Array<{
      gameDate?: string;
      games?: Array<{
        gameId?: string;
        gameLabel?: string;
        gameSubLabel?: string;
        homeTeam?: { teamTricode?: string };
        awayTeam?: { teamTricode?: string };
      }>;
    }>;
  };
}

const ESPN_TEAM_CODES: Record<string, TeamCode> = {
  BRK: "BKN",
  CHO: "CHA",
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  PHO: "PHX",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};

interface EspnScoreboardPayload {
  events?: Array<{
    id?: string;
    name?: string;
    season?: { slug?: string };
    competitions?: Array<{
      competitors?: Array<{
        homeAway?: string;
        team?: { abbreviation?: string };
      }>;
    }>;
  }>;
}

function espnTeamCode(abbreviation: string): TeamCode | null {
  if (isTeamCode(abbreviation)) return abbreviation;
  return ESPN_TEAM_CODES[abbreviation] ?? null;
}

export function normalizeEspnSchedule(
  payload: unknown,
  slateDate: string,
): ScheduledGame[] {
  const data = payload as EspnScoreboardPayload;
  if (!Array.isArray(data.events)) {
    throw new Error("The NBA schedule response had an unexpected format.");
  }

  const games: ScheduledGame[] = [];
  for (const event of data.events) {
    const slug = event.season?.slug ?? "";
    const name = (event.name ?? "").toLowerCase();
    if (
      slug === "preseason" ||
      slug.includes("all-star") ||
      name.includes("all-star")
    ) {
      continue;
    }

    const competitors = event.competitions?.[0]?.competitors ?? [];
    const home = espnTeamCode(
      competitors.find((team) => team.homeAway === "home")?.team
        ?.abbreviation ?? "",
    );
    const away = espnTeamCode(
      competitors.find((team) => team.homeAway === "away")?.team
        ?.abbreviation ?? "",
    );
    if (!home || !away) continue;

    games.push({
      id: event.id ?? `${slateDate}-${away}-${home}`,
      date: slateDate,
      home,
      away,
    });
  }

  return games.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

function toIsoDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function normalizeSchedule(payload: unknown): ScheduledGame[] {
  const data = payload as NbaSchedulePayload;
  const gameDates = data.leagueSchedule?.gameDates;
  if (!Array.isArray(gameDates)) {
    throw new Error("The NBA schedule response had an unexpected format.");
  }

  const games: ScheduledGame[] = [];
  for (const dateBlock of gameDates) {
    const date = toIsoDate(dateBlock.gameDate ?? "");
    if (!date || !Array.isArray(dateBlock.games)) continue;

    for (const game of dateBlock.games) {
      const home = game.homeTeam?.teamTricode ?? "";
      const away = game.awayTeam?.teamTricode ?? "";
      const label = `${game.gameLabel ?? ""} ${game.gameSubLabel ?? ""}`.toLowerCase();
      if (
        !isTeamCode(home) ||
        !isTeamCode(away) ||
        label.includes("preseason") ||
        label.includes("all-star")
      ) {
        continue;
      }
      games.push({
        id: game.gameId ?? `${date}-${away}-${home}`,
        date,
        home,
        away,
      });
    }
  }

  return games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function filterSchedule(
  games: ScheduledGame[],
  start: string,
  end: string,
): ScheduledGame[] {
  return games.filter((game) => game.date >= start && game.date <= end);
}

export function rankTeams(games: ScheduledGame[]): TeamSchedule[] {
  const dates = new Map<TeamCode, string[]>(
    NBA_TEAMS.map(({ code }) => [code, []]),
  );

  for (const game of games) {
    dates.get(game.home)?.push(game.date);
    dates.get(game.away)?.push(game.date);
  }

  return NBA_TEAMS.map(({ code }) => ({
    team: code,
    games: dates.get(code)?.length ?? 0,
    dates: dates.get(code) ?? [],
  })).sort(
    (a, b) => b.games - a.games || a.team.localeCompare(b.team),
  );
}

export function listDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const final = new Date(`${end}T12:00:00Z`);
  while (cursor <= final) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function buildGameMatrix(
  games: ScheduledGame[],
  dates: string[],
): Record<TeamCode, boolean[]> {
  const gameSet = new Set<string>();
  for (const game of games) {
    gameSet.add(`${game.date}:${game.home}`);
    gameSet.add(`${game.date}:${game.away}`);
  }

  return Object.fromEntries(
    NBA_TEAMS.map(({ code }) => [
      code,
      dates.map((date) => gameSet.has(`${date}:${code}`)),
    ]),
  ) as Record<TeamCode, boolean[]>;
}
