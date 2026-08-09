import {
  average,
  max,
  min,
  sum,
  clampScore,
  type DailyWeather,
  type HourlyWeatherRow,
} from "@/lib/predictions/scoringProfiles";
import { isDateInAllowedWindow } from "@/lib/server/lumora/dates";

export function calculateBugIndex(day: {
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

export function stormSafetyScore(day: {
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

export async function fetchOpenMeteoForecast(
  latitude: number,
  longitude: number
) {
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
  url.searchParams.set("daily", "sunrise,sunset,daylight_duration");
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

export async function fetchOpenMeteoAirQuality(
  latitude: number,
  longitude: number
) {
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

export function buildSunDataByDate(forecastData: any) {
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

export function aggregateDailyWeather(
  forecastData: any,
  airQualityData: any
) {
  const hourly = forecastData.hourly;
  const buckets = new Map<string, HourlyWeatherRow[]>();
  const sunDataByDate = buildSunDataByDate(forecastData);

  for (let index = 0; index < hourly.time.length; index += 1) {
    const time = String(hourly.time[index]);
    const date = time.slice(0, 10);
    const hour = Number(time.slice(11, 13));

    if (!isDateInAllowedWindow(date)) continue;

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

      if (!isDateInAllowedWindow(date)) continue;

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

export function buildWeatherSnapshot(day: DailyWeather) {
  return {
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
}

export type WeatherBundle = {
  forecast: any;
  airQuality: any;
};

export type WeatherCacheAdminLike = any;

export function weatherCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

function roundedCoordinate(value: number) {
  return Number(value.toFixed(2));
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function fetchWeatherBundleDirect(
  latitude: number,
  longitude: number
): Promise<WeatherBundle> {
  const [forecast, airQuality] = await Promise.all([
    fetchOpenMeteoForecast(latitude, longitude),
    fetchOpenMeteoAirQuality(latitude, longitude),
  ]);

  return {
    forecast,
    airQuality,
  };
}

function parseCachedWeatherBundle(dataJson: unknown): WeatherBundle | null {
  if (!dataJson || typeof dataJson !== "object") {
    return null;
  }

  const value = dataJson as {
    forecast?: unknown;
    airQuality?: unknown;
  };

  if (!value.forecast) {
    return null;
  }

  return {
    forecast: value.forecast,
    airQuality: value.airQuality ?? null,
  };
}

export async function fetchWeatherBundleWithCache({
  admin,
  latitude,
  longitude,
  ttlHours = 3,
  jobSource = "nextjs_api",
}: {
  admin?: WeatherCacheAdminLike;
  latitude: number;
  longitude: number;
  ttlHours?: number;
  jobSource?: string;
}): Promise<WeatherBundle> {
  if (!admin) {
    return fetchWeatherBundleDirect(latitude, longitude);
  }

  const key = weatherCacheKey(latitude, longitude);
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: cachedData, error: cacheReadError } = await admin
    .from("environment_cache")
    .select("id,data_json,expires_at")
    .eq("data_type", "weather_forecast_bundle")
    .eq("source", "open_meteo")
    .eq("cache_key", key)
    .gt("expires_at", nowIso)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cacheReadError && cachedData?.data_json) {
    const cachedBundle = parseCachedWeatherBundle(cachedData.data_json);

    if (cachedBundle) {
      return cachedBundle;
    }
  }

  const bundle = await fetchWeatherBundleDirect(latitude, longitude);

  const fetchedAt = new Date();
  const expiresAt = addHours(fetchedAt, ttlHours);

  const row = {
    cache_key: key,
    location_id: null,
    data_type: "weather_forecast_bundle",
    source: "open_meteo",
    data_json: {
      cache_key: key,
      latitude_rounded: roundedCoordinate(latitude),
      longitude_rounded: roundedCoordinate(longitude),
      forecast: bundle.forecast,
      airQuality: bundle.airQuality,
    },
    fetched_at: fetchedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    job_source: jobSource,
    updated_at: fetchedAt.toISOString(),
  };

  const { error: cacheWriteError } = await admin
    .from("environment_cache")
    .upsert(row, {
      onConflict: "data_type,source,cache_key",
    });

  if (cacheWriteError) {
    console.warn("Could not write weather forecast cache:", cacheWriteError);
  }

  return bundle;
}