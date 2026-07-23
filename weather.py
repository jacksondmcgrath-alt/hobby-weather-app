import pandas as pd
import streamlit as st

from config import (
    FORECAST_URL,
    AIR_QUALITY_URL,
    ARCHIVE_URL,
)
from utils import get_json_with_retries


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

    daytime = df[
        (df["hour"] >= 6) &
        (df["hour"] <= 21)
    ].copy()

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

    daily = pd.merge(
        daytime_daily,
        full_day_daily,
        on="date",
        how="left",
    )

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

    daytime = aq[
        (aq["hour"] >= 6) &
        (aq["hour"] <= 21)
    ].copy()

    aq_daily = (
        daytime
        .groupby("date")
        .agg(
            aqi_max=("us_aqi", "max"),
            uv_index_max=("uv_index", "max"),
        )
        .reset_index()
    )

    daily = daily.merge(
        aq_daily,
        on="date",
        how="left",
    )

    daily["aqi_max"] = daily["aqi_max"].fillna(50)
    daily["uv_index_max"] = daily["uv_index_max"].fillna(5)

    return daily