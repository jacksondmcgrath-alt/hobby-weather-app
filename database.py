from datetime import datetime

import pandas as pd
import streamlit as st
from supabase import create_client

from config import DEFAULT_SETTINGS
from utils import clean_json_value, dataframe_to_json_records


# =========================
# Supabase client
# =========================

@st.cache_resource
def get_supabase_client():
    """
    Connects to Supabase using Streamlit secrets.
    """

    supabase_url = st.secrets["SUPABASE_URL"]
    supabase_key = st.secrets["SUPABASE_KEY"]

    return create_client(supabase_url, supabase_key)


# =========================
# App settings/preferences
# =========================

def load_settings():
    """
    Loads saved settings from Supabase.
    Falls back to DEFAULT_SETTINGS if nothing is saved yet.
    """

    settings = DEFAULT_SETTINGS.copy()

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("app_preferences")
            .select("settings")
            .eq("id", 1)
            .limit(1)
            .execute()
        )

        rows = response.data

        if rows is not None and len(rows) > 0:
            saved_settings = rows[0].get("settings", {})

            if isinstance(saved_settings, dict):
                settings.update(saved_settings)

    except Exception as e:
        st.warning("Could not load preferences from Supabase. Using defaults.")
        st.write(e)

    return settings


def save_settings(settings):
    """
    Saves settings to Supabase.
    """

    try:
        supabase = get_supabase_client()

        row = {
            "id": 1,
            "settings": settings,
        }

        supabase.table("app_preferences").upsert(row).execute()

    except Exception as e:
        st.error("Could not save preferences to Supabase.")
        st.write(e)


# =========================
# Environment cache
# =========================

@st.cache_data(ttl=300)
def load_environment_cache(location_id, data_type):
    """
    Loads cached environmental data for a saved location.

    Example data_type:
    - nws_alerts
    - usgs_water
    - ndbc_buoy
    """

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("environment_cache")
            .select("*")
            .eq("location_id", int(location_id))
            .eq("data_type", data_type)
            .limit(1)
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return None

        return rows[0]

    except Exception:
        return None


# =========================
# Forecast cache
# =========================

def make_forecast_cache_key(
    latitude,
    longitude,
    forecast_days,
    manual_water_temp,
    preferences,
    include_air_quality,
    obligations_key=None,
):
    """
    Creates a cache key for forecast results.

    Rounded coordinates prevent tiny decimal changes from creating new cache keys.
    """

    lat_key = round(float(latitude), 3)
    lon_key = round(float(longitude), 3)

    manual_water_temp_key = (
        "none" if manual_water_temp is None else round(float(manual_water_temp), 1)
    )

    preferences_key = tuple(sorted(preferences.items()))

    cache_version = "dynamic_rules_v1"

    return (
        f"{cache_version}_"
        f"{lat_key}_{lon_key}_{forecast_days}_"
        f"{manual_water_temp_key}_{include_air_quality}_"
        f"{preferences_key}_"
        f"{obligations_key}"
    )


def load_forecast_cache(cache_key, max_age_minutes=120, allow_stale=False):
    """
    Loads cached forecast results from Supabase.

    If allow_stale=False, only returns cache if recent enough.
    If allow_stale=True, returns old cache too as an emergency fallback.
    """

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("forecast_cache")
            .select("*")
            .eq("cache_key", cache_key)
            .limit(1)
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return None, None

        row = rows[0]

        generated_at = pd.to_datetime(row.get("generated_at"), utc=True)
        now = pd.Timestamp.now(tz="UTC")

        age_minutes = (now - generated_at).total_seconds() / 60

        if age_minutes > max_age_minutes and not allow_stale:
            return None, None

        predictions = pd.DataFrame(row.get("predictions", []))
        time_recommendations = pd.DataFrame(row.get("time_recommendations", []))

        if len(predictions) == 0 or len(time_recommendations) == 0:
            return None, None

        return predictions, time_recommendations

    except Exception:
        return None, None


def save_forecast_cache(
    cache_key,
    latitude,
    longitude,
    forecast_days,
    manual_water_temp,
    predictions,
    time_recommendations,
):
    """
    Saves forecast results to Supabase for faster future app opens.
    Cleans NaN values before saving JSON.
    """

    try:
        supabase = get_supabase_client()

        row = {
            "cache_key": cache_key,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "latitude": float(latitude),
            "longitude": float(longitude),
            "forecast_days": int(forecast_days),
            "manual_water_temp": None if manual_water_temp is None else float(manual_water_temp),
            "predictions": dataframe_to_json_records(predictions),
            "time_recommendations": dataframe_to_json_records(time_recommendations),
        }

        row = clean_json_value(row)

        supabase.table("forecast_cache").upsert(
            row,
            on_conflict="cache_key",
        ).execute()

    except Exception as e:
        st.warning("Could not save forecast cache.")
        st.write(e)


# =========================
# Prediction history
# =========================

@st.cache_data(ttl=300)
def load_prediction_history():
    """
    Loads saved prediction history from Supabase.

    This helps retroactive logging find old predicted scores.
    """

    columns = [
        "generated_at",
        "date",
        "activity",
        "predicted_score",
        "label",
        "explanation",
        "gear_notes",
        "base_predicted_score",
        "preference_adjustment",
        "avg_temp",
        "wind_max",
        "gust_max",
        "rain_chance",
        "bug_index",
        "storm_risk",
        "water_temp_est",
        "best_species",
        "best_species_score",
        "species_breakdown",
    ]

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("prediction_history")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return pd.DataFrame(columns=columns)

        history = pd.DataFrame(rows)

        for column in columns:
            if column not in history.columns:
                history[column] = None

        return history[columns]

    except Exception as e:
        st.warning("Could not load prediction history from Supabase.")
        st.write(e)

        return pd.DataFrame(columns=columns)


def save_prediction_history(predictions):
    """
    Saves current predictions to Supabase.

    Uses upsert so each date/activity keeps the latest prediction.
    Cleans NaN values and handles species_breakdown JSON safely.
    """

    try:
        supabase = get_supabase_client()

        predictions_to_save = predictions.copy()

        predictions_to_save["date"] = pd.to_datetime(
            predictions_to_save["date"],
            errors="coerce",
        ).dt.strftime("%Y-%m-%d")

        predictions_to_save["generated_at"] = datetime.now().isoformat(timespec="seconds")

        predictions_to_save = predictions_to_save.drop_duplicates(
            subset=["date", "activity"],
            keep="last",
        )

        allowed_columns = [
            "generated_at",
            "date",
            "activity",
            "predicted_score",
            "label",
            "explanation",
            "gear_notes",
            "base_predicted_score",
            "preference_adjustment",
            "avg_temp",
            "wind_max",
            "gust_max",
            "rain_chance",
            "bug_index",
            "storm_risk",
            "water_temp_est",
            "best_species",
            "best_species_score",
            "species_breakdown",
        ]

        numeric_columns = [
            "predicted_score",
            "base_predicted_score",
            "preference_adjustment",
            "avg_temp",
            "wind_max",
            "gust_max",
            "rain_chance",
            "bug_index",
            "water_temp_est",
            "best_species_score",
        ]

        rows_to_save = []

        for _, row in predictions_to_save.iterrows():
            clean_row = {}

            for column in allowed_columns:
                value = row.get(column, None)

                if column == "species_breakdown":
                    if isinstance(value, (list, dict)):
                        clean_row[column] = clean_json_value(value)
                    else:
                        clean_row[column] = None

                elif value == "" or value is None:
                    clean_row[column] = None

                elif column in numeric_columns:
                    cleaned_value = clean_json_value(value)

                    try:
                        if cleaned_value is None:
                            clean_row[column] = None
                        else:
                            clean_row[column] = float(cleaned_value)
                    except Exception:
                        clean_row[column] = None

                else:
                    cleaned_value = clean_json_value(value)

                    if cleaned_value is None:
                        clean_row[column] = None
                    else:
                        clean_row[column] = str(cleaned_value)

            clean_row = clean_json_value(clean_row)
            rows_to_save.append(clean_row)

        if len(rows_to_save) > 0:
            supabase.table("prediction_history").upsert(
                rows_to_save,
                on_conflict="date,activity",
            ).execute()

    except Exception as e:
        st.warning("Could not save prediction history to Supabase.")
        st.write(e)


def find_saved_prediction(predictions, selected_date, selected_activity):
    """
    Looks for a prediction in:
    1. Current forecast predictions
    2. Supabase prediction history

    Returns a row if found, otherwise None.
    """

    selected_date = pd.to_datetime(selected_date).strftime("%Y-%m-%d")

    current_matches = predictions[
        (predictions["date"] == selected_date) &
        (predictions["activity"] == selected_activity)
    ]

    if len(current_matches) > 0:
        return current_matches.iloc[0]

    prediction_history = load_prediction_history()

    if len(prediction_history) == 0:
        return None

    if "date" not in prediction_history.columns or "activity" not in prediction_history.columns:
        return None

    prediction_history["date"] = pd.to_datetime(
        prediction_history["date"],
        errors="coerce",
    ).dt.strftime("%Y-%m-%d")

    history_matches = prediction_history[
        (prediction_history["date"] == selected_date) &
        (prediction_history["activity"] == selected_activity)
    ]

    if len(history_matches) > 0:
        return history_matches.iloc[0]

    return None


# =========================
# Activity logs
# =========================

@st.cache_data(ttl=60)
def load_activity_log():
    """
    Loads activity logs from Supabase.
    """

    columns = [
        "id",
        "planned_activity_id",
        "logged_at",
        "date",
        "activity",
        "predicted_score",
        "recommended_time_window",
        "time_window_score",
        "actual_time",
        "followed_recommended_window",
        "actual_enjoyment_1_to_10",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
        "did_i_go",
        "actual_bugs_1_to_10",
        "actual_wind_annoyance_1_to_10",
        "actual_humidity_comfort_1_to_10",
        "actual_ground_wetness",
        "actual_water_conditions",
        "fish_activity",
        "visibility_light",
        "notes",
    ]

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("activity_logs")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return pd.DataFrame(columns=columns)

        activity_log = pd.DataFrame(rows)

        for column in columns:
            if column not in activity_log.columns:
                activity_log[column] = ""

        return activity_log[columns]

    except Exception as e:
        st.error("Could not load activity logs from Supabase.")
        st.write(e)
        return pd.DataFrame(columns=columns)


def save_log_entry(new_entry):
    """
    Saves one activity log entry to Supabase.
    """

    supabase = get_supabase_client()

    allowed_columns = [
        "planned_activity_id",
        "logged_at",
        "date",
        "activity",
        "predicted_score",
        "recommended_time_window",
        "time_window_score",
        "actual_time",
        "followed_recommended_window",
        "actual_enjoyment_1_to_10",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
        "did_i_go",
        "actual_bugs_1_to_10",
        "actual_wind_annoyance_1_to_10",
        "actual_humidity_comfort_1_to_10",
        "actual_ground_wetness",
        "actual_water_conditions",
        "fish_activity",
        "visibility_light",
        "notes",
    ]

    numeric_columns = [
        "planned_activity_id",
        "predicted_score",
        "time_window_score",
        "actual_enjoyment_1_to_10",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
        "actual_bugs_1_to_10",
        "actual_wind_annoyance_1_to_10",
        "actual_humidity_comfort_1_to_10",
    ]

    clean_entry = {}

    for column in allowed_columns:
        value = new_entry.get(column, None)

        if value == "" or value is None:
            clean_entry[column] = None
        elif column in numeric_columns:
            try:
                clean_entry[column] = float(value)
            except Exception:
                clean_entry[column] = None
        else:
            clean_entry[column] = str(value)

    response = supabase.table("activity_logs").insert(clean_entry).execute()

    return response


def delete_log_entry(log_id):
    """
    Deletes one activity log entry from Supabase by id.
    """

    supabase = get_supabase_client()

    response = (
        supabase
        .table("activity_logs")
        .delete()
        .eq("id", log_id)
        .execute()
    )

    return response


def update_log_entry(log_id, updated_entry):
    """
    Updates one activity log entry in Supabase by id.
    """

    supabase = get_supabase_client()

    allowed_columns = [
        "actual_time",
        "followed_recommended_window",
        "actual_enjoyment_1_to_10",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
        "did_i_go",
        "actual_bugs_1_to_10",
        "actual_wind_annoyance_1_to_10",
        "actual_humidity_comfort_1_to_10",
        "actual_ground_wetness",
        "actual_water_conditions",
        "fish_activity",
        "visibility_light",
        "notes",
    ]

    numeric_columns = [
        "actual_enjoyment_1_to_10",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
        "actual_bugs_1_to_10",
        "actual_wind_annoyance_1_to_10",
        "actual_humidity_comfort_1_to_10",
    ]

    clean_entry = {}

    for column in allowed_columns:
        value = updated_entry.get(column, None)

        if value == "" or value is None:
            clean_entry[column] = None

        elif column in numeric_columns:
            try:
                clean_entry[column] = float(value)
            except Exception:
                clean_entry[column] = None

        else:
            clean_entry[column] = str(value)

    response = (
        supabase
        .table("activity_logs")
        .update(clean_entry)
        .eq("id", log_id)
        .execute()
    )

    return response


# =========================
# Planned activities
# =========================

@st.cache_data(ttl=60)
def load_planned_activities():
    """
    Loads planned activities from Supabase.
    """

    columns = [
        "id",
        "created_at",
        "updated_at",
        "activity",
        "planned_date",
        "planned_window",
        "planned_start",
        "planned_end",
        "status",
        "location_name",
        "location_context",
        "score_at_planning",
        "planning_score_at_planning",
        "forecast_confidence_at_planning",
        "forecast_confidence_label_at_planning",
        "weather_snapshot_at_planning",
        "species_target_at_planning",
        "current_score",
        "current_planning_score",
        "current_forecast_confidence",
        "current_forecast_confidence_label",
        "score_change",
        "planning_score_change",
        "confidence_change",
        "notes",
    ]

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("planned_activities")
            .select("*")
            .order("planned_date")
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return pd.DataFrame(columns=columns)

        plans = pd.DataFrame(rows)

        for column in columns:
            if column not in plans.columns:
                plans[column] = None

        return plans[columns]

    except Exception as e:
        st.warning("Could not load planned activities.")
        st.write(e)
        return pd.DataFrame(columns=columns)

def plan_has_activity_log(plan_id):
    """
    Checks whether a planned activity already has an activity log.
    """

    if plan_id is None:
        return False

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("activity_logs")
            .select("id")
            .eq("planned_activity_id", int(plan_id))
            .limit(1)
            .execute()
        )

        rows = response.data

        return rows is not None and len(rows) > 0

    except Exception:
        return False

def get_activity_log_for_plan(plan_id):
    """
    Gets the activity log linked to a planned activity, if one exists.
    """

    if plan_id is None:
        return None

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("activity_logs")
            .select("*")
            .eq("planned_activity_id", int(plan_id))
            .limit(1)
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return None

        return rows[0]

    except Exception:
        return None

def create_planned_activity_from_prediction(
    prediction_row,
    recommended_window,
    notes="",
    location_name="",
    location_context=None,
):
    """
    Creates a planned activity from a prediction row.
    """

    supabase = get_supabase_client()

    if location_context is None:
        location_context = {}

    species_target = None

    if prediction_row.get("activity") == "Fishing":
        species_breakdown = prediction_row.get("species_breakdown", [])

        if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
            species_target = species_breakdown[0].get("species")

    weather_snapshot = {
        "avg_temp": prediction_row.get("avg_temp"),
        "wind_max": prediction_row.get("wind_max"),
        "gust_max": prediction_row.get("gust_max"),
        "rain_chance": prediction_row.get("rain_chance"),
        "bug_index": prediction_row.get("bug_index"),
        "storm_risk": prediction_row.get("storm_risk"),
        "water_temp_est": prediction_row.get("water_temp_est"),
        "forecast_confidence": prediction_row.get("forecast_confidence"),
        "forecast_confidence_label": prediction_row.get("forecast_confidence_label"),
    }

    row = {
        "activity": prediction_row.get("activity"),
        "planned_date": prediction_row.get("date"),
        "planned_window": recommended_window,
        "status": "Planned",
        "location_name": location_name,
        "location_context": clean_json_value(location_context),
        "score_at_planning": prediction_row.get("predicted_score"),
        "planning_score_at_planning": prediction_row.get("planning_score"),
        "forecast_confidence_at_planning": prediction_row.get("forecast_confidence"),
        "forecast_confidence_label_at_planning": prediction_row.get("forecast_confidence_label"),
        "weather_snapshot_at_planning": clean_json_value(weather_snapshot),
        "species_target_at_planning": species_target,
        "notes": notes,
    }

    row = clean_json_value(row)

    response = (
        supabase
        .table("planned_activities")
        .insert(row)
        .execute()
    )

    load_planned_activities.clear()

    return response


def update_planned_activity_status(plan_id, status):
    """
    Updates status of a planned activity.
    """

    supabase = get_supabase_client()

    response = (
        supabase
        .table("planned_activities")
        .update({
            "status": status,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        })
        .eq("id", plan_id)
        .execute()
    )

    load_planned_activities.clear()

    return response


def delete_planned_activity(plan_id):
    """
    Deletes a planned activity.
    """

    supabase = get_supabase_client()

    response = (
        supabase
        .table("planned_activities")
        .delete()
        .eq("id", plan_id)
        .execute()
    )

    load_planned_activities.clear()

    return response

def create_activity_log_from_plan(plan, actual_data):
    """
    Creates an activity log entry from a planned activity.

    Prevents duplicate logging by checking planned_activity_id.
    Then updates the planned activity status to Completed.
    """

    plan_id = plan.get("id")

    if plan_id is not None:
        plan_id = int(plan_id)

    if plan_id is not None and plan_has_activity_log(plan_id):
        raise ValueError("This planned activity has already been logged.")

    predicted_score = plan.get("score_at_planning")
    actual_score = actual_data.get("actual_score_0_to_100")

    try:
        if predicted_score is None or actual_score is None:
            prediction_error = None
            absolute_error = None
        else:
            prediction_error = float(actual_score) - float(predicted_score)
            absolute_error = abs(prediction_error)
    except Exception:
        prediction_error = None
        absolute_error = None

    new_log = {
        "planned_activity_id": plan_id,
        "logged_at": datetime.now().isoformat(timespec="seconds"),
        "date": plan.get("planned_date"),
        "activity": plan.get("activity"),
        "predicted_score": predicted_score,
        "recommended_time_window": plan.get("planned_window"),
        "time_window_score": None,
        "actual_time": actual_data.get("actual_time"),
        "followed_recommended_window": actual_data.get("followed_recommended_window"),
        "actual_enjoyment_1_to_10": actual_data.get("actual_enjoyment_1_to_10"),
        "actual_score_0_to_100": actual_score,
        "prediction_error": prediction_error,
        "absolute_error": absolute_error,
        "did_i_go": actual_data.get("did_i_go"),
        "actual_bugs_1_to_10": actual_data.get("actual_bugs_1_to_10"),
        "actual_wind_annoyance_1_to_10": actual_data.get("actual_wind_annoyance_1_to_10"),
        "actual_humidity_comfort_1_to_10": actual_data.get("actual_humidity_comfort_1_to_10"),
        "actual_ground_wetness": actual_data.get("actual_ground_wetness"),
        "actual_water_conditions": actual_data.get("actual_water_conditions"),
        "fish_activity": actual_data.get("fish_activity"),
        "visibility_light": actual_data.get("visibility_light"),
        "notes": actual_data.get("notes"),
    }

    save_log_entry(new_log)

    if plan_id is not None:
        update_planned_activity_status(
            plan_id,
            "Completed",
        )

    load_activity_log.clear()
    load_planned_activities.clear()

    return new_log

# =========================
# Weekly obligations
# =========================

@st.cache_data(ttl=300)
def load_weekly_obligations():
    """
    Loads weekly recurring obligations from Supabase.
    """

    columns = [
        "id",
        "label",
        "day_of_week",
        "start_time",
        "end_time",
        "active",
    ]

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("weekly_obligations")
            .select("*")
            .order("day_of_week")
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return pd.DataFrame(columns=columns)

        df = pd.DataFrame(rows)

        for column in columns:
            if column not in df.columns:
                df[column] = None

        return df[columns]

    except Exception as e:
        st.warning("Could not load weekly obligations.")
        st.write(e)
        return pd.DataFrame(columns=columns)


def save_weekly_obligation(label, day_of_week, start_time, end_time):
    """
    Saves a weekly obligation.
    """

    supabase = get_supabase_client()

    row = {
        "label": label,
        "day_of_week": int(day_of_week),
        "start_time": start_time,
        "end_time": end_time,
        "active": True,
    }

    response = (
        supabase
        .table("weekly_obligations")
        .insert(row)
        .execute()
    )

    load_weekly_obligations.clear()

    return response


def delete_weekly_obligation(obligation_id):
    """
    Deletes a weekly obligation.
    """

    supabase = get_supabase_client()

    response = (
        supabase
        .table("weekly_obligations")
        .delete()
        .eq("id", obligation_id)
        .execute()
    )

    load_weekly_obligations.clear()

    return response


# =========================
# Saved locations
# =========================

@st.cache_data(ttl=300)
def load_saved_locations():
    """
    Loads saved locations from Supabase.
    """

    columns = [
        "id",
        "name",
        "latitude",
        "longitude",
        "location_type",
        "water_type",
        "default_activities",
        "manual_water_temp",
        "notes",
        "use_usgs_water_data",
        "water_body_size",
        "wind_exposure",
        "use_ndbc_data",
        "ndbc_station_id",
        "usgs_site_id",
    ]

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("saved_locations")
            .select("*")
            .order("name")
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return pd.DataFrame(columns=columns)

        locations = pd.DataFrame(rows)

        for column in columns:
            if column not in locations.columns:
                locations[column] = None

        return locations[columns]

    except Exception as e:
        st.warning("Could not load saved locations.")
        st.write(e)
        return pd.DataFrame(columns=columns)


def save_saved_location(location_data):
    """
    Saves a new location to Supabase.
    """

    supabase = get_supabase_client()

    clean_location = {
        "name": str(location_data.get("name", "")),
        "latitude": float(location_data.get("latitude")),
        "longitude": float(location_data.get("longitude")),
        "location_type": location_data.get("location_type"),
        "water_type": location_data.get("water_type"),
        "use_usgs_water_data": bool(location_data.get("use_usgs_water_data", False)),
        "usgs_site_id": location_data.get("usgs_site_id", ""),
        "default_activities": location_data.get("default_activities", []),
        "water_body_size": location_data.get("water_body_size", ""),
        "wind_exposure": location_data.get("wind_exposure", ""),
        "use_ndbc_data": bool(location_data.get("use_ndbc_data", False)),
        "ndbc_station_id": location_data.get("ndbc_station_id", ""),
        "manual_water_temp": (
            None
            if location_data.get("manual_water_temp") in ["", None]
            else float(location_data.get("manual_water_temp"))
        ),
        "notes": location_data.get("notes", ""),
    }

    response = (
        supabase
        .table("saved_locations")
        .insert(clean_location)
        .execute()
    )

    load_saved_locations.clear()

    return response


def update_saved_location(location_id, location_data):
    """
    Updates a saved location.
    """

    supabase = get_supabase_client()

    clean_location = {
        "name": str(location_data.get("name", "")),
        "latitude": float(location_data.get("latitude")),
        "longitude": float(location_data.get("longitude")),
        "location_type": location_data.get("location_type"),
        "water_type": location_data.get("water_type"),
        "default_activities": location_data.get("default_activities", []),
        "use_usgs_water_data": bool(location_data.get("use_usgs_water_data", False)),
        "usgs_site_id": location_data.get("usgs_site_id", ""),
        "water_body_size": location_data.get("water_body_size", ""),
        "wind_exposure": location_data.get("wind_exposure", ""),
        "use_ndbc_data": bool(location_data.get("use_ndbc_data", False)),
        "ndbc_station_id": location_data.get("ndbc_station_id", ""),
        "manual_water_temp": (
            None
            if location_data.get("manual_water_temp") in ["", None]
            else float(location_data.get("manual_water_temp"))
        ),
        "notes": location_data.get("notes", ""),
    }

    response = (
        supabase
        .table("saved_locations")
        .update(clean_location)
        .eq("id", location_id)
        .execute()
    )

    load_saved_locations.clear()

    return response


def delete_saved_location(location_id):
    """
    Deletes a saved location.
    """

    supabase = get_supabase_client()

    response = (
        supabase
        .table("saved_locations")
        .delete()
        .eq("id", location_id)
        .execute()
    )

    load_saved_locations.clear()

    return response


# =========================
# Activity location defaults
# =========================

@st.cache_data(ttl=300)
def load_activity_location_defaults():
    """
    Loads default saved locations by activity.
    """

    columns = [
        "id",
        "activity",
        "saved_location_id",
    ]

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("activity_location_defaults")
            .select("*")
            .order("activity")
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return pd.DataFrame(columns=columns)

        defaults = pd.DataFrame(rows)

        for column in columns:
            if column not in defaults.columns:
                defaults[column] = None

        return defaults[columns]

    except Exception as e:
        st.warning("Could not load activity location defaults.")
        st.write(e)
        return pd.DataFrame(columns=columns)


def save_activity_location_default(activity, saved_location_id):
    """
    Saves or updates the default location for one activity.
    """

    supabase = get_supabase_client()

    row = {
        "activity": activity,
        "saved_location_id": int(saved_location_id),
    }

    response = (
        supabase
        .table("activity_location_defaults")
        .upsert(
            row,
            on_conflict="activity",
        )
        .execute()
    )

    load_activity_location_defaults.clear()

    return response


def delete_activity_location_default(activity):
    """
    Removes the default location for one activity.
    """

    supabase = get_supabase_client()

    response = (
        supabase
        .table("activity_location_defaults")
        .delete()
        .eq("activity", activity)
        .execute()
    )

    load_activity_location_defaults.clear()

    return response


# =========================
# Baseline hobby rules
# =========================

@st.cache_data(ttl=3600)
def load_baseline_hobby_rules():
    """
    Loads baseline hobby rules from Supabase.
    """

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("baseline_hobby_rules")
            .select("*")
            .order("hobby")
            .execute()
        )

        rows = response.data

        if rows is None or len(rows) == 0:
            return pd.DataFrame()

        return pd.DataFrame(rows)

    except Exception as e:
        st.warning("Could not load baseline hobby rules.")
        st.write(e)
        return pd.DataFrame()


def get_rules_for_hobby(rules_df, hobby):
    """
    Returns rules for one hobby.
    """

    if rules_df is None or len(rules_df) == 0:
        return pd.DataFrame()

    return rules_df[
        rules_df["hobby"] == hobby
    ].copy()