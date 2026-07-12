import os
from datetime import datetime, timedelta, timezone

import requests
from supabase import create_client


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

NWS_ALERTS_URL = "https://api.weather.gov/alerts/active"
USGS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/"

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
        .select("id,name,latitude,longitude,location_type,water_type,use_usgs_water_data,usgs_site_id")
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

    print("Environment cache refresh complete.")


if __name__ == "__main__":
    main()