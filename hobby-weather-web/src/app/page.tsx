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
import {
  getFallbackDisplayName,
  getOrCreateProfile,
  type UserProfile,
} from "@/lib/profile";
import {
  Card,
  Button,
  StatusMessage,
  ScoreBadge,
  WeatherStat,
  StatCard,
  EmptyState,
  SectionTitle,
  Badge,
  Panel,
} from "@/components/ui";
import { triggerPredictionGeneration } from "@/lib/triggerPredictionGeneration";
import { buildLumoraTake } from "@/lib/recommendationText";

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
  const [signupName, setSignupName] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);

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
    console.log("Home user effect fired:", {
      authLoading,
      hasUser: Boolean(user),
      userId: user?.id,
    });

    if (!user) {
      setProfile(null);
      return;
    }

    const currentUser = user;

  async function loadUserHome() {
    try {
      const loadedProfile = await getOrCreateProfile(currentUser);
      setProfile(loadedProfile);
    } catch (error) {
      console.error("Could not load profile:", error);
      setProfile(null);
    }

    try {
      console.log("Checking whether predictions need refresh...");

      const result = await triggerPredictionGeneration({
        force: false,
        reason: "home_opened",
      });

      console.log("Prediction generation result:", result);
    } catch (error) {
      console.warn("Could not refresh predictions on home open:", error);
    }

    await loadDashboard(currentUser);
  }

    loadUserHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: signupName.trim(),
          },
        },
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      if (data.user && signupName.trim()) {
        try {
          await getOrCreateProfile(data.user, signupName);
        } catch (profileError) {
          console.error("Could not create profile:", profileError);
        }
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
              Lumora
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
              {authMode === "signup" && (
                <label className="grid gap-1">
                  <span className="text-sm text-slate-300">Name</span>
                  <input
                    type="text"
                    value={signupName}
                    onChange={(event) => setSignupName(event.target.value)}
                    placeholder="What should Lumora call you?"
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                    required
                  />
                </label>
              )}
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

  {profile && profile.onboarding_complete === false && (
    <Card className="mt-8">
      <SectionTitle
        title="Finish setting up Lumora"
        description="Add your home location and choose activities so Lumora can generate better recommendations."
        action={
          <Link
            href="/onboarding"
            className="rounded-lg bg-[rgb(var(--brand-rgb))] px-4 py-2 text-sm font-semibold text-[#030716] transition hover:bg-[rgb(var(--brand-soft-rgb))]"
          >
            Continue setup
          </Link>
        }
      />
    </Card>
  )}

  const scenarioProgress = Math.min(
    counts.scenarioRatings / SCENARIO_TOTAL_GOAL,
    1
  );

  const displayName =
    profile?.display_name?.trim() || getFallbackDisplayName(user);

  const greeting = getGreeting();

  const setupItems = [
    counts.savedLocations > 0,
    counts.activityLogs > 0,
    counts.plannedActivities > 0,
    counts.scenarioRatings >= 5,
    counts.activityDefaults > 0,
    counts.weeklyObligations > 0,
  ];

  const setupCompleteCount = setupItems.filter(Boolean).length;
  const setupTotalCount = setupItems.length;

  const recommendationDateLabel = topRecommendation?.date
    ? formatFriendlyDate(topRecommendation.date)
    : "an upcoming day";

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
            Your outdoor forecast assistant
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {greeting}, {displayName}
          </h1>

          <p className="mt-2 max-w-3xl text-slate-300">
            Here’s what Lumora thinks is worth your attention next.
          </p>
        </div>

        <Button onClick={handleLogout} variant="secondary">
          Log out
        </Button>
      </header>

      {dashboardError && (
        <StatusMessage type="error">
          {dashboardError}
        </StatusMessage>
      )}

      {loadingDashboard && (
        <p className="mt-6 text-slate-300">Loading your dashboard...</p>
      )}

      <section className="mt-8">
        {topRecommendation ? (
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute right-[-6rem] top-[-6rem] h-64 w-64 rounded-full bg-[rgb(var(--season-rgb)_/_0.14)] blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex rounded-full border border-[rgb(var(--season-rgb)_/_0.35)] bg-[rgb(var(--season-rgb)_/_0.10)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-200">
                  Best upcoming option
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {activityLabel(topRecommendation.activity)} looks like your best bet.
                </h2>

                <p className="mt-3 text-slate-300">
                  For {recommendationDateLabel}, this activity has the strongest
                  combination of weather, score, and planning value.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <ScoreBadge
                    score={
                      topRecommendation.planning_score ??
                      topRecommendation.predicted_score
                    }
                    label={topRecommendation.label}
                    size="lg"
                  />

                  {topRecommendation.forecast_confidence_label && (
                    <Badge variant="info">
                      {topRecommendation.forecast_confidence_label} confidence
                    </Badge>
                  )}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <WeatherStat
                    label="Temperature"
                    value={`${topRecommendation.avg_temp ?? "?"}°F`}
                  />

                  <WeatherStat
                    label="Wind"
                    value={`${topRecommendation.wind_max ?? "?"} mph`}
                  />

                  <WeatherStat
                    label="Rain"
                    value={`${topRecommendation.rain_chance ?? "?"}%`}
                  />
                </div>

                {topRecommendation.activity === "Fishing" &&
                  topRecommendation.best_species && (
                    <div className="mt-4">
                      <Badge variant="info">
                        Best target: {topRecommendation.best_species}
                        {topRecommendation.best_species_score !== null
                          ? ` (${topRecommendation.best_species_score})`
                          : ""}
                      </Badge>
                    </div>
                  )}

                <Panel className="mt-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lumora’s take
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {buildLumoraTake({
                      activity: activityLabel(topRecommendation.activity),
                      date: topRecommendation.date,
                      score:
                        topRecommendation.planning_score ??
                        topRecommendation.predicted_score,
                      label: topRecommendation.label,
                      recommendedWindow: "Suggested time TBD",
                      forecastConfidenceLabel: topRecommendation.forecast_confidence_label,
                      avgTemp: topRecommendation.avg_temp,
                      windMax: topRecommendation.wind_max,
                      rainChance: topRecommendation.rain_chance,
                      bugIndex: topRecommendation.bug_index,
                      waterTempEst: topRecommendation.water_temp_est,
                      locationName: null,
                    })}
                  </p>

                  {topRecommendation.explanation && (
                    <details className="mt-3 text-sm text-slate-400">
                      <summary className="cursor-pointer font-semibold text-slate-300">
                        Original scoring explanation
                      </summary>

                      <p className="mt-2 leading-6">
                        {topRecommendation.explanation}
                      </p>
                    </details>
                  )}
                </Panel>
              </div>

              <div className="grid min-w-48 gap-2">
                <Button
                  onClick={saveRecommendationAsPlan}
                  disabled={savingRecommendationPlan}
                >
                  {savingRecommendationPlan ? "Saving..." : "Save as plan"}
                </Button>

                {topRecommendation.date && topRecommendation.activity && (
                  <RecommendationCalendarLink prediction={topRecommendation} />
                )}

                <Link
                  href="/planner"
                  className="rounded-lg bg-white/5 px-4 py-2 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  Open Planner
                </Link>
              </div>
            </div>

            {recommendationMessage && (
              <StatusMessage type="success">
                {recommendationMessage}
              </StatusMessage>
            )}

            {recommendationError && (
              <StatusMessage type="error">
                {recommendationError}
              </StatusMessage>
            )}
          </Card>
        ) : (
          <EmptyState
            title="No recommendation ready yet"
            description="Add a saved location, set activity defaults, or rate a few scenarios so Lumora can start giving better suggestions."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  href="/locations"
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                >
                  Add location
                </Link>

                <Link
                  href="/scenarios"
                  className="rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Rate scenarios
                </Link>
              </div>
            }
          />
        )}
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Setup complete"
          value={`${setupCompleteCount}/${setupTotalCount}`}
          hint="More setup means better recommendations."
        />

        <StatCard
          label="Plans"
          value={counts.plannedActivities}
          hint="Saved activities you might do."
        />

        <StatCard
          label="Logs"
          value={counts.activityLogs}
          hint="Real feedback for better scoring."
        />

        <StatCard
          label="Scenario ratings"
          value={counts.scenarioRatings}
          hint={`${Math.round(scenarioProgress * 100)}% of first target.`}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <SectionTitle
            title="Next best setup steps"
            description="These help Lumora personalize your recommendations."
          />

          <div className="mt-5 grid gap-3">
            <ChecklistItem
              complete={counts.savedLocations > 0}
              label="Add at least one saved location"
              href="/locations"
            />

            <ChecklistItem
              complete={counts.activityDefaults > 0}
              label="Choose default locations for activities"
              href="/activity-defaults"
            />

            <ChecklistItem
              complete={counts.weeklyObligations > 0}
              label="Add your weekly schedule"
              href="/schedule"
            />

            <ChecklistItem
              complete={counts.scenarioRatings >= 5}
              label="Rate at least 5 scenarios"
              href="/scenarios"
            />
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Quick actions"
            description="Tell the app what you want to do next."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <QuickAction href="/planner" label="Find a plan" />
            <QuickAction href="/logs" label="Log activity" />
            <QuickAction href="/scenarios" label="Rate scenarios" />
            <QuickAction href="/locations" label="Add location" />
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Upcoming plans"
            action={
              <Link
                href="/plans"
                className="text-sm font-semibold text-sky-300 hover:text-sky-200"
              >
                View all
              </Link>
            }
          />

          {upcomingPlans.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">
              No upcoming plans yet. Save a recommendation or create a plan.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {upcomingPlans.slice(0, 3).map((plan) => (
                <Panel key={plan.id}>
                  <div className="font-semibold text-white">
                    {plan.activity ?? "Unknown activity"}
                  </div>

                  <div className="mt-1 text-sm text-slate-300">
                    {formatFriendlyDate(plan.planned_date)} ·{" "}
                    {plan.planned_window || "No window"} ·{" "}
                    {plan.status ?? "Unknown status"}
                  </div>

                  {plan.location_name && (
                    <div className="mt-1 text-sm text-slate-400">
                      {plan.location_name}
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="Recent logs"
            action={
              <Link
                href="/logs"
                className="text-sm font-semibold text-sky-300 hover:text-sky-200"
              >
                View all
              </Link>
            }
          />

          {recentLogs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">
              No logs yet. Logging activities helps the app learn what you enjoy.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {recentLogs.slice(0, 3).map((log) => (
                <Panel key={log.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">
                        {log.activity ?? "Unknown activity"}
                      </div>

                      <div className="mt-1 text-sm text-slate-300">
                        {formatFriendlyDate(log.date)}
                      </div>
                    </div>

                    <Badge variant="info">
                      {log.actual_enjoyment_1_to_10 ?? "?"}/10
                    </Badge>
                  </div>

                  {log.notes && (
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {log.notes}
                    </p>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </Card>
      </section>
    </>
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
      className="rounded-xl border border-slate-700/70 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-[rgb(var(--season-rgb)_/_0.35)] hover:bg-[rgb(var(--season-rgb)_/_0.10)]"
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
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-white/[0.04] p-4 transition hover:border-[rgb(var(--season-rgb)_/_0.35)] hover:bg-[rgb(var(--season-rgb)_/_0.10)]"
    >
      <span className="text-sm font-medium text-slate-200">{label}</span>

      <Badge variant={complete ? "good" : "neutral"}>
        {complete ? "Done" : "To do"}
      </Badge>
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
      className="rounded-lg bg-white/5 px-4 py-2 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
    >
      Add to calendar
    </a>
  );
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }

  if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  }

  if (hour >= 17 && hour < 21) {
    return "Good evening";
  }

  return "Good evening";
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
  const todayString = today.toISOString().slice(0, 10);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowString = tomorrow.toISOString().slice(0, 10);

  if (dateString === todayString) {
    return "Today";
  }

  if (dateString === tomorrowString) {
    return "Tomorrow";
  }

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}