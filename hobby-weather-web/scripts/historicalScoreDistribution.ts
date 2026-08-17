import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { ACTIVITY_OPTIONS } from "../src/lib/activityMeta";
import {
  average,
  max,
  min,
  sum,
  scoreActivity,
  calibrateActivityScore,
  type DailyWeather,
  type HourlyWeatherRow,
} from "../src/lib/predictions/scoringProfiles";

type HistoricalLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

type HistoricalFetchResult = {
  data: any;
  fromCache: boolean;
};

type ActivityScoreRow = {
  location: string;
  date: string;
  activity: string;
  raw_score: number;
  calibrated_score: number;

  avg_temp: number;
  apparent_temp: number;
  dew_point: number;
  wind_max: number;
  gust_max: number;
  rain_chance: number;
  rain_total: number;
  rain_intensity_index: number;
  ground_wetness_index: number;
  air_clarity_index: number;
  light_quality_index: number;
  winter_surface_index: number;
  storm_instability_index: number;
  pollen_index: number;
};

const LOCATIONS: HistoricalLocation[] = [
  {
    name: "Home",
    latitude: 42.257725,
    longitude: -83.669312,
  },
  {
    name: "Kensington Metropark",
    latitude: 42.5552371,
    longitude: -83.632025,
  },
  {
    name: "St. Joe",
    latitude: 41.9031963,
    longitude: -85.5356726,
  },
];

const YEARS_BACK = Number(process.env.HISTORICAL_YEARS ?? 5);

const HISTORICAL_CACHE_DIR =
  process.env.HISTORICAL_CACHE_DIR ??
  path.join("outputs", "historical_weather_cache");

const HISTORICAL_CACHE_VERSION =
  process.env.HISTORICAL_CACHE_VERSION ?? "v1";

const HISTORICAL_BYPASS_CACHE =
  process.env.HISTORICAL_BYPASS_CACHE === "true";

const HISTORICAL_WRITE_CACHE =
  process.env.HISTORICAL_WRITE_CACHE !== "false";

const HISTORICAL_DAILY_CACHE_DIR =
  process.env.HISTORICAL_DAILY_CACHE_DIR ??
  path.join("outputs", "historical_daily_weather_cache");

const HISTORICAL_DAILY_CACHE_VERSION =
  process.env.HISTORICAL_DAILY_CACHE_VERSION ?? "v1";

const HISTORICAL_BYPASS_DAILY_CACHE =
  process.env.HISTORICAL_BYPASS_DAILY_CACHE === "true";

const HISTORICAL_WRITE_DAILY_CACHE =
  process.env.HISTORICAL_WRITE_DAILY_CACHE !== "false";

const HISTORICAL_CHUNK_DAYS = Number(
  process.env.HISTORICAL_CHUNK_DAYS ?? 31
);

const HISTORICAL_REQUEST_DELAY_MS = Number(
  process.env.HISTORICAL_REQUEST_DELAY_MS ?? 5000
);

const USE_FULL_HISTORICAL_VARIABLES =
  process.env.HISTORICAL_FULL !== "false";

const FULL_HISTORICAL_HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "rain",
  "snowfall",
  "snow_depth",
  "weather_code",
  "visibility",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "pressure_msl",
  "apparent_temperature",
  "dew_point_2m",
  "sunshine_duration",
  "shortwave_radiation",
  "direct_radiation",
  "diffuse_radiation",
  "cape",

  // Some archive endpoints/regions may not support these exact soil vars.
  // The fetch function falls back if the full variable set is rejected.
  "soil_temperature_0_to_7cm",
  "soil_moisture_0_to_7cm",
];

const FALLBACK_HISTORICAL_HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "rain",
  "cloud_cover",
  "wind_speed_10m",
  "wind_gusts_10m",
  "pressure_msl",
  "apparent_temperature",
  "dew_point_2m",
];

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addYears(date: Date, years: number) {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeCachePart(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function coordinateCachePart(value: number) {
  return value.toFixed(4).replace("-", "m").replace(".", "p");
}

function getHistoricalDailyWeatherCachePath({
  latitude,
  longitude,
  startDate,
  endDate,
  mode,
}: {
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  mode: string;
}) {
  const filename = [
    HISTORICAL_DAILY_CACHE_VERSION,
    safeCachePart(mode),
    coordinateCachePart(latitude),
    coordinateCachePart(longitude),
    startDate,
    endDate,
  ].join("_");

  return path.join(HISTORICAL_DAILY_CACHE_DIR, `${filename}.json`);
}

function stripDailyWeatherForCache(days: DailyWeather[]) {
  return days.map((day) => ({
    ...day,
    hourlyRows: [],
  }));
}

function readHistoricalDailyWeatherCache(cachePath: string) {
  if (HISTORICAL_BYPASS_DAILY_CACHE) {
    return null;
  }

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const text = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed as DailyWeather[];
  } catch (error) {
    console.warn(
      `[daily-cache] Could not read ${cachePath}:`,
      error instanceof Error ? error.message : error
    );

    return null;
  }
}

function writeHistoricalDailyWeatherCache(
  cachePath: string,
  days: DailyWeather[]
) {
  if (!HISTORICAL_WRITE_DAILY_CACHE) {
    return;
  }

  try {
    mkdirSync(path.dirname(cachePath), {
      recursive: true,
    });

    writeFileSync(cachePath, JSON.stringify(stripDailyWeatherForCache(days)));
  } catch (error) {
    console.warn(
      `[daily-cache] Could not write ${cachePath}:`,
      error instanceof Error ? error.message : error
    );
  }
}

function getHistoricalWeatherCachePath({
  latitude,
  longitude,
  startDate,
  endDate,
  mode,
}: {
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  mode: string;
}) {
  const filename = [
    HISTORICAL_CACHE_VERSION,
    safeCachePart(mode),
    coordinateCachePart(latitude),
    coordinateCachePart(longitude),
    startDate,
    endDate,
  ].join("_");

  return path.join(HISTORICAL_CACHE_DIR, `${filename}.json`);
}

function readHistoricalWeatherCache(cachePath: string) {
  if (HISTORICAL_BYPASS_CACHE) {
    return null;
  }

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const text = readFileSync(cachePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    console.warn(
      `[cache] Could not read ${cachePath}:`,
      error instanceof Error ? error.message : error
    );

    return null;
  }
}

function writeHistoricalWeatherCache(cachePath: string, data: unknown) {
  if (!HISTORICAL_WRITE_CACHE) {
    return;
  }

  try {
    mkdirSync(path.dirname(cachePath), {
      recursive: true,
    });

    writeFileSync(cachePath, JSON.stringify(data));
  } catch (error) {
    console.warn(
      `[cache] Could not write ${cachePath}:`,
      error instanceof Error ? error.message : error
    );
  }
}

async function fetchJsonWithRetry(
  url: string,
  {
    attempts = 4,
    timeoutMs = 90_000,
    label = "request",
  }: {
    attempts?: number;
    timeoutMs?: number;
    label?: string;
  } = {}
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[${label}] Fetch attempt ${attempt}/${attempts}`);

      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSeconds = retryAfterHeader
          ? Number(retryAfterHeader)
          : null;

        const waitMs =
          retryAfterSeconds && Number.isFinite(retryAfterSeconds)
            ? retryAfterSeconds * 1000
            : 30_000 * attempt;

        console.warn(
          `[${label}] Rate limited with 429. Waiting ${waitMs}ms before retry...`
        );

        if (attempt < attempts) {
          await sleep(waitMs);
          continue;
        }

        throw new Error(`${label} failed with status 429`);
      }

      if (
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        throw new Error(`${label} failed with retryable status ${response.status}`);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `${label} failed with status ${response.status}${
            text ? `: ${text.slice(0, 500)}` : ""
          }`
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      console.warn(
        `[${label}] Attempt ${attempt}/${attempts} failed:`,
        error instanceof Error ? error.message : error
      );

      if (attempt < attempts) {
        const waitMs = 3000 * attempt;
        console.log(`[${label}] Waiting ${waitMs}ms before retry...`);
        await sleep(waitMs);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${attempts} attempts.`);
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

function metersToMiles(value: number) {
  return value / 1609.344;
}

function dominantWeatherCode(values: number[]) {
  const counts = new Map<number, number>();

  for (const value of values) {
    if (!Number.isFinite(value)) continue;

    const rounded = Math.round(value);
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
  }

  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  );
}

function circularAverageDegrees(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) return 0;

  const radians = clean.map((value) => (value * Math.PI) / 180);

  const sinAvg = average(radians.map((value) => Math.sin(value)));
  const cosAvg = average(radians.map((value) => Math.cos(value)));

  const degrees = (Math.atan2(sinAvg, cosAvg) * 180) / Math.PI;

  return Math.round((degrees + 360) % 360);
}

function estimateHistoricalRainChance({
  rain,
  weatherCode,
}: {
  rain: number;
  weatherCode: number;
}) {
  if (rain >= 0.1) return 90;
  if (rain >= 0.03) return 70;
  if (rain >= 0.01) return 50;

  // Open-Meteo WMO codes for drizzle/rain/showers/thunderstorm ranges.
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    weatherCode >= 95
  ) {
    return 35;
  }

  return 0;
}

function calculateRainIntensityIndex(day: {
  rainTotal: number;
  maxHourlyRain: number;
  precipHours: number;
  heavyRainHours: number;
}) {
  let score = 0;

  score += Math.min(day.rainTotal, 1.5) * 25;
  score += Math.min(day.maxHourlyRain, 0.35) * 180;
  score += Math.min(day.precipHours, 12) * 2.5;
  score += day.heavyRainHours * 10;

  return clampScore(score);
}

function calculateGroundWetnessIndex(day: {
  rainChance: number;
  rainTotal: number;
  humidity: number;
  windAvg: number;
  avgTemp: number;
  soilMoisture0To1: number;
  soilMoisture1To3: number;
}) {
  let score = 0;

  score += Math.min(day.rainTotal, 1.5) * 35;
  score += day.rainChance * 0.25;
  score += Math.max(0, day.humidity - 65) * 0.35;
  score += Math.max(0, day.soilMoisture0To1) * 55;
  score += Math.max(0, day.soilMoisture1To3) * 35;

  score -= Math.max(0, day.windAvg - 8) * 1.2;
  score -= Math.max(0, day.avgTemp - 70) * 0.35;

  return clampScore(score);
}

function calculateAirClarityIndex(day: {
  visibilityMiles: number;
  pm25: number;
  pm10: number;
  aerosolOpticalDepth: number;
  dust: number;
}) {
  let score = 100;

  if (day.visibilityMiles < 1) score -= 45;
  else if (day.visibilityMiles < 3) score -= 30;
  else if (day.visibilityMiles < 6) score -= 15;

  if (day.pm25 > 35) score -= 30;
  else if (day.pm25 > 12) score -= 12;

  if (day.pm10 > 100) score -= 20;
  else if (day.pm10 > 50) score -= 10;

  if (day.aerosolOpticalDepth > 0.7) score -= 18;
  else if (day.aerosolOpticalDepth > 0.35) score -= 8;

  if (day.dust > 50) score -= 15;
  else if (day.dust > 20) score -= 7;

  return clampScore(score);
}

function calculateLightQualityIndex(day: {
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  cloudCover: number;
  sunshineMinutes: number;
  visibilityMiles: number;
  uvIndex: number;
}) {
  let score = 50;

  if (day.visibilityMiles >= 6) score += 15;
  else if (day.visibilityMiles < 3) score -= 15;

  if (day.cloudHigh >= 20 && day.cloudHigh <= 75) score += 12;
  if (day.cloudMid >= 20 && day.cloudMid <= 70) score += 8;

  if (day.cloudLow > 80) score -= 18;
  if (day.cloudCover >= 25 && day.cloudCover <= 75) score += 10;
  if (day.cloudCover > 90) score -= 10;

  if (day.sunshineMinutes >= 180) score += 8;
  if (day.uvIndex >= 3 && day.uvIndex <= 8) score += 5;

  return clampScore(score);
}

function calculateWinterSurfaceIndex(day: {
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
  rainTotal: number;
  snowfallTotal: number;
  snowDepthMax: number;
}) {
  let score = 0;

  score += Math.min(day.snowDepthMax, 12) * 6;
  score += Math.min(day.snowfallTotal, 8) * 5;

  if (day.avgTemp <= 28) score += 20;
  else if (day.avgTemp <= 34) score += 10;
  else if (day.avgTemp >= 40) score -= 25;

  if (day.minTemp < 28 && day.maxTemp > 34) score -= 15;
  if (day.rainTotal > 0.05 && day.avgTemp <= 36) score -= 20;
  if (day.rainTotal > 0.15) score -= 20;

  return clampScore(score);
}

function calculateWindVariabilityIndex(day: {
  windAvg: number;
  windMax: number;
  gustMax: number;
}) {
  const gustSpread = Math.max(0, day.gustMax - day.windAvg);
  const windSpread = Math.max(0, day.windMax - day.windAvg);

  return clampScore(gustSpread * 3 + windSpread * 2);
}

function calculateStormInstabilityIndex(day: {
  cape: number;
  stormSafety: number;
  gustMax: number;
  rainChance: number;
}) {
  let score = 0;

  score += Math.min(day.cape, 3000) / 30;
  score += Math.max(0, 100 - day.stormSafety) * 0.45;

  if (day.gustMax >= 25) score += 10;
  if (day.rainChance >= 50) score += 10;

  return clampScore(score);
}

function calculatePollenIndex(day: {
  alderPollen: number;
  birchPollen: number;
  grassPollen: number;
  mugwortPollen: number;
  olivePollen: number;
  ragweedPollen: number;
}) {
  return clampScore(
    max([
      day.alderPollen,
      day.birchPollen,
      day.grassPollen,
      day.mugwortPollen,
      day.olivePollen,
      day.ragweedPollen,
    ]) * 10
  );
}

function getHourlyNumber(
  hourly: Record<string, unknown[]>,
  key: string,
  index: number,
  fallback: number
) {
  const values = hourly[key];

  if (!Array.isArray(values)) return fallback;

  const value = Number(values[index]);

  return Number.isFinite(value) ? value : fallback;
}

async function fetchHistoricalWeatherWithVariables({
  latitude,
  longitude,
  startDate,
  endDate,
  hourlyVariables,
  label,
  cacheMode,
}: {
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  hourlyVariables: string[];
  label: string;
  cacheMode: string;
}): Promise<HistoricalFetchResult> {
  const cachePath = getHistoricalWeatherCachePath({
    latitude,
    longitude,
    startDate,
    endDate,
    mode: cacheMode,
  });

  const cached = readHistoricalWeatherCache(cachePath);

  if (cached) {
    console.log(`[cache] Hit ${cachePath}`);
    return {
        data: cached,
        fromCache: true,
    };
    }

  console.log(`[cache] Miss ${cachePath}`);

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");

  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("hourly", hourlyVariables.join(","));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");

  const data = await fetchJsonWithRetry(url.toString(), {
    label,
    attempts: 2,
    timeoutMs: 90_000,
  });

  writeHistoricalWeatherCache(cachePath, data);

    return {
    data,
    fromCache: false,
    };
}

async function fetchHistoricalWeather({
  latitude,
  longitude,
  startDate,
  endDate,
}: {
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
}): Promise<HistoricalFetchResult> {
  if (!USE_FULL_HISTORICAL_VARIABLES) {
    return fetchHistoricalWeatherWithVariables({
      latitude,
      longitude,
      startDate,
      endDate,
      hourlyVariables: FALLBACK_HISTORICAL_HOURLY_VARIABLES,
      label: `historical weather core ${startDate} to ${endDate}`,
      cacheMode: "core",
    });
  }

  try {
    return await fetchHistoricalWeatherWithVariables({
      latitude,
      longitude,
      startDate,
      endDate,
      hourlyVariables: FULL_HISTORICAL_HOURLY_VARIABLES,
      label: `historical weather full ${startDate} to ${endDate}`,
      cacheMode: "full",
    });
  } catch (error) {
    console.warn(
      `Full historical variable set failed for ${startDate} to ${endDate}. Waiting before fallback.`,
      error instanceof Error ? error.message : error
    );

    await sleep(15_000);

    return fetchHistoricalWeatherWithVariables({
      latitude,
      longitude,
      startDate,
      endDate,
      hourlyVariables: FALLBACK_HISTORICAL_HOURLY_VARIABLES,
      label: `historical weather fallback ${startDate} to ${endDate}`,
      cacheMode: "core",
    });
  }
}

async function loadHistoricalDailyWeatherChunk({
  location,
  chunk,
  cacheMode,
}: {
  location: HistoricalLocation;
  chunk: {
    startDate: string;
    endDate: string;
  };
  cacheMode: string;
}) {
  const dailyCachePath = getHistoricalDailyWeatherCachePath({
    latitude: location.latitude,
    longitude: location.longitude,
    startDate: chunk.startDate,
    endDate: chunk.endDate,
    mode: cacheMode,
  });

  const cachedDailyWeather = readHistoricalDailyWeatherCache(dailyCachePath);

  if (cachedDailyWeather) {
    console.log(`[daily-cache] Hit ${dailyCachePath}`);
    return {
      days: cachedDailyWeather,
      fromDailyCache: true,
      fromRawCache: true,
    };
  }

  console.log(`[daily-cache] Miss ${dailyCachePath}`);

  const historicalResult = await fetchHistoricalWeather({
    latitude: location.latitude,
    longitude: location.longitude,
    startDate: chunk.startDate,
    endDate: chunk.endDate,
  });

  const days = aggregateDailyWeather(historicalResult.data);

  writeHistoricalDailyWeatherCache(dailyCachePath, days);

  return {
    days: stripDailyWeatherForCache(days),
    fromDailyCache: false,
    fromRawCache: historicalResult.fromCache,
  };
}

function aggregateDailyWeather(historicalData: any) {
  const hourly = historicalData.hourly as Record<string, unknown[]>;
  const times = hourly.time ?? [];
  const buckets = new Map<string, HourlyWeatherRow[]>();

  for (let index = 0; index < times.length; index += 1) {
    const time = String(times[index]);
    const date = time.slice(0, 10);
    const hour = Number(time.slice(11, 13));

    if (!buckets.has(date)) {
      buckets.set(date, []);
    }

    const weatherCode = getHourlyNumber(hourly, "weather_code", index, 0);
    const rain = getHourlyNumber(
      hourly,
      "precipitation",
      index,
      getHourlyNumber(hourly, "rain", index, 0)
    );

    buckets.get(date)?.push({
      date,
      hour,
      temp: getHourlyNumber(hourly, "temperature_2m", index, 60),
      humidity: getHourlyNumber(hourly, "relative_humidity_2m", index, 50),
      rainChance: estimateHistoricalRainChance({
        rain,
        weatherCode,
      }),
      rain,
      wind: getHourlyNumber(hourly, "wind_speed_10m", index, 0),
      gust: getHourlyNumber(hourly, "wind_gusts_10m", index, 0),
      cloud: getHourlyNumber(hourly, "cloud_cover", index, 50),
      pressure: getHourlyNumber(hourly, "pressure_msl", index, 1015),
      apparentTemp: getHourlyNumber(hourly, "apparent_temperature", index, 60),
      dewPoint: getHourlyNumber(hourly, "dew_point_2m", index, 50),
      uv: 5,

      weatherCode,
      visibilityMiles: metersToMiles(
        getHourlyNumber(hourly, "visibility", index, 10000)
      ),
      windDirection: getHourlyNumber(hourly, "wind_direction_10m", index, 0),

      cloudLow: getHourlyNumber(hourly, "cloud_cover_low", index, 0),
      cloudMid: getHourlyNumber(hourly, "cloud_cover_mid", index, 0),
      cloudHigh: getHourlyNumber(hourly, "cloud_cover_high", index, 0),

      sunshineMinutes:
        getHourlyNumber(hourly, "sunshine_duration", index, 0) / 60,
      shortwaveRadiation: getHourlyNumber(
        hourly,
        "shortwave_radiation",
        index,
        0
      ),
      directRadiation: getHourlyNumber(hourly, "direct_radiation", index, 0),
      diffuseRadiation: getHourlyNumber(hourly, "diffuse_radiation", index, 0),

      snowfall: getHourlyNumber(hourly, "snowfall", index, 0),
      snowDepth: getHourlyNumber(hourly, "snow_depth", index, 0),

      soilTemp0: getHourlyNumber(
        hourly,
        "soil_temperature_0_to_7cm",
        index,
        50
      ),
      soilTemp6: getHourlyNumber(
        hourly,
        "soil_temperature_0_to_7cm",
        index,
        50
      ),
      soilMoisture0To1: getHourlyNumber(
        hourly,
        "soil_moisture_0_to_7cm",
        index,
        0
      ),
      soilMoisture1To3: getHourlyNumber(
        hourly,
        "soil_moisture_0_to_7cm",
        index,
        0
      ),

      cape: getHourlyNumber(hourly, "cape", index, 0),
    });
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
      daytimeRainTotal: sum(usable.map((row) => row.rain)),
      precipHours: rows.filter((row) => row.rain >= 0.01).length,
      daytimePrecipHours: usable.filter((row) => row.rain >= 0.01).length,
      maxHourlyRain: max(rows.map((row) => row.rain)),
      heavyRainHours: rows.filter((row) => row.rain >= 0.1).length,

      windAvg: average(usable.map((row) => row.wind)),
      windMax: max(usable.map((row) => row.wind)),
      gustMax: max(usable.map((row) => row.gust)),
      cloudCover: average(usable.map((row) => row.cloud)),
      pressureStart: usable[0]?.pressure ?? null,
      pressureEnd: usable[usable.length - 1]?.pressure ?? null,
      dewPoint: max(usable.map((row) => row.dewPoint)),
      apparentTemp: average(usable.map((row) => row.apparentTemp)),

      aqi: 50,
      uvIndex: 5,

      weatherCode: dominantWeatherCode(usable.map((row) => row.weatherCode)),
      visibilityMiles: average(usable.map((row) => row.visibilityMiles)),
      windDirection: circularAverageDegrees(
        usable.map((row) => row.windDirection)
      ),

      cloudLow: average(usable.map((row) => row.cloudLow)),
      cloudMid: average(usable.map((row) => row.cloudMid)),
      cloudHigh: average(usable.map((row) => row.cloudHigh)),

      sunshineMinutes: sum(usable.map((row) => row.sunshineMinutes)),
      shortwaveRadiation: average(usable.map((row) => row.shortwaveRadiation)),
      directRadiation: average(usable.map((row) => row.directRadiation)),
      diffuseRadiation: average(usable.map((row) => row.diffuseRadiation)),

      snowfallTotal: sum(rows.map((row) => row.snowfall)),
      snowDepthMax: max(rows.map((row) => row.snowDepth)),

      soilTemp0: average(usable.map((row) => row.soilTemp0)),
      soilTemp6: average(usable.map((row) => row.soilTemp6)),
      soilMoisture0To1: average(usable.map((row) => row.soilMoisture0To1)),
      soilMoisture1To3: average(usable.map((row) => row.soilMoisture1To3)),

      cape: max(usable.map((row) => row.cape)),

      pm10: 0,
      pm25: 0,
      carbonMonoxide: 0,
      nitrogenDioxide: 0,
      sulphurDioxide: 0,
      ozone: 0,
      aerosolOpticalDepth: 0,
      dust: 0,
      uvClearSky: 5,

      alderPollen: 0,
      birchPollen: 0,
      grassPollen: 0,
      mugwortPollen: 0,
      olivePollen: 0,
      ragweedPollen: 0,
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

    const rainIntensityIndex = calculateRainIntensityIndex({
      rainTotal: dailyBase.rainTotal,
      maxHourlyRain: dailyBase.maxHourlyRain,
      precipHours: dailyBase.precipHours,
      heavyRainHours: dailyBase.heavyRainHours,
    });

    const pollenIndex = calculatePollenIndex({
      alderPollen: dailyBase.alderPollen,
      birchPollen: dailyBase.birchPollen,
      grassPollen: dailyBase.grassPollen,
      mugwortPollen: dailyBase.mugwortPollen,
      olivePollen: dailyBase.olivePollen,
      ragweedPollen: dailyBase.ragweedPollen,
    });

    const groundWetnessIndex = calculateGroundWetnessIndex({
      rainChance: dailyBase.rainChance,
      rainTotal: dailyBase.rainTotal,
      humidity: dailyBase.humidity,
      windAvg: dailyBase.windAvg,
      avgTemp: dailyBase.avgTemp,
      soilMoisture0To1: dailyBase.soilMoisture0To1,
      soilMoisture1To3: dailyBase.soilMoisture1To3,
    });

    const airClarityIndex = calculateAirClarityIndex({
      visibilityMiles: dailyBase.visibilityMiles,
      pm25: dailyBase.pm25,
      pm10: dailyBase.pm10,
      aerosolOpticalDepth: dailyBase.aerosolOpticalDepth,
      dust: dailyBase.dust,
    });

    const lightQualityIndex = calculateLightQualityIndex({
      cloudLow: dailyBase.cloudLow,
      cloudMid: dailyBase.cloudMid,
      cloudHigh: dailyBase.cloudHigh,
      cloudCover: dailyBase.cloudCover,
      sunshineMinutes: dailyBase.sunshineMinutes,
      visibilityMiles: dailyBase.visibilityMiles,
      uvIndex: dailyBase.uvIndex,
    });

    const winterSurfaceIndex = calculateWinterSurfaceIndex({
      avgTemp: dailyBase.avgTemp,
      minTemp: dailyBase.minTemp,
      maxTemp: dailyBase.maxTemp,
      rainTotal: dailyBase.rainTotal,
      snowfallTotal: dailyBase.snowfallTotal,
      snowDepthMax: dailyBase.snowDepthMax,
    });

    const windVariabilityIndex = calculateWindVariabilityIndex({
      windAvg: dailyBase.windAvg,
      windMax: dailyBase.windMax,
      gustMax: dailyBase.gustMax,
    });

    const stormInstabilityIndex = calculateStormInstabilityIndex({
      cape: dailyBase.cape,
      stormSafety,
      gustMax: dailyBase.gustMax,
      rainChance: dailyBase.rainChance,
    });

    days.push({
      date,
      ...dailyBase,
      pressureChange,
      bugIndex,
      stormSafety,
      rainIntensityIndex,
      waterTempEst: average([
        dailyBase.avgTemp,
        dailyBase.minTemp,
        dailyBase.maxTemp,
      ]),

      pollenIndex,
      groundWetnessIndex,
      airClarityIndex,
      lightQualityIndex,
      winterSurfaceIndex,
      windVariabilityIndex,
      stormInstabilityIndex,

      hourlyRows: rows,
      sunrise: null,
      sunset: null,
      daylightHours: null,
    });
  }

  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;

  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function summarizeScores(rows: ActivityScoreRow[]) {
  const groups = new Map<string, ActivityScoreRow[]>();

  for (const row of rows) {
    const key = `${row.location}|||${row.activity}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)?.push(row);
  }

  const summaries = [];

  for (const [key, groupRows] of groups.entries()) {
    const [location, activity] = key.split("|||");
    const scores = groupRows.map((row) => row.calibrated_score);
    const rawScores = groupRows.map((row) => row.raw_score);

    const days = scores.length;
    const avgScore = average(scores);
    const minScore = min(scores);
    const maxScore = max(scores);
    const rawAvgScore = average(rawScores);
    const rawMaxScore = max(rawScores);

    const pct70 = (scores.filter((score) => score >= 70).length / days) * 100;
    const pct85 = (scores.filter((score) => score >= 85).length / days) * 100;
    const pct95 = (scores.filter((score) => score >= 95).length / days) * 100;
    const pct100 = (scores.filter((score) => score >= 100).length / days) * 100;

    const flags: string[] = [];

    if (pct85 === 0 && maxScore < 85) {
    flags.push("NO_GREAT_DAYS");
    }

    if (pct70 < 5) {
    flags.push("VERY_FEW_GOOD_DAYS");
    }

    if (pct85 > 45) {
    flags.push("TOO_MANY_GREAT_DAYS");
    }

    if (pct95 > 5) {
    flags.push("TOO_MANY_EXCEPTIONAL_DAYS");
    }

    if (maxScore < 70) {
    flags.push("MAX_TOO_LOW");
    }

    if (avgScore > 80) {
    flags.push("AVG_TOO_HIGH");
    }

    if (avgScore < 35) {
    flags.push("AVG_TOO_LOW");
    }

    summaries.push({
      location,
      activity,
      days,
      min_score: Math.round(minScore),
      avg_score: Number(avgScore.toFixed(1)),
      p50: Math.round(percentile(scores, 50)),
      p75: Math.round(percentile(scores, 75)),
      p90: Math.round(percentile(scores, 90)),
      p95: Math.round(percentile(scores, 95)),
      max_score: Math.round(maxScore),
      pct_70_plus: Number(pct70.toFixed(1)),
      pct_85_plus: Number(pct85.toFixed(1)),
      pct_95_plus: Number(pct95.toFixed(1)),
      pct_100: Number(pct100.toFixed(1)),
      raw_avg_score: Number(rawAvgScore.toFixed(1)),
      raw_max_score: Math.round(rawMaxScore),
      calibration_flags: flags.join("|"),
    });
  }

  return summaries.sort((a, b) => {
    if (a.location !== b.location) {
      return a.location.localeCompare(b.location);
    }

    return a.activity.localeCompare(b.activity);
  });
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);

  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\n");
}

function getHistoricalChunks(startDate: string, endDate: string) {
  const chunks: {
    startDate: string;
    endDate: string;
  }[] = [];

  let cursor = new Date(`${startDate}T12:00:00`);
  const final = new Date(`${endDate}T12:00:00`);

  while (cursor <= final) {
    const chunkStart = new Date(cursor);
    const chunkEnd = addDays(chunkStart, HISTORICAL_CHUNK_DAYS - 1);

    if (chunkEnd > final) {
      chunkEnd.setTime(final.getTime());
    }

    chunks.push({
      startDate: toDateString(chunkStart),
      endDate: toDateString(chunkEnd),
    });

    cursor = addDays(chunkEnd, 1);
  }

  return chunks;
}

async function main() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 3);

  const start = addYears(end, -YEARS_BACK);

  const startDate = toDateString(start);
  const endDate = toDateString(end);

  console.log(`Generating historical score distribution.`);
  console.log(`Range: ${startDate} to ${endDate}`);
  console.log(`Years back: ${YEARS_BACK}`);
  console.log(`Activities: ${ACTIVITY_OPTIONS.length}`);
  console.log(`Locations: ${LOCATIONS.length}`);
  console.log(`Historical cache dir: ${HISTORICAL_CACHE_DIR}`);
  console.log(`Historical cache version: ${HISTORICAL_CACHE_VERSION}`);
  console.log(`Bypass cache: ${HISTORICAL_BYPASS_CACHE}`);
  console.log(`Write cache: ${HISTORICAL_WRITE_CACHE}`);
  console.log(`Historical daily cache dir: ${HISTORICAL_DAILY_CACHE_DIR}`);
  console.log(`Historical daily cache version: ${HISTORICAL_DAILY_CACHE_VERSION}`);
  console.log(`Bypass daily cache: ${HISTORICAL_BYPASS_DAILY_CACHE}`);
  console.log(`Write daily cache: ${HISTORICAL_WRITE_DAILY_CACHE}`);

  const allRows: ActivityScoreRow[] = [];
  const chunks = getHistoricalChunks(startDate, endDate);

  for (const location of LOCATIONS) {
    console.log(`Fetching historical weather for ${location.name}...`);

    const dailyWeather: DailyWeather[] = [];

    const cacheMode = USE_FULL_HISTORICAL_VARIABLES ? "full" : "core";

    for (const chunk of chunks) {
    console.log(
        `Loading ${location.name}: ${chunk.startDate} to ${chunk.endDate}`
    );

    const dailyResult = await loadHistoricalDailyWeatherChunk({
        location,
        chunk,
        cacheMode,
    });

    dailyWeather.push(...dailyResult.days);

    // Be polite to the free API only after actual network requests.
    // Daily-cache and raw-cache hits should not wait.
    if (
        !dailyResult.fromDailyCache &&
        !dailyResult.fromRawCache &&
        HISTORICAL_REQUEST_DELAY_MS > 0
    ) {
        await sleep(HISTORICAL_REQUEST_DELAY_MS);
    }
    }

    console.log(`Daily weather rows for ${location.name}: ${dailyWeather.length}`);

    for (const day of dailyWeather) {
      for (const activity of ACTIVITY_OPTIONS) {
        const scored = scoreActivity(activity, day);

        const calibratedScore = calibrateActivityScore({
          activity,
          day,
          score: scored.score,
        });

        allRows.push({
          location: location.name,
          date: day.date,
          activity,
          raw_score: scored.score,
          calibrated_score: calibratedScore,

          avg_temp: Number(day.avgTemp.toFixed(1)),
          apparent_temp: Number(day.apparentTemp.toFixed(1)),
          dew_point: Number(day.dewPoint.toFixed(1)),
          wind_max: Number(day.windMax.toFixed(1)),
          gust_max: Number(day.gustMax.toFixed(1)),
          rain_chance: Math.round(day.rainChance),
          rain_total: Number(day.rainTotal.toFixed(2)),
          rain_intensity_index: Math.round(day.rainIntensityIndex),
          ground_wetness_index: Math.round(day.groundWetnessIndex),
          air_clarity_index: Math.round(day.airClarityIndex),
          light_quality_index: Math.round(day.lightQualityIndex),
          winter_surface_index: Math.round(day.winterSurfaceIndex),
          storm_instability_index: Math.round(day.stormInstabilityIndex),
          pollen_index: Math.round(day.pollenIndex),
        });
      }
    }
  }

  const summaries = summarizeScores(allRows);

  mkdirSync("outputs", { recursive: true });

  const summaryPath = "outputs/historical_score_summary.csv";
  const dailyPath = "outputs/historical_daily_scores.csv";

  writeFileSync(summaryPath, toCsv(summaries));
  writeFileSync(dailyPath, toCsv(allRows));

  console.table(
    summaries.map((row) => ({
      location: row.location,
      activity: row.activity,
      days: row.days,
      avg: row.avg_score,
      p90: row.p90,
      p95: row.p95,
      max: row.max_score,
      pct95: row.pct_95_plus,
      pct100: row.pct_100,
      rawAvg: row.raw_avg_score,
      rawMax: row.raw_max_score,
      flags: row.calibration_flags,
    }))
  );

  console.log(`Saved summary to ${summaryPath}`);
  console.log(`Saved daily rows to ${dailyPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});