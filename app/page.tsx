"use client";

import { FormEvent, useEffect, useState } from "react";

import { Results } from "@/components/Results";
import { RosterEditor } from "@/components/RosterEditor";
import { WeekScore } from "@/components/WeekScore";
import {
  applyCatalog,
  type CatalogPlayer,
  type FantasyTeam,
} from "@/lib/espn-fantasy";
import {
  PLAYER_POSITIONS,
  optimizeRoster,
  type FreeAgent,
  type OptimizationResult,
  type PlayerPosition,
  type RosterPlayer,
} from "@/lib/optimizer";
import type { TeamCode } from "@/lib/teams";
import {
  buildOpponents,
  listDates,
  type ScheduledGame,
  type TeamSchedule,
} from "@/lib/schedule";
import { rankTeamsByWeeklyAverage, type TeamWeekScore } from "@/lib/week-score";

const STORAGE_KEY = "fantasy-bball-week-optimizer";

interface SavedForm {
  start: string;
  end: string;
  roster: RosterPlayer[];
  fantasyTeamId?: string | null;
}

interface ScheduleResponse {
  games?: ScheduledGame[];
  rankings?: TeamSchedule[];
  availableRange?: { start: string | null; end: string | null };
  error?: string;
}

interface LeagueResponse {
  teamName?: string;
  roster?: RosterPlayer[];
  teams?: FantasyTeam[];
  catalog?: CatalogPlayer[];
  freeAgents?: FreeAgent[];
  opponentFactors?: Partial<Record<TeamCode, number>>;
  error?: string;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultDates() {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

const initialDates = defaultDates();

function readSavedForm(): SavedForm | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as SavedForm;
    if (!parsed.start || !parsed.end) return null;
    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function withSavedStreamFlags(
  roster: RosterPlayer[],
  saved: RosterPlayer[] | undefined,
): RosterPlayer[] {
  if (!saved) return roster;
  const flags = new Map(saved.map((player) => [player.id, player.streamable]));
  return roster.map((player) =>
    flags.has(player.id)
      ? { ...player, streamable: Boolean(flags.get(player.id)) }
      : player,
  );
}

function normalizeRoster(roster: RosterPlayer[]): RosterPlayer[] {
  return roster.map((player) => ({
    ...player,
    available: player.available !== false,
    ir: player.ir === true,
    avgPoints: typeof player.avgPoints === "number" ? player.avgPoints : null,
    positions: Array.isArray(player.positions)
      ? player.positions.filter((position): position is PlayerPosition =>
          PLAYER_POSITIONS.includes(position as PlayerPosition),
        )
      : [],
  }));
}

export default function Home() {
  const [start, setStart] = useState(initialDates.start);
  const [end, setEnd] = useState(initialDates.end);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [rankings, setRankings] = useState<TeamSchedule[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [weekScore, setWeekScore] = useState<TeamWeekScore[] | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(true);

  useEffect(() => {
    const saved = readSavedForm();
    if (saved) {
      setStart(saved.start);
      setEnd(saved.end);
    }

    let cancelled = false;
    async function loadTeams() {
      try {
        const response = await fetch("/api/league");
        const data = (await response.json()) as LeagueResponse;
        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load the ESPN league.");
        }
        if (cancelled) return;
        const leagueTeams = data.teams ?? [];
        setTeams(leagueTeams);
        const preferredId =
          saved?.fantasyTeamId &&
          leagueTeams.some((team) => team.id === saved.fantasyTeamId)
            ? saved.fantasyTeamId
            : (leagueTeams.find((team) => team.yours)?.id ?? leagueTeams[0]?.id);
        const preferred = leagueTeams.find((team) => team.id === preferredId);
        if (!preferred) return;
        setSelectedTeamId(preferred.id);
        setRoster(
          normalizeRoster(
            withSavedStreamFlags(
              preferred.roster,
              saved?.fantasyTeamId === preferred.id ? saved.roster : undefined,
            ),
          ),
        );
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load the ESPN league.",
          );
        }
      } finally {
        if (!cancelled) setLoadingTeams(false);
      }
    }

    void loadTeams();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectTeam(teamId: string) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    const nextRoster = normalizeRoster(team.roster);
    setSelectedTeamId(team.id);
    setRoster(nextRoster);
    setResult(null);
    setWeekScore(null);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        start,
        end,
        roster: nextRoster,
        fantasyTeamId: team.id,
      } satisfies SavedForm),
    );
  }

  async function loadLeague(): Promise<LeagueResponse> {
    const response = await fetch("/api/league");
    const data = (await response.json()) as LeagueResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load the ESPN league.");
    }
    return data;
  }

  async function showWeekScore() {
    setError("");
    if (start > end) {
      setError("The end date must be on or after the start date.");
      return;
    }
    const dates = listDates(start, end);
    if (dates.length > 14) {
      setError("Choose a matchweek of 14 days or fewer.");
      return;
    }
    if (teams.length === 0) {
      setError("League teams are still loading.");
      return;
    }

    setScoring(true);
    try {
      const response = await fetch(
        `/api/schedule?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      );
      const data = (await response.json()) as ScheduleResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load schedule.");
      if (!data.games?.length) {
        throw new Error("No NBA games were found for those dates.");
      }
      setWeekScore(
        rankTeamsByWeeklyAverage(
          teams,
          dates,
          buildOpponents(data.games, dates),
        ),
      );
      setResult(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to score this week.",
      );
    } finally {
      setScoring(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    const normalizedRoster = normalizeRoster(roster);

    if (start > end) {
      setError("The end date must be on or after the start date.");
      return;
    }
    const dates = listDates(start, end);
    if (dates.length > 14) {
      setError("Choose a matchweek of 14 days or fewer.");
      return;
    }
    if (normalizedRoster.length === 0) {
      setError("Choose a league team first.");
      return;
    }
    if (normalizedRoster.some((player) => !player.name.trim())) {
      setError("Add a name for every player on your roster.");
      return;
    }

    setLoading(true);
    try {
      const [scheduleResponse, league] = await Promise.all([
        fetch(
          `/api/schedule?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        ),
        loadLeague(),
      ]);
      const data = (await scheduleResponse.json()) as ScheduleResponse;
      if (!scheduleResponse.ok) {
        throw new Error(data.error ?? "Unable to load schedule.");
      }
      if (!data.games?.length || !data.rankings) {
        const available = data.availableRange;
        const range =
          available?.start && available.end
            ? ` The loaded NBA schedule covers ${available.start} to ${available.end}.`
            : "";
        throw new Error(`No NBA games were found for those dates.${range}`);
      }
      if (!league.freeAgents || !league.opponentFactors || !league.catalog) {
        throw new Error("ESPN did not return free agents for this league.");
      }

      const selected = league.teams?.find((team) => team.id === selectedTeamId);
      const workingRoster = selected
        ? [
            ...withSavedStreamFlags(selected.roster, normalizedRoster),
            ...normalizedRoster.filter(
              (player) =>
                player.name.trim() &&
                !selected.roster.some((item) => item.id === player.id),
            ),
          ]
        : normalizedRoster;
      const scoredRoster = applyCatalog(
        normalizeRoster(workingRoster),
        league.catalog ?? [],
      );
      const missing = scoredRoster.filter(
        (player) => player.name.trim() && player.avgPoints == null,
      );
      if (missing.length > 0) {
        throw new Error(
          `ESPN has no fantasy average for ${missing.map((player) => player.name).join(", ")}.`,
        );
      }

      const nextResult = optimizeRoster(
        scoredRoster,
        league.freeAgents,
        dates,
        buildOpponents(data.games, dates),
        league.opponentFactors,
      );
      setRankings(data.rankings);
      setResult(nextResult);
      setRoster(scoredRoster);
      if (league.teams) setTeams(league.teams);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          start,
          end,
          roster: scoredRoster,
          fantasyTeamId: selectedTeamId,
        } satisfies SavedForm),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <div className="hero-mark" aria-hidden="true">
          5
        </div>
        <div>
          <p className="eyebrow">Fantasy basketball decision helper</p>
          <h1>Win the week with the right stream.</h1>
          <p className="hero-copy">
            Rank free agents by games played, fantasy average, and the defense
            they face.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="card setup-card" aria-labelledby="week-heading">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2 id="week-heading">Set your matchweek</h2>
          </div>
          <div className="setup-fields">
            <label className="field">
              <span>Start date</span>
              <input
                type="date"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <span className="date-arrow" aria-hidden="true">
              →
            </span>
            <label className="field">
              <span>End date</span>
              <input
                type="date"
                required
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>
        </section>

        <RosterEditor
          roster={roster}
          onChange={setRoster}
          teams={teams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={selectTeam}
          loadingTeams={loadingTeams}
        />

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            disabled={scoring || loading}
            onClick={showWeekScore}
          >
            {scoring ? "Scoring the week…" : "Week score from averages"}
          </button>
          <button className="secondary-button action-secondary" type="submit" disabled={loading || scoring}>
            {loading ? "Optimizing your week…" : "Optimize streams"}
          </button>
        </div>
      </form>

      {weekScore && (
        <WeekScore ranking={weekScore} selectedTeamId={selectedTeamId} />
      )}

      {result && <Results result={result} rankings={rankings} />}

      <footer>
        Uses your ESPN league for averages and free agents, the NBA schedule
        for opponents, and ESPN standings for points allowed. Only the 10
        highest scores count each day. Confirm availability before making a
        move.
      </footer>
    </main>
  );
}
