import pandas as pd
import streamlit as st

from utils import score_label


# =========================
# Score badges / display helpers
# =========================

def score_color(score):
    """
    Returns a color name based on score.
    """

    if score >= 80:
        return "green"
    if score >= 60:
        return "orange"
    if score >= 40:
        return "red"

    return "gray"


def score_badge_html(score, label=None):
    """
    Creates a simple colored score badge.
    """

    color_map = {
        "green": "#1f8f4d",
        "orange": "#d9822b",
        "red": "#c0392b",
        "gray": "#6c757d",
    }

    color = color_map[score_color(score)]

    if label is None:
        label = score_label(score)

    return f"""
    <span style="
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background-color: {color};
        color: white;
        font-weight: 700;
        font-size: 0.9rem;
    ">
        {score} · {label}
    </span>
    """


def dashboard_warning_text(row):
    """
    Creates simple warning text based on weather fields.
    """

    warnings = []

    rain_chance = row.get("rain_chance", 0)
    wind_max = row.get("wind_max", 0)
    bug_index = row.get("bug_index", 0)
    storm_risk = row.get("storm_risk", "")

    if rain_chance >= 60:
        warnings.append("Rain risk")

    if wind_max >= 18:
        warnings.append("Windy")

    if bug_index >= 65:
        warnings.append("Buggy")

    if isinstance(storm_risk, str) and storm_risk not in ["Low storm risk", ""]:
        warnings.append(storm_risk)

    if len(warnings) == 0:
        return "No major warnings."

    return " • ".join(warnings)


# =========================
# Accuracy charts
# =========================

def show_accuracy_charts(activity_log):
    """
    Shows accuracy summaries and charts from the activity log.
    """

    if activity_log is None or len(activity_log) == 0:
        st.info("No activity logs available for accuracy charts yet.")
        return

    chart_log = activity_log.copy()

    required_columns = [
        "activity",
        "logged_at",
        "predicted_score",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
    ]

    missing_columns = [
        column for column in required_columns
        if column not in chart_log.columns
    ]

    if len(missing_columns) > 0:
        st.warning(
            "Accuracy charts cannot be shown because some required columns are missing."
        )
        st.write("Missing columns:")
        st.write(missing_columns)
        return

    numeric_columns = [
        "predicted_score",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
    ]

    for column in numeric_columns:
        chart_log[column] = pd.to_numeric(
            chart_log[column],
            errors="coerce",
        )

    chart_log["logged_at"] = pd.to_datetime(
        chart_log["logged_at"],
        errors="coerce",
    )

    chart_log = chart_log.dropna(
        subset=[
            "activity",
            "logged_at",
            "predicted_score",
            "actual_score_0_to_100",
            "prediction_error",
            "absolute_error",
        ]
    )

    if len(chart_log) == 0:
        st.info(
            "Not enough complete log data for accuracy charts yet. "
            "Logs need predicted and actual scores."
        )
        return

    st.subheader("Accuracy Summary by Activity")

    summary = (
        chart_log
        .groupby("activity", as_index=False)
        .agg(
            number_of_logs=("activity", "count"),
            average_error=("prediction_error", "mean"),
            average_absolute_error=("absolute_error", "mean"),
            average_predicted_score=("predicted_score", "mean"),
            average_actual_score=("actual_score_0_to_100", "mean"),
        )
    )

    summary["average_error"] = summary["average_error"].round(1)
    summary["average_absolute_error"] = summary["average_absolute_error"].round(1)
    summary["average_predicted_score"] = summary["average_predicted_score"].round(1)
    summary["average_actual_score"] = summary["average_actual_score"].round(1)

    summary = summary.sort_values(
        "average_absolute_error",
        ascending=True,
    )

    st.dataframe(
        summary,
        width="stretch",
    )

    st.subheader("Accuracy Charts")

    st.write("### Average Absolute Error by Activity")
    st.write("Lower is better.")

    absolute_error_chart = summary.set_index("activity")[
        "average_absolute_error"
    ]

    st.bar_chart(absolute_error_chart)

    st.write("### Average Error by Activity")
    st.write(
        "Positive means the activity was better than predicted. "
        "Negative means it was worse than predicted."
    )

    average_error_chart = summary.set_index("activity")[
        "average_error"
    ]

    st.bar_chart(average_error_chart)

    st.write("### Predicted vs. Actual Over Time")

    chart_activity_options = ["All"] + sorted(
        chart_log["activity"].dropna().unique().tolist()
    )

    selected_chart_activity = st.selectbox(
        "Choose activity for accuracy chart",
        options=chart_activity_options,
        key="accuracy_chart_activity_select",
    )

    if selected_chart_activity == "All":
        selected_chart_log = chart_log.copy()
    else:
        selected_chart_log = chart_log[
            chart_log["activity"] == selected_chart_activity
        ].copy()

    selected_chart_log = selected_chart_log.sort_values("logged_at")

    if len(selected_chart_log) == 0:
        st.info("No logs for this activity yet.")
        return

    predicted_vs_actual = selected_chart_log[
        [
            "logged_at",
            "predicted_score",
            "actual_score_0_to_100",
        ]
    ].copy()

    predicted_vs_actual = predicted_vs_actual.set_index("logged_at")

    st.line_chart(predicted_vs_actual)

    st.write("### Prediction Error Over Time")

    error_over_time = selected_chart_log[
        [
            "logged_at",
            "prediction_error",
        ]
    ].copy()

    error_over_time = error_over_time.set_index("logged_at")

    st.line_chart(error_over_time)

    st.write(
        """
        **How to read these charts:**

        - **Average absolute error** shows how far off the predictions are on average.
        - **Average error** shows direction:
            - Positive = actual experience was better than predicted.
            - Negative = actual experience was worse than predicted.
        - Lower absolute error means the scoring model is more accurate.
        """
    )


# =========================
# Model accuracy / tuning reports
# =========================

def build_accuracy_report(activity_log):
    """
    Builds text insights about model accuracy.
    """

    report_log = activity_log.copy()

    numeric_columns = [
        "predicted_score",
        "actual_score_0_to_100",
        "prediction_error",
        "absolute_error",
    ]

    for column in numeric_columns:
        report_log[column] = pd.to_numeric(
            report_log[column],
            errors="coerce",
        )

    report_log = report_log.dropna(
        subset=[
            "activity",
            "predicted_score",
            "actual_score_0_to_100",
            "prediction_error",
            "absolute_error",
        ]
    )

    if len(report_log) == 0:
        return pd.DataFrame(), []

    summary = (
        report_log
        .groupby("activity", as_index=False)
        .agg(
            logs=("activity", "count"),
            average_error=("prediction_error", "mean"),
            average_absolute_error=("absolute_error", "mean"),
        )
    )

    summary["average_error"] = summary["average_error"].round(1)
    summary["average_absolute_error"] = summary["average_absolute_error"].round(1)

    insights = []

    most_accurate = summary.sort_values("average_absolute_error").iloc[0]

    insights.append(
        f"Most accurate activity so far: {most_accurate['activity']} "
        f"with average absolute error {most_accurate['average_absolute_error']}."
    )

    least_accurate = summary.sort_values(
        "average_absolute_error",
        ascending=False,
    ).iloc[0]

    insights.append(
        f"Least accurate activity so far: {least_accurate['activity']} "
        f"with average absolute error {least_accurate['average_absolute_error']}."
    )

    overpredicted = summary.sort_values("average_error").iloc[0]

    if overpredicted["average_error"] < -5:
        insights.append(
            f"The model may be overrating {overpredicted['activity']} "
            f"by about {abs(overpredicted['average_error'])} points."
        )

    underpredicted = summary.sort_values(
        "average_error",
        ascending=False,
    ).iloc[0]

    if underpredicted["average_error"] > 5:
        insights.append(
            f"The model may be underrating {underpredicted['activity']} "
            f"by about {underpredicted['average_error']} points."
        )

    return summary, insights


def build_tuning_suggestions(activity_log):
    """
    Suggests model tuning changes based on actual logged conditions.
    """

    suggestions = []

    log = activity_log.copy()

    numeric_columns = [
        "prediction_error",
        "actual_bugs_1_to_10",
        "actual_wind_annoyance_1_to_10",
        "actual_humidity_comfort_1_to_10",
    ]

    for column in numeric_columns:
        if column in log.columns:
            log[column] = pd.to_numeric(
                log[column],
                errors="coerce",
            )

    log = log.dropna(
        subset=[
            "activity",
            "prediction_error",
        ]
    )

    if len(log) < 3:
        suggestions.append(
            "Add more logs before tuning. Aim for at least 3–5 logs per activity."
        )
        return suggestions

    camping = log[
        log["activity"] == "Camping"
    ]

    if len(camping) >= 3:
        buggy_bad = camping[
            (camping["actual_bugs_1_to_10"] >= 7) &
            (camping["prediction_error"] < -10)
        ]

        if len(buggy_bad) >= 2:
            suggestions.append(
                "Camping seems worse than predicted on buggy days. "
                "Consider increasing Camping bug sensitivity."
            )

    kayaking = log[
        log["activity"] == "Kayaking"
    ]

    if len(kayaking) >= 3:
        windy_bad = kayaking[
            (kayaking["actual_wind_annoyance_1_to_10"] >= 7) &
            (kayaking["prediction_error"] < -10)
        ]

        if len(windy_bad) >= 2:
            suggestions.append(
                "Kayaking seems worse than predicted when wind is annoying. "
                "Consider increasing Kayaking wind caution."
            )

    running = log[
        log["activity"] == "Running"
    ]

    if len(running) >= 3:
        humid_bad = running[
            (running["actual_humidity_comfort_1_to_10"] <= 4) &
            (running["prediction_error"] < -10)
        ]

        if len(humid_bad) >= 2:
            suggestions.append(
                "Running seems worse than predicted when humidity comfort is low. "
                "Consider increasing Running heat sensitivity or adding more dew point penalty."
            )

    fishing_activities = [
        "Fishing",
        "Bass Fishing",
        "Trout Fishing",
        "Walleye Fishing",
        "Pike Fishing",
        "Panfish Fishing",
    ]

    fishing = log[
        log["activity"].isin(fishing_activities)
    ]

    if len(fishing) >= 3 and "fish_activity" in fishing.columns:
        high_activity = fishing[
            (fishing["fish_activity"] == "High") &
            (fishing["prediction_error"] > 10)
        ]

        if len(high_activity) >= 2:
            suggestions.append(
                "Fishing is sometimes better than predicted when fish activity is high. "
                "Consider increasing fishing insect/activity importance or checking pressure/water temp logic."
            )

    if len(suggestions) == 0:
        suggestions.append(
            "No strong tuning suggestions yet. Keep logging more activities."
        )

    return suggestions