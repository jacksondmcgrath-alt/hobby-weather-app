"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";

type AppEvent = {
  id: number;
  user_id: string | null;
  event_name: string | null;
  event_data: Record<string, unknown> | null;
  created_at: string | null;
};

export default function AnalyticsPage() {
  const { user, authLoading } = useUser();

  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setEvents([]);
      return;
    }

    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadEvents() {
    if (!user) return;

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("app_events")
      .select("id,user_id,event_name,event_data,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setEvents(data ?? []);
    setLoading(false);
  }

  const eventSummary = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const event of events) {
      const name = event.event_name ?? "unknown";
      counts[name] = (counts[name] ?? 0) + 1;
    }

    return Object.entries(counts)
      .map(([eventName, count]) => ({
        eventName,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

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
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in to view analytics.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <h1 className="text-3xl font-bold">App Analytics</h1>
        <p className="mt-2 text-slate-300">
          A simple view of your app actions. This helps understand what features are being used.
        </p>

        {loading && (
          <p className="mt-6 text-slate-300">Loading events...</p>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-lg bg-red-900/50 p-3 text-red-200">
            {errorMessage}
          </div>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-900 p-5 shadow">
            <div className="text-3xl font-bold">{events.length}</div>
            <div className="mt-1 text-sm text-slate-300">Recent events</div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-5 shadow">
            <div className="text-3xl font-bold">{eventSummary.length}</div>
            <div className="mt-1 text-sm text-slate-300">Event types</div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-5 shadow">
            <div className="text-3xl font-bold">
              {eventSummary[0]?.eventName ?? "N/A"}
            </div>
            <div className="mt-1 text-sm text-slate-300">Most common event</div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Events by Type</h2>

          {eventSummary.length === 0 ? (
            <p className="mt-4 text-slate-300">No events yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {eventSummary.map((item) => (
                <div
                  key={item.eventName}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 p-4"
                >
                  <div className="font-semibold">{item.eventName}</div>
                  <div className="rounded-full bg-blue-500 px-3 py-1 text-sm font-bold">
                    {item.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Recent Events</h2>

          <div className="mt-4 grid gap-3">
            {events.slice(0, 50).map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                <div className="font-semibold">
                  {event.event_name ?? "unknown"}
                </div>

                <div className="mt-1 text-sm text-slate-400">
                  {event.created_at ?? "unknown time"}
                </div>

                {event.event_data && (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                    {JSON.stringify(event.event_data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}