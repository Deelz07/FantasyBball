import { DAILY_CAP, type RosterPlayer } from "./optimizer";
import type { TeamCode } from "./teams";

export interface PlayerWeekScore {
  id: string;
  name: string;
  team: TeamCode;
  avgPoints: number | null;
  available: boolean;
  ir: boolean;
  games: number;
  countedGames: number;
  expected: number;
}

export interface DailyAverageScore {
  date: string;
  expected: number;
  playing: number;
}

export interface WeekAverageScore {
  total: number;
  players: PlayerWeekScore[];
  days: DailyAverageScore[];
}

export interface TeamWeekScore {
  id: string;
  name: string;
  yours: boolean;
  total: number;
  games: number;
  totalWithoutIr: number;
  gamesWithoutIr: number;
  score: WeekAverageScore;
}

function roundPoints(value: number): number {
  return Math.round(value * 10) / 10;
}

export function weeklyAverageScore(
  roster: RosterPlayer[],
  dates: string[],
  opponents: Record<TeamCode, (TeamCode | null)[]>,
): WeekAverageScore {
  const scheduled = new Map<string, number>();
  const counted = new Map<string, number>();
  const days: DailyAverageScore[] = [];

  dates.forEach((date, day) => {
    const playing = roster.flatMap((player) => {
      if (!opponents[player.team]?.[day]) return [];
      scheduled.set(player.id, (scheduled.get(player.id) ?? 0) + 1);
      if (!player.available || player.avgPoints == null || player.avgPoints <= 0) {
        return [];
      }
      return [{ id: player.id, name: player.name, score: player.avgPoints }];
    });
    const active = [...playing].sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    ).slice(0, DAILY_CAP);
    for (const player of active) {
      counted.set(player.id, (counted.get(player.id) ?? 0) + 1);
    }
    days.push({
      date,
      expected: roundPoints(active.reduce((total, player) => total + player.score, 0)),
      playing: playing.length,
    });
  });

  const players = roster
    .map((player) => {
      const countedGames = counted.get(player.id) ?? 0;
      return {
        id: player.id,
        name: player.name,
        team: player.team,
        avgPoints: player.avgPoints,
        available: player.available,
        ir: player.ir === true,
        games: scheduled.get(player.id) ?? 0,
        countedGames,
        expected: roundPoints(countedGames * (player.avgPoints ?? 0)),
      };
    })
    .sort(
      (a, b) => b.expected - a.expected || a.name.localeCompare(b.name),
    );

  return {
    total: roundPoints(days.reduce((total, day) => total + day.expected, 0)),
    players,
    days,
  };
}

export function rankTeamsByWeeklyAverage(
  teams: Array<{
    id: string;
    name: string;
    yours: boolean;
    roster: RosterPlayer[];
  }>,
  dates: string[],
  opponents: Record<TeamCode, (TeamCode | null)[]>,
): TeamWeekScore[] {
  return teams
    .map((team) => {
      const score = weeklyAverageScore(team.roster, dates, opponents);
      const withoutIr = weeklyAverageScore(
        team.roster.filter((player) => !player.ir),
        dates,
        opponents,
      );
      const gamesFor = (value: WeekAverageScore) =>
        value.players.reduce(
          (total, player) => total + (player.available ? player.games : 0),
          0,
        );
      return {
        id: team.id,
        name: team.name,
        yours: team.yours,
        total: score.total,
        games: gamesFor(score),
        totalWithoutIr: withoutIr.total,
        gamesWithoutIr: gamesFor(withoutIr),
        score,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
