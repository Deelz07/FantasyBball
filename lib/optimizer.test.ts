import { describe, expect, it } from "vitest";

import { groupTrades, optimizeRoster, type RosterPlayer } from "./optimizer";
import { NBA_TEAMS, type TeamCode } from "./teams";

const dates = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];

function matrix(
  games: Partial<Record<TeamCode, number[]>>,
): Record<TeamCode, boolean[]> {
  return Object.fromEntries(
    NBA_TEAMS.map(({ code }) => [
      code,
      dates.map((_, index) => games[code]?.includes(index) ?? false),
    ]),
  ) as Record<TeamCode, boolean[]>;
}

function player(
  id: string,
  name: string,
  team: TeamCode,
  streamable: boolean,
): RosterPlayer {
  return { id, name, team, streamable, positions: ["PG"] };
}

describe("groupTrades", () => {
  it("groups teams only when the day, value, and game dates match", () => {
    const oct30And31 = [
      { date: "2026-10-29", delta: -1 },
      { date: "2026-10-30", delta: 1 },
      { date: "2026-10-31", delta: 1 },
    ];
    const oct30AndNov1 = [
      { date: "2026-10-30", delta: 1 },
      { date: "2026-11-01", delta: 1 },
    ];

    expect(
      groupTrades([
        {
          addTeam: "BKN",
          ev: 1,
          effectiveAfter: "2026-10-30",
          changes: oct30And31,
        },
        {
          addTeam: "BOS",
          ev: 1,
          effectiveAfter: "2026-10-30",
          changes: oct30And31,
        },
        {
          addTeam: "CHA",
          ev: 1,
          effectiveAfter: "2026-10-30",
          changes: oct30AndNov1,
        },
        {
          addTeam: "CHA",
          ev: 1,
          effectiveAfter: "2026-10-31",
          changes: oct30AndNov1,
        },
      ]).map((group) => ({
        effectiveAfter: group.effectiveAfter,
        teams: group.teams.map((team) => team.addTeam),
      })),
    ).toEqual([
      { effectiveAfter: "2026-10-30", teams: ["BKN", "BOS"] },
      { effectiveAfter: "2026-10-30", teams: ["CHA"] },
      { effectiveAfter: "2026-10-31", teams: ["CHA"] },
    ]);
  });
});

describe("optimizeRoster", () => {
  it("keeps a player through a game when trading afterward adds more games", () => {
    const result = optimizeRoster(
      [player("a", "Player A", "ATL", true)],
      dates,
      matrix({ ATL: [1], BOS: [2, 3] }),
    );

    expect(result.baselineGames).toBe(1);
    expect(result.players).toEqual([
      {
        playerId: "a",
        playerName: "Player A",
        team: "ATL",
        options: [
          {
            addTeam: "BOS",
            ev: 2,
            effectiveAfter: "2026-10-30",
            changes: [
              { date: "2026-10-31", delta: 1 },
              { date: "2026-11-01", delta: 1 },
            ],
          },
        ],
      },
    ]);
  });

  it("does not count an extra player on a day that already has 10", () => {
    const roster = [
      ...Array.from({ length: 10 }, (_, index) =>
        player(`locked-${index}`, `Locked ${index}`, "ATL", false),
      ),
      player("stream", "Streamer", "CHI", true),
    ];

    const result = optimizeRoster(
      roster,
      dates,
      matrix({ ATL: [0], BOS: [0, 1] }),
    );

    expect(result.dailyCapacity[0]).toMatchObject({
      filled: 10,
      totalSlots: 10,
      full: true,
    });
    expect(result.players[0]?.options).toEqual([
      {
        addTeam: "BOS",
        ev: 1,
        effectiveAfter: null,
        changes: [
          { date: "2026-10-29", delta: 1 },
          { date: "2026-10-30", delta: 1 },
        ],
      },
    ]);
  });

  it("does not lose a capped game when dropping a player from a day above 10", () => {
    const roster = [
      ...Array.from({ length: 10 }, (_, index) =>
        player(`locked-${index}`, `Locked ${index}`, "ATL", false),
      ),
      player("stream", "Streamer", "ATL", true),
    ];

    const result = optimizeRoster(
      roster,
      dates,
      matrix({ ATL: [0], BOS: [1] }),
    );

    expect(result.baselineGames).toBe(10);
    expect(result.dailyCapacity[0].full).toBe(true);
    expect(result.players[0]?.options).toEqual([
      {
        addTeam: "BOS",
        ev: 1,
        effectiveAfter: null,
        changes: [
          { date: "2026-10-29", delta: -1 },
          { date: "2026-10-30", delta: 1 },
        ],
      },
    ]);
  });

  it("never offers a protected player as the drop", () => {
    const result = optimizeRoster(
      [player("star", "Star", "ATL", false)],
      dates,
      matrix({ ATL: [0], BOS: [0, 1, 2, 3] }),
    );

    expect(result.players).toEqual([]);
  });

  it("omits a swap onto the same team", () => {
    const result = optimizeRoster(
      [player("a", "Player A", "ATL", true)],
      dates,
      matrix({ ATL: [0], BOS: [1] }),
    );

    expect(result.players[0]?.options.map((option) => option.addTeam)).toEqual([
      "BOS",
    ]);
  });

  it("groups swaps by player and orders them by games added", () => {
    const result = optimizeRoster(
      [
        player("bee", "Bee", "CHI", true),
        player("ace", "Ace", "ATL", true),
      ],
      dates,
      matrix({ CHI: [0, 1], BOS: [0, 1], CLE: [2], MIA: [3] }),
    );

    expect(result.players.map((group) => group.playerName)).toEqual([
      "Ace",
      "Bee",
    ]);
    expect(result.players[0]?.options).toEqual([
      {
        addTeam: "BOS",
        ev: 2,
        effectiveAfter: null,
        changes: [
          { date: "2026-10-29", delta: 1 },
          { date: "2026-10-30", delta: 1 },
        ],
      },
      {
        addTeam: "CHI",
        ev: 2,
        effectiveAfter: null,
        changes: [
          { date: "2026-10-29", delta: 1 },
          { date: "2026-10-30", delta: 1 },
        ],
      },
      {
        addTeam: "CLE",
        ev: 1,
        effectiveAfter: null,
        changes: [{ date: "2026-10-31", delta: 1 }],
      },
      {
        addTeam: "MIA",
        ev: 1,
        effectiveAfter: null,
        changes: [{ date: "2026-11-01", delta: 1 }],
      },
    ]);
    expect(result.players[1]?.options).toEqual([
      {
        addTeam: "CLE",
        ev: 1,
        effectiveAfter: "2026-10-30",
        changes: [{ date: "2026-10-31", delta: 1 }],
      },
      {
        addTeam: "MIA",
        ev: 1,
        effectiveAfter: "2026-10-30",
        changes: [{ date: "2026-11-01", delta: 1 }],
      },
    ]);
    expect(
      groupTrades(result.players[1]?.options ?? []).map((group) =>
        group.teams.map((team) => team.addTeam),
      ),
    ).toEqual([["CLE"], ["MIA"]]);
  });
});
