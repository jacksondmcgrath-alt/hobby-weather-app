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

function calculateRainIntensityIndex(day: {
  rainTotal: number;
  maxHourlyRain: number;
  precipHours: number;
  heavyRainHours: number;
}) {
  let score = 0;

  // Total daily rain matters, but not as much as intense hourly bursts.
  score += Math.min(day.rainTotal, 1.5) * 25;

  // Hourly rain intensity is the strongest signal.
  // Around 0.10 in/hr is meaningful, 0.25+ in/hr is heavy.
  score += Math.min(day.maxHourlyRain, 0.35) * 180;

  // Duration matters too, but should not dominate.
  score += Math.min(day.precipHours, 12) * 2.5;

  // Heavy rain hours should push the index up quickly.
  score += day.heavyRainHours * 10;

  return clampScore(score);
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
        "wind_direction_10m",
        "cloud_cover",
        "cloud_cover_low",
        "cloud_cover_mid",
        "cloud_cover_high",
        "pressure_msl",
        "apparent_temperature",
        "dew_point_2m",
        "uv_index",
        "weather_code",
        "visibility",
        "sunshine_duration",
        "shortwave_radiation",
        "direct_radiation",
        "diffuse_radiation",
        "snowfall",
        "snow_depth",
        "soil_temperature_0cm",
        "soil_temperature_6cm",
        "soil_moisture_0_to_1cm",
        "soil_moisture_1_to_3cm",
        "cape",
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
  url.searchParams.set(
    "hourly",
    [
        "us_aqi",
        "uv_index",
        "uv_index_clear_sky",
        "pm10",
        "pm2_5",
        "carbon_monoxide",
        "nitrogen_dioxide",
        "sulphur_dioxide",
        "ozone",
        "aerosol_optical_depth",
        "dust",
        "alder_pollen",
        "birch_pollen",
        "grass_pollen",
        "mugwort_pollen",
        "olive_pollen",
        "ragweed_pollen",
    ].join(",")
    );

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

      weatherCode: Number(hourly.weather_code?.[index] ?? 0),
      visibilityMiles: metersToMiles(Number(hourly.visibility?.[index] ?? 10000)),
      windDirection: Number(hourly.wind_direction_10m?.[index] ?? 0),

      cloudLow: Number(hourly.cloud_cover_low?.[index] ?? 0),
      cloudMid: Number(hourly.cloud_cover_mid?.[index] ?? 0),
      cloudHigh: Number(hourly.cloud_cover_high?.[index] ?? 0),

      sunshineMinutes: Number(hourly.sunshine_duration?.[index] ?? 0) / 60,
      shortwaveRadiation: Number(hourly.shortwave_radiation?.[index] ?? 0),
      directRadiation: Number(hourly.direct_radiation?.[index] ?? 0),
      diffuseRadiation: Number(hourly.diffuse_radiation?.[index] ?? 0),

      snowfall: Number(hourly.snowfall?.[index] ?? 0),
      snowDepth: Number(hourly.snow_depth?.[index] ?? 0),

      soilTemp0: Number(hourly.soil_temperature_0cm?.[index] ?? 50),
      soilTemp6: Number(hourly.soil_temperature_6cm?.[index] ?? 50),
      soilMoisture0To1: Number(hourly.soil_moisture_0_to_1cm?.[index] ?? 0),
      soilMoisture1To3: Number(hourly.soil_moisture_1_to_3cm?.[index] ?? 0),

      cape: Number(hourly.cape?.[index] ?? 0),
    });
  }

  function pushMapValue(
    map: Map<string, number[]>,
    date: string,
    value: number
  ) {
    if (!map.has(date)) map.set(date, []);
    map.get(date)?.push(value);
  }

  const aqiByDate = new Map<string, number[]>();
  const uvByDate = new Map<string, number[]>();
  const uvClearSkyByDate = new Map<string, number[]>();
  const pm10ByDate = new Map<string, number[]>();
  const pm25ByDate = new Map<string, number[]>();
  const carbonMonoxideByDate = new Map<string, number[]>();
  const nitrogenDioxideByDate = new Map<string, number[]>();
  const sulphurDioxideByDate = new Map<string, number[]>();
  const ozoneByDate = new Map<string, number[]>();
  const aerosolOpticalDepthByDate = new Map<string, number[]>();
  const dustByDate = new Map<string, number[]>();

  const alderPollenByDate = new Map<string, number[]>();
  const birchPollenByDate = new Map<string, number[]>();
  const grassPollenByDate = new Map<string, number[]>();
  const mugwortPollenByDate = new Map<string, number[]>();
  const olivePollenByDate = new Map<string, number[]>();
  const ragweedPollenByDate = new Map<string, number[]>();

  if (airQualityData?.hourly?.time) {
    const aq = airQualityData.hourly;

    for (let index = 0; index < aq.time.length; index += 1) {
      const time = String(aq.time[index]);
      const date = time.slice(0, 10);

      if (!isDateInAllowedWindow(date)) continue;

      pushMapValue(aqiByDate, date, Number(aq.us_aqi?.[index] ?? 50));
      pushMapValue(uvByDate, date, Number(aq.uv_index?.[index] ?? 5));
      pushMapValue(
        uvClearSkyByDate,
        date,
        Number(aq.uv_index_clear_sky?.[index] ?? aq.uv_index?.[index] ?? 5)
      );
      pushMapValue(pm10ByDate, date, Number(aq.pm10?.[index] ?? 0));
      pushMapValue(pm25ByDate, date, Number(aq.pm2_5?.[index] ?? 0));
      pushMapValue(
        carbonMonoxideByDate,
        date,
        Number(aq.carbon_monoxide?.[index] ?? 0)
      );
      pushMapValue(
        nitrogenDioxideByDate,
        date,
        Number(aq.nitrogen_dioxide?.[index] ?? 0)
      );
      pushMapValue(
        sulphurDioxideByDate,
        date,
        Number(aq.sulphur_dioxide?.[index] ?? 0)
      );
      pushMapValue(ozoneByDate, date, Number(aq.ozone?.[index] ?? 0));
      pushMapValue(
        aerosolOpticalDepthByDate,
        date,
        Number(aq.aerosol_optical_depth?.[index] ?? 0)
      );
      pushMapValue(dustByDate, date, Number(aq.dust?.[index] ?? 0));

      pushMapValue(alderPollenByDate, date, Number(aq.alder_pollen?.[index] ?? 0));
      pushMapValue(birchPollenByDate, date, Number(aq.birch_pollen?.[index] ?? 0));
      pushMapValue(grassPollenByDate, date, Number(aq.grass_pollen?.[index] ?? 0));
      pushMapValue(
        mugwortPollenByDate,
        date,
        Number(aq.mugwort_pollen?.[index] ?? 0)
      );
      pushMapValue(olivePollenByDate, date, Number(aq.olive_pollen?.[index] ?? 0));
      pushMapValue(
        ragweedPollenByDate,
        date,
        Number(aq.ragweed_pollen?.[index] ?? 0)
      );
    }
  }

  const utcOffsetSeconds = Number.isFinite(
    Number(forecastData.utc_offset_seconds)
    )
    ? Number(forecastData.utc_offset_seconds)
    : null;

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
      aqi: max(aqiByDate.get(date) ?? [50]),
      uvIndex: max(uvByDate.get(date) ?? usable.map((row) => row.uv)),

      weatherCode: dominantWeatherCode(usable.map((row) => row.weatherCode)),
      visibilityMiles: average(usable.map((row) => row.visibilityMiles)),
      windDirection: circularAverageDegrees(usable.map((row) => row.windDirection)),

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

      pm10: max(pm10ByDate.get(date) ?? [0]),
      pm25: max(pm25ByDate.get(date) ?? [0]),
      carbonMonoxide: max(carbonMonoxideByDate.get(date) ?? [0]),
      nitrogenDioxide: max(nitrogenDioxideByDate.get(date) ?? [0]),
      sulphurDioxide: max(sulphurDioxideByDate.get(date) ?? [0]),
      ozone: max(ozoneByDate.get(date) ?? [0]),
      aerosolOpticalDepth: max(aerosolOpticalDepthByDate.get(date) ?? [0]),
      dust: max(dustByDate.get(date) ?? [0]),
      uvClearSky: max(uvClearSkyByDate.get(date) ?? [5]),

      alderPollen: max(alderPollenByDate.get(date) ?? [0]),
      birchPollen: max(birchPollenByDate.get(date) ?? [0]),
      grassPollen: max(grassPollenByDate.get(date) ?? [0]),
      mugwortPollen: max(mugwortPollenByDate.get(date) ?? [0]),
      olivePollen: max(olivePollenByDate.get(date) ?? [0]),
      ragweedPollen: max(ragweedPollenByDate.get(date) ?? [0]),
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

    const sunData = sunDataByDate.get(date);

    days.push({
        date,
        utcOffsetSeconds,
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
    rain_total: Number(day.rainTotal.toFixed(2)),
    daytime_rain_total: Number(day.daytimeRainTotal.toFixed(2)),
    precip_hours: day.precipHours,
    daytime_precip_hours: day.daytimePrecipHours,
    max_hourly_rain: Number(day.maxHourlyRain.toFixed(2)),
    heavy_rain_hours: day.heavyRainHours,
    rain_intensity_index: Math.round(day.rainIntensityIndex),
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

    weather_code: Math.round(day.weatherCode),
    visibility_miles: Number(day.visibilityMiles.toFixed(1)),
    wind_direction: Math.round(day.windDirection),

    cloud_low: Math.round(day.cloudLow),
    cloud_mid: Math.round(day.cloudMid),
    cloud_high: Math.round(day.cloudHigh),

    sunshine_minutes: Math.round(day.sunshineMinutes),
    shortwave_radiation: Math.round(day.shortwaveRadiation),
    direct_radiation: Math.round(day.directRadiation),
    diffuse_radiation: Math.round(day.diffuseRadiation),

    snowfall_total: Number(day.snowfallTotal.toFixed(2)),
    snow_depth_max: Number(day.snowDepthMax.toFixed(2)),

    soil_temp_0cm: Math.round(day.soilTemp0),
    soil_temp_6cm: Math.round(day.soilTemp6),
    soil_moisture_0_to_1cm: Number(day.soilMoisture0To1.toFixed(3)),
    soil_moisture_1_to_3cm: Number(day.soilMoisture1To3.toFixed(3)),

    cape: Math.round(day.cape),

    pm10: Math.round(day.pm10),
    pm25: Math.round(day.pm25),
    carbon_monoxide: Math.round(day.carbonMonoxide),
    nitrogen_dioxide: Math.round(day.nitrogenDioxide),
    sulphur_dioxide: Math.round(day.sulphurDioxide),
    ozone: Math.round(day.ozone),
    aerosol_optical_depth: Number(day.aerosolOpticalDepth.toFixed(3)),
    dust: Math.round(day.dust),
    uv_index_clear_sky: Math.round(day.uvClearSky),

    alder_pollen: Number(day.alderPollen.toFixed(1)),
    birch_pollen: Number(day.birchPollen.toFixed(1)),
    grass_pollen: Number(day.grassPollen.toFixed(1)),
    mugwort_pollen: Number(day.mugwortPollen.toFixed(1)),
    olive_pollen: Number(day.olivePollen.toFixed(1)),
    ragweed_pollen: Number(day.ragweedPollen.toFixed(1)),
    pollen_index: Math.round(day.pollenIndex),

    ground_wetness_index: Math.round(day.groundWetnessIndex),
    air_clarity_index: Math.round(day.airClarityIndex),
    light_quality_index: Math.round(day.lightQualityIndex),
    winter_surface_index: Math.round(day.winterSurfaceIndex),
    wind_variability_index: Math.round(day.windVariabilityIndex),
    storm_instability_index: Math.round(day.stormInstabilityIndex),
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
    .eq("data_type", "weather_forecast_bundle_v2")
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
    data_type: "weather_forecast_bundle_v2",
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