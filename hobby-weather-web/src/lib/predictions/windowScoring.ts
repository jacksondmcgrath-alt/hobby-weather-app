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
  getActivityWindowProfile,
  type ActivityWindowProfile,
  type PreferredPeriod,
} from "@/lib/predictions/windowProfiles";
import type {
  AlternativeWindow,
  WindowRecommendationContext,
  WindowStability,
} from "@/lib/predictions/windowTypes";

export type WeeklyObligation = {
  id: number;
  label: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  active: boolean | null;
};

export type {
  AlternativeWindow,
  WindowStability,
} from "@/lib/predictions/windowTypes";

export type WindowRecommendationV2 = WindowRecommendationContext;

type CandidateWindow = {
  startHour: number;
  endHour: number;
  durationHours: number;
};

type ScoredCandidateWindow = CandidateWindow & {
  recommendedWindow: string;
  windowScore: number;
  weatherScore: number;
  stability: WindowStability;
  stabilityPenalty: number;
  reasons: string[];
};

function parseClockTimeToMinutes(timeText: string | null) {
  if (!timeText) return null;

  const hhmmMatch = timeText.match(/^(\d{1,2}):(\d{2})/);

  if (!hhmmMatch) return null;

  const hours = Number(hhmmMatch[1]);
  const minutes = Number(hhmmMatch[2]);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function parseIsoLocalHour(timeText: string | null) {
  if (!timeText) return null;

  const match = timeText.match(/T(\d{2}):(\d{2})/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour + minute / 60;
}

function getAppDayOfWeek(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  const jsDay = date.getDay();

  return jsDay === 0 ? 6 : jsDay - 1;
}

function rangesOverlap(
  first: { start: number; end: number },
  second: { start: number; end: number }
) {
  return first.start < second.end && second.start < first.end;
}

function candidateConflictsWithObligations({
  date,
  candidate,
  obligations,
}: {
  date: string;
  candidate: CandidateWindow;
  obligations: WeeklyObligation[];
}) {
  const dayOfWeek = getAppDayOfWeek(date);

  const candidateMinutes = {
    start: candidate.startHour * 60,
    end: candidate.endHour * 60,
  };

  return obligations
    .filter(
      (item) => item.active !== false && item.day_of_week === dayOfWeek
    )
    .some((item) => {
      const start = parseClockTimeToMinutes(item.start_time);
      const end = parseClockTimeToMinutes(item.end_time);

      if (start === null || end === null) {
        return false;
      }

      return rangesOverlap(candidateMinutes, {
        start,
        end: end <= start ? end + 24 * 60 : end,
      });
    });
}

function candidateMeetsDaylightRule({
  candidate,
  day,
  profile,
}: {
  candidate: CandidateWindow;
  day: DailyWeather;
  profile: ActivityWindowProfile;
}) {
  if (profile.daylightRule === "none" || profile.daylightRule === "preferred") {
    return true;
  }

  const sunrise = parseIsoLocalHour(day.sunrise);
  const sunset = parseIsoLocalHour(day.sunset);

  if (sunrise === null || sunset === null) {
    return profile.daylightRule !== "night";
  }

  if (profile.daylightRule === "night") {
    const nightStart = Math.ceil(
      sunset + (profile.daylightStartBufferHours ?? 0)
    );

    return candidate.startHour >= nightStart;
  }

  const allowedStart = Math.ceil(
    sunrise + (profile.daylightStartBufferHours ?? 0)
  );

  const allowedEnd = Math.floor(
    sunset - (profile.daylightEndBufferHours ?? 0)
  );

  return (
    candidate.startHour >= allowedStart &&
    candidate.endHour <= allowedEnd
  );
}

function candidateIsStillAvailable({
  date,
  candidate,
  day,
}: {
  date: string;
  candidate: CandidateWindow;
  day: DailyWeather;
}) {
  const offsetSeconds = day.utcOffsetSeconds;

  // Historical data and older cached records may not contain a timezone
  // offset. Do not remove windows when their local time cannot be determined.
  if (
    offsetSeconds === null ||
    offsetSeconds === undefined ||
    !Number.isFinite(offsetSeconds)
  ) {
    return true;
  }

  const localNow = new Date(Date.now() + offsetSeconds * 1000);
  const localDate = localNow.toISOString().slice(0, 10);

  if (date > localDate) return true;
  if (date < localDate) return false;

  const currentHour =
    localNow.getUTCHours() + localNow.getUTCMinutes() / 60;

  // A window that has already started is no longer offered as a new plan.
  return candidate.startHour >= currentHour;
}

function generateCandidateWindows(profile: ActivityWindowProfile) {
  const candidates: CandidateWindow[] = [];

  for (
    let startHour = profile.earliestStartHour;
    startHour + profile.durationHours <= profile.latestEndHour;
    startHour += 1
  ) {
    candidates.push({
      startHour,
      endHour: startHour + profile.durationHours,
      durationHours: profile.durationHours,
    });
  }

  return candidates;
}

function getHourlyRowsForCandidate({
  day,
  candidate,
}: {
  day: DailyWeather;
  candidate: CandidateWindow;
}) {
  return day.hourlyRows.filter(
    (row) =>
      row.hour >= candidate.startHour &&
      row.hour < candidate.endHour
  );
}

function formatHour(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const displayHour = normalized % 12 === 0 ? 12 : normalized % 12;

  return `${displayHour}:00 ${suffix}`;
}

function formatCandidateWindow(candidate: CandidateWindow) {
  return `${formatHour(candidate.startHour)}–${formatHour(
    candidate.endHour
  )}`;
}

function getPreferredPeriod(hour: number): PreferredPeriod {
  if (hour < 10) return "morning";
  if (hour < 14) return "midday";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function calculateTimePreferenceBonus({
  activity,
  candidate,
  profile,
  day,
}: {
  activity: string;
  candidate: CandidateWindow;
  profile: ActivityWindowProfile;
  day: DailyWeather;
}) {
  const midpoint = candidate.startHour + candidate.durationHours / 2;
  const period = getPreferredPeriod(midpoint);
  const preferenceIndex = profile.preferredPeriods.indexOf(period);

  let bonus =
    preferenceIndex === 0
      ? 6
      : preferenceIndex === 1
        ? 3
        : 0;

  if (
    ["Running", "Walking", "Dog Walking", "Cycling", "Outdoor Workout"].includes(
      activity
    ) &&
    day.avgTemp >= 78 &&
    (period === "morning" || period === "evening")
  ) {
    bonus += 4;
  }

  return Math.max(-10, Math.min(10, bonus));
}

function calculateWindowRainIntensity(rows: HourlyWeatherRow[]) {
  const rainTotal = sum(rows.map((row) => row.rain));
  const maxHourlyRain = max(rows.map((row) => row.rain));
  const precipHours = rows.filter((row) => row.rain >= 0.01).length;
  const heavyRainHours = rows.filter((row) => row.rain >= 0.1).length;

  let score = 0;

  score += Math.min(rainTotal, 1.5) * 25;
  score += Math.min(maxHourlyRain, 0.35) * 180;
  score += Math.min(precipHours, 12) * 2.5;
  score += heavyRainHours * 10;

  return clampScore(score);
}

function calculateWindowStormSafety({
  rainChance,
  rainTotal,
  gustMax,
}: {
  rainChance: number;
  rainTotal: number;
  gustMax: number;
}) {
  let risk = 0;

  if (gustMax >= 35) risk += 35;
  else if (gustMax >= 25) risk += 20;

  if (rainChance >= 70) risk += 20;
  else if (rainChance >= 50) risk += 10;

  if (rainTotal >= 0.5) risk += 20;
  else if (rainTotal >= 0.25) risk += 10;

  return clampScore(100 - risk);
}

function calculateWindowStormInstability({
  rows,
  stormSafety,
  gustMax,
  rainChance,
}: {
  rows: HourlyWeatherRow[];
  stormSafety: number;
  gustMax: number;
  rainChance: number;
}) {
  const cape = max(rows.map((row) => row.cape));
  let score = 0;

  score += Math.min(cape, 3000) / 30;
  score += Math.max(0, 100 - stormSafety) * 0.45;

  if (gustMax >= 25) score += 10;
  if (rainChance >= 50) score += 10;

  return clampScore(score);
}

function buildWindowDay({
  day,
  rows,
}: {
  day: DailyWeather;
  rows: HourlyWeatherRow[];
}): DailyWeather {
  const rainChance = max(rows.map((row) => row.rainChance));
  const rainTotal = sum(rows.map((row) => row.rain));
  const windAvg = average(rows.map((row) => row.wind));
  const windMax = max(rows.map((row) => row.wind));
  const gustMax = max(rows.map((row) => row.gust));

  const pressureStart = rows[0]?.pressure ?? day.pressureStart;
  const pressureEnd = rows[rows.length - 1]?.pressure ?? day.pressureEnd;

  const stormSafety = calculateWindowStormSafety({
    rainChance,
    rainTotal,
    gustMax,
  });

  return {
    ...day,

    avgTemp: average(rows.map((row) => row.temp)),
    minTemp: min(rows.map((row) => row.temp)),
    maxTemp: max(rows.map((row) => row.temp)),
    humidity: average(rows.map((row) => row.humidity)),
    rainChance,
    rainTotal,
    daytimeRainTotal: rainTotal,
    precipHours: rows.filter((row) => row.rain >= 0.01).length,
    daytimePrecipHours: rows.filter((row) => row.rain >= 0.01).length,
    maxHourlyRain: max(rows.map((row) => row.rain)),
    heavyRainHours: rows.filter((row) => row.rain >= 0.1).length,
    rainIntensityIndex: calculateWindowRainIntensity(rows),

    windAvg,
    windMax,
    gustMax,
    cloudCover: average(rows.map((row) => row.cloud)),
    pressureStart,
    pressureEnd,
    pressureChange:
      pressureStart !== null && pressureEnd !== null
        ? pressureEnd - pressureStart
        : 0,
    dewPoint: max(rows.map((row) => row.dewPoint)),
    apparentTemp: average(rows.map((row) => row.apparentTemp)),
    uvIndex: max(rows.map((row) => row.uv)),
    weatherCode: Math.round(average(rows.map((row) => row.weatherCode))),
    visibilityMiles: average(rows.map((row) => row.visibilityMiles)),
    windDirection: day.windDirection,
    cloudLow: average(rows.map((row) => row.cloudLow)),
    cloudMid: average(rows.map((row) => row.cloudMid)),
    cloudHigh: average(rows.map((row) => row.cloudHigh)),
    sunshineMinutes: sum(rows.map((row) => row.sunshineMinutes)),
    shortwaveRadiation: average(
      rows.map((row) => row.shortwaveRadiation)
    ),
    directRadiation: average(rows.map((row) => row.directRadiation)),
    diffuseRadiation: average(rows.map((row) => row.diffuseRadiation)),
    snowfallTotal: sum(rows.map((row) => row.snowfall)),
    snowDepthMax: max(rows.map((row) => row.snowDepth)),
    soilTemp0: average(rows.map((row) => row.soilTemp0)),
    soilTemp6: average(rows.map((row) => row.soilTemp6)),
    soilMoisture0To1: average(
      rows.map((row) => row.soilMoisture0To1)
    ),
    soilMoisture1To3: average(
      rows.map((row) => row.soilMoisture1To3)
    ),
    cape: max(rows.map((row) => row.cape)),

    stormSafety,
    stormInstabilityIndex: calculateWindowStormInstability({
      rows,
      stormSafety,
      gustMax,
      rainChance,
    }),

    hourlyRows: rows,
  };
}

function calculateStabilityPenalty(rows: HourlyWeatherRow[]) {
  if (rows.length === 0) {
    return 12;
  }

  const windSpread =
    max(rows.map((row) => row.wind)) -
    min(rows.map((row) => row.wind));

  const gustSpread =
    max(rows.map((row) => row.gust)) -
    min(rows.map((row) => row.gust));

  const rainChanceSpread =
    max(rows.map((row) => row.rainChance)) -
    min(rows.map((row) => row.rainChance));

  const apparentTempSpread =
    max(rows.map((row) => row.apparentTemp)) -
    min(rows.map((row) => row.apparentTemp));

  const rainStartsDuringWindow = rows.some(
    (row, index) =>
      index > 0 &&
      rows[index - 1].rain < 0.01 &&
      row.rain >= 0.01
  );

  let penalty = 0;

  if (windSpread >= 10) penalty += 4;
  else if (windSpread >= 6) penalty += 2;

  if (gustSpread >= 15) penalty += 3;
  else if (gustSpread >= 9) penalty += 1;

  if (rainChanceSpread >= 35) penalty += 3;
  else if (rainChanceSpread >= 20) penalty += 1;

  if (apparentTempSpread >= 12) penalty += 2;
  else if (apparentTempSpread >= 8) penalty += 1;

  if (rainStartsDuringWindow) penalty += 2;

  return Math.min(12, penalty);
}

function stabilityFromPenalty(
  penalty: number
): WindowStability {
  if (penalty <= 3) return "stable";
  if (penalty <= 7) return "variable";
  return "uncertain";
}

function buildWindowReasons({
  activity,
  rows,
  windowDay,
  stability,
  hasSchedule,
}: {
  activity: string;
  rows: HourlyWeatherRow[];
  windowDay: DailyWeather;
  stability: WindowStability;
  hasSchedule: boolean;
}) {
  const reasons: string[] = [];

  if (windowDay.rainIntensityIndex <= 20) {
    reasons.push("Minimal rain impact");
  }

  if (windowDay.windMax <= 10) {
    reasons.push("Lower wind");
  }

  if (
    windowDay.avgTemp >= 45 &&
    windowDay.avgTemp <= 80
  ) {
    reasons.push("Comfortable temperatures");
  }

  if (stability === "stable") {
    reasons.push("Stable through the window");
  }

  if (hasSchedule) {
    reasons.push("Avoids your saved schedule");
  }

  if (activity === "Stargazing" && windowDay.cloudCover <= 25) {
    reasons.push("Lower cloud cover");
  }

  if (
    ["Photography", "Birdwatching", "Wildlife Watching"].includes(activity) &&
    windowDay.airClarityIndex >= 70
  ) {
    reasons.push("Good visibility");
  }

  if (
    ["Kayaking", "Canoeing", "Paddleboarding"].includes(activity) &&
    windowDay.gustMax <= 15
  ) {
    reasons.push("Manageable gusts");
  }

  if (rows.length > 0 && reasons.length === 0) {
    reasons.push("Best hourly condition fit");
  }

  return reasons.slice(0, 3);
}

function scoreCandidateWindow({
  activity,
  day,
  candidate,
  profile,
  obligations,
}: {
  activity: string;
  day: DailyWeather;
  candidate: CandidateWindow;
  profile: ActivityWindowProfile;
  obligations: WeeklyObligation[];
}) {

  if (
    !candidateIsStillAvailable({
        date: day.date,
        candidate,
        day,
    })
    ) {
    return null;
    }

  if (
    candidateConflictsWithObligations({
      date: day.date,
      candidate,
      obligations,
    })
  ) {
    return null;
  }

  if (
    !candidateMeetsDaylightRule({
      candidate,
      day,
      profile,
    })
  ) {
    return null;
  }

  const rows = getHourlyRowsForCandidate({
    day,
    candidate,
  });

  if (rows.length < candidate.durationHours) {
    return null;
  }

  const windowDay = buildWindowDay({
    day,
    rows,
  });

  const activityResult = scoreActivity(activity, windowDay);

  const weatherScore = calibrateActivityScore({
    activity,
    day: windowDay,
    score: activityResult.score,
  });

  const stabilityPenalty = calculateStabilityPenalty(rows);
  const stability = stabilityFromPenalty(stabilityPenalty);

  const timeBonus = calculateTimePreferenceBonus({
    activity,
    candidate,
    profile,
    day: windowDay,
  });

  const windowScore = clampScore(
    weatherScore + timeBonus - stabilityPenalty
  );

  const recommendedWindow = formatCandidateWindow(candidate);

  return {
    ...candidate,
    recommendedWindow,
    windowScore,
    weatherScore,
    stability,
    stabilityPenalty,
    reasons: buildWindowReasons({
      activity,
      rows,
      windowDay,
      stability,
      hasSchedule: obligations.length > 0,
    }),
  } satisfies ScoredCandidateWindow;
}

function selectDiverseAlternatives({
  best,
  candidates,
  limit = 2,
}: {
  best: ScoredCandidateWindow;
  candidates: ScoredCandidateWindow[];
  limit?: number;
}) {
  const selected: ScoredCandidateWindow[] = [];
  const minimumStartGap = Math.max(
    2,
    Math.ceil(best.durationHours / 2)
  );

  for (const candidate of candidates) {
    if (candidate.recommendedWindow === best.recommendedWindow) {
      continue;
    }

    if (candidate.windowScore < best.windowScore - 15) {
      continue;
    }

    const differsFromBest =
      Math.abs(candidate.startHour - best.startHour) >=
      minimumStartGap;

    const differsFromSelected = selected.every(
      (item) =>
        Math.abs(item.startHour - candidate.startHour) >=
        minimumStartGap
    );

    if (!differsFromBest || !differsFromSelected) {
      continue;
    }

    selected.push(candidate);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function getRecommendedWindowForActivity({
  activity,
  date,
  day,
  obligations,
}: {
  activity: string;
  date: string;
  day: DailyWeather;
  obligations: WeeklyObligation[];
}): WindowRecommendationV2 {
  const profile = getActivityWindowProfile(activity);

  const candidates = generateCandidateWindows(profile)
    .map((candidate) =>
      scoreCandidateWindow({
        activity,
        day: {
          ...day,
          date,
        },
        candidate,
        profile,
        obligations,
      })
    )
    .filter(
      (
        candidate
      ): candidate is ScoredCandidateWindow =>
        candidate !== null
    )
    .sort((a, b) => b.windowScore - a.windowScore);

  const best = candidates[0];

  if (!best) {
    return {
      recommendedWindow: "No clear open window",
      windowScore: 0,
      startHour: null,
      endHour: null,
      durationHours: profile.durationHours,
      stability: "unavailable",
      reasons: [],
      alternatives: [],
      windowLabel: profile.windowLabel ?? "Best window",
    };
  }

  const alternatives = selectDiverseAlternatives({
    best,
    candidates,
    limit: 2,
  }).map((candidate) => ({
    recommendedWindow: candidate.recommendedWindow,
    windowScore: candidate.windowScore,
    startHour: candidate.startHour,
    endHour: candidate.endHour,
    stability: candidate.stability,
  }));

  return {
    recommendedWindow: best.recommendedWindow,
    windowScore: best.windowScore,
    startHour: best.startHour,
    endHour: best.endHour,
    durationHours: best.durationHours,
    stability: best.stability,
    reasons: best.reasons,
    alternatives,
    windowLabel: profile.windowLabel ?? "Best window",
  };
}