import { NBA_TEAMS, type TeamCode } from "./teams";

export const PLAYER_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const DAILY_CAP = 10;

export interface RosterPlayer {
  id: string;
  name: string;
  team: TeamCode;
  streamable: boolean;
  positions: PlayerPosition[];
}

export interface ScheduleChange {
  date: string;
  delta: number;
}

export interface TradeOption {
  addTeam: TeamCode;
  ev: number;
  effectiveAfter: string | null;
  changes: ScheduleChange[];
}

export interface PlayerTrades {
  playerId: string;
  playerName: string;
  team: TeamCode;
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
  baselineGames: number;
  players: PlayerTrades[];
  dailyCapacity: DailyCapacity[];
}

function playsOn(
  gameMatrix: Record<TeamCode, boolean[]>,
  team: TeamCode,
  dayIndex: number,
): number {
  return gameMatrix[team]?.[dayIndex] ? 1 : 0;
}

function capped(count: number): number {
  return Math.min(count, DAILY_CAP);
}

function tradeEffect(
  counts: number[],
  dates: string[],
  gameMatrix: Record<TeamCode, boolean[]>,
  fromTeam: TeamCode,
  addTeam: TeamCode,
  afterDay: number,
): { ev: number; changes: ScheduleChange[] } {
  const changes: ScheduleChange[] = [];
  let ev = 0;
  for (let day = afterDay + 1; day < counts.length; day += 1) {
    const playedByOld = playsOn(gameMatrix, fromTeam, day);
    const playedByNew = playsOn(gameMatrix, addTeam, day);
    if (playedByOld !== playedByNew) {
      changes.push({ date: dates[day], delta: playedByNew - playedByOld });
    }
    const before = capped(counts[day]);
    const after = capped(counts[day] - playedByOld + playedByNew);
    ev += after - before;
  }
  return { ev, changes };
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
  const patternDifference = changeKey(a.changes).localeCompare(changeKey(b.changes));
  if (patternDifference !== 0) return patternDifference;
  return a.addTeam.localeCompare(b.addTeam);
}

export function optimizeRoster(
  roster: RosterPlayer[],
  dates: string[],
  gameMatrix: Record<TeamCode, boolean[]>,
): OptimizationResult {
  const counts = dates.map((_, dayIndex) =>
    roster.reduce(
      (total, player) => total + playsOn(gameMatrix, player.team, dayIndex),
      0,
    ),
  );
  const baselineGames = counts.reduce((total, count) => total + capped(count), 0);
  const players: PlayerTrades[] = [];

  for (const player of roster) {
    if (!player.streamable) continue;

    const options: TradeOption[] = [];
    for (const { code } of NBA_TEAMS) {
      if (code === player.team) continue;

      let best: TradeOption | undefined;
      for (let afterDay = -1; afterDay < dates.length - 1; afterDay += 1) {
        const effect = tradeEffect(
          counts,
          dates,
          gameMatrix,
          player.team,
          code,
          afterDay,
        );
        if (effect.ev <= 0) continue;
        const effectiveAfter = afterDay < 0 ? null : dates[afterDay];
        if (
          !best ||
          effect.ev > best.ev ||
          (effect.ev === best.ev &&
            (effectiveAfter ?? "") < (best.effectiveAfter ?? ""))
        ) {
          best = {
            addTeam: code,
            ev: effect.ev,
            effectiveAfter,
            changes: effect.changes,
          };
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
      options,
    });
  }

  players.sort((a, b) => {
    const evDifference = b.options[0].ev - a.options[0].ev;
    if (evDifference !== 0) return evDifference;
    return a.playerName.localeCompare(b.playerName);
  });

  return {
    baselineGames,
    players,
    dailyCapacity: dates.map((date, index) => ({
      date,
      filled: capped(counts[index]),
      totalSlots: DAILY_CAP,
      full: counts[index] >= DAILY_CAP,
    })),
  };
}
