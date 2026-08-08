import { mkdirSync, writeFileSync } from "fs";
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

type ActivityScoreRow = {
  location: string;
  date: string;
  activity: string;
  raw_score: number;
  calibrated_score: number;
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

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addYears(date: Date, years: number) {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
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
}) {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");

  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set(
    "hourly",
    [
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
    ].join(",")
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Open-Meteo archive error: ${response.status}`);
  }

  return response.json();
}

function aggregateDailyWeather(historicalData: any) {
  const hourly = historicalData.hourly;
  const buckets = new Map<string, HourlyWeatherRow[]>();

  for (let index = 0; index < hourly.time.length; index += 1) {
    const time = String(hourly.time[index]);
    const date = time.slice(0, 10);
    const hour = Number(time.slice(11, 13));

    if (!buckets.has(date)) {
      buckets.set(date, []);
    }

    buckets.get(date)?.push({
      date,
      hour,
      temp: Number(hourly.temperature_2m?.[index] ?? 60),
      humidity: Number(hourly.relative_humidity_2m?.[index] ?? 50),
      rainChance: Number(hourly.precipitation_probability?.[index] ?? 0),
      rain: Number(hourly.precipitation?.[index] ?? hourly.rain?.[index] ?? 0),
      wind: Number(hourly.wind_speed_10m?.[index] ?? 0),
      gust: Number(hourly.wind_gusts_10m?.[index] ?? 0),
      cloud: Number(hourly.cloud_cover?.[index] ?? 50),
      pressure: Number(hourly.pressure_msl?.[index] ?? 1015),
      apparentTemp: Number(hourly.apparent_temperature?.[index] ?? 60),
      dewPoint: Number(hourly.dew_point_2m?.[index] ?? 50),
      uv: 5,
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
      windAvg: average(usable.map((row) => row.wind)),
      windMax: max(usable.map((row) => row.wind)),
      gustMax: max(usable.map((row) => row.gust)),
      cloudCover: average(usable.map((row) => row.cloud)),
      pressureStart: usable[0]?.pressure ?? null,
      pressureEnd: usable[usable.length - 1]?.pressure ?? null,
      dewPoint: max(usable.map((row) => row.dewPoint)),
      apparentTemp: average(usable.map((row) => row.apparentTemp)),

      // Historical AQI/UV are not included in this first script.
      // Defaults keep baseline calibration simple.
      aqi: 50,
      uvIndex: 5,
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
      hourlyRows: rows,
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

  const allRows: ActivityScoreRow[] = [];

  for (const location of LOCATIONS) {
    console.log(`Fetching historical weather for ${location.name}...`);

    const historicalData = await fetchHistoricalWeather({
      latitude: location.latitude,
      longitude: location.longitude,
      startDate,
      endDate,
    });

    const dailyWeather = aggregateDailyWeather(historicalData);

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
    }))
    );

  console.log(`Saved summary to ${summaryPath}`);
  console.log(`Saved daily rows to ${dailyPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});