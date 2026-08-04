"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { activityLabel } from "@/lib/activityMeta";
import {
  calendarFilename,
  createIcsEvent,
  makeIcsDownloadHref,
  parseWindowToDates,
} from "@/lib/calendar";
import {
  PageHeader,
  Card,
  StatusMessage,
  SectionTitle,
  ScoreBadge,
  WeatherStat,
  Badge,
  Panel,
  Button,
  EmptyState,
} from "@/components/ui";

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
  planning_score: number | null;
  forecast_confidence: number | null;
  forecast_confidence_label: string | null;
  location_name: string | null;
  rule_score: number | null;
  ml_score: number | null;
  final_score: number | null;
  scoring_method: string | null;
  model_version: string | null;
  ml_status: string | null;
  ml_weight: number | null;
  rule_weight: number | null;
  blended_score: number | null;
  model_explanation: string | null;
  prediction_source: string | null;
  recommended_window: string | null;
  window_score: number | null;
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
  const [plannerView, setPlannerView] = useState<"day" | "activity">("day");

  const [planMessage, setPlanMessage] = useState("");
  const [planError, setPlanError] = useState("");
  const [savingPlanKey, setSavingPlanKey] = useState<string | null>(null);
  const planningRange = useMemo(() => getPlanningDateRange(), []);

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

    let loadedPredictions: PredictionRow[] = [];

    // --------------------------------------------------
    // 1. Try user-specific predictions first
    // --------------------------------------------------

    const { data: userPredictionData, error: userPredictionError } = await supabase
        .from("user_predictions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", planningRange.startDate)
        .lte("date", planningRange.endDate)
        .order("date", { ascending: true });

    if (userPredictionError) {
      setErrorMessage(userPredictionError.message);
      setLoading(false);
      return;
    }

    if ((userPredictionData ?? []).length > 0) {
      loadedPredictions = (userPredictionData ?? []).map((item: any) => ({
        date: item.date,
        activity: item.activity,
        predicted_score: item.predicted_score,
        label: item.label,
        explanation: item.explanation,
        gear_notes: item.gear_notes,
        avg_temp: item.weather_snapshot?.avg_temp ?? null,
        wind_max: item.weather_snapshot?.wind_max ?? null,
        gust_max: item.weather_snapshot?.gust_max ?? null,
        rain_chance: item.weather_snapshot?.rain_chance ?? null,
        bug_index: item.weather_snapshot?.bug_index ?? null,
        water_temp_est: item.weather_snapshot?.water_temp_est ?? null,
        best_species: item.best_species,
        best_species_score: item.best_species_score,
        planning_score: item.planning_score,
        forecast_confidence: item.forecast_confidence,
        forecast_confidence_label: item.forecast_confidence_label,
        location_name: item.location_name,
        rule_score: item.rule_score,
        ml_score: item.ml_score,
        final_score: item.final_score,
        scoring_method: item.scoring_method,
        model_version: item.model_version,
        ml_status: item.ml_status,
        ml_weight: item.ml_weight,
        rule_weight: item.rule_weight,
        blended_score: item.blended_score,
        model_explanation: item.model_explanation,
        prediction_source: item.prediction_source,
        recommended_window: item.recommended_window,
        window_score: item.window_score,
      }));
    } else {
      // --------------------------------------------------
      // 2. Fall back to global prediction_history
      // --------------------------------------------------

      const { data: fallbackPredictionData, error: fallbackPredictionError } =
        await supabase
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
          .gte("date", planningRange.startDate)
          .lte("date", planningRange.endDate)
          .order("date", { ascending: true });

      if (fallbackPredictionError) {
        setErrorMessage(fallbackPredictionError.message);
        setLoading(false);
        return;
      }

      loadedPredictions = (fallbackPredictionData ?? []).map((item: any) => ({
        date: item.date,
        activity: item.activity,
        predicted_score: item.predicted_score,
        planning_score: null,
        forecast_confidence: null,
        forecast_confidence_label: null,
        label: item.label,
        explanation: item.explanation,
        gear_notes: item.gear_notes,
        avg_temp: item.avg_temp,
        wind_max: item.wind_max,
        gust_max: item.gust_max,
        rain_chance: item.rain_chance,
        bug_index: item.bug_index,
        water_temp_est: item.water_temp_est,
        best_species: item.best_species,
        best_species_score: item.best_species_score,
        location_name: null,
        rule_score: null,
        ml_score: null,
        final_score: null,
        scoring_method: "prediction_history_fallback",
        model_version: null,
        ml_status: null,
        ml_weight: null,
        rule_weight: null,
        blended_score: null,
        model_explanation: null,
        prediction_source: "prediction_history",
        recommended_window: null,
        window_score: null,
      }));
    }

    loadedPredictions = loadedPredictions
        .filter((item) =>
            isDateInPlanningWindow(
            item.date,
            planningRange.startDate,
            planningRange.endDate
            )
        )
        .sort((a, b) => {
            const dateCompare = String(a.date ?? "").localeCompare(String(b.date ?? ""));

            if (dateCompare !== 0) {
            return dateCompare;
            }

            return (
            (b.planning_score ?? b.predicted_score ?? 0) -
            (a.planning_score ?? a.predicted_score ?? 0)
            );
        });

        setPredictions(loadedPredictions);

    const dates = Array.from(
        new Set(
            loadedPredictions
            .map((item) => item.date)
            .filter(Boolean)
        )
        ) as string[];

        if (dates.length > 0 && (selectedDate === "" || !dates.includes(selectedDate))) {
        setSelectedDate(dates[0]);
        }

        const activities = Array.from(
        new Set(
            loadedPredictions
            .map((item) => item.activity)
            .filter(Boolean)
        )
        ) as string[];

        if (
        activities.length > 0 &&
        (selectedActivity === "" || !activities.includes(selectedActivity))
        ) {
        setSelectedActivity(activities[0]);
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

    setPlans((plansData ?? []) as unknown as PlannedActivity[]);
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
      .sort(
        (a, b) =>
          (b.planning_score ?? b.predicted_score ?? 0) -
          (a.planning_score ?? a.predicted_score ?? 0)
      );
  }, [predictions, selectedDate]);

  const selectedActivityRows = useMemo(() => {
    return predictions
      .filter((item) => item.activity === selectedActivity)
      .sort(
        (a, b) =>
          (b.planning_score ?? b.predicted_score ?? 0) -
          (a.planning_score ?? a.predicted_score ?? 0)
      );
  }, [predictions, selectedActivity]);

  const bestPrediction = useMemo(() => {
    return [...predictions].sort(
        (a, b) =>
        (b.planning_score ?? b.predicted_score ?? 0) -
        (a.planning_score ?? a.predicted_score ?? 0)
    )[0] ?? null;
    }, [predictions]);

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
      `Planning score: ${prediction.planning_score ?? "N/A"}`,
      `Forecast confidence: ${prediction.forecast_confidence ?? "N/A"} (${prediction.forecast_confidence_label ?? "N/A"})`,
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
    return prediction.recommended_window ?? "Suggested time TBD";
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
        location_name: prediction.location_name ?? "",
        score_at_planning: prediction.predicted_score,
        planning_score_at_planning: prediction.planning_score,
        forecast_confidence_at_planning: prediction.forecast_confidence,
        forecast_confidence_label_at_planning: prediction.forecast_confidence_label,
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
    return <p className="text-slate-300">Loading...</p>;
    }

  if (!user) {
    return (
        <>
        <PageHeader title="Planner" />

        <Card className="mt-6">
            <p className="text-slate-300">
            Please log in to use the Planner.
            </p>
        </Card>
        </>
    );
    }

  return (
    <>
        <PageHeader
        title="Planner"
        description="Use cached personalized predictions to choose a day, choose an activity, save plans, and export calendar events."
        />

      {loading && (
        <p className="mt-6 text-slate-300">Loading cached predictions...</p>
      )}

      {errorMessage && (
        <StatusMessage type="error">
          {errorMessage}
        </StatusMessage>
      )}

      {planMessage && (
        <StatusMessage type="success">
          {planMessage}
        </StatusMessage>
      )}

      {planError && (
        <StatusMessage type="error">
          {planError}
        </StatusMessage>
      )}

      {!loading && !errorMessage && predictions.length === 0 && (
        <Card className="mt-8">
            <EmptyState
            title="No predictions in the 14-day planning window"
            description="Planner only shows predictions from tomorrow through the next 14 days. If you expected more options, your prediction pipeline may need to generate additional forecast days."
            />
        </Card>
        )}

        {bestPrediction && (
            <Card className="mt-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
                    Best in the next 14 days
                    </div>

                    <h2 className="text-2xl font-bold tracking-tight text-white">
                    {activityLabel(bestPrediction.activity)}
                    </h2>

                    <p className="mt-2 text-sm text-slate-300">
                    {formatFriendlyDate(bestPrediction.date)} ·{" "}
                    {getRecommendedWindow(bestPrediction)}
                    </p>

                    {bestPrediction.location_name && (
                    <p className="mt-1 text-sm text-slate-400">
                        {bestPrediction.location_name}
                    </p>
                    )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <ScoreBadge
                    score={bestPrediction.planning_score ?? bestPrediction.predicted_score}
                    label={bestPrediction.label}
                    size="lg"
                    />

                    <div className="flex flex-wrap gap-2">
                    <WeatherStat
                        label="Temp"
                        value={`${bestPrediction.avg_temp ?? "?"}°F`}
                    />

                    <WeatherStat
                        label="Wind"
                        value={`${bestPrediction.wind_max ?? "?"} mph`}
                    />

                    <WeatherStat
                        label="Rain"
                        value={`${bestPrediction.rain_chance ?? "?"}%`}
                    />
                    </div>
                </div>
                </div>
            </Card>
            )}

      {predictions.length > 0 && (
        <section className="mt-8">
            <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <SectionTitle
                title="Plan by day or activity"
                description={`Showing predictions from ${formatFriendlyDate(
                    planningRange.startDate
                )} through ${formatFriendlyDate(planningRange.endDate)}.`}
                />

                <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/60 p-1">
                <button
                    type="button"
                    onClick={() => setPlannerView("day")}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    plannerView === "day"
                        ? "bg-[rgb(var(--season-rgb)_/_0.16)] text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                >
                    By day
                </button>

                <button
                    type="button"
                    onClick={() => setPlannerView("activity")}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    plannerView === "activity"
                        ? "bg-[rgb(var(--season-rgb)_/_0.16)] text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                >
                    By activity
                </button>
                </div>
            </div>

            {plannerView === "day" && (
                <div className="mt-6">
                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-300">
                    Choose a date
                    </span>

                    <select
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
                    >
                    {availableDates.map((date) => (
                        <option key={date} value={date}>
                        {formatFriendlyDate(date)} · {date}
                        </option>
                    ))}
                    </select>
                </label>

                <div className="mt-4 grid gap-3">
                    {dayPredictions.length === 0 ? (
                    <EmptyState
                        title="No recommendations for this day"
                        description="Try another date in the 14-day planning window."
                    />
                    ) : (
                    dayPredictions.slice(0, 5).map((prediction) => (
                        <PredictionCard
                        key={`${prediction.date}-${prediction.activity}`}
                        prediction={prediction}
                        alreadyPlanned={planAlreadyExists(prediction)}
                        saving={
                            savingPlanKey ===
                            `${prediction.date}-${prediction.activity}`
                        }
                        onSavePlan={() => saveAsPlanned(prediction)}
                        windowText={getRecommendedWindow(prediction)}
                        description={buildDescription(
                            prediction,
                            getRecommendedWindow(prediction)
                        )}
                        />
                    ))
                    )}
                </div>
                </div>
            )}

            {plannerView === "activity" && (
                <div className="mt-6">
                <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-300">
                    Choose an activity
                    </span>

                    <select
                    value={selectedActivity}
                    onChange={(event) => setSelectedActivity(event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
                    >
                    {availableActivities.map((activity) => (
                        <option key={activity} value={activity}>
                        {activityLabel(activity)}
                        </option>
                    ))}
                    </select>
                </label>

                <div className="mt-4 grid gap-3">
                    {selectedActivityRows.length === 0 ? (
                    <EmptyState
                        title="No recommendations for this activity"
                        description="Try another activity or check whether predictions have been generated."
                    />
                    ) : (
                    selectedActivityRows.slice(0, 5).map((prediction) => (
                        <PredictionCard
                        key={`${prediction.activity}-${prediction.date}`}
                        prediction={prediction}
                        alreadyPlanned={planAlreadyExists(prediction)}
                        saving={
                            savingPlanKey ===
                            `${prediction.date}-${prediction.activity}`
                        }
                        onSavePlan={() => saveAsPlanned(prediction)}
                        windowText={getRecommendedWindow(prediction)}
                        description={buildDescription(
                            prediction,
                            getRecommendedWindow(prediction)
                        )}
                        />
                    ))
                    )}
                </div>
                </div>
            )}
            </Card>
        </section>
        )}
    </>
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
    location: prediction.location_name ?? "",
  });

  const downloadHref = makeIcsDownloadHref(icsText);

  const displayScore = prediction.planning_score ?? prediction.predicted_score;

  return (
    <Panel className="transition hover:border-[rgb(var(--season-rgb)_/_0.35)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">
              {activityLabel(prediction.activity)}
            </div>

            <div className="mt-1 text-sm text-slate-300">
              {formatFriendlyDate(prediction.date)} · {windowText}
            </div>

            {prediction.location_name && (
              <div className="mt-2 text-sm text-sky-300">
                Location: {prediction.location_name}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <ScoreBadge
              score={displayScore}
              label={prediction.label}
              size="md"
            />

            {alreadyPlanned && (
              <Badge variant="good">
                Planned
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <WeatherStat
            label="Temp"
            value={`${prediction.avg_temp ?? "?"}°F`}
          />

          <WeatherStat
            label="Wind"
            value={`${prediction.wind_max ?? "?"} mph`}
          />

          <WeatherStat
            label="Rain"
            value={`${prediction.rain_chance ?? "?"}%`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {prediction.forecast_confidence_label && (
            <Badge variant="info">
              {prediction.forecast_confidence_label} confidence
            </Badge>
          )}

          {prediction.window_score !== null && prediction.window_score !== undefined && (
            <Badge variant="neutral">
              Window score: {prediction.window_score}
            </Badge>
          )}

          {prediction.activity === "Fishing" && prediction.best_species && (
            <Badge variant="info">
              Best target: {prediction.best_species}
              {prediction.best_species_score !== null
                ? ` (${prediction.best_species_score})`
                : ""}
            </Badge>
          )}
        </div>

        {prediction.explanation && (
          <p className="text-sm leading-6 text-slate-300">
            {prediction.explanation}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            onClick={onSavePlan}
            disabled={alreadyPlanned || saving}
          >
            {alreadyPlanned ? "Already planned" : saving ? "Saving..." : "Save as plan"}
          </Button>

          <a
            href={downloadHref}
            download={calendarFilename(
              prediction.activity ?? "activity",
              prediction.date ?? "date"
            )}
            className="rounded-lg bg-white/5 px-4 py-2 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Add to calendar
          </a>
        </div>

        <details className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-sm text-slate-300">
          <summary className="cursor-pointer font-semibold text-white">
            Scoring details
          </summary>

          <div className="mt-3 grid gap-1">
            <div>Rule score: {prediction.rule_score ?? "N/A"}</div>
            <div>ML score: {prediction.ml_score ?? "N/A"}</div>
            <div>Final score: {prediction.final_score ?? "N/A"}</div>
            <div>Blended score: {prediction.blended_score ?? "N/A"}</div>
            <div>Rule weight: {prediction.rule_weight ?? "N/A"}</div>
            <div>ML weight: {prediction.ml_weight ?? "N/A"}</div>
            <div>ML status: {prediction.ml_status ?? "N/A"}</div>
            <div>Model version: {prediction.model_version ?? "N/A"}</div>
            <div>Scoring method: {prediction.scoring_method ?? "N/A"}</div>
            <div>Prediction source: {prediction.prediction_source ?? "N/A"}</div>

            {prediction.model_explanation && (
              <div className="mt-2 text-slate-400">
                {prediction.model_explanation}
              </div>
            )}
          </div>
        </details>
      </div>
    </Panel>
  );
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPlanningDateRange() {
  const today = new Date();

  const start = new Date(today);
  start.setDate(start.getDate() + 1);

  const end = new Date(today);
  end.setDate(end.getDate() + 14);

  return {
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

function isDateInPlanningWindow(
  dateString: string | null,
  startDate: string,
  endDate: string
) {
  if (!dateString) {
    return false;
  }

  return dateString >= startDate && dateString <= endDate;
}

function formatFriendlyDate(dateString: string | null | undefined) {
  if (!dateString) {
    return "Unknown date";
  }

  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  const today = new Date();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tomorrowString = toDateString(tomorrow);

  if (dateString === tomorrowString) {
    return "Tomorrow";
  }

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}