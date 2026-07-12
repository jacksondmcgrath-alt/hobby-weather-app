import os
from datetime import datetime, timedelta, timezone

import requests
from supabase import create_client


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

NWS_ALERTS_URL = "https://api.weather.gov/alerts/active"


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
        .select("id,name,latitude,longitude,location_type,water_type")
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

    print("Environment cache refresh complete.")


if __name__ == "__main__":
    main()