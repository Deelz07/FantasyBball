import { describe, expect, it } from "vitest";

import { parseImportedRoster } from "./roster-import";

describe("parseImportedRoster", () => {
  it("accepts and normalizes structured Gemini roster data", () => {
    expect(
      parseImportedRoster({
        players: [
          {
            name: "  Dyson Daniels ",
            team: "ATL",
            positions: ["SG", "SF", "SG"],
          },
        ],
      }),
    ).toEqual([
      {
        name: "Dyson Daniels",
        team: "ATL",
        positions: ["SG", "SF"],
      },
    ]);
  });

  it("rejects unsupported teams or missing positions", () => {
    expect(() =>
      parseImportedRoster({
        players: [{ name: "Unknown", team: "XYZ", positions: ["PG"] }],
      }),
    ).toThrow("incomplete roster data");

    expect(() =>
      parseImportedRoster({
        players: [{ name: "Unknown", team: "ATL", positions: [] }],
      }),
    ).toThrow("incomplete roster data");
  });
});
