import os
import json
import time
from datetime import datetime
from urllib import response

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

# =========================
# General helper functions
# =========================

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

    return f"{lat_key}_{lon_key}_{forecast_days}_{manual_water_temp_key}_{include_air_quality}_{preferences_key}"


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
            "predictions": predictions.to_dict(orient="records"),
            "time_recommendations": time_recommendations.to_dict(orient="records"),
        }

        supabase.table("forecast_cache").upsert(
            row,
            on_conflict="cache_key",
        ).execute()

    except Exception as e:
        st.warning("Could not save forecast cache.")
        st.write(e)

def clamp_score(score):
    return max(0, min(100, score))

ACTIVITY_ICONS = {
    "Fishing": "🎣",
    "Bass Fishing": "🐟",
    "Trout Fishing": "🐟",
    "Walleye Fishing": "🐟",
    "Pike Fishing": "🐟",
    "Panfish Fishing": "🐟",
    "Camping": "⛺",
    "Running": "🏃",
    "Kayaking": "🛶",
    "Disc Golf": "🥏",
}


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
    """

    day_predictions = predictions[
        predictions["date"] == forecast_date
    ].copy()

    return day_predictions.sort_values(
        "predicted_score",
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

FISHING_ACTIVITIES = ["Fishing"] + list(SPECIES_FISHING_PROFILES.keys())

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
        }

        # ---------------------
        # General Fishing
        # ---------------------

        rows.append({
            "date": row["date"],
            "activity": "Fishing",
            "predicted_score": fishing_score,
            "label": score_label(fishing_score),
            "explanation": fishing_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        # ---------------------
        # Species-specific Fishing
        # ---------------------

        for species_name, species_profile in SPECIES_FISHING_PROFILES.items():
            species_score, species_explanation = score_species_fishing(
                row=row,
                species_name=species_name,
                species_profile=species_profile,
            )

            rows.append({
                "date": row["date"],
                "activity": species_name,
                "predicted_score": species_score,
                "label": score_label(species_score),
                "explanation": species_explanation,
                "gear_notes": gear_notes,
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
    "Bass Fishing": "Best Fishing Window",
    "Trout Fishing": "Best Fishing Window",
    "Walleye Fishing": "Best Fishing Window",
    "Pike Fishing": "Best Fishing Window",
    "Panfish Fishing": "Best Fishing Window",
    "Running": "Best Running Window",
    "Kayaking": "Best Kayaking Window",
    "Disc Golf": "Best Disc Golf Window",
    }

    score_column_map = {
    "Fishing": "Fishing Window Score",
    "Bass Fishing": "Fishing Window Score",
    "Trout Fishing": "Fishing Window Score",
    "Walleye Fishing": "Fishing Window Score",
    "Pike Fishing": "Fishing Window Score",
    "Panfish Fishing": "Fishing Window Score",
    "Running": "Running Window Score",
    "Kayaking": "Kayaking Window Score",
    "Disc Golf": "Disc Golf Window Score",
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
    Also removes duplicate date/activity rows before sending to Supabase.
    """

    try:
        supabase = get_supabase_client()

        predictions_to_save = predictions.copy()

        # Make sure date is a consistent string format
        predictions_to_save["date"] = pd.to_datetime(
            predictions_to_save["date"],
            errors="coerce",
        ).dt.strftime("%Y-%m-%d")

        predictions_to_save["generated_at"] = datetime.now().isoformat(timespec="seconds")

        # Important fix:
        # Prevent duplicate date/activity rows from going into one upsert call.
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
        ]

        rows_to_save = []

        for _, row in predictions_to_save.iterrows():
            clean_row = {}

            for column in allowed_columns:
                value = row.get(column, None)

                if value == "" or value is None or pd.isna(value):
                    clean_row[column] = None

                elif column in numeric_columns:
                    try:
                        clean_row[column] = float(value)
                    except Exception:
                        clean_row[column] = None

                else:
                    clean_row[column] = str(value)

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
    st.write("Search for a location or manually enter coordinates.")

    location_query = st.text_input(
        "Location search",
        key="location_query",
        help="Example: Ann Arbor, MI or Grand Rapids, Michigan",
    )

    if st.button("Find location"):
        try:
            location_results = geocode_place(location_query)

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

forecast_tab, times_tab, log_tab, history_tab, manage_tab = st.tabs(
    [
        "📊 Forecast",
        "⏰ Best Times",
        "➕ Log Activity",
        "📈 History",
        "🛠️ Manage Logs",
    ]
)

activity_log = load_activity_log()

# -------------------------
# Display predictions
# -------------------------

with forecast_tab:
    st.header("Predicted Scores")

    activities = sorted(predictions["activity"].unique())

    selected_activities = st.multiselect(
        "Choose activities to show",
        options=activities,
        default=activities,
    )

    show_all_activity_details = st.checkbox(
        "Show all activity details",
        value=False,
    )

    filtered_predictions = predictions[
        predictions["activity"].isin(selected_activities)
    ].copy()

    st.subheader("Dashboard")

    best_by_day = build_best_by_day_table(
        predictions=filtered_predictions,
        time_recommendations=time_recommendations,
    )

    if len(best_by_day) > 0:
        today_best = best_by_day.iloc[0]

        metric_col1, metric_col2, metric_col3 = st.columns(3)

        with metric_col1:
            st.metric(
                "Next Best Activity",
                today_best["Best Activity"],
                today_best["Label"],
            )

        with metric_col2:
            st.metric(
                "Score",
                int(today_best["Score"]),
            )

        with metric_col3:
            st.metric(
                "Best Window",
                today_best["Recommended Window"],
            )

        st.write("### Best Activity by Day")

        st.dataframe(
            best_by_day,
            width="stretch",
        )

        # Best Fishing Target goes here
        fishing_species = [
            "Bass Fishing",
            "Trout Fishing",
            "Walleye Fishing",
            "Pike Fishing",
            "Panfish Fishing",
        ]

        species_predictions = filtered_predictions[
            filtered_predictions["activity"].isin(fishing_species)
        ].copy()

        if len(species_predictions) > 0:
            best_species_index = species_predictions["predicted_score"].idxmax()
            best_species = species_predictions.loc[best_species_index]

            st.write("### Best Fishing Target")

            species_col1, species_col2, species_col3 = st.columns(3)

            with species_col1:
                st.metric(
                    "Target",
                    best_species["activity"],
                )

            with species_col2:
                st.metric(
                    "Score",
                    int(best_species["predicted_score"]),
                    best_species["label"],
                )

            with species_col3:
                species_window, _ = get_recommended_window_for_activity(
                    time_recommendations=time_recommendations,
                    selected_date=best_species["date"],
                    selected_activity=best_species["activity"],
                )

                st.metric(
                    "Best Window",
                    species_window,
                )

    if phone_friendly_view:
        for forecast_date in sorted(filtered_predictions["date"].unique()):
            st.subheader(forecast_date)
            top_three = get_top_activities_for_date(
                filtered_predictions,
                forecast_date,
                n=3,
            )

            top_cols = st.columns(3)

            for col, (_, top_row) in zip(top_cols, top_three.iterrows()):
                with col:
                    st.markdown(
                        score_badge_html(
                            top_row["predicted_score"],
                            top_row["label"],
                        ),
                        unsafe_allow_html=True,
                    )
                    st.write(f"**{activity_label(top_row['activity'])}**")

            day_predictions = filtered_predictions[
                filtered_predictions["date"] == forecast_date
            ].sort_values("predicted_score", ascending=False)

            if show_all_activity_details:
                display_day_predictions = day_predictions
            else:
                display_day_predictions = day_predictions.head(3)

            for _, row in display_day_predictions.iterrows():
                recommended_window, window_score = get_recommended_window_for_activity(
                    time_recommendations=time_recommendations,
                    selected_date=row["date"],
                    selected_activity=row["activity"],
                )
            if not show_all_activity_details and len(day_predictions) > 3:
                st.caption("Showing top 3 activities. Check 'Show all activity details' to view everything.")
                title = (
                    f"{activity_label(row['activity'])}: {row['predicted_score']} "
                    f"({row['label']})"
                )

                with st.expander(title):
                    st.markdown(
                        score_badge_html(
                            row["predicted_score"],
                            row["label"],
                        ),
                        unsafe_allow_html=True,
                    )

                    st.write(f"**Recommended window:** {recommended_window}")

                    if window_score is not None:
                        st.write(f"**Window score:** {window_score}")

                    st.write(
                        f"**Weather:** {row.get('avg_temp', 'N/A')}°F, "
                        f"wind {row.get('wind_max', 'N/A')} mph, "
                        f"gusts {row.get('gust_max', 'N/A')} mph, "
                        f"rain {row.get('rain_chance', 'N/A')}%, "
                        f"bugs {row.get('bug_index', 'N/A')}"
                    )

                    st.write(f"**Warnings:** {dashboard_warning_text(row)}")

                    st.write("**Why this score:**")
                    st.write(row["explanation"])

                    st.write("**Gear / Safety Notes:**")
                    st.write(row["gear_notes"])

                    st.caption(
                        f"Base score: {row.get('base_predicted_score', row['predicted_score'])} | "
                        f"Preference adjustment: {row.get('preference_adjustment', 0)}"
                    )
    else:
        st.dataframe(
            filtered_predictions.sort_values(["date", "activity"]),
            width="stretch",
        )

    st.header("Best Days This Forecast")

    summary_rows = []

    for activity in sorted(filtered_predictions["activity"].unique()):
        activity_predictions = filtered_predictions[
            filtered_predictions["activity"] == activity
        ]

        if len(activity_predictions) == 0:
            continue

        best_index = activity_predictions["predicted_score"].idxmax()
        best_row = activity_predictions.loc[best_index]

        recommended_window, window_score = get_recommended_window_for_activity(
            time_recommendations=time_recommendations,
            selected_date=best_row["date"],
            selected_activity=activity,
        )

        summary_rows.append({
            "Activity": activity,
            "Best Date": best_row["date"],
            "Best Score": best_row["predicted_score"],
            "Label": best_row["label"],
            "Recommended Window": recommended_window,
            "Window Score": window_score,
            "Main Reason": best_row["explanation"],
        })

    best_days_summary = pd.DataFrame(summary_rows)

    st.dataframe(
        best_days_summary,
        width="stretch",
    )

    st.subheader("Score Chart")

    chart_data = filtered_predictions.pivot(
        index="date",
        columns="activity",
        values="predicted_score",
    )

    st.line_chart(chart_data)


    st.download_button(
        label="Download latest predictions as CSV",
        data=predictions.to_csv(index=False),
        file_name="latest_predictions.csv",
        mime="text/csv",
    )

with times_tab:
    st.header("Best Time Windows")

    st.write(
        "Running is allowed from 1 hour before sunrise through 1 hour after sunset. "
        "Kayaking and disc golf are restricted to daylight."
    )

    st.dataframe(
        time_recommendations,
        width="stretch",
    )

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

        if selected_activity in ["Camping", "Running", "Disc Golf"]:
            actual_ground_wetness = st.selectbox(
                "Actual ground/course/trail condition",
                options=["Dry", "Damp", "Muddy", "Very muddy", "Not sure"],
            )

        if selected_activity in FISHING_ACTIVITIES + ["Kayaking"]:
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

    def show_accuracy_charts(activity_log):
        """
        Shows accuracy summaries and charts from the activity log.
        """

        chart_log = activity_log.copy()

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
                "logged_at",
                "predicted_score",
                "actual_score_0_to_100",
                "prediction_error",
                "absolute_error",
            ]
        )

        if len(chart_log) == 0:
            st.info("Not enough valid log data for summaries or charts yet.")
            return

        st.subheader("Accuracy Summary by Activity")

        summary = (
            chart_log
            .groupby("activity", as_index=False)
            .agg(
                number_of_logs=("activity", "count"),
                average_error=("prediction_error", "mean"),
                average_absolute_error=("absolute_error", "mean"),
            )
        )

        summary["average_error"] = summary["average_error"].round(1)
        summary["average_absolute_error"] = summary["average_absolute_error"].round(1)

        st.dataframe(summary, width="stretch")

        st.subheader("Accuracy Charts")

        st.write("### Average Absolute Error by Activity")
        st.write("Lower is better.")

        error_by_activity = (
            chart_log
            .groupby("activity", as_index=False)
            .agg(
                average_absolute_error=("absolute_error", "mean"),
                average_error=("prediction_error", "mean"),
            )
        )

        error_by_activity["average_absolute_error"] = (
            error_by_activity["average_absolute_error"].round(1)
        )

        error_by_activity["average_error"] = (
            error_by_activity["average_error"].round(1)
        )

        st.bar_chart(
            error_by_activity.set_index("activity")["average_absolute_error"]
        )

        st.write("### Average Error by Activity")
        st.write(
            "Positive means the activity was better than predicted. "
            "Negative means it was worse than predicted."
        )

        st.bar_chart(
            error_by_activity.set_index("activity")["average_error"]
        )

        st.write("### Predicted vs. Actual Over Time")

        chart_activity_options = ["All"] + sorted(
            chart_log["activity"].dropna().unique().tolist()
        )

        selected_chart_activity = st.selectbox(
            "Choose activity for accuracy chart",
            options=chart_activity_options,
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

        st.write(
            """
            **How to read this:**

            - Positive error means the activity was better than predicted.
            - Negative error means it was worse than predicted.
            - Lower average absolute error means your model is more accurate.
            """
        )

        activity_log_csv = activity_log.to_csv(index=False)

        st.download_button(
            label="Download activity log as CSV",
            data=activity_log_csv,
            file_name="activity_log.csv",
            mime="text/csv",
        )


with manage_tab:
    st.header("Manage Logs")

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