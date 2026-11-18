import { normalizeEspnAbbreviation, type TeamCode } from "./teams";

export const MIN_OPPONENT_FACTOR = 0.85;
export const MAX_OPPONENT_FACTOR = 1.15;

export function clampOpponentFactor(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.min(
    MAX_OPPONENT_FACTOR,
    Math.max(MIN_OPPONENT_FACTOR, value),
  );
}

export function opponentFactorsFromPoints(
  pointsAllowed: Array<{ team: TeamCode; pointsAllowed: number }>,
): Record<TeamCode, number> {
  const scored = pointsAllowed.filter((team) => team.pointsAllowed > 0);
  const average =
    scored.reduce((total, team) => total + team.pointsAllowed, 0) /
    (scored.length || 1);

  return Object.fromEntries(
    scored.map((team) => [
      team.team,
      clampOpponentFactor(team.pointsAllowed / average),
    ]),
  ) as Record<TeamCode, number>;
}

interface StandingsPayload {
  children?: Array<{
    standings?: {
      entries?: Array<{
        team?: { abbreviation?: string };
        stats?: Array<{ name?: string; value?: number }>;
      }>;
    };
  }>;
}

export function parseOpponentFactors(payload: unknown): Record<TeamCode, number> {
  const data = payload as StandingsPayload;
  const pointsAllowed: Array<{ team: TeamCode; pointsAllowed: number }> = [];
  const seen = new Set<TeamCode>();

  for (const child of data.children ?? []) {
    for (const entry of child.standings?.entries ?? []) {
      const team = normalizeEspnAbbreviation(entry.team?.abbreviation ?? "");
      const points = entry.stats?.find(
        (stat) => stat.name === "avgPointsAgainst",
      )?.value;
      if (!team || points == null || seen.has(team)) continue;
      seen.add(team);
      pointsAllowed.push({ team, pointsAllowed: points });
    }
  }

  if (pointsAllowed.length < 20) {
    throw new Error("ESPN standings did not include enough team defenses.");
  }

  return opponentFactorsFromPoints(pointsAllowed);
}
