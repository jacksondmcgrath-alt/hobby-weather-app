import { supabase } from "@/lib/supabaseClient";

export type MatchingPredictionContext = {
  weather_snapshot?: Record<string, unknown> | null;
  location_context?: Record<string, unknown> | null;
  feature_json?: {
    preferences?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  location_name?: string | null;
  saved_location_id?: number | null;
  planning_score?: number | null;
  predicted_score?: number | null;
};

function normalizeLocationName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function locationNamesMatch(
  first: string | null | undefined,
  second: string | null | undefined
) {
  const normalizedFirst = normalizeLocationName(first);
  const normalizedSecond = normalizeLocationName(second);

  if (!normalizedFirst || !normalizedSecond) {
    return false;
  }

  if (normalizedFirst === normalizedSecond) {
    return true;
  }

  return (
    normalizedFirst.includes(normalizedSecond) ||
    normalizedSecond.includes(normalizedFirst)
  );
}

function getLocationNameFromContext(
  prediction: MatchingPredictionContext
) {
  const context = prediction.location_context;

  if (!context || typeof context !== "object") {
    return null;
  }

  const locationName = context.location_name;

  return typeof locationName === "string" ? locationName : null;
}

function predictionMatchesLocation(
  prediction: MatchingPredictionContext,
  locationName: string | null | undefined
) {
  if (!locationName) return false;

  return (
    locationNamesMatch(prediction.location_name, locationName) ||
    locationNamesMatch(getLocationNameFromContext(prediction), locationName)
  );
}

function chooseBestPredictionMatch({
  predictions,
  locationName,
}: {
  predictions: MatchingPredictionContext[];
  locationName?: string | null;
}) {
  if (predictions.length === 0) return null;

  if (locationName) {
    const locationMatch = predictions.find((prediction) =>
      predictionMatchesLocation(prediction, locationName)
    );

    if (locationMatch) {
      return locationMatch;
    }
  }

  return [...predictions].sort(
    (a, b) =>
      (b.planning_score ?? b.predicted_score ?? 0) -
      (a.planning_score ?? a.predicted_score ?? 0)
  )[0];
}

export async function loadBestMatchingPredictionContext({
  userId,
  date,
  activity,
  locationName,
}: {
  userId: string;
  date: string | null | undefined;
  activity: string | null | undefined;
  locationName?: string | null;
}) {
  if (!date || !activity) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_predictions")
    .select(
      [
        "weather_snapshot",
        "location_context",
        "feature_json",
        "location_name",
        "saved_location_id",
        "planning_score",
        "predicted_score",
      ].join(",")
    )
    .eq("user_id", userId)
    .eq("date", date)
    .eq("activity", activity);

  if (error) {
    console.warn("Could not load matching prediction context:", error.message);
    return null;
  }

  return chooseBestPredictionMatch({
    predictions: (data ?? []) as unknown as MatchingPredictionContext[],
    locationName,
  });
}