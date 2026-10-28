import { NBA_TEAMS, TEAM_NAMES, type TeamCode } from "./teams";

export const PLAYER_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const ESPN_LINEUP_SLOTS = [
  "PG",
  "SG",
  "SF",
  "PF",
  "C",
  "G",
  "F",
  "UTIL",
  "UTIL",
  "UTIL",
] as const;
export type LineupSlot = (typeof ESPN_LINEUP_SLOTS)[number];

export interface RosterPlayer {
  id: string;
  name: string;
  team: TeamCode;
  streamable: boolean;
  positions: PlayerPosition[];
}

export interface AcquisitionAction {
  date: string;
  slotId: string;
  drop: string;
  addTeam: TeamCode;
  addTeams: TeamCode[];
  addPosition: PlayerPosition;
}

export interface DailyCapacity {
  date: string;
  baselineFilled: number;
  optimizedFilled: number;
  totalSlots: number;
}

export interface OptimizationResult {
  baselineGames: number;
  optimizedGames: number;
  gain: number;
  acquisitionsUsed: number;
  actions: AcquisitionAction[];
  dailyCapacity: DailyCapacity[];
}

interface ActivePlayer {
  id: string;
  positions: PlayerPosition[];
}

interface RosterStatePlayer extends RosterPlayer {
  originalName: string;
}

interface OptimizationState {
  games: number;
  used: number;
  roster: RosterStatePlayer[];
  actions: AcquisitionAction[];
  optimizedByDay: number[];
}

const MAX_STATES = 5_000;

function slotAccepts(slot: LineupSlot, position: PlayerPosition): boolean {
  return (
    slot === "UTIL" ||
    slot === position ||
    (slot === "G" && (position === "PG" || position === "SG")) ||
    (slot === "F" && (position === "SF" || position === "PF"))
  );
}

export function countPlayablePlayers(players: ActivePlayer[]): number {
  const playerForSlot: Array<number | undefined> = Array(
    ESPN_LINEUP_SLOTS.length,
  );

  function assign(playerIndex: number, visited: boolean[]): boolean {
    for (
      let slotIndex = 0;
      slotIndex < ESPN_LINEUP_SLOTS.length;
      slotIndex += 1
    ) {
      if (
        visited[slotIndex] ||
        !players[playerIndex].positions.some((position) =>
          slotAccepts(ESPN_LINEUP_SLOTS[slotIndex], position),
        )
      ) {
        continue;
      }

      visited[slotIndex] = true;
      const assignedPlayer = playerForSlot[slotIndex];
      if (
        assignedPlayer === undefined ||
        assign(assignedPlayer, visited)
      ) {
        playerForSlot[slotIndex] = playerIndex;
        return true;
      }
    }
    return false;
  }

  return players.reduce(
    (filled, _player, playerIndex) =>
      filled +
      Number(assign(playerIndex, Array(ESPN_LINEUP_SLOTS.length).fill(false))),
    0,
  );
}

function actionKey(actions: AcquisitionAction[]): string {
  return actions
    .map(
      (action) =>
        `${action.date}:${action.slotId}:${action.addTeam}:${PLAYER_POSITIONS.indexOf(action.addPosition)}`,
    )
    .join("|");
}

function stateKey(state: OptimizationState): string {
  return `${state.used}|${state.roster
    .map(
      (player) =>
        `${player.id}:${player.team}:${[...player.positions].sort().join(",")}`,
    )
    .join("|")}`;
}

function betterState(
  candidate: OptimizationState,
  current?: OptimizationState,
): boolean {
  if (!current) return true;
  if (candidate.games !== current.games) return candidate.games > current.games;
  if (candidate.used !== current.used) return candidate.used < current.used;
  return actionKey(candidate.actions) < actionKey(current.actions);
}

function playableOnDay(
  roster: RosterStatePlayer[],
  dayIndex: number,
  gameMatrix: Record<TeamCode, boolean[]>,
): number {
  return countPlayablePlayers(
    roster
      .filter((player) => gameMatrix[player.team][dayIndex])
      .map((player) => ({ id: player.id, positions: player.positions })),
  );
}

function recordState(
  states: Map<string, OptimizationState>,
  candidate: OptimizationState,
) {
  const key = stateKey(candidate);
  if (betterState(candidate, states.get(key))) states.set(key, candidate);
}

function pruneStates(
  states: Iterable<OptimizationState>,
): OptimizationState[] {
  return [...states]
    .sort((a, b) => {
      if (a.games !== b.games) return b.games - a.games;
      if (a.used !== b.used) return a.used - b.used;
      return actionKey(a.actions).localeCompare(actionKey(b.actions));
    })
    .slice(0, MAX_STATES);
}

function scoreActions(
  roster: RosterStatePlayer[],
  dates: string[],
  gameMatrix: Record<TeamCode, boolean[]>,
  actions: AcquisitionAction[],
): number {
  let currentRoster = roster;
  return dates.reduce((games, date, dayIndex) => {
    const moves = actions.filter((action) => action.date === date);
    if (moves.length > 0) {
      currentRoster = currentRoster.map((player) => {
        const move = moves.findLast((action) => action.slotId === player.id);
        return move
          ? {
              ...player,
              team: move.addTeam,
              positions: [move.addPosition],
            }
          : player;
      });
    }
    return games + playableOnDay(currentRoster, dayIndex, gameMatrix);
  }, 0);
}

function withEquivalentTeams(
  roster: RosterStatePlayer[],
  dates: string[],
  gameMatrix: Record<TeamCode, boolean[]>,
  actions: AcquisitionAction[],
  targetGames: number,
): AcquisitionAction[] {
  return actions.map((action, actionIndex) => {
    const dayIndex = dates.indexOf(action.date);
    const addTeams = NBA_TEAMS.map(({ code }) => code).filter((code) => {
      if (!gameMatrix[code]?.[dayIndex]) return false;
      const candidateActions = actions.map((item, index) =>
        index === actionIndex ? { ...item, addTeam: code } : item,
      );
      return (
        scoreActions(roster, dates, gameMatrix, candidateActions) ===
        targetGames
      );
    });

    return {
      ...action,
      addTeams: addTeams.length > 0 ? addTeams : [action.addTeam],
    };
  });
}

export function optimizeRoster(
  roster: RosterPlayer[],
  dates: string[],
  gameMatrix: Record<TeamCode, boolean[]>,
  acquisitionLimit: number,
): OptimizationResult {
  const limit = Math.max(0, Math.floor(acquisitionLimit));
  const initialRoster: RosterStatePlayer[] = roster.map((player) => ({
    ...player,
    originalName: player.name,
  }));
  const baselineByDay = dates.map((_date, dayIndex) =>
    playableOnDay(initialRoster, dayIndex, gameMatrix),
  );
  const baselineGames = baselineByDay.reduce((total, games) => total + games, 0);

  let states: OptimizationState[] = [
    {
      games: 0,
      used: 0,
      roster: initialRoster,
      actions: [],
      optimizedByDay: [],
    },
  ];

  dates.forEach((date, dayIndex) => {
    const allDayStates = new Map<string, OptimizationState>();
    let frontier = new Map<string, OptimizationState>();
    for (const state of states) {
      recordState(frontier, state);
      recordState(allDayStates, state);
    }

    for (let step = 0; step < limit; step += 1) {
      const next = new Map<string, OptimizationState>();

      for (const state of frontier.values()) {
        if (state.used >= limit) continue;
        const currentPlayable = playableOnDay(
          state.roster,
          dayIndex,
          gameMatrix,
        );

        state.roster.forEach((player, playerIndex) => {
          if (!player.streamable) return;

          for (const { code } of NBA_TEAMS) {
            if (!gameMatrix[code][dayIndex]) continue;

            for (const position of PLAYER_POSITIONS) {
              if (
                code === player.team &&
                player.positions.length === 1 &&
                player.positions[0] === position
              ) {
                continue;
              }

              const nextPlayer: RosterStatePlayer = {
                ...player,
                team: code,
                positions: [position],
              };
              const nextRoster = state.roster.with(playerIndex, nextPlayer);
              if (
                playableOnDay(nextRoster, dayIndex, gameMatrix) <=
                currentPlayable
              ) {
                continue;
              }

              const previousAction = [...state.actions]
                .reverse()
                .find((action) => action.slotId === player.id);
              const drop = previousAction
                ? `${TEAM_NAMES[player.team]} streamer`
                : player.originalName;
              const candidate: OptimizationState = {
                ...state,
                used: state.used + 1,
                roster: nextRoster,
                actions: [
                  ...state.actions,
                  {
                    date,
                    slotId: player.id,
                    drop,
                    addTeam: code,
                    addTeams: [code],
                    addPosition: position,
                  },
                ],
              };
              recordState(next, candidate);
              recordState(allDayStates, candidate);
            }
          }
        });
      }

      if (next.size === 0) break;
      frontier = new Map(
        pruneStates(next.values()).map((state) => [stateKey(state), state]),
      );
    }

    const scored = new Map<string, OptimizationState>();
    for (const state of allDayStates.values()) {
      const filled = playableOnDay(state.roster, dayIndex, gameMatrix);
      recordState(scored, {
        ...state,
        games: state.games + filled,
        optimizedByDay: [...state.optimizedByDay, filled],
      });
    }
    states = pruneStates(scored.values());
  });

  const best = states.reduce((current, candidate) =>
    betterState(candidate, current) ? candidate : current,
  );
  const optimizedGames = best.games;
  const actions = withEquivalentTeams(
    initialRoster,
    dates,
    gameMatrix,
    best.actions,
    optimizedGames,
  ).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.slotId.localeCompare(b.slotId) ||
      a.addTeam.localeCompare(b.addTeam) ||
      a.addPosition.localeCompare(b.addPosition),
  );
  return {
    baselineGames,
    optimizedGames,
    gain: optimizedGames - baselineGames,
    acquisitionsUsed: best.used,
    actions,
    dailyCapacity: dates.map((date, index) => ({
      date,
      baselineFilled: baselineByDay[index],
      optimizedFilled: best.optimizedByDay[index],
      totalSlots: ESPN_LINEUP_SLOTS.length,
    })),
  };
}
