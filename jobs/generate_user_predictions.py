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
    return create_client(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
    )


def clamp_score(score):
    return max(0, min(100, score))


def clean_number(value):
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
    row = {
        "run_source": "github_actions",
        "status": status,
        "users_processed": users_processed,
        "predictions_written": predictions_written,
        "error_message": error_message,
    }

    supabase.table("prediction_pipeline_runs").insert(row).execute()


def load_users(supabase):
    response = supabase.auth.admin.list_users()

    users = response

    if hasattr(response, "users"):
        users = response.users
    elif hasattr(response, "data"):
        users = response.data

    return users


def get_user_id(user):
    if isinstance(user, dict):
        return user.get("id")

    return getattr(user, "id", None)


def load_prediction_history(supabase):
    response = (
        supabase
        .table("prediction_history")
        .select("*")
        .execute()
    )

    return response.data or []


def load_latest_time_recommendations(supabase):
    """
    Loads the latest time_recommendations JSON from forecast_cache.

    Returns a lookup:
    {
        "YYYY-MM-DD": {
            "Fishing": {"window": "...", "score": 80},
            ...
        }
    }
    """

    try:
        response = (
            supabase
            .table("forecast_cache")
            .select("generated_at,time_recommendations")
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )

        rows = response.data or []

        if len(rows) == 0:
            return {}

        time_recommendations = rows[0].get("time_recommendations") or []

        lookup = {}

        for item in time_recommendations:
            date = item.get("date")

            if not date:
                continue

            lookup[date] = {
                "Fishing": {
                    "window": item.get("Best Fishing Window"),
                    "score": clean_number(item.get("Fishing Window Score")),
                },
                "Running": {
                    "window": item.get("Best Running Window"),
                    "score": clean_number(item.get("Running Window Score")),
                },
                "Kayaking": {
                    "window": item.get("Best Kayaking Window"),
                    "score": clean_number(item.get("Kayaking Window Score")),
                },
                "Disc Golf": {
                    "window": item.get("Best Disc Golf Window"),
                    "score": clean_number(item.get("Disc Golf Window Score")),
                },
                "Tennis": {
                    "window": item.get("Best Tennis Window"),
                    "score": clean_number(item.get("Tennis Window Score")),
                },
                "Beach Day": {
                    "window": item.get("Best Beach Day Window"),
                    "score": clean_number(item.get("Beach Day Window Score")),
                },
            }

        return lookup

    except Exception as error:
        print(f"Could not load time recommendations: {error}")
        return {}


def get_time_recommendation(time_lookup, date, activity):
    """
    Returns recommended window and score for a date/activity.
    """

    if not date or not activity:
        return None, None

    day_lookup = time_lookup.get(date, {})

    activity_item = day_lookup.get(activity)

    if not activity_item:
        return None, None

    return activity_item.get("window"), activity_item.get("score")


def load_user_preferences(supabase, user_id):
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


def load_user_saved_locations(supabase, user_id):
    response = (
        supabase
        .table("saved_locations")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    return response.data or []


def load_user_activity_location_defaults(supabase, user_id):
    response = (
        supabase
        .table("activity_location_defaults")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    return response.data or []


def build_location_lookup(saved_locations):
    lookup = {}

    for location in saved_locations:
        location_id = location.get("id")

        if location_id is not None:
            lookup[int(location_id)] = location

    return lookup


def build_activity_default_lookup(activity_defaults, location_lookup):
    lookup = {}

    for item in activity_defaults:
        activity = item.get("activity")
        saved_location_id = item.get("saved_location_id")

        if not activity or saved_location_id is None:
            continue

        location = location_lookup.get(int(saved_location_id))

        if location is not None:
            lookup[activity] = location

    return lookup


def build_location_context(location):
    if location is None:
        return None

    return {
        "saved_location_id": location.get("id"),
        "location_name": location.get("name"),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "location_type": location.get("location_type"),
        "water_type": location.get("water_type"),
        "water_body_size": location.get("water_body_size"),
        "wind_exposure": location.get("wind_exposure"),
        "manual_water_temp": location.get("manual_water_temp"),
        "use_usgs_water_data": location.get("use_usgs_water_data"),
        "usgs_site_id": location.get("usgs_site_id"),
        "use_ndbc_data": location.get("use_ndbc_data"),
        "ndbc_station_id": location.get("ndbc_station_id"),
        "notes": location.get("notes"),
    }


def calculate_preference_adjustment(prediction, preferences):
    adjustment = 0

    activity = prediction.get("activity")

    avg_temp = safe_value(prediction.get("avg_temp"), 60)
    wind_max = safe_value(prediction.get("wind_max"), 0)
    gust_max = safe_value(prediction.get("gust_max"), 0)
    rain_chance = safe_value(prediction.get("rain_chance"), 0)
    bug_index = safe_value(prediction.get("bug_index"), 0)

    bug_tolerance = safe_value(
        preferences.get("bug_tolerance"),
        DEFAULT_PREFERENCES["bug_tolerance"],
    )

    if activity in ["Camping", "Running", "Disc Golf", "Kayaking", "Tennis"]:
        if bug_index > 45:
            bug_penalty = ((bug_index - 45) / 10) * (10 - bug_tolerance) * 0.7
            adjustment -= bug_penalty

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

    if activity == "Camping":
        camping_bug_sensitivity = safe_value(
            preferences.get("camping_bug_sensitivity"),
            DEFAULT_PREFERENCES["camping_bug_sensitivity"],
        )

        if bug_index > 40:
            bug_penalty = ((bug_index - 40) / 10) * camping_bug_sensitivity * 0.8
            adjustment -= bug_penalty

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

    if activity == "Kayaking":
        kayaking_wind_caution = safe_value(
            preferences.get("kayaking_wind_caution"),
            DEFAULT_PREFERENCES["kayaking_wind_caution"],
        )

        if wind_max > 8:
            adjustment -= (wind_max - 8) * kayaking_wind_caution * 0.4

        if gust_max > 15:
            adjustment -= (gust_max - 15) * kayaking_wind_caution * 0.25

    if activity == "Disc Golf":
        disc_golf_wind_sensitivity = safe_value(
            preferences.get("disc_golf_wind_sensitivity"),
            DEFAULT_PREFERENCES["disc_golf_wind_sensitivity"],
        )

        if wind_max > 10:
            adjustment -= (wind_max - 10) * disc_golf_wind_sensitivity * 0.3

    return adjustment


def get_base_rule_score(prediction):
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
    forecast_confidence = clean_number(prediction.get("forecast_confidence"))

    if forecast_confidence is not None:
        return round((final_score * 0.80) + (forecast_confidence * 0.20))

    existing_planning_score = clean_number(prediction.get("planning_score"))

    if existing_planning_score is not None:
        return existing_planning_score

    return final_score


def build_user_prediction_row(
    user_id,
    prediction,
    preferences,
    activity_default_lookup,
    time_lookup,
):
    activity = prediction.get("activity")
    date = prediction.get("date")

    default_location = activity_default_lookup.get(activity)

    if default_location is not None:
        saved_location_id = default_location.get("id")
        location_name = default_location.get("name")
        location_context = build_location_context(default_location)
    else:
        saved_location_id = None
        location_name = None
        location_context = None

    rule_score = get_base_rule_score(prediction)
    preference_adjustment = calculate_preference_adjustment(prediction, preferences)

    final_score = round(clamp_score(rule_score + preference_adjustment))
    planning_score = compute_planning_score(final_score, prediction)
    forecast_confidence = clean_number(prediction.get("forecast_confidence"))

    recommended_window, window_score = get_time_recommendation(
        time_lookup,
        date,
        activity,
    )

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
        "base_activity": activity,
        "weather_snapshot": weather_snapshot,
        "user_preferences": preferences,
        "preference_adjustment": preference_adjustment,
        "base_rule_score": rule_score,
        "default_location": location_context,
        "time_window_source": "forecast_cache",
    }

    data_quality_json = {
        "prediction_source": "prediction_history",
        "scoring_pipeline": "v4_1_user_preferences_locations_windows",
        "ml_used": False,
        "default_location_used": default_location is not None,
        "time_window_used": recommended_window is not None,
    }

    explanation = prediction.get("explanation") or ""

    if preference_adjustment > 0:
        explanation += f" Your saved preferences increased this score by {round(preference_adjustment)} points."
    elif preference_adjustment < 0:
        explanation += f" Your saved preferences decreased this score by {abs(round(preference_adjustment))} points."
    else:
        explanation += " Your saved preferences did not change this score."

    if location_name:
        explanation += f" Default location for this activity: {location_name}."

    row = {
        "user_id": user_id,
        "date": date,
        "activity": activity,

        "predicted_score": final_score,
        "planning_score": planning_score,
        "forecast_confidence": forecast_confidence,
        "forecast_confidence_label": prediction.get("forecast_confidence_label"),
        "label": score_label(final_score),

        "recommended_window": recommended_window,
        "window_score": window_score,

        "saved_location_id": saved_location_id,
        "location_name": location_name,
        "location_context": location_context,

        "explanation": explanation,
        "gear_notes": prediction.get("gear_notes"),

        "weather_snapshot": weather_snapshot,
        "species_breakdown": prediction.get("species_breakdown"),
        "best_species": prediction.get("best_species"),
        "best_species_score": clean_number(prediction.get("best_species_score")),

        "rule_score": rule_score,
        "ml_score": None,
        "final_score": final_score,
        "scoring_method": "rules_plus_preferences_locations_windows_ml_ready_v4_1",
        "model_version": "none",
        "feature_json": feature_json,
        "data_quality_json": data_quality_json,
        "prediction_source": "github_actions_v4_1",
        "generated_at": datetime.now(timezone.utc).isoformat(),

        "ml_status": "no_model_available",
        "ml_weight": 0,
        "rule_weight": 1,
        "blended_score": final_score,
        "model_input_json": {
            "activity": activity,
            "date": date,
            "weather": weather_snapshot,
            "user_preferences": preferences,
            "default_location": location_context,
            "recommended_window": recommended_window,
            "rule_score": rule_score,
            "preference_adjustment": preference_adjustment,
            "forecast_confidence": forecast_confidence,
        },
        "model_explanation": (
            "No ML model applied yet. Using rule-based score with user preferences, "
            "default location context, and cached time window."
        ),
    }

    return row


def main():
    print("Starting user prediction generation pipeline v4.1...")

    supabase = get_supabase_client()

    try:
        users = load_users(supabase)
        prediction_history = load_prediction_history(supabase)
        time_lookup = load_latest_time_recommendations(supabase)

        print(f"Users found: {len(users)}")
        print(f"Prediction history rows found: {len(prediction_history)}")
        print(f"Time recommendation dates found: {len(time_lookup)}")

        if len(users) == 0 or len(prediction_history) == 0:
            log_pipeline_run(
                supabase,
                status="completed_no_data_v4_1",
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
            saved_locations = load_user_saved_locations(supabase, user_id)
            activity_defaults = load_user_activity_location_defaults(supabase, user_id)

            location_lookup = build_location_lookup(saved_locations)
            activity_default_lookup = build_activity_default_lookup(
                activity_defaults,
                location_lookup,
            )

            rows_to_upsert = []

            for prediction in prediction_history:
                if not prediction.get("date") or not prediction.get("activity"):
                    continue

                rows_to_upsert.append(
                    build_user_prediction_row(
                        user_id=user_id,
                        prediction=prediction,
                        preferences=preferences,
                        activity_default_lookup=activity_default_lookup,
                        time_lookup=time_lookup,
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
            status="completed_v4_1",
            users_processed=len(users),
            predictions_written=total_written,
            error_message=None,
        )

        print("User prediction generation v4.1 complete.")

    except Exception as error:
        print(f"Pipeline failed: {error}")

        try:
            log_pipeline_run(
                supabase,
                status="failed_v4_1",
                users_processed=0,
                predictions_written=0,
                error_message=str(error),
            )
        except Exception:
            pass

        raise


if __name__ == "__main__":
    main()