"use client";

import { useState } from "react";

import type { TeamWeekScore } from "@/lib/week-score";

interface WeekScoreProps {
  ranking: TeamWeekScore[];
  selectedTeamId: string | null;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function WeekScore({ ranking, selectedTeamId }: WeekScoreProps) {
  const [openTeamId, setOpenTeamId] = useState(
    selectedTeamId && ranking.some((team) => team.id === selectedTeamId)
      ? selectedTeamId
      : ranking[0]?.id ?? null,
  );
  const open = ranking.find((team) => team.id === openTeamId) ?? ranking[0];
  const leader = ranking[0];

  return (
    <section className="results" aria-live="polite">
      <div className="summary-grid">
        <article className="metric-card accent">
          <span>Highest week</span>
          <strong>{leader ? leader.total.toFixed(1) : "—"}</strong>
          <small>{leader?.name ?? "No teams"}</small>
        </article>
        <article className="metric-card">
          <span>Teams</span>
          <strong>{ranking.length}</strong>
          <small>sorted by average</small>
        </article>
        <article className="metric-card">
          <span>Your rank</span>
          <strong>
            {ranking.findIndex((team) => team.yours) + 1 || "—"}
          </strong>
          <small>
            {ranking.find((team) => team.yours)?.total.toFixed(1) ?? "not in league"}
          </small>
        </article>
      </div>

      <article className="card">
        <p className="eyebrow">League</p>
        <h2>Week scores from averages</h2>
        <div className="score-table" role="table" aria-label="Fantasy teams ranked by weekly average">
          <div className="score-row score-rank score-head" role="row">
            <span role="columnheader">Team</span>
            <span role="columnheader">Rank</span>
            <span role="columnheader">Games</span>
            <span role="columnheader">No IR</span>
            <span role="columnheader">Expected</span>
            <span role="columnheader">No IR</span>
          </div>
          {ranking.map((team, index) => (
            <button
              className="score-row score-rank score-team"
              type="button"
              role="row"
              key={team.id}
              aria-pressed={team.id === open?.id}
              onClick={() => setOpenTeamId(team.id)}
            >
              <span role="cell">
                <strong>{team.name}</strong>
                <small>
                  {team.yours ? "Your team" : ""}
                  {team.id === selectedTeamId && !team.yours ? "Selected" : ""}
                </small>
              </span>
              <span role="cell">{index + 1}</span>
              <span role="cell">{team.games}</span>
              <span role="cell">{team.gamesWithoutIr}</span>
              <span role="cell">
                <strong>{team.total.toFixed(1)}</strong>
              </span>
              <span role="cell">
                <strong>{team.totalWithoutIr.toFixed(1)}</strong>
              </span>
            </button>
          ))}
        </div>
        <p className="assumption-note">
          Each counted game is worth that player&apos;s season fantasy average.
          Opponent strength is not included. On a day with more than 10
          players, only the 10 highest averages count. The No IR columns
          drop injured-reserve players from both the games and the expected
          points. Select a row to see that roster.
        </p>
      </article>

      {open && (
        <article className="card">
          <p className="eyebrow">{open.name}</p>
          <h2>Expected points by player</h2>
          <div className="score-table" role="table" aria-label={`${open.name} weekly averages`}>
            <div className="score-row score-head" role="row">
              <span role="columnheader">Player</span>
              <span role="columnheader">Avg</span>
              <span role="columnheader">Games</span>
              <span role="columnheader">Expected</span>
            </div>
            {open.score.players.map((player) => (
              <div className="score-row" role="row" key={player.id}>
                <span role="cell">
                  <strong>{player.name}</strong>
                  <small>
                    {player.team}
                    {player.ir ? " · IR" : ""}
                    {player.available ? "" : " · Out"}
                    {player.games > player.countedGames
                      ? ` · ${player.games - player.countedGames} sat`
                      : ""}
                  </small>
                </span>
                <span role="cell">
                  {player.avgPoints == null ? "—" : player.avgPoints.toFixed(1)}
                </span>
                <span role="cell">{player.countedGames}</span>
                <span role="cell">
                  <strong>{player.expected.toFixed(1)}</strong>
                </span>
              </div>
            ))}
          </div>
        </article>
      )}

      {open && (
        <article className="card capacity-card">
          <div>
            <p className="eyebrow">{open.name}</p>
            <h2>If everyone hits their average</h2>
          </div>
          <div className="score-days">
            {open.score.days.map((day) => (
              <div className="score-day" key={day.date}>
                <time dateTime={day.date}>{formatDate(day.date)}</time>
                <strong>{day.expected.toFixed(1)}</strong>
                <small>{day.playing} playing</small>
              </div>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}
