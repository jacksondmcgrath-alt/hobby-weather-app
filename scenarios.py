import json
import random

import pandas as pd
import streamlit as st

from config import (
    ACTIVITY_SCENARIO_FIELDS,
    SCENARIO_RANGES,
)

from database import get_supabase_client
from locations import build_location_context_for_scenario
from weather import fetch_historical_weather
from utils import clean_json_value, clamp_score


# =========================
# Scenario feature helpers
# =========================

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

    for key, value in advanced_features.items():
        scenario[key] = value

    scenario["advanced_features"] = advanced_features
    scenario["location_context"] = build_location_context_for_scenario(activity)
    scenario["model_features_version"] = "scenario_v1"
    scenario["scenario_generation_method"] = "random_scenario_v1"

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


# =========================
# Scenario rating database functions
# =========================

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


# =========================
# Scenario progress / insights
# =========================

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


# =========================
# Historical scenarios
# =========================

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