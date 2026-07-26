"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

type SavedLocation = {
  id: number;
  user_id: string | null;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  location_type: string | null;
  water_type: string | null;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");

  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationLatitude, setNewLocationLatitude] = useState("");
  const [newLocationLongitude, setNewLocationLongitude] = useState("");
  const [newLocationType, setNewLocationType] = useState("Other");
  const [newWaterType, setNewWaterType] = useState("Not applicable");
  const [savingLocation, setSavingLocation] = useState(false);
  const [saveLocationMessage, setSaveLocationMessage] = useState("");
  const [saveLocationError, setSaveLocationError] = useState("");

  useEffect(() => {
    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUser(session?.user ?? null);
      setAuthLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setLocations([]);
      return;
    }

    loadLocations();
  }, [user]);

  async function handleSaveLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSavingLocation(true);
    setSaveLocationMessage("");
    setSaveLocationError("");

    if (!user) {
      setSaveLocationError("You must be logged in to save a location.");
      setSavingLocation(false);
      return;
    }

    const latitudeNumber = Number(newLocationLatitude);
    const longitudeNumber = Number(newLocationLongitude);

    if (Number.isNaN(latitudeNumber) || Number.isNaN(longitudeNumber)) {
      setSaveLocationError("Latitude and longitude must be valid numbers.");
      setSavingLocation(false);
      return;
    }

    const { error } = await supabase
      .from("saved_locations")
      .insert({
        user_id: user.id,
        name: newLocationName,
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        location_type: newLocationType,
        water_type: newWaterType,
      });

    if (error) {
      setSaveLocationError(error.message);
      setSavingLocation(false);
      return;
    }

    setSaveLocationMessage("Location saved.");

    setNewLocationName("");
    setNewLocationLatitude("");
    setNewLocationLongitude("");
    setNewLocationType("Other");
    setNewWaterType("Not applicable");

    await loadLocations();

    setSavingLocation(false);
  }

  async function loadLocations() {
    setLocationsLoading(true);
    setLocationsError("");

    if (!user) {
      setLocations([]);
      setLocationsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("saved_locations")
      .select("id,user_id,name,latitude,longitude,location_type,water_type")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .limit(10);

    if (error) {
      setLocationsError(error.message);
      setLocationsLoading(false);
      return;
    }

    setLocations(data ?? []);
    setLocationsLoading(false);
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
    setUser(null);
    setLocations([]);
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

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <header>
          <h1 className="text-3xl font-bold">
            🌤️ Hobby Weather Planner
          </h1>

          <p className="mt-2 text-slate-300">
            Next.js prototype connected to Supabase Auth and your app data.
          </p>
        </header>

        {!user ? (
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
        ) : (
          <section className="mt-8 grid gap-6">
            <div className="rounded-2xl bg-slate-900 p-5 shadow">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    Logged in
                  </h2>
                  <p className="text-sm text-slate-300">
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
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-900 p-5 shadow">
              <h2 className="text-xl font-semibold">
                Add Saved Location
              </h2>

              <form onSubmit={handleSaveLocation} className="mt-4 grid gap-4">
                <label className="grid gap-1">
                  <span className="text-sm text-slate-300">Location name</span>
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={(event) => setNewLocationName(event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                    required
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-sm text-slate-300">Latitude</span>
                    <input
                      type="number"
                      step="any"
                      value={newLocationLatitude}
                      onChange={(event) => setNewLocationLatitude(event.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                      required
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm text-slate-300">Longitude</span>
                    <input
                      type="number"
                      step="any"
                      value={newLocationLongitude}
                      onChange={(event) => setNewLocationLongitude(event.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                      required
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-sm text-slate-300">Location type</span>
                    <select
                      value={newLocationType}
                      onChange={(event) => setNewLocationType(event.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                    >
                      <option>Home</option>
                      <option>Lake</option>
                      <option>River</option>
                      <option>Pond</option>
                      <option>Beach</option>
                      <option>Park</option>
                      <option>Disc Golf Course</option>
                      <option>Tennis Courts</option>
                      <option>Campground</option>
                      <option>Trail</option>
                      <option>Other</option>
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm text-slate-300">Water type</span>
                    <select
                      value={newWaterType}
                      onChange={(event) => setNewWaterType(event.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                    >
                      <option>Not applicable</option>
                      <option>Freshwater lake</option>
                      <option>River</option>
                      <option>Pond</option>
                      <option>Great Lake</option>
                      <option>Ocean/coastal</option>
                      <option>Unknown</option>
                    </select>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingLocation}
                  className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingLocation ? "Saving..." : "Save location"}
                </button>
              </form>

              {saveLocationMessage && (
                <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
                  {saveLocationMessage}
                </div>
              )}

              {saveLocationError && (
                <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
                  {saveLocationError}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-slate-900 p-5 shadow">
              <h2 className="text-xl font-semibold">
                Saved Locations Test
              </h2>

              {locationsLoading && (
                <p className="mt-4 text-slate-300">
                  Loading saved locations...
                </p>
              )}

              {locationsError && (
                <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
                  {locationsError}
                </div>
              )}

              {!locationsLoading &&
                !locationsError &&
                locations.length === 0 && (
                  <p className="mt-4 text-slate-300">
                    No saved locations found.
                  </p>
                )}

              <div className="mt-4 grid gap-3">
                {locations.map((location) => (
                  <div
                    key={location.id}
                    className="rounded-xl border border-slate-700 bg-slate-800 p-4"
                  >
                    <div className="text-lg font-semibold">
                      {location.name ?? "Unnamed location"}
                    </div>

                    <div className="mt-1 text-sm text-slate-300">
                      {location.location_type ?? "Unknown type"} ·{" "}
                      {location.water_type ?? "Unknown water type"}
                    </div>

                    <div className="mt-1 text-sm text-slate-400">
                      {location.latitude}, {location.longitude}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}