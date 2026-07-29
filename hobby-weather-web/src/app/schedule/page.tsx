"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";

type WeeklyObligation = {
  id: number;
  user_id: string | null;
  label: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  active: boolean | null;
};

const DAY_OPTIONS = [
  { label: "Monday", value: 0 },
  { label: "Tuesday", value: 1 },
  { label: "Wednesday", value: 2 },
  { label: "Thursday", value: 3 },
  { label: "Friday", value: 4 },
  { label: "Saturday", value: 5 },
  { label: "Sunday", value: 6 },
];

function dayLabel(value: number | null) {
  return DAY_OPTIONS.find((day) => day.value === value)?.label ?? "Unknown";
}

export default function SchedulePage() {
  const { user, authLoading } = useUser();

  const [obligations, setObligations] = useState<WeeklyObligation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [label, setLabel] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [workingId, setWorkingId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDayOfWeek, setEditDayOfWeek] = useState(0);
  const [editStartTime, setEditStartTime] = useState("08:00");
  const [editEndTime, setEditEndTime] = useState("17:00");
  const [editActive, setEditActive] = useState(true);

  useEffect(() => {
    if (!user) {
      setObligations([]);
      return;
    }

    loadObligations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const summary = useMemo(() => {
    const total = obligations.length;
    const active = obligations.filter((item) => item.active !== false).length;
    const inactive = total - active;
    const daysBlocked = new Set(
      obligations
        .filter((item) => item.active !== false)
        .map((item) => item.day_of_week)
        .filter((value) => value !== null)
    ).size;

    return {
      total,
      active,
      inactive,
      daysBlocked,
    };
  }, [obligations]);

  async function loadObligations() {
    if (!user) return;

    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("weekly_obligations")
      .select("id,user_id,label,day_of_week,start_time,end_time,active")
      .eq("user_id", user.id)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    setObligations(data ?? []);
    setLoading(false);
  }

  async function saveObligation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    if (!user) {
      setErrorMessage("You must be logged in.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("weekly_obligations")
      .insert({
        user_id: user.id,
        label,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        active: true,
      });

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setLabel("");
    setStartTime("08:00");
    setEndTime("17:00");
    setMessage("Schedule block saved.");

    await loadObligations();

    setSaving(false);
  }

  async function addWorkweekPreset() {
    if (!user) return;

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const rows = [0, 1, 2, 3, 4].map((day) => ({
      user_id: user.id,
      label: "Work",
      day_of_week: day,
      start_time: "08:00",
      end_time: "17:00",
      active: true,
    }));

    const { error } = await supabase
      .from("weekly_obligations")
      .insert(rows);

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage("Workweek preset added.");
    await loadObligations();
    setSaving(false);
  }

  function startEditing(obligation: WeeklyObligation) {
    setEditingId(obligation.id);
    setEditLabel(obligation.label ?? "");
    setEditDayOfWeek(obligation.day_of_week ?? 0);
    setEditStartTime(obligation.start_time ?? "08:00");
    setEditEndTime(obligation.end_time ?? "17:00");
    setEditActive(obligation.active !== false);
    setMessage("");
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditLabel("");
    setEditDayOfWeek(0);
    setEditStartTime("08:00");
    setEditEndTime("17:00");
    setEditActive(true);
  }

  async function saveEdits(obligationId: number) {
    if (!user) return;

    setWorkingId(obligationId);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("weekly_obligations")
      .update({
        label: editLabel,
        day_of_week: editDayOfWeek,
        start_time: editStartTime,
        end_time: editEndTime,
        active: editActive,
      })
      .eq("id", obligationId)
      .eq("user_id", user.id);

    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }

    setMessage("Schedule block updated.");
    setEditingId(null);

    await loadObligations();
    setWorkingId(null);
  }

  async function toggleActive(obligation: WeeklyObligation) {
    if (!user) return;

    setWorkingId(obligation.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("weekly_obligations")
      .update({
        active: obligation.active === false,
      })
      .eq("id", obligation.id)
      .eq("user_id", user.id);

    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }

    await loadObligations();
    setWorkingId(null);
  }

  async function deleteObligation(id: number) {
    if (!user) return;

    const confirmed = window.confirm(
      "Delete this schedule block? This cannot be undone."
    );

    if (!confirmed) return;

    setWorkingId(id);
    setErrorMessage("");

    const { error } = await supabase
      .from("weekly_obligations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }

    await loadObligations();
    setWorkingId(null);
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
          <h1 className="text-3xl font-bold">Weekly Schedule</h1>
          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in to manage your schedule.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <h1 className="text-3xl font-bold">Weekly Schedule</h1>
        <p className="mt-2 text-slate-300">
          Add recurring times when you are unavailable. Future suggested windows can avoid these times.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-4">
          <SummaryCard label="Total" value={summary.total} />
          <SummaryCard label="Active" value={summary.active} />
          <SummaryCard label="Inactive" value={summary.inactive} />
          <SummaryCard label="Days Blocked" value={summary.daysBlocked} />
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Add Unavailable Time</h2>
              <p className="mt-1 text-sm text-slate-300">
                Add work, class, practice, or other recurring obligations.
              </p>
            </div>

            <button
              type="button"
              onClick={addWorkweekPreset}
              disabled={saving}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Mon–Fri 8–5 Work
            </button>
          </div>

          <form onSubmit={saveObligation} className="mt-4 grid gap-4">
            <label className="grid gap-1">
              <span className="text-sm text-slate-300">Label</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Example: Work, Class, Practice"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                required
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-slate-300">Day</span>
              <select
                value={dayOfWeek}
                onChange={(event) => setDayOfWeek(Number(event.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
              >
                {DAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm text-slate-300">Start time</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-300">End time</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save schedule block"}
            </button>
          </form>

          {message && (
            <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
              {message}
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {errorMessage}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Your Weekly Schedule</h2>

          {loading && (
            <p className="mt-4 text-slate-300">Loading schedule...</p>
          )}

          {loadError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {loadError}
            </div>
          )}

          {!loading && !loadError && obligations.length === 0 && (
            <p className="mt-4 text-slate-300">No schedule blocks yet.</p>
          )}

          <div className="mt-4 grid gap-3">
            {obligations.map((obligation) => (
              <div
                key={obligation.id}
                className={`rounded-xl border p-4 ${
                  obligation.active === false
                    ? "border-slate-800 bg-slate-900 opacity-70"
                    : "border-slate-700 bg-slate-800"
                }`}
              >
                {editingId === obligation.id ? (
                  <div className="grid gap-4">
                    <div className="font-semibold">Editing schedule block</div>

                    <label className="grid gap-1">
                      <span className="text-sm text-slate-300">Label</span>
                      <input
                        value={editLabel}
                        onChange={(event) => setEditLabel(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-sm text-slate-300">Day</span>
                      <select
                        value={editDayOfWeek}
                        onChange={(event) =>
                          setEditDayOfWeek(Number(event.target.value))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
                      >
                        {DAY_OPTIONS.map((day) => (
                          <option key={day.value} value={day.value}>
                            {day.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-sm text-slate-300">Start time</span>
                        <input
                          type="time"
                          value={editStartTime}
                          onChange={(event) =>
                            setEditStartTime(event.target.value)
                          }
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
                        />
                      </label>

                      <label className="grid gap-1">
                        <span className="text-sm text-slate-300">End time</span>
                        <input
                          type="time"
                          value={editEndTime}
                          onChange={(event) =>
                            setEditEndTime(event.target.value)
                          }
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
                        />
                      </label>
                    </div>

                    <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(event) =>
                          setEditActive(event.target.checked)
                        }
                      />
                      <span className="text-sm text-slate-300">Active</span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdits(obligation.id)}
                        disabled={workingId === obligation.id}
                        className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {workingId === obligation.id ? "Saving..." : "Save edits"}
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold">
                        {obligation.label ?? "Unnamed block"}
                      </div>

                      <div className="mt-1 text-sm text-slate-300">
                        {dayLabel(obligation.day_of_week)} · {obligation.start_time}–{obligation.end_time}
                      </div>

                      <div
                        className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          obligation.active === false
                            ? "bg-slate-700 text-slate-300"
                            : "bg-green-600 text-white"
                        }`}
                      >
                        {obligation.active === false ? "Inactive" : "Active"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(obligation)}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleActive(obligation)}
                        disabled={workingId === obligation.id}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {obligation.active === false ? "Activate" : "Deactivate"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteObligation(obligation.id)}
                        disabled={workingId === obligation.id}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {workingId === obligation.id ? "Deleting..." : "Delete"}
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

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5 shadow">
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-slate-300">{label}</div>
    </div>
  );
}