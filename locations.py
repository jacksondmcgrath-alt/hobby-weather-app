import re

import pandas as pd
import requests
import streamlit as st

from config import GEOCODE_URL
from database import (
    load_environment_cache,
    load_saved_locations,
    load_activity_location_defaults,
)
from utils import clean_json_value


# =========================
# Location search / geocoding
# =========================

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

    response = requests.get(
        GEOCODE_URL,
        params=params,
        timeout=20,
    )

    response.raise_for_status()

    data = response.json()

    results = []

    for item in data.get("results", []):
        name = item.get("name", "")
        admin1 = item.get("admin1", "")
        country = item.get("country", "")

        label_parts = [
            part for part in [name, admin1, country]
            if part
        ]

        label = ", ".join(label_parts)

        results.append(
            {
                "label": label,
                "latitude": item["latitude"],
                "longitude": item["longitude"],
                "source": "Open-Meteo",
            }
        )

    return results


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
            "source": "Coordinates",
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
                "source": "Coordinates",
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

        results.append(
            {
                "label": label,
                "latitude": latitude,
                "longitude": longitude,
                "source": "OpenStreetMap",
            }
        )

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

        if isinstance(open_meteo_results, list):
            for item in open_meteo_results:
                results.append(
                    {
                        "label": item.get("label", item.get("name", "Open-Meteo result")),
                        "latitude": item["latitude"],
                        "longitude": item["longitude"],
                        "source": item.get("source", "Open-Meteo"),
                    }
                )

        elif isinstance(open_meteo_results, dict):
            label_parts = [
                open_meteo_results.get("name"),
                open_meteo_results.get("admin1"),
                open_meteo_results.get("country"),
            ]

            label = ", ".join(
                [
                    part for part in label_parts
                    if part
                ]
            )

            results.append(
                {
                    "label": label,
                    "latitude": open_meteo_results["latitude"],
                    "longitude": open_meteo_results["longitude"],
                    "source": "Open-Meteo",
                }
            )

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


# =========================
# Cached environmental data by location
# =========================

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


def get_ndbc_buoy_data_for_location(location):
    """
    Returns cached NDBC buoy data for a saved location dictionary.
    """

    if location is None:
        return None

    location_id = location.get("id")

    if location_id is None:
        return None

    cached = load_environment_cache(
        location_id=location_id,
        data_type="ndbc_buoy",
    )

    if cached is None:
        return None

    return cached.get("data_json")


def format_ndbc_buoy_summary(ndbc_data):
    """
    Creates readable summary of NDBC buoy data.
    """

    if not ndbc_data:
        return None

    parts = []

    wave_height = ndbc_data.get("wave_height_ft")
    wind_speed = ndbc_data.get("wind_speed_mph")
    gust = ndbc_data.get("gust_mph")
    water_temp = ndbc_data.get("water_temp_f")

    if wave_height is not None:
        try:
            parts.append(f"waves {float(wave_height):.1f} ft")
        except Exception:
            pass

    if wind_speed is not None:
        try:
            parts.append(f"buoy wind {float(wind_speed):.1f} mph")
        except Exception:
            pass

    if gust is not None:
        try:
            parts.append(f"gusts {float(gust):.1f} mph")
        except Exception:
            pass

    if water_temp is not None:
        try:
            parts.append(f"water {float(water_temp):.1f}°F")
        except Exception:
            pass

    if len(parts) == 0:
        return None

    return ", ".join(parts)


# =========================
# Activity default locations
# =========================

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

    return clean_json_value(
        {
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
    )


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


# =========================
# Inland water chop estimates
# =========================

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