import type { OptimizationResult } from "@/lib/optimizer";
import type { TeamSchedule } from "@/lib/schedule";
import { TEAM_NAMES } from "@/lib/teams";

interface ResultsProps {
  result: OptimizationResult;
  rankings: TeamSchedule[];
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

  return (
    <section className="results" aria-live="polite">
      <div className="summary-grid">
        <article className="metric-card">
          <span>Current roster</span>
          <strong>{result.baselineGames}</strong>
          <small>playable games</small>
        </article>
        <article className="metric-card accent">
          <span>Optimized roster</span>
          <strong>{result.optimizedGames}</strong>
          <small>playable games</small>
        </article>
        <article className="metric-card">
          <span>Extra games</span>
          <strong>+{result.gain}</strong>
          <small>
            using {result.acquisitionsUsed} acquisition
            {result.acquisitionsUsed === 1 ? "" : "s"}
          </small>
        </article>
      </div>

      {result.dailyCapacity && result.dailyCapacity.length > 0 && (
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
                      width: `${(day.optimizedFilled / day.totalSlots) * 100}%`,
                    }}
                  />
                </div>
                <strong>
                  {day.optimizedFilled}/{day.totalSlots}
                </strong>
                <small>
                  {day.totalSlots - day.optimizedFilled === 0
                    ? "Full"
                    : `${day.totalSlots - day.optimizedFilled} open`}
                </small>
              </div>
            ))}
          </div>
        </article>
      )}

      <div className="results-grid">
        <article className="card plan-card">
          <p className="eyebrow">Recommended plan</p>
          <h2>Your streaming moves</h2>
          {result.actions.length === 0 ? (
            <div className="empty-plan">
              <strong>No move improves your game total.</strong>
              <p>
                Keep the current roster for this period, or mark another player
                as streamable.
              </p>
            </div>
          ) : (
            <ol className="action-list">
              {result.actions.map((action, index) => (
                <li
                  key={`${action.date}-${action.slotId}-${action.addTeam}-${index}`}
                >
                  <time dateTime={action.date}>{formatDate(action.date)}</time>
                  <div>
                    <span>Drop {action.drop}</span>
                    <strong>
                      Add a player from{" "}
                      {(action.addTeams ?? [action.addTeam]).join("/")}
                      {action.addPosition
                        ? ` eligible at ${action.addPosition}`
                        : ""}
                    </strong>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="assumption-note">
            Confirm a player is available and eligible before making each move.
            Adds are only suggested when they fill an active ESPN lineup spot
            that day. This plan optimizes playable games, not player quality.
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
