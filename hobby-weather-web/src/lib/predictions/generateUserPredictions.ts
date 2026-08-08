import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVITY_OPTIONS,
  DEFAULT_ENABLED_ACTIVITIES,
} from "@/lib/activityMeta";
import {
  average,
  max,
  min,
  sum,
  clampScore,
  scoreActivity,
  calibrateActivityScore,
  type DailyWeather,
  type HourlyWeatherRow,
} from "@/lib/predictions/scoringProfiles";
import {
  getRecommendedWindowForActivity,
  type WeeklyObligation,
} from "@/lib/predictions/windowScoring";
import {
  DEFAULT_NUMERIC_PREFERENCES,
  type PreferenceKey,
} from "@/lib/preferences/preferenceDefinitions";

const ACTIVITIES = ACTIVITY_OPTIONS;

type SupabaseAdmin = SupabaseClient<any, "public", any>;

type SavedLocation = {
  id: number;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  location_type: string | null;
  water_type: string | null;
  water_body_size: string | null;
  wind_exposure: string | null;
  manual_water_temp: number | null;
  use_usgs_water_data: boolean | null;
  usgs_site_id: string | null;
  use_ndbc_data: boolean | null;
  ndbc_station_id: string | null;
  notes: string | null;
};

type ActivityDefault = {
  activity: string | null;
  saved_location_id: number | null;
};

type Preferences = Record<PreferenceKey, number> & {
  enabled_activities: string[];
};

type PredictionResult = {
  predictionsWritten: number;
  locationsUsed: number;
};

const DEFAULT_PREFERENCES: Preferences = {
  ...DEFAULT_NUMERIC_PREFERENCES,
  enabled_activities: DEFAULT_ENABLED_ACTIVITIES,
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysString(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isInPredictionWindow(date: string) {
  return date >= todayString() && date <= addDaysString(14);
}

function scoreLabel(score: number) {
  if (score >= 95) return "Exceptional";
  if (score >= 85) return "Great";
  if (score >= 70) return "Good";
  if (score >= 55) return "Okay";
  if (score >= 40) return "Marginal";
  return "Poor";
}

function calculateBugIndex(day: {
  avgTemp: number;
  humidity: number;
  windAvg: number;
  rainTotal: number;
}) {
  let score = 0;

  if (day.avgTemp < 50) score += 10;
  else if (day.avgTemp < 60) score += 25;
  else if (day.avgTemp <= 75) score += 50;
  else if (day.avgTemp <= 88) score += 65;
  else score += 45;

  if (day.humidity >= 80) score += 20;
  else if (day.humidity >= 65) score += 12;
  else if (day.humidity >= 50) score += 5;

  if (day.windAvg < 4) score += 15;
  else if (day.windAvg < 8) score += 8;
  else if (day.windAvg > 15) score -= 10;

  if (day.rainTotal >= 0.25) score += 12;
  else if (day.rainTotal >= 0.05) score += 6;

  return clampScore(score);
}

function stormSafetyScore(day: {
  rainChance: number;
  rainTotal: number;
  gustMax: number;
}) {
  let risk = 0;

  if (day.gustMax >= 35) risk += 35;
  else if (day.gustMax >= 25) risk += 20;

  if (day.rainChance >= 70) risk += 20;
  else if (day.rainChance >= 50) risk += 10;

  if (day.rainTotal >= 0.5) risk += 20;
  else if (day.rainTotal >= 0.25) risk += 10;

  return clampScore(100 - risk);
}

function forecastConfidence(date: string, day: DailyWeather) {
  const today = new Date(todayString());
  const forecastDate = new Date(`${date}T12:00:00`);
  const daysOut = Math.round(
    (forecastDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  let leadScore = 40;

  if (daysOut <= 0) leadScore = 95;
  else if (daysOut === 1) leadScore = 90;
  else if (daysOut === 2) leadScore = 82;
  else if (daysOut === 3) leadScore = 74;
  else if (daysOut === 4) leadScore = 65;
  else if (daysOut === 5) leadScore = 58;
  else if (daysOut === 6) leadScore = 52;
  else if (daysOut === 7) leadScore = 47;

  let complexityScore = 100;

  if (day.rainChance >= 30 && day.rainChance <= 70) complexityScore -= 15;
  else if (day.rainChance > 70) complexityScore -= 10;

  if (day.windMax >= 18) complexityScore -= 10;
  if (day.gustMax >= 25) complexityScore -= 10;
  if (day.stormSafety < 60) complexityScore -= 20;

  return clampScore(leadScore * 0.75 + complexityScore * 0.25);
}

function forecastConfidenceLabel(score: number) {
  if (score >= 85) return "High confidence";
  if (score >= 70) return "Solid";
  if (score >= 55) return "Watch closely";
  if (score >= 40) return "Uncertain";
  return "Very uncertain";
}

function applyPreferenceAdjustment(
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

async function fetchOpenMeteoForecast(latitude: number, longitude: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation_probability",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
      "cloud_cover",
      "pressure_msl",
      "apparent_temperature",
      "dew_point_2m",
      "uv_index",
    ].join(",")
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("daily", "sunrise,sunset,daylight_duration");
  url.searchParams.set("forecast_days", "15");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo forecast error: ${response.status}`);
  }

  return response.json();
}

async function fetchOpenMeteoAirQuality(latitude: number, longitude: number) {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");

  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("hourly", "us_aqi,uv_index");
  url.searchParams.set("forecast_days", "15");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function buildSunDataByDate(forecastData: any) {
  const lookup = new Map<
    string,
    {
      sunrise: string | null;
      sunset: string | null;
      daylightHours: number | null;
    }
  >();

  const daily = forecastData.daily;

  if (!daily?.time) {
    return lookup;
  }

  for (let index = 0; index < daily.time.length; index += 1) {
    const date = String(daily.time[index]);

    lookup.set(date, {
      sunrise: daily.sunrise?.[index] ?? null,
      sunset: daily.sunset?.[index] ?? null,
      daylightHours:
        daily.daylight_duration?.[index] !== undefined &&
        daily.daylight_duration?.[index] !== null
          ? Number(daily.daylight_duration[index]) / 3600
          : null,
    });
  }

  return lookup;
}

function aggregateDailyWeather(forecastData: any, airQualityData: any) {
  const hourly = forecastData.hourly;
  const buckets = new Map<string, HourlyWeatherRow[]>();
  const sunDataByDate = buildSunDataByDate(forecastData);

  for (let index = 0; index < hourly.time.length; index += 1) {
    const time = String(hourly.time[index]);
    const date = time.slice(0, 10);
    const hour = Number(time.slice(11, 13));

    if (!isInPredictionWindow(date)) continue;

    if (!buckets.has(date)) {
      buckets.set(date, []);
    }

    buckets.get(date)?.push({
      date,
      hour,
      temp: Number(hourly.temperature_2m?.[index] ?? 60),
      humidity: Number(hourly.relative_humidity_2m?.[index] ?? 50),
      rainChance: Number(hourly.precipitation_probability?.[index] ?? 0),
      rain: Number(hourly.precipitation?.[index] ?? 0),
      wind: Number(hourly.wind_speed_10m?.[index] ?? 0),
      gust: Number(hourly.wind_gusts_10m?.[index] ?? 0),
      cloud: Number(hourly.cloud_cover?.[index] ?? 50),
      pressure: Number(hourly.pressure_msl?.[index] ?? 1015),
      apparentTemp: Number(hourly.apparent_temperature?.[index] ?? 60),
      dewPoint: Number(hourly.dew_point_2m?.[index] ?? 50),
      uv: Number(hourly.uv_index?.[index] ?? 5),
    });
  }

  const aqiByDate = new Map<string, number[]>();
  const uvByDate = new Map<string, number[]>();

  if (airQualityData?.hourly?.time) {
    const aq = airQualityData.hourly;

    for (let index = 0; index < aq.time.length; index += 1) {
      const time = String(aq.time[index]);
      const date = time.slice(0, 10);

      if (!isInPredictionWindow(date)) continue;

      if (!aqiByDate.has(date)) aqiByDate.set(date, []);
      if (!uvByDate.has(date)) uvByDate.set(date, []);

      aqiByDate.get(date)?.push(Number(aq.us_aqi?.[index] ?? 50));
      uvByDate.get(date)?.push(Number(aq.uv_index?.[index] ?? 5));
    }
  }

  const days: DailyWeather[] = [];

  for (const [date, rows] of buckets.entries()) {
    const daytime = rows.filter((row) => row.hour >= 6 && row.hour <= 21);
    const usable = daytime.length > 0 ? daytime : rows;

    const dailyBase = {
      avgTemp: average(usable.map((row) => row.temp)),
      minTemp: min(rows.map((row) => row.temp)),
      maxTemp: max(rows.map((row) => row.temp)),
      humidity: average(usable.map((row) => row.humidity)),
      rainChance: max(usable.map((row) => row.rainChance)),
      rainTotal: sum(rows.map((row) => row.rain)),
      windAvg: average(usable.map((row) => row.wind)),
      windMax: max(usable.map((row) => row.wind)),
      gustMax: max(usable.map((row) => row.gust)),
      cloudCover: average(usable.map((row) => row.cloud)),
      pressureStart: usable[0]?.pressure ?? null,
      pressureEnd: usable[usable.length - 1]?.pressure ?? null,
      dewPoint: max(usable.map((row) => row.dewPoint)),
      apparentTemp: average(usable.map((row) => row.apparentTemp)),
      aqi: max(aqiByDate.get(date) ?? [50]),
      uvIndex: max(uvByDate.get(date) ?? usable.map((row) => row.uv)),
    };

    const pressureChange =
      dailyBase.pressureStart !== null && dailyBase.pressureEnd !== null
        ? dailyBase.pressureEnd - dailyBase.pressureStart
        : 0;

    const bugIndex = calculateBugIndex({
      avgTemp: dailyBase.avgTemp,
      humidity: dailyBase.humidity,
      windAvg: dailyBase.windAvg,
      rainTotal: dailyBase.rainTotal,
    });

    const stormSafety = stormSafetyScore({
      rainChance: dailyBase.rainChance,
      rainTotal: dailyBase.rainTotal,
      gustMax: dailyBase.gustMax,
    });

    const sunData = sunDataByDate.get(date);

    days.push({
    date,
    ...dailyBase,
    pressureChange,
    bugIndex,
    stormSafety,
    waterTempEst: average([
        dailyBase.avgTemp,
        dailyBase.minTemp,
        dailyBase.maxTemp,
    ]),
    hourlyRows: rows,
    sunrise: sunData?.sunrise ?? null,
    sunset: sunData?.sunset ?? null,
    daylightHours: sunData?.daylightHours ?? null,
    });
  }

  return days.sort((a, b) => a.date.localeCompare(b.date));
}

async function loadPreferences(admin: SupabaseAdmin, userId: string) {
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
    settings: Partial<Preferences> | null;
  }[];

  const settings = rows[0]?.settings;

  if (settings && typeof settings === "object") {
    Object.assign(preferences, settings);
  }

  preferences.enabled_activities = Array.isArray(preferences.enabled_activities)
    ? preferences.enabled_activities.filter((activity) =>
        ACTIVITIES.includes(activity)
      )
    : [...DEFAULT_ENABLED_ACTIVITIES];

  if (preferences.enabled_activities.length === 0) {
    preferences.enabled_activities = [...DEFAULT_ENABLED_ACTIVITIES];
  }

  return preferences;
}

async function loadSavedLocations(admin: SupabaseAdmin, userId: string) {
  const { data, error } = await admin
    .from("saved_locations")
    .select("*")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []) as SavedLocation[];
}

async function loadActivityDefaults(admin: SupabaseAdmin, userId: string) {
  const { data, error } = await admin
    .from("activity_location_defaults")
    .select("activity,saved_location_id")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []) as ActivityDefault[];
}

async function loadWeeklyObligations(admin: SupabaseAdmin, userId: string) {
  const { data, error } = await admin
    .from("weekly_obligations")
    .select("id,label,day_of_week,start_time,end_time,active")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) throw error;

  return (data ?? []) as WeeklyObligation[];
}

function findHomeLocation(locations: SavedLocation[]) {
  return (
    locations.find(
      (location) => location.location_type?.toLowerCase() === "home"
    ) ?? null
  );
}

function findFirstValidLocation(locations: SavedLocation[]) {
  return (
    locations.find(
      (location) => location.latitude !== null && location.longitude !== null
    ) ?? null
  );
}

function locationContext(location: SavedLocation) {
  return {
    saved_location_id: location.id,
    location_name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    location_type: location.location_type,
    water_type: location.water_type,
    water_body_size: location.water_body_size,
    wind_exposure: location.wind_exposure,
    manual_water_temp: location.manual_water_temp,
    use_usgs_water_data: location.use_usgs_water_data,
    usgs_site_id: location.usgs_site_id,
    use_ndbc_data: location.use_ndbc_data,
    ndbc_station_id: location.ndbc_station_id,
    notes: location.notes,
  };
}

function buildActivityLocationMap(
  locations: SavedLocation[],
  defaults: ActivityDefault[],
  enabledActivities: string[]
) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const fallback = findHomeLocation(locations) ?? findFirstValidLocation(locations);

  const map = new Map<string, SavedLocation>();

  for (const activity of enabledActivities) {
    const defaultRow = defaults.find((item) => item.activity === activity);
    const defaultLocation =
      defaultRow?.saved_location_id !== null &&
      defaultRow?.saved_location_id !== undefined
        ? byId.get(defaultRow.saved_location_id)
        : undefined;

    if (defaultLocation) {
      map.set(activity, defaultLocation);
    } else if (fallback) {
      map.set(activity, fallback);
    }
  }

  return map;
}

function buildGearNotes(day: DailyWeather) {
  const notes: string[] = [];

  if (day.stormSafety < 60) notes.push("watch storm risk closely");
  if (day.bugIndex >= 55) notes.push("bring bug spray");
  if (day.uvIndex >= 6) notes.push("bring sunscreen");
  if (day.gustMax >= 25) notes.push("expect gusty wind");
  if (day.rainChance >= 50) notes.push("bring rain gear");
  if (day.aqi >= 101) notes.push("air quality caution");

  if (notes.length === 0) {
    return "No special gear concerns.";
  }

  return `${notes.join("; ")}.`;
}

export async function generateUserPredictionsNow({
  admin,
  userId,
}: {
  admin: SupabaseAdmin;
  userId: string;
}): Promise<PredictionResult> {
  const preferences = await loadPreferences(admin, userId);
  const locations = await loadSavedLocations(admin, userId);
  const defaults = await loadActivityDefaults(admin, userId);
  const obligations = await loadWeeklyObligations(admin, userId);

  const enabledActivities =
    Array.isArray(preferences.enabled_activities) &&
    preferences.enabled_activities.length > 0
      ? preferences.enabled_activities.filter((activity) =>
          ACTIVITIES.includes(activity)
        )
      : [...DEFAULT_ENABLED_ACTIVITIES];

  if (locations.length === 0) {
    return {
      predictionsWritten: 0,
      locationsUsed: 0,
    };
  }

  const activityLocationMap = buildActivityLocationMap(
    locations,
    defaults,
    enabledActivities
  );

  const uniqueLocations = Array.from(
    new Map(
      Array.from(activityLocationMap.values()).map((location) => [
        location.id,
        location,
      ])
    ).values()
  );

  const dailyWeatherByLocationId = new Map<number, DailyWeather[]>();

  for (const location of uniqueLocations) {
    if (location.latitude === null || location.longitude === null) continue;

    const forecast = await fetchOpenMeteoForecast(
      Number(location.latitude),
      Number(location.longitude)
    );

    const airQuality = await fetchOpenMeteoAirQuality(
      Number(location.latitude),
      Number(location.longitude)
    );

    dailyWeatherByLocationId.set(
      location.id,
      aggregateDailyWeather(forecast, airQuality)
    );
  }

  const rows: Record<string, unknown>[] = [];

  for (const activity of enabledActivities) {
    const location = activityLocationMap.get(activity);

    if (!location) continue;

    const days = dailyWeatherByLocationId.get(location.id) ?? [];

    for (const day of days) {
      const base = scoreActivity(activity, day);
      const adjustment = applyPreferenceAdjustment(activity, day, preferences);
      const predictedScore = calibrateActivityScore({
        activity,
        day,
        score: base.score + adjustment,
        });
      const confidence = forecastConfidence(day.date, day);
      const planningScore = clampScore(predictedScore * 0.8 + confidence * 0.2);

      const windowRecommendation = getRecommendedWindowForActivity({
        activity,
        date: day.date,
        day,
        obligations,
      });

      const weatherSnapshot = {
        avg_temp: Math.round(day.avgTemp),
        wind_max: Math.round(day.windMax),
        gust_max: Math.round(day.gustMax),
        rain_chance: Math.round(day.rainChance),
        bug_index: Math.round(day.bugIndex),
        storm_safety: Math.round(day.stormSafety),
        water_temp_est: Math.round(day.waterTempEst),
        aqi: Math.round(day.aqi),
        uv_index: Math.round(day.uvIndex),
        cloud_cover: Math.round(day.cloudCover),
        apparent_temp: Math.round(day.apparentTemp),
        dew_point: Math.round(day.dewPoint),
        sunrise: day.sunrise,
        sunset: day.sunset,
        daylight_hours:
            day.daylightHours !== null ? Number(day.daylightHours.toFixed(1)) : null,
        };

      let explanation = base.explanation;

      if (adjustment > 1) {
        explanation += ` Your preferences increased this score by ${Math.round(
          adjustment
        )} points.`;
      } else if (adjustment < -1) {
        explanation += ` Your preferences decreased this score by ${Math.abs(
          Math.round(adjustment)
        )} points.`;
      } else {
        explanation += " Your preferences did not meaningfully change this score.";
      }

      if (location.name) {
        explanation += ` Location used: ${location.name}.`;
      }

      if (windowRecommendation.windowScore > 0) {
        explanation += ` Suggested window: ${windowRecommendation.recommendedWindow}.`;
      } else {
        explanation += " No clear open window was found around your saved schedule.";
      }

      const context = locationContext(location);

      rows.push({
        user_id: userId,
        date: day.date,
        activity,

        predicted_score: predictedScore,
        planning_score: planningScore,
        forecast_confidence: confidence,
        forecast_confidence_label: forecastConfidenceLabel(confidence),
        label: scoreLabel(predictedScore),

        recommended_window: windowRecommendation.recommendedWindow,
        window_score: windowRecommendation.windowScore,

        saved_location_id: location.id,
        location_name: location.name,
        location_context: context,

        explanation,
        gear_notes: buildGearNotes(day),

        weather_snapshot: weatherSnapshot,
        species_breakdown: null,
        best_species: null,
        best_species_score: null,

        rule_score: base.score,
        ml_score: null,
        final_score: predictedScore,
        scoring_method: "typescript_direct_user_location_hourly_windows_v2",
        model_version: "none",
        feature_json: {
          source: "typescript_api_route",
          weather_snapshot: weatherSnapshot,
          preferences,
          location_context: context,
        },
        data_quality_json: {
          prediction_source: "typescript_direct_user_location_hourly_windows_v2",
          prediction_window: "today_through_14_days",
          default_location_used: true,
          schedule_aware_window_used: true,
          window_scoring_version: "hourly_windows_v2",
          ml_used: false,
        },
        prediction_source: "typescript_api_route_hourly_windows_v2",
        generated_at: new Date().toISOString(),

        ml_status: "no_model_available",
        ml_weight: 0,
        rule_weight: 1,
        blended_score: predictedScore,
        model_input_json: {
          activity,
          date: day.date,
          weather: weatherSnapshot,
          preferences,
          location: context,
        },
        model_explanation:
          "No ML model applied yet. Using TypeScript rule-based scoring with saved/default location context.",
      });
    }
  }

  if (rows.length > 0) {
    const startDate = todayString();
    const endDate = addDaysString(14);

    const { error: deleteError } = await admin
      .from("user_predictions")
      .delete()
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (deleteError) {
      throw deleteError;
    }

    const { error } = await admin
      .from("user_predictions")
      .upsert(rows as any[], {
        onConflict: "user_id,date,activity",
      });

    if (error) {
      throw error;
    }
  }

  return {
    predictionsWritten: rows.length,
    locationsUsed: uniqueLocations.length,
  };
}