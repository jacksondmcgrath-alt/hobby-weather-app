import os
from datetime import datetime, timedelta, timezone

import requests
from supabase import create_client


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

NWS_ALERTS_URL = "https://api.weather.gov/alerts/active"
USGS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/"
NDBC_REALTIME_URL_TEMPLATE = "https://www.ndbc.noaa.gov/data/realtime2/{station_id}.txt"


def get_supabase_client():
    """
    Creates a Supabase client using GitHub Actions environment secrets.
    """

    return create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
    )


def load_saved_locations(supabase):
    """
    Loads saved locations from Supabase.

    Only locations with valid latitude/longitude can be refreshed.
    """

    response = (
        supabase
        .table("saved_locations")
        .select("id,name,latitude,longitude,location_type,water_type,use_usgs_water_data,usgs_site_id,use_ndbc_data,ndbc_station_id")
        .execute()
    )

    rows = response.data or []

    locations = []

    for row in rows:
        if row.get("latitude") is None or row.get("longitude") is None:
            continue

        locations.append(row)

    return locations


def fetch_nws_alerts(latitude, longitude):
    """
    Fetches active NWS alerts for a location.
    """

    headers = {
        "User-Agent": "hobby-weather-planner/1.0"
    }

    params = {
        "point": f"{latitude},{longitude}"
    }

    response = requests.get(
        NWS_ALERTS_URL,
        headers=headers,
        params=params,
        timeout=20,
    )

    response.raise_for_status()

    data = response.json()

    alerts = []

    for feature in data.get("features", []):
        props = feature.get("properties", {})

        alerts.append(
            {
                "event": props.get("event"),
                "severity": props.get("severity"),
                "certainty": props.get("certainty"),
                "urgency": props.get("urgency"),
                "headline": props.get("headline"),
                "description": props.get("description"),
                "instruction": props.get("instruction"),
                "effective": props.get("effective"),
                "expires": props.get("expires"),
            }
        )

    return alerts


def save_environment_cache(
    supabase,
    location_id,
    data_type,
    source,
    data_json,
    ttl_minutes,
):
    """
    Saves API data into environment_cache.

    Uses upsert so each location/data_type pair has one latest cache row.
    """

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ttl_minutes)
    job_source = os.environ.get("JOB_SOURCE", "local")

    row = {
        "location_id": location_id,
        "data_type": data_type,
        "source": source,
        "data_json": data_json,
        "fetched_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "updated_at": now.isoformat(),
    }

    (
        supabase
        .table("environment_cache")
        .upsert(
            row,
            on_conflict="location_id,data_type",
        )
        .execute()
    )

def fetch_usgs_water_data(site_id):
    """
    Fetches USGS instantaneous water data.

    Parameter codes:
    00060 = discharge / streamflow, cubic feet per second
    00065 = gauge height, feet
    00010 = water temperature, Celsius
    """

    params = {
        "format": "json",
        "sites": site_id,
        "parameterCd": "00060,00065,00010",
        "siteStatus": "all",
        "period": "P1D",
    }

    response = requests.get(
        USGS_IV_URL,
        params=params,
        timeout=20,
    )

    response.raise_for_status()

    data = response.json()

    result = {
        "site_id": site_id,
        "streamflow_cfs": None,
        "gauge_height_ft": None,
        "water_temp_c": None,
        "water_temp_f": None,
        "observations": [],
    }

    time_series = (
        data
        .get("value", {})
        .get("timeSeries", [])
    )

    for series in time_series:
        variable = series.get("variable", {})
        variable_code_items = variable.get("variableCode", [])

        if not variable_code_items:
            continue

        variable_code = variable_code_items[0].get("value")

        values = series.get("values", [])

        if not values:
            continue

        observations = values[0].get("value", [])

        if not observations:
            continue

        latest = observations[-1]

        raw_value = latest.get("value")
        timestamp = latest.get("dateTime")

        try:
            numeric_value = float(raw_value)
        except Exception:
            numeric_value = None

        result["observations"].append({
            "parameter": variable_code,
            "value": numeric_value,
            "timestamp": timestamp,
        })

        if variable_code == "00060":
            result["streamflow_cfs"] = numeric_value

        elif variable_code == "00065":
            result["gauge_height_ft"] = numeric_value

        elif variable_code == "00010":
            result["water_temp_c"] = numeric_value

            if numeric_value is not None:
                result["water_temp_f"] = round(numeric_value * 9 / 5 + 32, 1)

    return result

def c_to_f(value):
    if value is None:
        return None

    return value * 9 / 5 + 32


def meters_to_feet(value):
    if value is None:
        return None

    return value * 3.28084


def ms_to_mph(value):
    if value is None:
        return None

    return value * 2.23694


def parse_ndbc_value(value):
    """
    NDBC missing values often appear as MM.
    """

    if value in ["MM", "", None]:
        return None

    try:
        return float(value)
    except Exception:
        return None
    
def fetch_ndbc_realtime_data(station_id):
    """
    Fetches latest NDBC buoy/station observation.

    Useful fields:
    - wind direction
    - wind speed
    - gust
    - wave height
    - dominant wave period
    - air temp
    - water temp
    """

    url = NDBC_REALTIME_URL_TEMPLATE.format(
        station_id=station_id
    )

    response = requests.get(
        url,
        timeout=20,
    )

    response.raise_for_status()

    text = response.text

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    if len(lines) < 3:
        raise ValueError("NDBC response did not contain enough data rows.")

    header_line = lines[0].replace("#", "").strip()
    headers = header_line.split()

    data_line = None

    for line in lines[1:]:
        if line.startswith("#"):
            continue

        data_line = line
        break

    if data_line is None:
        raise ValueError("No NDBC data row found.")

    values = data_line.split()

    row = dict(zip(headers, values))

    wind_direction = parse_ndbc_value(row.get("WDIR"))
    wind_speed_ms = parse_ndbc_value(row.get("WSPD"))
    gust_ms = parse_ndbc_value(row.get("GST"))
    wave_height_m = parse_ndbc_value(row.get("WVHT"))
    dominant_period = parse_ndbc_value(row.get("DPD"))
    average_period = parse_ndbc_value(row.get("APD"))
    mean_wave_direction = parse_ndbc_value(row.get("MWD"))
    air_temp_c = parse_ndbc_value(row.get("ATMP"))
    water_temp_c = parse_ndbc_value(row.get("WTMP"))

    result = {
        "station_id": station_id,
        "raw_time": {
            "year": row.get("YY"),
            "month": row.get("MM"),
            "day": row.get("DD"),
            "hour": row.get("hh"),
            "minute": row.get("mm"),
        },
        "wind_direction_deg": wind_direction,
        "wind_speed_mph": None if wind_speed_ms is None else round(ms_to_mph(wind_speed_ms), 1),
        "gust_mph": None if gust_ms is None else round(ms_to_mph(gust_ms), 1),
        "wave_height_ft": None if wave_height_m is None else round(meters_to_feet(wave_height_m), 1),
        "dominant_wave_period_s": dominant_period,
        "average_wave_period_s": average_period,
        "mean_wave_direction_deg": mean_wave_direction,
        "air_temp_f": None if air_temp_c is None else round(c_to_f(air_temp_c), 1),
        "water_temp_f": None if water_temp_c is None else round(c_to_f(water_temp_c), 1),
    }

    return result

def main():
    """
    Main background job.
    """

    print("Starting environment cache refresh...")

    supabase = get_supabase_client()

    locations = load_saved_locations(supabase)

    print(f"Found {len(locations)} saved locations.")

    for location in locations:
        location_id = location["id"]
        name = location.get("name", "Unnamed location")
        latitude = location["latitude"]
        longitude = location["longitude"]

        print(f"Refreshing NWS alerts for {name} ({latitude}, {longitude})...")

        try:
            alerts = fetch_nws_alerts(
                latitude=latitude,
                longitude=longitude,
            )

            save_environment_cache(
                supabase=supabase,
                location_id=location_id,
                data_type="nws_alerts",
                source="NWS",
                data_json=alerts,
                ttl_minutes=30,
            )

            print(f"Saved {len(alerts)} alerts for {name}.")

        except Exception as error:
            print(f"Failed to refresh NWS alerts for {name}: {error}")

        use_usgs = location.get("use_usgs_water_data")
        usgs_site_id = location.get("usgs_site_id")
        print(f"use_usgs={location.get('use_usgs_water_data')}, usgs_site_id={location.get('usgs_site_id')}")

        if use_usgs and usgs_site_id:
            print(f"Refreshing USGS water data for {name}, site {usgs_site_id}...")

            try:
                usgs_data = fetch_usgs_water_data(usgs_site_id)

                save_environment_cache(
                    supabase=supabase,
                    location_id=location_id,
                    data_type="usgs_water",
                    source="USGS",
                    data_json=usgs_data,
                    ttl_minutes=60,
                )

                print(f"Saved USGS water data for {name}.")

            except Exception as error:
                print(f"Failed to refresh USGS data for {name}: {error}")

        use_ndbc = location.get("use_ndbc_data")
        ndbc_station_id = location.get("ndbc_station_id")

        if use_ndbc and ndbc_station_id:
            print(f"Refreshing NDBC buoy data for {name}, station {ndbc_station_id}...")

            try:
                ndbc_data = fetch_ndbc_realtime_data(ndbc_station_id)

                save_environment_cache(
                    supabase=supabase,
                    location_id=location_id,
                    data_type="ndbc_buoy",
                    source="NOAA/NDBC",
                    data_json=ndbc_data,
                    ttl_minutes=60,
                )

                print(f"Saved NDBC buoy data for {name}.")

            except Exception as error:
                print(f"Failed to refresh NDBC data for {name}: {error}")

    print("Environment cache refresh complete.")


if __name__ == "__main__":
    main()