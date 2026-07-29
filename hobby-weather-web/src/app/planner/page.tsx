"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";
import { activityLabel } from "@/lib/activityMeta";
import {
  calendarFilename,
  createIcsEvent,
  makeIcsDownloadHref,
  parseWindowToDates,
} from "@/lib/calendar";

type PredictionRow = {
  date: string | null;
  activity: string | null;
  predicted_score: number | null;
  label: string | null;
  explanation: string | null;
  gear_notes: string | null;
  avg_temp: number | null;
  wind_max: number | null;
  gust_max: number | null;
  rain_chance: number | null;
  bug_index: number | null;
  water_temp_est: number | null;
  best_species: string | null;
  best_species_score: number | null;
};

type PlannedActivity = {
  id: number;
  activity: string | null;
  planned_date: string | null;
  planned_window: string | null;
};

export default function PlannerPage() {
  const { user, authLoading } = useUser();

  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [plans, setPlans] = useState<PlannedActivity[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedActivity, setSelectedActivity] = useState("");

  const [planMessage, setPlanMessage] = useState("");
  const [planError, setPlanError] = useState("");
  const [savingPlanKey, setSavingPlanKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPredictions([]);
      setPlans([]);
      return;
    }

    loadPlannerData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadPlannerData() {
    if (!user) return;

    setLoading(true);
    setErrorMessage("");

    const { data: predictionData, error: predictionError } = await supabase
      .from("prediction_history")
      .select(
        [
          "date",
          "activity",
          "predicted_score",
          "label",
          "explanation",
          "gear_notes",
          "avg_temp",
          "wind_max",
          "gust_max",
          "rain_chance",
          "bug_index",
          "water_temp_est",
          "best_species",
          "best_species_score",
        ].join(",")
      )
      .order("date", { ascending: true });

    if (predictionError) {
      setErrorMessage(predictionError.message);
      setLoading(false);
      return;
    }

    setPredictions(predictionData ?? []);

    const dates = Array.from(
      new Set((predictionData ?? []).map((item) => item.date).filter(Boolean))
    ) as string[];

    if (dates.length > 0 && selectedDate === "") {
      setSelectedDate(dates[0]);
    }

    const { data: plansData, error: plansError } = await supabase
      .from("planned_activities")
      .select("id,activity,planned_date,planned_window")
      .eq("user_id", user.id);

    if (plansError) {
      setErrorMessage(plansError.message);
      setLoading(false);
      return;
    }

    setPlans(plansData ?? []);

    setLoading(false);
  }

  const availableDates = useMemo(() => {
    return Array.from(
      new Set(predictions.map((item) => item.date).filter(Boolean))
    ) as string[];
  }, [predictions]);

  const availableActivities = useMemo(() => {
    return Array.from(
      new Set(predictions.map((item) => item.activity).filter(Boolean))
    ) as string[];
  }, [predictions]);

  const dayPredictions = useMemo(() => {
    return predictions
      .filter((item) => item.date === selectedDate)
      .sort((a, b) => (b.predicted_score ?? 0) - (a.predicted_score ?? 0));
  }, [predictions, selectedDate]);

  const selectedActivityRows = useMemo(() => {
    return predictions
      .filter((item) => item.activity === selectedActivity)
      .sort((a, b) => (b.predicted_score ?? 0) - (a.predicted_score ?? 0));
  }, [predictions, selectedActivity]);

  function planAlreadyExists(prediction: PredictionRow) {
    return plans.some(
      (plan) =>
        plan.activity === prediction.activity &&
        plan.planned_date === prediction.date
    );
  }

  function buildDescription(prediction: PredictionRow, windowText: string) {
    return [
      `Predicted score: ${prediction.predicted_score ?? "N/A"} (${prediction.label ?? "No label"})`,
      `Recommended window: ${windowText}`,
      "",
      `Why: ${prediction.explanation ?? "No explanation available."}`,
      "",
      `Gear/Safety: ${prediction.gear_notes ?? "No gear notes available."}`,
      "",
      `Weather: ${prediction.avg_temp ?? "?"}°F, wind ${prediction.wind_max ?? "?"} mph, rain ${prediction.rain_chance ?? "?"}%, bugs ${prediction.bug_index ?? "?"}, estimated water temp ${prediction.water_temp_est ?? "?"}°F`,
    ].join("\n");
  }

  function getRecommendedWindow(prediction: PredictionRow) {
    // prediction_history currently does not store time windows.
    // Use a simple placeholder until time window data is connected.
    return "Suggested time TBD";
  }

  async function saveAsPlanned(prediction: PredictionRow) {
    if (!user || !prediction.date || !prediction.activity) {
      return;
    }

    const key = `${prediction.date}-${prediction.activity}`;
    setSavingPlanKey(key);
    setPlanMessage("");
    setPlanError("");

    if (planAlreadyExists(prediction)) {
      setPlanError("This activity is already saved as a plan for that date.");
      setSavingPlanKey(null);
      return;
    }

    const windowText = getRecommendedWindow(prediction);

    const { error } = await supabase
      .from("planned_activities")
      .insert({
        user_id: user.id,
        activity: prediction.activity,
        planned_date: prediction.date,
        planned_window: windowText,
        status: "Planned",
        location_name: "",
        score_at_planning: prediction.predicted_score,
        species_target_at_planning: prediction.best_species,
        notes: "",
      });

    if (error) {
      setPlanError(error.message);
      setSavingPlanKey(null);
      return;
    }

    setPlanMessage("Activity saved as planned.");

    await loadPlannerData();

    setSavingPlanKey(null);
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">Loading...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <NavBar />
          <h1 className="text-3xl font-bold">Planner</h1>
          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in to use the Planner.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <h1 className="text-3xl font-bold">Planner</h1>
        <p className="mt-2 text-slate-300">
          Early planner using cached prediction history.
        </p>

        {loading && (
          <p className="mt-6 text-slate-300">Loading cached predictions...</p>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-lg bg-red-900/50 p-3 text-red-200">
            {errorMessage}
          </div>
        )}

        {planMessage && (
          <div className="mt-6 rounded-lg bg-green-900/50 p-3 text-green-200">
            {planMessage}
          </div>
        )}

        {planError && (
          <div className="mt-6 rounded-lg bg-red-900/50 p-3 text-red-200">
            {planError}
          </div>
        )}

        {!loading && !errorMessage && predictions.length === 0 && (
          <div className="mt-8 rounded-2xl bg-slate-900 p-5 text-slate-300">
            No cached predictions found yet.
          </div>
        )}

        {predictions.length > 0 && (
          <>
            <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
              <h2 className="text-xl font-semibold">Choose a Day</h2>

              <label className="mt-4 grid gap-1">
                <span className="text-sm text-slate-300">Date</span>
                <select
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                >
                  {availableDates.map((date) => (
                    <option key={date}>{date}</option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid gap-3">
                {dayPredictions.slice(0, 5).map((prediction) => (
                  <PredictionCard
                    key={`${prediction.date}-${prediction.activity}`}
                    prediction={prediction}
                    alreadyPlanned={planAlreadyExists(prediction)}
                    saving={savingPlanKey === `${prediction.date}-${prediction.activity}`}
                    onSavePlan={() => saveAsPlanned(prediction)}
                    windowText={getRecommendedWindow(prediction)}
                    description={buildDescription(
                      prediction,
                      getRecommendedWindow(prediction)
                    )}
                  />
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
              <h2 className="text-xl font-semibold">Choose an Activity</h2>

              <label className="mt-4 grid gap-1">
                <span className="text-sm text-slate-300">Activity</span>
                <select
                  value={selectedActivity}
                  onChange={(event) =>
                    setSelectedActivity(event.target.value)
                  }
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                >
                  <option value="">Choose activity</option>
                  {availableActivities.map((activity) => (
                    <option key={activity}>{activity}</option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid gap-3">
                {selectedActivityRows.slice(0, 5).map((prediction) => (
                  <PredictionCard
                    key={`${prediction.activity}-${prediction.date}`}
                    prediction={prediction}
                    alreadyPlanned={planAlreadyExists(prediction)}
                    saving={savingPlanKey === `${prediction.date}-${prediction.activity}`}
                    onSavePlan={() => saveAsPlanned(prediction)}
                    windowText={getRecommendedWindow(prediction)}
                    description={buildDescription(
                      prediction,
                      getRecommendedWindow(prediction)
                    )}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PredictionCard({
  prediction,
  alreadyPlanned,
  saving,
  onSavePlan,
  windowText,
  description,
}: {
  prediction: PredictionRow;
  alreadyPlanned: boolean;
  saving: boolean;
  onSavePlan: () => void;
  windowText: string;
  description: string;
}) {
  const { start, end } = parseWindowToDates(
    prediction.date ?? new Date().toISOString().slice(0, 10),
    windowText
  );

  const icsText = createIcsEvent({
    title: prediction.activity ?? "Activity",
    start,
    end,
    description,
    location: "",
  });

  const downloadHref = makeIcsDownloadHref(icsText);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-lg font-semibold">
            {activityLabel(prediction.activity)}
          </div>

          <div className="mt-1 text-sm text-slate-300">
            {prediction.date ?? "Unknown date"} · {prediction.label ?? "No label"}
          </div>

          <div className="mt-2 text-sm text-slate-400">
            {prediction.avg_temp ?? "?"}°F · wind {prediction.wind_max ?? "?"} mph · rain{" "}
            {prediction.rain_chance ?? "?"}%
          </div>

          <div className="mt-2 text-sm text-slate-300">
            Window: {windowText}
          </div>

          {prediction.activity === "Fishing" && prediction.best_species && (
            <div className="mt-2 text-sm text-blue-300">
              Best target: {prediction.best_species}{" "}
              {prediction.best_species_score !== null
                ? `(${prediction.best_species_score})`
                : ""}
            </div>
          )}

          {alreadyPlanned && (
            <div className="mt-2 inline-flex rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">
              Already planned
            </div>
          )}

          {prediction.explanation && (
            <p className="mt-3 text-sm text-slate-300">
              {prediction.explanation}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <div className="rounded-full bg-blue-500 px-3 py-1 text-center text-sm font-bold">
            {prediction.predicted_score ?? "?"}
          </div>

          <button
            type="button"
            onClick={onSavePlan}
            disabled={alreadyPlanned || saving}
            className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {alreadyPlanned ? "Planned" : saving ? "Saving..." : "Save as plan"}
          </button>

          <a
            href={downloadHref}
            download={calendarFilename(
              prediction.activity ?? "activity",
              prediction.date ?? "date"
            )}
            className="rounded-lg bg-slate-700 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-slate-600"
          >
            Add to calendar
          </a>
        </div>
      </div>
    </div>
  );
}