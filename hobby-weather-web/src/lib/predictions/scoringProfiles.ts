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
};

export type DailyWeather = {
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
      day.avgTemp >= 50 &&
      day.avgTemp <= 78 &&
      day.waterTempEst >= 56 &&
      day.waterTempEst <= 72 &&
      day.windMax >= 3 &&
      day.windMax <= 12 &&
      day.gustMax <= 18 &&
      day.pressureChange >= -7 &&
      day.pressureChange <= 3 &&
      day.bugIndex >= 35 &&
      day.bugIndex <= 78 &&
      day.stormSafety >= 82
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
      day.avgTemp >= 55 &&
      day.avgTemp <= 74 &&
      day.waterTempEst >= 58 &&
      day.waterTempEst <= 68 &&
      day.windMax >= 4 &&
      day.windMax <= 9 &&
      day.gustMax <= 14 &&
      day.pressureChange >= -5 &&
      day.pressureChange <= 1 &&
      day.bugIndex >= 45 &&
      day.bugIndex <= 68 &&
      day.stormSafety >= 92
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
        const tempScore = rangeScore(day.avgTemp, 42, 62, 20, 84);
        const apparentTempScore = rangeScore(day.apparentTemp, 40, 65, 20, 88);
        const windScore = lowIsGoodScore(day.windMax, 8, 24);
        const gustScore = lowIsGoodScore(day.gustMax, 16, 34);
        const rainScore = lowIsGoodScore(day.rainChance, 25, 80);
        const dewPointScore = lowIsGoodScore(day.dewPoint, 58, 72);
        const aqiScore = lowIsGoodScore(day.aqi, 50, 150);

        score =
            tempScore * 0.24 +
            apparentTempScore * 0.14 +
            windScore * 0.13 +
            gustScore * 0.08 +
            rainScore * 0.13 +
            dewPointScore * 0.12 +
            aqiScore * 0.12 +
            day.stormSafety * 0.04;

        if (day.avgTemp >= 42 && day.avgTemp <= 62) {
            reasons.push("comfortable running temperatures");
        }

        if (day.apparentTemp > 78) {
            reasons.push("feels warm for running");
        }

        if (day.windMax <= 8) {
            reasons.push("light wind");
        } else if (day.windMax >= 16) {
            reasons.push("wind may be noticeable");
        }

        if (day.rainChance <= 25) {
            reasons.push("low rain chances");
        } else if (day.rainChance >= 55) {
            reasons.push("rain risk may affect the run");
        }

        if (day.dewPoint >= 65) {
            reasons.push("humidity may feel uncomfortable");
        }

        if (day.aqi > 100) {
            reasons.push("air quality may be a concern");
        }

        break;
        }

    case "walking": {
      const tempScore = rangeScore(day.avgTemp, 45, 78, 20, 92);
      const windScore = lowIsGoodScore(day.windMax, 14, 30);
      const rainScore = lowIsGoodScore(day.rainChance, 30, 85);
      const aqiScore = lowIsGoodScore(day.aqi, 60, 160);

      score =
        tempScore * 0.36 +
        windScore * 0.16 +
        rainScore * 0.22 +
        aqiScore * 0.14 +
        day.stormSafety * 0.12;

      if (day.avgTemp >= 45 && day.avgTemp <= 78) {
        reasons.push("comfortable walking temperatures");
      }
      if (day.rainChance <= 30) reasons.push("manageable rain chances");

      break;
    }

    case "hiking": {
      const tempScore = rangeScore(day.avgTemp, 50, 75, 30, 92);
      const rainScore = lowIsGoodScore(day.rainChance, 25, 80);
      const windScore = lowIsGoodScore(day.windMax, 14, 30);
      const bugComfort = lowIsGoodScore(day.bugIndex, 40, 90);
      const aqiScore = lowIsGoodScore(day.aqi, 50, 150);

      score =
        tempScore * 0.32 +
        rainScore * 0.22 +
        windScore * 0.12 +
        bugComfort * 0.12 +
        aqiScore * 0.1 +
        day.stormSafety * 0.12;

      if (day.avgTemp >= 50 && day.avgTemp <= 75) {
        reasons.push("comfortable hiking temperatures");
      }
      if (day.rainChance <= 25) reasons.push("low rain chances");
      if (day.aqi > 100) reasons.push("air quality may be a concern");

      break;
    }

    case "cycling": {
      const tempScore = rangeScore(day.avgTemp, 55, 78, 35, 95);
      const windScore = lowIsGoodScore(day.windMax, 12, 28);
      const gustScore = lowIsGoodScore(day.gustMax, 20, 38);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
      const aqiScore = lowIsGoodScore(day.aqi, 50, 150);

      score =
        tempScore * 0.32 +
        windScore * 0.22 +
        gustScore * 0.12 +
        rainScore * 0.16 +
        aqiScore * 0.1 +
        day.stormSafety * 0.08;

      if (day.windMax <= 12) reasons.push("manageable wind for cycling");
      if (day.avgTemp >= 55 && day.avgTemp <= 78) {
        reasons.push("comfortable cycling temperatures");
      }

      break;
    }

    case "fishing": {
        const airTempScore = rangeScore(day.avgTemp, 50, 78, 35, 92);

        // Fishing often likes some wind/chop, but too much is bad.
        const windScore =
            day.windMax < 3
            ? 65
            : day.windMax <= 12
                ? 100
                : day.windMax <= 20
                ? lowIsGoodScore(day.windMax, 12, 24)
                : 25;

        const gustScore = lowIsGoodScore(day.gustMax, 18, 35);

        // Light/moderate rain can be okay for fishing, heavy stormy setups are not.
        const rainScore =
            day.rainChance <= 20
            ? 90
            : day.rainChance <= 50
                ? 80
                : lowIsGoodScore(day.rainChance, 50, 90);

        const waterScore = rangeScore(day.waterTempEst, 55, 72, 38, 86);

        // Moderate bug activity can indicate food chain activity.
        const bugScore = rangeScore(day.bugIndex, 35, 75, 5, 95);

        // Pressure change: slightly falling/stable is often favorable.
        const pressureTrendScore =
            day.pressureChange >= -6 && day.pressureChange <= -1
            ? 100
            : day.pressureChange > -1 && day.pressureChange <= 2
                ? 85
                : day.pressureChange > -10 && day.pressureChange < 8
                ? 60
                : 35;

        score =
            waterScore * 0.24 +
            windScore * 0.18 +
            airTempScore * 0.14 +
            pressureTrendScore * 0.14 +
            bugScore * 0.1 +
            rainScore * 0.08 +
            gustScore * 0.06 +
            day.stormSafety * 0.06;

        if (day.waterTempEst >= 55 && day.waterTempEst <= 72) {
            reasons.push("estimated water temperature is favorable");
        }

        if (day.windMax >= 3 && day.windMax <= 12) {
            reasons.push("useful light chop");
        } else if (day.windMax > 18) {
            reasons.push("wind may make fishing harder");
        }

        if (day.pressureChange >= -6 && day.pressureChange <= -1) {
            reasons.push("slightly falling pressure");
        } else if (day.pressureChange > -1 && day.pressureChange <= 2) {
            reasons.push("stable pressure");
        }

        if (day.bugIndex >= 35 && day.bugIndex <= 75) {
            reasons.push("insect activity may help fishing");
        }

        if (day.rainChance > 60) {
            reasons.push("rain risk is worth watching");
        }

        break;
        }

    case "kayaking":
    case "paddleboarding": {
      const tempScore = rangeScore(day.avgTemp, 65, 85, 50, 95);
      const waterScore = rangeScore(day.waterTempEst, 60, 78, 45, 88);
      const windScore = lowIsGoodScore(day.windMax, 8, 20);
      const gustScore = lowIsGoodScore(day.gustMax, 15, 32);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 75);

      score =
        tempScore * 0.18 +
        windScore * 0.28 +
        gustScore * 0.18 +
        rainScore * 0.12 +
        waterScore * 0.14 +
        day.stormSafety * 0.1;

      if (day.windMax <= 8) reasons.push("low wind");
      if (day.gustMax <= 15) reasons.push("manageable gusts");
      if (day.waterTempEst >= 60) reasons.push("reasonable water temperature");

      break;
    }

    case "beach":
    case "swimming": {
      const tempScore = rangeScore(day.avgTemp, 75, 90, 60, 100);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 80);
      const windScore = lowIsGoodScore(day.windMax, 16, 32);
      const uvScore = rangeScore(day.uvIndex, 3, 8, 0, 11);
      const waterScore = rangeScore(day.waterTempEst, 68, 82, 55, 90);

      score =
        tempScore * 0.32 +
        rainScore * 0.2 +
        windScore * 0.14 +
        uvScore * 0.12 +
        waterScore * 0.12 +
        day.stormSafety * 0.1;

      if (day.avgTemp >= 75) reasons.push("warm outdoor temperatures");
      if (day.rainChance <= 20) reasons.push("low rain chances");

      break;
    }

    case "camping": {
      const tempScore = rangeScore(day.avgTemp, 65, 82, 45, 95);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
      const bugComfort = lowIsGoodScore(day.bugIndex, 30, 85);

      score =
        tempScore * 0.38 +
        rainScore * 0.24 +
        bugComfort * 0.18 +
        day.stormSafety * 0.2;

      if (day.avgTemp >= 65 && day.avgTemp <= 82) {
        reasons.push("comfortable camping temperatures");
      }
      if (day.rainChance <= 20) reasons.push("low rain risk");
      if (day.bugIndex > 60) reasons.push("bugs may be annoying");

      break;
    }

    case "disc_golf": {
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
      if (day.avgTemp >= 50 && day.avgTemp <= 78) {
        reasons.push("good disc golf temperatures");
      }

      break;
    }

    case "tennis": {
      const tempScore = rangeScore(day.avgTemp, 55, 78, 40, 95);
      const windScore = lowIsGoodScore(day.windMax, 10, 24);
      const rainScore = lowIsGoodScore(day.rainChance, 15, 70);

      score =
        tempScore * 0.4 +
        windScore * 0.25 +
        rainScore * 0.2 +
        day.stormSafety * 0.15;

      if (day.avgTemp >= 55 && day.avgTemp <= 78) {
        reasons.push("comfortable court temperatures");
      }
      if (day.windMax <= 10) reasons.push("manageable wind");

      break;
    }

    case "golf": {
      const tempScore = rangeScore(day.avgTemp, 55, 78, 40, 95);
      const windScore = lowIsGoodScore(day.windMax, 12, 28);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
      const bugComfort = lowIsGoodScore(day.bugIndex, 45, 90);

      score =
        tempScore * 0.34 +
        windScore * 0.24 +
        rainScore * 0.22 +
        bugComfort * 0.08 +
        day.stormSafety * 0.12;

      if (day.avgTemp >= 55 && day.avgTemp <= 78) {
        reasons.push("comfortable golf temperatures");
      }
      if (day.windMax <= 12) reasons.push("manageable wind");

      break;
    }

    case "field_sport": {
        const tempScore = rangeScore(day.avgTemp, 58, 78, 35, 94);
        const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
        const windScore = lowIsGoodScore(day.windMax, 14, 30);
        const heatScore = lowIsGoodScore(day.apparentTemp, 84, 96);

        score =
            tempScore * 0.3 +
            rainScore * 0.26 +
            windScore * 0.14 +
            heatScore * 0.1 +
            day.stormSafety * 0.2;

        if (day.avgTemp >= 58 && day.avgTemp <= 78) {
            reasons.push("comfortable field conditions");
        }

        if (day.rainChance <= 20) {
            reasons.push("low rain risk");
        } else if (day.rainChance >= 50) {
            reasons.push("rain may interrupt play");
        }

        if (day.apparentTemp >= 88) {
            reasons.push("heat may reduce comfort");
        }

        break;
        }

    case "court_sport": {
      const tempScore = rangeScore(day.avgTemp, 55, 82, 40, 96);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
      const windScore = lowIsGoodScore(day.windMax, 18, 35);

      score =
        tempScore * 0.42 +
        rainScore * 0.26 +
        windScore * 0.12 +
        day.stormSafety * 0.2;

      if (day.avgTemp >= 55 && day.avgTemp <= 82) {
        reasons.push("comfortable outdoor court temperatures");
      }

      break;
    }

    case "photography": {
      const rainScore = lowIsGoodScore(day.rainChance, 25, 80);
      const windScore = lowIsGoodScore(day.windMax, 16, 35);
      const comfortScore = rangeScore(day.avgTemp, 45, 78, 20, 95);

      const cloudInterestScore =
        day.cloudCover >= 30 && day.cloudCover <= 75
          ? 100
          : day.cloudCover < 30
            ? 75
            : 60;

      score =
        cloudInterestScore * 0.3 +
        rainScore * 0.25 +
        windScore * 0.15 +
        comfortScore * 0.15 +
        day.stormSafety * 0.15;

      if (day.cloudCover >= 30 && day.cloudCover <= 75) {
        reasons.push("interesting cloud cover");
      }
      if (day.rainChance <= 25) reasons.push("manageable rain risk");

      break;
    }

    case "wildlife": {
      const tempScore = rangeScore(day.avgTemp, 45, 75, 20, 92);
      const windScore = lowIsGoodScore(day.windMax, 12, 30);
      const rainScore = lowIsGoodScore(day.rainChance, 30, 85);

      score =
        tempScore * 0.32 +
        windScore * 0.2 +
        rainScore * 0.2 +
        day.stormSafety * 0.18 +
        day.bugIndex * 0.1;

      if (day.windMax <= 12) reasons.push("low wind for wildlife activity");
      if (day.rainChance <= 30) reasons.push("manageable rain chances");

      break;
    }

    case "stargazing": {
      const cloudScore = lowIsGoodScore(day.cloudCover, 20, 80);
      const rainScore = lowIsGoodScore(day.rainChance, 10, 60);
      const windScore = lowIsGoodScore(day.windMax, 15, 35);

      score =
        cloudScore * 0.5 +
        rainScore * 0.25 +
        windScore * 0.1 +
        day.stormSafety * 0.15;

      if (day.cloudCover <= 20) reasons.push("low cloud cover");
      if (day.rainChance <= 10) reasons.push("low rain risk");

      break;
    }

    case "picnic": {
      const tempScore = rangeScore(day.avgTemp, 65, 82, 45, 95);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
      const windScore = lowIsGoodScore(day.windMax, 15, 30);
      const bugComfort = lowIsGoodScore(day.bugIndex, 45, 90);

      score =
        tempScore * 0.34 +
        rainScore * 0.26 +
        windScore * 0.12 +
        bugComfort * 0.1 +
        day.stormSafety * 0.18;

      if (day.avgTemp >= 65 && day.avgTemp <= 82) {
        reasons.push("comfortable picnic temperatures");
      }

      break;
    }

    case "gardening": {
      const tempScore = rangeScore(day.avgTemp, 50, 80, 35, 95);
      const rainScore = day.rainChance <= 70 ? 85 : 55;
      const windScore = lowIsGoodScore(day.windMax, 18, 35);

      score =
        tempScore * 0.42 +
        rainScore * 0.18 +
        windScore * 0.18 +
        day.stormSafety * 0.22;

      if (day.avgTemp >= 50 && day.avgTemp <= 80) {
        reasons.push("comfortable gardening temperatures");
      }

      break;
    }

    case "outdoor_workout": {
      const tempScore = rangeScore(day.avgTemp, 45, 70, 25, 90);
      const rainScore = lowIsGoodScore(day.rainChance, 20, 75);
      const windScore = lowIsGoodScore(day.windMax, 14, 30);
      const aqiScore = lowIsGoodScore(day.aqi, 50, 150);

      score =
        tempScore * 0.35 +
        rainScore * 0.22 +
        windScore * 0.14 +
        aqiScore * 0.14 +
        day.stormSafety * 0.15;

      if (day.avgTemp >= 45 && day.avgTemp <= 70) {
        reasons.push("comfortable workout temperatures");
      }

      break;
    }

    case "outdoor_yoga": {
      const tempScore = rangeScore(day.avgTemp, 60, 78, 45, 90);
      const windScore = lowIsGoodScore(day.windMax, 10, 25);
      const rainScore = lowIsGoodScore(day.rainChance, 15, 70);

      score =
        tempScore * 0.42 +
        windScore * 0.24 +
        rainScore * 0.18 +
        day.stormSafety * 0.16;

      if (day.windMax <= 10) reasons.push("calmer wind conditions");

      break;
    }

    case "drone": {
      const windScore = lowIsGoodScore(day.windMax, 8, 22);
      const gustScore = lowIsGoodScore(day.gustMax, 15, 30);
      const rainScore = lowIsGoodScore(day.rainChance, 10, 60);

      score =
        windScore * 0.4 +
        gustScore * 0.28 +
        rainScore * 0.18 +
        day.stormSafety * 0.14;

      if (day.windMax <= 8) reasons.push("low wind for flying");
      if (day.gustMax <= 15) reasons.push("manageable gusts");

      break;
    }

    case "kite": {
        const windScore = rangeScore(day.windMax, 9, 16, 3, 28);
        const gustScore = lowIsGoodScore(day.gustMax, 22, 36);
        const rainScore = lowIsGoodScore(day.rainChance, 15, 65);

        score =
            windScore * 0.5 +
            gustScore * 0.18 +
            rainScore * 0.16 +
            day.stormSafety * 0.16;

        if (day.windMax >= 9 && day.windMax <= 16) {
            reasons.push("useful steady wind");
        }

        if (day.windMax < 6) {
            reasons.push("wind may be too light");
        }

        if (day.gustMax >= 25) {
            reasons.push("gusts may make kite flying less predictable");
        }

        if (day.rainChance >= 40) {
            reasons.push("rain risk may interfere");
        }

        break;
        }

    case "skiing": {
      const tempScore = rangeScore(day.avgTemp, 15, 32, -10, 45);
      const windScore = lowIsGoodScore(day.windMax, 18, 38);
      const rainScore = lowIsGoodScore(day.rainChance, 40, 90);

      score =
        tempScore * 0.42 +
        windScore * 0.2 +
        rainScore * 0.16 +
        day.stormSafety * 0.22;

      if (day.avgTemp <= 32) reasons.push("cold enough for winter conditions");

      break;
    }

    case "sledding":
    case "winter_hiking": {
      const tempScore = rangeScore(day.avgTemp, 10, 32, -10, 45);
      const windScore = lowIsGoodScore(day.windMax, 18, 38);
      const rainScore = lowIsGoodScore(day.rainChance, 35, 90);

      score =
        tempScore * 0.44 +
        windScore * 0.18 +
        rainScore * 0.16 +
        day.stormSafety * 0.22;

      if (day.avgTemp <= 32) reasons.push("cold enough for winter activity");

      break;
    }

    case "ice_fishing": {
      const tempScore = rangeScore(day.avgTemp, 5, 28, -15, 40);
      const windScore = lowIsGoodScore(day.windMax, 16, 35);
      const stormScore = day.stormSafety;

      score = tempScore * 0.48 + windScore * 0.22 + stormScore * 0.3;

      if (day.avgTemp <= 28) reasons.push("cold weather favors ice conditions");

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