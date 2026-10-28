import { GoogleGenAI } from "@google/genai";

import { PLAYER_POSITIONS } from "@/lib/optimizer";
import { parseImportedRoster } from "@/lib/roster-import";
import { TEAM_CODES } from "@/lib/teams";

export const runtime = "nodejs";

const MAX_INPUT_LENGTH = 50_000;

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      {
        error:
          "Gemini is not configured. Add GEMINI_API_KEY to your .env.local file.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text =
    body &&
    typeof body === "object" &&
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";

  if (!text) {
    return Response.json(
      { error: "Paste at least one player to import." },
      { status: 400 },
    );
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: "Roster text must be 50,000 characters or fewer." },
      { status: 400 },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
      contents: `Extract fantasy basketball roster players from the text below.

Return only players explicitly present in the input. Do not invent players.
Convert NBA team names to their three-letter code.
Extract every ESPN-eligible position shown for each player.
Ignore headings, matchup data, status labels, projections, and statistics.
If a position is absent but the player is unambiguous, use your knowledge of
the player's current ESPN position eligibility.

Roster text:
${text}`,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            players: {
              type: "array",
              minItems: 1,
              maxItems: 30,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  team: { type: "string", enum: TEAM_CODES },
                  positions: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", enum: PLAYER_POSITIONS },
                  },
                },
                required: ["name", "team", "positions"],
              },
            },
          },
          required: ["players"],
        },
      },
    });

    if (!response.text) throw new Error("Gemini returned an empty response.");
    const players = parseImportedRoster(JSON.parse(response.text));
    return Response.json({ players });
  } catch (error) {
    console.error("Unable to import roster with Gemini", error);
    return Response.json(
      {
        error:
          "Gemini could not understand that roster. Check the text and try again.",
      },
      { status: 502 },
    );
  }
}
