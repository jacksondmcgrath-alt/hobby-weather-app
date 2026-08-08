import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVITIES = [
  "Fishing",
  "Camping",
  "Running",
  "Kayaking",
  "Disc Golf",
  "Tennis",
  "Beach Day",
];

const DEFAULT_PREFERENCES = {
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

type Preferences = typeof DEFAULT_PREFERENCES;

type DailyWeather = {
  date: string;
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
  humidity: number;
  rainChance: number;
  rainTotal: number;
  windAvg: number;
  windMax: number;
  gustMax: number;
  cloudCover: number;
  pressureStart: number | null;
  pressureEnd: number | null;
  pressureChange: number;
  dewPoint: number;
  apparentTemp: number;
  aqi: number;
  uvIndex: number;
  bugIndex: number;
  stormSafety: number;
  waterTempEst: number;
  hourlyRows: HourlyWeatherRow[];
};

type PredictionResult = {
  predictionsWritten: number;
  locationsUsed: number;
};

type WeeklyObligation = {
  id: number;
  label: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  active: boolean | null;
};

type HourlyWeatherRow = {
  date: string;
  hour: number;
  temp: number;
  humidity: number;
  rainChance: number;
  rain: number;
  wind: number;
  gust: number;
  cloud: number;
  pressure: number;
  apparentTemp: number;
  dewPoint: number;
  uv: number;
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

function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) return 0;

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function max(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) return 0;

  return Math.max(...clean);
}

function min(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) return 0;

  return Math.min(...clean);
}

function sum(values: number[]) {
  return values
    .filter((value) => Number.isFinite(value))
    .reduce((total, value) => total + value, 0);
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function rangeScore(
  value: number,
  idealLow: number,
  idealHigh: number,
  absoluteLow: number,
  absoluteHigh: number
) {
  if (value >= idealLow && value <= idealHigh) return 100;
  if (value <= absoluteLow || value >= absoluteHigh) return 0;

  if (value < idealLow) {
    return clampScore(
      ((value - absoluteLow) / (idealLow - absoluteLow)) * 100
    );
  }

  return clampScore(
    ((absoluteHigh - value) / (absoluteHigh - idealHigh)) * 100
  );
}

function lowIsGoodScore(value: number, idealMax: number, badAt: number) {
  if (value <= idealMax) return 100;
  if (value >= badAt) return 0;

  return clampScore(100 - ((value - idealMax) / (badAt - idealMax)) * 100);
}

function scoreLabel(score: number) {
  if (score >= 80) return "Great";
  if (score >= 65) return "Good";
  if (score >= 50) return "Okay";
  if (score >= 35) return "Poor";
  return "Bad";
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

  return adjustment;
}

function scoreActivity(activity: string, day: DailyWeather) {
  let score = 50;
  const reasons: string[] = [];

  if (activity === "Running") {
    const tempScore = rangeScore(day.avgTemp, 45, 60, 25, 82);
    const windScore = lowIsGoodScore(day.windMax, 8, 22);
    const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
    const aqiScore = lowIsGoodScore(day.aqi, 50, 150);

    score =
      tempScore * 0.38 +
      windScore * 0.2 +
      rainScore * 0.15 +
      day.stormSafety * 0.12 +
      aqiScore * 0.15;

    if (day.avgTemp >= 45 && day.avgTemp <= 60) reasons.push("comfortable running temperatures");
    if (day.windMax <= 8) reasons.push("light wind");
    if (day.rainChance <= 20) reasons.push("low rain chances");
    if (day.aqi > 100) reasons.push("air quality may be a concern");
  }

  if (activity === "Fishing") {
    const tempScore = rangeScore(day.avgTemp, 50, 75, 35, 90);
    const windScore =
      day.windMax < 4
        ? 70
        : day.windMax <= 12
          ? 100
          : lowIsGoodScore(day.windMax, 12, 25);
    const rainScore = lowIsGoodScore(day.rainChance, 40, 90);
    const waterScore = rangeScore(day.waterTempEst, 55, 72, 40, 84);

    score =
      tempScore * 0.22 +
      windScore * 0.22 +
      rainScore * 0.12 +
      waterScore * 0.22 +
      day.stormSafety * 0.12 +
      day.bugIndex * 0.1;

    if (day.windMax >= 4 && day.windMax <= 12) reasons.push("useful light chop");
    if (day.waterTempEst >= 55 && day.waterTempEst <= 72) reasons.push("good estimated water temperature");
    if (day.bugIndex >= 35 && day.bugIndex <= 75) reasons.push("insect activity may help fishing");
  }

  if (activity === "Camping") {
    const tempScore = rangeScore(day.avgTemp, 65, 80, 45, 95);
    const bugComfort = lowIsGoodScore(day.bugIndex, 25, 85);
    const rainScore = lowIsGoodScore(day.rainChance, 20, 75);

    score =
      tempScore * 0.35 +
      bugComfort * 0.2 +
      rainScore * 0.2 +
      day.stormSafety * 0.25;

    if (day.avgTemp >= 65 && day.avgTemp <= 80) reasons.push("comfortable camping temperatures");
    if (day.bugIndex > 60) reasons.push("bugs may be annoying");
    if (day.rainChance <= 20) reasons.push("low rain risk");
  }

  if (activity === "Kayaking") {
    const tempScore = rangeScore(day.avgTemp, 65, 85, 50, 95);
    const waterScore = rangeScore(day.waterTempEst, 60, 78, 45, 88);
    const windScore = lowIsGoodScore(day.windMax, 8, 20);
    const gustScore = lowIsGoodScore(day.gustMax, 15, 32);
    const rainScore = lowIsGoodScore(day.rainChance, 20, 75);

    score =
      tempScore * 0.2 +
      waterScore * 0.18 +
      windScore * 0.24 +
      gustScore * 0.16 +
      rainScore * 0.1 +
      day.stormSafety * 0.12;

    if (day.windMax <= 8) reasons.push("low wind");
    if (day.gustMax <= 15) reasons.push("manageable gusts");
    if (day.waterTempEst >= 60) reasons.push("reasonable water temperature");
  }

  if (activity === "Disc Golf") {
    const tempScore = rangeScore(day.avgTemp, 50, 78, 35, 92);
    const windScore = lowIsGoodScore(day.windMax, 10, 25);
    const rainScore = lowIsGoodScore(day.rainChance, 25, 80);
    const bugComfort = lowIsGoodScore(day.bugIndex, 35, 85);

    score =
      tempScore * 0.35 +
      windScore * 0.25 +
      rainScore * 0.18 +
      day.stormSafety * 0.15 +
      bugComfort * 0.07;

    if (day.windMax <= 10) reasons.push("manageable wind");
    if (day.avgTemp >= 50 && day.avgTemp <= 78) reasons.push("good disc golf temperatures");
  }

  if (activity === "Tennis") {
    const tempScore = rangeScore(day.avgTemp, 55, 78, 40, 95);
    const windScore = lowIsGoodScore(day.windMax, 10, 24);
    const rainScore = lowIsGoodScore(day.rainChance, 15, 70);

    score =
      tempScore * 0.4 +
      windScore * 0.25 +
      rainScore * 0.2 +
      day.stormSafety * 0.15;

    if (day.avgTemp >= 55 && day.avgTemp <= 78) reasons.push("comfortable tennis temperatures");
    if (day.windMax <= 10) reasons.push("manageable wind");
  }

  if (activity === "Beach Day") {
    const tempScore = rangeScore(day.avgTemp, 75, 90, 60, 100);
    const rainScore = lowIsGoodScore(day.rainChance, 20, 80);
    const windScore = lowIsGoodScore(day.windMax, 16, 30);
    const uvScore = rangeScore(day.uvIndex, 3, 8, 0, 11);
    const waterScore = rangeScore(day.waterTempEst, 68, 82, 55, 90);

    score =
      tempScore * 0.32 +
      rainScore * 0.2 +
      windScore * 0.14 +
      uvScore * 0.12 +
      waterScore * 0.12 +
      day.stormSafety * 0.1;

    if (day.avgTemp >= 75) reasons.push("warm beach temperatures");
    if (day.rainChance <= 20) reasons.push("low rain chances");
  }

  if (day.stormSafety < 45) {
    score = Math.min(score, 45);
    reasons.push("storm risk limits the score");
  }

  return {
    score: clampScore(score),
    explanation:
      reasons.length > 0
        ? `${activity} score is driven by ${reasons.join(", ")}.`
        : `Mixed conditions for ${activity}.`,
  };
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

function aggregateDailyWeather(forecastData: any, airQualityData: any) {
  const hourly = forecastData.hourly;

  const buckets = new Map<string, any[]>();

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
        hourlyRows: rows as HourlyWeatherRow[],
        });
  }

  return days.sort((a, b) => a.date.localeCompare(b.date));
}

async function loadPreferences(admin: SupabaseAdmin, userId: string) {
  const preferences = { ...DEFAULT_PREFERENCES };

  const { data, error } = await admin
    .from("app_preferences")
    .select("settings")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as {
    settings: Partial<Preferences> | null;
  }[];

  const settings = rows[0]?.settings;

  if (settings && typeof settings === "object") {
    Object.assign(preferences, settings);
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

  return (data ?? []) as unknown as WeeklyObligation[];
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
  defaults: ActivityDefault[]
) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const fallback = findHomeLocation(locations) ?? findFirstValidLocation(locations);

  const map = new Map<string, SavedLocation>();

  for (const activity of ACTIVITIES) {
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

type CandidateWindow = {
  label: string;
  start: string;
  end: string;
  baseScore: number;
};

const BASE_WINDOWS: Record<string, CandidateWindow> = {
  morning: {
    label: "Morning",
    start: "7:00 AM",
    end: "10:00 AM",
    baseScore: 70,
  },
  midday: {
    label: "Midday",
    start: "11:00 AM",
    end: "2:00 PM",
    baseScore: 65,
  },
  afternoon: {
    label: "Afternoon",
    start: "3:00 PM",
    end: "6:00 PM",
    baseScore: 70,
  },
  evening: {
    label: "Evening",
    start: "6:00 PM",
    end: "9:00 PM",
    baseScore: 75,
  },
};

const ACTIVITY_WINDOW_PREFERENCES: Record<string, string[]> = {
  Fishing: ["morning", "evening", "afternoon", "midday"],
  Running: ["morning", "evening", "afternoon", "midday"],
  Kayaking: ["midday", "afternoon", "morning", "evening"],
  "Disc Golf": ["morning", "afternoon", "evening", "midday"],
  Tennis: ["morning", "evening", "afternoon", "midday"],
  "Beach Day": ["midday", "afternoon", "morning", "evening"],
  Camping: ["afternoon", "morning", "evening", "midday"],
};

function formatWindow(start: string, end: string) {
  return `${start}–${end}`;
}

function parseClockTimeToMinutes(timeText: string | null) {
  if (!timeText) return null;

  const hhmmMatch = timeText.match(/^(\d{1,2}):(\d{2})$/);

  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const minutes = Number(hhmmMatch[2]);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

    return hours * 60 + minutes;
  }

  const date = new Date(`2000-01-01 ${timeText}`);

  if (Number.isNaN(date.getTime())) return null;

  return date.getHours() * 60 + date.getMinutes();
}

function rangesOverlap(
  first: { start: number; end: number },
  second: { start: number; end: number }
) {
  return first.start < second.end && second.start < first.end;
}

function getAppDayOfWeek(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  const jsDay = date.getDay(); // Sunday = 0

  // App schedule uses Monday = 0, Sunday = 6
  return jsDay === 0 ? 6 : jsDay - 1;
}

function windowConflictsWithObligations({
  date,
  start,
  end,
  obligations,
}: {
  date: string;
  start: string;
  end: string;
  obligations: WeeklyObligation[];
}) {
  const dayOfWeek = getAppDayOfWeek(date);

  const windowStart = parseClockTimeToMinutes(start);
  const windowEnd = parseClockTimeToMinutes(end);

  if (windowStart === null || windowEnd === null) {
    return true;
  }

  const normalizedWindow = {
    start: windowStart,
    end: windowEnd <= windowStart ? windowEnd + 24 * 60 : windowEnd,
  };

  const dayObligations = obligations.filter(
    (item) => item.active !== false && item.day_of_week === dayOfWeek
  );

  return dayObligations.some((item) => {
    const obligationStart = parseClockTimeToMinutes(item.start_time);
    const obligationEnd = parseClockTimeToMinutes(item.end_time);

    if (obligationStart === null || obligationEnd === null) {
      return false;
    }

    return rangesOverlap(normalizedWindow, {
      start: obligationStart,
      end:
        obligationEnd <= obligationStart
          ? obligationEnd + 24 * 60
          : obligationEnd,
    });
  });
}

function getHourlyRowsForWindow({
  day,
  start,
  end,
}: {
  day: DailyWeather;
  start: string;
  end: string;
}) {
  const startMinutes = parseClockTimeToMinutes(start);
  const endMinutes = parseClockTimeToMinutes(end);

  if (startMinutes === null || endMinutes === null) {
    return [];
  }

  const normalizedEnd =
    endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;

  return day.hourlyRows.filter((row) => {
    const rowMinutes = row.hour * 60;

    return rowMinutes >= startMinutes && rowMinutes < normalizedEnd;
  });
}

function scoreWindowWeatherForActivity({
  activity,
  day,
  window,
}: {
  activity: string;
  day: DailyWeather;
  window: CandidateWindow;
}) {
  const rows = getHourlyRowsForWindow({
    day,
    start: window.start,
    end: window.end,
  });

  if (rows.length === 0) {
    return 40;
  }

  const avgTemp = average(rows.map((row) => row.temp));
  const maxWind = max(rows.map((row) => row.wind));
  const maxGust = max(rows.map((row) => row.gust));
  const maxRainChance = max(rows.map((row) => row.rainChance));
  const avgCloud = average(rows.map((row) => row.cloud));
  const maxUv = max(rows.map((row) => row.uv));
  const maxDewPoint = max(rows.map((row) => row.dewPoint));

  if (activity === "Running") {
    const tempScore = rangeScore(avgTemp, 45, 62, 25, 82);
    const windScore = lowIsGoodScore(maxWind, 8, 22);
    const rainScore = lowIsGoodScore(maxRainChance, 20, 75);
    const dewScore = lowIsGoodScore(maxDewPoint, 58, 72);
    const aqiScore = lowIsGoodScore(day.aqi, 50, 150);

    return clampScore(
      tempScore * 0.35 +
        windScore * 0.18 +
        rainScore * 0.17 +
        dewScore * 0.12 +
        aqiScore * 0.12 +
        day.stormSafety * 0.06
    );
  }

  if (activity === "Fishing") {
    const tempScore = rangeScore(avgTemp, 50, 76, 35, 92);
    const windScore =
      maxWind < 4
        ? 75
        : maxWind <= 12
          ? 100
          : lowIsGoodScore(maxWind, 12, 26);
    const rainScore = lowIsGoodScore(maxRainChance, 45, 90);
    const waterScore = rangeScore(day.waterTempEst, 55, 72, 40, 84);
    const bugScore = rangeScore(day.bugIndex, 35, 75, 10, 95);

    return clampScore(
      tempScore * 0.18 +
        windScore * 0.24 +
        rainScore * 0.12 +
        waterScore * 0.22 +
        bugScore * 0.12 +
        day.stormSafety * 0.12
    );
  }

  if (activity === "Kayaking") {
    const tempScore = rangeScore(avgTemp, 65, 85, 50, 95);
    const windScore = lowIsGoodScore(maxWind, 8, 20);
    const gustScore = lowIsGoodScore(maxGust, 15, 32);
    const rainScore = lowIsGoodScore(maxRainChance, 20, 75);
    const waterScore = rangeScore(day.waterTempEst, 60, 78, 45, 88);

    return clampScore(
      tempScore * 0.18 +
        windScore * 0.28 +
        gustScore * 0.18 +
        rainScore * 0.12 +
        waterScore * 0.14 +
        day.stormSafety * 0.1
    );
  }

  if (activity === "Disc Golf") {
    const tempScore = rangeScore(avgTemp, 50, 78, 35, 92);
    const windScore = lowIsGoodScore(maxWind, 10, 25);
    const rainScore = lowIsGoodScore(maxRainChance, 25, 80);
    const cloudScore = lowIsGoodScore(avgCloud, 35, 95);

    return clampScore(
      tempScore * 0.34 +
        windScore * 0.28 +
        rainScore * 0.2 +
        cloudScore * 0.06 +
        day.stormSafety * 0.12
    );
  }

  if (activity === "Tennis") {
    const tempScore = rangeScore(avgTemp, 55, 78, 40, 95);
    const windScore = lowIsGoodScore(maxWind, 10, 24);
    const rainScore = lowIsGoodScore(maxRainChance, 15, 70);

    return clampScore(
      tempScore * 0.4 +
        windScore * 0.26 +
        rainScore * 0.22 +
        day.stormSafety * 0.12
    );
  }

  if (activity === "Beach Day") {
    const tempScore = rangeScore(avgTemp, 75, 90, 60, 100);
    const rainScore = lowIsGoodScore(maxRainChance, 20, 80);
    const windScore = lowIsGoodScore(maxWind, 16, 32);
    const uvScore = rangeScore(maxUv, 3, 8, 0, 11);
    const waterScore = rangeScore(day.waterTempEst, 68, 82, 55, 90);

    return clampScore(
      tempScore * 0.32 +
        rainScore * 0.2 +
        windScore * 0.14 +
        uvScore * 0.12 +
        waterScore * 0.12 +
        day.stormSafety * 0.1
    );
  }

  if (activity === "Camping") {
    const tempScore = rangeScore(avgTemp, 65, 82, 45, 95);
    const rainScore = lowIsGoodScore(maxRainChance, 20, 75);
    const bugComfort = lowIsGoodScore(day.bugIndex, 30, 85);

    return clampScore(
      tempScore * 0.38 +
        rainScore * 0.24 +
        bugComfort * 0.18 +
        day.stormSafety * 0.2
    );
  }

  return clampScore(day.stormSafety * 0.4 + window.baseScore * 0.6);
}

function getRecommendedWindowForActivity({
  activity,
  date,
  day,
  obligations,
}: {
  activity: string;
  date: string;
  day: DailyWeather;
  obligations: WeeklyObligation[];
}) {
  const preferenceKeys =
    ACTIVITY_WINDOW_PREFERENCES[activity] ?? [
      "morning",
      "afternoon",
      "evening",
      "midday",
    ];

  const candidates = preferenceKeys
    .map((key, index) => {
      const baseWindow = BASE_WINDOWS[key];

      if (!baseWindow) return null;

      const weatherScore = scoreWindowWeatherForActivity({
        activity,
        day,
        window: baseWindow,
      });

      const preferenceBonus = (preferenceKeys.length - index) * 4;

      return {
        ...baseWindow,
        preferenceRank: index,
        weatherScore,
        score: clampScore(weatherScore * 0.82 + preferenceBonus),
      };
    })
    .filter(
      (
        item
      ): item is CandidateWindow & {
        preferenceRank: number;
        weatherScore: number;
        score: number;
      } => item !== null
    );

  const openCandidates = candidates.filter(
    (candidate) =>
      !windowConflictsWithObligations({
        date,
        start: candidate.start,
        end: candidate.end,
        obligations,
      })
  );

  if (openCandidates.length === 0) {
    return {
      recommendedWindow: "No clear open window",
      windowScore: 0,
    };
  }

  const best = openCandidates.sort((a, b) => b.score - a.score)[0];

  return {
    recommendedWindow: formatWindow(best.start, best.end),
    windowScore: best.score,
  };
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

  if (locations.length === 0) {
    return {
      predictionsWritten: 0,
      locationsUsed: 0,
    };
  }

  const activityLocationMap = buildActivityLocationMap(locations, defaults);

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

  for (const activity of ACTIVITIES) {
    const location = activityLocationMap.get(activity);

    if (!location) continue;

    const days = dailyWeatherByLocationId.get(location.id) ?? [];

    for (const day of days) {
      const base = scoreActivity(activity, day);
      const adjustment = applyPreferenceAdjustment(activity, day, preferences);
      const predictedScore = clampScore(base.score + adjustment);
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
        location_context: locationContext(location),

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
          location_context: locationContext(location),
        },
        data_quality_json: {
          prediction_source: "typescript_api_route_hourly_windows_v2",
          prediction_window: "today_through_14_days",
          default_location_used: true,
          schedule_aware_window_used: true,
          window_scoring_version: "hourly_windows_v2",
          ml_used: false,
        },
        prediction_source: "typescript_direct_user_location_hourly_windows_v2",
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
          location: locationContext(location),
        },
        model_explanation:
          "No ML model applied yet. Using TypeScript rule-based scoring with saved/default location context.",
      });
    }
  }

  if (rows.length > 0) {
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