import { PLAYER_POSITIONS, type PlayerPosition } from "./optimizer";
import { isTeamCode, type TeamCode } from "./teams";

export interface ImportedRosterPlayer {
  name: string;
  team: TeamCode;
  positions: PlayerPosition[];
}

const PLAYER_POSITION_SET = new Set<string>(PLAYER_POSITIONS);

export function parseImportedRoster(value: unknown): ImportedRosterPlayer[] {
  if (!value || typeof value !== "object") {
    throw new Error("Gemini returned an invalid roster.");
  }

  const players = (value as { players?: unknown }).players;
  if (!Array.isArray(players) || players.length === 0 || players.length > 30) {
    throw new Error("Gemini did not return a valid player list.");
  }

  return players.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`Player ${index + 1} is invalid.`);
    }

    const player = value as {
      name?: unknown;
      team?: unknown;
      positions?: unknown;
    };
    const name = typeof player.name === "string" ? player.name.trim() : "";
    const team = typeof player.team === "string" ? player.team : "";
    const positions = Array.isArray(player.positions)
      ? [...new Set(player.positions)]
      : [];

    if (
      !name ||
      !isTeamCode(team) ||
      positions.length === 0 ||
      !positions.every(
        (position): position is PlayerPosition =>
          typeof position === "string" &&
          PLAYER_POSITION_SET.has(position),
      )
    ) {
      throw new Error(`Player ${index + 1} has incomplete roster data.`);
    }

    return { name, team, positions };
  });
}
