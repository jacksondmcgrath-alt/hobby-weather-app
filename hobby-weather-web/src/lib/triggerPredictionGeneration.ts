import { supabase } from "@/lib/supabaseClient";

export type PredictionGenerationResult = {
  ok: boolean;
  status:
    | "generated"
    | "skipped_fresh"
    | "no_predictions"
    | "failed"
    | string;
  message?: string;
  error?: string;
  result?: {
    predictionsWritten: number;
    locationsUsed: number;
  };
  freshness?: {
    predictionCount: number;
    latestGeneratedAt: string | null;
    isMissing: boolean;
    isStale: boolean;
    startDate: string;
    endDate: string;
  };
};

export async function triggerPredictionGeneration({
  force = false,
  reason = "manual",
}: {
  force?: boolean;
  reason?: string;
} = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be logged in.");
  }

  const response = await fetch("/api/predictions/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      force,
      reason,
    }),
  });

  const result = (await response.json()) as PredictionGenerationResult;

  if (!response.ok) {
    throw new Error(result.error ?? "Could not generate predictions.");
  }

  return result;
}