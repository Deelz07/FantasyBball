"use client";

import { useState } from "react";

import { NBA_TEAMS, type TeamCode } from "@/lib/teams";
import {
  PLAYER_POSITIONS,
  type PlayerPosition,
  type RosterPlayer,
} from "@/lib/optimizer";

interface RosterEditorProps {
  roster: RosterPlayer[];
  onChange: (roster: RosterPlayer[]) => void;
}

interface ImportResponse {
  players?: Array<{
    name: string;
    team: TeamCode;
    positions: PlayerPosition[];
  }>;
  error?: string;
}

export function RosterEditor({ roster, onChange }: RosterEditorProps) {
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");

  const update = (id: string, changes: Partial<RosterPlayer>) => {
    onChange(
      roster.map((player) =>
        player.id === id ? { ...player, ...changes } : player,
      ),
    );
  };

  const addPlayer = () => {
    onChange([
      ...roster,
      {
        id: `player-${Date.now()}-${roster.length}`,
        name: "",
        team: "ATL",
        streamable: false,
        positions: ["PG"],
      },
    ]);
  };

  const togglePosition = (
    player: RosterPlayer,
    position: PlayerPosition,
    checked: boolean,
  ) => {
    const currentPositions = player.positions ?? [];
    const positions = checked
      ? [...new Set([...currentPositions, position])]
      : currentPositions.filter((item) => item !== position);
    update(player.id, { positions });
  };

  const importRoster = async () => {
    setImportError("");
    setImportMessage("");
    setImporting(true);

    try {
      const response = await fetch("/api/import-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText }),
      });
      const data = (await response.json()) as ImportResponse;
      if (!response.ok || !data.players) {
        throw new Error(data.error ?? "Unable to import roster.");
      }

      const existing = roster.filter((player) => player.name.trim());
      const existingKeys = new Set(
        existing.map(
          (player) => `${player.name.trim().toLowerCase()}|${player.team}`,
        ),
      );
      const imported = data.players
        .filter(
          (player) =>
            !existingKeys.has(`${player.name.toLowerCase()}|${player.team}`),
        )
        .map((player) => ({
          ...player,
          id: `imported-${crypto.randomUUID()}`,
          streamable: false,
        }));

      onChange([...existing, ...imported]);
      setImportText("");
      setImportMessage(
        imported.length === 0
          ? "Those players are already on your roster."
          : `Added ${imported.length} player${imported.length === 1 ? "" : "s"}. Review their teams and positions below.`,
      );
    } catch (caught) {
      setImportError(
        caught instanceof Error ? caught.message : "Unable to import roster.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="card roster-card" aria-labelledby="roster-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your roster</p>
          <h2 id="roster-heading">Who can be streamed?</h2>
        </div>
        <button className="secondary-button" type="button" onClick={addPlayer}>
          + Add player
        </button>
      </div>

      <div className="roster-import">
        <label htmlFor="roster-import-text">
          <strong>Paste your roster</strong>
          <span>
            Copy from ESPN or enter lines like “Dyson Daniels, ATL, SG/SF”.
          </span>
        </label>
        <textarea
          id="roster-import-text"
          value={importText}
          rows={5}
          placeholder={"Reed Sheppard — HOU — PG, SG\nDyson Daniels — ATL — SG, SF"}
          onChange={(event) => setImportText(event.target.value)}
        />
        <div className="import-footer">
          <small>Sent to Google Gemini for processing. Review AI results.</small>
          <button
            className="secondary-button"
            type="button"
            disabled={importing || !importText.trim()}
            onClick={importRoster}
          >
            {importing ? "Reading roster…" : "Add players with AI"}
          </button>
        </div>
        {importError && (
          <p className="import-error" role="alert">
            {importError}
          </p>
        )}
        {importMessage && (
          <p className="import-success" role="status">
            {importMessage}
          </p>
        )}
      </div>

      <div className="roster-list">
        {roster.map((player, index) => (
          <div className="roster-row" key={player.id}>
            <label className="field player-field">
              <span>Player {index + 1}</span>
              <input
                value={player.name}
                placeholder="e.g. Jalen Johnson"
                onChange={(event) =>
                  update(player.id, { name: event.target.value })
                }
              />
            </label>
            <label className="field team-field">
              <span>NBA team</span>
              <select
                value={player.team}
                onChange={(event) =>
                  update(player.id, {
                    team: event.target.value as TeamCode,
                  })
                }
              >
                {NBA_TEAMS.map((team) => (
                  <option key={team.code} value={team.code}>
                    {team.code} — {team.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="positions-field">
              <legend>ESPN positions</legend>
              <div className="position-options">
                {PLAYER_POSITIONS.map((position) => {
                  const positions = player.positions ?? [];
                  const checked = positions.includes(position);
                  return (
                    <label key={position}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={checked && positions.length === 1}
                        onChange={(event) =>
                          togglePosition(
                            player,
                            position,
                            event.target.checked,
                          )
                        }
                      />
                      <span>{position}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="stream-toggle">
              <input
                type="checkbox"
                checked={player.streamable}
                onChange={(event) =>
                  update(player.id, { streamable: event.target.checked })
                }
              />
              <span>
                <strong>Streamable</strong>
                <small>May be dropped</small>
              </span>
            </label>
            <button
              className="icon-button"
              type="button"
              aria-label={`Remove ${player.name || `player ${index + 1}`}`}
              disabled={roster.length === 1}
              onClick={() =>
                onChange(roster.filter((item) => item.id !== player.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
