import os
import sys
from pathlib import Path
from datetime import date, timedelta

import pandas as pd


# Make repo root importable when running from jobs/
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(REPO_ROOT))


from scoring import (  # noqa: E402
    generate_predictions,
    apply_preference_adjustments,
    add_forecast_confidence,
)
from database import save_prediction_history  # noqa: E402


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


def bool_from_env(value, default=False):
    if value is None:
        return default

    return str(value).strip().lower() in ["1", "true", "yes", "y"]


def get_planning_window():
    """
    Planner uses tomorrow through 14 days from today.
    """
    start_date = date.today() + timedelta(days=1)
    end_date = date.today() + timedelta(days=14)

    return start_date, end_date


def filter_to_planning_window(predictions):
    start_date, end_date = get_planning_window()

    filtered = predictions.copy()
    filtered["date"] = pd.to_datetime(filtered["date"], errors="coerce").dt.date

    filtered = filtered[
        (filtered["date"] >= start_date)
        & (filtered["date"] <= end_date)
    ].copy()

    filtered["date"] = pd.to_datetime(filtered["date"]).dt.strftime("%Y-%m-%d")

    return filtered


def main():
    print("Starting prediction_history generation...")

    latitude = float(os.environ["FORECAST_LATITUDE"])
    longitude = float(os.environ["FORECAST_LONGITUDE"])

    # Open-Meteo forecast_days includes today, so use 15 to cover today + next 14.
    forecast_days = int(os.environ.get("FORECAST_DAYS", "15"))

    manual_water_temp_raw = os.environ.get("FORECAST_MANUAL_WATER_TEMP", "").strip()
    manual_water_temp = (
        float(manual_water_temp_raw)
        if manual_water_temp_raw
        else None
    )

    include_air_quality = bool_from_env(
        os.environ.get("FORECAST_INCLUDE_AIR_QUALITY"),
        default=True,
    )

    print(f"Forecast location: {latitude}, {longitude}")
    print(f"Forecast days requested: {forecast_days}")
    print(f"Include air quality: {include_air_quality}")

    base_predictions = generate_predictions(
        latitude=latitude,
        longitude=longitude,
        days=forecast_days,
        manual_water_temp=manual_water_temp,
        include_air_quality=include_air_quality,
    )

    print(f"Base prediction rows generated: {len(base_predictions)}")

    predictions = filter_to_planning_window(base_predictions)

    print(f"Rows in planning window: {len(predictions)}")

    if len(predictions) == 0:
        raise RuntimeError(
            "No predictions generated for tomorrow through 14 days ahead. "
            "Check forecast_days and Open-Meteo response."
        )

    predictions = apply_preference_adjustments(
        predictions=predictions,
        preferences=DEFAULT_PREFERENCES,
    )

    predictions = add_forecast_confidence(predictions)

    save_prediction_history(predictions)

    print("prediction_history saved successfully.")
    print(f"Saved {len(predictions)} prediction rows.")
    print(f"Date range: {predictions['date'].min()} to {predictions['date'].max()}")


if __name__ == "__main__":
    main()