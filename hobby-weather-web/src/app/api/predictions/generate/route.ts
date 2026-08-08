import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateUserPredictionsNow } from "@/lib/predictions/generateUserPredictions";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FRESHNESS_HOURS = 3;

type GenerateRequestBody = {
  force?: boolean;
  reason?: string;
};

type LatestPredictionRow = {
  generated_at: string | null;
};

/**
 * Supabase's TypeScript inference can get confused without generated DB types.
 * For this server-only admin route, we keep the client type loose.
 */
type SupabaseAdminClient = any;

function dateStringFromOffset(daysOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function hoursSince(dateString: string) {
  const date = new Date(dateString);
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

async function getPredictionFreshness({
  admin,
  userId,
}: {
  admin: SupabaseAdminClient;
  userId: string;
}) {
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
    !latestGeneratedAt || hoursSince(latestGeneratedAt) >= FRESHNESS_HOURS;

  return {
    predictionCount,
    latestGeneratedAt,
    isMissing,
    isStale,
    startDate,
    endDate,
  };
}

async function logPredictionRun({
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

async function trackPredictionEvent({
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

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Server is missing Supabase environment variables for prediction generation.",
      },
      { status: 500 }
    );
  }

  let body: GenerateRequestBody = {};

  try {
    body = (await request.json()) as GenerateRequestBody;
  } catch {
    body = {};
  }

  const force = Boolean(body.force);
  const reason = body.reason?.trim() || "manual";

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing authorization token." },
      { status: 401 }
    );
  }

  const accessToken = authHeader.replace("Bearer ", "");

  const authClient = createClient(supabaseUrl, supabaseAnonKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json(
      { error: "Could not verify user." },
      { status: 401 }
    );
  }

  const admin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey
  ) as SupabaseAdminClient;

  try {
    const freshness = await getPredictionFreshness({
      admin,
      userId: user.id,
    });

    if (!force && !freshness.isMissing && !freshness.isStale) {
      await trackPredictionEvent({
        admin,
        userId: user.id,
        eventName: "prediction_generation_skipped_fresh",
        eventData: {
          reason,
          prediction_count: freshness.predictionCount,
          latest_generated_at: freshness.latestGeneratedAt,
          start_date: freshness.startDate,
          end_date: freshness.endDate,
        },
      });

      return NextResponse.json({
        ok: true,
        status: "skipped_fresh",
        message: "Predictions are already fresh.",
        freshness,
      });
    }

    await trackPredictionEvent({
      admin,
      userId: user.id,
      eventName: "prediction_generation_started",
      eventData: {
        reason,
        force,
        freshness,
      },
    });

    const result = await generateUserPredictionsNow({
      admin,
      userId: user.id,
    });

    if (result.predictionsWritten === 0) {
      await logPredictionRun({
        admin,
        status: "completed_no_predictions",
        predictionsWritten: 0,
        reason,
        errorMessage:
          "No predictions were generated. User may not have a saved location.",
      });

      await trackPredictionEvent({
        admin,
        userId: user.id,
        eventName: "prediction_generation_no_predictions",
        eventData: {
          reason,
          force,
          result,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "no_predictions",
          error:
            "No predictions were generated. Add at least one saved location first.",
          result,
        },
        { status: 400 }
      );
    }

    await logPredictionRun({
      admin,
      status: "completed_api_user_generation",
      predictionsWritten: result.predictionsWritten,
      reason,
    });

    await trackPredictionEvent({
      admin,
      userId: user.id,
      eventName: "prediction_generation_completed",
      eventData: {
        reason,
        force,
        result,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "generated",
      message: "Predictions generated.",
      result,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Could not generate predictions.";

    await logPredictionRun({
      admin,
      status: "failed_api_user_generation",
      predictionsWritten: 0,
      reason,
      errorMessage,
    });

    await trackPredictionEvent({
      admin,
      userId: user.id,
      eventName: "prediction_generation_failed",
      eventData: {
        reason,
        force,
        error: errorMessage,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}