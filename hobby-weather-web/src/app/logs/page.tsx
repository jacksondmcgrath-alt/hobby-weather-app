"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { ACTIVITY_OPTIONS, activityLabel } from "@/lib/activityMeta";
import { trackEvent } from "@/lib/trackEvent";
import {
  PageHeader,
  Card,
  StatusMessage,
  SectionTitle,
  Panel,
  Button,
  Badge,
  EmptyState,
} from "@/components/ui";

type ActivityLog = {
  id: number;
  user_id: string | null;
  planned_activity_id: number | null;
  logged_at: string | null;
  date: string | null;
  activity: string | null;
  predicted_score: number | null;
  actual_enjoyment_1_to_10: number | null;
  actual_score_0_to_100: number | null;
  prediction_error: number | null;
  absolute_error: number | null;
  did_i_go: string | null;
  notes: string | null;
};

const DID_GO_OPTIONS = [
  "Yes",
  "No",
  "Partially",
];

export default function LogsPage() {
  const { user, authLoading } = useUser();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");

  const [activity, setActivity] = useState("Running");
  const [date, setDate] = useState("");
  const [actualEnjoyment, setActualEnjoyment] = useState(7);
  const [didIGo, setDidIGo] = useState("Yes");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editEnjoyment, setEditEnjoyment] = useState(7);
  const [editDidIGo, setEditDidIGo] = useState("Yes");
  const [editNotes, setEditNotes] = useState("");

  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");
  const [workingLogId, setWorkingLogId] = useState<number | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
  }, []);

  useEffect(() => {
    if (!user) {
      setLogs([]);
      return;
    }

    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadLogs() {
    if (!user) {
      return;
    }

    setLogsLoading(true);
    setLogsError("");

    const { data, error } = await supabase
      .from("activity_logs")
      .select(
        [
          "id",
          "user_id",
          "planned_activity_id",
          "logged_at",
          "date",
          "activity",
          "predicted_score",
          "actual_enjoyment_1_to_10",
          "actual_score_0_to_100",
          "prediction_error",
          "absolute_error",
          "did_i_go",
          "notes",
        ].join(",")
      )
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false });

    if (error) {
      setLogsError(error.message);
      setLogs([]);
      setLogsLoading(false);
      return;
    }

    setLogs((data ?? []) as unknown as ActivityLog[]);
    setLogsLoading(false);
  }

  async function handleSaveLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    if (!user) {
      setSaveError("You must be logged in to save an activity log.");
      setSaving(false);
      return;
    }

    const actualScore = actualEnjoyment * 10;

    const { data: matchingPredictionData } = await supabase
      .from("user_predictions")
      .select("weather_snapshot,location_context,feature_json")
      .eq("user_id", user.id)
      .eq("date", date)
      .eq("activity", activity)
      .limit(1)
      .maybeSingle();

    const matchingPrediction = matchingPredictionData as unknown as {
      weather_snapshot?: Record<string, unknown> | null;
      location_context?: Record<string, unknown> | null;
      feature_json?: {
        preferences?: Record<string, unknown>;
      } | null;
    } | null;

    const { error } = await supabase
      .from("activity_logs")
      .insert({
        user_id: user.id,
        logged_at: new Date().toISOString(),
        date,
        activity,
        predicted_score: null,
        actual_enjoyment_1_to_10: actualEnjoyment,
        actual_score_0_to_100: actualScore,
        prediction_error: null,
        absolute_error: null,
        did_i_go: didIGo,
        notes,
        weather_snapshot: matchingPrediction?.weather_snapshot ?? null,
        location_context: matchingPrediction?.location_context ?? null,
        preference_snapshot: matchingPrediction?.feature_json?.preferences ?? null,
      });

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    setSaveMessage("Activity log saved.");

    await trackEvent(user.id, "activity_log_created", {
      activity,
      date,
      actual_enjoyment: actualEnjoyment,
      did_i_go: didIGo,
    });

    setNotes("");
    setActualEnjoyment(7);
    setDidIGo("Yes");

    await loadLogs();

    setSaving(false);
  }

  function startEditing(log: ActivityLog) {
    setEditingLogId(log.id);
    setEditEnjoyment(log.actual_enjoyment_1_to_10 ?? 7);
    setEditDidIGo(log.did_i_go ?? "Yes");
    setEditNotes(log.notes ?? "");
    setEditMessage("");
    setEditError("");
  }

  function cancelEditing() {
    setEditingLogId(null);
    setEditEnjoyment(7);
    setEditDidIGo("Yes");
    setEditNotes("");
    setEditMessage("");
    setEditError("");
  }

  async function saveLogEdits(log: ActivityLog) {
    if (!user) {
      return;
    }

    setWorkingLogId(log.id);
    setEditMessage("");
    setEditError("");

    const actualScore = editEnjoyment * 10;

    let predictionError: number | null = null;
    let absoluteError: number | null = null;

    if (log.predicted_score !== null) {
      predictionError = actualScore - log.predicted_score;
      absoluteError = Math.abs(predictionError);
    }

    const { error } = await supabase
      .from("activity_logs")
      .update({
        actual_enjoyment_1_to_10: editEnjoyment,
        actual_score_0_to_100: actualScore,
        prediction_error: predictionError,
        absolute_error: absoluteError,
        did_i_go: editDidIGo,
        notes: editNotes,
      })
      .eq("id", log.id)
      .eq("user_id", user.id);

    if (error) {
      setEditError(error.message);
      setWorkingLogId(null);
      return;
    }

    await trackEvent(user.id, "activity_log_updated", {
      log_id: log.id,
      activity: log.activity,
      actual_enjoyment: editEnjoyment,
    });

    setEditMessage("Log updated.");
    setEditingLogId(null);

    await loadLogs();

    setWorkingLogId(null);
  }

  async function deleteLog(logId: number) {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this activity log? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    setWorkingLogId(logId);
    setEditMessage("");
    setEditError("");

    const { error } = await supabase
      .from("activity_logs")
      .delete()
      .eq("id", logId)
      .eq("user_id", user.id);

    if (error) {
      setEditError(error.message);
      setWorkingLogId(null);
      return;
    }

    await trackEvent(user.id, "activity_log_deleted", {
      log_id: logId,
    });

    await loadLogs();

    setWorkingLogId(null);
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <>
        <PageHeader title="Activity Logs" />

        <Card className="mt-6">
          <p className="text-slate-300">
            Please log in on the Home page to view and create activity logs.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Feedback"
        title="Activity Logs"
        description="Tell Lumora how your activities actually went so future recommendations can get smarter."
      />

      <Card className="mt-8 relative overflow-hidden">
        <div className="pointer-events-none absolute right-[-6rem] top-[-6rem] h-64 w-64 rounded-full bg-[rgb(var(--season-rgb)_/_0.12)] blur-3xl" />

        <div className="relative">
          <SectionTitle
            title="Log how it went"
            description="A quick log helps the app learn what conditions you actually enjoy."
          />

          <form onSubmit={handleSaveLog} className="mt-5 grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-300">
                  Activity
                </span>

                <select
                  value={activity}
                  onChange={(event) => setActivity(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
                >
                  {ACTIVITY_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-300">
                  Date
                </span>

                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
                  required
                />
              </label>
            </div>

            <Panel>
              <label className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-300">
                    How enjoyable was it?
                  </span>

                  <span className="rounded-full bg-[rgb(var(--season-rgb)_/_0.14)] px-3 py-1 text-sm font-bold text-white">
                    {actualEnjoyment}/10
                  </span>
                </div>

                <input
                  type="range"
                  min={1}
                  max={10}
                  value={actualEnjoyment}
                  onChange={(event) =>
                    setActualEnjoyment(Number(event.target.value))
                  }
                />

                <div className="flex justify-between text-xs text-slate-500">
                  <span>Rough</span>
                  <span>Great</span>
                </div>
              </label>
            </Panel>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-300">
                Did you go?
              </span>

              <select
                value={didIGo}
                onChange={(event) => setDidIGo(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
              >
                {DID_GO_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-300">
                Notes, optional
              </span>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Example: Wind was worse than expected. Bugs were fine. Great run."
                className="min-h-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
              />
            </label>

            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save activity log"}
            </Button>
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
        </div>
      </Card>

      <Card className="mt-8">
        <SectionTitle
          title="Recent activity feedback"
          description="These logs help Lumora understand what actually worked for you."
        />

        {logsLoading && (
          <p className="mt-4 text-slate-300">Loading activity logs...</p>
        )}

        {logsError && (
          <StatusMessage type="error">
            {logsError}
          </StatusMessage>
        )}

        {editMessage && (
          <StatusMessage type="success">
            {editMessage}
          </StatusMessage>
        )}

        {editError && (
          <StatusMessage type="error">
            {editError}
          </StatusMessage>
        )}

        {!logsLoading && !logsError && logs.length === 0 && (
          <div className="mt-4">
            <EmptyState
              title="No logs yet"
              description="Log your first activity so future recommendations can learn from what you actually enjoyed."
            />
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-4 grid gap-3">
            {logs.map((log) => (
              <Panel key={log.id}>
                {editingLogId === log.id ? (
                  <div className="grid gap-4">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Editing log
                      </div>

                      <div className="mt-1 text-lg font-semibold text-white">
                        {activityLabel(log.activity)}
                      </div>
                    </div>

                    <label className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-300">
                          Enjoyment
                        </span>

                        <span className="rounded-full bg-[rgb(var(--season-rgb)_/_0.14)] px-3 py-1 text-sm font-bold text-white">
                          {editEnjoyment}/10
                        </span>
                      </div>

                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={editEnjoyment}
                        onChange={(event) =>
                          setEditEnjoyment(Number(event.target.value))
                        }
                      />

                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Rough</span>
                        <span>Great</span>
                      </div>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm text-slate-300">Did you go?</span>

                      <select
                        value={editDidIGo}
                        onChange={(event) => setEditDidIGo(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
                      >
                        {DID_GO_OPTIONS.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm text-slate-300">Notes</span>

                      <textarea
                        value={editNotes}
                        onChange={(event) => setEditNotes(event.target.value)}
                        className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => saveLogEdits(log)}
                        disabled={workingLogId === log.id}
                      >
                        {workingLogId === log.id ? "Saving..." : "Save edits"}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={cancelEditing}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-white">
                          {activityLabel(log.activity)}
                        </div>

                        <Badge variant={getEnjoymentBadgeVariant(log.actual_enjoyment_1_to_10)}>
                          {log.actual_enjoyment_1_to_10 ?? "?"}/10
                        </Badge>

                        <Badge variant={getDidGoBadgeVariant(log.did_i_go)}>
                          {log.did_i_go ?? "Unknown"}
                        </Badge>
                      </div>

                      <div className="mt-1 text-sm text-slate-400">
                        {formatFriendlyDate(log.date)}
                      </div>

                      {log.planned_activity_id && (
                        <div className="mt-1 text-xs text-sky-300">
                          Linked to planned activity #{log.planned_activity_id}
                        </div>
                      )}

                      {log.predicted_score !== null && (
                        <div className="mt-2 text-sm text-slate-400">
                          Predicted: {log.predicted_score} · Actual:{" "}
                          {log.actual_score_0_to_100 ?? "?"}
                          {log.absolute_error !== null
                            ? ` · Error: ${log.absolute_error}`
                            : ""}
                        </div>
                      )}

                      {log.notes && (
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {log.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(log)}
                      >
                        Edit
                      </Button>

                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => deleteLog(log.id)}
                        disabled={workingLogId === log.id}
                      >
                        {workingLogId === log.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}
      </Card>
    </>
  );
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

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = yesterday.toISOString().slice(0, 10);

  if (dateString === todayString) {
    return "Today";
  }

  if (dateString === yesterdayString) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getEnjoymentBadgeVariant(
  enjoyment: number | null
): "good" | "info" | "warning" | "danger" | "neutral" {
  if (enjoyment === null) {
    return "neutral";
  }

  if (enjoyment >= 8) {
    return "good";
  }

  if (enjoyment >= 6) {
    return "info";
  }

  if (enjoyment >= 4) {
    return "warning";
  }

  return "danger";
}

function getDidGoBadgeVariant(
  didIGo: string | null
): "good" | "info" | "warning" | "danger" | "neutral" {
  if (didIGo === "Yes") {
    return "good";
  }

  if (didIGo === "Partially") {
    return "warning";
  }

  if (didIGo === "No") {
    return "neutral";
  }

  return "neutral";
}