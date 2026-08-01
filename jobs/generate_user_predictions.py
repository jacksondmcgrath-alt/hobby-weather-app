import os
from datetime import datetime, timezone

from supabase import create_client


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


DEFAULT_PREFERENCES = {
    "bug_tolerance": 5,
    "rain_caution": 6,
    "fishing_bug_boost": 6,
    "fishing_wind_tolerance": 6,
    "camping_bug_sensitivity": 8,
    "running_wind_sensitivity": 6,
    "running_heat_sensitivity": 7,
    "kayaking_wind_caution": 8,
    "disc_golf_wind_sensitivity": 6,
}


def get_supabase_client():
    """
    Uses service role key because this job processes all users.

    Never use the service role key in frontend code.
    """

    return create_client(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
    )


def clamp_score(score):
    return max(0, min(100, score))


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


def safe_value(value, default=0):
    number_value = clean_number(value)

    if number_value is None:
        return default

    return number_value


def score_label(score):
    if score >= 80:
        return "Great"
    if score >= 60:
        return "Good"
    if score >= 40:
        return "Okay"

    return "Poor"


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

    if hasattr(response, "users"):
        users = response.users
    elif hasattr(response, "data"):
        users = response.data

    return users


def get_user_id(user):
    """
    Handles different possible Supabase user object shapes.
    """

    if isinstance(user, dict):
        return user.get("id")

    return getattr(user, "id", None)


def load_prediction_history(supabase):
    """
    Loads latest global prediction history.
    """

    response = (
        supabase
        .table("prediction_history")
        .select("*")
        .execute()
    )

    return response.data or []


def load_user_preferences(supabase, user_id):
    """
    Loads one user's saved preferences.

    Falls back to defaults if no preference row exists.
    """

    preferences = DEFAULT_PREFERENCES.copy()

    try:
        response = (
            supabase
            .table("app_preferences")
            .select("settings")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        rows = response.data or []

        if len(rows) > 0:
            settings = rows[0].get("settings")

            if isinstance(settings, dict):
                preferences.update(settings)

    except Exception as error:
        print(f"Could not load preferences for user {user_id}: {error}")

    return preferences


def calculate_preference_adjustment(prediction, preferences):
    """
    Applies a simplified version of your user preference sliders.

    This lets each user's predictions differ before true ML is added.
    """

    adjustment = 0

    activity = prediction.get("activity")

    avg_temp = safe_value(prediction.get("avg_temp"), 60)
    wind_max = safe_value(prediction.get("wind_max"), 0)
    gust_max = safe_value(prediction.get("gust_max"), 0)
    rain_chance = safe_value(prediction.get("rain_chance"), 0)
    bug_index = safe_value(prediction.get("bug_index"), 0)

    # -------------------------
    # General bug tolerance
    # -------------------------

    bug_tolerance = safe_value(
        preferences.get("bug_tolerance"),
        DEFAULT_PREFERENCES["bug_tolerance"],
    )

    if activity in ["Camping", "Running", "Disc Golf", "Kayaking", "Tennis"]:
        if bug_index > 45:
            bug_penalty = ((bug_index - 45) / 10) * (10 - bug_tolerance) * 0.7
            adjustment -= bug_penalty

    # -------------------------
    # Rain caution
    # -------------------------

    rain_caution = safe_value(
        preferences.get("rain_caution"),
        DEFAULT_PREFERENCES["rain_caution"],
    )

    if activity == "Camping":
        rain_threshold = 20
    elif activity == "Kayaking":
        rain_threshold = 20
    elif activity == "Beach Day":
        rain_threshold = 25
    elif activity == "Tennis":
        rain_threshold = 20
    elif activity == "Running":
        rain_threshold = 30
    elif activity == "Disc Golf":
        rain_threshold = 30
    else:
        rain_threshold = 40

    if rain_chance > rain_threshold:
        rain_penalty = ((rain_chance - rain_threshold) / 10) * rain_caution * 0.5
        adjustment -= rain_penalty

    # -------------------------
    # Fishing preferences
    # -------------------------

    if activity == "Fishing":
        fishing_bug_boost = safe_value(
            preferences.get("fishing_bug_boost"),
            DEFAULT_PREFERENCES["fishing_bug_boost"],
        )

        fishing_wind_tolerance = safe_value(
            preferences.get("fishing_wind_tolerance"),
            DEFAULT_PREFERENCES["fishing_wind_tolerance"],
        )

        if 35 <= bug_index <= 75:
            adjustment += (fishing_bug_boost - 5) * 1.5

        if wind_max > 12:
            wind_penalty = (wind_max - 12) * (10 - fishing_wind_tolerance) * 0.25
            adjustment -= wind_penalty

        if 4 <= wind_max <= 12:
            adjustment += fishing_wind_tolerance * 0.4

    # -------------------------
    # Camping preferences
    # -------------------------

    if activity == "Camping":
        camping_bug_sensitivity = safe_value(
            preferences.get("camping_bug_sensitivity"),
            DEFAULT_PREFERENCES["camping_bug_sensitivity"],
        )

        if bug_index > 40:
            bug_penalty = ((bug_index - 40) / 10) * camping_bug_sensitivity * 0.8
            adjustment -= bug_penalty

    # -------------------------
    # Running preferences
    # -------------------------

    if activity == "Running":
        running_wind_sensitivity = safe_value(
            preferences.get("running_wind_sensitivity"),
            DEFAULT_PREFERENCES["running_wind_sensitivity"],
        )

        running_heat_sensitivity = safe_value(
            preferences.get("running_heat_sensitivity"),
            DEFAULT_PREFERENCES["running_heat_sensitivity"],
        )

        if wind_max > 8:
            adjustment -= (wind_max - 8) * running_wind_sensitivity * 0.25

        if avg_temp > 60:
            adjustment -= (avg_temp - 60) * running_heat_sensitivity * 0.25

    # -------------------------
    # Kayaking preferences
    # -------------------------

    if activity == "Kayaking":
        kayaking_wind_caution = safe_value(
            preferences.get("kayaking_wind_caution"),
            DEFAULT_PREFERENCES["kayaking_wind_caution"],
        )

        if wind_max > 8:
            adjustment -= (wind_max - 8) * kayaking_wind_caution * 0.4

        if gust_max > 15:
            adjustment -= (gust_max - 15) * kayaking_wind_caution * 0.25

    # -------------------------
    # Disc golf preferences
    # -------------------------

    if activity == "Disc Golf":
        disc_golf_wind_sensitivity = safe_value(
            preferences.get("disc_golf_wind_sensitivity"),
            DEFAULT_PREFERENCES["disc_golf_wind_sensitivity"],
        )

        if wind_max > 10:
            adjustment -= (wind_max - 10) * disc_golf_wind_sensitivity * 0.3

    return adjustment


def get_base_rule_score(prediction):
    """
    Uses base_predicted_score when available to avoid double-applying
    one user's existing preference adjustment from prediction_history.
    """

    base_score = clean_number(prediction.get("base_predicted_score"))

    if base_score is not None:
        return base_score

    rule_score = clean_number(prediction.get("rule_score"))

    if rule_score is not None:
        return rule_score

    predicted_score = clean_number(prediction.get("predicted_score"))

    if predicted_score is not None:
        return predicted_score

    return 50


def compute_planning_score(final_score, prediction):
    """
    Recomputes planning score if forecast confidence is available.
    Otherwise falls back to existing planning score or final score.
    """

    forecast_confidence = clean_number(prediction.get("forecast_confidence"))

    if forecast_confidence is not None:
        return round((final_score * 0.80) + (forecast_confidence * 0.20))

    existing_planning_score = clean_number(prediction.get("planning_score"))

    if existing_planning_score is not None:
        return existing_planning_score

    return final_score


def build_user_prediction_row(user_id, prediction, preferences):
    """
    Converts one prediction_history row into one user_predictions row.

    v2:
    - Starts from base/rule score
    - Applies user's saved preferences
    - ml_score remains null
    - final_score is preference-adjusted rule score
    """

    rule_score = get_base_rule_score(prediction)
    preference_adjustment = calculate_preference_adjustment(prediction, preferences)

    final_score = round(clamp_score(rule_score + preference_adjustment))
    planning_score = compute_planning_score(final_score, prediction)

    forecast_confidence = clean_number(prediction.get("forecast_confidence"))

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
        "user_preferences": preferences,
        "preference_adjustment": preference_adjustment,
        "base_rule_score": rule_score,
    }

    data_quality_json = {
        "prediction_source": "prediction_history",
        "scoring_pipeline": "v2_user_preferences",
        "ml_used": False,
    }

    explanation = prediction.get("explanation") or ""

    if preference_adjustment > 0:
        explanation = (
            explanation
            + f" Your saved preferences increased this score by {round(preference_adjustment)} points."
        )
    elif preference_adjustment < 0:
        explanation = (
            explanation
            + f" Your saved preferences decreased this score by {abs(round(preference_adjustment))} points."
        )
    else:
        explanation = explanation + " Your saved preferences did not change this score."

    row = {
        "user_id": user_id,
        "date": prediction.get("date"),
        "activity": prediction.get("activity"),

        "predicted_score": final_score,
        "planning_score": planning_score,
        "forecast_confidence": forecast_confidence,
        "forecast_confidence_label": prediction.get("forecast_confidence_label"),
        "label": score_label(final_score),

        "recommended_window": None,
        "window_score": None,

        "saved_location_id": None,
        "location_name": None,
        "location_context": None,

        "explanation": explanation,
        "gear_notes": prediction.get("gear_notes"),

        "weather_snapshot": weather_snapshot,
        "species_breakdown": prediction.get("species_breakdown"),
        "best_species": prediction.get("best_species"),
        "best_species_score": clean_number(prediction.get("best_species_score")),

        "rule_score": rule_score,
        "ml_score": None,
        "final_score": final_score,
        "scoring_method": "rules_plus_user_preferences_v2",
        "model_version": "none",
        "feature_json": feature_json,
        "data_quality_json": data_quality_json,
        "prediction_source": "github_actions_v2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    return row


def main():
    print("Starting user prediction generation pipeline v2...")

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
            user_id = get_user_id(user)

            if not user_id:
                continue

            preferences = load_user_preferences(supabase, user_id)

            rows_to_upsert = []

            for prediction in prediction_history:
                if not prediction.get("date") or not prediction.get("activity"):
                    continue

                rows_to_upsert.append(
                    build_user_prediction_row(
                        user_id=user_id,
                        prediction=prediction,
                        preferences=preferences,
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
            status="completed_v2",
            users_processed=len(users),
            predictions_written=total_written,
            error_message=None,
        )

        print("User prediction generation v2 complete.")

    except Exception as error:
        print(f"Pipeline failed: {error}")

        try:
            log_pipeline_run(
                supabase,
                status="failed_v2",
                users_processed=0,
                predictions_written=0,
                error_message=str(error),
            )
        except Exception:
            pass

        raise


if __name__ == "__main__":
    main()