import { describe, expect, it } from "vitest";

import type { RosterPlayer } from "./optimizer";
import { NBA_TEAMS, type TeamCode } from "./teams";
import { rankTeamsByWeeklyAverage, weeklyAverageScore } from "./week-score";

const dates = ["2026-11-17", "2026-11-18", "2026-11-19"];

function opponents(
  games: Partial<Record<TeamCode, Array<TeamCode | null>>>,
): Record<TeamCode, (TeamCode | null)[]> {
  return Object.fromEntries(
    NBA_TEAMS.map(({ code }) => [
      code,
      dates.map((_, index) => games[code]?.[index] ?? null),
    ]),
  ) as Record<TeamCode, (TeamCode | null)[]>;
}

function player(
  id: string,
  name: string,
  team: TeamCode,
  avgPoints: number | null,
  available = true,
): RosterPlayer {
  return {
    id,
    name,
    team,
    streamable: false,
    available,
    avgPoints,
    positions: ["PG"],
  };
}

describe("weeklyAverageScore", () => {
  it("adds each counted game at the player's average", () => {
    const score = weeklyAverageScore(
      [
        player("a", "Alpha", "ATL", 20),
        player("b", "Beta", "BOS", 10),
      ],
      dates,
      opponents({
        ATL: ["MIA", "MIA", null],
        BOS: [null, null, "NYK"],
      }),
    );

    expect(score.total).toBe(50);
    expect(score.players.map((item) => [item.name, item.games, item.expected])).toEqual([
      ["Alpha", 2, 40],
      ["Beta", 1, 10],
    ]);
  });

  it("leaves a game uncounted when ten higher averages already play", () => {
    const roster = [
      ...Array.from({ length: 10 }, (_, index) =>
        player(`locked-${index}`, `Locked ${index}`, "ATL", 30 - index),
      ),
      player("extra", "Extra", "CHI", 5),
    ];

    const score = weeklyAverageScore(
      roster,
      dates,
      opponents({
        ATL: ["BKN", null, null],
        CHI: ["DET", null, null],
      }),
    );

    const extra = score.players.find((item) => item.name === "Extra");
    expect(extra).toMatchObject({ games: 1, countedGames: 0, expected: 0 });
    expect(score.days[0]).toMatchObject({ playing: 11, expected: 255 });
    expect(score.total).toBe(255);
  });

  it("gives an unavailable player no points", () => {
    const score = weeklyAverageScore(
      [player("out", "Out", "ATL", 40, false)],
      dates,
      opponents({ ATL: ["MIA", "MIA", null] }),
    );

    expect(score.total).toBe(0);
    expect(score.players[0]).toMatchObject({ games: 2, countedGames: 0, expected: 0 });
  });
});

describe("rankTeamsByWeeklyAverage", () => {
  it("sorts every fantasy team from highest weekly average to lowest", () => {
    const ranking = rankTeamsByWeeklyAverage(
      [
        {
          id: "low",
          name: "Low",
          yours: false,
          roster: [player("a", "Alpha", "ATL", 10)],
        },
        {
          id: "high",
          name: "High",
          yours: true,
          roster: [player("b", "Beta", "BOS", 30)],
        },
        {
          id: "mid",
          name: "Mid",
          yours: false,
          roster: [player("c", "Gamma", "CHI", 20)],
        },
      ],
      dates,
      opponents({
        ATL: ["MIA", null, null],
        BOS: ["NYK", "NYK", null],
        CHI: ["DET", null, null],
      }),
    );

    expect(ranking.map((team) => [team.name, team.total, team.games])).toEqual([
      ["High", 60, 2],
      ["Mid", 20, 1],
      ["Low", 10, 1],
    ]);
  });

  it("reports a second total and game count with IR players removed", () => {
    const ranking = rankTeamsByWeeklyAverage(
      [
        {
          id: "stash",
          name: "Stash",
          yours: false,
          roster: [
            player("active", "Active", "ATL", 10),
            { ...player("ir", "Stashed", "BOS", 40), ir: true },
          ],
        },
      ],
      dates,
      opponents({
        ATL: ["MIA", null, null],
        BOS: ["NYK", "NYK", null],
      }),
    );

    expect(ranking[0]).toMatchObject({
      total: 90,
      games: 3,
      totalWithoutIr: 10,
      gamesWithoutIr: 1,
    });
  });
});
