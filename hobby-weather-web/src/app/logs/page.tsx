"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";
import { trackEvent } from "@/lib/trackEvent";

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

const ACTIVITY_OPTIONS = [
  "Fishing",
  "Camping",
  "Running",
  "Kayaking",
  "Disc Golf",
  "Tennis",
  "Beach Day",
];

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
      setLogsLoading(false);
      return;
    }

    setLogs(data ?? []);
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

    await loadLogs();

    setWorkingLogId(null);
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-slate-300">Loading...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <NavBar />

          <h1 className="text-3xl font-bold">Activity Logs</h1>

          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in on the Home page to view and create activity logs.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <header>
          <h1 className="text-3xl font-bold">Activity Logs</h1>
          <p className="mt-2 text-slate-300">
            Save actual experiences so the app can eventually learn your preferences.
          </p>
        </header>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Add Activity Log</h2>

          <form onSubmit={handleSaveLog} className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm text-slate-300">Activity</span>
                <select
                  value={activity}
                  onChange={(event) => setActivity(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
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
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                  required
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm text-slate-300">
                Actual enjoyment: {actualEnjoyment}/10
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={actualEnjoyment}
                onChange={(event) =>
                  setActualEnjoyment(Number(event.target.value))
                }
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-slate-300">Did you go?</span>
              <select
                value={didIGo}
                onChange={(event) => setDidIGo(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
              >
                {DID_GO_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-slate-300">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Example: Wind was worse than expected. Bugs were fine. Great run."
                className="min-h-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save activity log"}
            </button>
          </form>

          {saveMessage && (
            <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
              {saveMessage}
            </div>
          )}

          {saveError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {saveError}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Your Logs</h2>

          {logsLoading && (
            <p className="mt-4 text-slate-300">Loading activity logs...</p>
          )}

          {logsError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {logsError}
            </div>
          )}

          {editMessage && (
            <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
              {editMessage}
            </div>
          )}

          {editError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {editError}
            </div>
          )}

          {!logsLoading && !logsError && logs.length === 0 && (
            <p className="mt-4 text-slate-300">No logs yet.</p>
          )}

          <div className="mt-4 grid gap-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                {editingLogId === log.id ? (
                  <div className="grid gap-4">
                    <div className="text-lg font-semibold">
                      Editing {log.activity ?? "Unknown activity"}
                    </div>

                    <label className="grid gap-2">
                      <span className="text-sm text-slate-300">
                        Actual enjoyment: {editEnjoyment}/10
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={editEnjoyment}
                        onChange={(event) =>
                          setEditEnjoyment(Number(event.target.value))
                        }
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm text-slate-300">Did you go?</span>
                      <select
                        value={editDidIGo}
                        onChange={(event) => setEditDidIGo(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
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
                        className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveLogEdits(log)}
                        disabled={workingLogId === log.id}
                        className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {workingLogId === log.id ? "Saving..." : "Save edits"}
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-lg font-semibold">
                        {log.activity ?? "Unknown activity"}
                      </div>

                      <div className="mt-1 text-sm text-slate-300">
                        {log.date ?? "Unknown date"} · {log.did_i_go ?? "Unknown"}
                      </div>

                      {log.planned_activity_id && (
                        <div className="mt-1 text-xs text-blue-300">
                          Linked to planned activity #{log.planned_activity_id}
                        </div>
                      )}

                      {log.notes && (
                        <p className="mt-3 text-sm text-slate-300">
                          {log.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="rounded-full bg-blue-500 px-3 py-1 text-center text-sm font-bold">
                        {log.actual_enjoyment_1_to_10 ?? "?"}/10
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditing(log)}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteLog(log.id)}
                        disabled={workingLogId === log.id}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {workingLogId === log.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}