import { NextRequest, NextResponse } from "next/server";
import { generateUserPredictionsNow } from "@/lib/predictions/generateUserPredictions";
import { authenticateApiRequest } from "@/lib/server/lumora/auth";
import {
  DEFAULT_PREDICTION_FRESHNESS_HOURS,
  getPredictionFreshness,
  logPredictionRun,
  trackPredictionEvent,
} from "@/lib/server/lumora/predictionRuns";

export const runtime = "nodejs";
export const maxDuration = 60;

type GenerateRequestBody = {
  force?: boolean;
  reason?: string;
};

export async function POST(request: NextRequest) {

  let body: GenerateRequestBody = {};

  try {
    body = (await request.json()) as GenerateRequestBody;
  } catch {
    body = {};
  }

  const force = Boolean(body.force);
  const reason = body.reason?.trim() || "manual";

  const auth = await authenticateApiRequest(request);

    if (!auth.ok) {
    return auth.response;
    }

    const { user, admin } = auth;

  try {
    const freshness = await getPredictionFreshness({
        admin,
        userId: user.id,
        freshnessHours: DEFAULT_PREDICTION_FRESHNESS_HOURS,
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