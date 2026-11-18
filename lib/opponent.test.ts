import { describe, expect, it } from "vitest";

import {
  opponentFactorsFromPoints,
  parseOpponentFactors,
} from "./opponent";

describe("opponentFactorsFromPoints", () => {
  it("clamps a defense to within 15 percent of the league average", () => {
    expect(
      opponentFactorsFromPoints([
        { team: "BOS", pointsAllowed: 100 },
        { team: "WAS", pointsAllowed: 150 },
      ]),
    ).toEqual({ BOS: 0.85, WAS: 1.15 });
  });
});

describe("parseOpponentFactors", () => {
  it("reads points allowed and skips duplicate conference rows", () => {
    const abbreviations = [
      "NY",
      "GS",
      "NO",
      "SA",
      "UTAH",
      "WSH",
      "BOS",
      "LAL",
      "MIA",
      "CHI",
      "DET",
      "PHI",
      "DAL",
      "DEN",
      "HOU",
      "IND",
      "MIL",
      "ORL",
      "PHX",
      "SAC",
    ];
    const factors = parseOpponentFactors({
      children: [
        {
          standings: {
            entries: abbreviations.map((abbreviation) => ({
              team: { abbreviation },
              stats: [
                {
                  name: "avgPointsAgainst",
                  value: abbreviation === "NY" ? 130 : 100,
                },
              ],
            })),
          },
        },
        {
          standings: {
            entries: [
              {
                team: { abbreviation: "NY" },
                stats: [{ name: "avgPointsAgainst", value: 1 }],
              },
            ],
          },
        },
      ],
    });

    expect(factors.NYK).toBeGreaterThan(1);
    expect(factors.BOS).toBeLessThan(1);
  });
});
