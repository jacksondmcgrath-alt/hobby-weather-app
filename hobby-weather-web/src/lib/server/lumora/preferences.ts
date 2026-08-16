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

function clampPreferenceAdjustment(activity: string, adjustment: number) {
  const limits: Record<
    string,
    {
      min: number;
      max: number;
    }
  > = {
    Running: { min: -20, max: 8 },
    Walking: { min: -12, max: 6 },
    Hiking: { min: -18, max: 8 },
    Cycling: { min: -20, max: 8 },
    "Outdoor Workout": { min: -18, max: 8 },
    "Dog Walking": { min: -12, max: 6 },
    "Outdoor Yoga": { min: -12, max: 6 },

    Fishing: { min: -16, max: 8 },
    Kayaking: { min: -22, max: 8 },
    Canoeing: { min: -22, max: 8 },
    Paddleboarding: { min: -24, max: 8 },
    "Beach Day": { min: -18, max: 8 },
    Swimming: { min: -18, max: 8 },

    Camping: { min: -22, max: 8 },
    Picnic: { min: -14, max: 6 },
    Gardening: { min: -12, max: 6 },

    Tennis: { min: -18, max: 6 },
    Pickleball: { min: -18, max: 6 },
    Golf: { min: -16, max: 6 },
    "Disc Golf": { min: -18, max: 8 },
    Soccer: { min: -16, max: 6 },
    Baseball: { min: -16, max: 6 },
    Basketball: { min: -14, max: 6 },
    Volleyball: { min: -16, max: 6 },

    Photography: { min: -10, max: 10 },
    Birdwatching: { min: -12, max: 8 },
    "Wildlife Watching": { min: -12, max: 8 },
    Stargazing: { min: -18, max: 8 },

    "Drone Flying": { min: -25, max: 6 },
    "Kite Flying": { min: -18, max: 12 },

    Sledding: { min: -18, max: 10 },
    Snowshoeing: { min: -18, max: 10 },
    Skiing: { min: -18, max: 10 },
    Snowboarding: { min: -18, max: 10 },
    "Ice Fishing": { min: -18, max: 10 },
  };

  const limit = limits[activity] ?? {
    min: -16,
    max: 8,
  };

  return Math.max(limit.min, Math.min(limit.max, adjustment));
}

function boundedPenalty(value: number, cap: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.min(cap, Math.max(0, value));
}

function boundedBoost(value: number, cap: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.min(cap, Math.max(0, value));
}

function sliderAboveNeutral(value: number | null | undefined) {
  return Math.max(0, (value ?? 5) - 5);
}

function sliderBelowNeutral(value: number | null | undefined) {
  return Math.max(0, 5 - (value ?? 5));
}

export function applyPreferenceAdjustment(
  activity: string,
  day: DailyWeather,
  preferences: Preferences
) {
  let adjustment = 0;

  // --------------------------------------------------
  // Rain caution
  // --------------------------------------------------
  // Rain is broad, so it gets a shared rule with activity-specific
  // thresholds/caps. This prevents high rain_caution from overwhelming
  // otherwise reasonable days.
  // --------------------------------------------------

  let rainThreshold = 40;
  let rainMultiplier = 0.22;
  let rainCap = 8;

  if (activity === "Camping") {
    rainThreshold = 20;
    rainMultiplier = 0.45;
    rainCap = 16;
  } else if (
    activity === "Kayaking" ||
    activity === "Canoeing" ||
    activity === "Paddleboarding"
  ) {
    rainThreshold = 20;
    rainMultiplier = 0.4;
    rainCap = 14;
  } else if (activity === "Beach Day" || activity === "Swimming") {
    rainThreshold = 25;
    rainMultiplier = 0.35;
    rainCap = 12;
  } else if (activity === "Tennis" || activity === "Pickleball") {
    rainThreshold = 20;
    rainMultiplier = 0.4;
    rainCap = 14;
  } else if (activity === "Running") {
    rainThreshold = 35;
    rainMultiplier = 0.22;
    rainCap = 8;
  } else if (activity === "Disc Golf" || activity === "Golf") {
    rainThreshold = 30;
    rainMultiplier = 0.3;
    rainCap = 10;
  } else if (
    ["Soccer", "Baseball", "Basketball", "Volleyball", "Picnic"].includes(
      activity
    )
  ) {
    rainThreshold = 30;
    rainMultiplier = 0.28;
    rainCap = 10;
  }

  if (day.rainChance > rainThreshold) {
    const rainPenalty =
      ((day.rainChance - rainThreshold) / 10) *
      preferences.rain_caution *
      rainMultiplier;

    adjustment -= boundedPenalty(rainPenalty, rainCap);
  }

  // --------------------------------------------------
  // Bugs
  // --------------------------------------------------
  // Bugs matter, but should not dominate most scores.
  // Fishing is handled separately because bugs can be positive there.
  // --------------------------------------------------

  if (["Camping", "Hiking", "Disc Golf", "Picnic"].includes(activity)) {
    if (day.bugIndex > 45) {
      const sensitivity =
        activity === "Camping"
          ? preferences.camping_bug_sensitivity
          : activity === "Hiking"
            ? preferences.hiking_bug_sensitivity
            : 10 - preferences.bug_tolerance;

      const bugPenalty = ((day.bugIndex - 45) / 10) * sensitivity * 0.55;

      adjustment -= boundedPenalty(bugPenalty, activity === "Camping" ? 12 : 8);
    }
  }

  if (["Kayaking", "Canoeing", "Paddleboarding", "Tennis"].includes(activity)) {
    if (day.bugIndex > 55) {
      const bugPenalty =
        ((day.bugIndex - 55) / 10) * (10 - preferences.bug_tolerance) * 0.35;

      adjustment -= boundedPenalty(bugPenalty, 5);
    }
  }

  // --------------------------------------------------
  // Running-specific preferences
  // --------------------------------------------------
  // Running has its own heat/wind preferences, so it is excluded
  // from the general exertion block below.
  // --------------------------------------------------

  if (activity === "Running") {
    if (day.windMax > 12) {
      adjustment -= boundedPenalty(
        (day.windMax - 12) * preferences.running_wind_sensitivity * 0.12,
        8
      );
    }

    if (day.gustMax > 24) {
      adjustment -= boundedPenalty(
        (day.gustMax - 24) * preferences.running_wind_sensitivity * 0.08,
        5
      );
    }

    if (day.avgTemp > 72) {
      adjustment -= boundedPenalty(
        ((day.avgTemp - 72) / 5) *
          preferences.running_heat_sensitivity *
          0.7,
        10
      );
    }

    if (day.apparentTemp > 82) {
      adjustment -= boundedPenalty(
        ((day.apparentTemp - 82) / 5) *
          preferences.running_heat_sensitivity *
          0.5,
        8
      );
    }
  }

  // --------------------------------------------------
  // General exertion heat / AQI preferences
  // --------------------------------------------------
  // Applies to exertion activities that do not already have
  // stronger activity-specific heat logic.
  // --------------------------------------------------

  const generalHeatSensitivity = preferences.general_heat_sensitivity ?? 6;
  const humiditySensitivity = preferences.humidity_sensitivity ?? 6;
  const aqiSensitivity = preferences.aqi_sensitivity ?? 6;

  const generalExertionActivities = [
    "Walking",
    "Hiking",
    "Cycling",
    "Outdoor Workout",
    "Dog Walking",
  ];

  if (generalExertionActivities.includes(activity)) {
    if (day.avgTemp > 82) {
      adjustment -= boundedPenalty(
        ((day.avgTemp - 82) / 5) * generalHeatSensitivity * 0.45,
        8
      );
    }

    if (day.apparentTemp > 88) {
      adjustment -= boundedPenalty(
        ((day.apparentTemp - 88) / 5) * generalHeatSensitivity * 0.4,
        8
      );
    }

    if (day.dewPoint > 66) {
      adjustment -= boundedPenalty(
        ((day.dewPoint - 66) / 5) * humiditySensitivity * 0.35,
        6
      );
    }

    if (day.aqi > 85) {
      adjustment -= boundedPenalty(
        ((day.aqi - 85) / 25) * aqiSensitivity * 0.9,
        10
      );
    }
  }

  // --------------------------------------------------
  // Cycling-specific wind preferences
  // --------------------------------------------------

  if (activity === "Cycling") {
    if (day.windMax > 10) {
      adjustment -= boundedPenalty(
        (day.windMax - 10) * preferences.cycling_wind_sensitivity * 0.22,
        12
      );
    }

    if (day.gustMax > 18) {
      adjustment -= boundedPenalty(
        (day.gustMax - 18) * preferences.cycling_wind_sensitivity * 0.15,
        8
      );
    }
  }

  // --------------------------------------------------
  // Paddling wind and water-temperature caution
  // --------------------------------------------------

  if (
    activity === "Kayaking" ||
    activity === "Canoeing" ||
    activity === "Paddleboarding"
  ) {
    if (day.windMax > 8) {
      adjustment -= boundedPenalty(
        (day.windMax - 8) * preferences.kayaking_wind_caution * 0.35,
        14
      );
    }

    if (day.gustMax > 15) {
      adjustment -= boundedPenalty(
        (day.gustMax - 15) * preferences.kayaking_wind_caution * 0.22,
        10
      );
    }

    if (day.waterTempEst < 60) {
      adjustment -= boundedPenalty(
        ((60 - day.waterTempEst) / 5) *
          preferences.paddling_water_temp_caution *
          0.8,
        12
      );
    }
  }

  // --------------------------------------------------
  // Beach / swimming comfort preferences
  // --------------------------------------------------

  if (activity === "Beach Day" || activity === "Swimming") {
    if (day.uvIndex > 8) {
      adjustment -= boundedPenalty(
        (day.uvIndex - 8) * preferences.beach_uv_sensitivity * 0.8,
        8
      );
    }

    if (day.windMax > 16) {
      adjustment -= boundedPenalty(
        (day.windMax - 16) * preferences.beach_wind_sensitivity * 0.3,
        8
      );
    }

    if (day.waterTempEst < 68) {
      adjustment -= boundedPenalty(
        ((68 - day.waterTempEst) / 5) *
          preferences.paddling_water_temp_caution *
          0.45,
        8
      );
    }
  }

  // --------------------------------------------------
  // Fishing preferences
  // --------------------------------------------------

  if (activity === "Fishing") {
    if (day.bugIndex >= 40 && day.bugIndex <= 72) {
        adjustment += boundedBoost(
            (preferences.fishing_bug_boost - 5) * 1.1,
            5
        );
        }

    if (day.windMax > 12) {
      adjustment -= boundedPenalty(
        (day.windMax - 12) *
          (10 - preferences.fishing_wind_tolerance) *
          0.22,
        10
      );
    }

    if (day.windMax >= 4 && day.windMax <= 11) {
      adjustment += boundedBoost(
        preferences.fishing_wind_tolerance * 0.25,
        3
      );
    }

    if (day.waterTempEst < 50 || day.waterTempEst > 80) {
      adjustment -= boundedPenalty(
        preferences.fishing_water_temp_importance * 0.8,
        6
      );
    }

    if (Math.abs(day.pressureChange) > 8) {
      adjustment -= boundedPenalty(
        preferences.fishing_pressure_importance * 0.5,
        5
      );
    }
  }

  // --------------------------------------------------
  // Court and precision sports
  // --------------------------------------------------

  if (activity === "Disc Golf") {
    if (day.windMax > 10) {
      adjustment -= boundedPenalty(
        (day.windMax - 10) * preferences.disc_golf_wind_sensitivity * 0.25,
        12
      );
    }

    if (day.groundWetnessIndex > 70) {
      adjustment -= boundedPenalty((day.groundWetnessIndex - 70) * 0.08, 5);
    }
  }

  if (activity === "Tennis" || activity === "Pickleball") {
    if (day.windMax > 12) {
      adjustment -= boundedPenalty(
        (day.windMax - 12) * preferences.wind_sensitivity * 0.18,
        8
      );
    }

    if (day.groundWetnessIndex > 65) {
      adjustment -= boundedPenalty((day.groundWetnessIndex - 65) * 0.12, 8);
    }

    if (day.apparentTemp > 90) {
      adjustment -= boundedPenalty(
        ((day.apparentTemp - 90) / 5) * generalHeatSensitivity * 0.4,
        6
      );
    }
  }

  if (activity === "Golf") {
    if (day.windMax > 14) {
      adjustment -= boundedPenalty(
        (day.windMax - 14) * preferences.wind_sensitivity * 0.14,
        7
      );
    }

    if (day.groundWetnessIndex > 70) {
      adjustment -= boundedPenalty((day.groundWetnessIndex - 70) * 0.08, 6);
    }
  }

  if (["Soccer", "Baseball", "Basketball", "Volleyball"].includes(activity)) {
    if (day.apparentTemp > 90) {
      adjustment -= boundedPenalty(
        ((day.apparentTemp - 90) / 5) * generalHeatSensitivity * 0.35,
        6
      );
    }

    if (day.groundWetnessIndex > 70) {
      adjustment -= boundedPenalty((day.groundWetnessIndex - 70) * 0.08, 6);
    }
  }

  // --------------------------------------------------
  // Camping, picnic, gardening
  // --------------------------------------------------

  if (activity === "Camping") {
    if (day.groundWetnessIndex > 60) {
      adjustment -= boundedPenalty(
        ((day.groundWetnessIndex - 60) / 10) *
          preferences.camping_ground_wetness_sensitivity *
          0.8,
        14
      );
    }
  }

  if (activity === "Picnic") {
    if (day.bugIndex > 55) {
      adjustment -= boundedPenalty(
        ((day.bugIndex - 55) / 10) * (10 - preferences.bug_tolerance) * 0.35,
        5
      );
    }

    if (day.groundWetnessIndex > 70) {
      adjustment -= boundedPenalty((day.groundWetnessIndex - 70) * 0.08, 5);
    }
  }

  if (activity === "Gardening") {
    if (day.avgTemp > 85) {
      adjustment -= boundedPenalty(
        ((day.avgTemp - 85) / 5) * generalHeatSensitivity * 0.35,
        5
      );
    }

    if (day.windMax > 18) {
      adjustment -= boundedPenalty(
        (day.windMax - 18) * preferences.wind_sensitivity * 0.12,
        5
      );
    }
  }

  // --------------------------------------------------
  // Photography, wildlife, stargazing
  // --------------------------------------------------

  if (activity === "Photography") {
    const cloudPreference = preferences.photography_cloud_preference ?? 6;

    if (day.cloudCover >= 30 && day.cloudCover <= 75) {
      adjustment += boundedBoost((cloudPreference - 5) * 1.1, 6);
    } else if (day.cloudCover > 90) {
      adjustment -= boundedPenalty(sliderAboveNeutral(cloudPreference) * 0.8, 5);
    }

    if (day.lightQualityIndex >= 70) {
      adjustment += boundedBoost(
        (preferences.photography_golden_hour_importance - 5) * 0.6,
        4
      );
    }

    if (day.airClarityIndex < 55) {
      adjustment -= boundedPenalty((55 - day.airClarityIndex) * 0.08, 5);
    }
  }

  if (activity === "Birdwatching" || activity === "Wildlife Watching") {
    if (day.windMax > 14) {
      adjustment -= boundedPenalty(
        (day.windMax - 14) * preferences.wind_sensitivity * 0.12,
        5
      );
    }

    if (day.rainChance > 45) {
      adjustment -= boundedPenalty(
        ((day.rainChance - 45) / 10) * preferences.rain_caution * 0.18,
        5
      );
    }
  }

  if (activity === "Stargazing") {
    if (day.cloudCover > 25) {
      adjustment -= boundedPenalty(
        ((day.cloudCover - 25) / 10) *
          preferences.stargazing_cloud_strictness *
          0.45,
        16
      );
    }

    if (day.airClarityIndex < 70) {
      adjustment -= boundedPenalty((70 - day.airClarityIndex) * 0.08, 6);
    }
  }

  // --------------------------------------------------
  // Drone and kite
  // --------------------------------------------------

  if (activity === "Drone Flying") {
    if (day.windMax > 8) {
      adjustment -= boundedPenalty(
        (day.windMax - 8) * preferences.drone_wind_sensitivity * 0.32,
        16
      );
    }

    if (day.gustMax > 15) {
      adjustment -= boundedPenalty(
        (day.gustMax - 15) * preferences.drone_wind_sensitivity * 0.22,
        12
      );
    }

    if (day.airClarityIndex < 60) {
      adjustment -= boundedPenalty((60 - day.airClarityIndex) * 0.08, 5);
    }
  }

  if (activity === "Kite Flying") {
    if (day.windMax >= 8 && day.windMax <= 18) {
      adjustment += boundedBoost(
        (preferences.kite_wind_preference - 5) * 1.2,
        8
      );
    } else if (day.windMax < 6) {
      adjustment -= boundedPenalty(
        (6 - day.windMax) * preferences.kite_wind_preference * 0.4,
        8
      );
    } else if (day.windMax > 22) {
      adjustment -= boundedPenalty(
        (day.windMax - 22) * preferences.wind_sensitivity * 0.18,
        8
      );
    }
  }

  // --------------------------------------------------
  // Winter activities
  // --------------------------------------------------

  if (
    ["Sledding", "Snowshoeing", "Skiing", "Snowboarding", "Ice Fishing"].includes(
      activity
    )
  ) {
    const coldTolerance = preferences.winter_cold_tolerance ?? 5;
    const coldSensitivity = preferences.cold_sensitivity ?? 5;

    if (day.avgTemp < 20) {
      adjustment += boundedBoost(sliderAboveNeutral(coldTolerance) * 1.2, 6);
      adjustment -= boundedPenalty(sliderAboveNeutral(coldSensitivity) * 0.9, 6);
    }

    if (day.windMax > 18) {
      adjustment -= boundedPenalty(
        (day.windMax - 18) * preferences.wind_sensitivity * 0.12,
        7
      );
    }

    if (day.winterSurfaceIndex >= 70) {
      adjustment += boundedBoost(sliderAboveNeutral(coldTolerance) * 0.8, 5);
    }
  }

  return Math.round(clampPreferenceAdjustment(activity, adjustment));
}