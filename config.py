# =========================
# API URLs
# =========================

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


# =========================
# Legacy/local file names
# =========================

LOG_FILE = "activity_log.csv"
SETTINGS_FILE = "preferences.json"
PREDICTION_HISTORY_FILE = "prediction_history.csv"


# =========================
# Default app settings
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


# =========================
# Activity display
# =========================

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


# =========================
# Location options
# =========================

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


DAY_OF_WEEK_OPTIONS = {
    "Monday": 0,
    "Tuesday": 1,
    "Wednesday": 2,
    "Thursday": 3,
    "Friday": 4,
    "Saturday": 5,
    "Sunday": 6,
}


DAY_OF_WEEK_LABELS = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}


# =========================
# Dynamic scoring rules
# =========================

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


# =========================
# Scenario rating fields
# =========================

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

    # Advanced / future ML features
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
}


# =========================
# Fishing species profiles
# =========================

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