import os
import sys
import time
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

import pandas as pd
from supabase import create_client


# --------------------------------------------------
# Environment compatibility
# --------------------------------------------------

# Some older modules expect SUPABASE_KEY.
# GitHub Actions commonly stores the service key as SUPABASE_SERVICE_ROLE_KEY.
if not os.environ.get("SUPABASE_KEY") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
    os.environ["SUPABASE_KEY"] = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


# Make repo root importable when running from jobs/
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(REPO_ROOT))


from scoring import (  # noqa: E402
    generate_predictions,
    apply_preference_adjustments,
    add_forecast_confidence,
)


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

FORECAST_DAYS = 15
PLANNING_START_DAYS = 1
PLANNING_HORIZON_DAYS = 14


def get_supabase_client():
    return create_client(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
    )


def get_planning_date_window():
    start_date = date.today() + timedelta(days=PLANNING_START_DAYS)
    end_date = date.today() + timedelta(days=PLANNING_HORIZON_DAYS)

    return start_date, end_date


def clean_number(value):
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    try:
        return float(value)
    except Exception:
        return None


def clean_value(value):
    """
    Makes values safe for Supabase JSON columns.
    """

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, dict):
        return {
            str(key): clean_value(nested_value)
            for key, nested_value in value.items()
        }

    if isinstance(value, list):
        return [clean_value(item) for item in value]

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    return value


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


def find_home_location(saved_locations):
    for location in saved_locations:
        location_type = str(location.get("location_type") or "").lower()

        if location_type == "home":
            return location

    return None


def find_first_valid_location(saved_locations):
    for location in saved_locations:
        if location.get("latitude") is not None and location.get("longitude") is not None:
            return location

    return None


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


def location_key(location):
    return str(location.get("id"))


def filter_predictions_to_planning_window(predictions):
    start_date, end_date = get_planning_date_window()

    filtered = predictions.copy()
    filtered["date"] = pd.to_datetime(filtered["date"], errors="coerce").dt.date

    filtered = filtered[
        (filtered["date"] >= start_date)
        & (filtered["date"] <= end_date)
    ].copy()

    filtered["date"] = pd.to_datetime(filtered["date"]).dt.strftime("%Y-%m-%d")

    return filtered


def generate_predictions_for_location(location, preferences):
    latitude = location.get("latitude")
    longitude = location.get("longitude")

    if latitude is None or longitude is None:
        print(f"Skipping location {location.get('name')} because coordinates are missing.")
        return pd.DataFrame()

    manual_water_temp = location.get("manual_water_temp")

    print(
        f"Fetching forecast for location {location.get('name')} "
        f"({latitude}, {longitude})"
    )

    try:
        base_predictions = generate_predictions(
            latitude=float(latitude),
            longitude=float(longitude),
            days=FORECAST_DAYS,
            manual_water_temp=manual_water_temp,
            include_air_quality=True,
        )
    except Exception as error:
        print(
            f"Failed to generate forecast for location {location.get('name')}: "
            f"{type(error).__name__}: {error}"
        )
        return pd.DataFrame()

    try:
        base_predictions = filter_predictions_to_planning_window(base_predictions)

        if len(base_predictions) == 0:
            print(f"No predictions in planning window for location {location.get('name')}.")
            return base_predictions

        adjusted_predictions = apply_preference_adjustments(
            predictions=base_predictions,
            preferences=preferences,
        )

        adjusted_predictions = add_forecast_confidence(adjusted_predictions)

        return adjusted_predictions

    except Exception as error:
        print(
            f"Failed to process predictions for location {location.get('name')}: "
            f"{type(error).__name__}: {error}"
        )
        return pd.DataFrame()


def build_user_prediction_row(user_id, prediction, location):
    activity = clean_value(prediction.get("activity"))
    date_value = clean_value(prediction.get("date"))

    location_context = build_location_context(location)
    saved_location_id = location.get("id") if location is not None else None
    location_name = location.get("name") if location is not None else None

    predicted_score = clean_number(prediction.get("predicted_score"))
    planning_score = clean_number(prediction.get("planning_score"))
    forecast_confidence = clean_number(prediction.get("forecast_confidence"))

    avg_temp = clean_number(prediction.get("avg_temp"))
    wind_max = clean_number(prediction.get("wind_max"))
    gust_max = clean_number(prediction.get("gust_max"))
    rain_chance = clean_number(prediction.get("rain_chance"))
    bug_index = clean_number(prediction.get("bug_index"))
    water_temp_est = clean_number(prediction.get("water_temp_est"))

    weather_snapshot = {
        "avg_temp": avg_temp,
        "wind_max": wind_max,
        "gust_max": gust_max,
        "rain_chance": rain_chance,
        "bug_index": bug_index,
        "storm_risk": clean_value(prediction.get("storm_risk")),
        "water_temp_est": water_temp_est,
    }

    rule_score = clean_number(prediction.get("base_predicted_score"))

    if rule_score is None:
        rule_score = predicted_score

    feature_json = {
        "source": "direct_user_location_forecast",
        "activity": activity,
        "date": date_value,
        "weather_snapshot": weather_snapshot,
        "location_context": location_context,
    }

    data_quality_json = {
        "prediction_source": "github_actions_direct_location_forecast_v1",
        "default_location_used": saved_location_id is not None,
        "forecast_days_requested": FORECAST_DAYS,
        "planning_window": "tomorrow_through_14_days",
        "ml_used": False,
    }

    return {
        "user_id": user_id,
        "date": date_value,
        "activity": activity,

        "predicted_score": None if predicted_score is None else round(predicted_score),
        "planning_score": None if planning_score is None else round(planning_score),
        "forecast_confidence": None if forecast_confidence is None else round(forecast_confidence),
        "forecast_confidence_label": clean_value(prediction.get("forecast_confidence_label")),
        "label": clean_value(prediction.get("label")),

        "recommended_window": None,
        "window_score": None,

        "saved_location_id": saved_location_id,
        "location_name": location_name,
        "location_context": clean_value(location_context),

        "explanation": clean_value(prediction.get("explanation")),
        "gear_notes": clean_value(prediction.get("gear_notes")),

        "weather_snapshot": clean_value(weather_snapshot),
        "species_breakdown": clean_value(prediction.get("species_breakdown")),
        "best_species": clean_value(prediction.get("best_species")),
        "best_species_score": clean_number(prediction.get("best_species_score")),

        "rule_score": rule_score,
        "ml_score": None,
        "final_score": None if predicted_score is None else round(predicted_score),
        "scoring_method": "direct_user_location_rules_preferences_v1",
        "model_version": "none",
        "feature_json": clean_value(feature_json),
        "data_quality_json": clean_value(data_quality_json),
        "prediction_source": "github_actions_direct_user_location_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),

        "ml_status": "no_model_available",
        "ml_weight": 0,
        "rule_weight": 1,
        "blended_score": None if predicted_score is None else round(predicted_score),
        "model_input_json": clean_value(
            {
                "activity": activity,
                "date": date_value,
                "weather": weather_snapshot,
                "location": location_context,
                "rule_score": rule_score,
                "forecast_confidence": forecast_confidence,
            }
        ),
        "model_explanation": (
            "No ML model applied yet. Using direct forecast scoring with "
            "user preferences and saved/default location context."
        ),
    }


def log_pipeline_run(
    supabase,
    status,
    users_processed=0,
    predictions_written=0,
    error_message=None,
):
    row = {
        "run_source": "github_actions_direct_user_location_v1",
        "status": status,
        "users_processed": users_processed,
        "predictions_written": predictions_written,
        "error_message": error_message,
    }

    supabase.table("prediction_pipeline_runs").insert(row).execute()


def build_location_plan(saved_locations, activity_default_lookup):
    """
    Returns list of:
    [
      {
        "location": location,
        "activities": set([...]) or None for fallback-all
      }
    ]

    Fallback location generates all activities not covered by explicit defaults.
    Explicit activity defaults override fallback rows.
    """

    home_location = find_home_location(saved_locations)
    first_location = find_first_valid_location(saved_locations)
    fallback_location = home_location or first_location

    plan = []

    if fallback_location is not None:
        plan.append(
            {
                "location": fallback_location,
                "activities": None,
                "role": "fallback",
            }
        )

    for activity, location in activity_default_lookup.items():
        plan.append(
            {
                "location": location,
                "activities": {activity},
                "role": "activity_default",
            }
        )

    return plan


def main():
    print("Starting direct user-location prediction generation...")

    supabase = get_supabase_client()

    users_processed = 0
    total_written = 0

    try:
        users = load_users(supabase)
        print(f"Users found: {len(users)}")

        for user in users:
            user_id = get_user_id(user)

            if not user_id:
                continue

            users_processed += 1
            print(f"Processing user {user_id}")

            preferences = load_user_preferences(supabase, user_id)
            saved_locations = load_user_saved_locations(supabase, user_id)
            activity_defaults = load_user_activity_location_defaults(supabase, user_id)

            if len(saved_locations) == 0:
                print(f"User {user_id} has no saved locations. Skipping.")
                continue

            location_lookup = build_location_lookup(saved_locations)
            activity_default_lookup = build_activity_default_lookup(
                activity_defaults,
                location_lookup,
            )

            plan = build_location_plan(saved_locations, activity_default_lookup)

            if len(plan) == 0:
                print(f"User {user_id} has no valid forecast locations. Skipping.")
                continue

            rows_by_key = {}
            explicitly_defaulted_activities = set(activity_default_lookup.keys())

            forecast_cache_by_location_key = {}

            for plan_item in plan:
                location = plan_item["location"]
                activities = plan_item["activities"]
                role = plan_item["role"]

                key = location_key(location)

                if key not in forecast_cache_by_location_key:
                    forecast_cache_by_location_key[key] = generate_predictions_for_location(
                        location=location,
                        preferences=preferences,
                    )

                    time.sleep(1)

                predictions = forecast_cache_by_location_key[key]

                if len(predictions) == 0:
                    continue

                for _, prediction in predictions.iterrows():
                    activity = prediction.get("activity")
                    date_value = prediction.get("date")

                    if not activity or not date_value:
                        continue

                    if role == "fallback" and activity in explicitly_defaulted_activities:
                        continue

                    if activities is not None and activity not in activities:
                        continue

                    row = build_user_prediction_row(
                        user_id=user_id,
                        prediction=prediction,
                        location=location,
                    )

                    rows_by_key[(row["date"], row["activity"])] = row

            rows_to_upsert = list(rows_by_key.values())

            if len(rows_to_upsert) == 0:
                print(f"No prediction rows generated for user {user_id}.")
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
            status="completed_direct_user_location_v1",
            users_processed=users_processed,
            predictions_written=total_written,
            error_message=None,
        )

        print("Direct user-location prediction generation complete.")
        print(f"Users processed: {users_processed}")
        print(f"Predictions written: {total_written}")

    except Exception as error:
        print(f"Pipeline failed: {error}")

        try:
            log_pipeline_run(
                supabase,
                status="failed_direct_user_location_v1",
                users_processed=users_processed,
                predictions_written=total_written,
                error_message=str(error),
            )
        except Exception:
            pass

        raise


if __name__ == "__main__":
    main()