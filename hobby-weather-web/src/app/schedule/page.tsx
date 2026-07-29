"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!user) {
      setObligations([]);
      return;
    }

    loadObligations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadObligations() {
    if (!user) return;

    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("weekly_obligations")
      .select("id,user_id,label,day_of_week,start_time,end_time,active")
      .eq("user_id", user.id)
      .order("day_of_week", { ascending: true });

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

  async function deleteObligation(id: number) {
    if (!user) return;

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

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Add Unavailable Time</h2>

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
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">
                      {obligation.label ?? "Unnamed block"}
                    </div>

                    <div className="mt-1 text-sm text-slate-300">
                      {dayLabel(obligation.day_of_week)} · {obligation.start_time}–{obligation.end_time}
                    </div>
                  </div>

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
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}