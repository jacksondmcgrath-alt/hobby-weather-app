import json

import pandas as pd


def flatten_json_column(df, column_name, prefix):
    """
    Flattens a JSON/dict column into separate columns.

    Example:
    advanced_features = {"visibility": 8}
    becomes:
    advanced_visibility = 8
    """

    if df is None or len(df) == 0:
        return df

    if column_name not in df.columns:
        return df

    working_df = df.copy()

    def ensure_dict(value):
        if isinstance(value, dict):
            return value

        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return {}

        return {}

    json_values = working_df[column_name].apply(ensure_dict)

    flattened = pd.json_normalize(json_values)

    if len(flattened.columns) == 0:
        return working_df

    flattened = flattened.add_prefix(f"{prefix}_")

    working_df = working_df.reset_index(drop=True)
    flattened = flattened.reset_index(drop=True)

    working_df = pd.concat(
        [
            working_df.drop(columns=[column_name]),
            flattened,
        ],
        axis=1,
    )

    return working_df


def build_scenario_ml_dataset(scenario_ratings):
    """
    Builds a scenario-rating ML dataset.

    Target:
    - target_score = rating_0_to_100

    Source:
    - scenario_rating
    """

    if scenario_ratings is None or len(scenario_ratings) == 0:
        return pd.DataFrame()

    df = scenario_ratings.copy()

    df["training_source"] = "scenario_rating"
    df["target_score"] = pd.to_numeric(
        df.get("rating_0_to_100"),
        errors="coerce",
    )

    # Keep only rows with usable target
    df = df.dropna(subset=["target_score"])

    # Flatten JSON context columns
    df = flatten_json_column(
        df,
        "advanced_features",
        "advanced",
    )

    df = flatten_json_column(
        df,
        "location_context",
        "location",
    )

    # Helpful metadata
    if "shown_features" in df.columns:
        df["shown_features_text"] = df["shown_features"].astype(str)

    if "hidden_features" in df.columns:
        df["hidden_features_text"] = df["hidden_features"].astype(str)

    return df


def build_activity_log_ml_dataset(activity_log, prediction_history=None):
    """
    Builds an activity-log ML dataset.

    Target:
    - target_score = actual_score_0_to_100

    Source:
    - activity_log

    If prediction_history is provided, joins weather/scoring context
    by date + activity.
    """

    if activity_log is None or len(activity_log) == 0:
        return pd.DataFrame()

    logs = activity_log.copy()

    logs["training_source"] = "activity_log"
    logs["target_score"] = pd.to_numeric(
        logs.get("actual_score_0_to_100"),
        errors="coerce",
    )

    logs = logs.dropna(subset=["target_score"])

    if prediction_history is not None and len(prediction_history) > 0:
        history = prediction_history.copy()

        if "date" in history.columns and "activity" in history.columns:
            history_columns_to_keep = [
                column for column in [
                    "date",
                    "activity",
                    "avg_temp",
                    "wind_max",
                    "gust_max",
                    "rain_chance",
                    "bug_index",
                    "storm_risk",
                    "water_temp_est",
                    "best_species",
                    "best_species_score",
                ]
                if column in history.columns
            ]

            history = history[history_columns_to_keep].drop_duplicates(
                subset=["date", "activity"],
                keep="first",
            )

            logs = logs.merge(
                history,
                on=["date", "activity"],
                how="left",
                suffixes=("", "_prediction_history"),
            )

    return logs


def build_combined_ml_dataset(scenario_ratings, activity_log, prediction_history=None):
    """
    Combines scenario ratings and activity logs into one ML-ready dataset.

    This dataset is exploratory. The first real model should likely start
    with scenario_ratings only, then compare against activity_logs later.
    """

    scenario_df = build_scenario_ml_dataset(scenario_ratings)
    activity_df = build_activity_log_ml_dataset(
        activity_log,
        prediction_history=prediction_history,
    )

    frames = []

    if scenario_df is not None and len(scenario_df) > 0:
        frames.append(scenario_df)

    if activity_df is not None and len(activity_df) > 0:
        frames.append(activity_df)

    if len(frames) == 0:
        return pd.DataFrame()

    combined = pd.concat(
        frames,
        ignore_index=True,
        sort=False,
    )

    return combined