import { ACTIVITY_META } from "@/lib/activityMeta";

export type HourlyWeatherRow = {
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

  weatherCode: number;
  visibilityMiles: number;
  windDirection: number;

  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;

  sunshineMinutes: number;
  shortwaveRadiation: number;
  directRadiation: number;
  diffuseRadiation: number;

  snowfall: number;
  snowDepth: number;

  soilTemp0: number;
  soilTemp6: number;
  soilMoisture0To1: number;
  soilMoisture1To3: number;

  cape: number;
};

export type DailyWeather = {
  date: string;
  utcOffsetSeconds?: number | null;
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
  humidity: number;
  rainChance: number;
  rainTotal: number;

  daytimeRainTotal: number;
  precipHours: number;
  daytimePrecipHours: number;
  maxHourlyRain: number;
  heavyRainHours: number;
  rainIntensityIndex: number;

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
  weatherCode: number;
  visibilityMiles: number;
  windDirection: number;

  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;

  sunshineMinutes: number;
  shortwaveRadiation: number;
  directRadiation: number;
  diffuseRadiation: number;

  snowfallTotal: number;
  snowDepthMax: number;

  soilTemp0: number;
  soilTemp6: number;
  soilMoisture0To1: number;
  soilMoisture1To3: number;

  cape: number;

  pm10: number;
  pm25: number;
  carbonMonoxide: number;
  nitrogenDioxide: number;
  sulphurDioxide: number;
  ozone: number;
  aerosolOpticalDepth: number;
  dust: number;
  uvClearSky: number;

  alderPollen: number;
  birchPollen: number;
  grassPollen: number;
  mugwortPollen: number;
  olivePollen: number;
  ragweedPollen: number;
  pollenIndex: number;

  groundWetnessIndex: number;
  airClarityIndex: number;
  lightQualityIndex: number;
  winterSurfaceIndex: number;
  windVariabilityIndex: number;
  stormInstabilityIndex: number;

  sunrise: string | null;
  sunset: string | null;
  daylightHours: number | null;
  hourlyRows: HourlyWeatherRow[];
};

export type CandidateWindow = {
  label: string;
  start: string;
  end: string;
  baseScore: number;
};

export type ScoredActivity = {
  score: number;
  explanation: string;
};

export type WindowRecommendation = {
  recommendedWindow: string;
  windowScore: number;
};

export const BASE_WINDOWS: Record<string, CandidateWindow> = {
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

const SCORING_PROFILE_WINDOW_PREFERENCES: Record<string, string[]> = {
  fishing: ["morning", "evening", "afternoon", "midday"],
  ice_fishing: ["morning", "afternoon", "midday", "evening"],

  running: ["morning", "evening", "afternoon", "midday"],
  walking: ["morning", "evening", "afternoon", "midday"],
  hiking: ["morning", "afternoon", "evening", "midday"],
  cycling: ["morning", "evening", "afternoon", "midday"],
  outdoor_workout: ["morning", "evening", "afternoon", "midday"],
  outdoor_yoga: ["morning", "evening", "afternoon", "midday"],

  kayaking: ["midday", "afternoon", "morning", "evening"],
  paddleboarding: ["midday", "afternoon", "morning", "evening"],
  beach: ["midday", "afternoon", "morning", "evening"],
  swimming: ["midday", "afternoon", "morning", "evening"],

  tennis: ["morning", "evening", "afternoon", "midday"],
  golf: ["morning", "afternoon", "evening", "midday"],
  disc_golf: ["morning", "afternoon", "evening", "midday"],
  field_sport: ["morning", "evening", "afternoon", "midday"],
  court_sport: ["morning", "evening", "afternoon", "midday"],

  photography: ["morning", "evening", "afternoon", "midday"],
  wildlife: ["morning", "evening", "afternoon", "midday"],
  stargazing: ["evening", "morning", "afternoon", "midday"],
  picnic: ["midday", "afternoon", "evening", "morning"],
  gardening: ["morning", "evening", "afternoon", "midday"],

  drone: ["morning", "afternoon", "evening", "midday"],
  kite: ["afternoon", "midday", "evening", "morning"],

  sledding: ["afternoon", "morning", "midday", "evening"],
  winter_hiking: ["afternoon", "morning", "midday", "evening"],
  skiing: ["morning", "afternoon", "midday", "evening"],
};

export function getScoringProfile(activity: string) {
  return ACTIVITY_META[activity]?.scoringProfile ?? activity.toLowerCase();
}

export function getWindowPreferenceKeys(activity: string) {
  const profile = getScoringProfile(activity);

  return (
    SCORING_PROFILE_WINDOW_PREFERENCES[profile] ?? [
      "morning",
      "afternoon",
      "evening",
      "midday",
    ]
  );
}

export function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) return 0;

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function max(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) return 0;

  return Math.max(...clean);
}

export function min(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) return 0;

  return Math.min(...clean);
}

export function sum(values: number[]) {
  return values
    .filter((value) => Number.isFinite(value))
    .reduce((total, value) => total + value, 0);
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function rangeScore(
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

export function lowIsGoodScore(value: number, idealMax: number, badAt: number) {
  if (value <= idealMax) return 100;
  if (value >= badAt) return 0;

  return clampScore(100 - ((value - idealMax) / (badAt - idealMax)) * 100);
}

function capScoreByConditionTier({
  score,
  excellent,
  good,
  excellentCap = 100,
  goodCap = 92,
  ordinaryCap = 86,
}: {
  score: number;
  excellent: boolean;
  good: boolean;
  excellentCap?: number;
  goodCap?: number;
  ordinaryCap?: number;
}) {
  if (excellent) {
    return Math.min(score, excellentCap);
  }

  if (good) {
    return Math.min(score, goodCap);
  }

  return Math.min(score, ordinaryCap);
}

function applyCommonSafetyCaps({
  profile,
  day,
  score,
  reasons,
}: {
  profile: string;
  day: DailyWeather;
  score: number;
  reasons: string[];
}) {
  let cappedScore = score;

  // General storm safety
  if (day.stormSafety < 35) {
    cappedScore = Math.min(cappedScore, 35);
    reasons.push("storm risk makes this a poor option");
  } else if (day.stormSafety < 50) {
    cappedScore = Math.min(cappedScore, 50);
    reasons.push("storm risk is limiting the score");
  }

  // Air quality caps for exertion-heavy activities
  if (
    ["running", "walking", "hiking", "cycling", "outdoor_workout"].includes(
      profile
    )
  ) {
    if (day.aqi >= 151) {
      cappedScore = Math.min(cappedScore, 40);
      reasons.push("poor air quality limits outdoor exertion");
    } else if (day.aqi >= 101) {
      cappedScore = Math.min(cappedScore, 65);
      reasons.push("air quality is worth watching");
    }
  }

  // Heat caps for exertion-heavy activities
  if (
    ["running", "walking", "hiking", "cycling", "outdoor_workout"].includes(
      profile
    )
  ) {
    if (day.avgTemp >= 92 || day.apparentTemp >= 95) {
      cappedScore = Math.min(cappedScore, 45);
      reasons.push("heat makes this harder to recommend");
    } else if (day.avgTemp >= 85 || day.apparentTemp >= 88) {
      cappedScore = Math.min(cappedScore, 65);
      reasons.push("heat may reduce comfort");
    }
  }

  // Water activity safety caps
  if (
    ["kayaking", "paddleboarding", "swimming", "beach"].includes(profile)
  ) {
    if (day.gustMax >= 32) {
      cappedScore = Math.min(cappedScore, 45);
      reasons.push("strong gusts reduce water safety");
    }

    if (day.windMax >= 22) {
      cappedScore = Math.min(cappedScore, 50);
      reasons.push("wind may make water conditions difficult");
    }

    if (day.stormSafety < 55) {
      cappedScore = Math.min(cappedScore, 45);
      reasons.push("storm risk is a water safety concern");
    }
  }

  // Outdoor sport rain caps
  if (
    ["tennis", "golf", "disc_golf", "field_sport", "court_sport"].includes(
      profile
    )
  ) {
    if (day.rainChance >= 75) {
      cappedScore = Math.min(cappedScore, 40);
      reasons.push("rain risk could interrupt play");
    } else if (day.rainChance >= 55) {
      cappedScore = Math.min(cappedScore, 60);
      reasons.push("rain risk is worth watching");
    }
  }

  // Very poor wind cap for precision activities
  if (["tennis", "golf", "disc_golf", "drone"].includes(profile)) {
    if (day.gustMax >= 30) {
      cappedScore = Math.min(cappedScore, 55);
      reasons.push("gusts may make this less reliable");
    }
  }

  return cappedScore;
}

function compressHighScores(score: number) {
  if (score >= 95) {
    return 88 + (score - 95) * 1.2;
  }

  if (score >= 85) {
    return 78 + (score - 85) * 1.0;
  }

  if (score >= 70) {
    return 65 + (score - 70) * 0.87;
  }

  if (score >= 55) {
    return 52 + (score - 55) * 0.87;
  }

  return score;
}

function isExcellentDayForActivity(activity: string, day: DailyWeather) {
  const profile = getScoringProfile(activity);

  if (profile === "running") {
    return (
      day.avgTemp >= 45 &&
      day.avgTemp <= 62 &&
      day.apparentTemp <= 68 &&
      day.dewPoint <= 60 &&
      day.windMax <= 9 &&
      day.gustMax <= 17 &&
      day.rainChance <= 15 &&
      day.aqi <= 60 &&
      day.stormSafety >= 88
    );
  }

  if (profile === "fishing") {
    return (
        day.avgTemp >= 52 &&
        day.avgTemp <= 76 &&
        day.waterTempEst >= 56 &&
        day.waterTempEst <= 70 &&
        day.windMax >= 4 &&
        day.windMax <= 10 &&
        day.gustMax <= 16 &&
        day.rainChance <= 30 &&
        day.pressureChange >= -6 &&
        day.pressureChange <= 2 &&
        day.bugIndex >= 40 &&
        day.bugIndex <= 72 &&
        day.stormSafety >= 88 &&
        day.stormInstabilityIndex <= 30
    );
    }

  if (profile === "walking") {
    return (
      day.avgTemp >= 52 &&
      day.avgTemp <= 75 &&
      day.apparentTemp <= 78 &&
      day.windMax <= 10 &&
      day.rainChance <= 15 &&
      day.aqi <= 70 &&
      day.stormSafety >= 88
    );
  }

  if (profile === "hiking") {
    return (
      day.avgTemp >= 52 &&
      day.avgTemp <= 75 &&
      day.windMax <= 12 &&
      day.rainChance <= 15 &&
      day.aqi <= 70 &&
      day.bugIndex <= 55 &&
      day.stormSafety >= 88
    );
  }

  if (profile === "cycling") {
    return (
      day.avgTemp >= 55 &&
      day.avgTemp <= 76 &&
      day.windMax <= 11 &&
      day.gustMax <= 18 &&
      day.rainChance <= 15 &&
      day.aqi <= 70 &&
      day.stormSafety >= 88
    );
  }

  if (profile === "kayaking" || profile === "paddleboarding") {
    return (
      day.avgTemp >= 68 &&
      day.avgTemp <= 84 &&
      day.waterTempEst >= 62 &&
      day.waterTempEst <= 78 &&
      day.windMax <= 8 &&
      day.gustMax <= 15 &&
      day.rainChance <= 15 &&
      day.stormSafety >= 90
    );
  }

  if (profile === "beach" || profile === "swimming") {
    return (
      day.avgTemp >= 76 &&
      day.avgTemp <= 90 &&
      day.waterTempEst >= 68 &&
      day.waterTempEst <= 84 &&
      day.windMax <= 15 &&
      day.rainChance <= 15 &&
      day.uvIndex >= 3 &&
      day.uvIndex <= 9 &&
      day.stormSafety >= 88
    );
  }

  if (profile === "tennis" || profile === "golf" || profile === "disc_golf") {
    return (
      day.avgTemp >= 56 &&
      day.avgTemp <= 78 &&
      day.windMax <= 10 &&
      day.gustMax <= 18 &&
      day.rainChance <= 15 &&
      day.stormSafety >= 88
    );
  }

  if (
    ["field_sport", "court_sport", "picnic", "gardening"].includes(profile)
  ) {
    return (
      day.avgTemp >= 58 &&
      day.avgTemp <= 78 &&
      day.windMax <= 12 &&
      day.rainChance <= 15 &&
      day.stormSafety >= 88
    );
  }

  if (profile === "photography") {
    return (
      day.rainChance <= 15 &&
      day.windMax <= 14 &&
      day.stormSafety >= 88 &&
      day.avgTemp >= 40 &&
      day.avgTemp <= 82
    );
  }

  if (profile === "wildlife") {
    return (
      day.windMax <= 10 &&
      day.rainChance <= 20 &&
      day.stormSafety >= 88 &&
      day.avgTemp >= 40 &&
      day.avgTemp <= 78
    );
  }

  if (profile === "kite") {
    return (
      day.windMax >= 8 &&
      day.windMax <= 18 &&
      day.gustMax <= 24 &&
      day.rainChance <= 15 &&
      day.stormSafety >= 88
    );
  }

  return (
    day.avgTemp >= 58 &&
    day.avgTemp <= 76 &&
    day.windMax <= 10 &&
    day.rainChance <= 15 &&
    day.stormSafety >= 88
  );
}

function isPerfectDayForActivity(activity: string, day: DailyWeather) {
  const profile = getScoringProfile(activity);

  if (profile === "running") {
    return (
      day.avgTemp >= 48 &&
      day.avgTemp <= 58 &&
      day.apparentTemp <= 62 &&
      day.dewPoint <= 55 &&
      day.windMax <= 6 &&
      day.gustMax <= 12 &&
      day.rainChance <= 5 &&
      day.aqi <= 45 &&
      day.stormSafety >= 95
    );
  }

  if (profile === "fishing") {
    return (
        day.avgTemp >= 56 &&
        day.avgTemp <= 72 &&
        day.waterTempEst >= 58 &&
        day.waterTempEst <= 68 &&
        day.windMax >= 4 &&
        day.windMax <= 8 &&
        day.gustMax <= 12 &&
        day.rainChance <= 15 &&
        day.pressureChange >= -5 &&
        day.pressureChange <= 1 &&
        day.bugIndex >= 45 &&
        day.bugIndex <= 66 &&
        day.stormSafety >= 94 &&
        day.stormInstabilityIndex <= 20
    );
    }

  if (profile === "walking") {
    return (
      day.avgTemp >= 58 &&
      day.avgTemp <= 70 &&
      day.windMax <= 6 &&
      day.rainChance <= 5 &&
      day.aqi <= 50 &&
      day.stormSafety >= 95
    );
  }

  if (profile === "hiking") {
    return (
      day.avgTemp >= 55 &&
      day.avgTemp <= 70 &&
      day.windMax <= 8 &&
      day.rainChance <= 5 &&
      day.aqi <= 50 &&
      day.bugIndex <= 40 &&
      day.stormSafety >= 95
    );
  }

  if (profile === "cycling") {
    return (
      day.avgTemp >= 60 &&
      day.avgTemp <= 72 &&
      day.windMax <= 7 &&
      day.gustMax <= 14 &&
      day.rainChance <= 5 &&
      day.aqi <= 50 &&
      day.stormSafety >= 95
    );
  }

  if (profile === "kayaking" || profile === "paddleboarding") {
    return (
      day.avgTemp >= 70 &&
      day.avgTemp <= 80 &&
      day.waterTempEst >= 64 &&
      day.waterTempEst <= 76 &&
      day.windMax <= 5 &&
      day.gustMax <= 10 &&
      day.rainChance <= 5 &&
      day.stormSafety >= 95
    );
  }

  if (profile === "beach" || profile === "swimming") {
    return (
      day.avgTemp >= 80 &&
      day.avgTemp <= 88 &&
      day.waterTempEst >= 72 &&
      day.waterTempEst <= 82 &&
      day.windMax <= 10 &&
      day.rainChance <= 5 &&
      day.uvIndex >= 4 &&
      day.uvIndex <= 8 &&
      day.stormSafety >= 95
    );
  }

  if (profile === "tennis" || profile === "golf" || profile === "disc_golf") {
    return (
      day.avgTemp >= 60 &&
      day.avgTemp <= 74 &&
      day.windMax <= 7 &&
      day.gustMax <= 12 &&
      day.rainChance <= 5 &&
      day.stormSafety >= 95
    );
  }

  return false;
}

export function calibrateActivityScore({
  activity,
  day,
  score,
}: {
  activity: string;
  day: DailyWeather;
  score: number;
}) {
  const profile = getScoringProfile(activity);
  const excellent = isExcellentDayForActivity(activity, day);
  const perfect = isPerfectDayForActivity(activity, day);

  let calibrated = compressHighScores(clampScore(score));

  const generalCaps: Record<string, number> = {
    field_sport: 88,
    court_sport: 88,
    gardening: 88,
    picnic: 88,
    wildlife: 90,
    photography: 90,
    kite: 90,

    walking: 92,
    hiking: 92,
    cycling: 92,
    fishing: 92,
    running: 92,
    beach: 92,
    swimming: 90,
    tennis: 92,
    golf: 90,
    disc_golf: 90,

    outdoor_workout: 90,
    outdoor_yoga: 90,
    drone: 88,

    skiing: 72,
    sledding: 72,
    winter_hiking: 72,
    ice_fishing: 68,
  };

  const excellentCaps: Record<string, number> = {
    field_sport: 92,
    court_sport: 92,
    gardening: 92,
    picnic: 92,
    wildlife: 94,
    photography: 94,
    kite: 94,

    walking: 96,
    hiking: 96,
    cycling: 96,
    fishing: 96,
    running: 96,
    beach: 96,
    swimming: 95,
    tennis: 96,
    golf: 95,
    disc_golf: 95,

    outdoor_workout: 94,
    outdoor_yoga: 94,
    drone: 92,

    skiing: 78,
    sledding: 78,
    winter_hiking: 78,
    ice_fishing: 72,
  };

  if (perfect && score >= 98) {
    return 100;
  }

  if (excellent) {
    calibrated = Math.min(
      Math.max(calibrated, score >= 94 ? 93 : calibrated),
      excellentCaps[profile] ?? 94
    );
  } else {
    calibrated = Math.min(calibrated, generalCaps[profile] ?? 90);
  }

  return clampScore(calibrated);
}

export function scoreActivity(activity: string, day: DailyWeather): ScoredActivity {
  const profile = getScoringProfile(activity);

  let score = 50;
  const reasons: string[] = [];

  switch (profile) {
    case "running": {
        const tempScore = rangeScore(day.avgTemp, 42, 66, 20, 92);
        const apparentTempScore = rangeScore(day.apparentTemp, 38, 70, 15, 96);
        const dewPointScore = lowIsGoodScore(day.dewPoint, 60, 76);
        const windScore = lowIsGoodScore(day.windMax, 10, 26);
        const gustScore = lowIsGoodScore(day.gustMax, 18, 36);
        const rainScore = lowIsGoodScore(day.rainChance, 25, 80);
        const aqiScore = lowIsGoodScore(day.aqi, 50, 150);

        const stormStabilityScore = clampScore(
            day.stormSafety * 0.85 +
            lowIsGoodScore(day.stormInstabilityIndex, 25, 80) * 0.15
        );

        const airClarityScore = day.airClarityIndex;
        const pollenComfortScore = lowIsGoodScore(day.pollenIndex, 35, 90);
        const surfaceComfortScore = lowIsGoodScore(day.groundWetnessIndex, 60, 95);

        score =
            tempScore * 0.2 +
            apparentTempScore * 0.13 +
            dewPointScore * 0.13 +
            windScore * 0.1 +
            gustScore * 0.07 +
            rainScore * 0.12 +
            aqiScore * 0.11 +
            stormStabilityScore * 0.08 +
            airClarityScore * 0.03 +
            pollenComfortScore * 0.015 +
            surfaceComfortScore * 0.015;

        if (day.avgTemp >= 42 && day.avgTemp <= 66) {
            reasons.push("comfortable running temperatures");
        } else if (day.avgTemp < 35) {
            reasons.push("cold conditions may make running less comfortable");
        } else if (day.avgTemp >= 78) {
            reasons.push("warm conditions may add heat stress");
        }

        if (day.apparentTemp >= 84) {
            reasons.push("feels warm for running");
        }

        if (day.dewPoint >= 68) {
            reasons.push("humidity may feel uncomfortable");
        }

        if (day.windMax <= 10) {
            reasons.push("light wind");
        } else if (day.windMax >= 17) {
            reasons.push("wind may be noticeable");
        }

        if (day.gustMax >= 26) {
            reasons.push("gusts may affect comfort and pacing");
        }

        if (day.rainChance <= 25) {
            reasons.push("low rain chances");
        } else if (day.rainChance >= 55) {
            reasons.push("rain risk may affect the run");
        }

        if (day.aqi > 100) {
            reasons.push("air quality may be a concern");
        }

        if (day.airClarityIndex < 60) {
            reasons.push("air clarity is reduced");
        }

        if (day.pollenIndex >= 75) {
            reasons.push("pollen may bother sensitive runners");
        }

        if (day.groundWetnessIndex >= 80) {
            reasons.push("surfaces may be wet or slick");
        }

        if (day.stormInstabilityIndex >= 70) {
            reasons.push("storm instability is worth watching");
        }

        if (day.stormSafety < 45 || day.stormInstabilityIndex >= 85) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits running confidence");
        }

        if (day.rainChance >= 80) {
            score = Math.min(score, 45);
            reasons.push("high rain risk makes this less reliable");
        } else if (day.rainChance >= 65) {
            score = Math.min(score, 65);
            reasons.push("rain risk lowers reliability");
        }

        if (day.aqi >= 151) {
            score = Math.min(score, 35);
            reasons.push("poor air quality limits outdoor exertion");
        }

        if (day.apparentTemp >= 98) {
            score = Math.min(score, 40);
            reasons.push("heat stress is a major concern");
        } else if (day.apparentTemp >= 90) {
            score = Math.min(score, 65);
            reasons.push("heat may reduce running comfort");
        }

        break;
        }

    case "walking": {
        const tempScore = rangeScore(day.avgTemp, 42, 80, 18, 95);
        const apparentTempScore = rangeScore(day.apparentTemp, 38, 82, 15, 98);
        const windScore = lowIsGoodScore(day.windMax, 16, 34);
        const rainScore = lowIsGoodScore(day.rainChance, 35, 85);
        const aqiScore = lowIsGoodScore(day.aqi, 65, 160);
        const stormScore = day.stormSafety;
        const pollenComfortScore = lowIsGoodScore(day.pollenIndex, 55, 95);
        const surfaceComfortScore = lowIsGoodScore(day.groundWetnessIndex, 70, 96);
        const airClarityScore = day.airClarityIndex;

        score =
            tempScore * 0.29 +
            apparentTempScore * 0.12 +
            windScore * 0.12 +
            rainScore * 0.18 +
            aqiScore * 0.12 +
            stormScore * 0.1 +
            pollenComfortScore * 0.025 +
            surfaceComfortScore * 0.025 +
            airClarityScore * 0.02;

        if (day.avgTemp >= 42 && day.avgTemp <= 80) {
            reasons.push("comfortable walking temperatures");
        }

        if (day.windMax <= 16) {
            reasons.push("manageable wind");
        } else if (day.windMax >= 24) {
            reasons.push("wind may reduce comfort");
        }

        if (day.rainChance <= 35) {
            reasons.push("manageable rain chances");
        } else if (day.rainChance >= 60) {
            reasons.push("rain risk may affect the walk");
        }

        if (day.aqi > 100) {
            reasons.push("air quality may be worth watching");
        }

        if (day.pollenIndex >= 75) {
            reasons.push("pollen may bother sensitive walkers");
        }

        if (day.groundWetnessIndex >= 80) {
            reasons.push("surfaces may be wet");
        }

        break;
        }

    case "hiking": {
        const tempScore = rangeScore(day.avgTemp, 45, 76, 25, 94);
        const apparentTempScore = rangeScore(day.apparentTemp, 42, 78, 22, 98);
        const rainScore = lowIsGoodScore(day.rainChance, 28, 82);
        const windScore = lowIsGoodScore(day.windMax, 15, 32);
        const bugComfort = lowIsGoodScore(day.bugIndex, 45, 90);
        const aqiScore = lowIsGoodScore(day.aqi, 55, 155);
        const stormScore = day.stormSafety;
        const groundScore = lowIsGoodScore(day.groundWetnessIndex, 55, 92);
        const airClarityScore = day.airClarityIndex;
        const pollenComfortScore = lowIsGoodScore(day.pollenIndex, 55, 95);

        score =
            tempScore * 0.24 +
            apparentTempScore * 0.08 +
            rainScore * 0.16 +
            windScore * 0.1 +
            bugComfort * 0.1 +
            aqiScore * 0.1 +
            stormScore * 0.12 +
            groundScore * 0.06 +
            airClarityScore * 0.03 +
            pollenComfortScore * 0.01;

        if (day.avgTemp >= 45 && day.avgTemp <= 76) {
            reasons.push("comfortable hiking temperatures");
        }

        if (day.rainChance <= 28) {
            reasons.push("low rain chances");
        } else if (day.rainChance >= 55) {
            reasons.push("rain could affect trail conditions");
        }

        if (day.groundWetnessIndex >= 70) {
            reasons.push("trail surfaces may be wet or muddy");
        }

        if (day.bugIndex >= 60) {
            reasons.push("bugs may be noticeable");
        }

        if (day.windMax <= 15) {
            reasons.push("manageable wind");
        }

        if (day.aqi > 100) {
            reasons.push("air quality may be a concern");
        }

        if (day.airClarityIndex < 60) {
            reasons.push("visibility or air clarity may be reduced");
        }

        if (day.stormInstabilityIndex >= 70) {
            reasons.push("storm instability is worth watching");
        }

        if (day.groundWetnessIndex >= 88) {
            score = Math.min(score, 65);
            reasons.push("wet ground limits trail reliability");
        }

        break;
        }

    case "cycling": {
        const tempScore = rangeScore(day.avgTemp, 50, 78, 30, 96);
        const apparentTempScore = rangeScore(day.apparentTemp, 48, 80, 28, 100);
        const windScore = lowIsGoodScore(day.windMax, 11, 30);
        const gustScore = lowIsGoodScore(day.gustMax, 18, 40);
        const rainScore = lowIsGoodScore(day.rainChance, 22, 78);
        const aqiScore = lowIsGoodScore(day.aqi, 55, 155);
        const stormScore = day.stormSafety;
        const windVariabilityScore = lowIsGoodScore(day.windVariabilityIndex, 35, 90);
        const airClarityScore = day.airClarityIndex;

        score =
            tempScore * 0.24 +
            apparentTempScore * 0.08 +
            windScore * 0.22 +
            gustScore * 0.12 +
            rainScore * 0.13 +
            aqiScore * 0.09 +
            stormScore * 0.08 +
            windVariabilityScore * 0.03 +
            airClarityScore * 0.01;

        if (day.avgTemp >= 50 && day.avgTemp <= 78) {
            reasons.push("comfortable cycling temperatures");
        }

        if (day.windMax <= 11) {
            reasons.push("manageable wind for cycling");
        } else if (day.windMax >= 18) {
            reasons.push("wind may make cycling harder");
        }

        if (day.gustMax >= 24) {
            reasons.push("gusts may affect handling");
        }

        if (day.windVariabilityIndex >= 60) {
            reasons.push("wind may be inconsistent");
        }

        if (day.rainChance <= 22) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 50) {
            reasons.push("rain risk may affect the ride");
        }

        if (day.aqi > 100) {
            reasons.push("air quality may be a concern");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 75) {
            score = Math.min(score, 55);
            reasons.push("storm risk lowers cycling reliability");
        }

        if (day.windMax >= 24 || day.gustMax >= 34) {
            score = Math.min(score, 60);
            reasons.push("strong wind limits cycling comfort");
        }

        break;
        }

    case "fishing": {
        const airTempScore = rangeScore(day.avgTemp, 48, 80, 32, 94);
        const waterScore = rangeScore(day.waterTempEst, 52, 74, 36, 88);

        // Fishing often benefits from some wind/chop, but too much is limiting.
        const windScore =
            day.windMax < 3
            ? 72
            : day.windMax <= 12
                ? 100
                : day.windMax <= 20
                ? lowIsGoodScore(day.windMax, 12, 25)
                : 25;

        const gustScore = lowIsGoodScore(day.gustMax, 18, 36);

        // Rain is less punishing for fishing than for many activities,
        // but storms and heavy rain still matter.
        const rainScore =
            day.rainChance <= 25
            ? 92
            : day.rainChance <= 55
                ? 82
                : lowIsGoodScore(day.rainChance, 55, 92);

        const bugScore = rangeScore(day.bugIndex, 35, 78, 5, 96);

        const pressureTrendScore =
            day.pressureChange >= -6 && day.pressureChange <= -1
            ? 100
            : day.pressureChange > -1 && day.pressureChange <= 3
                ? 88
                : day.pressureChange > -10 && day.pressureChange < 8
                ? 62
                : 35;

        const stormScore = day.stormSafety;
        const airClarityScore = day.airClarityIndex;
        const windVariabilityScore = lowIsGoodScore(
            day.windVariabilityIndex,
            45,
            95
        );

        score =
            waterScore * 0.22 +
            windScore * 0.17 +
            airTempScore * 0.13 +
            pressureTrendScore * 0.13 +
            bugScore * 0.09 +
            rainScore * 0.08 +
            gustScore * 0.06 +
            stormScore * 0.09 +
            airClarityScore * 0.02 +
            windVariabilityScore * 0.01;

        if (day.waterTempEst >= 52 && day.waterTempEst <= 74) {
            reasons.push("estimated water temperature is favorable");
        }

        if (day.windMax >= 3 && day.windMax <= 12) {
            reasons.push("useful light chop");
        } else if (day.windMax > 18) {
            reasons.push("wind may make fishing harder");
        }

        if (day.pressureChange >= -6 && day.pressureChange <= -1) {
            reasons.push("slightly falling pressure");
        } else if (day.pressureChange > -1 && day.pressureChange <= 3) {
            reasons.push("stable pressure");
        }

        if (day.bugIndex >= 35 && day.bugIndex <= 78) {
            reasons.push("insect activity may help fishing");
        }

        if (day.rainChance > 60) {
            reasons.push("rain risk is worth watching");
        }

        if (day.gustMax >= 24) {
            reasons.push("gusts may affect comfort or boat control");
        }

        if (day.stormInstabilityIndex >= 70) {
            reasons.push("storm instability is worth watching");
        }

        if (day.stormSafety < 50 || day.stormInstabilityIndex >= 85) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits fishing safety");
        }

        if (day.gustMax >= 34 || day.windMax >= 24) {
            score = Math.min(score, 55);
            reasons.push("strong wind limits fishing reliability");
        }

        const excellentFishingConditions =
            day.avgTemp >= 54 &&
            day.avgTemp <= 74 &&
            day.waterTempEst >= 56 &&
            day.waterTempEst <= 70 &&
            day.windMax >= 4 &&
            day.windMax <= 9 &&
            day.gustMax <= 14 &&
            day.pressureChange >= -6 &&
            day.pressureChange <= 2 &&
            day.bugIndex >= 40 &&
            day.bugIndex <= 72 &&
            day.rainChance <= 25 &&
            day.stormSafety >= 90 &&
            day.stormInstabilityIndex <= 25;

        const goodFishingConditions =
            day.avgTemp >= 48 &&
            day.avgTemp <= 80 &&
            day.waterTempEst >= 50 &&
            day.waterTempEst <= 74 &&
            day.windMax >= 2 &&
            day.windMax <= 13 &&
            day.gustMax <= 20 &&
            day.rainChance <= 45 &&
            day.stormSafety >= 80 &&
            day.stormInstabilityIndex <= 45;

        score = capScoreByConditionTier({
            score,
            excellent: excellentFishingConditions,
            good: goodFishingConditions,
            excellentCap: 96,
            goodCap: 90,
            ordinaryCap: 82,
            });

        break;
        }

    case "kayaking":
    case "paddleboarding": {
    const tempScore = rangeScore(day.avgTemp, 64, 86, 48, 96);
    const waterScore = rangeScore(day.waterTempEst, 60, 78, 44, 88);
    const windScore = lowIsGoodScore(day.windMax, 8, 22);
    const gustScore = lowIsGoodScore(day.gustMax, 15, 34);
    const rainScore = lowIsGoodScore(day.rainChance, 22, 78);
    const stormScore = day.stormSafety;
    const windVariabilityScore = lowIsGoodScore(
        day.windVariabilityIndex,
        35,
        90
    );
    const airClarityScore = day.airClarityIndex;

    score =
        tempScore * 0.16 +
        waterScore * 0.15 +
        windScore * 0.27 +
        gustScore * 0.17 +
        rainScore * 0.09 +
        stormScore * 0.12 +
        windVariabilityScore * 0.03 +
        airClarityScore * 0.01;

    if (day.windMax <= 8) {
        reasons.push("low wind");
    } else if (day.windMax >= 14) {
        reasons.push("wind may make paddling harder");
    }

    if (day.gustMax <= 15) {
        reasons.push("manageable gusts");
    } else if (day.gustMax >= 22) {
        reasons.push("gusts may affect control");
    }

    if (day.waterTempEst >= 60) {
        reasons.push("reasonable estimated water temperature");
    } else {
        reasons.push("cold water may increase risk");
    }

    if (day.rainChance >= 50) {
        reasons.push("rain risk may affect paddling");
    }

    if (day.windVariabilityIndex >= 60) {
        reasons.push("wind may be inconsistent");
    }

    if (day.stormInstabilityIndex >= 65) {
        reasons.push("storm instability is worth watching");
    }

    if (day.stormSafety < 60 || day.stormInstabilityIndex >= 80) {
        score = Math.min(score, 40);
        reasons.push("storm risk is a paddling safety concern");
    }

    if (day.windMax >= 18 || day.gustMax >= 28) {
        score = Math.min(score, 45);
        reasons.push("wind conditions may be unsafe or difficult on water");
    } else if (day.windMax >= 14 || day.gustMax >= 22) {
        score = Math.min(score, 62);
        reasons.push("wind lowers paddling reliability");
    }

    if (day.waterTempEst < 50) {
        score = Math.min(score, 45);
        reasons.push("cold water limits paddling safety");
    }

    const excellentPaddlingConditions =
        day.avgTemp >= 70 &&
        day.avgTemp <= 82 &&
        day.waterTempEst >= 64 &&
        day.waterTempEst <= 76 &&
        day.windMax <= 6 &&
        day.gustMax <= 12 &&
        day.rainChance <= 12 &&
        day.stormSafety >= 92 &&
        day.stormInstabilityIndex <= 20 &&
        day.windVariabilityIndex <= 30;

    const goodPaddlingConditions =
        day.avgTemp >= 64 &&
        day.avgTemp <= 86 &&
        day.waterTempEst >= 58 &&
        day.waterTempEst <= 80 &&
        day.windMax <= 10 &&
        day.gustMax <= 18 &&
        day.rainChance <= 30 &&
        day.stormSafety >= 82 &&
        day.stormInstabilityIndex <= 45;

    score = capScoreByConditionTier({
        score,
        excellent: excellentPaddlingConditions,
        good: goodPaddlingConditions,
        goodCap: 92,
        ordinaryCap: 82,
    });

    break;
    }

    case "beach":
    case "swimming": {
    const tempScore = rangeScore(day.avgTemp, 74, 90, 58, 100);
    const apparentTempScore = rangeScore(day.apparentTemp, 74, 92, 58, 104);
    const rainScore = lowIsGoodScore(day.rainChance, 22, 82);
    const windScore = lowIsGoodScore(day.windMax, 16, 34);
    const gustScore = lowIsGoodScore(day.gustMax, 24, 42);
    const uvScore = rangeScore(day.uvIndex, 3, 8, 0, 11);
    const waterScore = rangeScore(day.waterTempEst, 68, 82, 54, 90);
    const stormScore = day.stormSafety;
    const airClarityScore = day.airClarityIndex;

    score =
        tempScore * 0.24 +
        apparentTempScore * 0.08 +
        rainScore * 0.17 +
        windScore * 0.1 +
        gustScore * 0.05 +
        uvScore * 0.11 +
        waterScore * 0.13 +
        stormScore * 0.1 +
        airClarityScore * 0.02;

    if (day.avgTemp >= 74) {
        reasons.push("warm outdoor temperatures");
    }

    if (day.waterTempEst >= 68) {
        reasons.push("estimated water temperature is comfortable");
    } else {
        reasons.push("water may feel cool");
    }

    if (day.rainChance <= 22) {
        reasons.push("low rain chances");
    } else if (day.rainChance >= 55) {
        reasons.push("rain may interrupt beach or swimming plans");
    }

    if (day.windMax >= 18) {
        reasons.push("wind may reduce comfort");
    }

    if (day.gustMax >= 28) {
        reasons.push("gusts may affect beach comfort");
    }

    if (day.uvIndex >= 3 && day.uvIndex <= 8) {
        reasons.push("usable sun exposure");
    } else if (day.uvIndex > 9) {
        reasons.push("strong UV requires caution");
    }

    if (day.stormInstabilityIndex >= 65) {
        reasons.push("storm instability is worth watching");
    }

    if (day.stormSafety < 60 || day.stormInstabilityIndex >= 80) {
        score = Math.min(score, 40);
        reasons.push("storm risk is a water safety concern");
    }

    if (day.rainChance >= 75) {
        score = Math.min(score, 50);
        reasons.push("high rain risk lowers reliability");
    }

    if (day.windMax >= 28 || day.gustMax >= 40) {
        score = Math.min(score, 55);
        reasons.push("strong wind limits comfort");
    }

    if (day.waterTempEst < 60 && day.avgTemp < 78) {
        score = Math.min(score, 55);
        reasons.push("cool air and water reduce comfort");
    }

    const excellentBeachConditions =
        day.avgTemp >= 78 &&
        day.avgTemp <= 88 &&
        day.apparentTemp <= 92 &&
        day.waterTempEst >= 70 &&
        day.waterTempEst <= 82 &&
        day.windMax <= 12 &&
        day.gustMax <= 22 &&
        day.rainChance <= 12 &&
        day.uvIndex >= 3 &&
        day.uvIndex <= 8 &&
        day.stormSafety >= 90 &&
        day.stormInstabilityIndex <= 25;

    const goodBeachConditions =
        day.avgTemp >= 72 &&
        day.avgTemp <= 92 &&
        day.apparentTemp <= 96 &&
        day.waterTempEst >= 66 &&
        day.windMax <= 18 &&
        day.gustMax <= 28 &&
        day.rainChance <= 30 &&
        day.stormSafety >= 82 &&
        day.stormInstabilityIndex <= 45;

    score = capScoreByConditionTier({
        score,
        excellent: excellentBeachConditions,
        good: goodBeachConditions,
        goodCap: 93,
        ordinaryCap: 84,
    });

    break;
    }

    case "camping": {
        const tempScore = rangeScore(day.avgTemp, 55, 82, 35, 96);

        const rainScore = clampScore(
            lowIsGoodScore(day.rainChance, 30, 82) * 0.3 +
            lowIsGoodScore(day.rainIntensityIndex, 35, 90) * 0.45 +
            lowIsGoodScore(day.precipHours, 3, 12) * 0.25
        );

        const groundScore = lowIsGoodScore(day.groundWetnessIndex, 58, 94);
        const bugComfort = lowIsGoodScore(day.bugIndex, 48, 90);
        const windScore = lowIsGoodScore(day.windMax, 18, 38);
        const gustScore = lowIsGoodScore(day.gustMax, 30, 48);
        const stormScore = day.stormSafety;

        score =
            tempScore * 0.25 +
            rainScore * 0.2 +
            groundScore * 0.13 +
            bugComfort * 0.12 +
            windScore * 0.08 +
            gustScore * 0.04 +
            stormScore * 0.18;

        if (day.avgTemp >= 55 && day.avgTemp <= 82) {
            reasons.push("comfortable camping temperatures");
        }

        if (day.rainChance <= 30 && day.rainIntensityIndex <= 35) {
            reasons.push("limited rain impact");
        } else if (day.rainIntensityIndex >= 60 || day.precipHours >= 8) {
            reasons.push("rain could affect camp comfort");
        }

        if (day.groundWetnessIndex >= 70) {
            reasons.push("ground conditions may be damp");
        }

        if (day.bugIndex >= 65) {
            reasons.push("bugs may be annoying");
        }

        if (day.windMax >= 24 || day.gustMax >= 34) {
            reasons.push("wind may affect camp setup");
        }

        if (day.rainIntensityIndex >= 82 || day.groundWetnessIndex >= 92) {
            score = Math.min(score, 58);
            reasons.push("wet conditions limit camping reliability");
        } else if (day.rainIntensityIndex >= 65 || day.groundWetnessIndex >= 82) {
            score = Math.min(score, 72);
            reasons.push("damp conditions reduce camping reliability");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 78) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits camping safety");
        }

        const excellentCampingConditions =
            day.avgTemp >= 60 &&
            day.avgTemp <= 78 &&
            day.rainChance <= 18 &&
            day.rainIntensityIndex <= 25 &&
            day.groundWetnessIndex <= 45 &&
            day.bugIndex <= 55 &&
            day.windMax <= 15 &&
            day.gustMax <= 26 &&
            day.stormSafety >= 88 &&
            day.stormInstabilityIndex <= 30;

        const goodCampingConditions =
            day.avgTemp >= 54 &&
            day.avgTemp <= 84 &&
            day.rainChance <= 35 &&
            day.rainIntensityIndex <= 45 &&
            day.groundWetnessIndex <= 68 &&
            day.bugIndex <= 70 &&
            day.windMax <= 20 &&
            day.stormSafety >= 78 &&
            day.stormInstabilityIndex <= 50;

        score = capScoreByConditionTier({
            score,
            excellent: excellentCampingConditions,
            good: goodCampingConditions,
            excellentCap: 94,
            goodCap: 89,
            ordinaryCap: 82,
        });

        break;
        }

    case "disc_golf": {
        const tempScore = rangeScore(day.avgTemp, 48, 78, 30, 94);
        const windScore = lowIsGoodScore(day.windMax, 10, 26);
        const gustScore = lowIsGoodScore(day.gustMax, 18, 36);
        const rainScore = lowIsGoodScore(day.rainChance, 28, 82);
        const groundScore = lowIsGoodScore(day.groundWetnessIndex, 60, 92);
        const bugComfort = lowIsGoodScore(day.bugIndex, 45, 90);
        const stormScore = day.stormSafety;
        const airClarityScore = day.airClarityIndex;

        score =
            tempScore * 0.24 +
            windScore * 0.22 +
            gustScore * 0.08 +
            rainScore * 0.15 +
            groundScore * 0.12 +
            bugComfort * 0.07 +
            stormScore * 0.1 +
            airClarityScore * 0.02;

        if (day.avgTemp >= 48 && day.avgTemp <= 78) {
            reasons.push("good disc golf temperatures");
        }

        if (day.windMax <= 10) {
            reasons.push("manageable wind");
        } else if (day.windMax >= 16) {
            reasons.push("wind may affect disc control");
        }

        if (day.gustMax >= 24) {
            reasons.push("gusts may make throws less reliable");
        }

        if (day.rainChance <= 28) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 55) {
            reasons.push("rain may affect the round");
        }

        if (day.groundWetnessIndex >= 70) {
            reasons.push("course conditions may be wet or muddy");
        }

        if (day.bugIndex >= 60) {
            reasons.push("bugs may be noticeable");
        }

        if (day.stormInstabilityIndex >= 70) {
            reasons.push("storm instability is worth watching");
        }

        if (day.windMax >= 22 || day.gustMax >= 32) {
            score = Math.min(score, 58);
            reasons.push("strong wind limits disc golf reliability");
        }

        if (day.groundWetnessIndex >= 88) {
            score = Math.min(score, 65);
            reasons.push("wet ground limits course reliability");
        }

        if (day.stormSafety < 50 || day.stormInstabilityIndex >= 80) {
            score = Math.min(score, 50);
            reasons.push("storm risk limits outdoor play");
        }

        const excellentDiscGolfConditions =
            day.avgTemp >= 55 &&
            day.avgTemp <= 75 &&
            day.windMax <= 8 &&
            day.gustMax <= 14 &&
            day.rainChance <= 10 &&
            day.groundWetnessIndex <= 30 &&
            day.bugIndex <= 50 &&
            day.stormSafety >= 90 &&
            day.stormInstabilityIndex <= 20;

        const goodDiscGolfConditions =
            day.avgTemp >= 48 &&
            day.avgTemp <= 80 &&
            day.windMax <= 12 &&
            day.gustMax <= 20 &&
            day.rainChance <= 25 &&
            day.groundWetnessIndex <= 60 &&
            day.stormSafety >= 80 &&
            day.stormInstabilityIndex <= 40;

        score = capScoreByConditionTier({
            score,
            excellent: excellentDiscGolfConditions,
            good: goodDiscGolfConditions,
            goodCap: 92,
            ordinaryCap: 86,
        });

        break;
        }

    case "tennis": {
        const tempScore = rangeScore(day.avgTemp, 52, 78, 38, 96);
        const apparentTempScore = rangeScore(day.apparentTemp, 50, 82, 35, 100);
        const windScore = lowIsGoodScore(day.windMax, 10, 25);
        const gustScore = lowIsGoodScore(day.gustMax, 18, 34);
        const rainScore = lowIsGoodScore(day.rainChance, 18, 75);
        const courtDrynessScore = lowIsGoodScore(day.groundWetnessIndex, 38, 82);
        const stormScore = day.stormSafety;

        score =
            tempScore * 0.28 +
            apparentTempScore * 0.08 +
            windScore * 0.22 +
            gustScore * 0.08 +
            rainScore * 0.18 +
            courtDrynessScore * 0.1 +
            stormScore * 0.06;

        if (day.avgTemp >= 52 && day.avgTemp <= 78) {
            reasons.push("comfortable court temperatures");
        }

        if (day.windMax <= 10) {
            reasons.push("manageable wind");
        } else if (day.windMax >= 16) {
            reasons.push("wind may affect ball control");
        }

        if (day.gustMax >= 24) {
            reasons.push("gusts may make play less consistent");
        }

        if (day.rainChance <= 18) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 45) {
            reasons.push("rain may affect court availability");
        }

        if (day.groundWetnessIndex >= 55) {
            reasons.push("court surfaces may be damp");
        }

        if (day.apparentTemp >= 90) {
            reasons.push("heat may reduce comfort");
        }

        if (day.rainChance >= 60 || day.groundWetnessIndex >= 75) {
            score = Math.min(score, 45);
            reasons.push("wet court risk limits playability");
        } else if (day.rainChance >= 45 || day.groundWetnessIndex >= 62) {
            score = Math.min(score, 65);
            reasons.push("court condition risk lowers reliability");
        }

        if (day.windMax >= 22 || day.gustMax >= 32) {
            score = Math.min(score, 58);
            reasons.push("strong wind limits court play");
        }

        if (day.stormSafety < 50 || day.stormInstabilityIndex >= 80) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits outdoor court play");
        }

        const excellentCourtConditions =
            day.avgTemp >= 58 &&
            day.avgTemp <= 75 &&
            day.apparentTemp <= 80 &&
            day.windMax <= 7 &&
            day.gustMax <= 12 &&
            day.rainChance <= 8 &&
            day.groundWetnessIndex <= 25 &&
            day.stormSafety >= 92 &&
            day.stormInstabilityIndex <= 15;

        const goodCourtConditions =
            day.avgTemp >= 52 &&
            day.avgTemp <= 80 &&
            day.apparentTemp <= 86 &&
            day.windMax <= 11 &&
            day.gustMax <= 18 &&
            day.rainChance <= 25 &&
            day.groundWetnessIndex <= 50 &&
            day.stormSafety >= 80 &&
            day.stormInstabilityIndex <= 40;

        score = capScoreByConditionTier({
            score,
            excellent: excellentCourtConditions,
            good: goodCourtConditions,
            goodCap: 92,
            ordinaryCap: 84,
        });

        break;
        }

    case "golf": {
        const tempScore = rangeScore(day.avgTemp, 52, 78, 38, 95);
        const windScore = lowIsGoodScore(day.windMax, 12, 30);
        const gustScore = lowIsGoodScore(day.gustMax, 22, 40);
        const rainScore = lowIsGoodScore(day.rainChance, 24, 78);
        const groundScore = lowIsGoodScore(day.groundWetnessIndex, 65, 94);
        const bugComfort = lowIsGoodScore(day.bugIndex, 55, 92);
        const stormScore = day.stormSafety;
        const airClarityScore = day.airClarityIndex;

        score =
            tempScore * 0.26 +
            windScore * 0.2 +
            gustScore * 0.08 +
            rainScore * 0.18 +
            groundScore * 0.12 +
            bugComfort * 0.04 +
            stormScore * 0.1 +
            airClarityScore * 0.02;

        if (day.avgTemp >= 52 && day.avgTemp <= 78) {
            reasons.push("comfortable golf temperatures");
        }

        if (day.windMax <= 12) {
            reasons.push("manageable wind");
        } else if (day.windMax >= 18) {
            reasons.push("wind may affect ball flight");
        }

        if (day.rainChance <= 24) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 55) {
            reasons.push("rain may affect the round");
        }

        if (day.groundWetnessIndex >= 75) {
            reasons.push("course may be wet");
        }

        if (day.bugIndex >= 70) {
            reasons.push("bugs may be noticeable");
        }

        if (day.windMax >= 24 || day.gustMax >= 36) {
            score = Math.min(score, 60);
            reasons.push("strong wind limits golf reliability");
        }

        if (day.groundWetnessIndex >= 90) {
            score = Math.min(score, 65);
            reasons.push("wet course conditions may limit play");
        }

        if (day.stormSafety < 50 || day.stormInstabilityIndex >= 80) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits outdoor play");
        }

        const excellentGolfConditions =
            day.avgTemp >= 55 &&
            day.avgTemp <= 75 &&
            day.windMax <= 8 &&
            day.gustMax <= 16 &&
            day.rainChance <= 10 &&
            day.groundWetnessIndex <= 45 &&
            day.stormSafety >= 90 &&
            day.stormInstabilityIndex <= 20;

        const goodGolfConditions =
            day.avgTemp >= 50 &&
            day.avgTemp <= 80 &&
            day.windMax <= 13 &&
            day.gustMax <= 22 &&
            day.rainChance <= 25 &&
            day.groundWetnessIndex <= 65 &&
            day.stormSafety >= 80 &&
            day.stormInstabilityIndex <= 40;

        score = capScoreByConditionTier({
            score,
            excellent: excellentGolfConditions,
            good: goodGolfConditions,
            goodCap: 92,
            ordinaryCap: 86,
        });

        break;
        }

    case "field_sport": {
        const tempScore = rangeScore(day.avgTemp, 54, 80, 32, 96);
        const apparentTempScore = rangeScore(day.apparentTemp, 52, 84, 30, 100);
        const rainScore = lowIsGoodScore(day.rainChance, 25, 80);
        const groundScore = lowIsGoodScore(day.groundWetnessIndex, 60, 92);
        const windScore = lowIsGoodScore(day.windMax, 16, 34);
        const heatScore = lowIsGoodScore(day.apparentTemp, 86, 98);
        const stormScore = day.stormSafety;

        score =
            tempScore * 0.24 +
            apparentTempScore * 0.12 +
            rainScore * 0.2 +
            groundScore * 0.16 +
            windScore * 0.08 +
            heatScore * 0.08 +
            stormScore * 0.12;

        if (day.avgTemp >= 54 && day.avgTemp <= 80) {
            reasons.push("comfortable field conditions");
        }

        if (day.rainChance <= 25) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 55) {
            reasons.push("rain may interrupt play");
        }

        if (day.groundWetnessIndex >= 70) {
            reasons.push("field conditions may be wet or muddy");
        }

        if (day.apparentTemp >= 88) {
            reasons.push("heat may reduce comfort");
        }

        if (day.windMax >= 22) {
            reasons.push("wind may affect play");
        }

        if (day.rainChance >= 65 || day.groundWetnessIndex >= 85) {
            score = Math.min(score, 55);
            reasons.push("wet field risk lowers reliability");
        }

        if (day.apparentTemp >= 96) {
            score = Math.min(score, 50);
            reasons.push("heat stress may be a concern");
        }

        if (day.stormSafety < 50 || day.stormInstabilityIndex >= 80) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits outdoor play");
        }

        const excellentFieldConditions =
            day.avgTemp >= 55 &&
            day.avgTemp <= 78 &&
            day.apparentTemp <= 82 &&
            day.rainChance <= 10 &&
            day.groundWetnessIndex <= 35 &&
            day.windMax <= 12 &&
            day.stormSafety >= 90 &&
            day.stormInstabilityIndex <= 20;

        const goodFieldConditions =
            day.avgTemp >= 52 &&
            day.avgTemp <= 82 &&
            day.apparentTemp <= 88 &&
            day.rainChance <= 30 &&
            day.groundWetnessIndex <= 60 &&
            day.windMax <= 18 &&
            day.stormSafety >= 80 &&
            day.stormInstabilityIndex <= 45;

        score = capScoreByConditionTier({
            score,
            excellent: excellentFieldConditions,
            good: goodFieldConditions,
            goodCap: 92,
            ordinaryCap: 85,
        });

        break;
        }

    case "court_sport": {
        const tempScore = rangeScore(day.avgTemp, 52, 82, 35, 98);
        const apparentTempScore = rangeScore(day.apparentTemp, 50, 86, 32, 102);
        const rainScore = lowIsGoodScore(day.rainChance, 24, 78);
        const courtDrynessScore = lowIsGoodScore(day.groundWetnessIndex, 45, 86);
        const windScore = lowIsGoodScore(day.windMax, 18, 36);
        const stormScore = day.stormSafety;

        score =
            tempScore * 0.26 +
            apparentTempScore * 0.12 +
            rainScore * 0.24 +
            courtDrynessScore * 0.18 +
            windScore * 0.06 +
            stormScore * 0.14;

        if (day.avgTemp >= 52 && day.avgTemp <= 82) {
            reasons.push("comfortable outdoor court temperatures");
        }

        if (day.rainChance <= 24) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 50) {
            reasons.push("rain may affect outdoor courts");
        }

        if (day.groundWetnessIndex >= 65) {
            reasons.push("court surfaces may be wet");
        }

        if (day.apparentTemp >= 90) {
            reasons.push("heat may reduce comfort");
        }

        if (day.rainChance >= 60 || day.groundWetnessIndex >= 80) {
            score = Math.min(score, 50);
            reasons.push("wet court risk limits playability");
        }

        if (day.apparentTemp >= 98) {
            score = Math.min(score, 50);
            reasons.push("heat stress may be a concern");
        }

        if (day.stormSafety < 50 || day.stormInstabilityIndex >= 80) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits outdoor court play");
        }

        const excellentOutdoorCourtConditions =
            day.avgTemp >= 55 &&
            day.avgTemp <= 80 &&
            day.apparentTemp <= 84 &&
            day.rainChance <= 10 &&
            day.groundWetnessIndex <= 30 &&
            day.stormSafety >= 90 &&
            day.stormInstabilityIndex <= 20;

        const goodOutdoorCourtConditions =
            day.avgTemp >= 50 &&
            day.avgTemp <= 84 &&
            day.apparentTemp <= 90 &&
            day.rainChance <= 28 &&
            day.groundWetnessIndex <= 55 &&
            day.stormSafety >= 80 &&
            day.stormInstabilityIndex <= 45;

        score = capScoreByConditionTier({
            score,
            excellent: excellentOutdoorCourtConditions,
            good: goodOutdoorCourtConditions,
            goodCap: 91,
            ordinaryCap: 84,
        });

        break;
        }

    case "photography": {
        const rainScore = clampScore(
            lowIsGoodScore(day.rainChance, 30, 82) * 0.5 +
            lowIsGoodScore(day.rainIntensityIndex, 35, 88) * 0.5
        );
        const windScore = lowIsGoodScore(day.windMax, 16, 36);
        const comfortScore = rangeScore(day.avgTemp, 40, 82, 15, 98);
        const airClarityScore = day.airClarityIndex;
        const lightScore = day.lightQualityIndex;

        const cloudInterestScore =
            day.cloudHigh >= 20 && day.cloudHigh <= 80
            ? 100
            : day.cloudMid >= 25 && day.cloudMid <= 75
                ? 92
                : day.cloudCover >= 25 && day.cloudCover <= 75
                ? 88
                : day.cloudCover < 15
                    ? 72
                    : 62;

        score =
            lightScore * 0.26 +
            cloudInterestScore * 0.24 +
            airClarityScore * 0.18 +
            rainScore * 0.14 +
            windScore * 0.08 +
            comfortScore * 0.06 +
            day.stormSafety * 0.04;

        if (day.lightQualityIndex >= 70) {
            reasons.push("strong light quality");
        }

        if (day.airClarityIndex >= 70) {
            reasons.push("good air clarity");
        } else if (day.airClarityIndex < 55) {
            reasons.push("air clarity may be reduced");
        }

        if (day.cloudHigh >= 20 && day.cloudHigh <= 80) {
            reasons.push("interesting high cloud cover");
        } else if (day.cloudCover >= 25 && day.cloudCover <= 75) {
            reasons.push("interesting cloud cover");
        }

        if (day.rainIntensityIndex >= 55) {
            reasons.push("rain may limit shooting conditions");
        }

        if (day.windMax >= 20) {
            reasons.push("wind may affect stability");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 75) {
            score = Math.min(score, 55);
            reasons.push("storm risk limits reliability");
        }

        const excellentPhotoConditions =
            day.lightQualityIndex >= 78 &&
            day.airClarityIndex >= 75 &&
            day.rainIntensityIndex <= 25 &&
            day.windMax <= 14 &&
            day.stormSafety >= 88 &&
            day.stormInstabilityIndex <= 30;

        const goodPhotoConditions =
            day.lightQualityIndex >= 62 &&
            day.airClarityIndex >= 60 &&
            day.rainIntensityIndex <= 45 &&
            day.windMax <= 20 &&
            day.stormSafety >= 78 &&
            day.stormInstabilityIndex <= 50;

        score = capScoreByConditionTier({
            score,
            excellent: excellentPhotoConditions,
            good: goodPhotoConditions,
            goodCap: 92,
            ordinaryCap: 84,
        });

        break;
        }

    case "wildlife": {
        const tempScore = rangeScore(day.avgTemp, 38, 76, 15, 94);
        const windScore = lowIsGoodScore(day.windMax, 12, 30);
        const rainScore = clampScore(
            lowIsGoodScore(day.rainChance, 35, 85) * 0.55 +
            lowIsGoodScore(day.rainIntensityIndex, 35, 88) * 0.45
        );
        const airClarityScore = day.airClarityIndex;
        const lightScore = day.lightQualityIndex;
        const stormScore = day.stormSafety;

        // Some bug activity can correlate with wildlife activity, but too much
        // can reduce comfort.
        const bugActivityScore =
            day.bugIndex >= 25 && day.bugIndex <= 70
            ? 90
            : day.bugIndex > 85
                ? 55
                : 72;

        score =
            tempScore * 0.22 +
            windScore * 0.18 +
            rainScore * 0.16 +
            airClarityScore * 0.14 +
            lightScore * 0.12 +
            stormScore * 0.12 +
            bugActivityScore * 0.06;

        if (day.windMax <= 12) {
            reasons.push("low wind for wildlife activity");
        } else if (day.windMax >= 20) {
            reasons.push("wind may reduce sightings");
        }

        if (day.rainChance <= 35 && day.rainIntensityIndex <= 35) {
            reasons.push("manageable rain chances");
        } else if (day.rainIntensityIndex >= 55) {
            reasons.push("rain may reduce comfort and visibility");
        }

        if (day.airClarityIndex >= 70) {
            reasons.push("good visibility and air clarity");
        }

        if (day.lightQualityIndex >= 65) {
            reasons.push("useful light conditions");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 75) {
            score = Math.min(score, 55);
            reasons.push("storm risk lowers reliability");
        }

        const excellentWildlifeConditions =
            day.avgTemp >= 45 &&
            day.avgTemp <= 72 &&
            day.windMax <= 8 &&
            day.rainChance <= 20 &&
            day.rainIntensityIndex <= 25 &&
            day.airClarityIndex >= 75 &&
            day.stormSafety >= 88 &&
            day.stormInstabilityIndex <= 25;

        const goodWildlifeConditions =
            day.avgTemp >= 38 &&
            day.avgTemp <= 78 &&
            day.windMax <= 14 &&
            day.rainChance <= 40 &&
            day.rainIntensityIndex <= 45 &&
            day.airClarityIndex >= 60 &&
            day.stormSafety >= 78 &&
            day.stormInstabilityIndex <= 50;

        score = capScoreByConditionTier({
            score,
            excellent: excellentWildlifeConditions,
            good: goodWildlifeConditions,
            goodCap: 92,
            ordinaryCap: 84,
        });

        break;
        }

    case "stargazing": {
        const totalCloudScore = lowIsGoodScore(day.cloudCover, 18, 80);
        const lowCloudScore = lowIsGoodScore(day.cloudLow, 10, 65);
        const midCloudScore = lowIsGoodScore(day.cloudMid, 18, 75);
        const rainScore = clampScore(
            lowIsGoodScore(day.rainChance, 12, 65) * 0.5 +
            lowIsGoodScore(day.rainIntensityIndex, 15, 70) * 0.5
        );
        const windScore = lowIsGoodScore(day.windMax, 16, 36);
        const airClarityScore = day.airClarityIndex;
        const stormScore = day.stormSafety;

        score =
            totalCloudScore * 0.3 +
            lowCloudScore * 0.18 +
            midCloudScore * 0.12 +
            airClarityScore * 0.18 +
            rainScore * 0.12 +
            windScore * 0.04 +
            stormScore * 0.06;

        if (day.cloudCover <= 18) {
            reasons.push("low total cloud cover");
        }

        if (day.cloudLow <= 10) {
            reasons.push("low cloud cover is minimal");
        }

        if (day.airClarityIndex >= 75) {
            reasons.push("good sky clarity");
        } else if (day.airClarityIndex < 55) {
            reasons.push("air clarity may limit visibility");
        }

        if (day.rainChance <= 12 && day.rainIntensityIndex <= 15) {
            reasons.push("low rain risk");
        }

        if (day.cloudCover >= 70 || day.cloudLow >= 55) {
            score = Math.min(score, 45);
            reasons.push("cloud cover limits stargazing");
        }

        if (day.rainIntensityIndex >= 55) {
            score = Math.min(score, 45);
            reasons.push("rain risk limits sky viewing");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 75) {
            score = Math.min(score, 45);
            reasons.push("storm risk lowers reliability");
        }

        const excellentStargazingConditions =
            day.cloudCover <= 12 &&
            day.cloudLow <= 8 &&
            day.cloudMid <= 15 &&
            day.airClarityIndex >= 82 &&
            day.rainChance <= 8 &&
            day.rainIntensityIndex <= 10 &&
            day.stormSafety >= 90 &&
            day.stormInstabilityIndex <= 20;

        const goodStargazingConditions =
            day.cloudCover <= 28 &&
            day.cloudLow <= 18 &&
            day.cloudMid <= 35 &&
            day.airClarityIndex >= 68 &&
            day.rainChance <= 20 &&
            day.rainIntensityIndex <= 25 &&
            day.stormSafety >= 80 &&
            day.stormInstabilityIndex <= 45;

        score = capScoreByConditionTier({
            score,
            excellent: excellentStargazingConditions,
            good: goodStargazingConditions,
            goodCap: 92,
            ordinaryCap: 80,
        });

        break;
        }

    case "picnic": {
        const tempScore = rangeScore(day.avgTemp, 58, 84, 40, 98);

        const rainScore = clampScore(
            lowIsGoodScore(day.rainChance, 32, 82) * 0.4 +
            lowIsGoodScore(day.rainIntensityIndex, 35, 90) * 0.4 +
            lowIsGoodScore(day.daytimePrecipHours, 2, 8) * 0.2
        );

        const windScore = lowIsGoodScore(day.windMax, 17, 34);
        const bugComfort = lowIsGoodScore(day.bugIndex, 58, 92);
        const groundScore = lowIsGoodScore(day.groundWetnessIndex, 62, 92);
        const pollenComfort = lowIsGoodScore(day.pollenIndex, 70, 98);
        const stormScore = day.stormSafety;

        score =
            tempScore * 0.3 +
            rainScore * 0.2 +
            windScore * 0.1 +
            bugComfort * 0.1 +
            groundScore * 0.1 +
            pollenComfort * 0.04 +
            stormScore * 0.16;

        if (day.avgTemp >= 58 && day.avgTemp <= 84) {
            reasons.push("comfortable picnic temperatures");
        }

        if (day.rainChance <= 32 && day.rainIntensityIndex <= 35) {
            reasons.push("limited rain impact");
        } else if (day.rainIntensityIndex >= 55) {
            reasons.push("rain may affect picnic comfort");
        }

        if (day.groundWetnessIndex >= 75) {
            reasons.push("ground may be damp");
        }

        if (day.bugIndex >= 70) {
            reasons.push("bugs may be noticeable");
        }

        if (day.windMax >= 24) {
            reasons.push("wind may reduce comfort");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 78) {
            score = Math.min(score, 50);
            reasons.push("storm risk lowers reliability");
        }

        if (day.rainIntensityIndex >= 78 || day.daytimePrecipHours >= 7) {
            score = Math.min(score, 62);
            reasons.push("rain timing limits picnic reliability");
        }

        const excellentPicnicConditions =
            day.avgTemp >= 63 &&
            day.avgTemp <= 80 &&
            day.rainChance <= 22 &&
            day.rainIntensityIndex <= 30 &&
            day.daytimePrecipHours <= 2 &&
            day.groundWetnessIndex <= 52 &&
            day.bugIndex <= 62 &&
            day.windMax <= 15 &&
            day.stormSafety >= 88 &&
            day.stormInstabilityIndex <= 30;

        const goodPicnicConditions =
            day.avgTemp >= 56 &&
            day.avgTemp <= 86 &&
            day.rainChance <= 40 &&
            day.rainIntensityIndex <= 50 &&
            day.daytimePrecipHours <= 4 &&
            day.groundWetnessIndex <= 72 &&
            day.bugIndex <= 76 &&
            day.windMax <= 22 &&
            day.stormSafety >= 78 &&
            day.stormInstabilityIndex <= 50;

        score = capScoreByConditionTier({
            score,
            excellent: excellentPicnicConditions,
            good: goodPicnicConditions,
            excellentCap: 94,
            goodCap: 90,
            ordinaryCap: 86,
        });

        break;
        }

    case "gardening": {
        const tempScore = rangeScore(day.avgTemp, 46, 80, 32, 96);

        // Some moisture can be useful for gardening, but heavy rain is disruptive.
        const rainScore =
            day.rainIntensityIndex <= 40
            ? 90
            : lowIsGoodScore(day.rainIntensityIndex, 40, 92);

        const windScore = lowIsGoodScore(day.windMax, 20, 38);
        const heatScore = lowIsGoodScore(day.apparentTemp, 88, 100);
        const groundScore = rangeScore(day.groundWetnessIndex, 15, 72, 0, 98);
        const pollenComfort = lowIsGoodScore(day.pollenIndex, 75, 100);
        const stormScore = day.stormSafety;

        score =
            tempScore * 0.3 +
            rainScore * 0.1 +
            windScore * 0.14 +
            heatScore * 0.1 +
            groundScore * 0.18 +
            pollenComfort * 0.04 +
            stormScore * 0.14;

        if (day.avgTemp >= 46 && day.avgTemp <= 80) {
            reasons.push("comfortable gardening temperatures");
        }

        if (day.groundWetnessIndex >= 15 && day.groundWetnessIndex <= 72) {
            reasons.push("workable ground moisture");
        } else if (day.groundWetnessIndex > 85) {
            reasons.push("ground may be too wet");
        }

        if (day.windMax >= 24) {
            reasons.push("wind may make gardening harder");
        }

        if (day.apparentTemp >= 92) {
            reasons.push("heat may reduce comfort");
        }

        if (day.rainIntensityIndex >= 65) {
            reasons.push("rain intensity may interrupt outdoor work");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 78) {
            score = Math.min(score, 50);
            reasons.push("storm risk lowers reliability");
        }

        if (day.rainIntensityIndex >= 80) {
            score = Math.min(score, 65);
            reasons.push("heavy rain limits gardening reliability");
        }

        const excellentGardeningConditions =
            day.avgTemp >= 50 &&
            day.avgTemp <= 78 &&
            day.apparentTemp <= 84 &&
            day.windMax <= 16 &&
            day.groundWetnessIndex >= 12 &&
            day.groundWetnessIndex <= 70 &&
            day.rainIntensityIndex <= 40 &&
            day.stormSafety >= 88 &&
            day.stormInstabilityIndex <= 30;

        const goodGardeningConditions =
            day.avgTemp >= 44 &&
            day.avgTemp <= 86 &&
            day.windMax <= 22 &&
            day.groundWetnessIndex <= 84 &&
            day.rainIntensityIndex <= 55 &&
            day.stormSafety >= 78 &&
            day.stormInstabilityIndex <= 50;

        score = capScoreByConditionTier({
            score,
            excellent: excellentGardeningConditions,
            good: goodGardeningConditions,
            excellentCap: 94,
            goodCap: 90,
            ordinaryCap: 85,
        });

        break;
        }

    case "outdoor_workout": {
        const tempScore = rangeScore(day.avgTemp, 42, 72, 20, 92);
        const apparentTempScore = rangeScore(day.apparentTemp, 40, 76, 18, 98);
        const rainScore = lowIsGoodScore(day.rainChance, 24, 78);
        const windScore = lowIsGoodScore(day.windMax, 14, 32);
        const aqiScore = lowIsGoodScore(day.aqi, 55, 155);
        const dewPointScore = lowIsGoodScore(day.dewPoint, 62, 74);
        const stormScore = day.stormSafety;
        const airClarityScore = day.airClarityIndex;
        const pollenComfortScore = lowIsGoodScore(day.pollenIndex, 60, 95);

        score =
            tempScore * 0.26 +
            apparentTempScore * 0.16 +
            rainScore * 0.16 +
            windScore * 0.1 +
            aqiScore * 0.13 +
            dewPointScore * 0.08 +
            stormScore * 0.08 +
            airClarityScore * 0.02 +
            pollenComfortScore * 0.01;

        if (day.avgTemp >= 42 && day.avgTemp <= 72) {
            reasons.push("comfortable workout temperatures");
        }

        if (day.apparentTemp >= 86) {
            reasons.push("heat may make outdoor exertion harder");
        }

        if (day.dewPoint >= 68) {
            reasons.push("humidity may reduce comfort");
        }

        if (day.windMax <= 14) {
            reasons.push("manageable wind");
        }

        if (day.rainChance >= 50) {
            reasons.push("rain may interrupt the workout");
        }

        if (day.aqi > 100) {
            reasons.push("air quality may be a concern");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 75) {
            score = Math.min(score, 55);
            reasons.push("storm risk lowers reliability");
        }

        if (day.apparentTemp >= 94) {
            score = Math.min(score, 45);
            reasons.push("heat stress is a concern");
        }

        break;
        }

    case "outdoor_yoga": {
        const tempScore = rangeScore(day.avgTemp, 58, 78, 42, 90);
        const apparentTempScore = rangeScore(day.apparentTemp, 55, 80, 40, 94);
        const windScore = lowIsGoodScore(day.windMax, 9, 24);
        const rainScore = lowIsGoodScore(day.rainChance, 18, 70);
        const stormScore = day.stormSafety;
        const airClarityScore = day.airClarityIndex;
        const pollenComfortScore = lowIsGoodScore(day.pollenIndex, 55, 95);
        const groundComfortScore = lowIsGoodScore(day.groundWetnessIndex, 60, 90);
        const lightScore = day.lightQualityIndex;

        score =
            tempScore * 0.28 +
            apparentTempScore * 0.12 +
            windScore * 0.2 +
            rainScore * 0.16 +
            stormScore * 0.1 +
            airClarityScore * 0.05 +
            pollenComfortScore * 0.04 +
            groundComfortScore * 0.03 +
            lightScore * 0.02;

        if (day.avgTemp >= 58 && day.avgTemp <= 78) {
            reasons.push("comfortable outdoor yoga temperatures");
        }

        if (day.windMax <= 9) {
            reasons.push("calmer wind conditions");
        } else if (day.windMax >= 16) {
            reasons.push("wind may make the session less comfortable");
        }

        if (day.rainChance <= 18) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 45) {
            reasons.push("rain may interrupt the session");
        }

        if (day.groundWetnessIndex >= 70) {
            reasons.push("ground conditions may be damp");
        }

        if (day.pollenIndex >= 75) {
            reasons.push("pollen may bother sensitive users");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 70) {
            score = Math.min(score, 55);
            reasons.push("storm risk lowers reliability");
        }

        break;
        }

    case "drone": {
        const windScore = lowIsGoodScore(day.windMax, 8, 22);
        const gustScore = lowIsGoodScore(day.gustMax, 15, 32);
        const windVariabilityScore = lowIsGoodScore(day.windVariabilityIndex, 30, 85);
        const rainScore = clampScore(
            lowIsGoodScore(day.rainChance, 12, 65) * 0.45 +
            lowIsGoodScore(day.rainIntensityIndex, 12, 70) * 0.55
        );
        const airClarityScore = day.airClarityIndex;
        const stormScore = day.stormSafety;

        score =
            windScore * 0.34 +
            gustScore * 0.22 +
            windVariabilityScore * 0.1 +
            rainScore * 0.14 +
            airClarityScore * 0.1 +
            stormScore * 0.1;

        if (day.windMax <= 8) {
            reasons.push("low wind for flying");
        } else if (day.windMax >= 14) {
            reasons.push("wind may affect flight control");
        }

        if (day.gustMax <= 15) {
            reasons.push("manageable gusts");
        } else if (day.gustMax >= 22) {
            reasons.push("gusts may make flying less reliable");
        }

        if (day.airClarityIndex >= 70) {
            reasons.push("good visibility and air clarity");
        }

        if (day.rainIntensityIndex >= 30) {
            reasons.push("rain may affect flying");
        }

        if (day.windMax >= 18 || day.gustMax >= 28) {
            score = Math.min(score, 45);
            reasons.push("wind conditions limit drone reliability");
        }

        if (day.rainChance >= 45 || day.rainIntensityIndex >= 45) {
            score = Math.min(score, 45);
            reasons.push("precipitation risk limits flying");
        }

        if (day.stormSafety < 65 || day.stormInstabilityIndex >= 65) {
            score = Math.min(score, 35);
            reasons.push("storm risk is a flight safety concern");
        }

        const excellentDroneConditions =
            day.windMax <= 6 &&
            day.gustMax <= 12 &&
            day.windVariabilityIndex <= 25 &&
            day.rainChance <= 8 &&
            day.rainIntensityIndex <= 8 &&
            day.airClarityIndex >= 80 &&
            day.stormSafety >= 92 &&
            day.stormInstabilityIndex <= 15;

        const goodDroneConditions =
            day.windMax <= 10 &&
            day.gustMax <= 16 &&
            day.windVariabilityIndex <= 40 &&
            day.rainChance <= 20 &&
            day.rainIntensityIndex <= 20 &&
            day.airClarityIndex >= 65 &&
            day.stormSafety >= 85 &&
            day.stormInstabilityIndex <= 35;

        score = capScoreByConditionTier({
            score,
            excellent: excellentDroneConditions,
            good: goodDroneConditions,
            goodCap: 90,
            ordinaryCap: 78,
        });

        break;
        }

    case "kite": {
        const windScore = rangeScore(day.windMax, 9, 17, 3, 30);
        const gustScore = lowIsGoodScore(day.gustMax, 24, 40);
        const windVariabilityScore = lowIsGoodScore(day.windVariabilityIndex, 45, 95);
        const rainScore = clampScore(
            lowIsGoodScore(day.rainChance, 18, 70) * 0.5 +
            lowIsGoodScore(day.rainIntensityIndex, 18, 75) * 0.5
        );
        const stormScore = day.stormSafety;

        score =
            windScore * 0.5 +
            gustScore * 0.16 +
            windVariabilityScore * 0.1 +
            rainScore * 0.1 +
            stormScore * 0.14;

        if (day.windMax >= 9 && day.windMax <= 17) {
            reasons.push("useful steady wind");
        }

        if (day.windMax < 6) {
            reasons.push("wind may be too light");
        }

        if (day.gustMax >= 26) {
            reasons.push("gusts may make kite flying less predictable");
        }

        if (day.windVariabilityIndex >= 65) {
            reasons.push("wind may be inconsistent");
        }

        if (day.rainChance >= 40 || day.rainIntensityIndex >= 40) {
            reasons.push("rain risk may interfere");
        }

        if (day.stormSafety < 60 || day.stormInstabilityIndex >= 75) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits kite flying");
        }

        if (day.windMax >= 24 || day.gustMax >= 34) {
            score = Math.min(score, 55);
            reasons.push("strong wind may be difficult to manage");
        }

        const excellentKiteConditions =
            day.windMax >= 10 &&
            day.windMax <= 16 &&
            day.gustMax <= 22 &&
            day.windVariabilityIndex <= 35 &&
            day.rainChance <= 15 &&
            day.rainIntensityIndex <= 15 &&
            day.stormSafety >= 88 &&
            day.stormInstabilityIndex <= 25;

        const goodKiteConditions =
            day.windMax >= 8 &&
            day.windMax <= 19 &&
            day.gustMax <= 28 &&
            day.windVariabilityIndex <= 55 &&
            day.rainChance <= 30 &&
            day.rainIntensityIndex <= 30 &&
            day.stormSafety >= 78 &&
            day.stormInstabilityIndex <= 45;

        score = capScoreByConditionTier({
            score,
            excellent: excellentKiteConditions,
            good: goodKiteConditions,
            goodCap: 92,
            ordinaryCap: 82,
        });

        break;
        }

    case "skiing": {
        const tempScore = rangeScore(day.avgTemp, 15, 32, -10, 45);
        const windScore = lowIsGoodScore(day.windMax, 18, 38);
        const gustScore = lowIsGoodScore(day.gustMax, 28, 48);
        const rainScore = lowIsGoodScore(day.rainIntensityIndex, 30, 85);
        const winterSurfaceScore = day.winterSurfaceIndex;
        const snowDepthScore = rangeScore(day.snowDepthMax, 3, 24, 0, 48);
        const stormScore = day.stormSafety;

        score =
            winterSurfaceScore * 0.32 +
            snowDepthScore * 0.18 +
            tempScore * 0.2 +
            windScore * 0.1 +
            gustScore * 0.06 +
            rainScore * 0.06 +
            stormScore * 0.08;

        if (day.avgTemp <= 32) {
            reasons.push("cold enough for winter conditions");
        }

        if (day.snowDepthMax >= 3) {
            reasons.push("snow depth supports winter surface conditions");
        }

        if (day.winterSurfaceIndex >= 70) {
            reasons.push("winter surface signal is favorable");
        }

        if (day.rainIntensityIndex >= 45) {
            reasons.push("rain may degrade winter surface quality");
        }

        if (day.windMax >= 24) {
            reasons.push("wind may reduce comfort");
        }

        if (day.winterSurfaceIndex < 35 || day.snowDepthMax < 1) {
            score = Math.min(score, 45);
            reasons.push("limited snow surface reliability");
        }

        if (day.rainIntensityIndex >= 65) {
            score = Math.min(score, 45);
            reasons.push("rain risk limits winter surface quality");
        }

        if (day.stormSafety < 50 || day.stormInstabilityIndex >= 80) {
            score = Math.min(score, 45);
            reasons.push("storm risk limits winter activity");
        }

        const excellentSkiConditions =
            day.winterSurfaceIndex >= 78 &&
            day.snowDepthMax >= 4 &&
            day.avgTemp >= 15 &&
            day.avgTemp <= 30 &&
            day.windMax <= 16 &&
            day.rainIntensityIndex <= 15 &&
            day.stormSafety >= 88;

        const goodSkiConditions =
            day.winterSurfaceIndex >= 55 &&
            day.snowDepthMax >= 2 &&
            day.avgTemp <= 36 &&
            day.windMax <= 22 &&
            day.rainIntensityIndex <= 35 &&
            day.stormSafety >= 78;

        score = capScoreByConditionTier({
            score,
            excellent: excellentSkiConditions,
            good: goodSkiConditions,
            goodCap: 88,
            ordinaryCap: 76,
        });

        break;
        }

    case "sledding":
    case "winter_hiking": {
    const tempScore = rangeScore(day.avgTemp, 12, 32, -10, 45);
    const windScore = lowIsGoodScore(day.windMax, 18, 38);
    const rainScore = lowIsGoodScore(day.rainIntensityIndex, 30, 85);
    const winterSurfaceScore = day.winterSurfaceIndex;
    const snowDepthScore =
        day.snowDepthMax >= 2 ? rangeScore(day.snowDepthMax, 2, 12, 0, 30) : 25;
    const stormScore = day.stormSafety;

    score =
        winterSurfaceScore * 0.34 +
        snowDepthScore * 0.18 +
        tempScore * 0.22 +
        windScore * 0.1 +
        rainScore * 0.06 +
        stormScore * 0.1;

    if (day.avgTemp <= 32) {
        reasons.push("cold enough for winter activity");
    }

    if (day.winterSurfaceIndex >= 65) {
        reasons.push("winter surface signal is favorable");
    }

    if (day.snowDepthMax >= 2) {
        reasons.push("snow depth supports winter conditions");
    }

    if (day.rainIntensityIndex >= 45) {
        reasons.push("rain may degrade snow conditions");
    }

    if (day.winterSurfaceIndex < 30) {
        score = Math.min(score, 45);
        reasons.push("winter surface reliability is limited");
    }

    if (day.rainIntensityIndex >= 65) {
        score = Math.min(score, 45);
        reasons.push("rain risk limits winter conditions");
    }

    if (day.stormSafety < 50 || day.stormInstabilityIndex >= 80) {
        score = Math.min(score, 45);
        reasons.push("storm risk limits reliability");
    }

    const excellentWinterConditions =
        day.winterSurfaceIndex >= 75 &&
        day.snowDepthMax >= 3 &&
        day.avgTemp >= 12 &&
        day.avgTemp <= 30 &&
        day.windMax <= 14 &&
        day.rainIntensityIndex <= 15 &&
        day.stormSafety >= 88;

    const goodWinterConditions =
        day.winterSurfaceIndex >= 55 &&
        day.snowDepthMax >= 1.5 &&
        day.avgTemp <= 36 &&
        day.windMax <= 20 &&
        day.rainIntensityIndex <= 35 &&
        day.stormSafety >= 78;

    score = capScoreByConditionTier({
        score,
        excellent: excellentWinterConditions,
        good: goodWinterConditions,
        goodCap: 86,
        ordinaryCap: 74,
    });

    break;
    }

    case "ice_fishing": {
        const tempScore = rangeScore(day.avgTemp, 5, 28, -15, 40);
        const windScore = lowIsGoodScore(day.windMax, 16, 35);
        const winterSurfaceScore = day.winterSurfaceIndex;
        const stormScore = day.stormSafety;
        const rainScore = lowIsGoodScore(day.rainIntensityIndex, 20, 75);

        // This is not an ice safety model. It is only a conservative weather proxy.
        score =
            winterSurfaceScore * 0.32 +
            tempScore * 0.28 +
            windScore * 0.16 +
            rainScore * 0.08 +
            stormScore * 0.16;

        if (day.avgTemp <= 28) {
            reasons.push("cold weather favors ice conditions");
        }

        if (day.winterSurfaceIndex >= 70) {
            reasons.push("winter surface signal is favorable");
        }

        if (day.windMax >= 18) {
            reasons.push("wind may reduce comfort on exposed ice");
        }

        if (day.rainIntensityIndex >= 30) {
            reasons.push("rain may reduce ice-condition reliability");
        }

        if (day.avgTemp > 34 || day.rainIntensityIndex >= 45) {
            score = Math.min(score, 40);
            reasons.push("warm or wet conditions limit ice-fishing reliability");
        }

        if (day.winterSurfaceIndex < 55) {
            score = Math.min(score, 45);
            reasons.push("winter surface signal is not strong enough");
        }

        if (day.stormSafety < 55 || day.stormInstabilityIndex >= 75) {
            score = Math.min(score, 40);
            reasons.push("storm risk limits reliability");
        }

        const excellentIceFishingConditions =
            day.winterSurfaceIndex >= 80 &&
            day.avgTemp >= 5 &&
            day.avgTemp <= 24 &&
            day.windMax <= 12 &&
            day.rainIntensityIndex <= 10 &&
            day.stormSafety >= 90;

        const goodIceFishingConditions =
            day.winterSurfaceIndex >= 65 &&
            day.avgTemp <= 30 &&
            day.windMax <= 18 &&
            day.rainIntensityIndex <= 25 &&
            day.stormSafety >= 80;

        score = capScoreByConditionTier({
            score,
            excellent: excellentIceFishingConditions,
            good: goodIceFishingConditions,
            goodCap: 82,
            ordinaryCap: 68,
        });

        break;
        }

    default: {
      const tempScore = rangeScore(day.avgTemp, 55, 80, 35, 95);
      const rainScore = lowIsGoodScore(day.rainChance, 25, 80);
      const windScore = lowIsGoodScore(day.windMax, 16, 35);

      score =
        tempScore * 0.36 +
        rainScore * 0.24 +
        windScore * 0.16 +
        day.stormSafety * 0.24;

      if (day.avgTemp >= 55 && day.avgTemp <= 80) {
        reasons.push("comfortable outdoor temperatures");
      }

      break;
    }
  }

  score = applyCommonSafetyCaps({
    profile,
    day,
    score,
    reasons,
    });

    return {
    score: clampScore(score),
    explanation:
        reasons.length > 0
        ? `${activity} score is driven by ${reasons.join(", ")}.`
        : `Mixed conditions for ${activity}.`,
    };
}