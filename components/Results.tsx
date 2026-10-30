import {
  groupTrades,
  type ScheduleChange,
  type TradeOption,
  type OptimizationResult,
} from "@/lib/optimizer";
import type { TeamSchedule } from "@/lib/schedule";
import { TEAM_NAMES } from "@/lib/teams";

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

function formatDate(date: string, includeWeekday = true) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: includeWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function Results({ result, rankings }: ResultsProps) {
  const activeTeams = rankings.filter((team) => team.games > 0);
  const tradeCount = result.players.reduce(
    (total, player) => total + player.options.length,
    0,
  );
  const bestEv = result.players[0]?.options[0]?.ev ?? 0;
  const weekStart = result.dailyCapacity[0]?.date;

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
          <strong>+{bestEv}</strong>
          <small>extra games</small>
        </article>
        <article className="metric-card">
          <span>Plus-EV swaps</span>
          <strong>{tradeCount}</strong>
          <small>{tradeCount === 1 ? "option" : "options"}</small>
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
          {result.players.length === 0 ? (
            <div className="empty-plan">
              <strong>No swap adds games.</strong>
              <p>
                Keep the current roster for this period, or mark another player
                as streamable.
              </p>
            </div>
          ) : (
            result.players.map((player) => (
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
