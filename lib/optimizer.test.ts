import { describe, expect, it } from "vitest";

import {
  countPlayablePlayers,
  optimizeRoster,
  type PlayerPosition,
  type RosterPlayer,
} from "./optimizer";
import { NBA_TEAMS, type TeamCode } from "./teams";

const dates = ["2026-10-27", "2026-10-28", "2026-10-29"];

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
  team: TeamCode,
  streamable: boolean,
  positions: PlayerPosition[] = ["PG"],
): RosterPlayer {
  return { id, name: `Player ${id}`, team, streamable, positions };
}

describe("optimizeRoster", () => {
  it("assigns players across ESPN position, flex, and utility slots", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `guard-${index}`,
        positions: ["PG"] as PlayerPosition[],
      })),
      {
        id: "multi-position",
        positions: ["SG", "SF"] as PlayerPosition[],
      },
    ];

    expect(countPlayablePlayers(players)).toBe(6);
    expect(
      countPlayablePlayers(
        Array.from({ length: 6 }, (_, index) => ({
          id: `pg-${index}`,
          positions: ["PG"] as PlayerPosition[],
        })),
      ),
    ).toBe(5);
  });

  it("keeps the roster unchanged with zero acquisitions", () => {
    const result = optimizeRoster(
      [player("a", "ATL", true)],
      dates,
      matrix({ ATL: [0, 2], BOS: [1, 2] }),
      0,
    );

    expect(result).toMatchObject({
      baselineGames: 2,
      optimizedGames: 2,
      gain: 0,
      acquisitionsUsed: 0,
      actions: [],
    });
  });

  it("switches a streamable slot on the best date", () => {
    const result = optimizeRoster(
      [player("a", "ATL", true)],
      dates,
      matrix({ ATL: [0], BOS: [1, 2] }),
      1,
    );

    expect(result.optimizedGames).toBe(3);
    expect(result.gain).toBe(2);
    expect(result.actions).toEqual([
      {
        date: "2026-10-28",
        slotId: "a",
        drop: "Player a",
        addTeam: "BOS",
        addTeams: ["BOS"],
        addPosition: "PG",
      },
    ]);
  });

  it("never replaces a protected player", () => {
    const result = optimizeRoster(
      [player("star", "ATL", false)],
      dates,
      matrix({ ATL: [0], BOS: [0, 1, 2] }),
      3,
    );

    expect(result.optimizedGames).toBe(1);
    expect(result.actions).toEqual([]);
  });

  it("allocates a shared acquisition budget to the highest-gain slot", () => {
    const result = optimizeRoster(
      [player("one", "ATL", true), player("two", "CHI", true)],
      dates,
      matrix({
        ATL: [0],
        BOS: [1, 2],
        CHI: [0, 1],
        CLE: [2],
      }),
      1,
    );

    expect(result.baselineGames).toBe(3);
    expect(result.optimizedGames).toBe(5);
    expect(result.actions[0]).toMatchObject({
      slotId: "one",
      addTeam: "BOS",
      addTeams: ["BOS"],
    });
  });

  it("lists every team that produces the optimal result", () => {
    const tied = optimizeRoster(
      [player("a", "ATL", true)],
      dates,
      matrix({ BOS: [1], CLE: [1], MIA: [1] }),
      1,
    );
    const strictlyBetter = optimizeRoster(
      [player("a", "ATL", true)],
      dates,
      matrix({ BOS: [1], CLE: [1], NYK: [1, 2] }),
      1,
    );

    expect(tied.actions[0]?.addTeams).toEqual(["BOS", "CLE", "MIA"]);
    expect(strictlyBetter.actions[0]?.addTeams).toEqual(["NYK"]);
  });

  it("does not recommend an addition on a day with a full active lineup", () => {
    const fullRoster = [
      player("pg", "ATL", true, ["PG"]),
      player("sg", "ATL", false, ["SG"]),
      player("sf", "ATL", false, ["SF"]),
      player("pf", "ATL", false, ["PF"]),
      player("c", "ATL", false, ["C"]),
      player("g", "ATL", false, ["PG"]),
      player("f", "ATL", false, ["SF"]),
      player("u1", "ATL", false, ["C"]),
      player("u2", "ATL", false, ["C"]),
      player("u3", "ATL", false, ["C"]),
    ];

    const result = optimizeRoster(
      fullRoster,
      dates,
      matrix({ ATL: [0], BOS: [0, 1] }),
      1,
    );

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].date).toBe("2026-10-28");
    expect(result.dailyCapacity[0]).toMatchObject({
      baselineFilled: 10,
      optimizedFilled: 10,
      totalSlots: 10,
    });
  });

  it("reports open lineup capacity and the position required by a move", () => {
    const result = optimizeRoster(
      [
        player("fixed", "ATL", false, ["C"]),
        player("stream", "CHI", true, ["PG", "SG"]),
      ],
      dates,
      matrix({ ATL: [0], BOS: [0, 1], CHI: [2] }),
      1,
    );

    expect(result.actions[0]).toMatchObject({
      date: "2026-10-27",
      slotId: "stream",
      addTeam: "BOS",
      addTeams: ["BOS"],
      addPosition: "PG",
    });
    expect(result.dailyCapacity[0]).toMatchObject({
      baselineFilled: 1,
      optimizedFilled: 2,
    });
  });
});
