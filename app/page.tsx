"use client";

import { FormEvent, useEffect, useState } from "react";

import { Results } from "@/components/Results";
import { RosterEditor } from "@/components/RosterEditor";
import {
  PLAYER_POSITIONS,
  optimizeRoster,
  type OptimizationResult,
  type PlayerPosition,
  type RosterPlayer,
} from "@/lib/optimizer";
import {
  buildGameMatrix,
  listDates,
  type ScheduledGame,
  type TeamSchedule,
} from "@/lib/schedule";

const STORAGE_KEY = "fantasy-bball-week-optimizer";

interface SavedForm {
  start: string;
  end: string;
  acquisitions: number;
  roster: RosterPlayer[];
}

interface ScheduleResponse {
  games?: ScheduledGame[];
  rankings?: TeamSchedule[];
  availableRange?: { start: string | null; end: string | null };
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
const initialRoster: RosterPlayer[] = [
  {
    id: "player-1",
    name: "",
    team: "ATL",
    streamable: false,
    positions: ["PG"],
  },
];

function normalizeRoster(roster: RosterPlayer[]): RosterPlayer[] {
  return roster.map((player) => ({
    ...player,
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
  const [acquisitions, setAcquisitions] = useState(4);
  const [roster, setRoster] = useState<RosterPlayer[]>(initialRoster);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [rankings, setRankings] = useState<TeamSchedule[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let savedForm: SavedForm | null = null;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as SavedForm;
      if (
        parsed.start &&
        parsed.end &&
        Number.isInteger(parsed.acquisitions) &&
        Array.isArray(parsed.roster) &&
        parsed.roster.length > 0
      ) {
        savedForm = parsed;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    if (!savedForm) return;
    const timeout = window.setTimeout(() => {
      setStart(savedForm.start);
      setEnd(savedForm.end);
      setAcquisitions(savedForm.acquisitions);
      setRoster(normalizeRoster(savedForm.roster));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

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
    if (
      !Number.isInteger(acquisitions) ||
      acquisitions < 0 ||
      acquisitions > 10
    ) {
      setError("Weekly acquisitions must be between 0 and 10.");
      return;
    }
    if (normalizedRoster.some((player) => !player.name.trim())) {
      setError("Add a name for every player on your roster.");
      return;
    }
    if (normalizedRoster.some((player) => player.positions.length === 0)) {
      setError("Select at least one ESPN position for every player.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/schedule?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      );
      const data = (await response.json()) as ScheduleResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load schedule.");
      if (!data.games?.length || !data.rankings) {
        const available = data.availableRange;
        const range =
          available?.start && available.end
            ? ` The loaded NBA schedule covers ${available.start} to ${available.end}.`
            : "";
        throw new Error(`No NBA games were found for those dates.${range}`);
      }

      const matrix = buildGameMatrix(data.games, dates);
      const nextResult = optimizeRoster(
        normalizedRoster,
        dates,
        matrix,
        acquisitions,
      );
      setRankings(data.rankings);
      setResult(nextResult);
      setRoster(normalizedRoster);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          start,
          end,
          acquisitions,
          roster: normalizedRoster,
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
          <h1>Win the week with your schedule.</h1>
          <p className="hero-copy">
            Find the busiest NBA teams and turn your weekly acquisitions into
            the most possible games.
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
            <label className="field acquisition-field">
              <span>Weekly acquisitions</span>
              <input
                type="number"
                min="0"
                max="10"
                required
                value={acquisitions}
                onChange={(event) =>
                  setAcquisitions(Number(event.target.value))
                }
              />
            </label>
          </div>
        </section>

        <RosterEditor roster={roster} onChange={setRoster} />

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Optimizing your week…" : "Optimize my week"}
          {!loading && <span aria-hidden="true">→</span>}
        </button>
      </form>

      {result && <Results result={result} rankings={rankings} />}

      <footer>
        Uses the official NBA schedule and ESPN&apos;s default 10 active lineup
        slots. Confirm player availability and eligibility before making a move.
      </footer>
    </main>
  );
}
