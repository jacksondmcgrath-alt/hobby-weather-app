"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";
import { ACTIVITY_OPTIONS, activityLabel } from "@/lib/activityMeta";

type SavedLocation = {
  id: number;
  name: string | null;
  location_type: string | null;
  water_type: string | null;
};

type ActivityDefault = {
  id: number;
  user_id: string | null;
  activity: string | null;
  saved_location_id: number | null;
};

export default function ActivityDefaultsPage() {
  const { user, authLoading } = useUser();

  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [defaults, setDefaults] = useState<ActivityDefault[]>([]);

  const [selectedDefaults, setSelectedDefaults] = useState<Record<string, string>>(
    {}
  );

  const [loading, setLoading] = useState(false);
  const [workingActivity, setWorkingActivity] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setLocations([]);
      setDefaults([]);
      setSelectedDefaults({});
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const configuredCount = useMemo(() => {
    return ACTIVITY_OPTIONS.filter((activity) => {
      const value = selectedDefaults[activity];
      return value !== undefined && value !== "";
    }).length;
  }, [selectedDefaults]);

  const missingCount = ACTIVITY_OPTIONS.length - configuredCount;

  async function loadData() {
    if (!user) return;

    setLoading(true);
    setErrorMessage("");

    const { data: locationData, error: locationError } = await supabase
      .from("saved_locations")
      .select("id,name,location_type,water_type")
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (locationError) {
      setErrorMessage(locationError.message);
      setLoading(false);
      return;
    }

    const { data: defaultData, error: defaultError } = await supabase
      .from("activity_location_defaults")
      .select("id,user_id,activity,saved_location_id")
      .eq("user_id", user.id);

    if (defaultError) {
      setErrorMessage(defaultError.message);
      setLoading(false);
      return;
    }

    const loadedLocations = locationData ?? [];
    const loadedDefaults = defaultData ?? [];

    setLocations(loadedLocations);
    setDefaults(loadedDefaults);

    const defaultMap: Record<string, string> = {};

    for (const activity of ACTIVITY_OPTIONS) {
      const match = loadedDefaults.find(
        (item) => item.activity === activity
      );

      defaultMap[activity] =
        match?.saved_location_id !== null &&
        match?.saved_location_id !== undefined
          ? String(match.saved_location_id)
          : "";
    }

    setSelectedDefaults(defaultMap);

    setLoading(false);
  }

  function getLocationLabel(locationId: string) {
    if (locationId === "") return "No default";

    const location = locations.find(
      (item) => String(item.id) === String(locationId)
    );

    if (!location) return "Unknown location";

    return `${location.name ?? "Unnamed location"} (${location.location_type ?? "Location"})`;
  }

  function updateSelectedDefault(activity: string, locationId: string) {
    setSelectedDefaults((current) => ({
      ...current,
      [activity]: locationId,
    }));
  }

  async function saveDefault(activity: string) {
    if (!user) return;

    setWorkingActivity(activity);
    setMessage("");
    setErrorMessage("");

    const savedLocationId = selectedDefaults[activity] ?? "";

    if (savedLocationId === "") {
      const { error } = await supabase
        .from("activity_location_defaults")
        .delete()
        .eq("user_id", user.id)
        .eq("activity", activity);

      if (error) {
        setErrorMessage(error.message);
        setWorkingActivity(null);
        return;
      }

      setMessage(`Removed default location for ${activity}.`);
      await loadData();
      setWorkingActivity(null);
      return;
    }

    const { error } = await supabase
      .from("activity_location_defaults")
      .upsert(
        {
          user_id: user.id,
          activity,
          saved_location_id: Number(savedLocationId),
        },
        {
          onConflict: "user_id,activity",
        }
      );

    if (error) {
      setErrorMessage(error.message);
      setWorkingActivity(null);
      return;
    }

    setMessage(`Saved default location for ${activity}.`);
    await loadData();
    setWorkingActivity(null);
  }

  async function clearDefault(activity: string) {
    if (!user) return;

    setWorkingActivity(activity);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("activity_location_defaults")
      .delete()
      .eq("user_id", user.id)
      .eq("activity", activity);

    if (error) {
      setErrorMessage(error.message);
      setWorkingActivity(null);
      return;
    }

    updateSelectedDefault(activity, "");
    setMessage(`Cleared default location for ${activity}.`);

    await loadData();
    setWorkingActivity(null);
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
          <h1 className="text-3xl font-bold">Activity Defaults</h1>
          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in to manage activity defaults.
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
          <h1 className="text-3xl font-bold">Activity Defaults</h1>
          <p className="mt-2 text-slate-300">
            Choose which saved location should be used by default for each activity.
          </p>
        </header>

        {message && (
          <div className="mt-6 rounded-lg bg-green-900/50 p-3 text-green-200">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-lg bg-red-900/50 p-3 text-red-200">
            {errorMessage}
          </div>
        )}

        {loading && (
          <p className="mt-6 text-slate-300">Loading activity defaults...</p>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Activities"
            value={ACTIVITY_OPTIONS.length}
          />

          <SummaryCard
            label="Configured"
            value={configuredCount}
          />

          <SummaryCard
            label="Missing"
            value={missingCount}
          />
        </section>

        {locations.length === 0 ? (
          <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
            <h2 className="text-xl font-semibold">No saved locations yet</h2>
            <p className="mt-2 text-slate-300">
              Add saved locations before setting defaults.
            </p>

            <a
              href="/locations"
              className="mt-4 inline-block rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400"
            >
              Add locations
            </a>
          </section>
        ) : (
          <section className="mt-8 grid gap-4">
            {ACTIVITY_OPTIONS.map((activity) => {
              const selectedLocationId = selectedDefaults[activity] ?? "";
              const hasDefault = selectedLocationId !== "";

              return (
                <div
                  key={activity}
                  className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {activityLabel(activity)}
                      </h2>

                      <p className="mt-1 text-sm text-slate-300">
                        Current default:{" "}
                        <span className="font-semibold text-white">
                          {getLocationLabel(selectedLocationId)}
                        </span>
                      </p>

                      <div
                        className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          hasDefault
                            ? "bg-green-600 text-white"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {hasDefault ? "Configured" : "No default"}
                      </div>
                    </div>

                    <div className="grid w-full gap-3 sm:max-w-md">
                      <label className="grid gap-1">
                        <span className="text-sm text-slate-300">
                          Default location
                        </span>

                        <select
                          value={selectedLocationId}
                          onChange={(event) =>
                            updateSelectedDefault(activity, event.target.value)
                          }
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                        >
                          <option value="">No default</option>

                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name ?? "Unnamed location"}{" "}
                              ({location.location_type ?? "Location"})
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveDefault(activity)}
                          disabled={workingActivity === activity}
                          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {workingActivity === activity ? "Saving..." : "Save"}
                        </button>

                        <button
                          type="button"
                          onClick={() => clearDefault(activity)}
                          disabled={workingActivity === activity}
                          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}
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