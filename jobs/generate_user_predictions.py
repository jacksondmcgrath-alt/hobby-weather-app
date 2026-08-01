import os
from datetime import datetime, timezone

from supabase import create_client


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def get_supabase_client():
    """
    Uses service role key because this job needs to process all users.
    Never use service role key in frontend code.
    """

    return create_client(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
    )


def log_pipeline_run(
    supabase,
    status,
    users_processed=0,
    predictions_written=0,
    error_message=None,
):
    """
    Logs the pipeline run for debugging/monitoring.
    """

    row = {
        "run_source": "github_actions",
        "status": status,
        "users_processed": users_processed,
        "predictions_written": predictions_written,
        "error_message": error_message,
    }

    supabase.table("prediction_pipeline_runs").insert(row).execute()


def load_users(supabase):
    """
    Loads users from Supabase Auth Admin API.
    """

    response = supabase.auth.admin.list_users()

    users = response

    # supabase-py versions differ slightly.
    # Some return a list-like object, some have .data or .users.
    if hasattr(response, "users"):
        users = response.users
    elif hasattr(response, "data"):
        users = response.data

    return users


def load_prediction_history(supabase):
    """
    Loads latest global prediction history.

    Pipeline v1 uses global prediction_history as the base.
    """

    response = (
        supabase
        .table("prediction_history")
        .select("*")
        .execute()
    )

    rows = response.data or []

    return rows


def clean_number(value):
    """
    Converts values to float or None.
    """

    if value is None:
        return None

    try:
        return float(value)
    except Exception:
        return None


def build_user_prediction_row(user_id, prediction):
    """
    Converts one prediction_history row into one user_predictions row.

    v1:
    - rule_score = predicted_score
    - ml_score = null
    - final_score = predicted_score
    - scoring_method = rules_only_global_copy
    """

    predicted_score = clean_number(prediction.get("predicted_score"))

    weather_snapshot = {
        "avg_temp": prediction.get("avg_temp"),
        "wind_max": prediction.get("wind_max"),
        "gust_max": prediction.get("gust_max"),
        "rain_chance": prediction.get("rain_chance"),
        "bug_index": prediction.get("bug_index"),
        "storm_risk": prediction.get("storm_risk"),
        "water_temp_est": prediction.get("water_temp_est"),
    }

    feature_json = {
        "source_prediction_id": prediction.get("id"),
        "base_activity": prediction.get("activity"),
        "weather_snapshot": weather_snapshot,
        "preference_adjustment": prediction.get("preference_adjustment"),
        "base_predicted_score": prediction.get("base_predicted_score"),
    }

    data_quality_json = {
        "prediction_source": "prediction_history",
        "scoring_pipeline": "v1_global_copy",
        "ml_used": False,
    }

    row = {
        "user_id": user_id,
        "date": prediction.get("date"),
        "activity": prediction.get("activity"),

        "predicted_score": predicted_score,
        "planning_score": clean_number(prediction.get("planning_score")),
        "forecast_confidence": clean_number(prediction.get("forecast_confidence")),
        "forecast_confidence_label": prediction.get("forecast_confidence_label"),
        "label": prediction.get("label"),

        "recommended_window": None,
        "window_score": None,

        "saved_location_id": None,
        "location_name": None,
        "location_context": None,

        "explanation": prediction.get("explanation"),
        "gear_notes": prediction.get("gear_notes"),

        "weather_snapshot": weather_snapshot,
        "species_breakdown": prediction.get("species_breakdown"),
        "best_species": prediction.get("best_species"),
        "best_species_score": clean_number(prediction.get("best_species_score")),

        "rule_score": predicted_score,
        "ml_score": None,
        "final_score": predicted_score,
        "scoring_method": "rules_only_global_copy",
        "model_version": "none",
        "feature_json": feature_json,
        "data_quality_json": data_quality_json,
        "prediction_source": "github_actions_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    return row


def main():
    print("Starting user prediction generation pipeline...")

    supabase = get_supabase_client()

    try:
        users = load_users(supabase)
        prediction_history = load_prediction_history(supabase)

        print(f"Users found: {len(users)}")
        print(f"Prediction history rows found: {len(prediction_history)}")

        if len(users) == 0 or len(prediction_history) == 0:
            log_pipeline_run(
                supabase,
                status="completed_no_data",
                users_processed=len(users),
                predictions_written=0,
                error_message=None,
            )
            return

        total_written = 0

        for user in users:
            # supabase auth user object may be dict or object
            if isinstance(user, dict):
                user_id = user.get("id")
            else:
                user_id = getattr(user, "id", None)

            if not user_id:
                continue

            rows_to_upsert = []

            for prediction in prediction_history:
                if not prediction.get("date") or not prediction.get("activity"):
                    continue

                rows_to_upsert.append(
                    build_user_prediction_row(
                        user_id=user_id,
                        prediction=prediction,
                    )
                )

            if len(rows_to_upsert) == 0:
                continue

            (
                supabase
                .table("user_predictions")
                .upsert(
                    rows_to_upsert,
                    on_conflict="user_id,date,activity",
                )
                .execute()
            )

            total_written += len(rows_to_upsert)

            print(f"Wrote {len(rows_to_upsert)} predictions for user {user_id}")

        log_pipeline_run(
            supabase,
            status="completed",
            users_processed=len(users),
            predictions_written=total_written,
            error_message=None,
        )

        print("User prediction generation complete.")

    except Exception as error:
        print(f"Pipeline failed: {error}")

        try:
            log_pipeline_run(
                supabase,
                status="failed",
                users_processed=0,
                predictions_written=0,
                error_message=str(error),
            )
        except Exception:
            pass

        raise


if __name__ == "__main__":
    main()