import math
import time
from datetime import datetime

import pandas as pd
import requests


def is_missing_scalar(value):
    """
    Safely checks whether a scalar value is missing.

    Avoids calling pd.isna() on lists/dicts, which causes ambiguity errors.
    """

    if value is None:
        return True

    if isinstance(value, (list, dict, tuple, set)):
        return False

    try:
        result = pd.isna(value)

        try:
            return bool(result)
        except Exception:
            return False

    except Exception:
        return False


def clean_json_value(value):
    """
    Converts values into JSON-safe values.

    Supabase JSONB cannot store:
    - NaN
    - Infinity
    - pandas NA/NaT
    - numpy scalar values
    """

    if value is None:
        return None

    if isinstance(value, dict):
        return {
            str(key): clean_json_value(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [
            clean_json_value(item)
            for item in value
        ]

    if isinstance(value, tuple):
        return [
            clean_json_value(item)
            for item in value
        ]

    if isinstance(value, set):
        return [
            clean_json_value(item)
            for item in value
        ]

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, datetime):
        return value.isoformat()

    # Convert numpy/pandas scalar types to Python scalar types
    if hasattr(value, "item"):
        try:
            return clean_json_value(value.item())
        except Exception:
            pass

    if is_missing_scalar(value):
        return None

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None

    if isinstance(value, (str, int, bool)):
        return value

    if isinstance(value, float):
        return value

    return str(value)


def dataframe_to_json_records(df):
    """
    Converts a DataFrame to JSON-safe records.
    """

    records = df.to_dict(orient="records")
    return clean_json_value(records)


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


def clamp_score(score):
    return max(0, min(100, score))


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


def high_is_good_score(value, ideal_min, bad_at):
    """
    Scores something where higher is better.

    Example:
    storm safety:
    85+ is good.
    40 or lower is bad.
    """

    if pd.isna(value):
        return 50

    if value >= ideal_min:
        return 100

    if value <= bad_at:
        return 0

    return 100 * (value - bad_at) / (ideal_min - bad_at)


def score_label(score):
    if score >= 80:
        return "Great"
    if score >= 60:
        return "Good"
    if score >= 40:
        return "Okay"

    return "Poor"