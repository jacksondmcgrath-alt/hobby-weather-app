"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { trackEvent } from "@/lib/trackEvent";
import { PageHeader, Card, StatusMessage } from "@/components/ui";

type ScenarioRating = {
  id: number;
  user_id: string | null;
  created_at: string | null;
  activity: string | null;
  rating: number | null;
  rating_0_to_100: number | null;
  notes: string | null;
  source: string | null;
  temperature: number | null;
  wind_speed: number | null;
  wind_gust: number | null;
  rain_chance: number | null;
  humidity: number | null;
  cloud_cover: number | null;
  pressure_change: number | null;
  bug_index: number | null;
  water_temp: number | null;
  storm_safety: number | null;
  dew_point: number | null;
  aqi: number | null;
  uv_index: number | null;
  rater_confidence: number | null;
  rater_experience_level: string | null;
  assume_safe_conditions: boolean | null;
};

type Scenario = {
  activity: string;
  [key: string]: string | number | boolean | null | object;
};

const ACTIVITY_SCENARIO_FIELDS: Record<string, string[]> = {
  Fishing: [
    "temperature",
    "wind_speed",
    "rain_chance",
    "pressure_change",
    "bug_index",
    "water_temp",
    "storm_safety",
  ],
  Camping: [
    "temperature",
    "wind_speed",
    "wind_gust",
    "rain_chance",
    "humidity",
    "bug_index",
    "storm_safety",
  ],
  Running: [
    "temperature",
    "wind_speed",
    "rain_chance",
    "dew_point",
    "aqi",
    "cloud_cover",
    "storm_safety",
  ],
  Kayaking: [
    "temperature",
    "wind_speed",
    "wind_gust",
    "rain_chance",
    "water_temp",
    "storm_safety",
  ],
  "Disc Golf": [
    "temperature",
    "wind_speed",
    "rain_chance",
    "bug_index",
    "cloud_cover",
    "storm_safety",
  ],
  Tennis: [
    "temperature",
    "wind_speed",
    "rain_chance",
    "cloud_cover",
    "storm_safety",
  ],
  "Beach Day": [
    "temperature",
    "wind_speed",
    "rain_chance",
    "cloud_cover",
    "water_temp",
    "uv_index",
    "storm_safety",
  ],
};

const SCENARIO_RANGES: Record<string, [number, number]> = {
  temperature: [25, 95],
  wind_speed: [0, 25],
  wind_gust: [0, 40],
  rain_chance: [0, 100],
  humidity: [25, 100],
  cloud_cover: [0, 100],
  pressure_change: [-12, 12],
  bug_index: [0, 100],
  water_temp: [35, 85],
  storm_safety: [20, 100],
  dew_point: [30, 75],
  aqi: [0, 160],
  uv_index: [0, 10],
};

const PRETTY_NAMES: Record<string, string> = {
  temperature: "Temperature °F",
  wind_speed: "Wind speed mph",
  wind_gust: "Wind gust mph",
  rain_chance: "Rain chance %",
  humidity: "Humidity %",
  cloud_cover: "Cloud cover %",
  pressure_change: "Pressure change",
  bug_index: "Bug index",
  water_temp: "Water temp °F",
  storm_safety: "Storm safety",
  dew_point: "Dew point °F",
  aqi: "AQI",
  uv_index: "UV index",
};

const ACTIVITY_OPTIONS = Object.keys(ACTIVITY_SCENARIO_FIELDS);

const EXPERIENCE_OPTIONS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Expert",
  "Not sure",
];

function randomNumber(min: number, max: number, decimals = 0) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

function seasonFromMonth(month: number) {
  if ([12, 1, 2].includes(month)) return "Winter";
  if ([3, 4, 5].includes(month)) return "Spring";
  if ([6, 7, 8].includes(month)) return "Summer";
  return "Fall";
}

function generateAdvancedFeatures() {
  const month = Math.round(randomNumber(1, 12));

  return {
    visibility: randomNumber(0.5, 10, 1),
    wind_direction: Math.round(randomNumber(0, 359)),
    rain_amount: randomNumber(0, 1.5, 2),
    recent_rain_24h: randomNumber(0, 1.5, 2),
    recent_rain_72h: randomNumber(0, 3.0, 2),
    overnight_low: randomNumber(20, 75, 1),
    month,
    season: seasonFromMonth(month),
    daylight_hours: randomNumber(8, 16, 1),
    moon_phase: randomNumber(0, 1, 2),
    moon_illumination: Math.round(randomNumber(0, 100)),
    pollen_index: randomNumber(0, 12, 1),
    river_flow_cfs: Math.round(randomNumber(50, 5000)),
    gauge_height: randomNumber(1, 15, 1),
    flow_trend: randomNumber(-3, 3, 1),
    wave_height_ft: randomNumber(0, 8, 1),
    rip_current_risk: randomNumber(0, 10, 1),
    fire_danger: randomNumber(0, 10, 1),
    water_quality_alert: null,
  };
}

function generateScenario(activity: string): Scenario {
  const fields = ACTIVITY_SCENARIO_FIELDS[activity] ?? [];

  const scenario: Scenario = {
    activity,
  };

  for (const field of fields) {
    const [min, max] = SCENARIO_RANGES[field];

    const decimalFields = [
      "temperature",
      "wind_speed",
      "wind_gust",
      "water_temp",
      "dew_point",
      "pressure_change",
      "uv_index",
    ];

    scenario[field] = decimalFields.includes(field)
      ? randomNumber(min, max, 1)
      : Math.round(randomNumber(min, max));
  }

  const advancedFeatures = generateAdvancedFeatures();

  scenario.advanced_features = advancedFeatures;
  scenario.location_context = {};
  scenario.model_features_version = "nextjs_scenario_v1";
  scenario.scenario_generation_method = "nextjs_random_scenario_v1";

  return scenario;
}

function shownFeaturesForScenario(activity: string) {
  return ACTIVITY_SCENARIO_FIELDS[activity] ?? [];
}

function hiddenFeaturesForScenario(scenario: Scenario, shownFeatures: string[]) {
  const ignoredKeys = new Set([
    "activity",
    "advanced_features",
    "location_context",
    "model_features_version",
    "scenario_generation_method",
  ]);

  return Object.keys(scenario).filter(
    (key) => !ignoredKeys.has(key) && !shownFeatures.includes(key)
  );
}

function describeScenarioRating(item: ScenarioRating) {
  const parts: string[] = [];

  if (item.temperature !== null) parts.push(`temp ${item.temperature}°F`);
  if (item.wind_speed !== null) parts.push(`wind ${item.wind_speed} mph`);
  if (item.wind_gust !== null) parts.push(`gust ${item.wind_gust} mph`);
  if (item.rain_chance !== null) parts.push(`rain ${item.rain_chance}%`);
  if (item.water_temp !== null) parts.push(`water ${item.water_temp}°F`);
  if (item.bug_index !== null) parts.push(`bugs ${item.bug_index}`);
  if (item.storm_safety !== null) parts.push(`storm ${item.storm_safety}`);

  return parts.join(" · ");
}

export default function ScenariosPage() {
  const { user, authLoading } = useUser();

  const [ratings, setRatings] = useState<ScenarioRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [ratingsError, setRatingsError] = useState("");

  const [activity, setActivity] = useState("Running");
  const [scenario, setScenario] = useState<Scenario>(() =>
    generateScenario("Running")
  );

  const [rating, setRating] = useState(5);
  const [confidence, setConfidence] = useState(7);
  const [experienceLevel, setExperienceLevel] = useState("Intermediate");
  const [assumeSafeConditions, setAssumeSafeConditions] = useState(true);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editConfidence, setEditConfidence] = useState(7);
  const [editExperienceLevel, setEditExperienceLevel] = useState("Not sure");
  const [editAssumeSafeConditions, setEditAssumeSafeConditions] =
    useState(true);
  const [editNotes, setEditNotes] = useState("");

  const [workingId, setWorkingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");

  const totalScenarioRatings = ratings.length;

  const ratingsWithValues = ratings.filter((item) => item.rating !== null);

  const averageScenarioRating =
    ratingsWithValues.length > 0
      ? (
          ratingsWithValues.reduce((sum, item) => sum + (item.rating ?? 0), 0) /
          ratingsWithValues.length
        ).toFixed(1)
      : "N/A";

  const ratingsWithConfidence = ratings.filter(
    (item) => item.rater_confidence !== null
  );

  const averageScenarioConfidence =
    ratingsWithConfidence.length > 0
      ? (
          ratingsWithConfidence.reduce(
            (sum, item) => sum + (item.rater_confidence ?? 0),
            0
          ) / ratingsWithConfidence.length
        ).toFixed(1)
      : "N/A";

  const scenarioSummaryByActivity = ACTIVITY_OPTIONS.map((activityOption) => {
    const activityRatings = ratings.filter(
      (item) => item.activity === activityOption
    );

    const count = activityRatings.length;

    const averageRating =
      count > 0
        ? (
            activityRatings.reduce(
              (sum, item) => sum + (item.rating ?? 0),
              0
            ) / count
          ).toFixed(1)
        : "N/A";

    const goal = 25;
    const progress = Math.min(count / goal, 1);

    return {
      activity: activityOption,
      count,
      averageRating,
      goal,
      progress,
    };
  });

  useEffect(() => {
    setScenario(generateScenario(activity));
  }, [activity]);

  useEffect(() => {
    if (!user) {
      setRatings([]);
      return;
    }

    loadRatings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const scenarioRows = useMemo(() => {
    const fields = shownFeaturesForScenario(activity);

    return fields.map((field) => ({
      factor: PRETTY_NAMES[field] ?? field,
      value: scenario[field] ?? "N/A",
    }));
  }, [activity, scenario]);

  async function loadRatings() {
    if (!user) return;

    setRatingsLoading(true);
    setRatingsError("");

    const { data, error } = await supabase
      .from("scenario_ratings")
      .select(
        [
          "id",
          "user_id",
          "created_at",
          "activity",
          "rating",
          "rating_0_to_100",
          "notes",
          "source",
          "temperature",
          "wind_speed",
          "wind_gust",
          "rain_chance",
          "humidity",
          "cloud_cover",
          "pressure_change",
          "bug_index",
          "water_temp",
          "storm_safety",
          "dew_point",
          "aqi",
          "uv_index",
          "rater_confidence",
          "rater_experience_level",
          "assume_safe_conditions",
        ].join(",")
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setRatingsError(error.message);
      setRatingsLoading(false);
      return;
    }

    setRatings((data ?? []) as unknown as ScenarioRating[]);
    setRatingsLoading(false);
  }

  async function handleSaveScenarioRating(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    if (!user) {
      setSaveError("You must be logged in to save a scenario rating.");
      setSaving(false);
      return;
    }

    const shownFeatures = shownFeaturesForScenario(activity);
    const hiddenFeatures = hiddenFeaturesForScenario(scenario, shownFeatures);

    const row = {
      user_id: user.id,
      activity,
      rating,
      rating_0_to_100: rating * 10,
      notes,
      scenario_json: scenario,
      source: "nextjs_random_scenario_v1",

      temperature: scenario.temperature ?? null,
      wind_speed: scenario.wind_speed ?? null,
      wind_gust: scenario.wind_gust ?? null,
      rain_chance: scenario.rain_chance ?? null,
      humidity: scenario.humidity ?? null,
      cloud_cover: scenario.cloud_cover ?? null,
      pressure_change: scenario.pressure_change ?? null,
      bug_index: scenario.bug_index ?? null,
      water_temp: scenario.water_temp ?? null,
      storm_safety: scenario.storm_safety ?? null,
      dew_point: scenario.dew_point ?? null,
      aqi: scenario.aqi ?? null,
      uv_index: scenario.uv_index ?? null,

      advanced_features: scenario.advanced_features ?? {},
      location_context: scenario.location_context ?? {},
      shown_features: shownFeatures,
      hidden_features: hiddenFeatures,
      scenario_mode: "basic",
      scenario_generation_method: "nextjs_random_scenario_v1",
      model_features_version: "nextjs_scenario_v1",
      rating_question: "How good does this scenario sound?",
      rating_scale_min: 1,
      rating_scale_max: 10,
      rating_target: "expected_enjoyment",
      rater_confidence: confidence,
      rater_experience_level: experienceLevel,
      assume_safe_conditions: assumeSafeConditions,
    };

    const { error } = await supabase.from("scenario_ratings").insert(row);

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    await trackEvent(user.id, "scenario_rating_created", {
      activity,
      rating,
      confidence,
      source: "nextjs_random_scenario_v1",
    });

    setSaveMessage("Scenario rating saved.");
    setScenario(generateScenario(activity));
    setRating(5);
    setConfidence(7);
    setNotes("");

    await loadRatings();

    setSaving(false);
  }

  function startEditing(item: ScenarioRating) {
    setEditingId(item.id);
    setEditRating(item.rating ?? 5);
    setEditConfidence(item.rater_confidence ?? 7);
    setEditExperienceLevel(item.rater_experience_level ?? "Not sure");
    setEditAssumeSafeConditions(item.assume_safe_conditions ?? true);
    setEditNotes(item.notes ?? "");
    setEditMessage("");
    setEditError("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditRating(5);
    setEditConfidence(7);
    setEditExperienceLevel("Not sure");
    setEditAssumeSafeConditions(true);
    setEditNotes("");
    setEditMessage("");
    setEditError("");
  }

  async function saveScenarioEdits(item: ScenarioRating) {
    if (!user) return;

    setWorkingId(item.id);
    setEditMessage("");
    setEditError("");

    const { error } = await supabase
      .from("scenario_ratings")
      .update({
        rating: editRating,
        rating_0_to_100: editRating * 10,
        notes: editNotes,
        rater_confidence: editConfidence,
        rater_experience_level: editExperienceLevel,
        assume_safe_conditions: editAssumeSafeConditions,
      })
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (error) {
      setEditError(error.message);
      setWorkingId(null);
      return;
    }

    await trackEvent(user.id, "scenario_rating_updated", {
      scenario_rating_id: item.id,
      rating: editRating,
      confidence: editConfidence,
    });

    setEditMessage("Scenario rating updated.");
    setEditingId(null);

    await loadRatings();

    setWorkingId(null);
  }

  async function deleteScenarioRating(itemId: number) {
    if (!user) return;

    const confirmed = window.confirm(
      "Delete this scenario rating? This cannot be undone."
    );

    if (!confirmed) return;

    setWorkingId(itemId);
    setEditMessage("");
    setEditError("");

    const { error } = await supabase
      .from("scenario_ratings")
      .delete()
      .eq("id", itemId)
      .eq("user_id", user.id);

    if (error) {
      setEditError(error.message);
      setWorkingId(null);
      return;
    }

    await trackEvent(user.id, "scenario_rating_deleted", {
      scenario_rating_id: itemId,
    });

    await loadRatings();

    setWorkingId(null);
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <>
        <PageHeader title="Scenarios" />

        <Card className="mt-6">
          <p className="text-slate-300">
            Please log in on the Home page to rate scenarios.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Scenarios"
        description="Rate hypothetical activity conditions to help train future scoring models."
      />

      <Card className="mt-8">
        <h2 className="text-xl font-semibold">Scenario Insights</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-800 p-4">
            <div className="text-3xl font-bold">{totalScenarioRatings}</div>
            <div className="text-sm text-slate-300">Total ratings</div>
          </div>

          <div className="rounded-xl bg-slate-800 p-4">
            <div className="text-3xl font-bold">{averageScenarioRating}</div>
            <div className="text-sm text-slate-300">Average rating</div>
          </div>

          <div className="rounded-xl bg-slate-800 p-4">
            <div className="text-3xl font-bold">{averageScenarioConfidence}</div>
            <div className="text-sm text-slate-300">Average confidence</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {scenarioSummaryByActivity.map((item) => (
            <div key={item.activity}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{item.activity}</span>
                <span className="text-slate-300">
                  {item.count}/{item.goal} · avg {item.averageRating}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{
                    width: `${Math.round(item.progress * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-8">
        <h2 className="text-xl font-semibold">Rate a Scenario</h2>

        <form onSubmit={handleSaveScenarioRating} className="mt-4 grid gap-5">
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

          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold">Scenario</h3>

              <button
                type="button"
                onClick={() => setScenario(generateScenario(activity))}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Generate new scenario
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {scenarioRows.map((row) => (
                <div
                  key={row.factor}
                  className="flex justify-between rounded-lg bg-slate-900 px-3 py-2 text-sm"
                >
                  <span className="text-slate-300">{row.factor}</span>
                  <span className="font-semibold text-white">
                    {String(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <label className="grid gap-2">
            <span className="text-sm text-slate-300">
              Rating: {rating}/10
            </span>
            <input
              type="range"
              min={1}
              max={10}
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm text-slate-300">
              Confidence: {confidence}/10
            </span>
            <input
              type="range"
              min={1}
              max={10}
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-slate-300">Experience level</span>
            <select
              value={experienceLevel}
              onChange={(event) => setExperienceLevel(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            >
              {EXPERIENCE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
            <input
              type="checkbox"
              checked={assumeSafeConditions}
              onChange={(event) =>
                setAssumeSafeConditions(event.target.checked)
              }
            />
            <span className="text-sm text-slate-300">
              Assume normal safety precautions are taken
            </span>
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-slate-300">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Example: Wind seems too high, or this looks ideal."
              className="min-h-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save scenario rating"}
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
        <h2 className="text-xl font-semibold">Your Scenario Ratings</h2>

        {ratingsLoading && (
          <p className="mt-4 text-slate-300">
            Loading scenario ratings...
          </p>
        )}

        {ratingsError && (
          <StatusMessage type="error">
            {ratingsError}
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

        {!ratingsLoading && !ratingsError && ratings.length === 0 && (
          <p className="mt-4 text-slate-300">
            No scenario ratings yet.
          </p>
        )}

        <div className="mt-4 grid gap-3">
          {ratings.slice(0, 25).map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-700 bg-slate-800 p-4"
            >
              {editingId === item.id ? (
                <div className="grid gap-4">
                  <div className="text-lg font-semibold">
                    Editing {item.activity ?? "Unknown activity"}
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm text-slate-300">
                      Rating: {editRating}/10
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={editRating}
                      onChange={(event) =>
                        setEditRating(Number(event.target.value))
                      }
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm text-slate-300">
                      Confidence: {editConfidence}/10
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={editConfidence}
                      onChange={(event) =>
                        setEditConfidence(Number(event.target.value))
                      }
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm text-slate-300">
                      Experience level
                    </span>
                    <select
                      value={editExperienceLevel}
                      onChange={(event) =>
                        setEditExperienceLevel(event.target.value)
                      }
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
                    >
                      {EXPERIENCE_OPTIONS.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
                    <input
                      type="checkbox"
                      checked={editAssumeSafeConditions}
                      onChange={(event) =>
                        setEditAssumeSafeConditions(event.target.checked)
                      }
                    />
                    <span className="text-sm text-slate-300">
                      Assume normal safety precautions are taken
                    </span>
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
                      onClick={() => saveScenarioEdits(item)}
                      disabled={workingId === item.id}
                      className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {workingId === item.id ? "Saving..." : "Save edits"}
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
                      {item.activity ?? "Unknown activity"}
                    </div>

                    <div className="mt-1 text-sm text-slate-300">
                      {item.source ?? "unknown source"} · confidence{" "}
                      {item.rater_confidence ?? "?"}/10
                    </div>

                    <div className="mt-2 text-sm text-slate-400">
                      {describeScenarioRating(item)}
                    </div>

                    {item.notes && (
                      <p className="mt-3 text-sm text-slate-300">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="rounded-full bg-blue-500 px-3 py-1 text-center text-sm font-bold">
                      {item.rating ?? "?"}/10
                    </div>

                    <button
                      type="button"
                      onClick={() => startEditing(item)}
                      className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteScenarioRating(item.id)}
                      disabled={workingId === item.id}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {workingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}