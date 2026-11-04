"use client";

import { useMemo, useState } from "react";

import {
  groupTrades,
  type PlayerTrades,
  type ScheduleChange,
  type TradeOption,
  type OptimizationResult,
} from "@/lib/optimizer";
import type { TeamSchedule } from "@/lib/schedule";
import { TEAM_CODES, TEAM_NAMES, type TeamCode } from "@/lib/teams";

interface ResultsProps {
  result: OptimizationResult;
  rankings: TeamSchedule[];
}

function dropLabel(effectiveAfter: string | null, weekStart: string | undefined) {
  if (effectiveAfter) return `Drop after ${formatDate(effectiveAfter)}`;
  if (weekStart) return `Drop before ${formatDate(weekStart)}`;
  return "Drop before the week starts";
}

function listDates(dates: string[]) {
  const labels = dates.map((date) => formatDate(date, false));
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function changeLabel(changes: ScheduleChange[]) {
  const losses = changes
    .filter((change) => change.delta < 0)
    .map((change) => change.date);
  const gains = changes
    .filter((change) => change.delta > 0)
    .map((change) => change.date);
  const parts = [
    losses.length > 0 ? `Lose ${listDates(losses)}` : "",
    gains.length > 0 ? `Gain ${listDates(gains)}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

function teamNames(teams: TradeOption[]) {
  return teams.map((team) => TEAM_NAMES[team.addTeam]).join(", ");
}

function addTeamsInResults(players: PlayerTrades[]) {
  const present = new Set<TeamCode>();
  for (const player of players) {
    for (const option of player.options) present.add(option.addTeam);
  }
  return TEAM_CODES.filter((code) => present.has(code));
}

function playersForTeams(players: PlayerTrades[], selected: TeamCode[]) {
  if (selected.length === 0) return players;
  const selectedTeams = new Set(selected);
  return players
    .map((player) => ({
      ...player,
      options: player.options.filter((option) =>
        selectedTeams.has(option.addTeam),
      ),
    }))
    .filter((player) => player.options.length > 0)
    .sort((a, b) => {
      const evDifference = b.options[0].ev - a.options[0].ev;
      if (evDifference !== 0) return evDifference;
      return a.playerName.localeCompare(b.playerName);
    });
}

function formatDate(date: string, includeWeekday = true) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: includeWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function Results({ result, rankings }: ResultsProps) {
  const [filter, setFilter] = useState<{
    result: OptimizationResult;
    teams: TeamCode[];
  } | null>(null);
  const selectedTeams = filter?.result === result ? filter.teams : [];
  const addTeams = useMemo(
    () => addTeamsInResults(result.players),
    [result.players],
  );
  const visiblePlayers = useMemo(
    () => playersForTeams(result.players, selectedTeams),
    [result.players, selectedTeams],
  );
  const filtering = selectedTeams.length > 0;
  const activeTeams = rankings.filter((team) => team.games > 0);
  const tradeCount = visiblePlayers.reduce(
    (total, player) => total + player.options.length,
    0,
  );
  const bestEv = visiblePlayers[0]?.options[0]?.ev ?? 0;
  const weekStart = result.dailyCapacity[0]?.date;

  const toggleTeam = (team: TeamCode) => {
    const teams = selectedTeams.includes(team)
      ? selectedTeams.filter((code) => code !== team)
      : [...selectedTeams, team];
    setFilter({ result, teams });
  };

  return (
    <section className="results" aria-live="polite">
      <div className="summary-grid">
        <article className="metric-card">
          <span>Current roster</span>
          <strong>{result.baselineGames}</strong>
          <small>capped games</small>
        </article>
        <article className="metric-card accent">
          <span>Best swap</span>
          <strong>{visiblePlayers.length === 0 ? "—" : `+${bestEv}`}</strong>
          <small>{filtering ? "for selected teams" : "extra games"}</small>
        </article>
        <article className="metric-card">
          <span>Plus-EV swaps</span>
          <strong>{tradeCount}</strong>
          <small>
            {filtering
              ? tradeCount === 1
                ? "matching option"
                : "matching options"
              : tradeCount === 1
                ? "option"
                : "options"}
          </small>
        </article>
      </div>

      {result.dailyCapacity.length > 0 && (
        <article className="card capacity-card">
          <div>
            <p className="eyebrow">Daily lineup capacity</p>
            <h2>Active spots by day</h2>
          </div>
          <div className="capacity-list">
            {result.dailyCapacity.map((day) => (
              <div className="capacity-day" key={day.date}>
                <time dateTime={day.date}>{formatDate(day.date)}</time>
                <div className="capacity-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${(day.filled / day.totalSlots) * 100}%`,
                    }}
                  />
                </div>
                <strong>
                  {day.filled}/{day.totalSlots}
                </strong>
                <small>
                  {day.full ? "Full" : `${day.totalSlots - day.filled} open`}
                </small>
              </div>
            ))}
          </div>
        </article>
      )}

      <div className="results-grid">
        <article className="card plan-card">
          <p className="eyebrow">Plus-EV trades</p>
          <h2>Swaps that add games</h2>
          {addTeams.length > 0 && (
            <div className="team-filter">
              <div className="team-filter-heading">
                <p>Show adds from</p>
                {filtering && (
                  <button
                    className="filter-clear"
                    type="button"
                    onClick={() => setFilter({ result, teams: [] })}
                  >
                    Show all teams
                  </button>
                )}
              </div>
              <div
                className="team-filter-actions"
                role="group"
                aria-label="Filter recommendations by the team you would add"
              >
                {addTeams.map((team) => {
                  const pressed = selectedTeams.includes(team);
                  return (
                    <button
                      key={team}
                      className="team-chip"
                      type="button"
                      aria-pressed={pressed}
                      aria-label={`${pressed ? "Hide" : "Show"} ${TEAM_NAMES[team]}`}
                      title={TEAM_NAMES[team]}
                      onClick={() => toggleTeam(team)}
                    >
                      {team}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {result.players.length === 0 ? (
            <div className="empty-plan">
              <strong>No swap adds games.</strong>
              <p>
                Keep the current roster for this period, or mark another player
                as streamable.
              </p>
            </div>
          ) : visiblePlayers.length === 0 ? (
            <div className="empty-plan">
              <strong>No swaps for those teams.</strong>
              <p>
                Pick another team above, or show every add recommendation.
              </p>
            </div>
          ) : (
            visiblePlayers.map((player) => (
              <section className="player-group" key={player.playerId}>
                <h3>
                  {player.playerName}
                  <span>{player.team}</span>
                </h3>
                <ul className="action-list">
                  {groupTrades(player.options).map((group) => (
                    <li
                      key={`${player.playerId}-${group.effectiveAfter ?? "before"}-${group.ev}-${group.changes.map((change) => `${change.delta}${change.date}`).join()}`}
                    >
                      <strong className="ev-value">+{group.ev}</strong>
                      <div>
                        <span>{dropLabel(group.effectiveAfter, weekStart)}</span>
                        <span>{changeLabel(group.changes)}</span>
                        <strong>Add a player from {teamNames(group.teams)}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <p className="assumption-note">
            Each line lists teams that add and drop the same dates. A swap
            that gains a different set of days stays on its own line, even
            when the total is the same. Days that already have 10 active
            players do not gain another player. Confirm a player is available
            before making a move. This list does not rank player quality.
          </p>
        </article>

        <article className="card ranking-card">
          <p className="eyebrow">Schedule edge</p>
          <h2>Teams playing the most</h2>
          <div className="team-ranking">
            {activeTeams.map((team, index) => (
              <div className="team-rank" key={team.team}>
                <span className="rank-number">{index + 1}</span>
                <div className="team-name">
                  <strong>{TEAM_NAMES[team.team]}</strong>
                  <span>{team.team}</span>
                </div>
                <div className="date-dots">
                  {team.dates.map((date) => (
                    <span key={date} title={formatDate(date)}>
                      {formatDate(date, false)}
                    </span>
                  ))}
                </div>
                <strong className="game-count">{team.games}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
