"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { activityLabel } from "@/lib/activityMeta";
import {
  calendarFilename,
  createIcsEvent,
  makeIcsDownloadHref,
  parseWindowToDates,
} from "@/lib/calendar";
import { trackEvent } from "@/lib/trackEvent";
import type { User } from "@supabase/supabase-js";

type DashboardCounts = {
  savedLocations: number;
  activityLogs: number;
  plannedActivities: number;
  scenarioRatings: number;
  activityDefaults: number;
  weeklyObligations: number;
};

type PlannedActivity = {
  id: number;
  activity: string | null;
  planned_date: string | null;
  planned_window: string | null;
  status: string | null;
  location_name: string | null;
};

type ActivityLog = {
  id: number;
  activity: string | null;
  date: string | null;
  actual_enjoyment_1_to_10: number | null;
  notes: string | null;
};

type PredictionRow = {
  date: string | null;
  activity: string | null;
  predicted_score: number | null;
  planning_score?: number | null;
  forecast_confidence?: number | null;
  forecast_confidence_label?: string | null;
  label: string | null;
  explanation: string | null;
  gear_notes: string | null;
  avg_temp: number | null;
  wind_max: number | null;
  rain_chance: number | null;
  bug_index: number | null;
  water_temp_est: number | null;
  best_species: string | null;
  best_species_score: number | null;
};

type PipelineRun = {
  id: number;
  created_at: string | null;
  run_source: string | null;
  status: string | null;
  users_processed: number | null;
  predictions_written: number | null;
  error_message: string | null;
};

const SCENARIO_GOAL_PER_ACTIVITY = 25;
const SCENARIO_ACTIVITY_COUNT = 7;
const SCENARIO_TOTAL_GOAL =
  SCENARIO_GOAL_PER_ACTIVITY * SCENARIO_ACTIVITY_COUNT;

export default function Home() {
  const { user, authLoading } = useUser();

  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const [counts, setCounts] = useState<DashboardCounts>({
    savedLocations: 0,
    activityLogs: 0,
    plannedActivities: 0,
    scenarioRatings: 0,
    activityDefaults: 0,
    weeklyObligations: 0,
  });

  const [upcomingPlans, setUpcomingPlans] = useState<PlannedActivity[]>([]);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);

  const [topRecommendation, setTopRecommendation] = useState<PredictionRow | null>(null);
  const [recommendationMessage, setRecommendationMessage] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [savingRecommendationPlan, setSavingRecommendationPlan] = useState(false);

  const [latestPipelineRun, setLatestPipelineRun] = useState<PipelineRun | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    loadDashboard(user);
  }, [user]);
  async function handleGoogleLogin() {
    setAuthMessage("");
    setAuthError("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthError(error.message);
    }
  }
  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAuthMessage("");
    setAuthError("");

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      setAuthMessage("Logged in successfully.");
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      setAuthMessage(
        "Sign-up successful. If email confirmation is enabled, check your inbox."
      );
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setCounts({
      savedLocations: 0,
      activityLogs: 0,
      plannedActivities: 0,
      scenarioRatings: 0,
      activityDefaults: 0,
      weeklyObligations: 0,
    });

    setUpcomingPlans([]);
    setRecentLogs([]);
    setTopRecommendation(null);
    setLatestPipelineRun(null);
  }

  async function getCount(tableName: string, userId: string) {
    const { count, error } = await supabase
      .from(tableName)
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return count ?? 0;
  }

  async function loadTopRecommendation(currentUser: User) {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Try user-specific predictions first
    const { data: userPredictionData, error: userPredictionError } = await supabase
      .from("user_predictions")
      .select("*")
      .eq("user_id", currentUser.id)
      .gte("date", today)
      .order("date", { ascending: true });

    if (userPredictionError) {
      throw userPredictionError;
    }

    if ((userPredictionData ?? []).length > 0) {
      const cleaned = (userPredictionData ?? []).map((item: any) => ({
        date: item.date,
        activity: item.activity,
        predicted_score: item.predicted_score,
        planning_score: item.planning_score,
        forecast_confidence: item.forecast_confidence,
        forecast_confidence_label: item.forecast_confidence_label,
        label: item.label,
        explanation: item.explanation,
        gear_notes: item.gear_notes,
        avg_temp: item.weather_snapshot?.avg_temp ?? null,
        wind_max: item.weather_snapshot?.wind_max ?? null,
        rain_chance: item.weather_snapshot?.rain_chance ?? null,
        bug_index: item.weather_snapshot?.bug_index ?? null,
        water_temp_est: item.weather_snapshot?.water_temp_est ?? null,
        best_species: item.best_species,
        best_species_score: item.best_species_score,
      })) as PredictionRow[];

      const sorted = cleaned.sort(
        (a, b) =>
          (b.planning_score ?? b.predicted_score ?? 0) -
          (a.planning_score ?? a.predicted_score ?? 0)
      );

      setTopRecommendation(sorted[0] ?? null);
      return;
    }

    // 2. Fall back to global prediction_history
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
            "rain_chance",
            "bug_index",
            "water_temp_est",
            "best_species",
            "best_species_score",
          ].join(",")
        )
        .gte("date", today)
        .order("date", { ascending: true });

    if (fallbackPredictionError) {
      throw fallbackPredictionError;
    }

    const fallbackRows = (fallbackPredictionData ?? []) as unknown as PredictionRow[];

    const sortedFallback = fallbackRows.sort(
      (a, b) => (b.predicted_score ?? 0) - (a.predicted_score ?? 0)
    );

    setTopRecommendation(sortedFallback[0] ?? null);
  }

  async function loadDashboard(currentUser: User) {
    setLoadingDashboard(true);
    setDashboardError("");

    try {
      const [
        savedLocationsCount,
        activityLogsCount,
        plannedActivitiesCount,
        scenarioRatingsCount,
        activityDefaultsCount,
        weeklyObligationsCount,
      ] = await Promise.all([
        getCount("saved_locations", currentUser.id),
        getCount("activity_logs", currentUser.id),
        getCount("planned_activities", currentUser.id),
        getCount("scenario_ratings", currentUser.id),
        getCount("activity_location_defaults", currentUser.id),
        getCount("weekly_obligations", currentUser.id),
      ]);
      
      const { data: pipelineData, error: pipelineError } = await supabase
        .from("prediction_pipeline_runs")
        .select("id,created_at,run_source,status,users_processed,predictions_written,error_message")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!pipelineError) {
        setLatestPipelineRun((pipelineData ?? [])[0] ?? null);
      }

      setCounts({
        savedLocations: savedLocationsCount,
        activityLogs: activityLogsCount,
        plannedActivities: plannedActivitiesCount,
        scenarioRatings: scenarioRatingsCount,
        activityDefaults: activityDefaultsCount,
        weeklyObligations: weeklyObligationsCount,
      });

      const today = new Date().toISOString().slice(0, 10);

      const { data: plansData, error: plansError } = await supabase
        .from("planned_activities")
        .select("id,activity,planned_date,planned_window,status,location_name")
        .eq("user_id", currentUser.id)
        .gte("planned_date", today)
        .order("planned_date", { ascending: true })
        .limit(5);

      if (plansError) {
        throw plansError;
      }

      setUpcomingPlans(plansData ?? []);

      const { data: logsData, error: logsError } = await supabase
        .from("activity_logs")
        .select("id,activity,date,actual_enjoyment_1_to_10,notes")
        .eq("user_id", currentUser.id)
        .order("logged_at", { ascending: false })
        .limit(5);

      if (logsError) {
        throw logsError;
      }

      setRecentLogs(logsData ?? []);

      await loadTopRecommendation(currentUser);
    } catch (error) {
      if (error instanceof Error) {
        setDashboardError(error.message);
      } else {
        setDashboardError("Could not load dashboard.");
      }
    }

    setLoadingDashboard(false);
  }

  async function saveRecommendationAsPlan() {
    if (!user || !topRecommendation?.date || !topRecommendation?.activity) {
      return;
    }

    setSavingRecommendationPlan(true);
    setRecommendationMessage("");
    setRecommendationError("");

    const { data: existingPlans, error: existingError } = await supabase
      .from("planned_activities")
      .select("id")
      .eq("user_id", user.id)
      .eq("activity", topRecommendation.activity)
      .eq("planned_date", topRecommendation.date)
      .limit(1);

    if (existingError) {
      setRecommendationError(existingError.message);
      setSavingRecommendationPlan(false);
      return;
    }

    if ((existingPlans ?? []).length > 0) {
      setRecommendationError("This recommendation is already saved as a plan.");
      setSavingRecommendationPlan(false);
      return;
    }

    const { error } = await supabase
      .from("planned_activities")
      .insert({
        user_id: user.id,
        activity: topRecommendation.activity,
        planned_date: topRecommendation.date,
        planned_window: "Suggested time TBD",
        status: "Planned",
        location_name: "",
        score_at_planning: topRecommendation.predicted_score,
        planning_score_at_planning: topRecommendation.planning_score ?? null,
        forecast_confidence_at_planning: topRecommendation.forecast_confidence ?? null,
        forecast_confidence_label_at_planning:
          topRecommendation.forecast_confidence_label ?? null,
        species_target_at_planning: topRecommendation.best_species,
        notes: "Created from Home recommendation.",
      });

    if (error) {
      setRecommendationError(error.message);
      setSavingRecommendationPlan(false);
      return;
    }

    await trackEvent(user.id, "home_recommendation_saved_as_plan", {
      activity: topRecommendation.activity,
      date: topRecommendation.date,
      predicted_score: topRecommendation.predicted_score,
    });

    setRecommendationMessage("Recommendation saved as a plan.");

    await loadDashboard(user);

    setSavingRecommendationPlan(false);
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl">
          <header>
            <h1 className="text-3xl font-bold">
              🌤️ Hobby Weather Planner
            </h1>

            <p className="mt-2 text-slate-300">
              Plan outdoor activities, log how they went, and build smarter
              personalized recommendations over time.
            </p>
          </header>

          <section className="mt-8 rounded-2xl bg-slate-900 p-6 shadow">
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  authMode === "login"
                    ? "bg-blue-500 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Log in
              </button>

              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  authMode === "signup"
                    ? "bg-blue-500 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Sign up
              </button>
            </div>

            <h2 className="text-xl font-semibold">
              {authMode === "login" ? "Log in" : "Create account"}
            </h2>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="mt-4 w-full rounded-lg bg-white px-4 py-2 font-semibold text-slate-900 hover:bg-slate-200"
            >
              Continue with Google
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-700" />
              <span className="text-xs uppercase text-slate-500">or</span>
              <div className="h-px flex-1 bg-slate-700" />
            </div>

            <form onSubmit={handleAuthSubmit} className="mt-4 grid gap-4">
              <label className="grid gap-1">
                <span className="text-sm text-slate-300">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-300">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                  required
                />
              </label>

              <button
                type="submit"
                className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400"
              >
                {authMode === "login" ? "Log in" : "Sign up"}
              </button>
            </form>

            {authMessage && (
              <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
                {authMessage}
              </div>
            )}

            {authError && (
              <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
                {authError}
              </div>
            )}
          </section>
        </div>
    
    );
  }

  const scenarioProgress = Math.min(
    counts.scenarioRatings / SCENARIO_TOTAL_GOAL,
    1
  );

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Welcome back
            </h1>

            <p className="mt-2 text-slate-300">
              {user.email}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white hover:bg-slate-600"
          >
            Log out
          </button>
        </header>

        {dashboardError && (
          <div className="mt-6 rounded-lg bg-red-900/50 p-3 text-red-200">
            {dashboardError}
          </div>
        )}

        {loadingDashboard && (
          <p className="mt-6 text-slate-300">Loading dashboard...</p>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-4">
          <DashboardCard
            label="Saved Locations"
            value={counts.savedLocations}
            href="/locations"
          />

          <DashboardCard
            label="Activity Logs"
            value={counts.activityLogs}
            href="/logs"
          />

          <DashboardCard
            label="Plans"
            value={counts.plannedActivities}
            href="/plans"
          />

          <DashboardCard
            label="Scenario Ratings"
            value={counts.scenarioRatings}
            href="/scenarios"
          />
        </section>

        {topRecommendation && (
          <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Top Upcoming Recommendation</h2>

                <div className="mt-3 text-2xl font-bold">
                  {activityLabel(topRecommendation.activity)}
                </div>

                <div className="mt-2 inline-flex rounded-full bg-blue-500 px-3 py-1 text-sm font-bold text-white">
                  {topRecommendation.predicted_score ?? "?"} ·{" "}
                  {topRecommendation.label ?? "No label"}
                </div>

                <div className="mt-3 text-sm text-slate-300">
                  {topRecommendation.date ?? "Unknown date"}
                </div>

                <div className="mt-2 text-sm text-slate-400">
                  {topRecommendation.avg_temp ?? "?"}°F · wind{" "}
                  {topRecommendation.wind_max ?? "?"} mph · rain{" "}
                  {topRecommendation.rain_chance ?? "?"}%
                </div>

                {topRecommendation.activity === "Fishing" &&
                  topRecommendation.best_species && (
                    <div className="mt-2 text-sm text-blue-300">
                      Best target: {topRecommendation.best_species}{" "}
                      {topRecommendation.best_species_score !== null
                        ? `(${topRecommendation.best_species_score})`
                        : ""}
                    </div>
                  )}

                {topRecommendation.explanation && (
                  <p className="mt-4 text-sm text-slate-300">
                    {topRecommendation.explanation}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={saveRecommendationAsPlan}
                  disabled={savingRecommendationPlan}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingRecommendationPlan ? "Saving..." : "Save as plan"}
                </button>

                {topRecommendation.date && topRecommendation.activity && (
                  <RecommendationCalendarLink prediction={topRecommendation} />
                )}

                <Link
                  href="/planner"
                  className="rounded-lg bg-slate-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-slate-600"
                >
                  Open Planner
                </Link>
              </div>
            </div>

            {recommendationMessage && (
              <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
                {recommendationMessage}
              </div>
            )}

            {recommendationError && (
              <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
                {recommendationError}
              </div>
            )}
          </section>
        )}

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Prediction Pipeline</h2>

          {latestPipelineRun ? (
            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <div>
                <span className="font-semibold text-white">Status:</span>{" "}
                {latestPipelineRun.status ?? "Unknown"}
              </div>

              <div>
                <span className="font-semibold text-white">Last run:</span>{" "}
                {latestPipelineRun.created_at ?? "Unknown"}
              </div>

              <div>
                <span className="font-semibold text-white">Users processed:</span>{" "}
                {latestPipelineRun.users_processed ?? "N/A"}
              </div>

              <div>
                <span className="font-semibold text-white">Predictions written:</span>{" "}
                {latestPipelineRun.predictions_written ?? "N/A"}
              </div>

              {latestPipelineRun.error_message && (
                <div className="rounded-lg bg-red-900/50 p-3 text-red-200">
                  {latestPipelineRun.error_message}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-slate-300">
              No prediction pipeline runs found yet.
            </p>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Setup Checklist</h2>

          <p className="mt-2 text-sm text-slate-300">
            Complete these steps to get better recommendations over time.
          </p>

          <div className="mt-4 grid gap-3">
            <ChecklistItem
              complete={counts.savedLocations > 0}
              label="Add at least one saved location"
              href="/locations"
            />

            <ChecklistItem
              complete={counts.activityLogs > 0}
              label="Log your first activity"
              href="/logs"
            />

            <ChecklistItem
              complete={counts.plannedActivities > 0}
              label="Create your first plan"
              href="/plans"
            />

            <ChecklistItem
              complete={counts.scenarioRatings >= 5}
              label="Rate at least 5 scenarios"
              href="/scenarios"
            />

            <ChecklistItem
              complete={counts.activityDefaults > 0}
              label="Set at least one activity default location"
              href="/activity-defaults"
            />

            <ChecklistItem
              complete={counts.weeklyObligations > 0}
              label="Add your weekly schedule"
              href="/schedule"
            />
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Scenario Rating Progress
              </h2>

              <p className="text-sm text-slate-300">
                First target: {SCENARIO_TOTAL_GOAL} total ratings
                ({SCENARIO_GOAL_PER_ACTIVITY} per activity).
              </p>
            </div>

            <Link
              href="/scenarios"
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"
            >
              Rate scenarios
            </Link>
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{
                width: `${Math.round(scenarioProgress * 100)}%`,
              }}
            />
          </div>

          <p className="mt-2 text-sm text-slate-300">
            {counts.scenarioRatings}/{SCENARIO_TOTAL_GOAL} ratings complete
          </p>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-900 p-5 shadow">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                Upcoming Plans
              </h2>

              <Link
                href="/plans"
                className="text-sm font-semibold text-blue-300 hover:text-blue-200"
              >
                View all
              </Link>
            </div>

            {upcomingPlans.length === 0 ? (
              <p className="mt-4 text-slate-300">
                No upcoming plans yet.
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {upcomingPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-slate-700 bg-slate-800 p-4"
                  >
                    <div className="font-semibold">
                      {plan.activity ?? "Unknown activity"}
                    </div>

                    <div className="mt-1 text-sm text-slate-300">
                      {plan.planned_date ?? "Unknown date"} ·{" "}
                      {plan.planned_window || "No window"} ·{" "}
                      {plan.status ?? "Unknown status"}
                    </div>

                    {plan.location_name && (
                      <div className="mt-1 text-sm text-slate-400">
                        {plan.location_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-slate-900 p-5 shadow">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                Recent Logs
              </h2>

              <Link
                href="/logs"
                className="text-sm font-semibold text-blue-300 hover:text-blue-200"
              >
                View all
              </Link>
            </div>

            {recentLogs.length === 0 ? (
              <p className="mt-4 text-slate-300">
                No activity logs yet.
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-700 bg-slate-800 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {log.activity ?? "Unknown activity"}
                        </div>

                        <div className="mt-1 text-sm text-slate-300">
                          {log.date ?? "Unknown date"}
                        </div>
                      </div>

                      <div className="rounded-full bg-blue-500 px-3 py-1 text-sm font-bold">
                        {log.actual_enjoyment_1_to_10 ?? "?"}/10
                      </div>
                    </div>

                    {log.notes && (
                      <p className="mt-3 text-sm text-slate-300">
                        {log.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">
            Quick Actions
          </h2>

          <div className="mt-4 flex flex-wrap gap-3">
            <QuickAction href="/locations" label="Add location" />
            <QuickAction href="/logs" label="Log activity" />
            <QuickAction href="/plans" label="Create plan" />
            <QuickAction href="/scenarios" label="Rate scenario" />
            <QuickAction href="/preferences" label="Edit preferences" />
          </div>
        </section>
      </>
  
  );
}

function DashboardCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl bg-slate-900 p-5 shadow hover:bg-slate-800"
    >
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-slate-300">{label}</div>
    </Link>
  );
}

function QuickAction({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"
    >
      {label}
    </Link>
  );
}

function ChecklistItem({
  complete,
  label,
  href,
}: {
  complete: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 p-4 hover:bg-slate-700"
    >
      <span className="font-medium">{label}</span>

      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          complete
            ? "bg-green-600 text-white"
            : "bg-slate-700 text-slate-300"
        }`}
      >
        {complete ? "Done" : "To do"}
      </span>
    </Link>
  );
}

function RecommendationCalendarLink({
  prediction,
}: {
  prediction: PredictionRow;
}) {
  const windowText = "Suggested time TBD";

  const { start, end } = parseWindowToDates(
    prediction.date ?? new Date().toISOString().slice(0, 10),
    windowText
  );

  const description = [
    `Predicted score: ${prediction.predicted_score ?? "N/A"} (${prediction.label ?? "No label"})`,
    `Recommended window: ${windowText}`,
    "",
    `Why: ${prediction.explanation ?? "No explanation available."}`,
    "",
    `Gear/Safety: ${prediction.gear_notes ?? "No gear notes available."}`,
  ].join("\n");

  const icsText = createIcsEvent({
    title: prediction.activity ?? "Activity",
    start,
    end,
    description,
    location: "",
  });

  return (
    <a
      href={makeIcsDownloadHref(icsText)}
      download={calendarFilename(
        prediction.activity ?? "activity",
        prediction.date ?? "date"
      )}
      className="rounded-lg bg-slate-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-slate-600"
    >
      Add to calendar
    </a>
  );
}