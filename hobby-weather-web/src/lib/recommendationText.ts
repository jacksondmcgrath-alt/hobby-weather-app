type RecommendationTextInput = {
  activity: string | null;
  date: string | null;
  score: number | null;
  label: string | null;
  recommendedWindow?: string | null;
  forecastConfidenceLabel?: string | null;
  avgTemp?: number | null;
  windMax?: number | null;
  rainChance?: number | null;
  bugIndex?: number | null;
  waterTempEst?: number | null;
  locationName?: string | null;
};

function formatDatePhrase(dateString: string | null) {
  if (!dateString) return "soon";

  const today = new Date().toISOString().slice(0, 10);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowString = tomorrow.toISOString().slice(0, 10);

  if (dateString === today) return "today";
  if (dateString === tomorrowString) return "tomorrow";

  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function scorePhrase(score: number | null, label: string | null) {
  if (score === null) {
    return "is worth checking";
  }

  if (score >= 80) {
    return "looks like a strong option";
  }

  if (score >= 65) {
    return "looks promising";
  }

  if (score >= 50) {
    return "could work if you are flexible";
  }

  return "does not look ideal";
}

function buildPositiveFactors(input: RecommendationTextInput) {
  const factors: string[] = [];

  if (input.avgTemp !== null && input.avgTemp !== undefined) {
    if (input.avgTemp >= 45 && input.avgTemp <= 78) {
      factors.push("comfortable temperatures");
    } else if (input.avgTemp > 85) {
      factors.push("warm conditions");
    } else if (input.avgTemp < 40) {
      factors.push("cooler conditions");
    }
  }

  if (input.windMax !== null && input.windMax !== undefined) {
    if (input.windMax <= 8) {
      factors.push("light wind");
    } else if (input.windMax <= 15) {
      factors.push("manageable wind");
    }
  }

  if (input.rainChance !== null && input.rainChance !== undefined) {
    if (input.rainChance <= 20) {
      factors.push("low rain chances");
    } else if (input.rainChance <= 40) {
      factors.push("moderate rain risk");
    }
  }

  if (
    input.recommendedWindow &&
    !input.recommendedWindow.includes("TBD") &&
    !input.recommendedWindow.includes("No clear")
  ) {
    factors.push("an open schedule-aware window");
  }

  return factors;
}

function buildWatchouts(input: RecommendationTextInput) {
  const watchouts: string[] = [];

  if (input.windMax !== null && input.windMax !== undefined && input.windMax >= 18) {
    watchouts.push("wind may be a limiting factor");
  }

  if (
    input.rainChance !== null &&
    input.rainChance !== undefined &&
    input.rainChance >= 50
  ) {
    watchouts.push("rain risk is worth watching");
  }

  if (
    input.bugIndex !== null &&
    input.bugIndex !== undefined &&
    input.bugIndex >= 60
  ) {
    watchouts.push("bugs may be noticeable");
  }

  if (
    input.forecastConfidenceLabel &&
    ["Uncertain", "Very uncertain", "Watch closely"].some((text) =>
      input.forecastConfidenceLabel?.includes(text)
    )
  ) {
    watchouts.push("forecast confidence is not locked in yet");
  }

  if (input.recommendedWindow?.includes("No clear")) {
    watchouts.push("your saved schedule may make timing harder");
  }

  return watchouts;
}

function joinList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function buildLumoraTake(input: RecommendationTextInput) {
  const activity = input.activity ?? "This activity";
  const datePhrase = formatDatePhrase(input.date);
  const score = input.score;
  const phrase = scorePhrase(score, input.label);
  const positives = buildPositiveFactors(input);
  const watchouts = buildWatchouts(input);

  const locationText = input.locationName
    ? ` at ${input.locationName}`
    : "";

  const windowText =
    input.recommendedWindow &&
    !input.recommendedWindow.includes("TBD") &&
    !input.recommendedWindow.includes("No clear")
      ? ` The clearest window is ${input.recommendedWindow}.`
      : input.recommendedWindow?.includes("No clear")
        ? " Lumora did not find a clear open window around your saved schedule."
        : "";

  let text = `${activity}${locationText} ${phrase} ${datePhrase}.`;

  if (positives.length > 0) {
    text += ` Conditions line up around ${joinList(positives)}.`;
  }

  if (watchouts.length > 0) {
    text += ` Watch for ${joinList(watchouts)}.`;
  }

  text += windowText;

  return text;
}