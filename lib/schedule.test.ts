import { describe, expect, it } from "vitest";

import {
  buildGameMatrix,
  filterSchedule,
  normalizeSchedule,
  rankTeams,
} from "./schedule";

const payload = {
  leagueSchedule: {
    gameDates: [
      {
        gameDate: "10/27/2026 12:00:00 AM",
        games: [
          {
            gameId: "1",
            homeTeam: { teamTricode: "BOS" },
            awayTeam: { teamTricode: "NYK" },
          },
          {
            gameId: "pre",
            gameLabel: "Preseason",
            homeTeam: { teamTricode: "LAL" },
            awayTeam: { teamTricode: "GSW" },
          },
        ],
      },
      {
        gameDate: "10/28/2026 12:00:00 AM",
        games: [
          {
            gameId: "2",
            homeTeam: { teamTricode: "BOS" },
            awayTeam: { teamTricode: "MIA" },
          },
          {
            gameId: "invalid",
            homeTeam: { teamTricode: "EST" },
            awayTeam: { teamTricode: "WST" },
          },
        ],
      },
    ],
  },
};

describe("schedule helpers", () => {
  it("normalizes valid NBA regular-season games", () => {
    expect(normalizeSchedule(payload)).toEqual([
      { id: "1", date: "2026-10-27", home: "BOS", away: "NYK" },
      { id: "2", date: "2026-10-28", home: "BOS", away: "MIA" },
    ]);
  });

  it("rejects malformed schedule payloads", () => {
    expect(() => normalizeSchedule({})).toThrow("unexpected format");
  });

  it("filters a range and ranks teams by game count", () => {
    const games = filterSchedule(
      normalizeSchedule(payload),
      "2026-10-27",
      "2026-10-28",
    );
    const rankings = rankTeams(games);

    expect(rankings[0]).toEqual({
      team: "BOS",
      games: 2,
      dates: ["2026-10-27", "2026-10-28"],
    });
    expect(rankings.find((team) => team.team === "MIA")?.games).toBe(1);
    expect(rankings.at(-1)?.games).toBe(0);
  });

  it("builds a per-team daily game matrix", () => {
    const games = normalizeSchedule(payload);
    const matrix = buildGameMatrix(games, ["2026-10-27", "2026-10-28"]);

    expect(matrix.BOS).toEqual([true, true]);
    expect(matrix.NYK).toEqual([true, false]);
    expect(matrix.ATL).toEqual([false, false]);
  });
});
