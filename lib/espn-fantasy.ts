import {
  PLAYER_POSITIONS,
  type FreeAgent,
  type PlayerPosition,
  type RosterPlayer,
} from "./optimizer";
import { normalizeEspnAbbreviation, type TeamCode } from "./teams";

const BENCH_SLOT = 12;
const IR_SLOT = 13;

const PRO_TEAM_BY_ID: Record<number, string> = {
  1: "ATL",
  2: "BOS",
  3: "NOP",
  4: "CHI",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GSW",
  10: "HOU",
  11: "IND",
  12: "LAC",
  13: "LAL",
  14: "MIA",
  15: "MIL",
  16: "MIN",
  17: "BKN",
  18: "NYK",
  19: "ORL",
  20: "PHL",
  21: "PHO",
  22: "POR",
  23: "SAC",
  24: "SAS",
  25: "OKC",
  26: "UTA",
  27: "WAS",
  28: "TOR",
  29: "MEM",
  30: "CHA",
};

const SLOT_POSITION: Record<number, PlayerPosition> = {
  0: "PG",
  1: "SG",
  2: "SF",
  3: "PF",
  4: "C",
};

interface EspnStatSplit {
  id?: string;
  seasonId?: number;
  appliedAverage?: number;
}

interface EspnPlayerNode {
  id?: number;
  fullName?: string;
  proTeamId?: number;
  defaultPositionId?: number;
  eligibleSlots?: number[];
  injuryStatus?: string;
  injured?: boolean;
  stats?: EspnStatSplit[];
}

interface EspnPoolEntry {
  status?: string;
  lineupSlotId?: number;
  player?: EspnPlayerNode;
  playerPoolEntry?: { player?: EspnPlayerNode };
}

export interface CatalogPlayer {
  id: string;
  name: string;
  team: TeamCode;
  avgPoints: number;
  available: boolean;
  positions: PlayerPosition[];
}

export interface FantasyTeam {
  id: string;
  name: string;
  yours: boolean;
  roster: RosterPlayer[];
}

export interface LeagueSnapshot {
  teamName: string;
  roster: RosterPlayer[];
  teams: FantasyTeam[];
  catalog: CatalogPlayer[];
  freeAgents: FreeAgent[];
}

function teamFromProId(proTeamId: number | undefined): TeamCode | null {
  if (proTeamId == null) return null;
  return normalizeEspnAbbreviation(PRO_TEAM_BY_ID[proTeamId] ?? "");
}

function positionsFrom(player: EspnPlayerNode): PlayerPosition[] {
  const eligible = (player.eligibleSlots ?? [])
    .map((slot) => SLOT_POSITION[slot])
    .filter((position): position is PlayerPosition => Boolean(position));
  const unique = [...new Set(eligible)];
  if (unique.length > 0) return unique;
  const fallback = SLOT_POSITION[(player.defaultPositionId ?? 1) - 1];
  return [fallback ?? PLAYER_POSITIONS[0]];
}

export function isAvailable(status: string | undefined, injured?: boolean): boolean {
  const normalized = (status ?? "").toUpperCase();
  if (normalized === "OUT" || normalized === "SUSPENSION") return false;
  if (injured && normalized !== "DAY_TO_DAY" && normalized !== "QUESTIONABLE") {
    return false;
  }
  return true;
}

function seasonAverage(stats: EspnStatSplit[] | undefined, year: number): number {
  const split = stats?.find((item) => item.id === `00${year}` && item.seasonId === year);
  const average = split?.appliedAverage;
  return typeof average === "number" && Number.isFinite(average) ? average : 0;
}

function playerNode(entry: EspnPoolEntry): EspnPlayerNode | null {
  return entry.player ?? entry.playerPoolEntry?.player ?? null;
}

function catalogPlayer(
  entry: EspnPoolEntry,
  year: number,
): CatalogPlayer | null {
  const player = playerNode(entry);
  const team = teamFromProId(player?.proTeamId);
  const name = player?.fullName?.trim();
  if (!player?.id || !name || !team) return null;
  const average = Math.round(seasonAverage(player.stats, year) * 100) / 100;
  return {
    id: String(player.id),
    name,
    team,
    avgPoints: average,
    available: isAvailable(player.injuryStatus, player.injured),
    positions: positionsFrom(player),
  };
}

interface LeaguePayload {
  teams?: Array<{
    id?: number;
    name?: string;
    location?: string;
    nickname?: string;
    owners?: string[];
    roster?: { entries?: EspnPoolEntry[] };
  }>;
}

interface FreeAgentPayload {
  players?: EspnPoolEntry[];
}

function fantasyTeamName(team: {
  name?: string;
  location?: string;
  nickname?: string;
}): string {
  return (
    team.name?.trim() ||
    `${team.location ?? ""} ${team.nickname ?? ""}`.trim() ||
    "Unnamed team"
  );
}

function rosterFrom(entries: EspnPoolEntry[] | undefined, year: number): RosterPlayer[] {
  return (entries ?? []).flatMap((entry) => {
    const player = catalogPlayer(entry, year);
    if (!player) return [];
    return [
      {
        ...player,
        streamable: entry.lineupSlotId === BENCH_SLOT && player.available,
        ir: entry.lineupSlotId === IR_SLOT,
      },
    ];
  });
}

export function parseLeagueSnapshot(
  leaguePayload: unknown,
  freeAgentPayload: unknown,
  swid: string,
  year: number,
): LeagueSnapshot {
  const league = leaguePayload as LeaguePayload;
  const sourceTeams = league.teams ?? [];
  const ownerId = swid.trim().toLowerCase();

  const catalog: CatalogPlayer[] = [];
  for (const team of sourceTeams) {
    for (const entry of team.roster?.entries ?? []) {
      const player = catalogPlayer(entry, year);
      if (player) catalog.push(player);
    }
  }

  const teams: FantasyTeam[] = sourceTeams.flatMap((team) => {
    if (team.id == null) return [];
    const yours = (team.owners ?? []).some(
      (owner) => owner.toLowerCase() === ownerId,
    );
    return [
      {
        id: String(team.id),
        name: fantasyTeamName(team),
        yours,
        roster: rosterFrom(team.roster?.entries, year),
      },
    ];
  });

  if (teams.length === 0) {
    throw new Error("ESPN did not return any teams for this league.");
  }

  const mine = teams.find((team) => team.yours) ?? teams[0];
  const roster = mine.roster;

  const freeAgents = ((freeAgentPayload as FreeAgentPayload).players ?? []).flatMap(
    (entry) => {
      if (entry.status !== "FREEAGENT") return [];
      const player = catalogPlayer(entry, year);
      if (!player || !player.available || player.avgPoints <= 0) return [];
      return [
        {
          id: player.id,
          name: player.name,
          team: player.team,
          avgPoints: player.avgPoints,
          positions: player.positions,
        } satisfies FreeAgent,
      ];
    },
  );

  return { teamName: mine.name, roster, teams, catalog, freeAgents };
}

export function applyCatalog(
  roster: RosterPlayer[],
  catalog: CatalogPlayer[],
): RosterPlayer[] {
  return roster.map((player) => {
    const match =
      catalog.find((item) => item.id === player.id) ??
      findByName(catalog, player);
    if (!match) return player;
    return {
      ...player,
      avgPoints: match.avgPoints,
      available: match.available,
    };
  });
}

function findByName(
  catalog: CatalogPlayer[],
  player: RosterPlayer,
): CatalogPlayer | undefined {
  const name = player.name.trim().toLowerCase();
  if (!name) return undefined;
  const matches = catalog.filter((item) => item.name.trim().toLowerCase() === name);
  return (
    matches.find((item) => item.team === player.team) ??
    (matches.length === 1 ? matches[0] : undefined)
  );
}
