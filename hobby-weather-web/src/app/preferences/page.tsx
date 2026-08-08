"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { trackEvent } from "@/lib/trackEvent";
import {
  ACTIVITY_META,
  ACTIVITY_OPTIONS,
  DEFAULT_ENABLED_ACTIVITIES,
  activitiesByCategory,
  activityLabel,
} from "@/lib/activityMeta";
import {
  ACTIVITY_PREFERENCE_DEFINITIONS,
  CORE_PREFERENCE_DEFINITIONS,
  DEFAULT_NUMERIC_PREFERENCES,
  activityPreferenceIsVisible,
  groupedPreferenceDefinitions,
  type PreferenceKey,
} from "@/lib/preferences/preferenceDefinitions";
import { triggerPredictionGeneration } from "@/lib/triggerPredictionGeneration";
import { buildPreferenceSuggestions } from "@/lib/preferenceSuggestions";
import {
  PageHeader,
  Card,
  StatusMessage,
  SectionTitle,
  Badge,
  Button,
} from "@/components/ui";

type PreferenceSettings = Record<PreferenceKey, number> & {
  enabled_activities: string[];
};

const DEFAULT_PREFERENCES: PreferenceSettings = {
  ...DEFAULT_NUMERIC_PREFERENCES,
  enabled_activities: DEFAULT_ENABLED_ACTIVITIES,
};

type PreferenceRow = {
  id: number;
  user_id: string | null;
  settings: Partial<PreferenceSettings> | null;
};

type PreferenceSuggestion = ReturnType<typeof buildPreferenceSuggestions>[number];

export default function PreferencesPage() {
  const { user, authLoading } = useUser();

  const [preferences, setPreferences] =
    useState<PreferenceSettings>(DEFAULT_PREFERENCES);

  const [preferencesView, setPreferencesView] = useState<
    "core" | "activity" | "activities"
  >("core");

  const [showAllActivityTuning, setShowAllActivityTuning] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [suggestions, setSuggestions] = useState<PreferenceSuggestion[]>([]);

  const activityGroups = useMemo(() => activitiesByCategory(), []);

  const coreGroups = useMemo(
    () => groupedPreferenceDefinitions(CORE_PREFERENCE_DEFINITIONS),
    []
  );

  const visibleActivityDefinitions = useMemo(() => {
    return ACTIVITY_PREFERENCE_DEFINITIONS.filter((definition) =>
      activityPreferenceIsVisible({
        definition,
        enabledActivities: preferences.enabled_activities,
        showAll: showAllActivityTuning,
      })
    );
  }, [preferences.enabled_activities, showAllActivityTuning]);

  const activityTuningGroups = useMemo(
    () => groupedPreferenceDefinitions(visibleActivityDefinitions),
    [visibleActivityDefinitions]
  );

  useEffect(() => {
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      setSuggestions([]);
      return;
    }

    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadPreferenceSuggestions(
    currentPreferences: PreferenceSettings
  ) {
    if (!user) return;

    const { data: logsData, error: logsError } = await supabase
      .from("activity_logs")
      .select(
        "id,date,activity,predicted_score,actual_score_0_to_100,prediction_error"
      )
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false })
      .limit(100);

    if (logsError) {
      console.warn("Could not load logs for suggestions:", logsError.message);
      return;
    }

    const { data: predictionsData, error: predictionsError } = await supabase
      .from("user_predictions")
      .select("date,activity,weather_snapshot")
      .eq("user_id", user.id);

    if (predictionsError) {
      console.warn(
        "Could not load predictions for suggestions:",
        predictionsError.message
      );
      return;
    }

    const nextSuggestions = buildPreferenceSuggestions({
      logs: (logsData ?? []) as any[],
      predictions: (predictionsData ?? []) as any[],
      preferences: currentPreferences,
    });

    setSuggestions(nextSuggestions);
  }

  async function loadPreferences() {
    if (!user) return;

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

    const rows = (data ?? []) as unknown as PreferenceRow[];

    let nextPreferences: PreferenceSettings;

    if (rows.length > 0 && rows[0].settings) {
      const merged = {
        ...DEFAULT_PREFERENCES,
        ...rows[0].settings,
      } as PreferenceSettings;

      merged.enabled_activities = Array.isArray(merged.enabled_activities)
        ? merged.enabled_activities.filter((activity) =>
            ACTIVITY_OPTIONS.includes(activity)
          )
        : DEFAULT_ENABLED_ACTIVITIES;

      if (merged.enabled_activities.length === 0) {
        merged.enabled_activities = DEFAULT_ENABLED_ACTIVITIES;
      }

      nextPreferences = merged;
    } else {
      nextPreferences = DEFAULT_PREFERENCES;
    }

    setPreferences(nextPreferences);
    await loadPreferenceSuggestions(nextPreferences);

    setLoading(false);
  }

  function updatePreference(key: PreferenceKey, value: number) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function applyNumericSuggestion(key: string, value: number) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleActivity(activity: string) {
    setPreferences((current) => {
      const enabled = current.enabled_activities ?? DEFAULT_ENABLED_ACTIVITIES;

      const nextEnabled = enabled.includes(activity)
        ? enabled.filter((item) => item !== activity)
        : [...enabled, activity];

      return {
        ...current,
        enabled_activities: nextEnabled,
      };
    });
  }

  function enableDefaultActivities() {
    setPreferences((current) => ({
      ...current,
      enabled_activities: DEFAULT_ENABLED_ACTIVITIES,
    }));
  }

  function enableAllActivities() {
    setPreferences((current) => ({
      ...current,
      enabled_activities: ACTIVITY_OPTIONS,
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

    const { error } = await supabase.from("app_preferences").upsert(
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

    setSaveMessage("Preferences saved. Lumora is updating your recommendations...");

    try {
      await triggerPredictionGeneration({
        force: true,
        reason: "preferences_saved",
      });

      setSaveMessage("Preferences saved. Recommendations updated.");
      await loadPreferenceSuggestions(preferences);
    } catch (error) {
      console.warn("Could not update predictions after saving preferences:", error);

      setSaveMessage(
        "Preferences saved. Recommendations will update automatically soon."
      );
    }

    setSaving(false);
  }

  function resetPreferences() {
    setPreferences(DEFAULT_PREFERENCES);
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <>
        <PageHeader title="Preferences" />

        <Card className="mt-6">
          <p className="text-slate-300">
            Please log in on the Home page to manage preferences.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Personalization"
        title="Preferences"
        description="Tune how Lumora should score changing conditions for your activities."
      />

      <div className="mt-8 flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-950/60 p-1">
        <PreferenceTab
          active={preferencesView === "core"}
          onClick={() => setPreferencesView("core")}
          label="Core comfort"
        />

        <PreferenceTab
          active={preferencesView === "activity"}
          onClick={() => setPreferencesView("activity")}
          label="Activity tuning"
        />

        <PreferenceTab
          active={preferencesView === "activities"}
          onClick={() => setPreferencesView("activities")}
          label="Activities"
        />
      </div>

      {preferencesView === "activities" && (
        <Card className="mt-8">
          <SectionTitle
            title="Activities Lumora should recommend"
            description="Choose which activities should appear in Home, Planner, Calendar, and recommendations."
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={enableDefaultActivities}
                >
                  Defaults
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={enableAllActivities}
                >
                  Enable all
                </Button>
              </div>
            }
          />

          <div className="mt-5 grid gap-5">
            {Object.entries(activityGroups).map(([category, activities]) => (
              <div key={category}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                    {category}
                  </h3>

                  <span className="text-xs text-slate-500">
                    {
                      activities.filter((activity) =>
                        preferences.enabled_activities.includes(activity)
                      ).length
                    }
                    /{activities.length} enabled
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {activities.map((activity) => {
                    const enabled =
                      preferences.enabled_activities.includes(activity);
                    const meta = ACTIVITY_META[activity];

                    return (
                      <button
                        key={activity}
                        type="button"
                        onClick={() => toggleActivity(activity)}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                          enabled
                            ? "border-[rgb(var(--brand-rgb)_/_0.45)] bg-[rgb(var(--brand-rgb)_/_0.12)]"
                            : "border-slate-700/70 bg-white/[0.04] hover:bg-white/[0.07]"
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-white">
                            {activityLabel(activity)}
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            {meta?.category ?? "Activity"}
                          </div>
                        </div>

                        <Badge variant={enabled ? "info" : "neutral"}>
                          {enabled ? "On" : "Off"}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <SavePreferencesFooter
            saving={saving}
            saveMessage={saveMessage}
            saveError={saveError}
            onSave={savePreferences}
            buttonLabel="Save activity choices"
          />
        </Card>
      )}

      {preferencesView === "core" && (
        <>
          <SuggestedTuningCard
            suggestions={suggestions}
            onApply={applyNumericSuggestion}
          />

          <Card className="mt-8">
            <SectionTitle
              title="Core comfort"
              description="These settings affect several activities and represent your overall comfort and risk tolerance."
            />

            {loading && (
              <p className="mt-4 text-slate-300">Loading preferences...</p>
            )}

            <EnabledActivitySummary
              enabledCount={preferences.enabled_activities.length}
              onEditActivities={() => setPreferencesView("activities")}
            />

            {loadError && (
              <StatusMessage type="error">{loadError}</StatusMessage>
            )}

            <PreferenceGroups
              groups={coreGroups}
              preferences={preferences}
              onChange={updatePreference}
            />

            <SavePreferencesFooter
              saving={saving}
              saveMessage={saveMessage}
              saveError={saveError}
              onSave={savePreferences}
              onReset={resetPreferences}
              buttonLabel="Save preferences"
            />
          </Card>
        </>
      )}

      {preferencesView === "activity" && (
        <>
          <SuggestedTuningCard
            suggestions={suggestions}
            onApply={applyNumericSuggestion}
          />

          <Card className="mt-8">
            <SectionTitle
              title="Activity tuning"
              description="These settings adjust specific activities. Hidden sliders keep their saved values if you re-enable the activity later."
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setShowAllActivityTuning((current) => !current)
                  }
                >
                  {showAllActivityTuning ? "Show enabled only" : "Show all"}
                </Button>
              }
            />

            <EnabledActivitySummary
              enabledCount={preferences.enabled_activities.length}
              onEditActivities={() => setPreferencesView("activities")}
            />

            {Object.keys(activityTuningGroups).length === 0 ? (
              <div className="mt-6 rounded-xl border border-slate-700/70 bg-white/[0.04] p-4 text-sm text-slate-300">
                Enable more activities to see activity-specific tuning sliders.
              </div>
            ) : (
              <PreferenceGroups
                groups={activityTuningGroups}
                preferences={preferences}
                onChange={updatePreference}
              />
            )}

            <SavePreferencesFooter
              saving={saving}
              saveMessage={saveMessage}
              saveError={saveError}
              onSave={savePreferences}
              onReset={resetPreferences}
              buttonLabel="Save activity tuning"
            />
          </Card>
        </>
      )}
    </>
  );
}

function PreferenceTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[rgb(var(--brand-rgb)_/_0.18)] text-white"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function PreferenceGroups({
  groups,
  preferences,
  onChange,
}: {
  groups: Record<string, { key: string; label: string; help: string }[]>;
  preferences: PreferenceSettings;
  onChange: (key: PreferenceKey, value: number) => void;
}) {
  return (
    <div className="mt-8 grid gap-8">
      {Object.entries(groups).map(([groupName, definitions]) => (
        <section key={groupName}>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {groupName}
          </h3>

          <div className="mt-5 grid gap-6">
            {definitions.map((definition) => (
              <PreferenceSlider
                key={definition.key}
                label={definition.label}
                help={definition.help}
                value={preferences[definition.key as PreferenceKey]}
                onChange={(value) =>
                  onChange(definition.key as PreferenceKey, value)
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EnabledActivitySummary({
  enabledCount,
  onEditActivities,
}: {
  enabledCount: number;
  onEditActivities: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-slate-700/70 bg-white/[0.04] p-4 text-sm text-slate-300">
      <span className="font-semibold text-white">{enabledCount}</span>{" "}
      activities are currently enabled.{" "}
      <button
        type="button"
        onClick={onEditActivities}
        className="font-semibold text-[rgb(var(--brand-rgb))] hover:underline"
      >
        Edit activities
      </button>
    </div>
  );
}

function SuggestedTuningCard({
  suggestions,
  onApply,
}: {
  suggestions: PreferenceSuggestion[];
  onApply: (key: string, value: number) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <Card className="mt-8">
      <SectionTitle
        title="Suggested tuning"
        description="Based on your activity logs, Lumora found preference adjustments that may improve future scores."
      />

      <div className="mt-5 grid gap-3">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.key}
            className="rounded-xl border border-slate-700/70 bg-white/[0.04] p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-semibold text-white">
                  {suggestion.title}
                </div>

                <p className="mt-1 text-sm text-slate-300">
                  {suggestion.description}
                </p>

                <div className="mt-2 text-xs text-slate-500">
                  Current: {suggestion.currentValue}/10 → Suggested:{" "}
                  {suggestion.suggestedValue}/10 · Confidence:{" "}
                  {suggestion.confidence}
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  onApply(suggestion.key, suggestion.suggestedValue)
                }
              >
                Apply
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SavePreferencesFooter({
  saving,
  saveMessage,
  saveError,
  onSave,
  onReset,
  buttonLabel,
}: {
  saving: boolean;
  saveMessage: string;
  saveError: string;
  onSave: () => void;
  onReset?: () => void;
  buttonLabel: string;
}) {
  return (
    <>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : buttonLabel}
        </Button>

        {onReset && (
          <Button type="button" variant="secondary" onClick={onReset}>
            Reset to defaults
          </Button>
        )}
      </div>

      {saveMessage && (
        <StatusMessage type="success">{saveMessage}</StatusMessage>
      )}

      {saveError && (
        <StatusMessage type="error">{saveError}</StatusMessage>
      )}
    </>
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

        <div className="rounded-full bg-[rgb(var(--brand-rgb)_/_0.14)] px-3 py-1 text-sm font-bold text-white">
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