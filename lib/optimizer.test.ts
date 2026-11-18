import { describe, expect, it } from "vitest";

import {
  groupTrades,
  optimizeRoster,
  type FreeAgent,
  type RosterPlayer,
  type TradeOption,
} from "./optimizer";
import { NBA_TEAMS, type TeamCode } from "./teams";

const dates = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];

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
  streamable: boolean,
  avgPoints: number,
  available = true,
): RosterPlayer {
  return {
    id,
    name,
    team,
    streamable,
    available,
    avgPoints,
    positions: ["PG"],
  };
}

function agent(
  id: string,
  name: string,
  team: TeamCode,
  avgPoints: number,
): FreeAgent {
  return { id, name, team, avgPoints, positions: ["PG"] };
}

function trade(
  partial: Pick<TradeOption, "addTeam" | "ev" | "effectiveAfter" | "changes"> &
    Partial<TradeOption>,
): TradeOption {
  return {
    addId: partial.addId ?? partial.addTeam,
    addName: partial.addName ?? partial.addTeam,
    addAvg: partial.addAvg ?? 10,
    games: partial.games ?? 1,
    opponents: partial.opponents ?? [partial.addTeam],
    ...partial,
  };
}

describe("groupTrades", () => {
  it("groups adds only when the day, value, and point changes match", () => {
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
        trade({
          addTeam: "BKN",
          addName: "Net",
          ev: 1,
          effectiveAfter: "2026-10-30",
          changes: oct30And31,
        }),
        trade({
          addTeam: "BOS",
          addName: "Celtic",
          ev: 1,
          effectiveAfter: "2026-10-30",
          changes: oct30And31,
        }),
        trade({
          addTeam: "CHA",
          addName: "Hornet",
          ev: 1,
          effectiveAfter: "2026-10-30",
          changes: oct30AndNov1,
        }),
        trade({
          addTeam: "CHA",
          addName: "Hornet later",
          ev: 1,
          effectiveAfter: "2026-10-31",
          changes: oct30AndNov1,
        }),
      ]).map((group) => ({
        effectiveAfter: group.effectiveAfter,
        teams: group.teams.map((team) => team.addName),
      })),
    ).toEqual([
      { effectiveAfter: "2026-10-30", teams: ["Net", "Celtic"] },
      { effectiveAfter: "2026-10-30", teams: ["Hornet"] },
      { effectiveAfter: "2026-10-31", teams: ["Hornet later"] },
    ]);
  });
});

describe("optimizeRoster", () => {
  it("ranks a shorter softer schedule above more games at a lower average", () => {
    const result = optimizeRoster(
      [player("bench", "Bench", "ATL", true, 8)],
      [
        agent("volume", "Volume", "BOS", 14),
        agent("soft", "Soft", "CHI", 28),
      ],
      dates,
      opponents({
        BOS: ["DET", "DET", "DET", "DET"],
        CHI: ["WAS", "WAS", null, null],
      }),
      { DET: 1, WAS: 1.1 },
    );

    expect(result.players[0]?.options.map((option) => [option.addName, option.ev, option.games])).toEqual([
      ["Soft", 61.6, 2],
      ["Volume", 56, 4],
    ]);
  });

  it("keeps a player through a game when adding afterward is worth more points", () => {
    const result = optimizeRoster(
      [player("a", "Player A", "ATL", true, 20)],
      [agent("b", "Boston", "BOS", 20)],
      dates,
      opponents({
        ATL: [null, "MIA", null, null],
        BOS: [null, null, "NYK", "PHI"],
      }),
    );

    expect(result.players[0]?.options[0]).toMatchObject({
      addName: "Boston",
      ev: 40,
      effectiveAfter: "2026-10-30",
      games: 2,
      changes: [
        { date: "2026-10-31", delta: 20 },
        { date: "2026-11-01", delta: 20 },
      ],
    });
  });

  it("ignores a free-agent game that would sit behind ten better scores", () => {
    const roster = [
      ...Array.from({ length: 10 }, (_, index) =>
        player(`locked-${index}`, `Locked ${index}`, "ATL", false, 30),
      ),
      player("stream", "Streamer", "CHI", true, 10),
    ];

    const result = optimizeRoster(
      roster,
      [agent("add", "Add", "MIA", 20)],
      dates,
      opponents({
        ATL: ["BKN", null, null, null],
        CHI: ["DET", "DET", null, null],
        MIA: ["NYK", "NYK", null, null],
      }),
    );

    expect(result.dailyCapacity[0]).toMatchObject({
      filled: 10,
      totalSlots: 10,
      full: true,
    });
    expect(result.players[0]?.options[0]).toMatchObject({
      addName: "Add",
      ev: 10,
      effectiveAfter: null,
      games: 2,
      changes: [{ date: "2026-10-30", delta: 10 }],
    });
  });

  it("does not offer a protected player as the drop", () => {
    const result = optimizeRoster(
      [player("star", "Star", "ATL", false, 40)],
      [agent("add", "Add", "BOS", 20)],
      dates,
      opponents({
        ATL: ["BOS", null, null, null],
        BOS: ["ATL", "NYK", "PHI", "MIA"],
      }),
    );

    expect(result.players).toEqual([]);
  });

  it("gives an unavailable player no points and leaves injured free agents out of the pool", () => {
    const result = optimizeRoster(
      [player("out", "Out", "ATL", true, 40, false)],
      [agent("healthy", "Healthy", "BOS", 15)],
      dates,
      opponents({
        ATL: ["MIA", "MIA", null, null],
        BOS: ["NYK", null, null, null],
      }),
    );

    expect(result.baselinePoints).toBe(0);
    expect(result.players[0]?.options[0]).toMatchObject({
      addName: "Healthy",
      ev: 15,
      games: 1,
    });
  });
});
