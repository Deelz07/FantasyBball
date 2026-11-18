import { clampOpponentFactor } from "./opponent";
import type { TeamCode } from "./teams";

export const PLAYER_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const DAILY_CAP = 10;
export const MAX_ADDS_PER_PLAYER = 8;

export interface RosterPlayer {
  id: string;
  name: string;
  team: TeamCode;
  streamable: boolean;
  available: boolean;
  ir?: boolean;
  avgPoints: number | null;
  positions: PlayerPosition[];
}

export interface FreeAgent {
  id: string;
  name: string;
  team: TeamCode;
  avgPoints: number;
  positions: PlayerPosition[];
}

export interface ScheduleChange {
  date: string;
  delta: number;
}

export interface TradeOption {
  addId: string;
  addName: string;
  addTeam: TeamCode;
  addAvg: number;
  games: number;
  opponents: TeamCode[];
  ev: number;
  effectiveAfter: string | null;
  changes: ScheduleChange[];
}

export interface PlayerTrades {
  playerId: string;
  playerName: string;
  team: TeamCode;
  avgPoints: number;
  options: TradeOption[];
}

export interface TradeGroup {
  effectiveAfter: string | null;
  ev: number;
  changes: ScheduleChange[];
  teams: TradeOption[];
}

export interface DailyCapacity {
  date: string;
  filled: number;
  totalSlots: number;
  full: boolean;
}

export interface OptimizationResult {
  baselinePoints: number;
  baselineGames: number;
  players: PlayerTrades[];
  dailyCapacity: DailyCapacity[];
}

function roundPoints(value: number): number {
  return Math.round(value * 10) / 10;
}

function playerName(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

function dayScore(
  player: { team: TeamCode; avgPoints: number | null; available: boolean },
  day: number,
  opponents: Record<TeamCode, (TeamCode | null)[]>,
  factors: Partial<Record<TeamCode, number>>,
): number {
  if (!player.available || player.avgPoints == null || player.avgPoints <= 0) {
    return 0;
  }
  const opponent = opponents[player.team]?.[day];
  if (!opponent) return 0;
  return player.avgPoints * clampOpponentFactor(factors[opponent]);
}

function lineupValue(scores: number[]): number {
  return scores
    .filter((score) => score > 0)
    .sort((a, b) => b - a)
    .slice(0, DAILY_CAP)
    .reduce((total, score) => total + score, 0);
}

export function changeKey(changes: ScheduleChange[]): string {
  return changes.map((change) => `${change.delta}:${change.date}`).join("|");
}

export function groupTrades(options: TradeOption[]): TradeGroup[] {
  const groups: TradeGroup[] = [];
  const indexByPattern = new Map<string, number>();

  for (const option of options) {
    const key = `${option.effectiveAfter ?? ""}|${option.ev}|${changeKey(option.changes)}`;
    const existing = indexByPattern.get(key);
    if (existing === undefined) {
      indexByPattern.set(key, groups.length);
      groups.push({
        effectiveAfter: option.effectiveAfter,
        ev: option.ev,
        changes: option.changes,
        teams: [option],
      });
    } else {
      groups[existing].teams.push(option);
    }
  }

  return groups;
}

function compareOptions(a: TradeOption, b: TradeOption): number {
  if (a.ev !== b.ev) return b.ev - a.ev;
  const aDay = a.effectiveAfter ?? "";
  const bDay = b.effectiveAfter ?? "";
  if (aDay !== bDay) return aDay.localeCompare(bDay);
  const patternDifference = changeKey(a.changes).localeCompare(
    changeKey(b.changes),
  );
  if (patternDifference !== 0) return patternDifference;
  const nameDifference = a.addName.localeCompare(b.addName);
  if (nameDifference !== 0) return nameDifference;
  return a.addTeam.localeCompare(b.addTeam);
}

export function optimizeRoster(
  roster: RosterPlayer[],
  freeAgents: FreeAgent[],
  dates: string[],
  opponents: Record<TeamCode, (TeamCode | null)[]>,
  factors: Partial<Record<TeamCode, number>> = {},
): OptimizationResult {
  const rosterIds = new Set(roster.map((player) => player.id));
  const rosterNames = new Set(roster.map((player) => playerName(player.name)));
  const candidates = freeAgents.filter(
    (agent) =>
      agent.avgPoints > 0 &&
      !rosterIds.has(agent.id) &&
      !rosterNames.has(playerName(agent.name)),
  );

  const dailyScores = dates.map((_, day) =>
    roster.map((player) => dayScore(player, day, opponents, factors)),
  );
  const baselineByDay = dailyScores.map((scores) => lineupValue(scores));
  const baselinePoints = roundPoints(
    baselineByDay.reduce((total, score) => total + score, 0),
  );
  const playingCounts = dailyScores.map(
    (scores) => scores.filter((score) => score > 0).length,
  );
  const players: PlayerTrades[] = [];

  for (const player of roster) {
    if (!player.streamable || player.avgPoints == null) continue;
    const dropIndex = roster.findIndex((item) => item.id === player.id);
    const options: TradeOption[] = [];

    for (const agent of candidates) {
      let best: TradeOption | undefined;

      for (let afterDay = -1; afterDay < dates.length - 1; afterDay += 1) {
        let games = 0;
        const faced: TeamCode[] = [];
        const changes: ScheduleChange[] = [];

        for (let day = afterDay + 1; day < dates.length; day += 1) {
          const opponent = opponents[agent.team]?.[day] ?? null;
          const addScore = dayScore(
            { ...agent, available: true },
            day,
            opponents,
            factors,
          );
          if (opponent && addScore > 0) {
            games += 1;
            faced.push(opponent);
          }
          const replaced = dailyScores[day].filter(
            (_, index) => index !== dropIndex,
          );
          replaced.push(addScore);
          const delta = roundPoints(
            lineupValue(replaced) - baselineByDay[day],
          );
          if (delta !== 0) changes.push({ date: dates[day], delta });
        }

        const ev = roundPoints(
          changes.reduce((total, change) => total + change.delta, 0),
        );
        if (ev <= 0) continue;
        const effectiveAfter = afterDay < 0 ? null : dates[afterDay];
        const option: TradeOption = {
          addId: agent.id,
          addName: agent.name,
          addTeam: agent.team,
          addAvg: agent.avgPoints,
          games,
          opponents: faced,
          ev,
          effectiveAfter,
          changes,
        };
        if (
          !best ||
          option.ev > best.ev ||
          (option.ev === best.ev &&
            (option.effectiveAfter ?? "") < (best.effectiveAfter ?? ""))
        ) {
          best = option;
        }
      }

      if (best) options.push(best);
    }

    if (options.length === 0) continue;
    options.sort(compareOptions);
    players.push({
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      avgPoints: player.avgPoints,
      options: options.slice(0, MAX_ADDS_PER_PLAYER),
    });
  }

  players.sort((a, b) => {
    const evDifference = b.options[0].ev - a.options[0].ev;
    if (evDifference !== 0) return evDifference;
    return a.playerName.localeCompare(b.playerName);
  });

  return {
    baselinePoints,
    baselineGames: playingCounts.reduce(
      (total, count) => total + Math.min(count, DAILY_CAP),
      0,
    ),
    players,
    dailyCapacity: dates.map((date, index) => ({
      date,
      filled: Math.min(playingCounts[index], DAILY_CAP),
      totalSlots: DAILY_CAP,
      full: playingCounts[index] >= DAILY_CAP,
    })),
  };
}
