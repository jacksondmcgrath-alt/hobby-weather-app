import pandas as pd

from config import (
    FACTOR_METRIC_MAP,
    HARDCODED_ACTIVITIES,
    SPECIES_FISHING_PROFILES,
    FISHING_ACTIVITIES,
)

from database import (
    load_baseline_hobby_rules,
    get_rules_for_hobby,
)

from weather import (
    fetch_weather_forecast,
    fetch_air_quality_forecast,
    aggregate_weather_by_day,
    add_air_quality_by_day,
)

from utils import (
    clamp_score,
    safe_value,
    range_score,
    low_is_good_score,
    high_is_good_score,
    score_label,
)


# =========================
# Forecast confidence
# =========================

def forecast_lead_time_score(date_value):
    """
    Scores forecast reliability based mostly on how far away the date is.

    Higher = more confidence.
    """

    try:
        forecast_date = pd.to_datetime(date_value).date()
        today = pd.Timestamp.today().date()
        days_out = (forecast_date - today).days
    except Exception:
        return 50

    if days_out <= 0:
        return 95
    if days_out == 1:
        return 90
    if days_out == 2:
        return 82
    if days_out == 3:
        return 74
    if days_out == 4:
        return 65
    if days_out == 5:
        return 58
    if days_out == 6:
        return 52
    if days_out == 7:
        return 47

    return 40


def weather_complexity_confidence(row):
    """
    Scores how stable/simple the forecast looks.

    Higher = simpler/more reliable planning conditions.
    Lower = more conditional/uncertain weather.
    """

    score = 100

    rain_chance = row.get("rain_chance", 0)
    wind_max = row.get("wind_max", 0)
    gust_max = row.get("gust_max", 0)
    storm_risk = row.get("storm_risk", "")

    try:
        rain_chance = float(rain_chance)
    except Exception:
        rain_chance = 0

    try:
        wind_max = float(wind_max)
    except Exception:
        wind_max = 0

    try:
        gust_max = float(gust_max)
    except Exception:
        gust_max = 0

    if 30 <= rain_chance <= 70:
        score -= 15
    elif rain_chance > 70:
        score -= 10

    if wind_max >= 18:
        score -= 10

    if gust_max >= 25:
        score -= 10

    if isinstance(storm_risk, str):
        if storm_risk not in ["Low storm risk", "", "nan", "None"]:
            score -= 20

    return clamp_score(score)


def forecast_confidence_label(score):
    """
    Converts forecast confidence score into a planning label.
    """

    if score >= 85:
        return "High confidence"
    if score >= 70:
        return "Solid"
    if score >= 55:
        return "Watch closely"
    if score >= 40:
        return "Uncertain"

    return "Very uncertain"


def add_forecast_confidence(predictions):
    """
    Adds forecast confidence and confidence-adjusted planning score.
    """

    df = predictions.copy()

    confidence_scores = []

    for _, row in df.iterrows():
        lead_score = forecast_lead_time_score(row["date"])
        complexity_score = weather_complexity_confidence(row)

        confidence = round(
            clamp_score(
                (lead_score * 0.75) +
                (complexity_score * 0.25)
            )
        )

        confidence_scores.append(confidence)

    df["forecast_confidence"] = confidence_scores
    df["forecast_confidence_label"] = df["forecast_confidence"].apply(
        forecast_confidence_label
    )

    df["planning_score"] = (
        df["predicted_score"] * 0.80 +
        df["forecast_confidence"] * 0.20
    ).round(0).astype(int)

    return df


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


def add_extra_features(daily_df, manual_water_temp):
    """
    Adds derived weather/activity features.
    """

    daily = daily_df.copy()

    daily["bug_activity_index"] = daily.apply(
        calculate_bug_activity_index,
        axis=1,
    )

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
# Hobby scoring helpers
# =========================

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


# =========================
# Species fishing
# =========================

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


def score_species_fishing(row, species_name, species_profile):
    """
    Scores fishing for a specific freshwater species.
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

    if species_profile.get("bug_bonus", False):
        score += bug_score * 0.04

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


def build_species_fishing_breakdown(row):
    """
    Builds species-specific fishing scores for the Fishing deeper dive.
    """

    species_rows = []

    for species_name, species_profile in SPECIES_FISHING_PROFILES.items():
        species_score, species_explanation = score_species_fishing(
            row=row,
            species_name=species_name,
            species_profile=species_profile,
        )

        species_rows.append({
            "species": species_name.replace(" Fishing", ""),
            "activity_name": species_name,
            "score": species_score,
            "label": score_label(species_score),
            "explanation": species_explanation,
        })

    species_rows = sorted(
        species_rows,
        key=lambda item: item["score"],
        reverse=True,
    )

    return species_rows


# =========================
# Hardcoded hobby scoring
# =========================

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
    temp_score = range_score(row["temp_avg"], 65, 85, 50, 95)
    water_score = range_score(row["estimated_water_temp"], 60, 78, 45, 88)

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
    temp_score = range_score(row["temp_avg"], 50, 78, 35, 92)

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


# =========================
# Dynamic rule-based scoring
# =========================

def get_rule_number(rule, column_name, default=None):
    """
    Safely gets a numeric value from a rule row.
    """

    value = rule.get(column_name, default)

    try:
        if pd.isna(value):
            return default
    except Exception:
        pass

    try:
        return float(value)
    except Exception:
        return default


def score_value_from_rule(value, rule):
    """
    Scores one weather/environment value using one baseline rule.
    """

    direction = str(rule.get("direction", "")).lower()

    ideal_low = get_rule_number(rule, "ideal_low")
    ideal_high = get_rule_number(rule, "ideal_high")
    okay_low = get_rule_number(rule, "okay_low")
    okay_high = get_rule_number(rule, "okay_high")
    bad_low = get_rule_number(rule, "bad_low")
    bad_high = get_rule_number(rule, "bad_high")

    if pd.isna(value):
        return 50

    if direction == "range":
        if ideal_low is None or ideal_high is None:
            return 50

        absolute_low = okay_low if okay_low is not None else ideal_low - 20
        absolute_high = okay_high if okay_high is not None else ideal_high + 20

        return range_score(
            value=value,
            ideal_low=ideal_low,
            ideal_high=ideal_high,
            absolute_low=absolute_low,
            absolute_high=absolute_high,
        )

    if direction == "low":
        ideal_max = ideal_high if ideal_high is not None else ideal_low

        if ideal_max is None:
            return 50

        bad_at = bad_low if bad_low is not None else okay_high

        if bad_at is None:
            bad_at = ideal_max + 20

        return low_is_good_score(
            value=value,
            ideal_max=ideal_max,
            bad_at=bad_at,
        )

    if direction == "high":
        ideal_min = ideal_low if ideal_low is not None else ideal_high

        if ideal_min is None:
            return 50

        bad_at = bad_high if bad_high is not None else okay_low

        if bad_at is None:
            bad_at = ideal_min - 20

        return high_is_good_score(
            value=value,
            ideal_min=ideal_min,
            bad_at=bad_at,
        )

    return 50


def score_hobby_from_rules(day_row, hobby_name, hobby_rules):
    """
    Dynamically scores a hobby using baseline_hobby_rules from Supabase.
    """

    if hobby_rules is None or len(hobby_rules) == 0:
        return 50, f"No baseline rules found for {hobby_name}."

    weighted_score = 0
    total_weight = 0
    factor_details = []

    for _, rule in hobby_rules.iterrows():
        factor = rule.get("factor")
        metric = FACTOR_METRIC_MAP.get(factor)

        if metric is None:
            continue

        if metric not in day_row:
            continue

        value = day_row[metric]
        factor_score = score_value_from_rule(value, rule)
        weight = get_rule_number(rule, "weight", default=1)

        if weight is None:
            weight = 1

        weighted_score += factor_score * weight
        total_weight += weight

        factor_details.append({
            "factor": factor,
            "metric": metric,
            "value": value,
            "score": factor_score,
            "weight": weight,
            "confidence": rule.get("confidence", ""),
            "notes": rule.get("notes", ""),
        })

    if total_weight == 0:
        return 50, f"No usable scoring rules found for {hobby_name}."

    final_score = round(clamp_score(weighted_score / total_weight))

    weak_factors = sorted(
        factor_details,
        key=lambda item: item["score"],
    )[:2]

    strong_factors = sorted(
        factor_details,
        key=lambda item: item["score"],
        reverse=True,
    )[:2]

    explanation_parts = []

    if len(strong_factors) > 0:
        strong_text = ", ".join(
            f"{item['factor']} scored {item['score']:.0f}"
            for item in strong_factors
        )

        explanation_parts.append(f"strongest factors: {strong_text}")

    if len(weak_factors) > 0:
        weak_text = ", ".join(
            f"{item['factor']} scored {item['score']:.0f}"
            for item in weak_factors
        )

        explanation_parts.append(f"weakest factors: {weak_text}")

    explanation = (
        f"{hobby_name} score is based on source-backed baseline rules. "
        + "; ".join(explanation_parts)
        + "."
    )

    return final_score, explanation


# =========================
# Full prediction pipeline
# =========================

def generate_predictions(latitude, longitude, days, manual_water_temp, include_air_quality=False):
    """
    Full automatic prediction pipeline.
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

    baseline_rules = load_baseline_hobby_rules()

    dynamic_hobbies = []

    if len(baseline_rules) > 0:
        dynamic_hobbies = sorted([
            hobby
            for hobby in baseline_rules["hobby"].dropna().unique()
            if hobby not in HARDCODED_ACTIVITIES
        ])

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
            "water_temp_est": round(row["estimated_water_temp"]),
        }

        species_breakdown = build_species_fishing_breakdown(row)
        best_species = species_breakdown[0] if len(species_breakdown) > 0 else None

        if best_species is not None:
            best_species_name = best_species["species"]
            best_species_score = best_species["score"]
        else:
            best_species_name = None
            best_species_score = None

        rows.append({
            "date": row["date"],
            "activity": "Fishing",
            "predicted_score": fishing_score,
            "label": score_label(fishing_score),
            "explanation": fishing_explanation,
            "gear_notes": gear_notes,
            "best_species": best_species_name,
            "best_species_score": best_species_score,
            "species_breakdown": species_breakdown,
            **common_weather,
        })

        rows.append({
            "date": row["date"],
            "activity": "Camping",
            "predicted_score": camping_score,
            "label": score_label(camping_score),
            "explanation": camping_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        rows.append({
            "date": row["date"],
            "activity": "Running",
            "predicted_score": running_score,
            "label": score_label(running_score),
            "explanation": running_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        rows.append({
            "date": row["date"],
            "activity": "Kayaking",
            "predicted_score": kayaking_score,
            "label": score_label(kayaking_score),
            "explanation": kayaking_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        rows.append({
            "date": row["date"],
            "activity": "Disc Golf",
            "predicted_score": disc_golf_score,
            "label": score_label(disc_golf_score),
            "explanation": disc_golf_explanation,
            "gear_notes": gear_notes,
            **common_weather,
        })

        for dynamic_hobby in dynamic_hobbies:
            hobby_rules = get_rules_for_hobby(
                baseline_rules,
                dynamic_hobby,
            )

            dynamic_score, dynamic_explanation = score_hobby_from_rules(
                day_row=row,
                hobby_name=dynamic_hobby,
                hobby_rules=hobby_rules,
            )

            rows.append({
                "date": row["date"],
                "activity": dynamic_hobby,
                "predicted_score": dynamic_score,
                "label": score_label(dynamic_score),
                "explanation": dynamic_explanation,
                "gear_notes": gear_notes,
                **common_weather,
            })

    predictions = pd.DataFrame(rows)

    predictions["date"] = pd.to_datetime(
        predictions["date"],
        errors="coerce",
    ).dt.strftime("%Y-%m-%d")

    predictions = predictions.drop_duplicates(
        subset=["date", "activity"],
        keep="last",
    )

    predictions = predictions.sort_values(
        ["date", "activity"]
    ).reset_index(drop=True)

    return predictions


def apply_preference_adjustments(predictions, preferences):
    """
    Adjusts predicted scores based on user preference sliders.
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

        bug_tolerance = preferences["bug_tolerance"]

        if activity in ["Camping", "Running", "Disc Golf", "Kayaking"]:
            if bug_index > 45:
                bug_penalty = ((bug_index - 45) / 10) * (10 - bug_tolerance) * 0.7
                adjustment -= bug_penalty

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

        if activity in FISHING_ACTIVITIES:
            fishing_bug_boost = preferences["fishing_bug_boost"]
            fishing_wind_tolerance = preferences["fishing_wind_tolerance"]

            if 35 <= bug_index <= 75:
                adjustment += (fishing_bug_boost - 5) * 1.5

            if wind_max > 12:
                wind_penalty = (wind_max - 12) * (10 - fishing_wind_tolerance) * 0.25
                adjustment -= wind_penalty

            if 4 <= wind_max <= 12:
                adjustment += fishing_wind_tolerance * 0.4

        if activity == "Camping":
            camping_bug_sensitivity = preferences["camping_bug_sensitivity"]

            if bug_index > 40:
                bug_penalty = ((bug_index - 40) / 10) * camping_bug_sensitivity * 0.8
                adjustment -= bug_penalty

        if activity == "Running":
            running_wind_sensitivity = preferences["running_wind_sensitivity"]
            running_heat_sensitivity = preferences["running_heat_sensitivity"]

            if wind_max > 8:
                adjustment -= (wind_max - 8) * running_wind_sensitivity * 0.25

            if avg_temp > 60:
                adjustment -= (avg_temp - 60) * running_heat_sensitivity * 0.25

        if activity == "Kayaking":
            kayaking_wind_caution = preferences["kayaking_wind_caution"]

            if wind_max > 8:
                adjustment -= (wind_max - 8) * kayaking_wind_caution * 0.4

            if gust_max > 15:
                adjustment -= (gust_max - 15) * kayaking_wind_caution * 0.25

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