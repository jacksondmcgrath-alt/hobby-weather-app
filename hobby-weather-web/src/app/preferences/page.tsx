"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";
import { trackEvent } from "@/lib/trackEvent";

type PreferenceSettings = {
  bug_tolerance: number;
  rain_caution: number;
  fishing_bug_boost: number;
  fishing_wind_tolerance: number;
  camping_bug_sensitivity: number;
  running_wind_sensitivity: number;
  running_heat_sensitivity: number;
  kayaking_wind_caution: number;
  disc_golf_wind_sensitivity: number;
};

const DEFAULT_PREFERENCES: PreferenceSettings = {
  bug_tolerance: 5,
  rain_caution: 6,
  fishing_bug_boost: 6,
  fishing_wind_tolerance: 6,
  camping_bug_sensitivity: 8,
  running_wind_sensitivity: 6,
  running_heat_sensitivity: 7,
  kayaking_wind_caution: 8,
  disc_golf_wind_sensitivity: 6,
};

type PreferenceRow = {
  id: number;
  user_id: string | null;
  settings: PreferenceSettings | null;
};

export default function PreferencesPage() {
  const { user, authLoading } = useUser();

  const [preferences, setPreferences] = useState<PreferenceSettings>(
    DEFAULT_PREFERENCES
  );

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      return;
    }

    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadPreferences() {
    if (!user) {
      return;
    }

    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("app_preferences")
      .select("id,user_id,settings")
      .eq("user_id", user.id)
      .limit(1);

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as PreferenceRow[];

    if (rows.length > 0 && rows[0].settings) {
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...rows[0].settings,
      });
    } else {
      setPreferences(DEFAULT_PREFERENCES);
    }

    setLoading(false);
  }

  function updatePreference(
    key: keyof PreferenceSettings,
    value: number
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function savePreferences() {
    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    if (!user) {
      setSaveError("You must be logged in to save preferences.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("app_preferences")
      .upsert(
        {
          user_id: user.id,
          settings: preferences,
        },
        {
          onConflict: "user_id",
        }
      );

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    await trackEvent(user.id, "preferences_saved", {
      preferences,
    });

    setSaveMessage("Preferences saved.");
    setSaving(false);
  }

  async function resetPreferences() {
    setPreferences(DEFAULT_PREFERENCES);
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
          <h1 className="text-3xl font-bold">Preferences</h1>
          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in on the Home page to manage preferences.
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
          <h1 className="text-3xl font-bold">Preferences</h1>
          <p className="mt-2 text-slate-300">
            Tune how the app should think about your outdoor activities.
          </p>
        </header>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Scoring Preferences</h2>

          {loading && (
            <p className="mt-4 text-slate-300">Loading preferences...</p>
          )}

          {loadError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {loadError}
            </div>
          )}

          <div className="mt-6 grid gap-6">
            <PreferenceSlider
              label="General bug tolerance"
              help="0 = I hate bugs, 10 = bugs do not bother me much"
              value={preferences.bug_tolerance}
              onChange={(value) => updatePreference("bug_tolerance", value)}
            />

            <PreferenceSlider
              label="Rain caution"
              help="0 = rain does not bother me, 10 = avoid rain strongly"
              value={preferences.rain_caution}
              onChange={(value) => updatePreference("rain_caution", value)}
            />

            <PreferenceSlider
              label="Fishing insect activity importance"
              help="Higher means bug/insect activity helps fishing more"
              value={preferences.fishing_bug_boost}
              onChange={(value) => updatePreference("fishing_bug_boost", value)}
            />

            <PreferenceSlider
              label="Fishing wind tolerance"
              help="Higher means you are more okay with wind while fishing"
              value={preferences.fishing_wind_tolerance}
              onChange={(value) => updatePreference("fishing_wind_tolerance", value)}
            />

            <PreferenceSlider
              label="Camping bug sensitivity"
              help="Higher means bugs hurt camping scores more"
              value={preferences.camping_bug_sensitivity}
              onChange={(value) => updatePreference("camping_bug_sensitivity", value)}
            />

            <PreferenceSlider
              label="Running wind sensitivity"
              help="Higher means wind hurts running scores more"
              value={preferences.running_wind_sensitivity}
              onChange={(value) => updatePreference("running_wind_sensitivity", value)}
            />

            <PreferenceSlider
              label="Running heat sensitivity"
              help="Higher means warm weather hurts running scores more"
              value={preferences.running_heat_sensitivity}
              onChange={(value) => updatePreference("running_heat_sensitivity", value)}
            />

            <PreferenceSlider
              label="Kayaking wind caution"
              help="Higher means wind/gusts hurt kayaking scores more"
              value={preferences.kayaking_wind_caution}
              onChange={(value) => updatePreference("kayaking_wind_caution", value)}
            />

            <PreferenceSlider
              label="Disc golf wind sensitivity"
              help="Higher means wind hurts disc golf scores more"
              value={preferences.disc_golf_wind_sensitivity}
              onChange={(value) => updatePreference("disc_golf_wind_sensitivity", value)}
            />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={savePreferences}
              disabled={saving}
              className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save preferences"}
            </button>

            <button
              type="button"
              onClick={resetPreferences}
              className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white hover:bg-slate-600"
            >
              Reset to defaults
            </button>
          </div>

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
      </div>
    </main>
  );
}

function PreferenceSlider({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{label}</div>
          <div className="text-sm text-slate-400">{help}</div>
        </div>

        <div className="rounded-full bg-blue-500 px-3 py-1 text-sm font-bold">
          {value}/10
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}