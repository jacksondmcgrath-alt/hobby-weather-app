import type { DailyWeather } from "@/lib/predictions/scoringProfiles";
import {
  ACTIVITY_OPTIONS,
  DEFAULT_ENABLED_ACTIVITIES,
} from "@/lib/activityMeta";
import {
  DEFAULT_NUMERIC_PREFERENCES,
  type PreferenceKey,
} from "@/lib/preferences/preferenceDefinitions";

export type NumericPreferences = Record<PreferenceKey, number>;

export type Preferences = NumericPreferences & {
  enabled_activities: string[];
};

export type SupabaseAdminLike = any;

export const DEFAULT_PREFERENCES: Preferences = {
  ...DEFAULT_NUMERIC_PREFERENCES,
  enabled_activities: DEFAULT_ENABLED_ACTIVITIES,
};

export async function loadPreferences(
  admin: SupabaseAdminLike,
  userId: string
) {
  const preferences: Preferences = {
    ...DEFAULT_PREFERENCES,
    enabled_activities: [...DEFAULT_PREFERENCES.enabled_activities],
  };

  const { data, error } = await admin
    .from("app_preferences")
    .select("settings")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    settings: Record<string, unknown> | null;
  }[];

  const settings = rows[0]?.settings;

  if (settings && typeof settings === "object") {
    for (const key of Object.keys(DEFAULT_NUMERIC_PREFERENCES) as PreferenceKey[]) {
      const value = settings[key];

      if (typeof value === "number" && Number.isFinite(value)) {
        preferences[key] = value;
      }
    }

    const enabledActivities = settings.enabled_activities;

    if (Array.isArray(enabledActivities)) {
      preferences.enabled_activities = enabledActivities
        .filter((activity): activity is string => typeof activity === "string")
        .filter((activity) => ACTIVITY_OPTIONS.includes(activity));
    }
  }

  if (preferences.enabled_activities.length === 0) {
    preferences.enabled_activities = [...DEFAULT_ENABLED_ACTIVITIES];
  }

  return preferences;
}

export function applyPreferenceAdjustment(
  activity: string,
  day: DailyWeather,
  preferences: Preferences
) {
  let adjustment = 0;

  if (
    ["Camping", "Running", "Disc Golf", "Kayaking", "Tennis"].includes(activity)
  ) {
    if (day.bugIndex > 45) {
      adjustment -=
        ((day.bugIndex - 45) / 10) *
        (10 - preferences.bug_tolerance) *
        0.7;
    }
  }

  let rainThreshold = 40;

  if (activity === "Camping") rainThreshold = 20;
  else if (activity === "Kayaking") rainThreshold = 20;
  else if (activity === "Beach Day") rainThreshold = 25;
  else if (activity === "Tennis") rainThreshold = 20;
  else if (activity === "Running") rainThreshold = 30;
  else if (activity === "Disc Golf") rainThreshold = 30;

  if (day.rainChance > rainThreshold) {
    adjustment -=
      ((day.rainChance - rainThreshold) / 10) *
      preferences.rain_caution *
      0.5;
  }

  if (activity === "Running") {
    if (day.windMax > 8) {
      adjustment -=
        (day.windMax - 8) * preferences.running_wind_sensitivity * 0.25;
    }

    if (day.avgTemp > 60) {
      adjustment -=
        (day.avgTemp - 60) * preferences.running_heat_sensitivity * 0.25;
    }
  }

  if (activity === "Kayaking") {
    if (day.windMax > 8) {
      adjustment -= (day.windMax - 8) * preferences.kayaking_wind_caution * 0.4;
    }

    if (day.gustMax > 15) {
      adjustment -=
        (day.gustMax - 15) * preferences.kayaking_wind_caution * 0.25;
    }
  }

  if (activity === "Disc Golf") {
    if (day.windMax > 10) {
      adjustment -=
        (day.windMax - 10) * preferences.disc_golf_wind_sensitivity * 0.3;
    }
  }

  if (activity === "Fishing") {
    if (day.bugIndex >= 35 && day.bugIndex <= 75) {
      adjustment += (preferences.fishing_bug_boost - 5) * 1.5;
    }

    if (day.windMax > 12) {
      adjustment -=
        (day.windMax - 12) * (10 - preferences.fishing_wind_tolerance) * 0.25;
    }

    if (day.windMax >= 4 && day.windMax <= 12) {
      adjustment += preferences.fishing_wind_tolerance * 0.4;
    }
  }

  const generalHeatSensitivity = preferences.general_heat_sensitivity ?? 6;
  const aqiSensitivity = preferences.aqi_sensitivity ?? 6;
  const cyclingWindSensitivity = preferences.cycling_wind_sensitivity ?? 7;
  const hikingBugSensitivity = preferences.hiking_bug_sensitivity ?? 6;

  const exertionActivities = [
    "Running",
    "Walking",
    "Hiking",
    "Cycling",
    "Outdoor Workout",
    "Dog Walking",
  ];

  if (exertionActivities.includes(activity)) {
    if (day.avgTemp > 78) {
      adjustment -=
        ((day.avgTemp - 78) / 5) * generalHeatSensitivity * 0.6;
    }

    if (day.apparentTemp > 84) {
      adjustment -=
        ((day.apparentTemp - 84) / 5) * generalHeatSensitivity * 0.5;
    }

    if (day.aqi > 75) {
      adjustment -= ((day.aqi - 75) / 25) * aqiSensitivity * 1.2;
    }
  }

  if (activity === "Cycling") {
    if (day.windMax > 10) {
      adjustment -=
        (day.windMax - 10) * cyclingWindSensitivity * 0.25;
    }

    if (day.gustMax > 18) {
      adjustment -=
        (day.gustMax - 18) * cyclingWindSensitivity * 0.18;
    }
  }

  if (activity === "Hiking") {
    if (day.bugIndex > 45) {
      adjustment -=
        ((day.bugIndex - 45) / 10) * hikingBugSensitivity * 0.8;
    }
  }

  return adjustment;
}