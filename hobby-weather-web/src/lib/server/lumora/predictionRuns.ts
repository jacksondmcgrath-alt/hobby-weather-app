import type { SupabaseAdminClient } from "@/lib/server/lumora/auth";

export const DEFAULT_PREDICTION_FRESHNESS_HOURS = 3;

export type LatestPredictionRow = {
  generated_at: string | null;
};

export type PredictionFreshness = {
  predictionCount: number;
  latestGeneratedAt: string | null;
  isMissing: boolean;
  isStale: boolean;
  startDate: string;
  endDate: string;
};

export function dateStringFromOffset(daysOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

export function hoursSince(dateString: string) {
  const date = new Date(dateString);
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

export async function getPredictionFreshness({
  admin,
  userId,
  freshnessHours = DEFAULT_PREDICTION_FRESHNESS_HOURS,
}: {
  admin: SupabaseAdminClient;
  userId: string;
  freshnessHours?: number;
}): Promise<PredictionFreshness> {
  const startDate = dateStringFromOffset(0);
  const endDate = dateStringFromOffset(14);

  const { count, error: countError } = await admin
    .from("user_predictions")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (countError) {
    throw countError;
  }

  const { data: latestPredictionData, error: latestError } = await admin
    .from("user_predictions")
    .select("generated_at")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw latestError;
  }

  const latestPrediction = latestPredictionData as LatestPredictionRow | null;

  const predictionCount = count ?? 0;
  const latestGeneratedAt = latestPrediction?.generated_at ?? null;

  const isMissing = predictionCount === 0;
  const isStale =
    !latestGeneratedAt || hoursSince(latestGeneratedAt) >= freshnessHours;

  return {
    predictionCount,
    latestGeneratedAt,
    isMissing,
    isStale,
    startDate,
    endDate,
  };
}

export async function logPredictionRun({
  admin,
  status,
  predictionsWritten,
  reason,
  errorMessage,
}: {
  admin: SupabaseAdminClient;
  status: string;
  predictionsWritten: number;
  reason: string;
  errorMessage?: string | null;
}) {
  try {
    const row = {
      run_source: `api:${reason}`,
      status,
      users_processed: 1,
      predictions_written: predictionsWritten,
      error_message: errorMessage ?? null,
    };

    await admin.from("prediction_pipeline_runs").insert(row);
  } catch (error) {
    console.error("Could not log prediction run:", error);
  }
}

export async function trackPredictionEvent({
  admin,
  userId,
  eventName,
  eventData,
}: {
  admin: SupabaseAdminClient;
  userId: string;
  eventName: string;
  eventData: Record<string, unknown>;
}) {
  try {
    const row = {
      user_id: userId,
      event_name: eventName,
      event_data: eventData,
    };

    await admin.from("app_events").insert(row);
  } catch (error) {
    console.error("Could not track prediction event:", error);
  }
}