"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { ACTIVITY_OPTIONS, PLAN_STATUS_OPTIONS } from "@/lib/activityMeta";
import { trackEvent } from "@/lib/trackEvent";
import { PageHeader, Card, StatusMessage } from "@/components/ui";

type PlannedActivity = {
  id: number;
  user_id: string | null;
  activity: string | null;
  planned_date: string | null;
  planned_window: string | null;
  status: string | null;
  location_name: string | null;
  score_at_planning: number | null;
  planning_score_at_planning: number | null;
  forecast_confidence_at_planning: number | null;
  forecast_confidence_label_at_planning: string | null;
  species_target_at_planning: string | null;
  notes: string | null;
};

type ActivityLog = {
  id: number;
  planned_activity_id: number | null;
};

const DID_GO_OPTIONS = [
  "Yes",
  "No",
  "Partially",
];

export default function PlansPage() {
  const { user, authLoading } = useUser();

  const [plans, setPlans] = useState<PlannedActivity[]>([]);
  const [loggedPlanIds, setLoggedPlanIds] = useState<Set<number>>(new Set());

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [activity, setActivity] = useState("Running");
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedWindow, setPlannedWindow] = useState("");
  const [status, setStatus] = useState("Planned");
  const [locationName, setLocationName] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [editActivity, setEditActivity] = useState("Running");
  const [editPlannedDate, setEditPlannedDate] = useState("");
  const [editPlannedWindow, setEditPlannedWindow] = useState("");
  const [editStatus, setEditStatus] = useState("Planned");
  const [editLocationName, setEditLocationName] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const [logPlanId, setLogPlanId] = useState<number | null>(null);
  const [logEnjoyment, setLogEnjoyment] = useState(7);
  const [logDidIGo, setLogDidIGo] = useState("Yes");
  const [logActualTime, setLogActualTime] = useState("");
  const [logNotes, setLogNotes] = useState("");

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setPlannedDate(today);
  }, []);

  useEffect(() => {
    if (!user) {
      setPlans([]);
      setLoggedPlanIds(new Set());
      return;
    }

    loadPlansAndLinkedLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadPlansAndLinkedLogs() {
    if (!user) {
      return;
    }

    setLoading(true);
    setLoadError("");

    const { data: plansData, error: plansError } = await supabase
      .from("planned_activities")
      .select(
        [
          "id",
          "user_id",
          "activity",
          "planned_date",
          "planned_window",
          "status",
          "location_name",
          "score_at_planning",
          "planning_score_at_planning",
          "forecast_confidence_at_planning",
          "forecast_confidence_label_at_planning",
          "species_target_at_planning",
          "notes",
        ].join(",")
      )
      .eq("user_id", user.id)
      .order("planned_date", { ascending: true });

    if (plansError) {
      setLoadError(plansError.message);
      setLoading(false);
      return;
    }

    setPlans((plansData ?? []) as unknown as PlannedActivity[]);

    const { data: logsData, error: logsError } = await supabase
      .from("activity_logs")
      .select("id,planned_activity_id")
      .eq("user_id", user.id)
      .not("planned_activity_id", "is", null);

    if (logsError) {
      setLoadError(logsError.message);
      setLoading(false);
      return;
    }

    const linkedIds = new Set<number>();

    const typedLogsData = (logsData ?? []) as unknown as ActivityLog[];

    typedLogsData.forEach((log) => {
      if (log.planned_activity_id !== null) {
        linkedIds.add(log.planned_activity_id);
      }
    });

    setLoggedPlanIds(linkedIds);
    setLoading(false);
  }

  async function handleSavePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    if (!user) {
      setSaveError("You must be logged in to save a planned activity.");
      setSaving(false);
      return;
    }

    const { data: existingPlans, error: existingPlanError } = await supabase
      .from("planned_activities")
      .select("id")
      .eq("user_id", user.id)
      .eq("activity", activity)
      .eq("planned_date", plannedDate)
      .limit(1);

    if (existingPlanError) {
      setSaveError(existingPlanError.message);
      setSaving(false);
      return;
    }

    if ((existingPlans ?? []).length > 0) {
      setSaveError("You already have this activity planned for that date.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("planned_activities")
      .insert({
        user_id: user.id,
        activity,
        planned_date: plannedDate,
        planned_window: plannedWindow,
        status,
        location_name: locationName,
        notes,
      });

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    await trackEvent(user.id, "plan_created", {
      activity,
      planned_date: plannedDate,
      planned_window: plannedWindow,
      status,
    });

    setSaveMessage("Planned activity saved.");
    setActivity("Running");
    setPlannedWindow("");
    setStatus("Planned");
    setLocationName("");
    setNotes("");

    await loadPlansAndLinkedLogs();
    setSaving(false);
  }

  function startEditing(plan: PlannedActivity) {
    setEditingPlanId(plan.id);
    setEditActivity(plan.activity ?? "Running");
    setEditPlannedDate(plan.planned_date ?? "");
    setEditPlannedWindow(plan.planned_window ?? "");
    setEditStatus(plan.status ?? "Planned");
    setEditLocationName(plan.location_name ?? "");
    setEditNotes(plan.notes ?? "");
    setActionMessage("");
    setActionError("");
  }

  function cancelEditing() {
    setEditingPlanId(null);
    setEditActivity("Running");
    setEditPlannedDate("");
    setEditPlannedWindow("");
    setEditStatus("Planned");
    setEditLocationName("");
    setEditNotes("");
  }

  async function savePlanEdits(planId: number) {
    if (!user) {
      return;
    }

    setUpdatingId(planId);
    setActionMessage("");
    setActionError("");

    const { error } = await supabase
      .from("planned_activities")
      .update({
        activity: editActivity,
        planned_date: editPlannedDate,
        planned_window: editPlannedWindow,
        status: editStatus,
        location_name: editLocationName,
        notes: editNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .eq("user_id", user.id);

    if (error) {
      setActionError(error.message);
      setUpdatingId(null);
      return;
    }

    setActionMessage("Plan updated.");
    setEditingPlanId(null);

    await loadPlansAndLinkedLogs();
    setUpdatingId(null);
  }

  async function updatePlanStatus(planId: number, newStatus: string) {
    if (!user) {
      return;
    }

    setUpdatingId(planId);
    setActionError("");

    const { error } = await supabase
      .from("planned_activities")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .eq("user_id", user.id);

    if (error) {
      setActionError(error.message);
      setUpdatingId(null);
      return;
    }

    await loadPlansAndLinkedLogs();
    setUpdatingId(null);
  }

  async function deletePlan(planId: number) {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this planned activity? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    setUpdatingId(planId);
    setActionError("");

    const { error } = await supabase
      .from("planned_activities")
      .delete()
      .eq("id", planId)
      .eq("user_id", user.id);

    if (error) {
      setActionError(error.message);
      setUpdatingId(null);
      return;
    }

    await loadPlansAndLinkedLogs();
    setUpdatingId(null);
  }

  function startLogPlan(planId: number) {
    setLogPlanId(planId);
    setLogEnjoyment(7);
    setLogDidIGo("Yes");
    setLogActualTime("");
    setLogNotes("");
    setActionMessage("");
    setActionError("");
  }

  function cancelLogPlan() {
    setLogPlanId(null);
    setLogEnjoyment(7);
    setLogDidIGo("Yes");
    setLogActualTime("");
    setLogNotes("");
  }

  async function saveLogFromPlan(plan: PlannedActivity) {
    if (!user) {
      return;
    }

    if (loggedPlanIds.has(plan.id)) {
      setActionError("This planned activity has already been logged.");
      return;
    }

    setUpdatingId(plan.id);
    setActionMessage("");
    setActionError("");

    const actualScore = logEnjoyment * 10;

    let predictionError: number | null = null;
    let absoluteError: number | null = null;

    if (plan.score_at_planning !== null) {
      predictionError = actualScore - plan.score_at_planning;
      absoluteError = Math.abs(predictionError);
    }

    const { error: logErrorResponse } = await supabase
      .from("activity_logs")
      .insert({
        user_id: user.id,
        planned_activity_id: plan.id,
        logged_at: new Date().toISOString(),
        date: plan.planned_date,
        activity: plan.activity,
        predicted_score: plan.score_at_planning,
        recommended_time_window: plan.planned_window,
        actual_time: logActualTime,
        actual_enjoyment_1_to_10: logEnjoyment,
        actual_score_0_to_100: actualScore,
        prediction_error: predictionError,
        absolute_error: absoluteError,
        did_i_go: logDidIGo,
        notes: logNotes,
      });

    if (logErrorResponse) {
      setActionError(logErrorResponse.message);
      setUpdatingId(null);
      return;
    }

    const { error: planUpdateError } = await supabase
      .from("planned_activities")
      .update({
        status: "Completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.id)
      .eq("user_id", user.id);

    if (planUpdateError) {
      setActionError(planUpdateError.message);
      setUpdatingId(null);
      return;
    }

    await trackEvent(user.id, "planned_activity_logged", {
      plan_id: plan.id,
      activity: plan.activity,
      planned_date: plan.planned_date,
      actual_enjoyment: logEnjoyment,
    });

    setActionMessage("Activity log created and plan marked Completed.");
    setLogPlanId(null);

    await loadPlansAndLinkedLogs();
    setUpdatingId(null);
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <>
        <PageHeader title="Plans" />

        <Card className="mt-6">
          <p className="text-slate-300">
            Please log in on the Home page to view and create plans.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Plans"
        description="Save activities you might do, then later log how they actually went."
      />

      <Card className="mt-8">
        <h2 className="text-xl font-semibold">Create Plan</h2>

        <form onSubmit={handleSavePlan} className="mt-4 grid gap-4">
          <PlanFormFields
            activity={activity}
            setActivity={setActivity}
            plannedDate={plannedDate}
            setPlannedDate={setPlannedDate}
            plannedWindow={plannedWindow}
            setPlannedWindow={setPlannedWindow}
            status={status}
            setStatus={setStatus}
            locationName={locationName}
            setLocationName={setLocationName}
            notes={notes}
            setNotes={setNotes}
          />

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save plan"}
          </button>
        </form>

        {saveMessage && (
          <StatusMessage type="success">
            {saveMessage}
          </StatusMessage>
        )}

        {saveError && (
          <StatusMessage type="error">
            {saveError}
          </StatusMessage>
        )}
      </Card>

      <Card className="mt-8">
        <h2 className="text-xl font-semibold">Your Plans</h2>

        {loading && (
          <p className="mt-4 text-slate-300">Loading plans...</p>
        )}

        {loadError && (
          <StatusMessage type="error">
            {loadError}
          </StatusMessage>
        )}

        {actionMessage && (
          <StatusMessage type="success">
            {actionMessage}
          </StatusMessage>
        )}

        {actionError && (
          <StatusMessage type="error">
            {actionError}
          </StatusMessage>
        )}

        {!loading && !loadError && plans.length === 0 && (
          <p className="mt-4 text-slate-300">No plans yet.</p>
        )}

        <div className="mt-4 grid gap-3">
          {plans.map((plan) => {
            const alreadyLogged = loggedPlanIds.has(plan.id);

            return (
              <div
                key={plan.id}
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                {editingPlanId === plan.id ? (
                  <div className="grid gap-4">
                    <div className="text-lg font-semibold">
                      Editing plan
                    </div>

                    <PlanFormFields
                      activity={editActivity}
                      setActivity={setEditActivity}
                      plannedDate={editPlannedDate}
                      setPlannedDate={setEditPlannedDate}
                      plannedWindow={editPlannedWindow}
                      setPlannedWindow={setEditPlannedWindow}
                      status={editStatus}
                      setStatus={setEditStatus}
                      locationName={editLocationName}
                      setLocationName={setEditLocationName}
                      notes={editNotes}
                      setNotes={setEditNotes}
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => savePlanEdits(plan.id)}
                        disabled={updatingId === plan.id}
                        className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingId === plan.id ? "Saving..." : "Save edits"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-lg font-semibold">
                          {plan.activity ?? "Unknown activity"}
                        </div>

                        <div className="mt-1 text-sm text-slate-300">
                          {plan.planned_date ?? "Unknown date"} ·{" "}
                          {plan.planned_window || "No window"} ·{" "}
                          {plan.status ?? "Unknown status"}
                        </div>

                        {alreadyLogged && (
                          <div className="mt-2 inline-flex rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">
                            Already logged
                          </div>
                        )}

                        {plan.location_name && (
                          <div className="mt-2 text-sm text-slate-400">
                            Location: {plan.location_name}
                          </div>
                        )}

                        {plan.species_target_at_planning && (
                          <div className="mt-1 text-sm text-slate-400">
                            Fishing target: {plan.species_target_at_planning}
                          </div>
                        )}

                        {plan.notes && (
                          <p className="mt-2 text-sm text-slate-300">
                            {plan.notes}
                          </p>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <select
                          value={plan.status ?? "Planned"}
                          onChange={(event) =>
                            updatePlanStatus(plan.id, event.target.value)
                          }
                          disabled={updatingId === plan.id}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                        >
                          {PLAN_STATUS_OPTIONS.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => startEditing(plan)}
                          className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => startLogPlan(plan.id)}
                          disabled={alreadyLogged}
                          className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {alreadyLogged ? "Logged" : "Log this plan"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deletePlan(plan.id)}
                          disabled={updatingId === plan.id}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingId === plan.id ? "Working..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    {logPlanId === plan.id && (
                      <LogPlanForm
                        planId={plan.id}
                        logEnjoyment={logEnjoyment}
                        setLogEnjoyment={setLogEnjoyment}
                        logDidIGo={logDidIGo}
                        setLogDidIGo={setLogDidIGo}
                        logActualTime={logActualTime}
                        setLogActualTime={setLogActualTime}
                        logNotes={logNotes}
                        setLogNotes={setLogNotes}
                        updatingId={updatingId}
                        onSave={() => saveLogFromPlan(plan)}
                        onCancel={cancelLogPlan}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function PlanFormFields({
  activity,
  setActivity,
  plannedDate,
  setPlannedDate,
  plannedWindow,
  setPlannedWindow,
  status,
  setStatus,
  locationName,
  setLocationName,
  notes,
  setNotes,
}: {
  activity: string;
  setActivity: (value: string) => void;
  plannedDate: string;
  setPlannedDate: (value: string) => void;
  plannedWindow: string;
  setPlannedWindow: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  locationName: string;
  setLocationName: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Activity</span>
          <select
            value={activity}
            onChange={(event) => setActivity(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          >
            {ACTIVITY_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Date</span>
          <input
            type="date"
            value={plannedDate}
            onChange={(event) => setPlannedDate(event.target.value)}
            required
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Planned window</span>
          <input
            type="text"
            value={plannedWindow}
            onChange={(event) => setPlannedWindow(event.target.value)}
            placeholder="Example: 6:00 PM–8:00 PM"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          >
            {PLAN_STATUS_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1">
        <span className="text-sm text-slate-300">Location name</span>
        <input
          type="text"
          value={locationName}
          onChange={(event) => setLocationName(event.target.value)}
          placeholder="Example: Local Pond, Tennis Courts"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
        />
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-300">Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional notes"
          className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
        />
      </label>
    </div>
  );
}

function LogPlanForm({
  planId,
  logEnjoyment,
  setLogEnjoyment,
  logDidIGo,
  setLogDidIGo,
  logActualTime,
  setLogActualTime,
  logNotes,
  setLogNotes,
  updatingId,
  onSave,
  onCancel,
}: {
  planId: number;
  logEnjoyment: number;
  setLogEnjoyment: (value: number) => void;
  logDidIGo: string;
  setLogDidIGo: (value: string) => void;
  logActualTime: string;
  setLogActualTime: (value: string) => void;
  logNotes: string;
  setLogNotes: (value: string) => void;
  updatingId: number | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h3 className="text-lg font-semibold">Log this planned activity</h3>

      <div className="mt-4 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm text-slate-300">
            Actual enjoyment: {logEnjoyment}/10
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={logEnjoyment}
            onChange={(event) => setLogEnjoyment(Number(event.target.value))}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Did you go?</span>
          <select
            value={logDidIGo}
            onChange={(event) => setLogDidIGo(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
          >
            {DID_GO_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Actual time</span>
          <input
            type="text"
            value={logActualTime}
            onChange={(event) => setLogActualTime(event.target.value)}
            placeholder="Example: 7:30 AM or 6:00 PM"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Notes</span>
          <textarea
            value={logNotes}
            onChange={(event) => setLogNotes(event.target.value)}
            placeholder="How did it go?"
            className="min-h-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={updatingId === planId}
            className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatingId === planId ? "Saving..." : "Save activity log"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}