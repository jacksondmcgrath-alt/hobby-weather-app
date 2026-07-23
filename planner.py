import re
from datetime import datetime, timedelta

import pandas as pd

from config import ACTIVITY_ICONS
from scoring import (
    fishing_wind_score,
    fishing_bug_score,
    dew_point_comfort_score,
)
from utils import (
    clamp_score,
    safe_value,
    range_score,
    low_is_good_score,
)


# =========================
# Basic labels
# =========================

def activity_label(activity):
    """
    Returns activity name with icon.
    """

    return f"{ACTIVITY_ICONS.get(activity, '⭐')} {activity}"


# =========================
# Weekend helpers
# =========================

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


# =========================
# Calendar export helpers
# =========================

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

    window_string = (
        window_string
        .replace("—", "–")
        .replace("-", "–")
    )

    parts = [
        part.strip()
        for part in window_string.split("–")
    ]

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

    if end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)

    return start_dt, end_dt


def format_ics_datetime(dt):
    """
    Formats datetime for .ics as floating local time.
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


# =========================
# Availability / schedule helpers
# =========================

def time_is_available(timestamp, obligations_df):
    """
    Returns True if timestamp does not fall inside an active weekly obligation.
    """

    if obligations_df is None or len(obligations_df) == 0:
        return True

    timestamp = pd.to_datetime(timestamp)

    day_of_week = timestamp.weekday()
    time_string = timestamp.strftime("%H:%M")

    working_df = obligations_df.copy()

    if "active" in working_df.columns:
        working_df = working_df[
            working_df["active"].fillna(True).astype(bool)
        ]

    if len(working_df) == 0:
        return True

    day_obligations = working_df[
        working_df["day_of_week"].astype(int) == int(day_of_week)
    ]

    for _, obligation in day_obligations.iterrows():
        start_time = str(obligation["start_time"])
        end_time = str(obligation["end_time"])

        if start_time <= end_time:
            if start_time <= time_string < end_time:
                return False

        else:
            if time_string >= start_time or time_string < end_time:
                return False

    return True


def filter_available_times(df, obligations_df):
    """
    Filters an hourly dataframe to only times outside weekly obligations.
    """

    if df is None or len(df) == 0:
        return df

    if obligations_df is None or len(obligations_df) == 0:
        return df

    filtered = df.copy()

    filtered["is_available"] = filtered["time"].apply(
        lambda value: time_is_available(value, obligations_df)
    )

    return filtered[
        filtered["is_available"]
    ].copy()


# =========================
# Time window helpers
# =========================

def format_time_for_window(timestamp):
    """
    Formats a timestamp like 07:00 AM.
    """

    return timestamp.strftime("%I:%M %p").lstrip("0")


def find_best_window(day_df, score_col, min_score=60, min_hours=2, max_hours=3):
    """
    Finds the best short continuous time window.

    Designed to avoid huge windows like 6 AM–10 PM.
    """

    if len(day_df) == 0:
        return {
            "window": "Not available",
            "score": None,
            "start": None,
            "end": None,
        }

    df = day_df.sort_values("time").copy()
    df = df[df[score_col] >= min_score].copy()

    if len(df) == 0:
        fallback_df = day_df.sort_values("time").copy()

        if len(fallback_df) == 0:
            return {
                "window": "Not available",
                "score": None,
                "start": None,
                "end": None,
            }

        best_index = fallback_df[score_col].idxmax()
        best_row = fallback_df.loc[best_index]

        start = best_row["time"]
        end = start + pd.Timedelta(hours=1)

        return {
            "window": f"{format_time_for_window(start)}–{format_time_for_window(end)}",
            "score": round(best_row[score_col]),
            "start": start,
            "end": end,
        }

    candidate_windows = []
    times = df["time"].tolist()

    for start_time in times:
        for duration_hours in range(min_hours, max_hours + 1):
            end_time = start_time + pd.Timedelta(hours=duration_hours)

            window_rows = df[
                (df["time"] >= start_time) &
                (df["time"] < end_time)
            ].copy()

            if len(window_rows) < min_hours:
                continue

            expected_hours = duration_hours

            if len(window_rows) < expected_hours:
                continue

            average_score = window_rows[score_col].mean()
            min_window_score = window_rows[score_col].min()

            candidate_windows.append({
                "start": start_time,
                "end": end_time,
                "average_score": average_score,
                "min_score": min_window_score,
                "duration": duration_hours,
            })

    if len(candidate_windows) == 0:
        best_index = df[score_col].idxmax()
        best_row = df.loc[best_index]

        start = best_row["time"]
        end = start + pd.Timedelta(hours=1)

        return {
            "window": f"{format_time_for_window(start)}–{format_time_for_window(end)}",
            "score": round(best_row[score_col]),
            "start": start,
            "end": end,
        }

    best_window = sorted(
        candidate_windows,
        key=lambda item: (
            item["average_score"],
            item["min_score"],
            -item["duration"],
        ),
        reverse=True,
    )[0]

    return {
        "window": f"{format_time_for_window(best_window['start'])}–{format_time_for_window(best_window['end'])}",
        "score": round(best_window["average_score"]),
        "start": best_window["start"],
        "end": best_window["end"],
    }


# =========================
# Hourly scoring
# =========================

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
    Used for kayaking, disc golf, tennis, and beach.
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
    temp_score = range_score(row["temperature_2m"], 50, 75, 35, 90)
    wind_score = fishing_wind_score(row["wind_speed_10m"])
    bug_score = fishing_bug_score(hourly_bug_activity_index(row))

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
    light_score = row["Running Light Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(row["temperature_2m"], 45, 60, 25, 80)

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
    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(row["temperature_2m"], 65, 85, 50, 95)

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
    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(row["temperature_2m"], 50, 78, 35, 92)

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
    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(row["temperature_2m"], 55, 78, 45, 88)

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
    light_score = row["Daylight Score"]

    if light_score <= 0:
        return 0

    temp_score = range_score(row["temperature_2m"], 75, 90, 65, 98)
    wind_score = range_score(row["wind_speed_10m"], 3, 15, 0, 25)

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


def build_time_recommendations(hourly_df, sun_times, obligations_df=None):
    """
    Builds best time windows for:
    - Fishing
    - Running
    - Kayaking
    - Disc Golf
    - Tennis
    - Beach Day
    """

    df = hourly_df.copy()

    df["date"] = df["time"].dt.date
    df["hour"] = df["time"].dt.hour

    recommendations = []

    # Fishing
    fishing_df = df[
        (df["hour"] >= 5) &
        (df["hour"] <= 22)
    ].copy()

    fishing_df = filter_available_times(
        fishing_df,
        obligations_df,
    )

    fishing_df["Fishing Time Score"] = fishing_df.apply(
        score_fishing_hour,
        axis=1,
    )

    # Running
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

    running_df = filter_available_times(
        running_df,
        obligations_df,
    )

    running_df["Running Time Score"] = running_df.apply(
        score_running_hour,
        axis=1,
    )

    # Daylight activities
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

    daylight_df = filter_available_times(
        daylight_df,
        obligations_df,
    )

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

    all_dates = sorted(df["date"].unique())

    for forecast_date in all_dates:
        row = {
            "date": forecast_date,
        }

        fishing_day = fishing_df[
            fishing_df["date"] == forecast_date
        ]

        fishing_window = find_best_window(
            fishing_day,
            score_col="Fishing Time Score",
            min_score=60,
            min_hours=2,
            max_hours=3,
        )

        row["Best Fishing Window"] = fishing_window["window"]
        row["Fishing Window Score"] = fishing_window["score"]

        running_day = running_df[
            running_df["date"] == forecast_date
        ]

        running_window = find_best_window(
            running_day,
            score_col="Running Time Score",
            min_score=60,
            min_hours=2,
            max_hours=3,
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

        kayaking_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        kayaking_window = find_best_window(
            kayaking_day,
            score_col="Kayaking Time Score",
            min_score=60,
            min_hours=2,
            max_hours=3,
        )

        row["Best Kayaking Window"] = kayaking_window["window"]
        row["Kayaking Window Score"] = kayaking_window["score"]

        disc_golf_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        disc_golf_window = find_best_window(
            disc_golf_day,
            score_col="Disc Golf Time Score",
            min_score=60,
            min_hours=2,
            max_hours=3,
        )

        row["Best Disc Golf Window"] = disc_golf_window["window"]
        row["Disc Golf Window Score"] = disc_golf_window["score"]

        tennis_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        tennis_window = find_best_window(
            tennis_day,
            score_col="Tennis Time Score",
            min_score=60,
            min_hours=2,
            max_hours=3,
        )

        row["Best Tennis Window"] = tennis_window["window"]
        row["Tennis Window Score"] = tennis_window["score"]

        beach_day = daylight_df[
            daylight_df["date"] == forecast_date
        ]

        beach_window = find_best_window(
            beach_day,
            score_col="Beach Day Time Score",
            min_score=60,
            min_hours=3,
            max_hours=5,
        )

        row["Best Beach Day Window"] = beach_window["window"]
        row["Beach Day Window Score"] = beach_window["score"]

        recommendations.append(row)

    recommendations_df = pd.DataFrame(recommendations)

    recommendations_df["date"] = pd.to_datetime(
        recommendations_df["date"]
    ).dt.strftime("%Y-%m-%d")

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


# =========================
# Planner reports
# =========================

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


def build_outdoor_outlook(predictions):
    """
    Builds short natural-language outlook items for the current forecast period.
    """

    outlook = []

    if predictions is None or len(predictions) == 0:
        return outlook

    df = predictions.copy()

    sort_column = (
        "planning_score"
        if "planning_score" in df.columns
        else "predicted_score"
    )

    best_overall = df.sort_values(
        sort_column,
        ascending=False,
    ).iloc[0]

    outlook.append(
        f"Best overall opportunity: {activity_label(best_overall['activity'])} "
        f"on {best_overall['date']} with planning score "
        f"{best_overall.get('planning_score', best_overall['predicted_score'])}."
    )

    water_activities = [
        "Fishing",
        "Kayaking",
        "Beach Day",
    ]

    water_df = df[
        df["activity"].isin(water_activities)
    ].copy()

    if len(water_df) > 0:
        best_water = water_df.sort_values(
            sort_column,
            ascending=False,
        ).iloc[0]

        outlook.append(
            f"Best water activity: {activity_label(best_water['activity'])} "
            f"on {best_water['date']}."
        )

    land_activities = [
        "Running",
        "Camping",
        "Disc Golf",
        "Tennis",
    ]

    land_df = df[
        df["activity"].isin(land_activities)
    ].copy()

    if len(land_df) > 0:
        best_land = land_df.sort_values(
            sort_column,
            ascending=False,
        ).iloc[0]

        outlook.append(
            f"Best land activity: {activity_label(best_land['activity'])} "
            f"on {best_land['date']}."
        )

    fishing_df = df[
        df["activity"] == "Fishing"
    ].copy()

    best_targets = []

    for _, fishing_row in fishing_df.iterrows():
        species_breakdown = fishing_row.get("species_breakdown", [])

        if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
            best_species = species_breakdown[0]

            best_targets.append({
                "date": fishing_row["date"],
                "species": best_species.get("species"),
                "score": best_species.get("score"),
            })

    if len(best_targets) > 0:
        best_targets_df = pd.DataFrame(best_targets)

        best_target = best_targets_df.sort_values(
            "score",
            ascending=False,
        ).iloc[0]

        outlook.append(
            f"Best fishing target: {best_target['species']} "
            f"on {best_target['date']}."
        )

    if "forecast_confidence" in df.columns:
        confidence_values = pd.to_numeric(
            df["forecast_confidence"],
            errors="coerce",
        )

        low_confidence_count = int(
            (confidence_values < 55).sum()
        )

        if low_confidence_count > 0:
            outlook.append(
                "Some later-week plans have lower forecast confidence. "
                "Recheck before committing."
            )

    if "storm_risk" in df.columns:
        risky_rows = df[
            ~df["storm_risk"].fillna("").isin(
                ["", "Low storm risk"]
            )
        ]

        if len(risky_rows) > 0:
            outlook.append(
                "There may be storm or weather-risk periods this week. "
                "Check alerts before outdoor plans."
            )

    return outlook