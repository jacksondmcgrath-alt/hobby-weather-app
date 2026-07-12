import os
import random
import json
import time
import math
import re
from datetime import datetime, timedelta
from urllib import response
from urllib.parse import urlparse, parse_qs, unquote

import pandas as pd
import requests
import streamlit as st
from supabase import create_client

# =========================
# App settings
# =========================

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

LOG_FILE = "activity_log.csv"
SETTINGS_FILE = "preferences.json"
PREDICTION_HISTORY_FILE = "prediction_history.csv"

st.set_page_config(
    page_title="Hobby Weather Scorer",
    page_icon="🌤️",
    layout="wide",
)


# =========================
# Saved settings and location search
# =========================

DEFAULT_SETTINGS = {
    "latitude": 42.2808,
    "longitude": -83.7430,
    "location_query": "Ann Arbor, Michigan",
    "forecast_days": 7,
    "use_manual_water_temp": False,
    "manual_water_temp": 65,
    "phone_friendly_view": True,
    "include_air_quality": False,

    # Preference sliders
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

@st.cache_data(ttl=86400)
def geocode_place(place):
    """
    Converts a location name into latitude/longitude options.
    Uses Open-Meteo geocoding.
    """

    params = {
        "name": place,
        "count": 5,
        "language": "en",
        "format": "json",
    }

    response = requests.get(GEOCODE_URL, params=params, timeout=20)
    response.raise_for_status()

    data = response.json()

    results = []

    for item in data.get("results", []):
        name = item.get("name", "")
        admin1 = item.get("admin1", "")
        country = item.get("country", "")

        label_parts = [part for part in [name, admin1, country] if part]
        label = ", ".join(label_parts)

        results.append({
            "label": label,
            "latitude": item["latitude"],
            "longitude": item["longitude"],
        })

    return results

@st.cache_data(ttl=300)
def load_environment_cache(location_id, data_type):
    """
    Loads cached environmental data for a saved location.

    Example data_type:
    - nws_alerts
    - usgs_water
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
    
def get_usgs_water_data_for_location(location):
    """
    Returns cached USGS water data for a saved location dictionary.

    Returns None if unavailable.
    """

    if location is None:
        return None

    location_id = location.get("id")

    if location_id is None:
        return None

    cached = load_environment_cache(
        location_id=location_id,
        data_type="usgs_water",
    )

    if cached is None:
        return None

    return cached.get("data_json")


def format_usgs_water_summary(usgs_data):
    """
    Creates a readable summary of USGS water data.
    """

    if not usgs_data:
        return None

    parts = []

    streamflow = usgs_data.get("streamflow_cfs")
    gauge_height = usgs_data.get("gauge_height_ft")
    water_temp_f = usgs_data.get("water_temp_f")

    if streamflow is not None:
        try:
            parts.append(f"flow {float(streamflow):.0f} cfs")
        except Exception:
            pass

    if gauge_height is not None:
        try:
            parts.append(f"gauge {float(gauge_height):.2f} ft")
        except Exception:
            pass

    if water_temp_f is not None:
        try:
            parts.append(f"water {float(water_temp_f):.1f}°F")
        except Exception:
            pass

    if len(parts) == 0:
        return None

    return ", ".join(parts)

def get_nws_alerts_for_location(location):
    """
    Returns cached NWS alerts for a saved location dictionary.
    """

    if location is None:
        return []

    location_id = location.get("id")

    if location_id is None:
        return []

    cached = load_environment_cache(
        location_id=location_id,
        data_type="nws_alerts",
    )

    if cached is None:
        return []

    alerts = cached.get("data_json", [])

    if alerts is None:
        return []

    return alerts

def extract_coordinates_from_text(text):
    """
    Attempts to extract latitude/longitude from plain text or map URLs.

    Supports patterns like:
    - 42.2808,-83.7430
    - @42.2808,-83.7430
    - ?q=42.2808,-83.7430
    """

    if text is None:
        return None

    text = str(text)

    # Pattern for @lat,lon often found in Google Maps URLs
    match = re.search(
        r"@(-?\d+\.\d+),(-?\d+\.\d+)",
        text,
    )

    if match:
        return {
            "latitude": float(match.group(1)),
            "longitude": float(match.group(2)),
            "label": "Coordinates from map link",
        }

    # Pattern for lat,lon anywhere in text
    match = re.search(
        r"(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)",
        text,
    )

    if match:
        latitude = float(match.group(1))
        longitude = float(match.group(2))

        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            return {
                "latitude": latitude,
                "longitude": longitude,
                "label": "Coordinates from text",
            }

    return None

@st.cache_data(ttl=86400)
def search_location_nominatim(query):
    """
    Searches for addresses/places using OpenStreetMap Nominatim.

    Good for parks, addresses, landmarks, and many named places.
    """

    url = "https://nominatim.openstreetmap.org/search"

    params = {
        "q": query,
        "format": "json",
        "limit": 5,
        "addressdetails": 1,
    }

    headers = {
        "User-Agent": "hobby-weather-planner/1.0"
    }

    response = requests.get(
        url,
        params=params,
        headers=headers,
        timeout=15,
    )

    response.raise_for_status()

    data = response.json()

    results = []

    for item in data:
        label = item.get("display_name", "Unknown location")
        latitude = float(item["lat"])
        longitude = float(item["lon"])

        results.append({
            "label": label,
            "latitude": latitude,
            "longitude": longitude,
            "source": "OpenStreetMap",
        })

    return results

def search_location_anything(query):
    """
    Searches a user-entered location string.

    Supports:
    - address
    - place name
    - coordinates
    - some Google/Apple map links with visible coordinates
    """

    query = str(query).strip()

    if query == "":
        return []

    coordinate_result = extract_coordinates_from_text(query)

    if coordinate_result is not None:
        return [coordinate_result]

    results = []

    # Try Nominatim first
    try:
        nominatim_results = search_location_nominatim(query)
        results.extend(nominatim_results)
    except Exception:
        pass

    # Try Open-Meteo geocoding as fallback
    try:
        open_meteo_results = geocode_place(query)

        # Your geocode_place may return one dict or a list depending on your implementation.
        if isinstance(open_meteo_results, list):
            for item in open_meteo_results:
                results.append({
                    "label": item.get("label", item.get("name", "Open-Meteo result")),
                    "latitude": item["latitude"],
                    "longitude": item["longitude"],
                    "source": "Open-Meteo",
                })

        elif isinstance(open_meteo_results, dict):
            label_parts = [
                open_meteo_results.get("name"),
                open_meteo_results.get("admin1"),
                open_meteo_results.get("country"),
            ]

            label = ", ".join([
                part for part in label_parts
                if part
            ])

            results.append({
                "label": label,
                "latitude": open_meteo_results["latitude"],
                "longitude": open_meteo_results["longitude"],
                "source": "Open-Meteo",
            })

    except Exception:
        pass

    # Deduplicate by rounded lat/lon
    unique_results = []
    seen = set()

    for result in results:
        key = (
            round(float(result["latitude"]), 5),
            round(float(result["longitude"]), 5),
        )

        if key not in seen:
            unique_results.append(result)
            seen.add(key)

    return unique_results[:8]

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

def update_plans_with_current_forecast(plans, predictions):
    """
    Adds current forecast comparison fields to planned activities.

    This does not write to Supabase yet; it computes changes for display.
    """

    if plans is None or len(plans) == 0:
        return plans

    updated_plans = plans.copy()

    current_scores = []
    current_planning_scores = []
    current_confidences = []
    current_confidence_labels = []
    score_changes = []
    planning_score_changes = []
    confidence_changes = []

    for _, plan in updated_plans.iterrows():
        matches = predictions[
            (predictions["date"] == plan["planned_date"]) &
            (predictions["activity"] == plan["activity"])
        ]

        if len(matches) == 0:
            current_scores.append(None)
            current_planning_scores.append(None)
            current_confidences.append(None)
            current_confidence_labels.append(None)
            score_changes.append(None)
            planning_score_changes.append(None)
            confidence_changes.append(None)
            continue

        current = matches.iloc[0]

        current_score = current.get("predicted_score")
        current_planning = current.get("planning_score")
        current_confidence = current.get("forecast_confidence")
        current_confidence_label = current.get("forecast_confidence_label")

        current_scores.append(current_score)
        current_planning_scores.append(current_planning)
        current_confidences.append(current_confidence)
        current_confidence_labels.append(current_confidence_label)

        try:
            score_changes.append(float(current_score) - float(plan["score_at_planning"]))
        except Exception:
            score_changes.append(None)

        try:
            planning_score_changes.append(float(current_planning) - float(plan["planning_score_at_planning"]))
        except Exception:
            planning_score_changes.append(None)

        try:
            confidence_changes.append(float(current_confidence) - float(plan["forecast_confidence_at_planning"]))
        except Exception:
            confidence_changes.append(None)

    updated_plans["current_score"] = current_scores
    updated_plans["current_planning_score"] = current_planning_scores
    updated_plans["current_forecast_confidence"] = current_confidences
    updated_plans["current_forecast_confidence_label"] = current_confidence_labels
    updated_plans["score_change"] = score_changes
    updated_plans["planning_score_change"] = planning_score_changes
    updated_plans["confidence_change"] = confidence_changes

    return updated_plans

def build_best_day_by_activity(predictions):
    """
    Finds the best date/window for each activity.
    """

    rows = []

    if predictions is None or len(predictions) == 0:
        return pd.DataFrame()

    sort_column = (
        "planning_score"
        if "planning_score" in predictions.columns
        else "predicted_score"
    )

    for activity in sorted(predictions["activity"].dropna().unique()):
        activity_rows = predictions[
            predictions["activity"] == activity
        ].copy()

        if len(activity_rows) == 0:
            continue

        activity_rows = activity_rows.sort_values(
            sort_column,
            ascending=False,
        )

        best = activity_rows.iloc[0]

        rows.append({
            "Activity": activity,
            "Best Date": best["date"],
            "Score": best["predicted_score"],
            "Planning Score": best.get("planning_score"),
            "Forecast Confidence": best.get("forecast_confidence"),
            "Confidence Label": best.get("forecast_confidence_label"),
            "Label": best["label"],
            "Reason": best["explanation"],
        })

    return pd.DataFrame(rows)

@st.cache_data(ttl=60)
def load_scenario_ratings():
    """
    Loads scenario ratings from Supabase.
    """

    columns = [
        "id",
        "created_at",
        "activity",
        "rating",
        "rating_0_to_100",
        "notes",
        "scenario_json",
        "source",
        "temperature",
        "wind_speed",
        "wind_gust",
        "rain_chance",
        "humidity",
        "cloud_cover",
        "pressure_change",
        "bug_index",
        "water_temp",
        "storm_safety",
        "dew_point",
        "aqi",
        "uv_index",
        "advanced_features",
        "location_context",
        "model_features_version",
        "scenario_fingerprint",
        "shown_features",
        "hidden_features",
        "scenario_mode",
        "scenario_generation_method",
        "rating_question",
        "rating_scale_min",
        "rating_scale_max",
        "rating_target",
        "rater_confidence",
        "rater_experience_level",
        "assume_safe_conditions",
        "required_context_missing",
    ]

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("scenario_ratings")
            .select("*")
            .order("created_at", desc=True)
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
        st.warning("Could not load scenario ratings.")
        st.write(e)
        return pd.DataFrame(columns=columns)
    
def update_scenario_rating(rating_id, updated_data):
    """
    Updates one scenario rating in Supabase.
    """

    supabase = get_supabase_client()

    clean_update = {
        "rating": float(updated_data["rating"]),
        "rating_0_to_100": float(updated_data["rating"]) * 10,
        "notes": updated_data.get("notes", ""),
        "rater_confidence": (
            None
            if updated_data.get("rater_confidence") is None
            else float(updated_data.get("rater_confidence"))
        ),
        "rater_experience_level": updated_data.get("rater_experience_level"),
        "assume_safe_conditions": updated_data.get("assume_safe_conditions"),
    }

    clean_update = clean_json_value(clean_update)

    response = (
        supabase
        .table("scenario_ratings")
        .update(clean_update)
        .eq("id", rating_id)
        .execute()
    )

    load_scenario_ratings.clear()

    return response


def delete_scenario_rating(rating_id):
    """
    Deletes one scenario rating from Supabase.
    """

    supabase = get_supabase_client()

    response = (
        supabase
        .table("scenario_ratings")
        .delete()
        .eq("id", rating_id)
        .execute()
    )

    load_scenario_ratings.clear()

    return response

def get_shown_features_for_scenario(activity, scenario_mode="basic"):
    """
    Returns the features shown to the rater for a scenario.

    Basic mode shows only activity-relevant core features.
    Advanced mode can show more features later.
    """

    base_features = ACTIVITY_SCENARIO_FIELDS.get(activity, [])

    if scenario_mode == "basic":
        return base_features

    if scenario_mode == "advanced":
        advanced_extra_features = [
            "visibility",
            "wind_direction",
            "rain_amount",
            "recent_rain_24h",
            "recent_rain_72h",
            "overnight_low",
            "month",
            "season",
            "daylight_hours",
            "moon_phase",
            "moon_illumination",
            "pollen_index",
            "river_flow_cfs",
            "gauge_height",
            "flow_trend",
            "wave_height_ft",
            "rip_current_risk",
            "fire_danger",
            "water_quality_alert",
        ]

        return list(dict.fromkeys(base_features + advanced_extra_features))

    return base_features


def get_hidden_features_for_scenario(scenario, shown_features):
    """
    Returns stored scenario keys that were not shown to the rater.
    """

    non_feature_keys = {
        "activity",
        "advanced_features",
        "location_context",
        "model_features_version",
    }

    hidden_features = []

    for key in scenario.keys():
        if key in non_feature_keys:
            continue

        if key not in shown_features:
            hidden_features.append(key)

    return hidden_features


def get_required_context_missing(activity, scenario):
    """
    Identifies important context that might be missing for interpreting ratings.
    """

    missing = []

    if activity in ["Fishing", "Kayaking", "Beach Day"]:
        if scenario.get("water_temp") is None:
            missing.append("water_temp")

    if activity == "Kayaking":
        # Future values if you add real river/wave data
        if scenario.get("river_flow_cfs") is None and scenario.get("wave_height_ft") is None:
            missing.append("river_or_wave_context")

    if activity == "Beach Day":
        if scenario.get("wave_height_ft") is None:
            missing.append("wave_height")
        if scenario.get("rip_current_risk") is None:
            missing.append("rip_current_risk")

    if activity == "Tennis":
        # Court surface/wetness is not fully represented yet
        if scenario.get("recent_rain_24h") is None:
            missing.append("recent_rain_or_court_wetness")

    if activity == "Camping":
        if scenario.get("overnight_low") is None:
            missing.append("overnight_low")

    return missing

def make_scenario_fingerprint(scenario, rating, notes):
    """
    Creates a stable fingerprint for a scenario rating.

    Prevents exact duplicate saves.
    """

    payload = {
        "scenario": clean_json_value(scenario),
        "rating": rating,
        "notes": notes,
    }

    return json.dumps(
        payload,
        sort_keys=True,
    )

def save_scenario_rating(
    scenario,
    rating,
    notes="",
    scenario_mode="basic",
    rater_confidence=None,
    rater_experience_level=None,
    assume_safe_conditions=True,
):
    """
    Saves one scenario rating to Supabase.

    Stores:
    - core features as columns
    - advanced features as JSON
    - metadata explaining what the rater saw and what the rating means
    """

    supabase = get_supabase_client()

    activity = scenario.get("activity")

    advanced_features = scenario.get("advanced_features", {})
    location_context = scenario.get("location_context", {})

    shown_features = get_shown_features_for_scenario(
        activity,
        scenario_mode=scenario_mode,
    )

    hidden_features = get_hidden_features_for_scenario(
        scenario,
        shown_features,
    )

    required_context_missing = get_required_context_missing(
        activity,
        scenario,
    )

    row = {
        "activity": activity,
        "rating": float(rating),
        "rating_0_to_100": float(rating) * 10,
        "notes": notes,
        "scenario_json": clean_json_value(scenario),
        "source": scenario.get("scenario_generation_method", "random_scenario_v1"),

        # Core feature columns
        "temperature": scenario.get("temperature"),
        "wind_speed": scenario.get("wind_speed"),
        "wind_gust": scenario.get("wind_gust"),
        "rain_chance": scenario.get("rain_chance"),
        "humidity": scenario.get("humidity"),
        "cloud_cover": scenario.get("cloud_cover"),
        "pressure_change": scenario.get("pressure_change"),
        "bug_index": scenario.get("bug_index"),
        "water_temp": scenario.get("water_temp"),
        "storm_safety": scenario.get("storm_safety"),
        "dew_point": scenario.get("dew_point"),
        "aqi": scenario.get("aqi"),
        "uv_index": scenario.get("uv_index"),

        # Future ML/context fields
        "advanced_features": clean_json_value(advanced_features),
        "location_context": clean_json_value(location_context),
        "shown_features": clean_json_value(shown_features),
        "hidden_features": clean_json_value(hidden_features),
        "required_context_missing": clean_json_value(required_context_missing),

        # Metadata for correct ML interpretation
        "scenario_mode": scenario_mode,
        "scenario_generation_method": scenario.get("scenario_generation_method", "random_scenario_v1"),
        "model_features_version": scenario.get("model_features_version", "scenario_v1"),
        "rating_question": "How good does this scenario sound?",
        "rating_scale_min": 1,
        "rating_scale_max": 10,
        "rating_target": "expected_enjoyment",
        "rater_confidence": rater_confidence,
        "rater_experience_level": rater_experience_level,
        "assume_safe_conditions": assume_safe_conditions,
    }

    row = clean_json_value(row)

    response = (
        supabase
        .table("scenario_ratings")
        .insert(row)
        .execute()
    )

    load_scenario_ratings.clear()

    return response

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


def get_default_location_for_activity(activity, defaults_df, saved_locations_df):
    """
    Returns the saved location row for an activity's default location.

    Returns None if no default exists.
    """

    if defaults_df is None or len(defaults_df) == 0:
        return None

    if saved_locations_df is None or len(saved_locations_df) == 0:
        return None

    matching_default = defaults_df[
        defaults_df["activity"] == activity
    ]

    if len(matching_default) == 0:
        return None

    saved_location_id = matching_default.iloc[0]["saved_location_id"]

    if pd.isna(saved_location_id):
        return None

    matching_location = saved_locations_df[
        saved_locations_df["id"].astype(str) == str(int(saved_location_id))
    ]

    if len(matching_location) == 0:
        return None

    return matching_location.iloc[0].to_dict()


def build_location_context_from_location(location):
    """
    Builds a JSON-safe location context dictionary.
    """

    if location is None:
        return {}

    return clean_json_value({
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
    })

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

# =========================
# General helper functions
# =========================
def show_accuracy_charts(activity_log):
    """
    Shows accuracy summaries and charts from the activity log.

    Requires these columns when available:
    - activity
    - logged_at
    - predicted_score
    - actual_score_0_to_100
    - prediction_error
    - absolute_error
    """

    if activity_log is None or len(activity_log) == 0:
        st.info("No activity logs available for accuracy charts yet.")
        return

    chart_log = activity_log.copy()

    required_columns = [
        "activity",
        "logged_at",
        "predicted_score",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
    ]

    missing_columns = [
        column for column in required_columns
        if column not in chart_log.columns
    ]

    if len(missing_columns) > 0:
        st.warning(
            "Accuracy charts cannot be shown because some required columns are missing."
        )
        st.write("Missing columns:")
        st.write(missing_columns)
        return

    numeric_columns = [
        "predicted_score",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
    ]

    for column in numeric_columns:
        chart_log[column] = pd.to_numeric(
            chart_log[column],
            errors="coerce",
        )

    chart_log["logged_at"] = pd.to_datetime(
        chart_log["logged_at"],
        errors="coerce",
    )

    chart_log = chart_log.dropna(
        subset=[
            "activity",
            "logged_at",
            "predicted_score",
            "actual_score_0_to_100",
            "prediction_error",
            "absolute_error",
        ]
    )

    if len(chart_log) == 0:
        st.info(
            "Not enough complete log data for accuracy charts yet. "
            "Logs need predicted and actual scores."
        )
        return

    # -------------------------
    # Accuracy summary
    # -------------------------

    st.subheader("Accuracy Summary by Activity")

    summary = (
        chart_log
        .groupby("activity", as_index=False)
        .agg(
            number_of_logs=("activity", "count"),
            average_error=("prediction_error", "mean"),
            average_absolute_error=("absolute_error", "mean"),
            average_predicted_score=("predicted_score", "mean"),
            average_actual_score=("actual_score_0_to_100", "mean"),
        )
    )

    summary["average_error"] = summary["average_error"].round(1)
    summary["average_absolute_error"] = summary["average_absolute_error"].round(1)
    summary["average_predicted_score"] = summary["average_predicted_score"].round(1)
    summary["average_actual_score"] = summary["average_actual_score"].round(1)

    summary = summary.sort_values(
        "average_absolute_error",
        ascending=True,
    )

    st.dataframe(
        summary,
        width="stretch",
    )

    # -------------------------
    # Average absolute error
    # -------------------------

    st.subheader("Accuracy Charts")

    st.write("### Average Absolute Error by Activity")
    st.write("Lower is better.")

    absolute_error_chart = summary.set_index("activity")[
        "average_absolute_error"
    ]

    st.bar_chart(absolute_error_chart)

    # -------------------------
    # Average error
    # -------------------------

    st.write("### Average Error by Activity")
    st.write(
        "Positive means the activity was better than predicted. "
        "Negative means it was worse than predicted."
    )

    average_error_chart = summary.set_index("activity")[
        "average_error"
    ]

    st.bar_chart(average_error_chart)

    # -------------------------
    # Predicted vs actual over time
    # -------------------------

    st.write("### Predicted vs. Actual Over Time")

    chart_activity_options = ["All"] + sorted(
        chart_log["activity"].dropna().unique().tolist()
    )

    selected_chart_activity = st.selectbox(
        "Choose activity for accuracy chart",
        options=chart_activity_options,
        key="accuracy_chart_activity_select",
    )

    if selected_chart_activity == "All":
        selected_chart_log = chart_log.copy()
    else:
        selected_chart_log = chart_log[
            chart_log["activity"] == selected_chart_activity
        ].copy()

    selected_chart_log = selected_chart_log.sort_values("logged_at")

    if len(selected_chart_log) == 0:
        st.info("No logs for this activity yet.")
        return

    predicted_vs_actual = selected_chart_log[
        [
            "logged_at",
            "predicted_score",
            "actual_score_0_to_100",
        ]
    ].copy()

    predicted_vs_actual = predicted_vs_actual.set_index("logged_at")

    st.line_chart(predicted_vs_actual)

    # -------------------------
    # Prediction error over time
    # -------------------------

    st.write("### Prediction Error Over Time")

    error_over_time = selected_chart_log[
        [
            "logged_at",
            "prediction_error",
        ]
    ].copy()

    error_over_time = error_over_time.set_index("logged_at")

    st.line_chart(error_over_time)

    # -------------------------
    # Helpful interpretation
    # -------------------------

    st.write(
        """
        **How to read these charts:**

        - **Average absolute error** shows how far off the predictions are on average.
        - **Average error** shows direction:
            - Positive = actual experience was better than predicted.
            - Negative = actual experience was worse than predicted.
        - Lower absolute error means the scoring model is more accurate.
        """
    )

def is_missing_scalar(value):
    """
    Safely checks whether a scalar value is missing.

    Avoids calling pd.isna() on lists/dicts, which causes ambiguity errors.
    """

    if value is None:
        return True

    if isinstance(value, (list, dict, tuple, set)):
        return False

    try:
        result = pd.isna(value)

        try:
            return bool(result)
        except Exception:
            return False

    except Exception:
        return False


def clean_json_value(value):
    """
    Converts values into JSON-safe values.

    Supabase JSONB cannot store:
    - NaN
    - Infinity
    - pandas NA/NaT
    - numpy scalar values
    """

    if value is None:
        return None

    if isinstance(value, dict):
        return {
            str(key): clean_json_value(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [
            clean_json_value(item)
            for item in value
        ]

    if isinstance(value, tuple):
        return [
            clean_json_value(item)
            for item in value
        ]

    if isinstance(value, set):
        return [
            clean_json_value(item)
            for item in value
        ]

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, datetime):
        return value.isoformat()

    # Convert numpy/pandas scalar types to Python scalar types
    if hasattr(value, "item"):
        try:
            return clean_json_value(value.item())
        except Exception:
            pass

    if is_missing_scalar(value):
        return None

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None

    # Final fallback for unusual non-JSON types
    if isinstance(value, (str, int, bool)):
        return value

    if isinstance(value, float):
        return value

    return str(value)


def dataframe_to_json_records(df):
    """
    Converts a DataFrame to JSON-safe records.
    """

    records = df.to_dict(orient="records")
    return clean_json_value(records)

def build_tuning_suggestions(activity_log):
    """
    Suggests model tuning changes based on actual logged conditions.
    """

    suggestions = []

    log = activity_log.copy()

    numeric_columns = [
        "prediction_error",
        "actual_bugs_1_to_10",
        "actual_wind_annoyance_1_to_10",
        "actual_humidity_comfort_1_to_10",
    ]

    for column in numeric_columns:
        if column in log.columns:
            log[column] = pd.to_numeric(log[column], errors="coerce")

    log = log.dropna(subset=["activity", "prediction_error"])

    if len(log) < 3:
        suggestions.append("Add more logs before tuning. Aim for at least 3–5 logs per activity.")
        return suggestions

    # Bugs hurting camping
    camping = log[log["activity"] == "Camping"]

    if len(camping) >= 3:
        buggy_bad = camping[
            (camping["actual_bugs_1_to_10"] >= 7) &
            (camping["prediction_error"] < -10)
        ]

        if len(buggy_bad) >= 2:
            suggestions.append(
                "Camping seems worse than predicted on buggy days. "
                "Consider increasing Camping bug sensitivity."
            )

    # Wind hurting kayaking
    kayaking = log[log["activity"] == "Kayaking"]

    if len(kayaking) >= 3:
        windy_bad = kayaking[
            (kayaking["actual_wind_annoyance_1_to_10"] >= 7) &
            (kayaking["prediction_error"] < -10)
        ]

        if len(windy_bad) >= 2:
            suggestions.append(
                "Kayaking seems worse than predicted when wind is annoying. "
                "Consider increasing Kayaking wind caution."
            )

    # Heat/humidity hurting running
    running = log[log["activity"] == "Running"]

    if len(running) >= 3:
        humid_bad = running[
            (running["actual_humidity_comfort_1_to_10"] <= 4) &
            (running["prediction_error"] < -10)
        ]

        if len(humid_bad) >= 2:
            suggestions.append(
                "Running seems worse than predicted when humidity comfort is low. "
                "Consider increasing Running heat sensitivity or adding more dew point penalty."
            )

    # Fishing underpredicted when fish activity high
    fishing_activities = [
        "Fishing",
        "Bass Fishing",
        "Trout Fishing",
        "Walleye Fishing",
        "Pike Fishing",
        "Panfish Fishing",
    ]

    fishing = log[log["activity"].isin(fishing_activities)]

    if len(fishing) >= 3 and "fish_activity" in fishing.columns:
        high_activity = fishing[
            (fishing["fish_activity"] == "High") &
            (fishing["prediction_error"] > 10)
        ]

        if len(high_activity) >= 2:
            suggestions.append(
                "Fishing is sometimes better than predicted when fish activity is high. "
                "Consider increasing fishing insect/activity importance or checking pressure/water temp logic."
            )

    if len(suggestions) == 0:
        suggestions.append("No strong tuning suggestions yet. Keep logging more activities.")

    return suggestions

FACTOR_METRIC_MAP = {
    "temperature": "temp_avg",
    "wind_speed": "wind_max",
    "wind_gust": "gust_max",
    "rain_chance": "precip_probability_max",
    "humidity": "humidity_avg",
    "cloud_cover": "cloud_avg",
    "pressure_change": "pressure_change",
    "bug_index": "bug_activity_index",
    "water_temp": "estimated_water_temp",
    "storm_safety": "storm_safety_score",
    "ground_dryness": "ground_dryness_score",
    "dew_point": "dew_point_max",
    "aqi": "aqi_max",
    "uv_index": "uv_index_max",
}


HARDCODED_ACTIVITIES = {
    "Fishing",
    "Camping",
    "Running",
    "Kayaking",
    "Disc Golf",
}

ACTIVITY_SCENARIO_FIELDS = {
    "Fishing": [
        "temperature",
        "wind_speed",
        "rain_chance",
        "pressure_change",
        "bug_index",
        "water_temp",
        "storm_safety",
    ],
    "Camping": [
        "temperature",
        "wind_speed",
        "wind_gust",
        "rain_chance",
        "humidity",
        "bug_index",
        "storm_safety",
    ],
    "Running": [
        "temperature",
        "wind_speed",
        "rain_chance",
        "dew_point",
        "aqi",
        "cloud_cover",
        "storm_safety",
    ],
    "Kayaking": [
        "temperature",
        "wind_speed",
        "wind_gust",
        "rain_chance",
        "water_temp",
        "storm_safety",
    ],
    "Disc Golf": [
        "temperature",
        "wind_speed",
        "rain_chance",
        "bug_index",
        "cloud_cover",
        "storm_safety",
    ],
    "Tennis": [
        "temperature",
        "wind_speed",
        "rain_chance",
        "cloud_cover",
        "storm_safety",
    ],
    "Beach Day": [
        "temperature",
        "wind_speed",
        "rain_chance",
        "cloud_cover",
        "water_temp",
        "uv_index",
        "storm_safety",
    ],
}


SCENARIO_RANGES = {
    "temperature": [25, 95],
    "wind_speed": [0, 25],
    "wind_gust": [0, 40],
    "rain_chance": [0, 100],
    "humidity": [25, 100],
    "cloud_cover": [0, 100],
    "pressure_change": [-12, 12],
    "bug_index": [0, 100],
    "water_temp": [35, 85],
    "storm_safety": [20, 100],
    "dew_point": [30, 75],
    "aqi": [0, 160],
    "uv_index": [0, 10],
}

SCENARIO_RANGES.update({
    "visibility": [0.5, 10],
    "wind_direction": [0, 359],
    "rain_amount": [0, 1.5],
    "recent_rain_24h": [0, 1.5],
    "recent_rain_72h": [0, 3.0],
    "overnight_low": [20, 75],
    "month": [1, 12],
    "daylight_hours": [8, 16],
    "moon_phase": [0, 1],
    "moon_illumination": [0, 100],
    "pollen_index": [0, 12],
    "river_flow_cfs": [50, 5000],
    "gauge_height": [1, 15],
    "flow_trend": [-3, 3],
    "wave_height_ft": [0, 8],
    "rip_current_risk": [0, 10],
    "fire_danger": [0, 10],
})

def season_from_month(month):
    """
    Converts month number into season.
    """

    try:
        month = int(month)
    except Exception:
        return "Unknown"

    if month in [12, 1, 2]:
        return "Winter"
    if month in [3, 4, 5]:
        return "Spring"
    if month in [6, 7, 8]:
        return "Summer"
    if month in [9, 10, 11]:
        return "Fall"

    return "Unknown"

def estimate_inland_water_chop(wind_speed, wind_gust, water_body_size, wind_exposure):
    """
    Estimates chop/roughness for inland ponds and lakes.

    Returns:
    - score 0-100, higher = calmer/better
    - label
    """

    try:
        wind_speed = float(wind_speed)
    except Exception:
        wind_speed = 0

    try:
        wind_gust = float(wind_gust)
    except Exception:
        wind_gust = wind_speed

    exposure_multiplier = {
        "Sheltered": 0.75,
        "Moderate": 1.0,
        "Open/exposed": 1.3,
        "Unknown": 1.0,
        "Not applicable": 1.0,
    }.get(wind_exposure, 1.0)

    size_multiplier = {
        "Pond": 0.75,
        "Small lake": 0.9,
        "Medium lake": 1.0,
        "Large lake": 1.25,
        "Great Lake": 1.6,
        "River": 0.9,
        "Unknown": 1.0,
        "Not applicable": 1.0,
    }.get(water_body_size, 1.0)

    effective_wind = max(wind_speed, wind_gust * 0.7)
    effective_wind = effective_wind * exposure_multiplier * size_multiplier

    if effective_wind < 8:
        return 95, "Calm/light chop"

    if effective_wind < 13:
        return 75, "Light to moderate chop"

    if effective_wind < 18:
        return 50, "Choppy"

    if effective_wind < 25:
        return 25, "Rough for paddling"

    return 5, "Potentially unsafe rough water"

def get_location_chop_summary(location, wind_speed, wind_gust):
    """
    Gets inland water chop summary for a saved location.
    """

    if location is None:
        return None

    water_body_size = location.get("water_body_size", "Unknown")
    wind_exposure = location.get("wind_exposure", "Unknown")

    if water_body_size in [None, "", "Not applicable"]:
        return None

    chop_score, chop_label = estimate_inland_water_chop(
        wind_speed=wind_speed,
        wind_gust=wind_gust,
        water_body_size=water_body_size,
        wind_exposure=wind_exposure,
    )

    return {
        "chop_score": chop_score,
        "chop_label": chop_label,
        "water_body_size": water_body_size,
        "wind_exposure": wind_exposure,
    }


def format_chop_summary(chop_summary):
    """
    Formats chop summary for display.
    """

    if not chop_summary:
        return None

    return (
        f"{chop_summary['chop_label']} "
        f"(score {chop_summary['chop_score']}, "
        f"{chop_summary['water_body_size']}, "
        f"{chop_summary['wind_exposure']})"
    )

def build_scenario_progress_table(scenario_ratings, goal_per_activity=25):
    """
    Builds progress toward scenario rating goals for each activity.
    """

    activity_list = sorted(ACTIVITY_SCENARIO_FIELDS.keys())

    if scenario_ratings is None or len(scenario_ratings) == 0:
        counts = pd.DataFrame(columns=["activity", "rating_count"])
    else:
        counts = (
            scenario_ratings
            .groupby("activity", as_index=False)
            .agg(rating_count=("rating", "count"))
        )

    rows = []

    for activity in activity_list:
        matching = counts[counts["activity"] == activity]

        if len(matching) > 0:
            rating_count = int(matching.iloc[0]["rating_count"])
        else:
            rating_count = 0

        progress = min(rating_count / goal_per_activity, 1)

        rows.append({
            "activity": activity,
            "rating_count": rating_count,
            "goal": goal_per_activity,
            "remaining": max(goal_per_activity - rating_count, 0),
            "progress": progress,
        })

    return pd.DataFrame(rows)

def generate_advanced_scenario_features():
    """
    Generates advanced optional features that we may not model yet.

    These are stored for future ML use.
    """

    month = int(round(random.uniform(1, 12)))

    advanced_features = {
        "visibility": round(random.uniform(0.5, 10), 1),
        "wind_direction": int(round(random.uniform(0, 359))),
        "rain_amount": round(random.uniform(0, 1.5), 2),
        "recent_rain_24h": round(random.uniform(0, 1.5), 2),
        "recent_rain_72h": round(random.uniform(0, 3.0), 2),
        "overnight_low": round(random.uniform(20, 75), 1),
        "month": month,
        "season": season_from_month(month),
        "daylight_hours": round(random.uniform(8, 16), 1),
        "moon_phase": round(random.uniform(0, 1), 2),
        "moon_illumination": int(round(random.uniform(0, 100))),
        "pollen_index": round(random.uniform(0, 12), 1),
        "river_flow_cfs": round(random.uniform(50, 5000), 0),
        "gauge_height": round(random.uniform(1, 15), 1),
        "flow_trend": round(random.uniform(-3, 3), 1),
        "wave_height_ft": round(random.uniform(0, 8), 1),
        "rip_current_risk": round(random.uniform(0, 10), 1),
        "fire_danger": round(random.uniform(0, 10), 1),
        "water_quality_alert": None,
    }

    return advanced_features


def build_location_context_for_scenario(activity=None):
    """
    Captures location context for scenario ratings.

    If an activity has a default saved location, use that.
    Otherwise, use current app location state.
    """

    try:
        if activity is not None:
            saved_locations = load_saved_locations()
            defaults = load_activity_location_defaults()

            default_location = get_default_location_for_activity(
                activity=activity,
                defaults_df=defaults,
                saved_locations_df=saved_locations,
            )

            if default_location is not None:
                return build_location_context_from_location(default_location)

    except Exception:
        pass

    return {
        "latitude": st.session_state.get("latitude"),
        "longitude": st.session_state.get("longitude"),
        "selected_saved_location_label": st.session_state.get("selected_saved_location_label"),
        "location_query": st.session_state.get("location_query"),
    }

def generate_random_scenario(activity):
    """
    Generates a random but reasonable scenario for one activity.

    It includes:
    - Core fields shown to the user
    - Advanced fields stored for future ML
    - Location context
    """

    fields = ACTIVITY_SCENARIO_FIELDS.get(activity, [])

    scenario = {
        "activity": activity,
    }

    for field in fields:
        low, high = SCENARIO_RANGES[field]

        if field in [
            "temperature",
            "wind_speed",
            "wind_gust",
            "water_temp",
            "dew_point",
            "pressure_change",
            "uv_index",
        ]:
            scenario[field] = round(random.uniform(low, high), 1)
        else:
            scenario[field] = int(round(random.uniform(low, high)))

    advanced_features = generate_advanced_scenario_features()

    # Store advanced fields both inside scenario and nested advanced_features.
    # This makes future modeling/export easier.
    for key, value in advanced_features.items():
        scenario[key] = value

    scenario["advanced_features"] = advanced_features
    scenario["location_context"] = build_location_context_for_scenario(activity)
    scenario["model_features_version"] = "scenario_v1"

    return scenario

def get_shown_features_for_scenario(activity, scenario_mode="basic"):
    """
    Returns the features shown to the rater for a scenario.

    Basic mode shows only activity-relevant core features.
    Advanced mode can show more features later.
    """

    base_features = ACTIVITY_SCENARIO_FIELDS.get(activity, [])

    if scenario_mode == "basic":
        return base_features

    if scenario_mode == "advanced":
        advanced_extra_features = [
            "visibility",
            "wind_direction",
            "rain_amount",
            "recent_rain_24h",
            "recent_rain_72h",
            "overnight_low",
            "month",
            "season",
            "daylight_hours",
            "moon_phase",
            "moon_illumination",
            "pollen_index",
            "river_flow_cfs",
            "gauge_height",
            "flow_trend",
            "wave_height_ft",
            "rip_current_risk",
            "fire_danger",
            "water_quality_alert",
        ]

        return list(dict.fromkeys(base_features + advanced_extra_features))

    return base_features


def get_hidden_features_for_scenario(scenario, shown_features):
    """
    Returns stored scenario keys that were not shown to the rater.
    """

    non_feature_keys = {
        "activity",
        "advanced_features",
        "location_context",
        "model_features_version",
    }

    hidden_features = []

    for key in scenario.keys():
        if key in non_feature_keys:
            continue

        if key not in shown_features:
            hidden_features.append(key)

    return hidden_features

def choose_historical_date(days_back_min=14, days_back_max=365):
    """
    Picks a random historical date.

    Starts at least 14 days back because archive data may lag slightly.
    """

    days_back = random.randint(days_back_min, days_back_max)

    historical_date = (
        pd.Timestamp.today()
        - pd.Timedelta(days=days_back)
    ).date()

    return historical_date.strftime("%Y-%m-%d")


def activity_hour_filter(activity, df):
    """
    Keeps realistic hours for the selected activity.
    """

    working_df = df.copy()
    working_df["hour"] = working_df["time"].dt.hour

    if activity == "Running":
        return working_df[
            (working_df["hour"] >= 6) &
            (working_df["hour"] <= 20)
        ]

    if activity in ["Fishing"]:
        return working_df[
            (working_df["hour"] >= 5) &
            (working_df["hour"] <= 22)
        ]

    if activity in ["Kayaking", "Beach Day", "Tennis", "Disc Golf"]:
        return working_df[
            (working_df["hour"] >= 8) &
            (working_df["hour"] <= 20)
        ]

    if activity == "Camping":
        return working_df[
            (working_df["hour"] >= 10) &
            (working_df["hour"] <= 18)
        ]

    return working_df[
        (working_df["hour"] >= 8) &
        (working_df["hour"] <= 20)
    ]


def estimate_historical_bug_index(temp, humidity, wind, rain):
    """
    Estimates bug activity for a historical scenario.
    """

    score = 0

    if temp < 50:
        score += 10
    elif temp < 60:
        score += 25
    elif temp <= 75:
        score += 50
    elif temp <= 88:
        score += 65
    else:
        score += 45

    if humidity >= 80:
        score += 20
    elif humidity >= 65:
        score += 12
    elif humidity >= 50:
        score += 5

    if wind < 4:
        score += 15
    elif wind < 8:
        score += 8
    elif wind > 15:
        score -= 10

    if rain >= 0.05:
        score += 6

    return clamp_score(score)


def historical_row_to_scenario(activity, historical_row):
    """
    Converts one historical hourly weather row into a scenario.
    """

    temp = historical_row.get("temperature_2m")
    humidity = historical_row.get("relative_humidity_2m")
    dew_point = historical_row.get("dew_point_2m")
    rain_amount = historical_row.get("precipitation")
    cloud_cover = historical_row.get("cloud_cover")
    wind_speed = historical_row.get("wind_speed_10m")
    wind_gust = historical_row.get("wind_gusts_10m")
    wind_direction = historical_row.get("wind_direction_10m")
    pressure = historical_row.get("pressure_msl")

    if pd.isna(rain_amount):
        rain_amount = 0

    bug_index = estimate_historical_bug_index(
        temp=temp if pd.notna(temp) else 60,
        humidity=humidity if pd.notna(humidity) else 60,
        wind=wind_speed if pd.notna(wind_speed) else 5,
        rain=rain_amount,
    )

    month = pd.to_datetime(historical_row["time"]).month

    advanced_features = generate_advanced_scenario_features()

    advanced_features.update({
        "visibility": None,
        "wind_direction": None if pd.isna(wind_direction) else float(wind_direction),
        "rain_amount": None if pd.isna(rain_amount) else float(rain_amount),
        "month": month,
        "season": season_from_month(month),
    })

    scenario = {
        "activity": activity,
        "temperature": None if pd.isna(temp) else round(float(temp), 1),
        "wind_speed": None if pd.isna(wind_speed) else round(float(wind_speed), 1),
        "wind_gust": None if pd.isna(wind_gust) else round(float(wind_gust), 1),
        "rain_chance": None,
        "humidity": None if pd.isna(humidity) else round(float(humidity)),
        "cloud_cover": None if pd.isna(cloud_cover) else round(float(cloud_cover)),
        "pressure_change": 0,
        "bug_index": round(bug_index),
        "water_temp": None,
        "storm_safety": 90,
        "dew_point": None if pd.isna(dew_point) else round(float(dew_point), 1),
        "aqi": None,
        "uv_index": None,
    }

    for key, value in advanced_features.items():
        scenario[key] = value

    scenario["advanced_features"] = advanced_features
    scenario["location_context"] = build_location_context_for_scenario(activity)
    scenario["model_features_version"] = "historical_scenario_v1"
    scenario["historical_time"] = str(historical_row["time"])

    return scenario


def generate_historical_scenario(activity, latitude, longitude):
    """
    Generates a scenario from real historical weather.
    """

    historical_date = choose_historical_date()

    historical_weather = fetch_historical_weather(
        latitude=latitude,
        longitude=longitude,
        start_date=historical_date,
        end_date=historical_date,
    )

    filtered_weather = activity_hour_filter(
        activity,
        historical_weather,
    )

    if len(filtered_weather) == 0:
        filtered_weather = historical_weather

    selected_row = filtered_weather.sample(1).iloc[0]

    scenario = historical_row_to_scenario(
        activity,
        selected_row,
    )

    scenario["scenario_generation_method"] = "historical_weather_v1"
    scenario["historical_date"] = historical_date

    return scenario

def get_required_context_missing(activity, scenario):
    """
    Identifies important context that might be missing for interpreting ratings.
    """

    missing = []

    if activity in ["Fishing", "Kayaking", "Beach Day"]:
        if scenario.get("water_temp") is None:
            missing.append("water_temp")

    if activity == "Kayaking":
        if scenario.get("river_flow_cfs") is None and scenario.get("wave_height_ft") is None:
            missing.append("river_or_wave_context")

    if activity == "Beach Day":
        if scenario.get("wave_height_ft") is None:
            missing.append("wave_height")

        if scenario.get("rip_current_risk") is None:
            missing.append("rip_current_risk")

    if activity == "Tennis":
        if scenario.get("recent_rain_24h") is None:
            missing.append("recent_rain_or_court_wetness")

    if activity == "Camping":
        if scenario.get("overnight_low") is None:
            missing.append("overnight_low")

    return missing

def prepare_scenario_ratings_for_insights(scenario_ratings):
    """
    Cleans scenario ratings for insight reporting.
    """

    df = scenario_ratings.copy()

    numeric_columns = [
        "rating",
        "rating_0_to_100",
        "rater_confidence",
        "temperature",
        "wind_speed",
        "wind_gust",
        "rain_chance",
        "humidity",
        "cloud_cover",
        "pressure_change",
        "bug_index",
        "water_temp",
        "storm_safety",
        "dew_point",
        "aqi",
        "uv_index",
    ]

    for column in numeric_columns:
        if column in df.columns:
            df[column] = pd.to_numeric(
                df[column],
                errors="coerce",
            )

    if "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(
            df["created_at"],
            errors="coerce",
        )

    return df


def build_scenario_activity_summary(scenario_ratings):
    """
    Builds summary stats by activity.
    Handles missing rater_confidence safely.
    """

    df = prepare_scenario_ratings_for_insights(scenario_ratings)

    if len(df) == 0:
        return pd.DataFrame()

    if "rater_confidence" not in df.columns:
        df["rater_confidence"] = pd.NA

    summary = (
        df
        .groupby("activity", as_index=False)
        .agg(
            ratings=("rating", "count"),
            average_rating=("rating", "mean"),
            median_rating=("rating", "median"),
            average_confidence=("rater_confidence", "mean"),
        )
    )

    summary["average_rating"] = summary["average_rating"].round(1)
    summary["median_rating"] = summary["median_rating"].round(1)
    summary["average_confidence"] = summary["average_confidence"].round(1)

    summary = summary.sort_values(
        ["ratings", "average_rating"],
        ascending=[False, False],
    )

    return summary


def describe_scenario_row(row):
    """
    Creates a short readable scenario description.
    """

    parts = []

    field_labels = {
        "temperature": "temp",
        "wind_speed": "wind",
        "wind_gust": "gust",
        "rain_chance": "rain",
        "humidity": "humidity",
        "cloud_cover": "clouds",
        "pressure_change": "pressure Δ",
        "bug_index": "bugs",
        "water_temp": "water",
        "storm_safety": "storm safety",
        "dew_point": "dew point",
        "aqi": "AQI",
        "uv_index": "UV",
    }

    for field, label in field_labels.items():
        if field in row and pd.notna(row[field]):
            value = row[field]

            if field in ["temperature", "water_temp", "dew_point"]:
                parts.append(f"{label} {value:.0f}°F")
            elif field in ["wind_speed", "wind_gust"]:
                parts.append(f"{label} {value:.0f} mph")
            elif field == "rain_chance":
                parts.append(f"{label} {value:.0f}%")
            else:
                parts.append(f"{label} {value:.0f}")

    return ", ".join(parts)

def get_rule_number(rule, column_name, default=None):
    """
    Safely gets a numeric value from a rule row.
    """

    value = rule.get(column_name, default)

    try:
        if pd.isna(value):
            return default
    except Exception:
        pass

    try:
        return float(value)
    except Exception:
        return default


def high_is_good_score(value, ideal_min, bad_at):
    """
    Scores something where higher is better.

    Example:
    storm safety:
    85+ is good.
    40 or lower is bad.
    """

    if pd.isna(value):
        return 50

    if value >= ideal_min:
        return 100

    if value <= bad_at:
        return 0

    return 100 * (value - bad_at) / (ideal_min - bad_at)


def score_value_from_rule(value, rule):
    """
    Scores one weather/environment value using one baseline rule.
    """

    direction = str(rule.get("direction", "")).lower()

    ideal_low = get_rule_number(rule, "ideal_low")
    ideal_high = get_rule_number(rule, "ideal_high")
    okay_low = get_rule_number(rule, "okay_low")
    okay_high = get_rule_number(rule, "okay_high")
    bad_low = get_rule_number(rule, "bad_low")
    bad_high = get_rule_number(rule, "bad_high")

    if pd.isna(value):
        return 50

    if direction == "range":
        if ideal_low is None or ideal_high is None:
            return 50

        absolute_low = okay_low if okay_low is not None else ideal_low - 20
        absolute_high = okay_high if okay_high is not None else ideal_high + 20

        return range_score(
            value=value,
            ideal_low=ideal_low,
            ideal_high=ideal_high,
            absolute_low=absolute_low,
            absolute_high=absolute_high,
        )

    if direction == "low":
        ideal_max = ideal_high if ideal_high is not None else ideal_low

        if ideal_max is None:
            return 50

        bad_at = bad_low if bad_low is not None else okay_high

        if bad_at is None:
            bad_at = ideal_max + 20

        return low_is_good_score(
            value=value,
            ideal_max=ideal_max,
            bad_at=bad_at,
        )

    if direction == "high":
        ideal_min = ideal_low if ideal_low is not None else ideal_high

        if ideal_min is None:
            return 50

        bad_at = bad_high if bad_high is not None else okay_low

        if bad_at is None:
            bad_at = ideal_min - 20

        return high_is_good_score(
            value=value,
            ideal_min=ideal_min,
            bad_at=bad_at,
        )

    return 50


def score_hobby_from_rules(day_row, hobby_name, hobby_rules):
    """
    Dynamically scores a hobby using baseline_hobby_rules from Supabase.
    """

    if hobby_rules is None or len(hobby_rules) == 0:
        return 50, f"No baseline rules found for {hobby_name}."

    weighted_score = 0
    total_weight = 0
    factor_details = []

    for _, rule in hobby_rules.iterrows():
        factor = rule.get("factor")

        metric = FACTOR_METRIC_MAP.get(factor)

        if metric is None:
            continue

        if metric not in day_row:
            continue

        value = day_row[metric]

        factor_score = score_value_from_rule(value, rule)

        weight = get_rule_number(rule, "weight", default=1)

        if weight is None:
            weight = 1

        weighted_score += factor_score * weight
        total_weight += weight

        factor_details.append({
            "factor": factor,
            "metric": metric,
            "value": value,
            "score": factor_score,
            "weight": weight,
            "confidence": rule.get("confidence", ""),
            "notes": rule.get("notes", ""),
        })

    if total_weight == 0:
        return 50, f"No usable scoring rules found for {hobby_name}."

    final_score = round(clamp_score(weighted_score / total_weight))

    weak_factors = sorted(
        factor_details,
        key=lambda item: item["score"],
    )[:2]

    strong_factors = sorted(
        factor_details,
        key=lambda item: item["score"],
        reverse=True,
    )[:2]

    explanation_parts = []

    if len(strong_factors) > 0:
        strong_text = ", ".join(
            f"{item['factor']} scored {item['score']:.0f}"
            for item in strong_factors
        )

        explanation_parts.append(f"strongest factors: {strong_text}")

    if len(weak_factors) > 0:
        weak_text = ", ".join(
            f"{item['factor']} scored {item['score']:.0f}"
            for item in weak_factors
        )

        explanation_parts.append(f"weakest factors: {weak_text}")

    explanation = (
        f"{hobby_name} score is based on source-backed baseline rules. "
        + "; ".join(explanation_parts)
        + "."
    )

    return final_score, explanation

def build_accuracy_report(activity_log):
    """
    Builds text insights about model accuracy.
    """

    report_log = activity_log.copy()

    numeric_columns = [
        "predicted_score",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
    ]

    for column in numeric_columns:
        report_log[column] = pd.to_numeric(
            report_log[column],
            errors="coerce",
        )

    report_log = report_log.dropna(
        subset=[
            "activity",
            "predicted_score",
            "actual_score_0_to_100",
            "prediction_error",
            "absolute_error",
        ]
    )

    if len(report_log) == 0:
        return pd.DataFrame(), []

    summary = (
        report_log
        .groupby("activity", as_index=False)
        .agg(
            logs=("activity", "count"),
            average_error=("prediction_error", "mean"),
            average_absolute_error=("absolute_error", "mean"),
        )
    )

    summary["average_error"] = summary["average_error"].round(1)
    summary["average_absolute_error"] = summary["average_absolute_error"].round(1)

    insights = []

    most_accurate = summary.sort_values("average_absolute_error").iloc[0]
    insights.append(
        f"Most accurate activity so far: {most_accurate['activity']} "
        f"with average absolute error {most_accurate['average_absolute_error']}."
    )

    least_accurate = summary.sort_values("average_absolute_error", ascending=False).iloc[0]
    insights.append(
        f"Least accurate activity so far: {least_accurate['activity']} "
        f"with average absolute error {least_accurate['average_absolute_error']}."
    )

    overpredicted = summary.sort_values("average_error").iloc[0]

    if overpredicted["average_error"] < -5:
        insights.append(
            f"The model may be overrating {overpredicted['activity']} "
            f"by about {abs(overpredicted['average_error'])} points."
        )

    underpredicted = summary.sort_values("average_error", ascending=False).iloc[0]

    if underpredicted["average_error"] > 5:
        insights.append(
            f"The model may be underrating {underpredicted['activity']} "
            f"by about {underpredicted['average_error']} points."
        )

    return summary, insights

def get_json_with_retries(url, params, timeout=10, retries=2, backoff_seconds=1):
    """
    Gets JSON from an API with simple retries.

    This helps avoid crashes from temporary connection resets.
    """

    last_error = None

    for attempt in range(retries + 1):
        try:
            response = requests.get(
                url,
                params=params,
                timeout=timeout,
            )

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            last_error = e

            if attempt < retries:
                time.sleep(backoff_seconds * (attempt + 1))
            else:
                raise last_error
            
def get_weekend_predictions(predictions):
    """
    Returns predictions for Saturday and Sunday.
    """

    weekend = predictions.copy()
    weekend["date_dt"] = pd.to_datetime(weekend["date"])
    weekend["weekday"] = weekend["date_dt"].dt.day_name()

    weekend = weekend[
        weekend["weekday"].isin(["Saturday", "Sunday"])
    ].copy()

    return weekend


def escape_ics_text(text):
    """
    Escapes text for .ics calendar format.
    """

    if text is None:
        return ""

    text = str(text)
    text = text.replace("\\", "\\\\")
    text = text.replace(",", "\\,")
    text = text.replace(";", "\\;")
    text = text.replace("\n", "\\n")

    return text


def parse_time_window_for_calendar(date_string, window_string):
    """
    Converts a date and window like '6:00 PM–8:00 PM'
    into start/end datetime objects.

    If the window cannot be parsed, returns a default 1-hour midday event.
    """

    try:
        date_dt = pd.to_datetime(date_string).date()
    except Exception:
        date_dt = datetime.today().date()

    def default_window():
        start_dt = datetime.combine(
            date_dt,
            datetime.strptime("12:00 PM", "%I:%M %p").time(),
        )
        end_dt = start_dt + timedelta(hours=1)
        return start_dt, end_dt

    # Handle missing, NaN, None, non-string windows
    if window_string is None:
        return default_window()

    try:
        if pd.isna(window_string):
            return default_window()
    except Exception:
        pass

    if not isinstance(window_string, str):
        return default_window()

    window_string = window_string.strip()

    if window_string == "":
        return default_window()

    lower_window = window_string.lower()

    if (
        "not available" in lower_window
        or "full-day" in lower_window
        or "full day" in lower_window
        or "n/a" in lower_window
        or "none" == lower_window
    ):
        return default_window()

    # Normalize dash types
    window_string = (
        window_string
        .replace("—", "–")
        .replace("-", "–")
    )

    parts = [part.strip() for part in window_string.split("–")]

    if len(parts) != 2:
        return default_window()

    start_text = parts[0]
    end_text = parts[1]

    possible_formats = [
        "%I:%M %p",
        "%I %p",
        "%H:%M",
    ]

    def parse_time_text(time_text):
        for fmt in possible_formats:
            try:
                return datetime.strptime(time_text, fmt).time()
            except Exception:
                continue

        return None

    start_time = parse_time_text(start_text)
    end_time = parse_time_text(end_text)

    if start_time is None or end_time is None:
        return default_window()

    start_dt = datetime.combine(date_dt, start_time)
    end_dt = datetime.combine(date_dt, end_time)

    # If the window crosses midnight, move end time to the next day
    if end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)

    return start_dt, end_dt


def format_ics_datetime(dt):
    """
    Formats datetime for .ics as floating local time.
    Calendar apps will interpret it in the user's local timezone.
    """

    return dt.strftime("%Y%m%dT%H%M%S")


def create_calendar_event_ics(
    title,
    start_dt,
    end_dt,
    description,
    location="",
):
    """
    Creates an .ics calendar event string.
    """

    now_stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    uid = f"{now_stamp}-{abs(hash(title + str(start_dt)))}@hobby-weather-app"

    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Hobby Weather Planner//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:{uid}
DTSTAMP:{now_stamp}
DTSTART:{format_ics_datetime(start_dt)}
DTEND:{format_ics_datetime(end_dt)}
SUMMARY:{escape_ics_text(title)}
DESCRIPTION:{escape_ics_text(description)}
LOCATION:{escape_ics_text(location)}
END:VEVENT
END:VCALENDAR
"""

    return ics_content


def clean_filename(text):
    """
    Creates a safe filename.
    """

    text = str(text).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")

    return text

def get_json_with_retries(url, params, timeout=12, retries=2, backoff_seconds=1):
    """
    Gets JSON from an API with simple retries.

    Helps avoid crashes from temporary timeouts, 504 errors,
    connection resets, or other temporary API problems.
    """

    last_error = None

    for attempt in range(retries + 1):
        try:
            response = requests.get(
                url,
                params=params,
                timeout=timeout,
            )

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            last_error = e

            if attempt < retries:
                time.sleep(backoff_seconds * (attempt + 1))
            else:
                raise last_error            

@st.cache_resource
def get_supabase_client():
    """
    Connects to Supabase using Streamlit secrets.
    """

    supabase_url = st.secrets["SUPABASE_URL"]
    supabase_key = st.secrets["SUPABASE_KEY"]

    return create_client(supabase_url, supabase_key)

def make_forecast_cache_key(latitude, longitude, forecast_days, manual_water_temp, preferences, include_air_quality):
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
        f"{preferences_key}"
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

def clamp_score(score):
    return max(0, min(100, score))

def forecast_lead_time_score(date_value):
    """
    Scores forecast reliability based mostly on how far away the date is.

    Higher = more confidence.
    """

    try:
        forecast_date = pd.to_datetime(date_value).date()
        today = pd.Timestamp.today().date()
        days_out = (forecast_date - today).days
    except Exception:
        return 50

    if days_out <= 0:
        return 95
    if days_out == 1:
        return 90
    if days_out == 2:
        return 82
    if days_out == 3:
        return 74
    if days_out == 4:
        return 65
    if days_out == 5:
        return 58
    if days_out == 6:
        return 52
    if days_out == 7:
        return 47

    return 40


def weather_complexity_confidence(row):
    """
    Scores how stable/simple the forecast looks.

    Higher = simpler/more reliable planning conditions.
    Lower = more conditional/uncertain weather.
    """

    score = 100

    rain_chance = row.get("rain_chance", 0)
    wind_max = row.get("wind_max", 0)
    gust_max = row.get("gust_max", 0)
    storm_risk = row.get("storm_risk", "")

    try:
        rain_chance = float(rain_chance)
    except Exception:
        rain_chance = 0

    try:
        wind_max = float(wind_max)
    except Exception:
        wind_max = 0

    try:
        gust_max = float(gust_max)
    except Exception:
        gust_max = 0

    # Mid-range precipitation forecasts are often uncertain.
    if 30 <= rain_chance <= 70:
        score -= 15
    elif rain_chance > 70:
        score -= 10

    # Windy/gusty setups can change activity suitability quickly.
    if wind_max >= 18:
        score -= 10

    if gust_max >= 25:
        score -= 10

    # Storm-risk days are harder to plan around.
    if isinstance(storm_risk, str):
        if storm_risk not in ["Low storm risk", "", "nan", "None"]:
            score -= 20

    return clamp_score(score)


def forecast_confidence_label(score):
    """
    Converts forecast confidence score into a planning label.
    """

    if score >= 85:
        return "High confidence"
    if score >= 70:
        return "Solid"
    if score >= 55:
        return "Watch closely"
    if score >= 40:
        return "Uncertain"
    return "Very uncertain"


def add_forecast_confidence(predictions):
    """
    Adds forecast confidence and confidence-adjusted planning score.
    """

    df = predictions.copy()

    confidence_scores = []

    for _, row in df.iterrows():
        lead_score = forecast_lead_time_score(row["date"])
        complexity_score = weather_complexity_confidence(row)

        confidence = round(
            clamp_score(
                (lead_score * 0.75) +
                (complexity_score * 0.25)
            )
        )

        confidence_scores.append(confidence)

    df["forecast_confidence"] = confidence_scores
    df["forecast_confidence_label"] = df["forecast_confidence"].apply(
        forecast_confidence_label
    )

    # Planning score blends activity quality with forecast confidence.
    # This avoids overcommitting to a great-looking forecast far in the future.
    df["planning_score"] = (
        df["predicted_score"] * 0.80 +
        df["forecast_confidence"] * 0.20
    ).round(0).astype(int)

    return df

ACTIVITY_ICONS = {
    "Fishing": "🎣",
    "Camping": "⛺",
    "Running": "🏃",
    "Kayaking": "🛶",
    "Disc Golf": "🥏",
    "Tennis": "🎾",
    "Beach Day": "🏖️",
}

PLAN_STATUSES = [
    "Planned",
    "Maybe",
    "Completed",
    "Canceled",
]

WATER_BODY_SIZE_OPTIONS = [
    "Not applicable",
    "Pond",
    "Small lake",
    "Medium lake",
    "Large lake",
    "Great Lake",
    "River",
    "Unknown",
]


WIND_EXPOSURE_OPTIONS = [
    "Not applicable",
    "Sheltered",
    "Moderate",
    "Open/exposed",
    "Unknown",
]

def activity_label(activity):
    """
    Returns activity name with icon.
    """

    return f"{ACTIVITY_ICONS.get(activity, '⭐')} {activity}"

def safe_value(value, default=0):
    if pd.isna(value):
        return default
    return value


def range_score(value, ideal_low, ideal_high, absolute_low, absolute_high):
    """
    Scores something where a middle range is best.
    """

    if pd.isna(value):
        return 50

    if value <= absolute_low or value >= absolute_high:
        return 0

    if ideal_low <= value <= ideal_high:
        return 100

    if absolute_low < value < ideal_low:
        return 100 * (value - absolute_low) / (ideal_low - absolute_low)

    if ideal_high < value < absolute_high:
        return 100 * (absolute_high - value) / (absolute_high - ideal_high)

    return 0


def low_is_good_score(value, ideal_max, bad_at):
    """
    Scores something where lower is better.
    """

    if pd.isna(value):
        return 50

    if value <= ideal_max:
        return 100

    if value >= bad_at:
        return 0

    return 100 * (bad_at - value) / (bad_at - ideal_max)


def score_label(score):
    if score >= 80:
        return "Great"
    if score >= 60:
        return "Good"
    if score >= 40:
        return "Okay"
    return "Poor"

def score_color(score):
    """
    Returns a color name based on score.
    """

    if score >= 80:
        return "green"
    if score >= 60:
        return "orange"
    if score >= 40:
        return "red"
    return "gray"


def score_badge_html(score, label=None):
    """
    Creates a simple colored score badge.
    """

    color_map = {
        "green": "#1f8f4d",
        "orange": "#d9822b",
        "red": "#c0392b",
        "gray": "#6c757d",
    }

    color = color_map[score_color(score)]

    if label is None:
        label = score_label(score)

    return f"""
    <span style="
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background-color: {color};
        color: white;
        font-weight: 700;
        font-size: 0.9rem;
    ">
        {score} · {label}
    </span>
    """


def get_best_activity_for_date(predictions, forecast_date):
    """
    Returns the highest scoring activity for one date.
    """

    day_predictions = predictions[
        predictions["date"] == forecast_date
    ].copy()

    if len(day_predictions) == 0:
        return None

    best_index = day_predictions["predicted_score"].idxmax()

    return day_predictions.loc[best_index]


def build_best_by_day_table(predictions, time_recommendations):
    """
    Builds a simple table showing the best activity for each date.
    """

    rows = []

    for forecast_date in sorted(predictions["date"].unique()):
        best_row = get_best_activity_for_date(predictions, forecast_date)

        if best_row is None:
            continue

        recommended_window, window_score = get_recommended_window_for_activity(
            time_recommendations=time_recommendations,
            selected_date=forecast_date,
            selected_activity=best_row["activity"],
        )

        rows.append({
            "Date": forecast_date,
            "Best Activity": best_row["activity"],
            "Score": best_row["predicted_score"],
            "Label": best_row["label"],
            "Recommended Window": recommended_window,
            "Weather Snapshot": (
                f"{best_row.get('avg_temp', 'N/A')}°F, "
                f"wind {best_row.get('wind_max', 'N/A')} mph, "
                f"rain {best_row.get('rain_chance', 'N/A')}%"
            ),
        })

    return pd.DataFrame(rows)


def get_top_activities_for_date(predictions, forecast_date, n=3):
    """
    Returns top N activities for a date.

    Uses planning_score if available, otherwise predicted_score.
    """

    day_predictions = predictions[
        predictions["date"] == forecast_date
    ].copy()

    sort_column = "planning_score" if "planning_score" in day_predictions.columns else "predicted_score"

    return day_predictions.sort_values(
        sort_column,
        ascending=False,
    ).head(n)


def dashboard_warning_text(row):
    """
    Creates simple warning text based on weather fields.
    """

    warnings = []

    rain_chance = row.get("rain_chance", 0)
    wind_max = row.get("wind_max", 0)
    bug_index = row.get("bug_index", 0)
    storm_risk = row.get("storm_risk", "")

    if rain_chance >= 60:
        warnings.append("Rain risk")

    if wind_max >= 18:
        warnings.append("Windy")

    if bug_index >= 65:
        warnings.append("Buggy")

    if isinstance(storm_risk, str) and storm_risk not in ["Low storm risk", ""]:
        warnings.append(storm_risk)

    if len(warnings) == 0:
        return "No major warnings."

    return " • ".join(warnings)
# =========================
# Weather fetching
# =========================

@st.cache_data(ttl=86400)
def fetch_historical_weather(latitude, longitude, start_date, end_date):
    """
    Fetches historical hourly weather from Open-Meteo Archive API.
    """

    hourly_variables = [
        "temperature_2m",
        "relative_humidity_2m",
        "dew_point_2m",
        "precipitation",
        "rain",
        "cloud_cover",
        "wind_speed_10m",
        "wind_gusts_10m",
        "wind_direction_10m",
        "pressure_msl",
    ]

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ",".join(hourly_variables),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "auto",
    }

    data = get_json_with_retries(
        ARCHIVE_URL,
        params=params,
        timeout=15,
        retries=2,
    )

    df = pd.DataFrame(data["hourly"])
    df["time"] = pd.to_datetime(df["time"])

    return df

@st.cache_data(ttl=7200)
def fetch_weather_forecast(latitude, longitude, days):
    """
    Gets hourly weather forecast data from Open-Meteo.
    """

    hourly_variables = [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation_probability",
        "precipitation",
        "wind_speed_10m",
        "wind_gusts_10m",
        "cloud_cover",
        "pressure_msl",
        "weather_code",
        "apparent_temperature",
        "dew_point_2m",
    ]

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(hourly_variables),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "forecast_days": days,
        "timezone": "auto",
    }

    data = get_json_with_retries(
        FORECAST_URL,
        params=params,
        timeout=12,
        retries=2,
    )

    df = pd.DataFrame(data["hourly"])
    df["time"] = pd.to_datetime(df["time"])

    return df


@st.cache_data(ttl=7200)
def fetch_air_quality_forecast(latitude, longitude, days):
    """
    Gets air quality and UV data from Open-Meteo Air Quality API.

    If the API fails, returns an empty dataframe so the app can use defaults.
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "us_aqi,uv_index",
        "forecast_days": days,
        "timezone": "auto",
    }

    try:
        data = get_json_with_retries(
            AIR_QUALITY_URL,
            params=params,
            timeout=6,
            retries=1,
        )

        df = pd.DataFrame(data["hourly"])
        df["time"] = pd.to_datetime(df["time"])

        return df

    except Exception:
        return pd.DataFrame(
            columns=[
                "time",
                "us_aqi",
                "uv_index",
            ]
        )

@st.cache_data(ttl=7200)
def fetch_sun_times(latitude, longitude, days):
    """
    Gets sunrise and sunset times from Open-Meteo.
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": "sunrise,sunset",
        "forecast_days": days,
        "timezone": "auto",
    }

    data = get_json_with_retries(
        FORECAST_URL,
        params=params,
        timeout=10,
        retries=2,
    )

    sun_df = pd.DataFrame(data["daily"])

    sun_df["date"] = pd.to_datetime(sun_df["time"]).dt.date
    sun_df["sunrise"] = pd.to_datetime(sun_df["sunrise"])
    sun_df["sunset"] = pd.to_datetime(sun_df["sunset"])

    return sun_df[["date", "sunrise", "sunset"]]
# =========================
# Daily weather aggregation
# =========================

def aggregate_weather_by_day(hourly_df):
    """
    Converts hourly weather into daily weather.
    """

    df = hourly_df.copy()

    df["date"] = df["time"].dt.date
    df["hour"] = df["time"].dt.hour

    daytime = df[(df["hour"] >= 6) & (df["hour"] <= 21)].copy()

    thunderstorm_codes = [95, 96, 99]
    heavy_precip_codes = [80, 81, 82]
    severe_weather_codes = thunderstorm_codes + heavy_precip_codes

    daytime_daily = (
        daytime
        .groupby("date")
        .agg(
            temp_avg=("temperature_2m", "mean"),
            humidity_avg=("relative_humidity_2m", "mean"),
            precip_probability_max=("precipitation_probability", "max"),
            wind_avg=("wind_speed_10m", "mean"),
            wind_max=("wind_speed_10m", "max"),
            gust_max=("wind_gusts_10m", "max"),
            cloud_avg=("cloud_cover", "mean"),
            pressure_avg=("pressure_msl", "mean"),
            pressure_start=("pressure_msl", "first"),
            pressure_end=("pressure_msl", "last"),
            apparent_temp_avg=("apparent_temperature", "mean"),
            apparent_temp_max=("apparent_temperature", "max"),
            dew_point_max=("dew_point_2m", "max"),
            thunderstorm_hours=("weather_code", lambda s: s.isin(thunderstorm_codes).sum()),
            severe_weather_hours=("weather_code", lambda s: s.isin(severe_weather_codes).sum()),
        )
        .reset_index()
    )

    full_day_daily = (
        df
        .groupby("date")
        .agg(
            temp_min=("temperature_2m", "min"),
            temp_max=("temperature_2m", "max"),
            precip_total=("precipitation", "sum"),
        )
        .reset_index()
    )

    daily = pd.merge(daytime_daily, full_day_daily, on="date", how="left")

    daily["precip_total"] = daily["precip_total"].fillna(0)
    daily["pressure_change"] = daily["pressure_end"] - daily["pressure_start"]

    return daily


def add_air_quality_by_day(daily_df, air_quality_df):
    """
    Adds daily AQI and UV values.
    """

    daily = daily_df.copy()

    if air_quality_df is None or len(air_quality_df) == 0:
        daily["aqi_max"] = 50
        daily["uv_index_max"] = 5
        return daily

    aq = air_quality_df.copy()
    aq["date"] = aq["time"].dt.date
    aq["hour"] = aq["time"].dt.hour

    daytime = aq[(aq["hour"] >= 6) & (aq["hour"] <= 21)].copy()

    aq_daily = (
        daytime
        .groupby("date")
        .agg(
            aqi_max=("us_aqi", "max"),
            uv_index_max=("uv_index", "max"),
        )
        .reset_index()
    )

    daily = daily.merge(aq_daily, on="date", how="left")

    daily["aqi_max"] = daily["aqi_max"].fillna(50)
    daily["uv_index_max"] = daily["uv_index_max"].fillna(5)

    return daily


# =========================
# Feature calculations
# =========================

def calculate_bug_activity_index(row):
    """
    Higher score = more bugs.
    """

    temp = safe_value(row["temp_avg"], 60)
    humidity = safe_value(row["humidity_avg"], 50)
    wind = safe_value(row["wind_avg"], 5)
    rain = safe_value(row["precip_total"], 0)

    score = 0

    if temp < 50:
        score += 10
    elif temp < 60:
        score += 25
    elif temp <= 75:
        score += 50
    elif temp <= 88:
        score += 65
    else:
        score += 45

    if humidity >= 80:
        score += 20
    elif humidity >= 65:
        score += 12
    elif humidity >= 50:
        score += 5

    if wind < 4:
        score += 15
    elif wind < 8:
        score += 8
    elif wind > 15:
        score -= 10

    if rain >= 0.25:
        score += 12
    elif rain >= 0.05:
        score += 6

    return clamp_score(score)


def add_sunny_streak(daily_df):
    """
    Adds sunny streak days.
    """

    daily = daily_df.copy()
    daily = daily.sort_values("date").reset_index(drop=True)

    streaks = []
    streak = 0

    for _, row in daily.iterrows():
        cloud = safe_value(row["cloud_avg"], 100)
        rain_chance = safe_value(row["precip_probability_max"], 100)
        rain_total = safe_value(row["precip_total"], 0)

        mostly_sunny_and_dry = (
            cloud <= 35 and
            rain_chance <= 20 and
            rain_total <= 0.05
        )

        if mostly_sunny_and_dry:
            streak += 1
        else:
            streak = 0

        streaks.append(streak)

    daily["sunny_streak_days"] = streaks

    return daily


def fishing_pressure_score(pressure_avg, pressure_change):
    """
    Freshwater fishing pressure score.
    """

    if pd.isna(pressure_avg) or pd.isna(pressure_change):
        return 50

    score = 75

    if -6 <= pressure_change <= -1:
        score += 25
    elif -1 < pressure_change <= 2:
        score += 15
    elif -10 < pressure_change < -6 or 6 < pressure_change < 10:
        score -= 15
    elif pressure_change <= -10 or pressure_change >= 10:
        score -= 35

    if pressure_avg < 995 or pressure_avg > 1030:
        score -= 10

    return clamp_score(score)


def freshwater_water_temp_score(water_temp):
    """
    Generic freshwater fishing water temperature score.
    """

    return range_score(
        value=water_temp,
        ideal_low=55,
        ideal_high=72,
        absolute_low=40,
        absolute_high=84,
    )

SPECIES_FISHING_PROFILES = {
    "Bass Fishing": {
        "ideal_water_temp": [60, 78],
        "absolute_water_temp": [45, 88],
        "bug_bonus": True,
        "description": "Bass tend to favor warmer freshwater conditions.",
    },
    "Trout Fishing": {
        "ideal_water_temp": [45, 60],
        "absolute_water_temp": [35, 68],
        "bug_bonus": True,
        "description": "Trout generally prefer cooler water.",
    },
    "Walleye Fishing": {
        "ideal_water_temp": [50, 70],
        "absolute_water_temp": [38, 78],
        "bug_bonus": False,
        "description": "Walleye often do well in cooler to mild freshwater conditions.",
    },
    "Pike Fishing": {
        "ideal_water_temp": [50, 65],
        "absolute_water_temp": [35, 75],
        "bug_bonus": False,
        "description": "Pike often favor cooler to mild water.",
    },
    "Panfish Fishing": {
        "ideal_water_temp": [60, 75],
        "absolute_water_temp": [45, 85],
        "bug_bonus": True,
        "description": "Panfish often do well in mild to warm water.",
    },
}

FISHING_ACTIVITIES = ["Fishing"]
SPECIES_FISHING_ACTIVITY_NAMES = list(SPECIES_FISHING_PROFILES.keys())

def storm_safety_score(row):
    """
    Higher score = safer.
    """

    risk = 0

    thunderstorm_hours = safe_value(row.get("thunderstorm_hours", 0), 0)
    severe_weather_hours = safe_value(row.get("severe_weather_hours", 0), 0)
    gusts = safe_value(row.get("gust_max", 0), 0)
    rain_chance = safe_value(row.get("precip_probability_max", 0), 0)
    rain_total = safe_value(row.get("precip_total", 0), 0)

    if thunderstorm_hours > 0:
        risk += 50

    if severe_weather_hours > 0:
        risk += 25

    if gusts >= 35:
        risk += 35
    elif gusts >= 25:
        risk += 20

    if rain_chance >= 70:
        risk += 20
    elif rain_chance >= 50:
        risk += 10

    if rain_total >= 0.50:
        risk += 20
    elif rain_total >= 0.25:
        risk += 10

    return 100 - clamp_score(risk)


def storm_risk_label(score):
    if score >= 80:
        return "Low storm risk"
    if score >= 60:
        return "Some risk"
    if score >= 40:
        return "High risk"
    return "Avoid / unsafe"


def dew_point_comfort_score(dew_point):
    """
    Lower dew point = more comfortable.
    """

    if pd.isna(dew_point):
        return 75

    if dew_point <= 55:
        return 100

    if dew_point >= 72:
        return 0

    return 100 * (72 - dew_point) / (72 - 55)


def air_quality_score(aqi):
    """
    Higher score = better air quality.
    """

    if pd.isna(aqi):
        return 80

    if aqi <= 50:
        return 100

    if aqi >= 150:
        return 0

    return 100 * (150 - aqi) / (150 - 50)


def uv_comfort_score(uv_index):
    """
    Higher score = less UV concern.
    """

    if pd.isna(uv_index):
        return 80

    if uv_index <= 3:
        return 100

    if uv_index >= 10:
        return 30

    return 100 - ((uv_index - 3) / (10 - 3)) * 70


def ground_dryness_score(rain_3day, sunny_streak_days):
    """
    Higher score = drier ground.
    """

    rain_score = low_is_good_score(
        value=rain_3day,
        ideal_max=0.05,
        bad_at=1.00,
    )

    sunny_bonus = min(sunny_streak_days, 3) * 5

    return clamp_score(rain_score + sunny_bonus)


def fishing_wind_score(wind_mph):
    """
    You like a little wind for fishing.
    """

    if pd.isna(wind_mph):
        return 50

    if wind_mph < 4:
        return 60 + (wind_mph / 4) * 40

    if wind_mph <= 12:
        return 100

    if wind_mph <= 25:
        return 100 * (25 - wind_mph) / (25 - 12)

    return 0


def fishing_bug_score(bug_index):
    """
    For fishing, moderate to somewhat high bugs can be good.
    """

    return range_score(
        value=bug_index,
        ideal_low=35,
        ideal_high=75,
        absolute_low=10,
        absolute_high=95,
    )


def camping_bug_comfort_score(bug_index):
    """
    For camping, lower bugs are better.
    """

    return low_is_good_score(
        value=bug_index,
        ideal_max=20,
        bad_at=80,
    )


def camping_sunny_streak_score(streak_days):
    if streak_days >= 3:
        return 100
    if streak_days == 2:
        return 80
    if streak_days == 1:
        return 50
    return 20


def add_extra_features(daily_df, manual_water_temp):
    daily = daily_df.copy()

    daily["bug_activity_index"] = daily.apply(calculate_bug_activity_index, axis=1)

    daily = add_sunny_streak(daily)

    if manual_water_temp is None:
        daily["estimated_water_temp"] = (
            daily["temp_avg"]
            .rolling(window=3, min_periods=1)
            .mean()
        )
    else:
        daily["estimated_water_temp"] = manual_water_temp

    daily["storm_safety_score"] = daily.apply(storm_safety_score, axis=1)
    daily["storm_risk"] = daily["storm_safety_score"].apply(storm_risk_label)

    daily["rain_3day_forecast"] = (
        daily["precip_total"]
        .fillna(0)
        .rolling(window=3, min_periods=1)
        .sum()
    )

    daily["ground_dryness_score"] = daily.apply(
        lambda row: ground_dryness_score(
            rain_3day=row["rain_3day_forecast"],
            sunny_streak_days=row["sunny_streak_days"],
        ),
        axis=1,
    )

    daily["dew_point_score"] = daily["dew_point_max"].apply(dew_point_comfort_score)
    daily["air_quality_score"] = daily["aqi_max"].apply(air_quality_score)
    daily["uv_score"] = daily["uv_index_max"].apply(uv_comfort_score)

    return daily


# =========================
# Hobby scoring
# =========================

def common_gear_notes(row):
    notes = []

    if row["storm_safety_score"] < 60:
        notes.append("watch storm risk closely")

    if row["bug_activity_index"] >= 55:
        notes.append("bring bug spray")

    if row["uv_index_max"] >= 6:
        notes.append("bring sunscreen/hat/sunglasses")

    if row["gust_max"] >= 25:
        notes.append("expect gusty wind")

    if row["precip_probability_max"] >= 50:
        notes.append("bring rain gear")

    if row["ground_dryness_score"] < 50:
        notes.append("expect wet or muddy ground")

    if row["aqi_max"] >= 101:
        notes.append("air quality caution")

    if row["dew_point_max"] >= 65:
        notes.append("humid/sticky conditions")

    if len(notes) == 0:
        return "No special gear concerns."

    return "; ".join(notes) + "."

def species_water_temp_score(water_temp, species_profile):
    """
    Scores water temperature for a specific freshwater species.
    """

    ideal_low, ideal_high = species_profile["ideal_water_temp"]
    absolute_low, absolute_high = species_profile["absolute_water_temp"]

    return range_score(
        value=water_temp,
        ideal_low=ideal_low,
        ideal_high=ideal_high,
        absolute_low=absolute_low,
        absolute_high=absolute_high,
    )

def score_fishing(row):
    temp_score = range_score(row["temp_avg"], 50, 75, 35, 90)
    wind_score = fishing_wind_score(row["wind_max"])
    bug_score = fishing_bug_score(row["bug_activity_index"])
    rain_score = low_is_good_score(row["precip_probability_max"], 30, 85)
    pressure_score = fishing_pressure_score(row["pressure_avg"], row["pressure_change"])
    water_score = freshwater_water_temp_score(row["estimated_water_temp"])
    storm_score = row["storm_safety_score"]

    score = (
        temp_score * 0.22 +
        wind_score * 0.18 +
        bug_score * 0.13 +
        rain_score * 0.08 +
        pressure_score * 0.15 +
        water_score * 0.12 +
        storm_score * 0.08 +
        row["air_quality_score"] * 0.02 +
        row["uv_score"] * 0.02
    )

    if storm_score < 40:
        score = min(score, 45)

    reasons = []

    if 50 <= row["temp_avg"] <= 75:
        reasons.append("mild temperatures")

    if 4 <= row["wind_max"] <= 12:
        reasons.append("a good light chop")

    if 35 <= row["bug_activity_index"] <= 75:
        reasons.append("good insect activity")

    if -6 <= row["pressure_change"] <= -1:
        reasons.append("slightly falling pressure")
    elif -1 < row["pressure_change"] <= 2:
        reasons.append("stable pressure")

    if row["storm_safety_score"] < 60:
        reasons.append("storm risk is hurting the score")

    if not reasons:
        explanation = "Mixed fishing conditions."
    else:
        explanation = "Fishing score is driven by " + ", ".join(reasons) + "."

    return round(clamp_score(score)), explanation

def score_species_fishing(row, species_name, species_profile):
    """
    Scores fishing for a specific freshwater species.

    Uses the general fishing model, but gives more importance to
    species-specific water temperature.
    """

    temp_score = range_score(
        value=row["temp_avg"],
        ideal_low=50,
        ideal_high=75,
        absolute_low=35,
        absolute_high=90,
    )

    wind_score = fishing_wind_score(row["wind_max"])

    bug_score = fishing_bug_score(row["bug_activity_index"])

    rain_score = low_is_good_score(
        value=row["precip_probability_max"],
        ideal_max=30,
        bad_at=85,
    )

    pressure_score = fishing_pressure_score(
        row["pressure_avg"],
        row["pressure_change"],
    )

    water_score = range_score(
        value=row["estimated_water_temp"],
        ideal_low=species_profile["ideal_water_temp"][0],
        ideal_high=species_profile["ideal_water_temp"][1],
        absolute_low=species_profile["absolute_water_temp"][0],
        absolute_high=species_profile["absolute_water_temp"][1],
    )

    storm_score = row["storm_safety_score"]

    # Species-specific weighting:
    # water temperature matters more here than in general fishing.
    score = (
        water_score * 0.30 +
        temp_score * 0.15 +
        wind_score * 0.15 +
        pressure_score * 0.15 +
        rain_score * 0.08 +
        storm_score * 0.08 +
        row["air_quality_score"] * 0.03 +
        row["uv_score"] * 0.02
    )

    # Some species/approaches benefit more from insect activity.
    if species_profile.get("bug_bonus", False):
        score += bug_score * 0.04

    # Safety cap
    if storm_score < 40:
        score = min(score, 45)

    reasons = []

    ideal_low, ideal_high = species_profile["ideal_water_temp"]

    if ideal_low <= row["estimated_water_temp"] <= ideal_high:
        reasons.append(
            f"water temperature is in the preferred range for {species_name.lower()}"
        )

    if 4 <= row["wind_max"] <= 12:
        reasons.append("a good light chop")

    if -6 <= row["pressure_change"] <= -1:
        reasons.append("slightly falling pressure")
    elif -1 < row["pressure_change"] <= 2:
        reasons.append("stable pressure")

    if species_profile.get("bug_bonus", False) and 35 <= row["bug_activity_index"] <= 75:
        reasons.append("good insect activity")

    if row["storm_safety_score"] < 60:
        reasons.append("storm risk is hurting the score")

    if len(reasons) == 0:
        explanation = f"Mixed conditions for {species_name.lower()}."
    else:
        explanation = (
            f"{species_name} score is driven by "
            + ", ".join(reasons)
            + "."
        )

    explanation += f" {species_profile['description']}"

    return round(clamp_score(score)), explanation

def build_species_fishing_breakdown(row):
    """
    Builds species-specific fishing scores for the Fishing deeper dive.

    Returns a list of dictionaries sorted by best score first.
    """

    species_rows = []

    for species_name, species_profile in SPECIES_FISHING_PROFILES.items():
        species_score, species_explanation = score_species_fishing(
            row=row,
            species_name=species_name,
            species_profile=species_profile,
        )

        species_rows.append({
            "species": species_name.replace(" Fishing", ""),
            "activity_name": species_name,
            "score": species_score,
            "label": score_label(species_score),
            "explanation": species_explanation,
        })

    species_rows = sorted(
        species_rows,
        key=lambda item: item["score"],
        reverse=True,
    )

    return species_rows

def score_camping(row):
    temp_score = range_score(row["temp_avg"], 70, 80, 50, 95)
    sunny_score = camping_sunny_streak_score(row["sunny_streak_days"])
    bug_score = camping_bug_comfort_score(row["bug_activity_index"])
    rain_score = low_is_good_score(row["precip_probability_max"], 15, 70)
    storm_score = row["storm_safety_score"]
    ground_score = row["ground_dryness_score"]

    score = (
        temp_score * 0.25 +
        sunny_score * 0.20 +
        bug_score * 0.20 +
        rain_score * 0.10 +
        storm_score * 0.15 +
        ground_score * 0.10
    )

    if storm_score < 40:
        score = min(score, 45)

    reasons = []

    if 70 <= row["temp_avg"] <= 80:
        reasons.append("warm comfortable temperatures")

    if row["sunny_streak_days"] >= 2:
        reasons.append("recent sunny weather")

    if row["bug_activity_index"] >= 60:
        reasons.append("bugs are hurting the score")

    if row["ground_dryness_score"] >= 70:
        reasons.append("ground likely drying out")

    if row["storm_safety_score"] < 60:
        reasons.append("storm risk is a concern")

    if not reasons:
        explanation = "Mixed camping conditions."
    else:
        explanation = "Camping score is driven by " + ", ".join(reasons) + "."

    return round(clamp_score(score)), explanation


def score_running(row):
    temp_score = range_score(row["temp_avg"], 45, 60, 25, 80)
    wind_score = low_is_good_score(row["wind_max"], 8, 20)
    sun_score = low_is_good_score(row["cloud_avg"], 20, 80)
    rain_score = low_is_good_score(row["precip_probability_max"], 10, 70)
    storm_score = row["storm_safety_score"]

    score = (
        temp_score * 0.35 +
        wind_score * 0.18 +
        sun_score * 0.15 +
        rain_score * 0.05 +
        storm_score * 0.10 +
        row["dew_point_score"] * 0.07 +
        row["air_quality_score"] * 0.07 +
        row["uv_score"] * 0.03
    )

    if storm_score < 40:
        score = min(score, 45)

    if row["aqi_max"] >= 151:
        score = min(score, 45)

    reasons = []

    if 45 <= row["temp_avg"] <= 60:
        reasons.append("cool running temperatures")

    if row["wind_max"] <= 8:
        reasons.append("light wind")

    if row["cloud_avg"] <= 35:
        reasons.append("sunny skies")

    if row["dew_point_score"] < 60:
        reasons.append("humidity/dew point is hurting comfort")

    if row["aqi_max"] >= 101:
        reasons.append("air quality is hurting the score")

    if row["storm_safety_score"] < 60:
        reasons.append("storm risk is a concern")

    if not reasons:
        explanation = "Mixed running conditions."
    else:
        explanation = "Running score is driven by " + ", ".join(reasons) + "."

    return round(clamp_score(score)), explanation

def score_kayaking(row):
    """
    Scores kayaking conditions.

    Kayaking prefers:
    - Warm but not dangerously hot temperatures
    - Low wind
    - Low gusts
    - Low rain/storm risk
    - Reasonable water temperature
    """

    temp_score = range_score(
        value=row["temp_avg"],
        ideal_low=65,
        ideal_high=85,
        absolute_low=50,
        absolute_high=95,
    )

    water_score = range_score(
        value=row["estimated_water_temp"],
        ideal_low=60,
        ideal_high=78,
        absolute_low=45,
        absolute_high=88,
    )

    wind_score = low_is_good_score(
        value=row["wind_max"],
        ideal_max=8,
        bad_at=18,
    )

    gust_score = low_is_good_score(
        value=row["gust_max"],
        ideal_max=15,
        bad_at=30,
    )

    rain_score = low_is_good_score(
        value=row["precip_probability_max"],
        ideal_max=15,
        bad_at=70,
    )

    storm_score = row["storm_safety_score"]

    score = (
        temp_score * 0.20 +
        water_score * 0.15 +
        wind_score * 0.22 +
        gust_score * 0.15 +
        rain_score * 0.10 +
        storm_score * 0.13 +
        row["air_quality_score"] * 0.03 +
        row["uv_score"] * 0.02
    )

    # Safety caps
    if storm_score < 40:
        score = min(score, 35)

    if row["wind_max"] >= 20 or row["gust_max"] >= 32:
        score = min(score, 55)

    reasons = []

    if 65 <= row["temp_avg"] <= 85:
        reasons.append("comfortable paddling temperatures")

    if row["wind_max"] <= 8:
        reasons.append("low wind")

    if row["gust_max"] <= 15:
        reasons.append("manageable gusts")

    if row["estimated_water_temp"] >= 60:
        reasons.append("reasonable water temperature")

    if row["storm_safety_score"] < 60:
        reasons.append("storm risk is hurting the score")

    if row["wind_max"] >= 15:
        reasons.append("wind may make paddling harder")

    if not reasons:
        explanation = "Mixed kayaking conditions."
    else:
        explanation = "Kayaking score is driven by " + ", ".join(reasons) + "."

    return round(clamp_score(score)), explanation


def score_disc_golf(row):
    """
    Scores disc golf conditions.

    Disc golf prefers:
    - Mild/warm temperatures
    - Not too much wind
    - Dry ground
    - Low rain/storm risk
    - Lower bug pressure
    """

    temp_score = range_score(
        value=row["temp_avg"],
        ideal_low=50,
        ideal_high=78,
        absolute_low=35,
        absolute_high=92,
    )

    wind_score = low_is_good_score(
        value=row["wind_max"],
        ideal_max=10,
        bad_at=25,
    )

    rain_score = low_is_good_score(
        value=row["precip_probability_max"],
        ideal_max=20,
        bad_at=75,
    )

    ground_score = row["ground_dryness_score"]

    storm_score = row["storm_safety_score"]

    bug_comfort_score = low_is_good_score(
        value=row["bug_activity_index"],
        ideal_max=35,
        bad_at=85,
    )

    score = (
        temp_score * 0.30 +
        wind_score * 0.20 +
        rain_score * 0.15 +
        ground_score * 0.12 +
        storm_score * 0.15 +
        bug_comfort_score * 0.04 +
        row["air_quality_score"] * 0.02 +
        row["uv_score"] * 0.02
    )

    if storm_score < 40:
        score = min(score, 40)

    reasons = []

    if 50 <= row["temp_avg"] <= 78:
        reasons.append("good disc golf temperatures")

    if row["wind_max"] <= 10:
        reasons.append("manageable wind")

    if row["ground_dryness_score"] >= 70:
        reasons.append("course should be fairly dry")

    if row["precip_probability_max"] >= 50:
        reasons.append("rain risk is hurting the score")

    if row["bug_activity_index"] >= 65:
        reasons.append("bugs may be annoying")

    if row["storm_safety_score"] < 60:
        reasons.append("storm risk is a concern")

    if not reasons:
        explanation = "Mixed disc golf conditions."
    else:
        explanation = "Disc golf score is driven by " + ", ".join(reasons) + "."

    return round(clamp_score(score)), explanation

def generate_predictions(latitude, longitude, days, manual_water_temp, include_air_quality=False):
    """
    Full automatic prediction pipeline.

    Includes:
    - Fishing
    - Species-specific fishing
    - Camping
    - Running
    - Kayaking
    - Disc Golf
    """

    hourly_weather = fetch_weather_forecast(latitude, longitude, days)

    if include_air_quality:
        try:
            air_quality = fetch_air_quality_forecast(latitude, longitude, days)
        except Exception:
            air_quality = None
    else:
        air_quality = None

    daily = aggregate_weather_by_day(hourly_weather)
    daily = add_air_quality_by_day(daily, air_quality)
    daily = add_extra_features(daily, manual_water_temp)

    baseline_rules = load_baseline_hobby_rules()

    dynamic_hobbies = []

    if len(baseline_rules) > 0:
        dynamic_hobbies = sorted([
            hobby
            for hobby in baseline_rules["hobby"].dropna().unique()
            if hobby not in HARDCODED_ACTIVITIES
        ])

    rows = []

    for _, row in daily.iterrows():
        fishing_score, fishing_explanation = score_fishing(row)
        camping_score, camping_explanation = score_camping(row)
        running_score, running_explanation = score_running(row)
        kayaking_score, kayaking_explanation = score_kayaking(row)
        disc_golf_score, disc_golf_explanation = score_disc_golf(row)

        gear_notes = common_gear_notes(row)

        common_weather = {
            "avg_temp": round(row["temp_avg"]),
            "wind_max": round(row["wind_max"]),
            "gust_max": round(row["gust_max"]),
            "rain_chance": round(row["precip_probability_max"]),
            "bug_index": round(row["bug_activity_index"]),
            "storm_risk": row["storm_risk"],
            "water_temp_est": round(row["estimated_water_temp"]),
        }

        # ---------------------
        # General Fishing
        # ---------------------

        species_breakdown = build_species_fishing_breakdown(row)

        best_species = species_breakdown[0] if len(species_breakdown) > 0 else None

        if best_species is not None:
            best_species_name = best_species["species"]
            best_species_score = best_species["score"]
        else:
            best_species_name = None
            best_species_score = None

        rows.append({
            "date": row["date"],
            "activity": "Fishing",
            "predicted_score": fishing_score,
            "label": score_label(fishing_score),
            "explanation": fishing_explanation,
            "gear_notes": gear_notes,
            "best_species": best_species_name,
            "best_species_score": best_species_score,
            "species_breakdown": species_breakdown,
            **common_weather,
        })

        # ---------------------
        # Camping
        # ---------------------

        rows.append({
            "date": row["date"],
            "activity": "Camping",
            "predicted_score": camping_score,
            "label": score_label(camping_score),
            "explanation": camping_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        # ---------------------
        # Running
        # ---------------------

        rows.append({
            "date": row["date"],
            "activity": "Running",
            "predicted_score": running_score,
            "label": score_label(running_score),
            "explanation": running_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        # ---------------------
        # Kayaking
        # ---------------------

        rows.append({
            "date": row["date"],
            "activity": "Kayaking",
            "predicted_score": kayaking_score,
            "label": score_label(kayaking_score),
            "explanation": kayaking_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        # ---------------------
        # Disc Golf
        # ---------------------

        rows.append({
            "date": row["date"],
            "activity": "Disc Golf",
            "predicted_score": disc_golf_score,
            "label": score_label(disc_golf_score),
            "explanation": disc_golf_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        # ---------------------
        # Dynamic rule-based hobbies
        # ---------------------

        for dynamic_hobby in dynamic_hobbies:
            hobby_rules = get_rules_for_hobby(
                baseline_rules,
                dynamic_hobby,
            )

            dynamic_score, dynamic_explanation = score_hobby_from_rules(
                day_row=row,
                hobby_name=dynamic_hobby,
                hobby_rules=hobby_rules,
            )

            rows.append({
                "date": row["date"],
                "activity": dynamic_hobby,
                "predicted_score": dynamic_score,
                "label": score_label(dynamic_score),
                "explanation": dynamic_explanation,
                "gear_notes": gear_notes,
                **common_weather,
            })

    predictions = pd.DataFrame(rows)

    predictions["date"] = pd.to_datetime(
        predictions["date"],
        errors="coerce",
    ).dt.strftime("%Y-%m-%d")

    # Safety cleanup: one row per date/activity
    predictions = predictions.drop_duplicates(
        subset=["date", "activity"],
        keep="last",
    )

    predictions = predictions.sort_values(
        ["date", "activity"]
    ).reset_index(drop=True)

    return predictions

# =========================
# Best time-window recommendations
# =========================

@st.cache_data(ttl=1800)
def fetch_sun_times(latitude, longitude, days):
    """
    Gets sunrise and sunset times from Open-Meteo.
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": "sunrise,sunset",
        "forecast_days": days,
        "timezone": "auto",
    }

    data = get_json_with_retries(
        FORECAST_URL,
        params=params,
        timeout=12,
        retries=2,
    )

    sun_df = pd.DataFrame(data["daily"])

    sun_df["date"] = pd.to_datetime(sun_df["time"]).dt.date
    sun_df["sunrise"] = pd.to_datetime(sun_df["sunrise"])
    sun_df["sunset"] = pd.to_datetime(sun_df["sunset"])

    return sun_df[["date", "sunrise", "sunset"]]


def format_time_for_window(timestamp):
    """
    Formats a timestamp like 07:00 AM.
    """

    return timestamp.strftime("%I:%M %p").lstrip("0")


def find_best_window(day_df, score_col, min_score=60, min_hours=2):
    """
    Finds the best continuous time window.

    It looks for consecutive hours where the score is at least min_score.
    If it cannot find a multi-hour window, it falls back to the single best hour.
    """

    if len(day_df) == 0:
        return {
            "window": "Not available",
            "score": None,
            "start": None,
            "end": None,
        }

    df = day_df.sort_values("time").copy()

    good = df[df[score_col] >= min_score].copy()

    segments = []
    current_segment = []
    last_time = None

    for _, row in good.iterrows():
        current_time = row["time"]

        if last_time is None:
            current_segment = [row]

        elif current_time - last_time <= pd.Timedelta(hours=1, minutes=5):
            current_segment.append(row)

        else:
            if len(current_segment) > 0:
                segments.append(pd.DataFrame(current_segment))

            current_segment = [row]

        last_time = current_time

    if len(current_segment) > 0:
        segments.append(pd.DataFrame(current_segment))

    # Keep only useful windows
    usable_segments = [
        segment for segment in segments
        if len(segment) >= min_hours
    ]

    if len(usable_segments) > 0:
        best_segment = max(
            usable_segments,
            key=lambda segment: segment[score_col].mean()
        )

        start = best_segment["time"].iloc[0]
        end = best_segment["time"].iloc[-1] + pd.Timedelta(hours=1)
        average_score = round(best_segment[score_col].mean())

        return {
            "window": f"{format_time_for_window(start)}–{format_time_for_window(end)}",
            "score": average_score,
            "start": start,
            "end": end,
        }

    # Fallback: best single hour
    best_index = df[score_col].idxmax()
    best_row = df.loc[best_index]

    start = best_row["time"]
    end = start + pd.Timedelta(hours=1)
    score = round(best_row[score_col])

    return {
        "window": f"{format_time_for_window(start)}–{format_time_for_window(end)}",
        "score": score,
        "start": start,
        "end": end,
    }


def hourly_bug_activity_index(row):
    """
    Estimates bug activity for one hour.
    Higher score = more bugs.
    """

    temp = safe_value(row.get("temperature_2m", 60), 60)
    humidity = safe_value(row.get("relative_humidity_2m", 50), 50)
    wind = safe_value(row.get("wind_speed_10m", 5), 5)
    rain = safe_value(row.get("precipitation", 0), 0)

    score = 0

    if temp < 50:
        score += 10
    elif temp < 60:
        score += 25
    elif temp <= 75:
        score += 50
    elif temp <= 88:
        score += 65
    else:
        score += 45

    if humidity >= 80:
        score += 20
    elif humidity >= 65:
        score += 12
    elif humidity >= 50:
        score += 5

    if wind < 4:
        score += 15
    elif wind < 8:
        score += 8
    elif wind > 15:
        score -= 10

    if rain >= 0.05:
        score += 6

    return clamp_score(score)


def hourly_storm_safety_score(row):
    """
    Scores storm safety for one hour.
    Higher = safer.
    """

    weather_code = row.get("weather_code", 0)
    gust = safe_value(row.get("wind_gusts_10m", 0), 0)
    rain_chance = safe_value(row.get("precipitation_probability", 0), 0)

    if pd.isna(weather_code):
        weather_code = 0

    weather_code = int(weather_code)

    risk = 0

    if weather_code in [95, 96, 99]:
        risk += 60

    if weather_code in [80, 81, 82]:
        risk += 20

    if gust >= 35:
        risk += 35
    elif gust >= 25:
        risk += 20

    if rain_chance >= 70:
        risk += 20
    elif rain_chance >= 50:
        risk += 10

    return 100 - clamp_score(risk)


def fishing_time_of_day_score(hour):
    """
    Freshwater fishing time preference.
    Early morning and evening are usually favored.
    """

    if 6 <= hour <= 10:
        return 100

    if 17 <= hour <= 21:
        return 100

    if 11 <= hour <= 16:
        return 65

    if hour == 5 or hour == 22:
        return 50

    return 25


def running_light_score(current_time, sunrise, sunset):
    """
    Allows running from 1 hour before sunrise to 1 hour after sunset.

    Full daylight gets the highest score.
    The one-hour sunrise/sunset buffer is allowed but gets a small safety penalty.
    """

    start_allowed = sunrise - pd.Timedelta(hours=1)
    end_allowed = sunset + pd.Timedelta(hours=1)

    if current_time < start_allowed or current_time > end_allowed:
        return 0

    if sunrise <= current_time <= sunset:
        return 100

    return 80


def daylight_only_score(current_time, sunrise, sunset):
    """
    Used for kayaking and disc golf.
    Requires daylight.
    """

    if sunrise <= current_time <= sunset:
        return 100

    return 0


def running_window_note(start, end, sunrise, sunset):
    """
    Explains whether a running window is daylight or low-light.
    """

    if start is None or end is None:
        return "No running window available."

    if start < sunrise:
        return "Window starts before sunrise. Use reflective gear or a light."

    if end > sunset:
        return "Window ends after sunset. Use reflective gear or a light."

    return "Daylight running window."


def score_fishing_hour(row):
    """
    Scores one hour for fishing.
    """

    temp_score = range_score(
        value=row["temperature_2m"],
        ideal_low=50,
        ideal_high=75,
        absolute_low=35,
        absolute_high=90,
    )

    wind_score = fishing_wind_score(row["wind_speed_10m"])

    bug_score = fishing_bug_score(
        hourly_bug_activity_index(row)
    )

    rain_score = low_is_good_score(
        value=row["precipitation_probability"],
        ideal_max=30,
        bad_at=85,
    )

    time_score = fishing_time_of_day_score(row["time"].hour)

    storm_score = hourly_storm_safety_score(row)

    final_score = (
        temp_score * 0.30 +
        wind_score * 0.25 +
        bug_score * 0.15 +
        rain_score * 0.10 +
        time_score * 0.15 +
        storm_score * 0.05
    )

    if storm_score < 40:
        final_score = min(final_score, 45)

    return round(clamp_score(final_score))


def score_running_hour(row):
    """
    Scores one hour for running.
    """

    light_score = row["Running Light Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(
        value=row["temperature_2m"],
        ideal_low=45,
        ideal_high=60,
        absolute_low=25,
        absolute_high=80,
    )

    wind_score = low_is_good_score(
        value=row["wind_speed_10m"],
        ideal_max=8,
        bad_at=20,
    )

    sun_score = low_is_good_score(
        value=row["cloud_cover"],
        ideal_max=20,
        bad_at=80,
    )

    rain_score = low_is_good_score(
        value=row["precipitation_probability"],
        ideal_max=10,
        bad_at=70,
    )

    dew_score = dew_point_comfort_score(
        row.get("dew_point_2m", 55)
    )

    storm_score = hourly_storm_safety_score(row)

    final_score = (
        temp_score * 0.35 +
        wind_score * 0.20 +
        sun_score * 0.10 +
        rain_score * 0.05 +
        dew_score * 0.10 +
        storm_score * 0.10 +
        light_score * 0.10
    )

    if storm_score < 40:
        final_score = min(final_score, 45)

    return round(clamp_score(final_score))


def score_kayaking_hour(row):
    """
    Scores one hour for kayaking.

    Kayaking is very sensitive to wind, gusts, rain, and storms.
    """

    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(
        value=row["temperature_2m"],
        ideal_low=65,
        ideal_high=85,
        absolute_low=50,
        absolute_high=95,
    )

    wind_score = low_is_good_score(
        value=row["wind_speed_10m"],
        ideal_max=8,
        bad_at=18,
    )

    gust_score = low_is_good_score(
        value=row["wind_gusts_10m"],
        ideal_max=15,
        bad_at=30,
    )

    rain_score = low_is_good_score(
        value=row["precipitation_probability"],
        ideal_max=15,
        bad_at=70,
    )

    storm_score = hourly_storm_safety_score(row)

    final_score = (
        temp_score * 0.25 +
        wind_score * 0.30 +
        gust_score * 0.20 +
        rain_score * 0.10 +
        storm_score * 0.10 +
        light_score * 0.05
    )

    if storm_score < 40:
        final_score = min(final_score, 35)

    return round(clamp_score(final_score))


def score_disc_golf_hour(row):
    """
    Scores one hour for disc golf.
    """

    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(
        value=row["temperature_2m"],
        ideal_low=50,
        ideal_high=78,
        absolute_low=35,
        absolute_high=92,
    )

    wind_score = low_is_good_score(
        value=row["wind_speed_10m"],
        ideal_max=10,
        bad_at=25,
    )

    rain_score = low_is_good_score(
        value=row["precipitation_probability"],
        ideal_max=20,
        bad_at=75,
    )

    storm_score = hourly_storm_safety_score(row)

    final_score = (
        temp_score * 0.35 +
        wind_score * 0.25 +
        rain_score * 0.15 +
        storm_score * 0.15 +
        light_score * 0.10
    )

    if storm_score < 40:
        final_score = min(final_score, 40)

    return round(clamp_score(final_score))

def score_tennis_hour(row):
    """
    Scores one hour for tennis.
    """

    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(
        value=row["temperature_2m"],
        ideal_low=55,
        ideal_high=78,
        absolute_low=45,
        absolute_high=88,
    )

    wind_score = low_is_good_score(
        value=row["wind_speed_10m"],
        ideal_max=8,
        bad_at=20,
    )

    rain_score = low_is_good_score(
        value=row["precipitation_probability"],
        ideal_max=15,
        bad_at=70,
    )

    storm_score = hourly_storm_safety_score(row)

    final_score = (
        temp_score * 0.35 +
        wind_score * 0.30 +
        rain_score * 0.15 +
        storm_score * 0.15 +
        light_score * 0.05
    )

    if storm_score < 40:
        final_score = min(final_score, 35)

    return round(clamp_score(final_score))


def score_beach_hour(row):
    """
    Scores one hour for a beach day.
    """

    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(
        value=row["temperature_2m"],
        ideal_low=75,
        ideal_high=90,
        absolute_low=65,
        absolute_high=98,
    )

    wind_score = range_score(
        value=row["wind_speed_10m"],
        ideal_low=3,
        ideal_high=15,
        absolute_low=0,
        absolute_high=25,
    )

    rain_score = low_is_good_score(
        value=row["precipitation_probability"],
        ideal_max=20,
        bad_at=75,
    )

    sun_score = low_is_good_score(
        value=row["cloud_cover"],
        ideal_max=35,
        bad_at=90,
    )

    storm_score = hourly_storm_safety_score(row)

    final_score = (
        temp_score * 0.35 +
        sun_score * 0.20 +
        wind_score * 0.15 +
        rain_score * 0.15 +
        storm_score * 0.10 +
        light_score * 0.05
    )

    if storm_score < 40:
        final_score = min(final_score, 35)

    return round(clamp_score(final_score))

def build_time_recommendations(hourly_df, sun_times):
    """
    Builds best time windows for:
    - Fishing
    - Running
    - Kayaking
    - Disc Golf
    """

    df = hourly_df.copy()

    df["date"] = df["time"].dt.date
    df["hour"] = df["time"].dt.hour

    recommendations = []

    # ---------------------
    # Fishing scores
    # ---------------------

    fishing_df = df[
        (df["hour"] >= 5) &
        (df["hour"] <= 22)
    ].copy()

    fishing_df["Fishing Time Score"] = fishing_df.apply(
        score_fishing_hour,
        axis=1,
    )

    # ---------------------
    # Running scores
    # ---------------------

    running_df = df.merge(
        sun_times,
        on="date",
        how="left",
    )

    running_df["Running Light Score"] = running_df.apply(
        lambda row: running_light_score(
            current_time=row["time"],
            sunrise=row["sunrise"],
            sunset=row["sunset"],
        ),
        axis=1,
    )

    running_df = running_df[
        running_df["Running Light Score"] > 0
    ].copy()

    running_df["Running Time Score"] = running_df.apply(
        score_running_hour,
        axis=1,
    )

    # ---------------------
    # Kayaking and disc golf scores
    # ---------------------

    daylight_df = df.merge(
        sun_times,
        on="date",
        how="left",
    )

    daylight_df["Daylight Score"] = daylight_df.apply(
        lambda row: daylight_only_score(
            current_time=row["time"],
            sunrise=row["sunrise"],
            sunset=row["sunset"],
        ),
        axis=1,
    )

    daylight_df = daylight_df[
        daylight_df["Daylight Score"] > 0
    ].copy()

    daylight_df["Kayaking Time Score"] = daylight_df.apply(
        score_kayaking_hour,
        axis=1,
    )

    daylight_df["Disc Golf Time Score"] = daylight_df.apply(
        score_disc_golf_hour,
        axis=1,
    )

    daylight_df["Tennis Time Score"] = daylight_df.apply(
        score_tennis_hour,
        axis=1,
    )

    daylight_df["Beach Day Time Score"] = daylight_df.apply(
        score_beach_hour,
        axis=1,
    )
    # ---------------------
    # Build one row per date
    # ---------------------

    all_dates = sorted(df["date"].unique())

    for forecast_date in all_dates:
        row = {
            "date": forecast_date,
        }

        # Fishing window
        fishing_day = fishing_df[
            fishing_df["date"] == forecast_date
        ]

        fishing_window = find_best_window(
            fishing_day,
            score_col="Fishing Time Score",
            min_score=60,
            min_hours=2,
        )

        row["Best Fishing Window"] = fishing_window["window"]
        row["Fishing Window Score"] = fishing_window["score"]

        # Running window
        running_day = running_df[
            running_df["date"] == forecast_date
        ]

        running_window = find_best_window(
            running_day,
            score_col="Running Time Score",
            min_score=60,
            min_hours=2,
        )

        row["Best Running Window"] = running_window["window"]
        row["Running Window Score"] = running_window["score"]

        sun_row = sun_times[
            sun_times["date"] == forecast_date
        ]

        if len(sun_row) > 0:
            sunrise = sun_row.iloc[0]["sunrise"]
            sunset = sun_row.iloc[0]["sunset"]

            row["Running Light Note"] = running_window_note(
                start=running_window["start"],
                end=running_window["end"],
                sunrise=sunrise,
                sunset=sunset,
            )
        else:
            row["Running Light Note"] = "Sunrise/sunset unavailable."

        # Kayaking window
        kayaking_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        kayaking_window = find_best_window(
            kayaking_day,
            score_col="Kayaking Time Score",
            min_score=60,
            min_hours=2,
        )

        row["Best Kayaking Window"] = kayaking_window["window"]
        row["Kayaking Window Score"] = kayaking_window["score"]

        # Disc golf window
        disc_golf_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        disc_golf_window = find_best_window(
            disc_golf_day,
            score_col="Disc Golf Time Score",
            min_score=60,
            min_hours=2,
        )

        row["Best Disc Golf Window"] = disc_golf_window["window"]
        row["Disc Golf Window Score"] = disc_golf_window["score"]

    # Tennis window
        tennis_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        tennis_window = find_best_window(
            tennis_day,
            score_col="Tennis Time Score",
            min_score=60,
            min_hours=2,
        )

        row["Best Tennis Window"] = tennis_window["window"]
        row["Tennis Window Score"] = tennis_window["score"]

        # Beach Day window
        beach_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        beach_window = find_best_window(
            beach_day,
            score_col="Beach Day Time Score",
            min_score=60,
            min_hours=2,
        )

        row["Best Beach Day Window"] = beach_window["window"]
        row["Beach Day Window Score"] = beach_window["score"]
        recommendations.append(row)

    recommendations_df = pd.DataFrame(recommendations)
    recommendations_df["date"] = pd.to_datetime(recommendations_df["date"]).dt.strftime("%Y-%m-%d")

    return recommendations_df

def get_recommended_window_for_activity(time_recommendations, selected_date, selected_activity):
    """
    Returns the recommended time window and window score for the selected activity.
    """

    matching_time = time_recommendations[
        time_recommendations["date"] == selected_date
    ]

    if len(matching_time) == 0:
        return "Not available", None

    time_row = matching_time.iloc[0]

    window_column_map = {
    "Fishing": "Best Fishing Window",
    "Running": "Best Running Window",
    "Kayaking": "Best Kayaking Window",
    "Disc Golf": "Best Disc Golf Window",
    "Tennis": "Best Tennis Window",
    "Beach Day": "Best Beach Day Window",
    }

    score_column_map = {
    "Fishing": "Fishing Window Score",
    "Running": "Running Window Score",
    "Kayaking": "Kayaking Window Score",
    "Disc Golf": "Disc Golf Window Score",
    "Tennis": "Tennis Window Score",
    "Beach Day": "Beach Day Window Score",
    }

    if selected_activity not in window_column_map:
        return "Full-day activity", None

    window_column = window_column_map[selected_activity]
    score_column = score_column_map[selected_activity]

    recommended_window = time_row.get(window_column, "Not available")
    window_score = time_row.get(score_column, None)

    return recommended_window, window_score
def apply_preference_adjustments(predictions, preferences):
    """
    Adjusts predicted scores based on user preference sliders.

    This keeps your original scoring model intact, then nudges scores up or down
    based on your personal preferences.
    """

    adjusted = predictions.copy()

    base_scores = []
    preference_adjustments = []
    adjusted_scores = []
    adjusted_explanations = []

    for _, row in adjusted.iterrows():
        base_score = int(row["predicted_score"])
        adjustment = 0

        activity = row["activity"]

        avg_temp = safe_value(row.get("avg_temp", 60), 60)
        wind_max = safe_value(row.get("wind_max", 0), 0)
        gust_max = safe_value(row.get("gust_max", 0), 0)
        rain_chance = safe_value(row.get("rain_chance", 0), 0)
        bug_index = safe_value(row.get("bug_index", 0), 0)

        # -------------------------
        # General bug tolerance
        # -------------------------
        # Lower bug tolerance means bugs reduce comfort more.
        bug_tolerance = preferences["bug_tolerance"]

        if activity in ["Camping", "Running", "Disc Golf", "Kayaking"]:
            if bug_index > 45:
                bug_penalty = ((bug_index - 45) / 10) * (10 - bug_tolerance) * 0.7
                adjustment -= bug_penalty

        # -------------------------
        # Rain caution
        # -------------------------
        rain_caution = preferences["rain_caution"]

        if activity == "Camping":
            rain_threshold = 20
        elif activity == "Kayaking":
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
        if activity in FISHING_ACTIVITIES:
            fishing_bug_boost = preferences["fishing_bug_boost"]
            fishing_wind_tolerance = preferences["fishing_wind_tolerance"]

            # Moderate insect activity helps fishing more if you believe bugs matter.
            if 35 <= bug_index <= 75:
                adjustment += (fishing_bug_boost - 5) * 1.5

            # If you tolerate wind more, do not punish windy fishing days as much.
            if wind_max > 12:
                wind_penalty = (wind_max - 12) * (10 - fishing_wind_tolerance) * 0.25
                adjustment -= wind_penalty

            if 4 <= wind_max <= 12:
                adjustment += fishing_wind_tolerance * 0.4

        # -------------------------
        # Camping preferences
        # -------------------------
        if activity == "Camping":
            camping_bug_sensitivity = preferences["camping_bug_sensitivity"]

            if bug_index > 40:
                bug_penalty = ((bug_index - 40) / 10) * camping_bug_sensitivity * 0.8
                adjustment -= bug_penalty

        # -------------------------
        # Running preferences
        # -------------------------
        if activity == "Running":
            running_wind_sensitivity = preferences["running_wind_sensitivity"]
            running_heat_sensitivity = preferences["running_heat_sensitivity"]

            if wind_max > 8:
                adjustment -= (wind_max - 8) * running_wind_sensitivity * 0.25

            if avg_temp > 60:
                adjustment -= (avg_temp - 60) * running_heat_sensitivity * 0.25

        # -------------------------
        # Kayaking preferences
        # -------------------------
        if activity == "Kayaking":
            kayaking_wind_caution = preferences["kayaking_wind_caution"]

            if wind_max > 8:
                adjustment -= (wind_max - 8) * kayaking_wind_caution * 0.4

            if gust_max > 15:
                adjustment -= (gust_max - 15) * kayaking_wind_caution * 0.25

        # -------------------------
        # Disc golf preferences
        # -------------------------
        if activity == "Disc Golf":
            disc_golf_wind_sensitivity = preferences["disc_golf_wind_sensitivity"]

            if wind_max > 10:
                adjustment -= (wind_max - 10) * disc_golf_wind_sensitivity * 0.3

        final_score = round(clamp_score(base_score + adjustment))
        rounded_adjustment = round(final_score - base_score)

        explanation = row["explanation"]

        if rounded_adjustment > 0:
            explanation += f" Your preference sliders increased this score by {rounded_adjustment} points."
        elif rounded_adjustment < 0:
            explanation += f" Your preference sliders decreased this score by {abs(rounded_adjustment)} points."
        else:
            explanation += " Your preference sliders did not change this score."

        base_scores.append(base_score)
        preference_adjustments.append(rounded_adjustment)
        adjusted_scores.append(final_score)
        adjusted_explanations.append(explanation)

    adjusted["base_predicted_score"] = base_scores
    adjusted["preference_adjustment"] = preference_adjustments
    adjusted["predicted_score"] = adjusted_scores
    adjusted["label"] = adjusted["predicted_score"].apply(score_label)
    adjusted["explanation"] = adjusted_explanations

    return adjusted

# =========================
# Activity log functions
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
                history[column] = ""

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

@st.cache_data(ttl=60)
def load_activity_log():
    """
    Loads activity logs from Supabase.
    """

    columns = [
        "id",
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

    supabase.table("activity_logs").delete().eq("id", log_id).execute()

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
# Streamlit user interface
# =========================

st.title("🌤️ Hobby Weather Scorer")

st.write(
    "This app generates hobby weather predictions automatically and lets you log how the activity actually went."
)


# -------------------------
# Sidebar settings
# -------------------------

saved_settings = load_settings()

# Initialize session state from saved preferences
for key, default_value in DEFAULT_SETTINGS.items():
    if key not in st.session_state:
        st.session_state[key] = saved_settings.get(key, default_value)


st.sidebar.header("Settings")


# -------------------------
# Location settings
# -------------------------

with st.sidebar.expander("📍 Location", expanded=True):

    saved_locations = load_saved_locations()

    if st.button("Use current forecast location as candidate"):
        st.session_state["new_location_search_results"] = [
            {
                "label": "Current forecast location",
                "latitude": latitude,
                "longitude": longitude,
                "source": "Current app location",
            }
        ]
        st.rerun()

    if len(saved_locations) > 0:
        saved_location_labels = ["Manual / Search Location"] + [
            f"{row['name']} ({row['location_type']})"
            for _, row in saved_locations.iterrows()
        ]

        selected_saved_location_label = st.selectbox(
            "Saved location",
            options=saved_location_labels,
            key="selected_saved_location_label",
        )

        if selected_saved_location_label != "Manual / Search Location":
            selected_index = saved_location_labels.index(selected_saved_location_label) - 1
            selected_location = saved_locations.iloc[selected_index]

            st.session_state["latitude"] = float(selected_location["latitude"])
            st.session_state["longitude"] = float(selected_location["longitude"])

            if not pd.isna(selected_location.get("manual_water_temp")):
                st.session_state["manual_water_temp"] = float(selected_location["manual_water_temp"])
                st.session_state["use_manual_water_temp"] = True

            st.caption(f"Using saved location: {selected_location['name']}")

    st.write("Search for a location or manually enter coordinates.")

    location_query = st.text_input(
        "Location search",
        key="location_query",
        help="Example: Ann Arbor, MI or Grand Rapids, Michigan",
    )

    if st.button("Find location"):
        try:
            location_results = search_location_anything(location_query)

            if len(location_results) == 0:
                st.warning("No locations found. Try a simpler search.")
                st.session_state["location_results"] = []
            else:
                st.session_state["location_results"] = location_results
                st.success("Location results found. Choose one below.")

        except Exception as e:
            st.error("Could not search for that location.")
            st.write(e)

    if "location_results" not in st.session_state:
        st.session_state["location_results"] = []

    if len(st.session_state["location_results"]) > 0:
        location_labels = [
            result["label"] for result in st.session_state["location_results"]
        ]

        selected_location_label = st.selectbox(
            "Choose matching location",
            options=location_labels,
        )

        if st.button("Use selected location"):
            selected_result = next(
                result for result in st.session_state["location_results"]
                if result["label"] == selected_location_label
            )

            st.session_state["latitude"] = float(selected_result["latitude"])
            st.session_state["longitude"] = float(selected_result["longitude"])
            st.success(f"Using {selected_location_label}")
            st.rerun()

    latitude = st.number_input(
        "Latitude",
        format="%.4f",
        key="latitude",
    )

    longitude = st.number_input(
        "Longitude",
        format="%.4f",
        key="longitude",
    )

    forecast_days = st.slider(
        "Forecast days",
        min_value=3,
        max_value=14,
        key="forecast_days",
    )


# -------------------------
# Fishing and water settings
# -------------------------

with st.sidebar.expander("🎣 Fishing / Water", expanded=False):
    use_manual_water_temp = st.checkbox(
        "I know the freshwater temperature",
        key="use_manual_water_temp",
    )

    if use_manual_water_temp:
        manual_water_temp = st.number_input(
            "Water temperature °F",
            min_value=32,
            max_value=90,
            key="manual_water_temp",
        )
    else:
        manual_water_temp = None


# -------------------------
# Preference sliders
# -------------------------

with st.sidebar.expander("🎛️ Preferences", expanded=False):
    st.write("Use these to personalize the scoring model.")

    bug_tolerance = st.slider(
        "General bug tolerance",
        min_value=0,
        max_value=10,
        key="bug_tolerance",
        help="0 = I hate bugs, 10 = bugs do not bother me much",
    )

    rain_caution = st.slider(
        "Rain caution",
        min_value=0,
        max_value=10,
        key="rain_caution",
        help="0 = rain does not bother me, 10 = avoid rain strongly",
    )

    fishing_bug_boost = st.slider(
        "Fishing insect activity importance",
        min_value=0,
        max_value=10,
        key="fishing_bug_boost",
        help="Higher means bug/insect activity helps the fishing score more",
    )

    fishing_wind_tolerance = st.slider(
        "Fishing wind tolerance",
        min_value=0,
        max_value=10,
        key="fishing_wind_tolerance",
        help="Higher means you are more okay with wind while fishing",
    )

    camping_bug_sensitivity = st.slider(
        "Camping bug sensitivity",
        min_value=0,
        max_value=10,
        key="camping_bug_sensitivity",
        help="Higher means bugs hurt camping scores more",
    )

    running_wind_sensitivity = st.slider(
        "Running wind sensitivity",
        min_value=0,
        max_value=10,
        key="running_wind_sensitivity",
        help="Higher means wind hurts running scores more",
    )

    running_heat_sensitivity = st.slider(
        "Running heat sensitivity",
        min_value=0,
        max_value=10,
        key="running_heat_sensitivity",
        help="Higher means warm weather hurts running scores more",
    )

    kayaking_wind_caution = st.slider(
        "Kayaking wind caution",
        min_value=0,
        max_value=10,
        key="kayaking_wind_caution",
        help="Higher means wind/gusts hurt kayaking scores more",
    )

    disc_golf_wind_sensitivity = st.slider(
        "Disc golf wind sensitivity",
        min_value=0,
        max_value=10,
        key="disc_golf_wind_sensitivity",
        help="Higher means wind hurts disc golf scores more",
    )


preferences = {
    "bug_tolerance": bug_tolerance,
    "rain_caution": rain_caution,
    "fishing_bug_boost": fishing_bug_boost,
    "fishing_wind_tolerance": fishing_wind_tolerance,
    "camping_bug_sensitivity": camping_bug_sensitivity,
    "running_wind_sensitivity": running_wind_sensitivity,
    "running_heat_sensitivity": running_heat_sensitivity,
    "kayaking_wind_caution": kayaking_wind_caution,
    "disc_golf_wind_sensitivity": disc_golf_wind_sensitivity,
}


# -------------------------
# Display settings
# -------------------------

with st.sidebar.expander("🖥️ Display", expanded=False):
    phone_friendly_view = st.checkbox(
        "Phone-friendly view",
        key="phone_friendly_view",
    )

    include_air_quality = st.checkbox(
        "Include air quality / UV",
        key="include_air_quality",
        help="Turn off for faster loading. Turn on if air quality matters for running.",
    )

# -------------------------
# Save and refresh settings
# -------------------------

with st.sidebar.expander("💾 Save / Refresh", expanded=False):
    if st.button("Save current settings"):
        settings_to_save = {
            "latitude": latitude,
            "longitude": longitude,
            "location_query": location_query,
            "forecast_days": forecast_days,
            "use_manual_water_temp": use_manual_water_temp,
            "manual_water_temp": st.session_state.get("manual_water_temp", 65),
            "phone_friendly_view": phone_friendly_view,
            "include_air_quality": include_air_quality,

            "bug_tolerance": bug_tolerance,
            "rain_caution": rain_caution,
            "fishing_bug_boost": fishing_bug_boost,
            "fishing_wind_tolerance": fishing_wind_tolerance,
            "camping_bug_sensitivity": camping_bug_sensitivity,
            "running_wind_sensitivity": running_wind_sensitivity,
            "running_heat_sensitivity": running_heat_sensitivity,
            "kayaking_wind_caution": kayaking_wind_caution,
            "disc_golf_wind_sensitivity": disc_golf_wind_sensitivity,
        }

        save_settings(settings_to_save)

        st.success("Settings saved.")

    if st.button("Reset settings to defaults"):
        save_settings(DEFAULT_SETTINGS)

        for key in DEFAULT_SETTINGS:
            if key in st.session_state:
                del st.session_state[key]

        st.cache_data.clear()
        st.rerun()

    if st.button("Force refresh forecast"):
        st.session_state["force_refresh_forecast"] = True
        st.cache_data.clear()
        st.rerun()

    if st.button("Clear cached weather and refresh"):
        st.cache_data.clear()
        st.rerun()

# -------------------------
# Generate predictions and best times
# -------------------------

with st.spinner("Loading forecast and scoring activities..."):
    try:
        force_refresh = st.session_state.pop("force_refresh_forecast", False)

        forecast_cache_key = make_forecast_cache_key(
            latitude=latitude,
            longitude=longitude,
            forecast_days=forecast_days,
            manual_water_temp=manual_water_temp,
            preferences=preferences,
            include_air_quality=include_air_quality,
        )

        if not force_refresh:
            cached_predictions, cached_time_recommendations = load_forecast_cache(
                forecast_cache_key,
                max_age_minutes=120,
                allow_stale=False,
            )
        else:
            cached_predictions, cached_time_recommendations = None, None

        if cached_predictions is not None and cached_time_recommendations is not None:
            predictions = cached_predictions
            time_recommendations = cached_time_recommendations

            st.caption("Using cached forecast from the last 2 hours.")

        else:
            try:
                base_predictions = generate_predictions(
                    latitude=latitude,
                    longitude=longitude,
                    days=forecast_days,
                    manual_water_temp=manual_water_temp,
                    include_air_quality=include_air_quality,
                )

                predictions = apply_preference_adjustments(
                    predictions=base_predictions,
                    preferences=preferences,
                )

                hourly_weather_for_times = fetch_weather_forecast(
                    latitude=latitude,
                    longitude=longitude,
                    days=forecast_days,
                )

                sun_times = fetch_sun_times(
                    latitude=latitude,
                    longitude=longitude,
                    days=forecast_days,
                )

                time_recommendations = build_time_recommendations(
                    hourly_df=hourly_weather_for_times,
                    sun_times=sun_times,
                )

                save_forecast_cache(
                    cache_key=forecast_cache_key,
                    latitude=latitude,
                    longitude=longitude,
                    forecast_days=forecast_days,
                    manual_water_temp=manual_water_temp,
                    predictions=predictions,
                    time_recommendations=time_recommendations,
                )

                prediction_save_key = (
                    f"{latitude}_{longitude}_{forecast_days}_"
                    f"{manual_water_temp}_"
                    f"{include_air_quality}_"
                    f"{predictions['date'].min()}_{predictions['date'].max()}_"
                    f"{tuple(sorted(preferences.items()))}"
                )

                if st.session_state.get("last_prediction_save_key") != prediction_save_key:
                    save_prediction_history(predictions)
                    load_prediction_history.clear()
                    st.session_state["last_prediction_save_key"] = prediction_save_key

            except Exception as fresh_fetch_error:
                stale_predictions, stale_time_recommendations = load_forecast_cache(
                    forecast_cache_key,
                    max_age_minutes=999999,
                    allow_stale=True,
                )

                if stale_predictions is not None and stale_time_recommendations is not None:
                    predictions = stale_predictions
                    time_recommendations = stale_time_recommendations

                    st.warning(
                        "Fresh weather data could not be loaded, so the app is using an older cached forecast."
                    )
                    st.caption(f"Weather API error: {fresh_fetch_error}")

                else:
                    raise fresh_fetch_error

    except Exception as e:
        st.error("Could not generate predictions.")
        st.write(e)
        st.stop()

predictions = add_forecast_confidence(predictions)

home_tab, planner_tab, log_tab, scenario_tab, history_tab, manage_tab = st.tabs(
    [
        "🏠 Home",
        "📅 Planner",
        "➕ Log Activity",
        "🧪 Rate Scenarios",
        "📈 History",
        "🛠️ Manage",
    ]
)

activity_log = load_activity_log()

# -------------------------
# Display predictions
# -------------------------

with scenario_tab:
    st.header("Rate Scenarios")

    st.write(
        "Rate hypothetical weather situations. These ratings can later help train "
        "a machine learning model for better first-time predictions."
    )

    available_scenario_activities = [
        activity
        for activity in sorted(predictions["activity"].unique())
        if activity in ACTIVITY_SCENARIO_FIELDS
    ]

    if len(available_scenario_activities) == 0:
        st.info("No scenario activities available.")

    else:
        selected_scenario_activity = st.selectbox(
            "Choose activity",
            options=available_scenario_activities,
            key="scenario_activity_select",
        )
        scenario_source = st.radio(
            "Scenario source",
            options=["Random synthetic", "Historical weather"],
            horizontal=True,
            key="scenario_source_select",
        )

        scenario_state_changed = (
            "current_scenario" not in st.session_state
            or st.session_state.get("current_scenario_activity") != selected_scenario_activity
            or st.session_state.get("current_scenario_source") != scenario_source
        )

        if scenario_state_changed:
            if scenario_source == "Historical weather":
                st.session_state["current_scenario"] = generate_historical_scenario(
                    selected_scenario_activity,
                    latitude,
                    longitude,
                )
            else:
                st.session_state["current_scenario"] = generate_random_scenario(
                    selected_scenario_activity
                )

            st.session_state["current_scenario_activity"] = selected_scenario_activity
            st.session_state["current_scenario_source"] = scenario_source
        if st.button("Generate new scenario"):
            if scenario_source == "Historical weather":
                st.session_state["current_scenario"] = generate_historical_scenario(
                    selected_scenario_activity,
                    latitude,
                    longitude,
                )
            else:
                st.session_state["current_scenario"] = generate_random_scenario(
                    selected_scenario_activity
                )

            st.session_state["current_scenario_activity"] = selected_scenario_activity
            st.session_state["current_scenario_source"] = scenario_source
            st.rerun()

        scenario = st.session_state["current_scenario"]

        if scenario.get("scenario_generation_method") == "historical_weather_v1":
            st.caption(
                f"Historical weather scenario from {scenario.get('historical_date', 'unknown date')} "
                f"at {scenario.get('historical_time', 'unknown time')}."
            )
        else:
            st.caption("Random synthetic scenario.")

        st.subheader(f"Scenario: {activity_label(selected_scenario_activity)}")

        scenario_display_rows = []

        pretty_names = {
            "temperature": "Temperature °F",
            "wind_speed": "Wind speed mph",
            "wind_gust": "Wind gust mph",
            "rain_chance": "Rain chance %",
            "humidity": "Humidity %",
            "cloud_cover": "Cloud cover %",
            "pressure_change": "Pressure change",
            "bug_index": "Bug index",
            "water_temp": "Water temp °F",
            "storm_safety": "Storm safety",
            "dew_point": "Dew point °F",
            "aqi": "AQI",
            "uv_index": "UV index",
            "visibility": "Visibility miles",
            "wind_direction": "Wind direction °",
            "rain_amount": "Rain amount inches",
            "recent_rain_24h": "Recent rain 24h inches",
            "recent_rain_72h": "Recent rain 72h inches",
            "overnight_low": "Overnight low °F",
            "month": "Month",
            "season": "Season",
            "daylight_hours": "Daylight hours",
            "moon_phase": "Moon phase",
            "moon_illumination": "Moon illumination %",
            "pollen_index": "Pollen index",
            "river_flow_cfs": "River flow CFS",
            "gauge_height": "Gauge height",
            "flow_trend": "Flow trend",
            "wave_height_ft": "Wave height ft",
            "rip_current_risk": "Rip current risk",
            "fire_danger": "Fire danger",
        }

        scenario_mode = "basic"

        display_fields = get_shown_features_for_scenario(
            selected_scenario_activity,
            scenario_mode=scenario_mode,
        )

        for key in display_fields:
            value = scenario.get(key)

            scenario_display_rows.append(
                {
                    "Factor": pretty_names.get(key, key),
                    "Value": value,
                }
            )

        st.dataframe(
            pd.DataFrame(scenario_display_rows),
            width="stretch",
        )

        st.write("### Your rating")

        scenario_rating = st.slider(
            "How good does this scenario sound?",
            min_value=1,
            max_value=10,
            value=5,
            help="1 = terrible, 10 = excellent",
            key="scenario_rating_slider",
        )

        scenario_mode = st.selectbox(
            "Scenario detail level",
            options=["basic", "advanced"],
            index=0,
            help="Basic shows the main factors. Advanced can include more context later.",
            key="scenario_mode_select",
        )

        rater_confidence = st.slider(
            "How confident are you in this rating?",
            min_value=1,
            max_value=10,
            value=7,
            help="1 = guessing, 10 = very confident",
            key="scenario_rater_confidence",
        )

        rater_experience_level = st.selectbox(
            "Your experience level for this activity",
            options=["Beginner", "Intermediate", "Advanced", "Expert", "Not sure"],
            index=1,
            key="scenario_experience_level",
        )

        assume_safe_conditions = st.checkbox(
            "Assume normal safety precautions are taken",
            value=True,
            help="Example: wearing a PFD for kayaking, checking local alerts, using sunscreen.",
            key="scenario_assume_safe",
        )

        scenario_notes = st.text_area(
            "Notes",
            placeholder="Example: Wind seems too high, or this looks perfect for evening fishing.",
            key="scenario_rating_notes",
        )

        scenario_save_key = json.dumps(
            clean_json_value(
                {
                    "scenario": scenario,
                    "rating": scenario_rating,
                    "notes": scenario_notes,
                }
            ),
            sort_keys=True,
        )

        if st.button("Save scenario rating"):
            if st.session_state.get("last_saved_scenario_key") == scenario_save_key:
                st.warning(
                    "This scenario rating was already saved. "
                    "Generate a new scenario or change the rating/notes."
                )

            else:
                try:
                    save_scenario_rating(
                        scenario=scenario,
                        rating=scenario_rating,
                        notes=scenario_notes,
                        scenario_mode=scenario_mode,
                        rater_confidence=rater_confidence,
                        rater_experience_level=rater_experience_level,
                        assume_safe_conditions=assume_safe_conditions,
                    )

                    st.session_state["last_saved_scenario_key"] = scenario_save_key

                    st.success("Scenario rating saved.")

                    st.session_state["current_scenario"] = generate_random_scenario(
                        selected_scenario_activity
                    )

                    st.session_state["current_scenario_activity"] = selected_scenario_activity

                    st.rerun()

                except Exception as e:
                    error_text = str(e)

                    if (
                        "duplicate key" in error_text
                        or "scenario_ratings_fingerprint_unique" in error_text
                    ):
                        st.warning("This exact scenario rating already exists.")

                    else:
                        st.error("Could not save scenario rating.")
                        st.write(type(e).__name__)
                        st.write(e)

        st.markdown("---")

        st.subheader("Scenario Insights")

        scenario_ratings = load_scenario_ratings()

        if "id" in scenario_ratings.columns:
            scenario_ratings = scenario_ratings.drop_duplicates(
                subset=["id"],
                keep="first",
            ).reset_index(drop=True)

        if len(scenario_ratings) == 0:
            st.info("No scenario ratings saved yet.")

        else:
            scenario_ratings_clean = prepare_scenario_ratings_for_insights(
                scenario_ratings
            )

            # -------------------------
            # Filters
            # -------------------------

            with st.expander("Filter scenario insights", expanded=False):
                activity_filter_options = ["All"] + sorted(
                    scenario_ratings_clean["activity"]
                    .dropna()
                    .unique()
                    .tolist()
                )

                selected_activity_filter = st.selectbox(
                    "Activity",
                    options=activity_filter_options,
                    key="scenario_insights_activity_filter",
                )

                min_rating_filter = st.slider(
                    "Minimum rating",
                    min_value=1,
                    max_value=10,
                    value=1,
                    key="scenario_insights_min_rating",
                )

                if "rater_confidence" in scenario_ratings_clean.columns:
                    min_confidence_filter = st.slider(
                        "Minimum rater confidence",
                        min_value=1,
                        max_value=10,
                        value=1,
                        key="scenario_insights_min_confidence",
                    )
                else:
                    min_confidence_filter = 1

                if "rater_experience_level" in scenario_ratings_clean.columns:
                    experience_options = ["All"] + sorted(
                        scenario_ratings_clean["rater_experience_level"]
                        .dropna()
                        .unique()
                        .tolist()
                    )

                    selected_experience_filter = st.selectbox(
                        "Experience level",
                        options=experience_options,
                        key="scenario_insights_experience_filter",
                    )
                else:
                    selected_experience_filter = "All"

            filtered_scenarios = scenario_ratings_clean.copy()

            if selected_activity_filter != "All":
                filtered_scenarios = filtered_scenarios[
                    filtered_scenarios["activity"] == selected_activity_filter
                ]

            filtered_scenarios = filtered_scenarios[
                filtered_scenarios["rating"] >= min_rating_filter
            ]

            if "rater_confidence" in filtered_scenarios.columns:
                filtered_scenarios = filtered_scenarios[
                    filtered_scenarios["rater_confidence"].fillna(0) >= min_confidence_filter
                ]

            if (
                selected_experience_filter != "All"
                and "rater_experience_level" in filtered_scenarios.columns
            ):
                filtered_scenarios = filtered_scenarios[
                    filtered_scenarios["rater_experience_level"] == selected_experience_filter
                ]

            # -------------------------
            # Top-level metrics
            # -------------------------

            metric_col1, metric_col2, metric_col3 = st.columns(3)

            with metric_col1:
                st.metric(
                    "Total ratings",
                    len(filtered_scenarios),
                )

            with metric_col2:
                if len(filtered_scenarios) > 0:
                    st.metric(
                        "Average rating",
                        round(filtered_scenarios["rating"].mean(), 1),
                    )
                else:
                    st.metric("Average rating", "N/A")

            with metric_col3:
                if (
                    "rater_confidence" in filtered_scenarios.columns
                    and len(filtered_scenarios) > 0
                ):
                    st.metric(
                        "Average confidence",
                        round(filtered_scenarios["rater_confidence"].mean(), 1),
                    )
                else:
                    st.metric("Average confidence", "N/A")

            if len(filtered_scenarios) == 0:
                st.info("No scenario ratings match the selected filters.")

            else:
                # -------------------------
                # Activity summary
                # -------------------------

                st.write("### Ratings by Activity")

                rating_summary = build_scenario_activity_summary(
                    filtered_scenarios
                )

                st.dataframe(
                    rating_summary,
                    width="stretch",
                )

                st.bar_chart(
                    rating_summary.set_index("activity")["average_rating"]
                )

                # -------------------------
                # Highest and lowest rated scenarios
                # -------------------------

                st.write("### Highest-Rated Scenarios")

                top_scenarios = filtered_scenarios.sort_values(
                    "rating",
                    ascending=False,
                ).head(5)

                top_display_rows = []

                for _, scenario_row in top_scenarios.iterrows():
                    top_display_rows.append(
                        {
                            "Activity": scenario_row.get("activity"),
                            "Rating": scenario_row.get("rating"),
                            "Confidence": scenario_row.get("rater_confidence"),
                            "Scenario": describe_scenario_row(scenario_row),
                            "Notes": scenario_row.get("notes"),
                        }
                    )

                st.dataframe(
                    pd.DataFrame(top_display_rows),
                    width="stretch",
                )

                st.write("### Lowest-Rated Scenarios")

                low_scenarios = filtered_scenarios.sort_values(
                    "rating",
                    ascending=True,
                ).head(5)

                low_display_rows = []

                for _, scenario_row in low_scenarios.iterrows():
                    low_display_rows.append(
                        {
                            "Activity": scenario_row.get("activity"),
                            "Rating": scenario_row.get("rating"),
                            "Confidence": scenario_row.get("rater_confidence"),
                            "Scenario": describe_scenario_row(scenario_row),
                            "Notes": scenario_row.get("notes"),
                        }
                    )

                st.dataframe(
                    pd.DataFrame(low_display_rows),
                    width="stretch",
                )

                # -------------------------
                # Raw data
                # -------------------------

                with st.expander("View raw scenario ratings", expanded=False):
                    st.dataframe(
                        filtered_scenarios,
                        width="stretch",
                    )

                st.download_button(
                    label="Download filtered scenario ratings CSV",
                    data=filtered_scenarios.to_csv(index=False),
                    file_name="scenario_ratings_filtered.csv",
                    mime="text/csv",
                )

        st.subheader("Scenario Progress Goals")

        goal_per_activity = st.number_input(
            "Target ratings per activity",
            min_value=5,
            max_value=500,
            value=25,
            step=5,
            help="A good first target is 25 ratings per activity.",
            key="scenario_goal_per_activity",
        )

        progress_table = build_scenario_progress_table(
            scenario_ratings,
            goal_per_activity=goal_per_activity,
        )

        total_ratings = int(progress_table["rating_count"].sum())
        total_goal = int(progress_table["goal"].sum())
        total_progress = min(total_ratings / total_goal, 1) if total_goal > 0 else 0

        st.write(f"Overall progress: **{total_ratings}/{total_goal} ratings**")
        st.progress(total_progress)

        for _, progress_row in progress_table.iterrows():
            activity = progress_row["activity"]
            rating_count = int(progress_row["rating_count"])
            goal = int(progress_row["goal"])
            remaining = int(progress_row["remaining"])
            progress = float(progress_row["progress"])

            st.write(
                f"**{activity_label(activity)}:** "
                f"{rating_count}/{goal} ratings "
                f"({remaining} remaining)"
            )

            st.progress(progress)

        with st.expander("View scenario progress table", expanded=False):
            st.dataframe(
                progress_table,
                width="stretch",
            )

        st.markdown("---")

        st.subheader("Manage Scenario Ratings")

        scenario_manage_df = load_scenario_ratings()

        if "id" in scenario_manage_df.columns:
            scenario_manage_df = scenario_manage_df.drop_duplicates(
                subset=["id"],
                keep="first",
            ).reset_index(drop=True)

        if len(scenario_manage_df) == 0:
            st.info("No scenario ratings available to manage.")

        elif "id" not in scenario_manage_df.columns:
            st.warning("Scenario rating IDs are not available.")

        else:
            scenario_manage_df["display_label"] = (
                scenario_manage_df["id"].astype(str)
                + " | "
                + scenario_manage_df["activity"].astype(str)
                + " | rating "
                + scenario_manage_df["rating"].astype(str)
                + " | "
                + scenario_manage_df["notes"].fillna("").astype(str).str.slice(0, 40)
            )

            selected_scenario_label = st.selectbox(
                "Choose a scenario rating to edit/delete",
                options=scenario_manage_df["display_label"].tolist(),
                key="manage_scenario_rating_selectbox",
            )

            selected_scenario = scenario_manage_df[
                scenario_manage_df["display_label"] == selected_scenario_label
            ].iloc[0]

            selected_scenario_id = int(selected_scenario["id"])

            st.write("Selected scenario rating:")

            st.dataframe(
                pd.DataFrame([selected_scenario.drop(labels=["display_label"])]),
                width="stretch",
            )

            with st.expander("Edit scenario rating", expanded=True):
                current_rating = selected_scenario.get("rating", 5)

                try:
                    current_rating = int(float(current_rating))
                except Exception:
                    current_rating = 5

                edit_scenario_rating = st.slider(
                    "Rating",
                    min_value=1,
                    max_value=10,
                    value=current_rating,
                    key=f"edit_scenario_rating_{selected_scenario_id}",
                )

                current_confidence = selected_scenario.get("rater_confidence", 7)

                try:
                    if pd.isna(current_confidence):
                        current_confidence = 7
                    current_confidence = int(float(current_confidence))
                except Exception:
                    current_confidence = 7

                edit_rater_confidence = st.slider(
                    "Rater confidence",
                    min_value=1,
                    max_value=10,
                    value=current_confidence,
                    key=f"edit_scenario_confidence_{selected_scenario_id}",
                )

                experience_options = [
                    "Beginner",
                    "Intermediate",
                    "Advanced",
                    "Expert",
                    "Not sure",
                ]

                current_experience = selected_scenario.get(
                    "rater_experience_level",
                    "Not sure",
                )

                if pd.isna(current_experience) or current_experience not in experience_options:
                    current_experience = "Not sure"

                edit_experience_level = st.selectbox(
                    "Experience level",
                    options=experience_options,
                    index=experience_options.index(current_experience),
                    key=f"edit_scenario_experience_{selected_scenario_id}",
                )

                current_assume_safe = selected_scenario.get(
                    "assume_safe_conditions",
                    True,
                )

                if pd.isna(current_assume_safe):
                    current_assume_safe = True

                edit_assume_safe_conditions = st.checkbox(
                    "Assume normal safety precautions are taken",
                    value=bool(current_assume_safe),
                    key=f"edit_scenario_assume_safe_{selected_scenario_id}",
                )

                current_notes = selected_scenario.get("notes", "")

                if pd.isna(current_notes):
                    current_notes = ""

                edit_scenario_notes = st.text_area(
                    "Notes",
                    value=str(current_notes),
                    key=f"edit_scenario_notes_{selected_scenario_id}",
                )

                if st.button(
                    "Save scenario rating edits",
                    key=f"save_scenario_edits_{selected_scenario_id}",
                ):
                    try:
                        update_scenario_rating(
                            selected_scenario_id,
                            {
                                "rating": edit_scenario_rating,
                                "notes": edit_scenario_notes,
                                "rater_confidence": edit_rater_confidence,
                                "rater_experience_level": edit_experience_level,
                                "assume_safe_conditions": edit_assume_safe_conditions,
                            },
                        )

                        st.success("Scenario rating updated.")
                        st.rerun()

                    except Exception as e:
                        st.error("Could not update scenario rating.")
                        st.write(type(e).__name__)
                        st.write(e)

            with st.expander("Danger zone: delete scenario rating", expanded=False):
                st.warning("Deleting a scenario rating cannot be undone.")

                confirm_delete_scenario = st.checkbox(
                    "Yes, delete this scenario rating",
                    key=f"confirm_delete_scenario_{selected_scenario_id}",
                )

                if st.button(
                    "Delete scenario rating",
                    key=f"delete_scenario_rating_{selected_scenario_id}",
                ):
                    if confirm_delete_scenario:
                        try:
                            delete_scenario_rating(selected_scenario_id)

                            st.success("Scenario rating deleted.")
                            st.rerun()

                        except Exception as e:
                            st.error("Could not delete scenario rating.")
                            st.write(type(e).__name__)
                            st.write(e)

                    else:
                        st.warning("Check the confirmation box before deleting.")

with home_tab:
    st.header("Today’s Plan")

    available_dates = sorted(
        predictions["date"]
        .dropna()
        .unique()
        .tolist()
    )

    if len(available_dates) == 0:
        st.info("No forecast dates are available.")

    else:
        today_string = pd.Timestamp.today().strftime("%Y-%m-%d")

        if today_string in available_dates:
            default_home_date_index = available_dates.index(today_string)
        else:
            default_home_date_index = 0

        selected_home_date = st.selectbox(
            "Choose day",
            options=available_dates,
            index=default_home_date_index,
            key="home_selected_date",
        )

        home_day_predictions = predictions[
            predictions["date"] == selected_home_date
        ].copy()

        if len(home_day_predictions) == 0:
            st.info("No activity predictions are available for this date.")

        else:
            home_sort_column = (
                "planning_score"
                if "planning_score" in home_day_predictions.columns
                else "predicted_score"
            )

            home_day_predictions = home_day_predictions.sort_values(
                home_sort_column,
                ascending=False,
            ).reset_index(drop=True)

            top_pick = home_day_predictions.iloc[0]

            saved_locations_for_home = load_saved_locations()
            activity_location_defaults_for_home = load_activity_location_defaults()

            home_default_location = get_default_location_for_activity(
                activity=top_pick["activity"],
                defaults_df=activity_location_defaults_for_home,
                saved_locations_df=saved_locations_for_home,
            )

            home_usgs_water_data = get_usgs_water_data_for_location(home_default_location)
            home_usgs_water_summary = format_usgs_water_summary(home_usgs_water_data)

            home_nws_alerts = get_nws_alerts_for_location(home_default_location)

            home_chop_summary = get_location_chop_summary(
                location=home_default_location,
                wind_speed=top_pick.get("wind_max", 0),
                wind_gust=top_pick.get("gust_max", top_pick.get("wind_max", 0)),
            )

            home_chop_summary_text = format_chop_summary(home_chop_summary)

            if home_default_location is not None:
                home_location_name = home_default_location.get("name", "")
            else:
                home_location_name = ""

            next_best = home_day_predictions.iloc[1:3]

            top_window, top_window_score = get_recommended_window_for_activity(
                time_recommendations=time_recommendations,
                selected_date=top_pick["date"],
                selected_activity=top_pick["activity"],
            )

            # -------------------------
            # Main pick card
            # -------------------------

            with st.container(border=True):
                st.subheader("Top Pick")

                st.markdown(
                    f"### {activity_label(top_pick['activity'])}",
                )

                st.markdown(
                    score_badge_html(
                        top_pick["predicted_score"],
                        top_pick["label"],
                    ),
                    unsafe_allow_html=True,
                )

                metric_col1, metric_col2, metric_col3 = st.columns(3)

                with metric_col1:
                    st.metric(
                        "Best Window",
                        top_window,
                    )

                if home_location_name:
                    st.write(f"**Location:** {home_location_name}")

                if home_usgs_water_summary:
                    st.write(f"**Water data:** {home_usgs_water_summary}")

                if home_chop_summary_text and top_pick["activity"] in ["Fishing", "Kayaking", "Beach Day"]:
                    st.write(f"**Water chop estimate:** {home_chop_summary_text}")

                if len(home_nws_alerts) > 0:
                    st.warning("Active weather alerts for this location:")

                    for alert in home_nws_alerts[:2]:
                        st.write(
                            f"**{alert.get('event')}** — {alert.get('headline')}"
                        )

                with metric_col2:
                    st.metric(
                        "Planning Score",
                        top_pick.get("planning_score", "N/A"),
                    )

                with metric_col3:
                    st.metric(
                        "Forecast Confidence",
                        top_pick.get("forecast_confidence", "N/A"),
                        top_pick.get("forecast_confidence_label", ""),
                    )

                st.write(
                    f"**Weather:** {top_pick.get('avg_temp', 'N/A')}°F, "
                    f"wind {top_pick.get('wind_max', 'N/A')} mph, "
                    f"rain {top_pick.get('rain_chance', 'N/A')}%, "
                    f"bugs {top_pick.get('bug_index', 'N/A')}, "
                    f"water temp est: {top_pick.get('water_temp_est', 'N/A')}°F"
                )

                if home_usgs_water_data and home_usgs_water_data.get("water_temp_f") is not None:
                    st.write(
                        f"**Observed water temp:** "
                        f"{float(home_usgs_water_data['water_temp_f']):.1f}°F"
                    )
                else:
                    st.write(
                        f"**Estimated water temp:** "
                        f"{top_pick.get('water_temp_est', 'N/A')}°F"
                    )

                st.write(f"**Warnings:** {dashboard_warning_text(top_pick)}")

                st.write("**Why this is recommended:**")
                st.write(top_pick["explanation"])

                st.write("**Gear / Safety Notes:**")
                st.write(top_pick["gear_notes"])

                # Fishing species deeper dive
                if top_pick["activity"] == "Fishing":
                    species_breakdown = top_pick.get("species_breakdown", [])

                    if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                        best_species = species_breakdown[0]

                        st.success(
                            f"Best fishing target: {best_species['species']} "
                            f"with score {best_species['score']} "
                            f"({best_species['label']})"
                        )

                # Calendar download for top pick
                try:
                    home_start_dt, home_end_dt = parse_time_window_for_calendar(
                        top_pick["date"],
                        top_window,
                    )

                    home_calendar_title = str(top_pick["activity"])

                    if top_pick["activity"] == "Fishing":
                        species_breakdown = top_pick.get("species_breakdown", [])

                        if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                            best_species = species_breakdown[0]
                            home_calendar_title = f"Fishing - Target {best_species['species']}"

                    home_calendar_description = (
                        f"Predicted score: {top_pick['predicted_score']} ({top_pick['label']})\n"
                        f"Forecast confidence: {top_pick.get('forecast_confidence', 'N/A')} "
                        f"({top_pick.get('forecast_confidence_label', 'N/A')})\n"
                        f"Planning score: {top_pick.get('planning_score', 'N/A')}\n"
                        f"Recommended window: {top_window}\n\n"
                        f"Why: {top_pick['explanation']}\n\n"
                        f"Gear/Safety: {top_pick['gear_notes']}\n\n"
                        f"Weather: {top_pick.get('avg_temp', 'N/A')}°F, "
                        f"wind {top_pick.get('wind_max', 'N/A')} mph, "
                        f"rain {top_pick.get('rain_chance', 'N/A')}%, "
                        f"bugs {top_pick.get('bug_index', 'N/A')}, "
                        f"water temp est {top_pick.get('water_temp_est', 'N/A')}°F"
                    )

                    home_ics_file = create_calendar_event_ics(
                        title=home_calendar_title,
                        start_dt=home_start_dt,
                        end_dt=home_end_dt,
                        description=home_calendar_description,
                        location="",
                    )

                    st.download_button(
                        label="Add top pick to calendar",
                        data=home_ics_file,
                        file_name=f"home-{clean_filename(top_pick['activity'])}-{top_pick['date']}.ics",
                        mime="text/calendar",
                        key=f"home_calendar_{top_pick['date']}_{top_pick['activity']}",
                    )

                except Exception:
                    st.caption("Calendar export is not available for this recommendation.")

            # -------------------------
            # Next best options
            # -------------------------

            if len(next_best) > 0:
                st.subheader("Other Good Options")

                for rank, (_, option_row) in enumerate(next_best.iterrows(), start=2):
                    option_window, option_window_score = get_recommended_window_for_activity(
                        time_recommendations=time_recommendations,
                        selected_date=option_row["date"],
                        selected_activity=option_row["activity"],
                    )

                    expander_title = (
                        f"#{rank}: {activity_label(option_row['activity'])} — "
                        f"{option_row['predicted_score']} ({option_row['label']})"
                    )

                    with st.expander(expander_title, expanded=False):
                        st.markdown(
                            score_badge_html(
                                option_row["predicted_score"],
                                option_row["label"],
                            ),
                            unsafe_allow_html=True,
                        )

                        st.write(f"**Best window:** {option_window}")

                        if option_window_score is not None:
                            st.write(f"**Window score:** {option_window_score}")

                        st.write(
                            f"**Forecast confidence:** "
                            f"{option_row.get('forecast_confidence', 'N/A')} "
                            f"({option_row.get('forecast_confidence_label', 'N/A')})"
                        )

                        st.write(
                            f"**Planning score:** {option_row.get('planning_score', 'N/A')}"
                        )

                        st.write(
                            f"**Weather:** {option_row.get('avg_temp', 'N/A')}°F, "
                            f"wind {option_row.get('wind_max', 'N/A')} mph, "
                            f"rain {option_row.get('rain_chance', 'N/A')}%, "
                            f"bugs {option_row.get('bug_index', 'N/A')}"
                        )

                        st.write(f"**Warnings:** {dashboard_warning_text(option_row)}")

                        st.write("**Why this is a good option:**")
                        st.write(option_row["explanation"])

                        st.write("**Gear / Safety Notes:**")
                        st.write(option_row["gear_notes"])

                        if option_row["activity"] == "Fishing":
                            species_breakdown = option_row.get("species_breakdown", [])

                            if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                                best_species = species_breakdown[0]

                                st.success(
                                    f"Best fishing target: {best_species['species']} "
                                    f"with score {best_species['score']} "
                                    f"({best_species['label']})"
                                )

with planner_tab:
    st.header("Planner")

    st.write(
        "Plan your week and track how the forecast changes before your activity."
    )

    planner_dates = sorted(
        predictions["date"]
        .dropna()
        .unique()
        .tolist()
    )

    if len(planner_dates) == 0:
        st.info("No forecast dates are available.")

    else:
        # -------------------------
        # Planner controls
        # -------------------------

        control_col1, control_col2, control_col3 = st.columns(3)

        with control_col1:
            planner_view = st.radio(
                "View",
                options=["Week", "Weekend"],
                horizontal=True,
                key="planner_view_mode",
            )

        with control_col2:
            activity_group = st.selectbox(
                "Activity group",
                options=[
                    "All",
                    "Water",
                    "Land",
                    "Fishing only",
                ],
                key="planner_activity_group",
            )

        with control_col3:
            minimum_planning_score = st.slider(
                "Minimum planning score",
                min_value=0,
                max_value=100,
                value=60,
                step=5,
                key="planner_minimum_planning_score",
            )

        planner_predictions = predictions.copy()

        if planner_view == "Weekend":
            planner_predictions = get_weekend_predictions(
                planner_predictions
            )

        if activity_group == "Water":
            water_activities = ["Fishing", "Kayaking", "Beach Day"]
            planner_predictions = planner_predictions[
                planner_predictions["activity"].isin(water_activities)
            ]

        elif activity_group == "Land":
            land_activities = [
                "Camping",
                "Running",
                "Disc Golf",
                "Tennis",
            ]
            planner_predictions = planner_predictions[
                planner_predictions["activity"].isin(land_activities)
            ]

        elif activity_group == "Fishing only":
            planner_predictions = planner_predictions[
                planner_predictions["activity"] == "Fishing"
            ]

        sort_column = (
            "planning_score"
            if "planning_score" in planner_predictions.columns
            else "predicted_score"
        )

        if len(planner_predictions) > 0:
            planner_predictions = planner_predictions[
                planner_predictions[sort_column] >= minimum_planning_score
            ]

        if len(planner_predictions) == 0:
            st.info("No predictions match this planner view and minimum score.")

        else:
            # -------------------------
            # Best opportunities
            # -------------------------

            saved_locations_for_planner = load_saved_locations()
            activity_location_defaults_for_planner = load_activity_location_defaults()

            st.subheader("Best Opportunities")

            top_opportunity_count = st.slider(
                "Number of opportunities to show",
                min_value=3,
                max_value=10,
                value=5,
                step=1,
                key="planner_top_opportunity_count",
            )

            top_opportunities = planner_predictions.sort_values(
                sort_column,
                ascending=False,
            ).head(top_opportunity_count)

            for _, row in top_opportunities.iterrows():
                recommended_window, window_score = get_recommended_window_for_activity(
                    time_recommendations=time_recommendations,
                    selected_date=row["date"],
                    selected_activity=row["activity"],
                )

                default_location = get_default_location_for_activity(
                    activity=row["activity"],
                    defaults_df=activity_location_defaults_for_planner,
                    saved_locations_df=saved_locations_for_planner,
                )

                if default_location is not None:
                    planner_location_name = default_location.get("name", "")
                    planner_location_context = build_location_context_from_location(
                        default_location
                    )
                else:
                    planner_location_name = ""
                    planner_location_context = {
                        "latitude": latitude,
                        "longitude": longitude,
                        "location_query": st.session_state.get("location_query"),
                    }

                usgs_water_data = get_usgs_water_data_for_location(default_location)
                usgs_water_summary = format_usgs_water_summary(usgs_water_data)

                nws_alerts = get_nws_alerts_for_location(default_location)

                chop_summary = get_location_chop_summary(
                    location=default_location,
                    wind_speed=row.get("wind_max", 0),
                    wind_gust=row.get("gust_max", row.get("wind_max", 0)),
                )

                chop_summary_text = format_chop_summary(chop_summary)

                with st.container(border=True):
                    card_col1, card_col2 = st.columns([2, 1])

                    with card_col1:
                        st.subheader(
                            f"{activity_label(row['activity'])} — {row['date']}"
                        )

                        st.markdown(
                            score_badge_html(
                                row["predicted_score"],
                                row["label"],
                            ),
                            unsafe_allow_html=True,
                        )

                        st.write(f"**Suggested window:** {recommended_window}")

                        if planner_location_name:
                            st.write(f"**Location:** {planner_location_name}")

                        if usgs_water_summary:
                            st.write(f"**Water data:** {usgs_water_summary}")

                        if chop_summary_text and row["activity"] in ["Fishing", "Kayaking", "Beach Day"]:
                            st.write(f"**Water chop estimate:** {chop_summary_text}")

                        if len(nws_alerts) > 0:
                            st.warning("Active weather alerts for this location:")

                            for alert in nws_alerts[:2]:
                                st.write(
                                    f"**{alert.get('event')}** — {alert.get('headline')}"
                                )

                        st.write(
                            f"**Planning score:** {row.get('planning_score', 'N/A')}"
                        )

                        st.write(
                            f"**Forecast confidence:** "
                            f"{row.get('forecast_confidence', 'N/A')} "
                            f"({row.get('forecast_confidence_label', 'N/A')})"
                        )

                        st.write(f"**Warnings:** {dashboard_warning_text(row)}")

                        if row["activity"] == "Fishing":
                            species_breakdown = row.get("species_breakdown", [])

                            if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                                best_species = species_breakdown[0]

                                st.success(
                                    f"Best fishing target: {best_species['species']} "
                                    f"({best_species['score']} · {best_species['label']})"
                                )

                    with card_col2:
                        try:
                            start_dt, end_dt = parse_time_window_for_calendar(
                                row["date"],
                                recommended_window,
                            )

                            calendar_title = str(row["activity"])

                            if row["activity"] == "Fishing":
                                species_breakdown = row.get("species_breakdown", [])

                                if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                                    best_species = species_breakdown[0]
                                    calendar_title = f"Fishing - Target {best_species['species']}"

                            calendar_description = (
                                f"Predicted score: {row['predicted_score']} ({row['label']})\n"
                                f"Forecast confidence: {row.get('forecast_confidence', 'N/A')} "
                                f"({row.get('forecast_confidence_label', 'N/A')})\n"
                                f"Planning score: {row.get('planning_score', 'N/A')}\n"
                                f"Recommended window: {recommended_window}\n\n"
                                f"Why: {row['explanation']}\n\n"
                                f"Gear/Safety: {row['gear_notes']}\n\n"
                                f"Weather: {row.get('avg_temp', 'N/A')}°F, "
                                f"wind {row.get('wind_max', 'N/A')} mph, "
                                f"rain {row.get('rain_chance', 'N/A')}%, "
                                f"bugs {row.get('bug_index', 'N/A')}, "
                                f"estimated water temp {row.get('water_temp_est', 'N/A')}°F"
                            )

                            if usgs_water_summary:
                                calendar_description += f"\nWater data: {usgs_water_summary}"
                            
                            if chop_summary_text:
                                calendar_description += f"\nWater chop estimate: {chop_summary_text}"

                            if len(nws_alerts) > 0:
                                calendar_description += "\n\nActive alerts:\n"

                                for alert in nws_alerts[:3]:
                                    calendar_description += f"- {alert.get('event')}: {alert.get('headline')}\n"

                            ics_file = create_calendar_event_ics(
                                title=calendar_title,
                                start_dt=start_dt,
                                end_dt=end_dt,
                                description=calendar_description,
                                location=planner_location_name,
                            )

                            filename = (
                                f"{clean_filename(row['activity'])}-"
                                f"{row['date']}.ics"
                            )

                            st.download_button(
                                label="Add to calendar",
                                data=ics_file,
                                file_name=filename,
                                mime="text/calendar",
                                key=f"planner_calendar_{row['date']}_{row['activity']}",
                            )

                        except Exception:
                            st.caption("Calendar export unavailable.")

                        plan_notes = st.text_area(
                            "Plan notes",
                            placeholder="Optional notes for this plan",
                            key=f"planner_notes_{row['date']}_{row['activity']}",
                        )

                        if st.button(
                            "Save as planned",
                            key=f"save_plan_{row['date']}_{row['activity']}",
                        ):
                            try:
                                create_planned_activity_from_prediction(
                                    prediction_row=row,
                                    recommended_window=recommended_window,
                                    notes=plan_notes,
                                    location_name=planner_location_name,
                                    location_context=planner_location_context,
                                )

                                st.success("Activity saved as planned.")
                                st.rerun()

                            except Exception as e:
                                st.error("Could not save planned activity.")
                                st.write(type(e).__name__)
                                st.write(e)

            # -------------------------
            # Calendar-style day cards
            # -------------------------

            st.subheader("Calendar View")

            for planner_date in sorted(planner_predictions["date"].unique()):
                day_rows = planner_predictions[
                    planner_predictions["date"] == planner_date
                ].copy()

                if len(day_rows) == 0:
                    continue

                day_rows = day_rows.sort_values(
                    sort_column,
                    ascending=False,
                ).reset_index(drop=True)

                best = day_rows.iloc[0]
                alternatives = day_rows.iloc[1:3]

                recommended_window, _ = get_recommended_window_for_activity(
                    time_recommendations=time_recommendations,
                    selected_date=best["date"],
                    selected_activity=best["activity"],
                )

                best_default_location = get_default_location_for_activity(
                    activity=best["activity"],
                    defaults_df=activity_location_defaults_for_planner,
                    saved_locations_df=saved_locations_for_planner,
                )

                if best_default_location is not None:
                    best_location_name = best_default_location.get("name", "")
                else:
                    best_location_name = ""

                best_usgs_water_data = get_usgs_water_data_for_location(
                    best_default_location
                )

                best_usgs_water_summary = format_usgs_water_summary(
                    best_usgs_water_data
                )

                best_nws_alerts = get_nws_alerts_for_location(
                    best_default_location
                )

                with st.container(border=True):
                    st.markdown(
                        f"### {planner_date}: {activity_label(best['activity'])}"
                    )

                    day_col1, day_col2, day_col3 = st.columns(3)

                    with day_col1:
                        st.markdown(
                            score_badge_html(
                                best["predicted_score"],
                                best["label"],
                            ),
                            unsafe_allow_html=True,
                        )

                    with day_col2:
                        st.metric(
                            "Planning",
                            best.get("planning_score", "N/A"),
                            best.get("forecast_confidence_label", ""),
                        )

                    with day_col3:
                        st.metric(
                            "Window",
                            recommended_window,
                        )

                    if best_location_name:
                        st.write(f"**Location:** {best_location_name}")

                    if best_usgs_water_summary:
                        st.write(f"**Water data:** {best_usgs_water_summary}")

                    if len(best_nws_alerts) > 0:
                        st.warning("Active weather alerts for this location:")

                        for alert in best_nws_alerts[:2]:
                            st.write(
                                f"**{alert.get('event')}** — {alert.get('headline')}"
                            )

                    st.write(f"**Warnings:** {dashboard_warning_text(best)}")

                    if len(alternatives) > 0:
                        alt_text = []

                        for _, alt in alternatives.iterrows():
                            alt_text.append(
                                f"{activity_label(alt['activity'])} "
                                f"{int(alt['predicted_score'])}"
                            )

                        st.caption(
                            "Other options: " + " · ".join(alt_text)
                        )

                    with st.expander("View all activity details", expanded=False):
                        for _, detail_row in day_rows.iterrows():
                            detail_window, detail_window_score = get_recommended_window_for_activity(
                                time_recommendations=time_recommendations,
                                selected_date=detail_row["date"],
                                selected_activity=detail_row["activity"],
                            )

                            detail_default_location = get_default_location_for_activity(
                                activity=detail_row["activity"],
                                defaults_df=activity_location_defaults_for_planner,
                                saved_locations_df=saved_locations_for_planner,
                            )

                            detail_usgs_water_data = get_usgs_water_data_for_location(
                                detail_default_location
                            )

                            detail_usgs_water_summary = format_usgs_water_summary(
                                detail_usgs_water_data
                            )

                            st.markdown(
                                f"**{activity_label(detail_row['activity'])}: "
                                f"{detail_row['predicted_score']} "
                                f"({detail_row['label']})**"
                            )

                            st.write(f"Suggested window: {detail_window}")

                            st.write(
                                f"Planning score: "
                                f"{detail_row.get('planning_score', 'N/A')}"
                            )

                            st.write(
                                f"Forecast confidence: "
                                f"{detail_row.get('forecast_confidence', 'N/A')} "
                                f"({detail_row.get('forecast_confidence_label', 'N/A')})"
                            )

                            st.write(
                                f"Weather: {detail_row.get('avg_temp', 'N/A')}°F, "
                                f"wind {detail_row.get('wind_max', 'N/A')} mph, "
                                f"rain {detail_row.get('rain_chance', 'N/A')}%, "
                                f"bugs {detail_row.get('bug_index', 'N/A')}"
                            )

                            if detail_usgs_water_summary:
                                st.write(f"Water data: {detail_usgs_water_summary}")
                            else:
                                st.write(
                                    f"Estimated water temp: "
                                    f"{detail_row.get('water_temp_est', 'N/A')}°F"
                                )

                            st.write(detail_row["explanation"])

                            st.markdown("---")

            # -------------------------
            # Best day by activity
            # -------------------------

            st.subheader("Best Day for Each Activity")

            best_day_by_activity = build_best_day_by_activity(
                planner_predictions
            )

            if len(best_day_by_activity) == 0:
                st.info("No best-day activity data available.")

            else:
                st.dataframe(
                    best_day_by_activity,
                    width="stretch",
                )

        # -------------------------
        # Planned activities
        # -------------------------

        st.subheader("Planned Activities")

        plans = load_planned_activities()

        if len(plans) == 0:
            st.info("No planned activities yet.")

        else:
            plans_with_current = update_plans_with_current_forecast(
                plans,
                predictions,
            )

            st.dataframe(
                plans_with_current.sort_values("planned_date"),
                width="stretch",
            )

            plans_with_current["display_label"] = (
                plans_with_current["id"].astype(str)
                + " | "
                + plans_with_current["planned_date"].astype(str)
                + " | "
                + plans_with_current["activity"].astype(str)
                + " | "
                + plans_with_current["status"].astype(str)
            )

            selected_plan_label = st.selectbox(
                "Choose planned activity to update",
                options=plans_with_current["display_label"].tolist(),
                key="planner_selected_plan",
            )

            selected_plan = plans_with_current[
                plans_with_current["display_label"] == selected_plan_label
            ].iloc[0]

            selected_plan_id = int(selected_plan["id"])

            status_col1, status_col2 = st.columns(2)

            with status_col1:
                new_plan_status = st.selectbox(
                    "Status",
                    options=PLAN_STATUSES,
                    index=PLAN_STATUSES.index(selected_plan["status"])
                    if selected_plan["status"] in PLAN_STATUSES
                    else 0,
                    key=f"planner_status_{selected_plan_id}",
                )

                if st.button(
                    "Update plan status",
                    key=f"update_plan_status_{selected_plan_id}",
                ):
                    update_planned_activity_status(
                        selected_plan_id,
                        new_plan_status,
                    )

                    st.success("Plan status updated.")
                    st.rerun()

            with status_col2:
                confirm_delete_plan = st.checkbox(
                    "Delete this planned activity",
                    key=f"confirm_delete_plan_{selected_plan_id}",
                )

                if st.button(
                    "Delete planned activity",
                    key=f"delete_plan_{selected_plan_id}",
                ):
                    if confirm_delete_plan:
                        delete_planned_activity(selected_plan_id)
                        st.success("Planned activity deleted.")
                        st.rerun()
                    else:
                        st.warning("Check the confirmation box before deleting.")

# -------------------------
# Log actual result
# -------------------------
with log_tab:
    st.header("Log an Actual Result")

    log_mode = st.radio(
        "What type of entry are you logging?",
        options=["Current forecast date", "Past/custom date"],
        horizontal=True,
    )

    activity_options = sorted(predictions["activity"].unique())

    if log_mode == "Current forecast date":
        col1, col2 = st.columns(2)

        with col1:
            selected_date = st.selectbox(
                "Choose the date",
                options=sorted(predictions["date"].unique()),
                key="current_log_date",
            )

        with col2:
            activities_for_date = sorted(
                predictions[predictions["date"] == selected_date]["activity"].unique()
            )

            selected_activity = st.selectbox(
                "Choose the activity",
                options=activities_for_date,
                key="current_log_activity",
            )

    else:
        col1, col2 = st.columns(2)

        with col1:
            default_past_date = (pd.Timestamp.today() - pd.Timedelta(days=1)).date()

            selected_date_obj = st.date_input(
                "Date of activity",
                value=default_past_date,
                key="past_log_date",
            )

            selected_date = pd.to_datetime(selected_date_obj).strftime("%Y-%m-%d")

        with col2:
            selected_activity = st.selectbox(
                "Choose the activity",
                options=activity_options,
                key="past_log_activity",
            )


    selected_prediction = find_saved_prediction(
        predictions=predictions,
        selected_date=selected_date,
        selected_activity=selected_activity,
    )


    if selected_prediction is not None:
        predicted_score = int(selected_prediction["predicted_score"])
        predicted_label = selected_prediction.get("label", score_label(predicted_score))
        prediction_explanation = selected_prediction.get("explanation", "")
        prediction_gear_notes = selected_prediction.get("gear_notes", "")

    else:
        st.warning(
            "No saved prediction was found for this date/activity. "
            "You can manually enter the predicted score if you remember it."
        )

        know_predicted_score = st.checkbox(
            "I know or remember the predicted score",
            value=False,
        )

        if know_predicted_score:
            predicted_score = st.number_input(
                "Manually enter predicted score",
                min_value=0,
                max_value=100,
                value=50,
            )

            predicted_score = int(predicted_score)
            predicted_label = score_label(predicted_score)
        else:
            predicted_score = None
            predicted_label = "No prediction"

        prediction_explanation = "No saved prediction explanation available."
        prediction_gear_notes = "No saved gear notes available."


    st.subheader("Prediction Details")

    metric1, metric2, metric3 = st.columns(3)

    with metric1:
        if predicted_score is None:
            st.metric("Predicted Score", "N/A")
        else:
            st.metric("Predicted Score", predicted_score)

    with metric2:
        st.metric("Predicted Label", predicted_label)

    with metric3:
        st.metric("Activity", selected_activity)

    st.write("**Why this score:**")
    st.write(prediction_explanation)

    st.write("**Gear / Safety Notes:**")
    st.write(prediction_gear_notes)


    recommended_time_window, time_window_score = get_recommended_window_for_activity(
        time_recommendations=time_recommendations,
        selected_date=selected_date,
        selected_activity=selected_activity,
    )

    if log_mode == "Past/custom date" and recommended_time_window == "Not available":
        recommended_time_window = "Not available for this past/custom date"

    st.write("**Recommended Time Window:**")
    st.write(recommended_time_window)

    if time_window_score is not None:
        st.write(f"Window score: {time_window_score}")

    if selected_activity == "Running":
        matching_time = time_recommendations[
            time_recommendations["date"] == selected_date
        ]

        if len(matching_time) > 0:
            st.write(matching_time.iloc[0].get("Running Light Note", ""))

    st.subheader("Your Actual Experience")

    actual_enjoyment = st.slider(
        "How good was it actually?",
        min_value=1,
        max_value=10,
        value=7,
        help="1 = terrible, 10 = excellent",
    )

    actual_score = actual_enjoyment * 10

    did_i_go = st.selectbox(
        "Did you actually do this activity?",
        options=["Yes", "No", "Partially"],
    )

    with st.expander("Optional actual conditions", expanded=False):
        st.subheader("Actual Conditions")

        actual_time = st.text_input(
            "What time did you actually go?",
            placeholder="Example: 7:30 AM or 6:00 PM",
        )

        followed_recommended_window = st.selectbox(
            "Did you go during the recommended time window?",
            options=["Not sure", "Yes", "No", "Partially"],
        )

        actual_bugs = st.slider(
            "Actual bugs",
            min_value=0,
            max_value=10,
            value=5,
            help="0 = no bugs, 10 = terrible bugs",
        )

        actual_wind_annoyance = st.slider(
            "Actual wind annoyance",
            min_value=0,
            max_value=10,
            value=5,
            help="0 = no wind problem, 10 = wind ruined it",
        )

        actual_humidity_comfort = st.slider(
            "Actual humidity comfort",
            min_value=0,
            max_value=10,
            value=7,
            help="0 = miserable humidity, 10 = very comfortable",
        )

        actual_ground_wetness = "Not applicable"
        actual_water_conditions = "Not applicable"
        fish_activity = "Not applicable"
        visibility_light = "Not applicable"

        if selected_activity in ["Camping", "Running", "Disc Golf", "Tennis"]:
            actual_ground_wetness = st.selectbox(
                "Actual ground/course/trail condition",
                options=["Dry", "Damp", "Muddy", "Very muddy", "Not sure"],
            )

        if selected_activity in FISHING_ACTIVITIES + ["Kayaking", "Beach Day"]:
            actual_water_conditions = st.selectbox(
                "Actual water conditions",
                options=["Calm", "Light chop", "Choppy", "Rough", "Unsafe", "Not sure"],
            )

        if selected_activity in FISHING_ACTIVITIES:
            fish_activity = st.selectbox(
                "Fish activity",
                options=["None", "Low", "Medium", "High", "Not sure"],
            )

        if selected_activity == "Running":
            visibility_light = st.selectbox(
                "Visibility/light conditions",
                options=["Bright daylight", "Low light but okay", "Too dark", "Not sure"],
            )

    notes = st.text_area(
        "Notes",
        placeholder="Example: Bugs were worse than expected. Wind felt stronger. Fish were active near sunset.",
    )

    if st.button("Save Log Entry"):
        if predicted_score is None:
            prediction_error = None
            absolute_error = None
        else:
            prediction_error = actual_score - predicted_score
            absolute_error = abs(prediction_error)

        new_entry = {
            "logged_at": datetime.now().isoformat(timespec="seconds"),
            "date": selected_date,
            "activity": selected_activity,
            "predicted_score": predicted_score if predicted_score is not None else "",
            "recommended_time_window": recommended_time_window,
            "time_window_score": time_window_score,
            "actual_time": actual_time,
            "followed_recommended_window": followed_recommended_window,
            "actual_enjoyment_1_to_10": actual_enjoyment,
            "actual_score_0_to_100": actual_score,
            "prediction_error": prediction_error,
            "absolute_error": absolute_error,
            "did_i_go": did_i_go,
            "actual_bugs_1_to_10": actual_bugs,
            "actual_wind_annoyance_1_to_10": actual_wind_annoyance,
            "actual_humidity_comfort_1_to_10": actual_humidity_comfort,
            "actual_ground_wetness": actual_ground_wetness,
            "actual_water_conditions": actual_water_conditions,
            "fish_activity": fish_activity,
            "visibility_light": visibility_light,
            "notes": notes,
        }

        try:
            response = save_log_entry(new_entry)
            load_activity_log.clear()

            st.success("Log entry saved to Supabase!")
            st.rerun()

        except Exception as e:
            st.error("Could not save log entry to Supabase.")
            st.write(type(e).__name__)
            st.write(e)

# -------------------------
# Show history
# -------------------------
with history_tab:
    st.header("Prediction vs. Actual History")

    if len(activity_log) == 0:
        st.info("No activity logs yet. Save your first entry above.")

    else:
        st.dataframe(
            activity_log.sort_values("logged_at", ascending=False),
            width="stretch",
        )

        show_accuracy_charts(activity_log)

        st.subheader("Model Accuracy Report")

        accuracy_summary, accuracy_insights = build_accuracy_report(activity_log)

        if len(accuracy_summary) == 0:
            st.info("Not enough complete logs for an accuracy report yet.")
        else:
            st.dataframe(accuracy_summary, width="stretch")

            for insight in accuracy_insights:
                st.info(insight)

        st.write(
            """
            **How to read this:**

            - Positive error means the activity was better than predicted.
            - Negative error means it was worse than predicted.
            - Lower average absolute error means your model is more accurate.
            """
        )

        activity_log_csv = activity_log.to_csv(index=False)

        st.subheader("Personal Tuning Suggestions")

        tuning_suggestions = build_tuning_suggestions(activity_log)

        for suggestion in tuning_suggestions:
            st.warning(suggestion)

        st.download_button(
            label="Download activity log as CSV",
            data=activity_log_csv,
            file_name="activity_log.csv",
            mime="text/csv",
        )


with manage_tab:
    st.header("Manage")

    manage_view = st.radio(
        "What would you like to manage?",
        options=[
            "Activity Logs",
            "Saved Locations",
            "Planned Activities",
        ],
        horizontal=True,
        key="manage_view_selector",
    )

    if manage_view == "Activity Logs":
        st.subheader("Activity Logs")

        activity_log = load_activity_log()

        if len(activity_log) == 0:
            st.info("No log entries available to manage.")

        elif "id" not in activity_log.columns:
            st.warning("Log IDs are not available, so entries cannot be edited or deleted yet.")

        else:
            manage_log = activity_log.copy()

            manage_log["display_label"] = (
                manage_log["id"].astype(str)
                + " | "
                + manage_log["date"].astype(str)
                + " | "
                + manage_log["activity"].astype(str)
                + " | score "
                + manage_log["actual_enjoyment_1_to_10"].astype(str)
                + " | "
                + manage_log["notes"].fillna("").astype(str).str.slice(0, 40)
            )

            selected_log_label = st.selectbox(
                "Choose a log entry to manage",
                options=manage_log["display_label"].tolist(),
                key="manage_log_selectbox",
            )

            selected_log = manage_log[
                manage_log["display_label"] == selected_log_label
            ].iloc[0]

            selected_log_id = int(selected_log["id"])

            st.write("Selected log:")

            st.dataframe(
                pd.DataFrame([selected_log.drop(labels=["display_label"])]),
                width="stretch",
            )

            st.markdown("---")
            st.write("### Edit Selected Log")

            def safe_int_value(value, default=5):
                try:
                    if pd.isna(value):
                        return default
                    return int(float(value))
                except Exception:
                    return default

            def safe_text_value(value, default=""):
                try:
                    if pd.isna(value):
                        return default
                    return str(value)
                except Exception:
                    return default

            def safe_option_value(value, options, default):
                value = safe_text_value(value, default)

                if value in options:
                    return value

                return default

            with st.expander("Edit score and notes", expanded=True):
                actual_time_edit = st.text_input(
                    "Actual time",
                    value=safe_text_value(selected_log.get("actual_time", "")),
                    key=f"edit_actual_time_{selected_log_id}",
                )

                enjoyment_edit = st.slider(
                    "Actual enjoyment score",
                    min_value=1,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_enjoyment_1_to_10", 7),
                        default=7,
                    ),
                    key=f"edit_enjoyment_{selected_log_id}",
                )

                did_i_go_options = ["Yes", "No", "Partially"]

                did_i_go_edit = st.selectbox(
                    "Did you actually do this activity?",
                    options=did_i_go_options,
                    index=did_i_go_options.index(
                        safe_option_value(
                            selected_log.get("did_i_go", "Yes"),
                            did_i_go_options,
                            "Yes",
                        )
                    ),
                    key=f"edit_did_i_go_{selected_log_id}",
                )

                notes_edit = st.text_area(
                    "Notes",
                    value=safe_text_value(selected_log.get("notes", "")),
                    key=f"edit_notes_{selected_log_id}",
                )

            with st.expander("Edit conditions", expanded=False):
                followed_options = ["Not sure", "Yes", "No", "Partially"]

                followed_recommended_window_edit = st.selectbox(
                    "Did you go during the recommended time window?",
                    options=followed_options,
                    index=followed_options.index(
                        safe_option_value(
                            selected_log.get("followed_recommended_window", "Not sure"),
                            followed_options,
                            "Not sure",
                        )
                    ),
                    key=f"edit_followed_window_{selected_log_id}",
                )

                actual_bugs_edit = st.slider(
                    "Actual bugs",
                    min_value=0,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_bugs_1_to_10", 5),
                        default=5,
                    ),
                    key=f"edit_bugs_{selected_log_id}",
                )

                actual_wind_annoyance_edit = st.slider(
                    "Actual wind annoyance",
                    min_value=0,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_wind_annoyance_1_to_10", 5),
                        default=5,
                    ),
                    key=f"edit_wind_{selected_log_id}",
                )

                actual_humidity_comfort_edit = st.slider(
                    "Actual humidity comfort",
                    min_value=0,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_humidity_comfort_1_to_10", 7),
                        default=7,
                    ),
                    key=f"edit_humidity_{selected_log_id}",
                )

                ground_options = ["Dry", "Damp", "Muddy", "Very muddy", "Not sure", "Not applicable"]

                actual_ground_wetness_edit = st.selectbox(
                    "Actual ground/course/trail condition",
                    options=ground_options,
                    index=ground_options.index(
                        safe_option_value(
                            selected_log.get("actual_ground_wetness", "Not applicable"),
                            ground_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_ground_{selected_log_id}",
                )

                water_options = ["Calm", "Light chop", "Choppy", "Rough", "Unsafe", "Not sure", "Not applicable"]

                actual_water_conditions_edit = st.selectbox(
                    "Actual water conditions",
                    options=water_options,
                    index=water_options.index(
                        safe_option_value(
                            selected_log.get("actual_water_conditions", "Not applicable"),
                            water_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_water_{selected_log_id}",
                )

                fish_options = ["None", "Low", "Medium", "High", "Not sure", "Not applicable"]

                fish_activity_edit = st.selectbox(
                    "Fish activity",
                    options=fish_options,
                    index=fish_options.index(
                        safe_option_value(
                            selected_log.get("fish_activity", "Not applicable"),
                            fish_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_fish_{selected_log_id}",
                )

                visibility_options = ["Bright daylight", "Low light but okay", "Too dark", "Not sure", "Not applicable"]

                visibility_light_edit = st.selectbox(
                    "Visibility/light conditions",
                    options=visibility_options,
                    index=visibility_options.index(
                        safe_option_value(
                            selected_log.get("visibility_light", "Not applicable"),
                            visibility_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_visibility_{selected_log_id}",
                )

            predicted_score_for_edit = selected_log.get("predicted_score", None)
            actual_score_edit = enjoyment_edit * 10

            try:
                if pd.isna(predicted_score_for_edit):
                    prediction_error_edit = None
                    absolute_error_edit = None
                else:
                    prediction_error_edit = actual_score_edit - float(predicted_score_for_edit)
                    absolute_error_edit = abs(prediction_error_edit)
            except Exception:
                prediction_error_edit = None
                absolute_error_edit = None

            if st.button("Save edits to selected log", key=f"save_edits_{selected_log_id}"):
                updated_entry = {
                    "actual_time": actual_time_edit,
                    "followed_recommended_window": followed_recommended_window_edit,
                    "actual_enjoyment_1_to_10": enjoyment_edit,
                    "actual_score_0_to_100": actual_score_edit,
                    "prediction_error": prediction_error_edit,
                    "absolute_error": absolute_error_edit,
                    "did_i_go": did_i_go_edit,
                    "actual_bugs_1_to_10": actual_bugs_edit,
                    "actual_wind_annoyance_1_to_10": actual_wind_annoyance_edit,
                    "actual_humidity_comfort_1_to_10": actual_humidity_comfort_edit,
                    "actual_ground_wetness": actual_ground_wetness_edit,
                    "actual_water_conditions": actual_water_conditions_edit,
                    "fish_activity": fish_activity_edit,
                    "visibility_light": visibility_light_edit,
                    "notes": notes_edit,
                }

                try:
                    update_log_entry(selected_log_id, updated_entry)
                    load_activity_log.clear()
                    st.success("Log entry updated.")
                    st.rerun()

                except Exception as e:
                    st.error("Could not update log entry.")
                    st.write(type(e).__name__)
                    st.write(e)

            st.markdown("---")

            with st.expander("Danger zone: delete log", expanded=False):
                st.warning("Deleting a log entry cannot be undone.")

                confirm_delete = st.checkbox(
                    "Yes, I want to delete this log entry",
                    key=f"confirm_delete_log_{selected_log_id}",
                )

                if st.button("Delete selected log entry", key=f"delete_log_button_{selected_log_id}"):
                    if confirm_delete:
                        delete_log_entry(selected_log_id)
                        load_activity_log.clear()

                        st.success("Log entry deleted.")
                        st.rerun()

                    else:
                        st.warning("Check the confirmation box before deleting.")

    elif manage_view == "Saved Locations":
        st.subheader("Saved Locations")

        saved_locations = load_saved_locations()

        st.write("### Add New Location")

        location_search_input = st.text_input(
            "Search address/place or paste map link",
            placeholder="Example: Gallup Park Ann Arbor or 3000 Fuller Rd Ann Arbor",
            key="manage_new_location_search_input",
        )

        if st.button("Find saved location candidate", key="manage_find_location_candidate"):
            location_search_results = search_location_anything(
                location_search_input
            )

            st.session_state["new_location_search_results"] = location_search_results

            if len(location_search_results) == 0:
                st.warning("No matching locations found. Try a different search.")
            else:
                st.success("Location candidates found.")

        location_search_results = st.session_state.get(
            "new_location_search_results",
            [],
        )

        selected_candidate = None

        if len(location_search_results) > 0:
            candidate_labels = [
                f"{item['label']} ({item.get('source', 'source unknown')})"
                for item in location_search_results
            ]

            selected_candidate_label = st.selectbox(
                "Choose location candidate",
                options=candidate_labels,
                key="manage_new_location_candidate_select",
            )

            selected_index = candidate_labels.index(selected_candidate_label)
            selected_candidate = location_search_results[selected_index]

            st.write(
                f"Selected coordinates: "
                f"{selected_candidate['latitude']}, {selected_candidate['longitude']}"
            )

        with st.form("manage_add_saved_location_form"):
            default_name = ""

            if selected_candidate is not None:
                default_name = selected_candidate["label"].split(",")[0]

            new_location_name = st.text_input(
                "Location name",
                value=default_name,
                placeholder="Example: Local Pond, Tennis Courts, Kayak Launch",
            )

            if selected_candidate is not None:
                default_latitude = float(selected_candidate["latitude"])
                default_longitude = float(selected_candidate["longitude"])
            else:
                default_latitude = float(latitude)
                default_longitude = float(longitude)

            with st.expander("Advanced: coordinates", expanded=False):
                col1, col2 = st.columns(2)

                with col1:
                    new_location_latitude = st.number_input(
                        "Latitude",
                        format="%.6f",
                        value=default_latitude,
                    )

                with col2:
                    new_location_longitude = st.number_input(
                        "Longitude",
                        format="%.6f",
                        value=default_longitude,
                    )

            location_type_options = [
                "Home",
                "Lake",
                "River",
                "Pond",
                "Beach",
                "Park",
                "Disc Golf Course",
                "Tennis Courts",
                "Campground",
                "Trail",
                "Other",
            ]

            new_location_type = st.selectbox(
                "Location type",
                options=location_type_options,
            )

            water_type_options = [
                "Not applicable",
                "Freshwater lake",
                "River",
                "Pond",
                "Great Lake",
                "Ocean/coastal",
                "Unknown",
            ]

            new_water_type = st.selectbox(
                "Water type",
                options=water_type_options,
            )

            new_water_body_size = st.selectbox(
                "Water body size",
                options=WATER_BODY_SIZE_OPTIONS,
                help="Used to estimate chop/roughness for ponds and lakes.",
            )

            new_wind_exposure = st.selectbox(
                "Wind exposure",
                options=WIND_EXPOSURE_OPTIONS,
                help="Sheltered water is less affected by wind than open/exposed water.",
            )

            use_usgs_water_data = st.checkbox(
                "Use USGS water data for this location",
                value=False,
                help="Useful for river fishing/kayaking locations with a nearby USGS gauge.",
            )

            usgs_site_id = st.text_input(
                "USGS site ID",
                placeholder="Example: 04174500",
                help="Find site IDs at waterdata.usgs.gov. Leave blank if not using USGS.",
            )

            use_ndbc_data = st.checkbox(
                "Use NOAA buoy data for this location later",
                value=False,
                help="For future Great Lakes/coastal buoy data. Not used yet.",
            )

            ndbc_station_id = st.text_input(
                "NOAA/NDBC buoy station ID",
                placeholder="Optional, for future Great Lakes buoy data",
            )

            activity_options = sorted(predictions["activity"].unique())

            new_default_activities = st.multiselect(
                "Default activities for this location",
                options=activity_options,
            )

            use_location_water_temp = st.checkbox(
                "Set manual water temperature for this location",
                value=False,
            )

            if use_location_water_temp:
                new_manual_water_temp = st.number_input(
                    "Manual water temperature °F",
                    min_value=32,
                    max_value=95,
                    value=65,
                )
            else:
                new_manual_water_temp = None

            new_location_notes = st.text_area(
                "Notes",
                placeholder="Example: sheltered from wind, muddy after rain, good bass spot",
            )

            submitted_location = st.form_submit_button("Save Location")

            if submitted_location:
                if new_location_name.strip() == "":
                    st.error("Location name is required.")
                else:
                    save_saved_location({
                        "name": new_location_name,
                        "latitude": new_location_latitude,
                        "longitude": new_location_longitude,
                        "location_type": new_location_type,
                        "water_type": new_water_type,
                        "default_activities": new_default_activities,
                        "manual_water_temp": new_manual_water_temp,
                        "use_usgs_water_data": use_usgs_water_data,
                        "usgs_site_id": usgs_site_id,
                        "notes": new_location_notes,
                        "water_body_size": new_water_body_size,
                        "wind_exposure": new_wind_exposure,
                        "use_ndbc_data": use_ndbc_data,
                        "ndbc_station_id": ndbc_station_id,
                    })

                    st.success("Location saved.")
                    st.rerun()

        st.write("### Existing Locations")

        if len(saved_locations) == 0:
            st.info("No saved locations yet.")

        else:
            st.dataframe(
                saved_locations,
                width="stretch",
            )

            saved_locations["display_label"] = (
                saved_locations["id"].astype(str)
                + " | "
                + saved_locations["name"].astype(str)
                + " | "
                + saved_locations["location_type"].astype(str)
            )

            selected_location_label = st.selectbox(
                "Choose location to edit/delete",
                options=saved_locations["display_label"].tolist(),
                key="manage_edit_saved_location_selectbox",
            )

            selected_location = saved_locations[
                saved_locations["display_label"] == selected_location_label
            ].iloc[0]

            selected_location_id = int(selected_location["id"])

            with st.expander("Edit selected location", expanded=False):
                edit_location_name = st.text_input(
                    "Location name",
                    value=str(selected_location.get("name", "")),
                    key=f"edit_location_name_{selected_location_id}",
                )

                edit_col1, edit_col2 = st.columns(2)

                with edit_col1:
                    edit_latitude = st.number_input(
                        "Latitude",
                        format="%.6f",
                        value=float(selected_location.get("latitude", latitude)),
                        key=f"edit_location_lat_{selected_location_id}",
                    )

                with edit_col2:
                    edit_longitude = st.number_input(
                        "Longitude",
                        format="%.6f",
                        value=float(selected_location.get("longitude", longitude)),
                        key=f"edit_location_lon_{selected_location_id}",
                    )

                edit_location_type = st.selectbox(
                    "Location type",
                    options=location_type_options,
                    index=location_type_options.index(selected_location.get("location_type"))
                    if selected_location.get("location_type") in location_type_options
                    else 0,
                    key=f"edit_location_type_{selected_location_id}",
                )

                edit_water_type = st.selectbox(
                    "Water type",
                    options=water_type_options,
                    index=water_type_options.index(selected_location.get("water_type"))
                    if selected_location.get("water_type") in water_type_options
                    else 0,
                    key=f"edit_water_type_{selected_location_id}",
                )

                current_water_body_size = selected_location.get("water_body_size", "Unknown")

                if pd.isna(current_water_body_size) or current_water_body_size not in WATER_BODY_SIZE_OPTIONS:
                    current_water_body_size = "Unknown"

                edit_water_body_size = st.selectbox(
                    "Water body size",
                    options=WATER_BODY_SIZE_OPTIONS,
                    index=WATER_BODY_SIZE_OPTIONS.index(current_water_body_size),
                    key=f"edit_water_body_size_{selected_location_id}",
                )

                current_wind_exposure = selected_location.get("wind_exposure", "Unknown")

                if pd.isna(current_wind_exposure) or current_wind_exposure not in WIND_EXPOSURE_OPTIONS:
                    current_wind_exposure = "Unknown"

                edit_wind_exposure = st.selectbox(
                    "Wind exposure",
                    options=WIND_EXPOSURE_OPTIONS,
                    index=WIND_EXPOSURE_OPTIONS.index(current_wind_exposure),
                    key=f"edit_wind_exposure_{selected_location_id}",
                )

                current_use_usgs = selected_location.get("use_usgs_water_data", False)

                if pd.isna(current_use_usgs):
                    current_use_usgs = False

                edit_use_usgs_water_data = st.checkbox(
                    "Use USGS water data for this location",
                    value=bool(current_use_usgs),
                    key=f"edit_use_usgs_water_data_{selected_location_id}",
                )

                current_usgs_site_id = selected_location.get("usgs_site_id", "")

                if pd.isna(current_usgs_site_id):
                    current_usgs_site_id = ""

                edit_usgs_site_id = st.text_input(
                    "USGS site ID",
                    value=str(current_usgs_site_id),
                    placeholder="Example: 04174500",
                    key=f"edit_usgs_site_id_{selected_location_id}",
                )

                current_use_ndbc = selected_location.get("use_ndbc_data", False)

                if pd.isna(current_use_ndbc):
                    current_use_ndbc = False

                edit_use_ndbc_data = st.checkbox(
                    "Use NOAA buoy data for this location later",
                    value=bool(current_use_ndbc),
                    key=f"edit_use_ndbc_data_{selected_location_id}",
                )

                current_ndbc_station_id = selected_location.get("ndbc_station_id", "")

                if pd.isna(current_ndbc_station_id):
                    current_ndbc_station_id = ""

                edit_ndbc_station_id = st.text_input(
                    "NOAA/NDBC buoy station ID",
                    value=str(current_ndbc_station_id),
                    placeholder="Optional, for future Great Lakes buoy data",
                    key=f"edit_ndbc_station_id_{selected_location_id}",
                )

                current_default_activities = selected_location.get("default_activities", [])

                if not isinstance(current_default_activities, list):
                    current_default_activities = []

                edit_default_activities = st.multiselect(
                    "Default activities",
                    options=activity_options,
                    default=[
                        activity
                        for activity in current_default_activities
                        if activity in activity_options
                    ],
                    key=f"edit_default_activities_{selected_location_id}",
                )

                current_water_temp = selected_location.get("manual_water_temp")

                use_edit_water_temp = st.checkbox(
                    "Set manual water temperature for this location",
                    value=not pd.isna(current_water_temp),
                    key=f"edit_use_water_temp_{selected_location_id}",
                )

                if use_edit_water_temp:
                    edit_manual_water_temp = st.number_input(
                        "Manual water temperature °F",
                        min_value=32,
                        max_value=95,
                        value=65 if pd.isna(current_water_temp) else int(float(current_water_temp)),
                        key=f"edit_manual_water_temp_{selected_location_id}",
                    )
                else:
                    edit_manual_water_temp = None

                edit_notes = st.text_area(
                    "Notes",
                    value="" if pd.isna(selected_location.get("notes")) else str(selected_location.get("notes")),
                    key=f"edit_location_notes_{selected_location_id}",
                )

                if st.button("Save location edits", key=f"save_location_edits_{selected_location_id}"):
                    update_saved_location(
                        selected_location_id,
                        {
                            "name": edit_location_name,
                            "latitude": edit_latitude,
                            "longitude": edit_longitude,
                            "location_type": edit_location_type,
                            "water_type": edit_water_type,
                            "default_activities": edit_default_activities,
                            "manual_water_temp": edit_manual_water_temp,
                            "use_usgs_water_data": edit_use_usgs_water_data,
                            "usgs_site_id": edit_usgs_site_id,
                            "notes": edit_notes,
                            "water_body_size": edit_water_body_size,
                            "wind_exposure": edit_wind_exposure,
                            "use_ndbc_data": edit_use_ndbc_data,
                            "ndbc_station_id": edit_ndbc_station_id,
                        },
                    )

                    st.success("Location updated.")
                    st.rerun()

            with st.expander("Danger zone: delete location", expanded=False):
                st.warning("Deleting a saved location cannot be undone.")

                confirm_delete_location = st.checkbox(
                    "Yes, delete this saved location",
                    key=f"confirm_delete_location_{selected_location_id}",
                )

                if st.button("Delete saved location", key=f"delete_location_{selected_location_id}"):
                    if confirm_delete_location:
                        delete_saved_location(selected_location_id)
                        st.success("Location deleted.")
                        st.rerun()
                    else:
                        st.warning("Check the confirmation box before deleting.")

        st.markdown("---")
        st.subheader("Default Location by Activity")

        saved_locations_for_defaults = load_saved_locations()
        activity_location_defaults = load_activity_location_defaults()

        if len(saved_locations_for_defaults) == 0:
            st.info("Save at least one location before setting activity defaults.")

        else:
            activity_options_for_defaults = sorted(predictions["activity"].unique())

            location_label_map = {}

            location_options = ["No default"]

            for _, location_row in saved_locations_for_defaults.iterrows():
                label = (
                    f"{location_row['name']} "
                    f"({location_row.get('location_type', 'Location')})"
                )

                location_options.append(label)
                location_label_map[label] = int(location_row["id"])

            for activity in activity_options_for_defaults:
                with st.expander(activity_label(activity), expanded=False):
                    current_default_location = get_default_location_for_activity(
                        activity=activity,
                        defaults_df=activity_location_defaults,
                        saved_locations_df=saved_locations_for_defaults,
                    )

                    if current_default_location is not None:
                        current_label = (
                            f"{current_default_location['name']} "
                            f"({current_default_location.get('location_type', 'Location')})"
                        )
                    else:
                        current_label = "No default"

                    if current_label in location_options:
                        current_index = location_options.index(current_label)
                    else:
                        current_index = 0

                    selected_default_location_label = st.selectbox(
                        "Default location",
                        options=location_options,
                        index=current_index,
                        key=f"default_location_select_{activity}",
                    )

                    col_a, col_b = st.columns(2)

                    with col_a:
                        if st.button(
                            "Save default",
                            key=f"save_default_location_{activity}",
                        ):
                            if selected_default_location_label == "No default":
                                delete_activity_location_default(activity)
                                st.success("Default location removed.")
                            else:
                                selected_location_id = location_label_map[
                                    selected_default_location_label
                                ]

                                save_activity_location_default(
                                    activity,
                                    selected_location_id,
                                )

                                st.success("Default location saved.")

                            st.rerun()

                    with col_b:
                        if st.button(
                            "Clear default",
                            key=f"clear_default_location_{activity}",
                        ):
                            delete_activity_location_default(activity)
                            st.success("Default location cleared.")
                            st.rerun()

    elif manage_view == "Planned Activities":
        st.subheader("Planned Activities")

        plans = load_planned_activities()

        if len(plans) == 0:
            st.info("No planned activities yet.")

        else:
            plans_with_current = update_plans_with_current_forecast(
                plans,
                predictions,
            )

            st.dataframe(
                plans_with_current.sort_values("planned_date"),
                width="stretch",
            )

            plans_with_current["display_label"] = (
                plans_with_current["id"].astype(str)
                + " | "
                + plans_with_current["planned_date"].astype(str)
                + " | "
                + plans_with_current["activity"].astype(str)
                + " | "
                + plans_with_current["status"].astype(str)
            )

            selected_plan_label = st.selectbox(
                "Choose planned activity to update",
                options=plans_with_current["display_label"].tolist(),
                key="manage_selected_plan",
            )

            selected_plan = plans_with_current[
                plans_with_current["display_label"] == selected_plan_label
            ].iloc[0]

            selected_plan_id = int(selected_plan["id"])

            new_plan_status = st.selectbox(
                "Status",
                options=PLAN_STATUSES,
                index=PLAN_STATUSES.index(selected_plan["status"])
                if selected_plan["status"] in PLAN_STATUSES
                else 0,
                key=f"manage_plan_status_{selected_plan_id}",
            )

            if st.button("Update plan status", key=f"manage_update_plan_status_{selected_plan_id}"):
                update_planned_activity_status(
                    selected_plan_id,
                    new_plan_status,
                )

                load_planned_activities.clear()
                st.success("Plan status updated.")
                st.rerun()

            with st.expander("Danger zone: delete planned activity", expanded=False):
                confirm_delete_plan = st.checkbox(
                    "Delete this planned activity",
                    key=f"manage_confirm_delete_plan_{selected_plan_id}",
                )

                if st.button("Delete planned activity", key=f"manage_delete_plan_{selected_plan_id}"):
                    if confirm_delete_plan:
                        delete_planned_activity(selected_plan_id)
                        load_planned_activities.clear()
                        st.success("Planned activity deleted.")
                        st.rerun()
                    else:
                        st.warning("Check the confirmation box before deleting.")