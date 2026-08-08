type PreferenceSuggestion = {
  key: string;
  title: string;
  description: string;
  currentValue: number;
  suggestedValue: number;
  confidence: "low" | "medium" | "high";
};

type ActivityLogForSuggestion = {
  id: number;
  date: string | null;
  activity: string | null;
  predicted_score: number | null;
  actual_score_0_to_100: number | null;
  prediction_error: number | null;
};

type PredictionForSuggestion = {
  date: string | null;
  activity: string | null;
  weather_snapshot?: {
    avg_temp?: number | null;
    wind_max?: number | null;
    gust_max?: number | null;
    rain_chance?: number | null;
    bug_index?: number | null;
    aqi?: number | null;
  } | null;
};

type PreferenceSettings = Record<string, number | string[] | undefined>;

function clampSlider(value: number) {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function logActualMinusPredicted(log: ActivityLogForSuggestion) {
  if (
    log.prediction_error !== null &&
    log.prediction_error !== undefined
  ) {
    return log.prediction_error;
  }

  if (
    log.actual_score_0_to_100 !== null &&
    log.actual_score_0_to_100 !== undefined &&
    log.predicted_score !== null &&
    log.predicted_score !== undefined
  ) {
    return log.actual_score_0_to_100 - log.predicted_score;
  }

  return null;
}

function predictionKey(date: string | null, activity: string | null) {
  return `${date ?? ""}|||${activity ?? ""}`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildPreferenceSuggestions({
  logs,
  predictions,
  preferences,
}: {
  logs: ActivityLogForSuggestion[];
  predictions: PredictionForSuggestion[];
  preferences: PreferenceSettings;
}) {
  const predictionMap = new Map<string, PredictionForSuggestion>();

  for (const prediction of predictions) {
    predictionMap.set(
      predictionKey(prediction.date, prediction.activity),
      prediction
    );
  }

  const suggestions: PreferenceSuggestion[] = [];

  const heatMisses: number[] = [];
  const windMisses: number[] = [];
  const rainMisses: number[] = [];
  const bugMisses: number[] = [];
  const aqiMisses: number[] = [];
  const fishingBugUpsides: number[] = [];

  for (const log of logs) {
    const error = logActualMinusPredicted(log);

    if (error === null) continue;

    const prediction = predictionMap.get(
      predictionKey(log.date, log.activity)
    );

    if (!prediction?.weather_snapshot) continue;

    const weather = prediction.weather_snapshot;
    const activity = log.activity ?? "";

    const avgTemp = weather.avg_temp ?? null;
    const windMax = weather.wind_max ?? null;
    const rainChance = weather.rain_chance ?? null;
    const bugIndex = weather.bug_index ?? null;
    const aqi = weather.aqi ?? null;

    // Negative error means actual enjoyment was lower than predicted.
    if (error <= -15) {
      if (
        avgTemp !== null &&
        avgTemp >= 78 &&
        ["Running", "Walking", "Hiking", "Cycling", "Outdoor Workout"].includes(
          activity
        )
      ) {
        heatMisses.push(error);
      }

      if (
        windMax !== null &&
        windMax >= 12 &&
        ["Running", "Cycling", "Disc Golf", "Tennis", "Golf"].includes(activity)
      ) {
        windMisses.push(error);
      }

      if (rainChance !== null && rainChance >= 40) {
        rainMisses.push(error);
      }

      if (
        bugIndex !== null &&
        bugIndex >= 55 &&
        ["Camping", "Hiking", "Disc Golf", "Picnic"].includes(activity)
      ) {
        bugMisses.push(error);
      }

      if (
        aqi !== null &&
        aqi >= 90 &&
        ["Running", "Walking", "Hiking", "Cycling", "Outdoor Workout"].includes(
          activity
        )
      ) {
        aqiMisses.push(error);
      }
    }

    // Positive fishing error on buggy days can mean bugs/insect activity matters more.
    if (
      activity === "Fishing" &&
      error >= 15 &&
      bugIndex !== null &&
      bugIndex >= 35 &&
      bugIndex <= 80
    ) {
      fishingBugUpsides.push(error);
    }
  }

  function maybeAddSensitivitySuggestion({
    misses,
    key,
    title,
    description,
    minCount = 2,
  }: {
    misses: number[];
    key: string;
    title: string;
    description: string;
    minCount?: number;
  }) {
    if (misses.length < minCount) return;

    const currentValue =
      typeof preferences[key] === "number"
        ? (preferences[key] as number)
        : 6;

    const severity = Math.abs(average(misses));

    const bump = severity >= 25 ? 2 : 1;
    const suggestedValue = clampSlider(currentValue + bump);

    if (suggestedValue === currentValue) return;

    suggestions.push({
      key,
      title,
      description,
      currentValue,
      suggestedValue,
      confidence: misses.length >= 5 ? "high" : misses.length >= 3 ? "medium" : "low",
    });
  }

  maybeAddSensitivitySuggestion({
    misses: heatMisses,
    key: "general_heat_sensitivity",
    title: "Increase heat sensitivity",
    description:
      "Your logged activities tend to feel worse than predicted on warmer days.",
  });

  maybeAddSensitivitySuggestion({
    misses: windMisses,
    key: "running_wind_sensitivity",
    title: "Increase wind sensitivity",
    description:
      "Your logged activities tend to feel worse than predicted on windy days.",
  });

  maybeAddSensitivitySuggestion({
    misses: rainMisses,
    key: "rain_caution",
    title: "Increase rain caution",
    description:
      "Rainy or uncertain days have been rating lower than Lumora expected.",
  });

  maybeAddSensitivitySuggestion({
    misses: bugMisses,
    key: "hiking_bug_sensitivity",
    title: "Increase bug sensitivity",
    description:
      "Buggy conditions have been rating lower than Lumora expected for outdoor activities.",
  });

  maybeAddSensitivitySuggestion({
    misses: aqiMisses,
    key: "aqi_sensitivity",
    title: "Increase air quality sensitivity",
    description:
      "Higher AQI days have been rating lower than Lumora expected.",
  });

  if (fishingBugUpsides.length >= 2) {
    const key = "fishing_bug_boost";
    const currentValue =
      typeof preferences[key] === "number"
        ? (preferences[key] as number)
        : 6;

    const suggestedValue = clampSlider(currentValue + 1);

    if (suggestedValue !== currentValue) {
      suggestions.push({
        key,
        title: "Increase fishing insect importance",
        description:
          "Your fishing logs have been better than expected on buggy/insect-active days.",
        currentValue,
        suggestedValue,
        confidence:
          fishingBugUpsides.length >= 5
            ? "high"
            : fishingBugUpsides.length >= 3
              ? "medium"
              : "low",
      });
    }
  }

  return suggestions;
}