import { describe, expect, it } from "vitest";

import { applyCatalog, parseLeagueSnapshot } from "./espn-fantasy";
import type { RosterPlayer } from "./optimizer";

const swid = "{OWNER}";

function stat(average: number) {
  return [{ id: "002027", seasonId: 2027, appliedAverage: average }];
}

describe("parseLeagueSnapshot", () => {
  it("loads the cookie owner's roster and available free agents", () => {
    const snapshot = parseLeagueSnapshot(
      {
        teams: [
          {
            id: 1,
            name: "Other",
            owners: ["{OTHER}"],
            roster: {
              entries: [
                {
                  lineupSlotId: 12,
                  playerPoolEntry: {
                    player: {
                      id: 4,
                      fullName: "Rival",
                      proTeamId: 4,
                      eligibleSlots: [2],
                      injuryStatus: "ACTIVE",
                      stats: stat(15),
                    },
                  },
                },
              ],
            },
          },
          {
            id: 8,
            name: "My Team",
            owners: [swid],
            roster: {
              entries: [
                {
                  lineupSlotId: 0,
                  playerPoolEntry: {
                    player: {
                      id: 1,
                      fullName: "Starter",
                      proTeamId: 2,
                      eligibleSlots: [0, 5],
                      injuryStatus: "ACTIVE",
                      stats: stat(40),
                    },
                  },
                },
                {
                  lineupSlotId: 12,
                  playerPoolEntry: {
                    player: {
                      id: 2,
                      fullName: "Bench",
                      proTeamId: 20,
                      eligibleSlots: [1],
                      injuryStatus: "ACTIVE",
                      stats: stat(12.5),
                    },
                  },
                },
                {
                  lineupSlotId: 13,
                  playerPoolEntry: {
                    player: {
                      id: 3,
                      fullName: "Stash",
                      proTeamId: 9,
                      eligibleSlots: [3],
                      injuryStatus: "OUT",
                      injured: true,
                      stats: stat(30),
                    },
                  },
                },
              ],
            },
          },
        ],
      },
      {
        players: [
          {
            status: "FREEAGENT",
            player: {
              id: 9,
              fullName: "Available",
              proTeamId: 21,
              eligibleSlots: [4],
              injuryStatus: "ACTIVE",
              stats: stat(18),
            },
          },
          {
            status: "FREEAGENT",
            player: {
              id: 10,
              fullName: "Hurt",
              proTeamId: 5,
              eligibleSlots: [0],
              injuryStatus: "OUT",
              stats: stat(35),
            },
          },
          {
            status: "WAIVERS",
            player: {
              id: 11,
              fullName: "Waived",
              proTeamId: 5,
              eligibleSlots: [0],
              injuryStatus: "ACTIVE",
              stats: stat(22),
            },
          },
        ],
      },
      swid,
      2027,
    );

    expect(snapshot.teamName).toBe("My Team");
    expect(snapshot.teams.map((team) => [team.name, team.yours, team.roster.map((player) => player.name)])).toEqual([
      ["Other", false, ["Rival"]],
      ["My Team", true, ["Starter", "Bench", "Stash"]],
    ]);
    expect(snapshot.roster.map((player) => [player.name, player.team, player.streamable, player.available, player.ir])).toEqual([
      ["Starter", "BOS", false, true, false],
      ["Bench", "PHI", true, true, false],
      ["Stash", "GSW", false, false, true],
    ]);
    expect(snapshot.freeAgents.map((player) => player.name)).toEqual(["Available"]);
    expect(snapshot.freeAgents[0]).toMatchObject({ team: "PHX", avgPoints: 18 });
  });
});

describe("applyCatalog", () => {
  it("fills a typed name with the ESPN average and availability", () => {
    const roster: RosterPlayer[] = [
      {
        id: "local",
        name: "Bench",
        team: "PHI",
        streamable: true,
        available: true,
        avgPoints: null,
        positions: ["SG"],
      },
    ];

    expect(
      applyCatalog(roster, [
        {
          id: "2",
          name: "Bench",
          team: "PHI",
          avgPoints: 12.5,
          available: false,
          positions: ["SG"],
        },
      ])[0],
    ).toMatchObject({ avgPoints: 12.5, available: false, streamable: true });
  });
});
