"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";
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

  useEffect(() => {
    if (!user) {
      return;
    }

    loadDashboard(user);
  }, [user]);

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
      savedLocations: savedLocationsCount,
      activityLogs: activityLogsCount,
      plannedActivities: plannedActivitiesCount,
      scenarioRatings: scenarioRatingsCount,
      activityDefaults: activityDefaultsCount,
      weeklyObligations: weeklyObligationsCount,
    });

    setUpcomingPlans([]);
    setRecentLogs([]);
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
    } catch (error) {
      if (error instanceof Error) {
        setDashboardError(error.message);
      } else {
        setDashboardError("Could not load dashboard.");
      }
    }

    setLoadingDashboard(false);
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-slate-300">Loading...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
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
      </main>
    );
  }

  const scenarioProgress = Math.min(
    counts.scenarioRatings / SCENARIO_TOTAL_GOAL,
    1
  );

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <NavBar />

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
      </div>
    </main>
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