"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";
import { ACTIVITY_OPTIONS } from "@/lib/activityMeta";

type SavedLocation = {
  id: number;
  name: string | null;
  location_type: string | null;
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

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setLocations([]);
      setDefaults([]);
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadData() {
    if (!user) return;

    setLoading(true);
    setErrorMessage("");

    const { data: locationData, error: locationError } = await supabase
      .from("saved_locations")
      .select("id,name,location_type")
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

    setLocations(locationData ?? []);
    setDefaults(defaultData ?? []);
    setLoading(false);
  }

  function getDefaultLocationId(activity: string) {
    const match = defaults.find((item) => item.activity === activity);
    return match?.saved_location_id ?? "";
  }

  async function saveDefault(activity: string, savedLocationId: string) {
    if (!user) return;

    setMessage("");
    setErrorMessage("");

    if (savedLocationId === "") {
      const { error } = await supabase
        .from("activity_location_defaults")
        .delete()
        .eq("user_id", user.id)
        .eq("activity", activity);

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setMessage(`Removed default location for ${activity}.`);
      await loadData();
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
      return;
    }

    setMessage(`Saved default location for ${activity}.`);
    await loadData();
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

        <h1 className="text-3xl font-bold">Activity Defaults</h1>
        <p className="mt-2 text-slate-300">
          Choose which saved location should be used by default for each activity.
        </p>

        {loading && (
          <p className="mt-6 text-slate-300">Loading defaults...</p>
        )}

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

        {locations.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-slate-900 p-5 text-slate-300">
            Add saved locations first before setting activity defaults.
          </div>
        ) : (
          <section className="mt-8 grid gap-3">
            {ACTIVITY_OPTIONS.map((activity) => {
              const currentValue = getDefaultLocationId(activity);

              return (
                <div
                  key={activity}
                  className="rounded-xl border border-slate-700 bg-slate-900 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
                    <div className="font-semibold">{activity}</div>

                    <select
                      defaultValue={String(currentValue)}
                      id={`default-${activity}`}
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

                    <button
                      type="button"
                      onClick={() => {
                        const selectElement = document.getElementById(
                          `default-${activity}`
                        ) as HTMLSelectElement | null;

                        saveDefault(activity, selectElement?.value ?? "");
                      }}
                      className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"
                    >
                      Save
                    </button>
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