import {
  BASE_WINDOWS,
  average,
  max,
  clampScore,
  rangeScore,
  lowIsGoodScore,
  getWindowPreferenceKeys,
  type CandidateWindow,
  type DailyWeather,
} from "@/lib/predictions/scoringProfiles";

export type WeeklyObligation = {
  id: number;
  label: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  active: boolean | null;
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
  const jsDay = date.getDay();

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

function windowTimeOfDayBonus({
  activity,
  window,
  day,
}: {
  activity: string;
  window: CandidateWindow;
  day: DailyWeather;
}) {
  const label = window.label.toLowerCase();

  if (activity === "Photography") {
    if (label === "morning" || label === "evening") {
      return 10;
    }

    return 0;
  }

  if (activity === "Fishing") {
    if (label === "morning" || label === "evening") {
      return 6;
    }

    return 0;
  }

  if (activity === "Birdwatching" || activity === "Wildlife Watching") {
    if (label === "morning" || label === "evening") {
      return 8;
    }

    return 0;
  }

  if (activity === "Running" || activity === "Walking" || activity === "Cycling") {
    if (day.avgTemp >= 78 && (label === "morning" || label === "evening")) {
      return 8;
    }
  }

  if (activity === "Stargazing") {
    if (label === "evening") {
      return 12;
    }

    return -10;
  }

  return 0;
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

  if (activity === "Stargazing") {
    return clampScore(
      lowIsGoodScore(avgCloud, 20, 80) * 0.55 +
        lowIsGoodScore(maxRainChance, 10, 60) * 0.25 +
        lowIsGoodScore(maxWind, 15, 35) * 0.2
    );
  }

  if (activity === "Running") {
    return clampScore(
      rangeScore(avgTemp, 45, 62, 25, 82) * 0.35 +
        lowIsGoodScore(maxWind, 8, 22) * 0.18 +
        lowIsGoodScore(maxRainChance, 20, 75) * 0.17 +
        lowIsGoodScore(maxDewPoint, 58, 72) * 0.12 +
        lowIsGoodScore(day.aqi, 50, 150) * 0.12 +
        day.stormSafety * 0.06
    );
  }

  if (activity === "Fishing") {
    return clampScore(
      rangeScore(avgTemp, 50, 76, 35, 92) * 0.18 +
        (maxWind < 4
          ? 75
          : maxWind <= 12
            ? 100
            : lowIsGoodScore(maxWind, 12, 26)) *
          0.24 +
        lowIsGoodScore(maxRainChance, 45, 90) * 0.12 +
        rangeScore(day.waterTempEst, 55, 72, 40, 84) * 0.22 +
        rangeScore(day.bugIndex, 35, 75, 10, 95) * 0.12 +
        day.stormSafety * 0.12
    );
  }

  if (
    activity === "Kayaking" ||
    activity === "Paddleboarding" ||
    activity === "Canoeing"
  ) {
    return clampScore(
      rangeScore(avgTemp, 65, 85, 50, 95) * 0.18 +
        lowIsGoodScore(maxWind, 8, 20) * 0.28 +
        lowIsGoodScore(maxGust, 15, 32) * 0.18 +
        lowIsGoodScore(maxRainChance, 20, 75) * 0.12 +
        rangeScore(day.waterTempEst, 60, 78, 45, 88) * 0.14 +
        day.stormSafety * 0.1
    );
  }

  if (activity === "Beach Day" || activity === "Swimming") {
    return clampScore(
      rangeScore(avgTemp, 75, 90, 60, 100) * 0.32 +
        lowIsGoodScore(maxRainChance, 20, 80) * 0.2 +
        lowIsGoodScore(maxWind, 16, 32) * 0.14 +
        rangeScore(maxUv, 3, 8, 0, 11) * 0.12 +
        rangeScore(day.waterTempEst, 68, 82, 55, 90) * 0.12 +
        day.stormSafety * 0.1
    );
  }
  if (activity === "Photography") {
    const rainScore = lowIsGoodScore(maxRainChance, 25, 80);
    const windScore = lowIsGoodScore(maxWind, 16, 35);
    const comfortScore = rangeScore(avgTemp, 45, 78, 20, 95);

    const cloudInterestScore =
        avgCloud >= 30 && avgCloud <= 75
        ? 100
        : avgCloud < 30
            ? 75
            : 60;

    return clampScore(
        cloudInterestScore * 0.34 +
        rainScore * 0.24 +
        windScore * 0.14 +
        comfortScore * 0.14 +
        day.stormSafety * 0.14
    );
    }

  return clampScore(
    window.baseScore * 0.35 +
      day.stormSafety * 0.25 +
      lowIsGoodScore(maxRainChance, 30, 85) * 0.25 +
      lowIsGoodScore(maxWind, 16, 35) * 0.15
  );
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
}) {
  const preferenceKeys = getWindowPreferenceKeys(activity);

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
        const timeOfDayBonus = windowTimeOfDayBonus({
        activity,
        window: baseWindow,
        day,
        });

        return {
        ...baseWindow,
        preferenceRank: index,
        weatherScore,
        score: clampScore(weatherScore * 0.82 + preferenceBonus + timeOfDayBonus),
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