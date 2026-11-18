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

function changeLabel(changes: ScheduleChange[]) {
  return changes
    .map((change) => {
      const sign = change.delta > 0 ? "+" : "";
      return `${formatDate(change.date, false)} ${sign}${change.delta.toFixed(1)}`;
    })
    .join(" · ");
}

function addLabel(teams: TradeOption[]) {
  return teams
    .map((team) => {
      const opponents =
        team.opponents.length > 0
          ? ` vs ${team.opponents.join(", ")}`
          : "";
      return `${team.addName} (${team.addTeam}, ${team.addAvg.toFixed(1)} avg, ${team.games} game${team.games === 1 ? "" : "s"}${opponents})`;
    })
    .join(" or ");
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
          <strong>{result.baselinePoints.toFixed(1)}</strong>
          <small>expected points</small>
        </article>
        <article className="metric-card accent">
          <span>Best add</span>
          <strong>
            {visiblePlayers.length === 0 ? "—" : `+${bestEv.toFixed(1)}`}
          </strong>
          <small>{filtering ? "for selected teams" : "expected points"}</small>
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
          <p className="eyebrow">Streaming adds</p>
          <h2>Free agents worth more points</h2>
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
              <strong>No add is worth more points.</strong>
              <p>
                Keep the current roster for this period, or mark another player
                as streamable.
              </p>
            </div>
          ) : visiblePlayers.length === 0 ? (
            <div className="empty-plan">
              <strong>No adds from those teams.</strong>
              <p>
                Pick another team above, or show every add recommendation.
              </p>
            </div>
          ) : (
            visiblePlayers.map((player) => (
              <section className="player-group" key={player.playerId}>
                <h3>
                  {player.playerName}
                  <span>
                    {player.team} · {player.avgPoints.toFixed(1)} avg
                  </span>
                </h3>
                <ul className="action-list">
                  {groupTrades(player.options).map((group) => (
                    <li
                      key={`${player.playerId}-${group.effectiveAfter ?? "before"}-${group.ev}-${group.changes.map((change) => `${change.delta}${change.date}`).join()}`}
                    >
                      <strong className="ev-value">+{group.ev.toFixed(1)}</strong>
                      <div>
                        <span>{dropLabel(group.effectiveAfter, weekStart)}</span>
                        <span>{changeLabel(group.changes)}</span>
                        <strong>Add {addLabel(group.teams)}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <p className="assumption-note">
            Each line is the best day to drop that player for the free agent
            shown. A game is worth the player&apos;s season fantasy average
            times how many points that opponent allows compared with the league,
            capped at a 15% swing. Only the 10 highest scores count each day, so
            a game behind ten better players adds nothing. Adds with the same
            point changes share a line.
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
