import json
from datetime import datetime

import pandas as pd
import streamlit as st

from config import *
from utils import *
from database import *
from locations import *
from weather import *
from scoring import *
from planner import *
from scenarios import *
from ui_helpers import *
from ml_export import *


st.set_page_config(
    page_title="Hobby Weather Scorer",
    page_icon="🌤️",
    layout="wide",
)

# =========================
# Streamlit user interface
# =========================

st.title("🌤️ Hobby Weather Scorer")

st.write(
    "This app generates hobby weather predictions automatically and lets you log how the activity actually went."
)


# -------------------------
# Sidebar settings
# -------------------------

saved_settings = load_settings()

# Initialize session state from saved preferences
for key, default_value in DEFAULT_SETTINGS.items():
    if key not in st.session_state:
        st.session_state[key] = saved_settings.get(key, default_value)


st.sidebar.header("Settings")


# -------------------------
# Location settings
# -------------------------

with st.sidebar.expander("📍 Location", expanded=True):

    saved_locations = load_saved_locations()

    if st.button("Use current forecast location as candidate"):
        st.session_state["new_location_search_results"] = [
            {
                "label": "Current forecast location",
                "latitude": st.session_state.get("latitude", DEFAULT_SETTINGS["latitude"]),
                "longitude": st.session_state.get("longitude", DEFAULT_SETTINGS["longitude"]),
                "source": "Current app location",
            }
        ]
        st.rerun()

    if len(saved_locations) > 0:
        saved_location_labels = ["Manual / Search Location"] + [
            f"{row['name']} ({row['location_type']})"
            for _, row in saved_locations.iterrows()
        ]

        selected_saved_location_label = st.selectbox(
            "Saved location",
            options=saved_location_labels,
            key="selected_saved_location_label",
        )

        if selected_saved_location_label != "Manual / Search Location":
            selected_index = saved_location_labels.index(selected_saved_location_label) - 1
            selected_location = saved_locations.iloc[selected_index]

            st.session_state["latitude"] = float(selected_location["latitude"])
            st.session_state["longitude"] = float(selected_location["longitude"])

            if not pd.isna(selected_location.get("manual_water_temp")):
                st.session_state["manual_water_temp"] = float(selected_location["manual_water_temp"])
                st.session_state["use_manual_water_temp"] = True

            st.caption(f"Using saved location: {selected_location['name']}")

    st.write("Search for a location or manually enter coordinates.")

    location_query = st.text_input(
        "Location search",
        key="location_query",
        help="Example: Ann Arbor, MI or Grand Rapids, Michigan",
    )

    if st.button("Find location"):
        try:
            location_results = search_location_anything(location_query)

            if len(location_results) == 0:
                st.warning("No locations found. Try a simpler search.")
                st.session_state["location_results"] = []
            else:
                st.session_state["location_results"] = location_results
                st.success("Location results found. Choose one below.")

        except Exception as e:
            st.error("Could not search for that location.")
            st.write(e)

    if "location_results" not in st.session_state:
        st.session_state["location_results"] = []

    if len(st.session_state["location_results"]) > 0:
        location_labels = [
            result["label"] for result in st.session_state["location_results"]
        ]

        selected_location_label = st.selectbox(
            "Choose matching location",
            options=location_labels,
        )

        if st.button("Use selected location"):
            selected_result = next(
                result for result in st.session_state["location_results"]
                if result["label"] == selected_location_label
            )

            st.session_state["latitude"] = float(selected_result["latitude"])
            st.session_state["longitude"] = float(selected_result["longitude"])
            st.success(f"Using {selected_location_label}")
            st.rerun()

    latitude = st.number_input(
        "Latitude",
        format="%.4f",
        key="latitude",
    )

    longitude = st.number_input(
        "Longitude",
        format="%.4f",
        key="longitude",
    )

    forecast_days = st.slider(
        "Forecast days",
        min_value=3,
        max_value=14,
        key="forecast_days",
    )


# -------------------------
# Fishing and water settings
# -------------------------

with st.sidebar.expander("🎣 Fishing / Water", expanded=False):
    use_manual_water_temp = st.checkbox(
        "I know the freshwater temperature",
        key="use_manual_water_temp",
    )

    if use_manual_water_temp:
        manual_water_temp = st.number_input(
            "Water temperature °F",
            min_value=32,
            max_value=90,
            key="manual_water_temp",
        )
    else:
        manual_water_temp = None


# -------------------------
# Preference sliders
# -------------------------

with st.sidebar.expander("🎛️ Preferences", expanded=False):
    st.write("Use these to personalize the scoring model.")

    bug_tolerance = st.slider(
        "General bug tolerance",
        min_value=0,
        max_value=10,
        key="bug_tolerance",
        help="0 = I hate bugs, 10 = bugs do not bother me much",
    )

    rain_caution = st.slider(
        "Rain caution",
        min_value=0,
        max_value=10,
        key="rain_caution",
        help="0 = rain does not bother me, 10 = avoid rain strongly",
    )

    fishing_bug_boost = st.slider(
        "Fishing insect activity importance",
        min_value=0,
        max_value=10,
        key="fishing_bug_boost",
        help="Higher means bug/insect activity helps the fishing score more",
    )

    fishing_wind_tolerance = st.slider(
        "Fishing wind tolerance",
        min_value=0,
        max_value=10,
        key="fishing_wind_tolerance",
        help="Higher means you are more okay with wind while fishing",
    )

    camping_bug_sensitivity = st.slider(
        "Camping bug sensitivity",
        min_value=0,
        max_value=10,
        key="camping_bug_sensitivity",
        help="Higher means bugs hurt camping scores more",
    )

    running_wind_sensitivity = st.slider(
        "Running wind sensitivity",
        min_value=0,
        max_value=10,
        key="running_wind_sensitivity",
        help="Higher means wind hurts running scores more",
    )

    running_heat_sensitivity = st.slider(
        "Running heat sensitivity",
        min_value=0,
        max_value=10,
        key="running_heat_sensitivity",
        help="Higher means warm weather hurts running scores more",
    )

    kayaking_wind_caution = st.slider(
        "Kayaking wind caution",
        min_value=0,
        max_value=10,
        key="kayaking_wind_caution",
        help="Higher means wind/gusts hurt kayaking scores more",
    )

    disc_golf_wind_sensitivity = st.slider(
        "Disc golf wind sensitivity",
        min_value=0,
        max_value=10,
        key="disc_golf_wind_sensitivity",
        help="Higher means wind hurts disc golf scores more",
    )


preferences = {
    "bug_tolerance": bug_tolerance,
    "rain_caution": rain_caution,
    "fishing_bug_boost": fishing_bug_boost,
    "fishing_wind_tolerance": fishing_wind_tolerance,
    "camping_bug_sensitivity": camping_bug_sensitivity,
    "running_wind_sensitivity": running_wind_sensitivity,
    "running_heat_sensitivity": running_heat_sensitivity,
    "kayaking_wind_caution": kayaking_wind_caution,
    "disc_golf_wind_sensitivity": disc_golf_wind_sensitivity,
}


# -------------------------
# Display settings
# -------------------------

with st.sidebar.expander("🖥️ Display", expanded=False):
    phone_friendly_view = st.checkbox(
        "Phone-friendly view",
        key="phone_friendly_view",
    )

    include_air_quality = st.checkbox(
        "Include air quality / UV",
        key="include_air_quality",
        help="Turn off for faster loading. Turn on if air quality matters for running.",
    )

# -------------------------
# Save and refresh settings
# -------------------------

with st.sidebar.expander("💾 Save / Refresh", expanded=False):
    if st.button("Save current settings"):
        settings_to_save = {
            "latitude": latitude,
            "longitude": longitude,
            "location_query": location_query,
            "forecast_days": forecast_days,
            "use_manual_water_temp": use_manual_water_temp,
            "manual_water_temp": st.session_state.get("manual_water_temp", 65),
            "phone_friendly_view": phone_friendly_view,
            "include_air_quality": include_air_quality,

            "bug_tolerance": bug_tolerance,
            "rain_caution": rain_caution,
            "fishing_bug_boost": fishing_bug_boost,
            "fishing_wind_tolerance": fishing_wind_tolerance,
            "camping_bug_sensitivity": camping_bug_sensitivity,
            "running_wind_sensitivity": running_wind_sensitivity,
            "running_heat_sensitivity": running_heat_sensitivity,
            "kayaking_wind_caution": kayaking_wind_caution,
            "disc_golf_wind_sensitivity": disc_golf_wind_sensitivity,
        }

        save_settings(settings_to_save)

        st.success("Settings saved.")

    if st.button("Reset settings to defaults"):
        save_settings(DEFAULT_SETTINGS)

        for key in DEFAULT_SETTINGS:
            if key in st.session_state:
                del st.session_state[key]

        st.cache_data.clear()
        st.rerun()

    if st.button("Force refresh forecast"):
        st.session_state["force_refresh_forecast"] = True
        st.cache_data.clear()
        st.rerun()

    if st.button("Clear cached weather and refresh"):
        st.cache_data.clear()
        st.rerun()

# -------------------------
# Generate predictions and best times
# -------------------------

with st.spinner("Loading forecast and scoring activities..."):
    try:
        force_refresh = st.session_state.pop("force_refresh_forecast", False)

        weekly_obligations = load_weekly_obligations()

        if len(weekly_obligations) > 0:
            obligations_key = weekly_obligations[
                [
                    "label",
                    "day_of_week",
                    "start_time",
                    "end_time",
                    "active",
                ]
            ].to_dict(orient="records")
        else:
            obligations_key = []

        forecast_cache_key = make_forecast_cache_key(
            latitude=latitude,
            longitude=longitude,
            forecast_days=forecast_days,
            manual_water_temp=manual_water_temp,
            preferences=preferences,
            include_air_quality=include_air_quality,
            obligations_key=obligations_key,
        )

        if not force_refresh:
            cached_predictions, cached_time_recommendations = load_forecast_cache(
                forecast_cache_key,
                max_age_minutes=120,
                allow_stale=False,
            )
        else:
            cached_predictions, cached_time_recommendations = None, None

        if cached_predictions is not None and cached_time_recommendations is not None:
            predictions = cached_predictions
            time_recommendations = cached_time_recommendations
            forecast_source = "cached"

            st.caption("Using cached forecast from the last 2 hours.")

        else:
            try:
                base_predictions = generate_predictions(
                    latitude=latitude,
                    longitude=longitude,
                    days=forecast_days,
                    manual_water_temp=manual_water_temp,
                    include_air_quality=include_air_quality,
                )

                predictions = apply_preference_adjustments(
                    predictions=base_predictions,
                    preferences=preferences,
                )

                hourly_weather_for_times = fetch_weather_forecast(
                    latitude=latitude,
                    longitude=longitude,
                    days=forecast_days,
                )

                sun_times = fetch_sun_times(
                    latitude=latitude,
                    longitude=longitude,
                    days=forecast_days,
                )

                weekly_obligations = load_weekly_obligations()

                time_recommendations = build_time_recommendations(
                    hourly_df=hourly_weather_for_times,
                    sun_times=sun_times,
                    obligations_df=weekly_obligations,
                )

                forecast_source = "fresh"

                save_forecast_cache(
                    cache_key=forecast_cache_key,
                    latitude=latitude,
                    longitude=longitude,
                    forecast_days=forecast_days,
                    manual_water_temp=manual_water_temp,
                    predictions=predictions,
                    time_recommendations=time_recommendations,
                )

                prediction_save_key = (
                    f"{latitude}_{longitude}_{forecast_days}_"
                    f"{manual_water_temp}_"
                    f"{include_air_quality}_"
                    f"{predictions['date'].min()}_{predictions['date'].max()}_"
                    f"{tuple(sorted(preferences.items()))}"
                )

                if st.session_state.get("last_prediction_save_key") != prediction_save_key:
                    save_prediction_history(predictions)
                    load_prediction_history.clear()
                    st.session_state["last_prediction_save_key"] = prediction_save_key

            except Exception as fresh_fetch_error:
                stale_predictions, stale_time_recommendations = load_forecast_cache(
                    forecast_cache_key,
                    max_age_minutes=999999,
                    allow_stale=True,
                )

                if stale_predictions is not None and stale_time_recommendations is not None:
                    predictions = stale_predictions
                    time_recommendations = stale_time_recommendations
                    forecast_source = "stale"

                    st.warning(
                        "Fresh weather data could not be loaded, so the app is using an older cached forecast."
                    )
                    st.caption(f"Weather API error: {fresh_fetch_error}")

                else:
                    raise fresh_fetch_error

    except Exception as e:
        st.error("Could not generate predictions.")
        st.write(e)
        st.stop()

if "forecast_source" not in locals():
    forecast_source = "unknown"        

predictions = add_forecast_confidence(predictions)

home_tab, planner_tab, log_tab, scenario_tab, history_tab, manage_tab = st.tabs(
    [
        "🏠 Home",
        "📅 Planner",
        "➕ Log Activity",
        "🧪 Rate Scenarios",
        "📈 History",
        "🛠️ Manage",
    ]
)

activity_log = load_activity_log()

# -------------------------
# Display predictions
# -------------------------

with scenario_tab:
    st.header("Scenario Ratings")

    st.write(
        "Rate hypothetical or historical weather situations. These ratings help build "
        "a future machine-learning baseline for first-time predictions."
    )

    scenario_section_labels = {
        "Rate": "🧪 Rate",
        "Insights": "📊 Insights",
        "Progress": "🎯 Progress",
        "Manage": "🛠️ Manage Ratings",
    }

    scenario_section = st.radio(
        "Scenario section",
        options=list(scenario_section_labels.keys()),
        format_func=lambda option: scenario_section_labels[option],
        horizontal=True,
        key="scenario_section_selector",
    )

    # -------------------------
    # Rate Scenario
    # -------------------------

    if scenario_section == "Rate":
        available_scenario_activities = [
            activity
            for activity in sorted(predictions["activity"].unique())
            if activity in ACTIVITY_SCENARIO_FIELDS
        ]

        if len(available_scenario_activities) == 0:
            st.info("No scenario activities available.")

        else:
            selected_scenario_activity = st.selectbox(
                "Choose activity",
                options=available_scenario_activities,
                key="scenario_activity_select",
            )

            scenario_source = st.radio(
                "Scenario source",
                options=["Random synthetic", "Historical weather"],
                horizontal=True,
                key="scenario_source_select",
            )

            scenario_mode = st.selectbox(
                "Scenario detail level",
                options=["basic", "advanced"],
                index=0,
                help="Basic shows the main factors. Advanced includes more stored context.",
                key="scenario_mode_select",
            )

            scenario_state_changed = (
                "current_scenario" not in st.session_state
                or st.session_state.get("current_scenario_activity") != selected_scenario_activity
                or st.session_state.get("current_scenario_source") != scenario_source
            )

            if scenario_state_changed:
                if scenario_source == "Historical weather":
                    st.session_state["current_scenario"] = generate_historical_scenario(
                        selected_scenario_activity,
                        latitude,
                        longitude,
                    )
                else:
                    st.session_state["current_scenario"] = generate_random_scenario(
                        selected_scenario_activity
                    )

                st.session_state["current_scenario_activity"] = selected_scenario_activity
                st.session_state["current_scenario_source"] = scenario_source

            if st.button("Generate new scenario"):
                if scenario_source == "Historical weather":
                    st.session_state["current_scenario"] = generate_historical_scenario(
                        selected_scenario_activity,
                        latitude,
                        longitude,
                    )
                else:
                    st.session_state["current_scenario"] = generate_random_scenario(
                        selected_scenario_activity
                    )

                st.session_state["current_scenario_activity"] = selected_scenario_activity
                st.session_state["current_scenario_source"] = scenario_source
                st.rerun()

            scenario = st.session_state["current_scenario"]

            if scenario.get("scenario_generation_method") == "historical_weather_v1":
                st.caption(
                    f"Historical weather scenario from "
                    f"{scenario.get('historical_date', 'unknown date')} "
                    f"at {scenario.get('historical_time', 'unknown time')}."
                )
            else:
                st.caption("Random synthetic scenario.")

            st.subheader(f"Scenario: {activity_label(selected_scenario_activity)}")

            pretty_names = {
                "temperature": "Temperature °F",
                "wind_speed": "Wind speed mph",
                "wind_gust": "Wind gust mph",
                "rain_chance": "Rain chance %",
                "humidity": "Humidity %",
                "cloud_cover": "Cloud cover %",
                "pressure_change": "Pressure change",
                "bug_index": "Bug index",
                "water_temp": "Water temp °F",
                "storm_safety": "Storm safety",
                "dew_point": "Dew point °F",
                "aqi": "AQI",
                "uv_index": "UV index",
                "visibility": "Visibility miles",
                "wind_direction": "Wind direction °",
                "rain_amount": "Rain amount inches",
                "recent_rain_24h": "Recent rain 24h inches",
                "recent_rain_72h": "Recent rain 72h inches",
                "overnight_low": "Overnight low °F",
                "month": "Month",
                "season": "Season",
                "daylight_hours": "Daylight hours",
                "moon_phase": "Moon phase",
                "moon_illumination": "Moon illumination %",
                "pollen_index": "Pollen index",
                "river_flow_cfs": "River flow CFS",
                "gauge_height": "Gauge height",
                "flow_trend": "Flow trend",
                "wave_height_ft": "Wave height ft",
                "rip_current_risk": "Rip current risk",
                "fire_danger": "Fire danger",
            }

            display_fields = get_shown_features_for_scenario(
                selected_scenario_activity,
                scenario_mode=scenario_mode,
            )

            scenario_display_rows = []

            for key in display_fields:
                scenario_display_rows.append(
                    {
                        "Factor": pretty_names.get(key, key),
                        "Value": scenario.get(key),
                    }
                )

            st.dataframe(
                pd.DataFrame(scenario_display_rows),
                width="stretch",
            )

            st.write("### Your rating")

            scenario_rating = st.slider(
                "How good does this scenario sound?",
                min_value=1,
                max_value=10,
                value=5,
                help="1 = terrible, 10 = excellent",
                key="scenario_rating_slider",
            )

            rater_confidence = st.slider(
                "How confident are you in this rating?",
                min_value=1,
                max_value=10,
                value=7,
                help="1 = guessing, 10 = very confident",
                key="scenario_rater_confidence",
            )

            rater_experience_level = st.selectbox(
                "Your experience level for this activity",
                options=["Beginner", "Intermediate", "Advanced", "Expert", "Not sure"],
                index=1,
                key="scenario_experience_level",
            )

            assume_safe_conditions = st.checkbox(
                "Assume normal safety precautions are taken",
                value=True,
                help="Example: wearing a PFD for kayaking, checking alerts, using sunscreen.",
                key="scenario_assume_safe",
            )

            scenario_notes = st.text_area(
                "Notes",
                placeholder="Example: Wind seems too high, or this looks perfect for evening fishing.",
                key="scenario_rating_notes",
            )

            scenario_save_key = json.dumps(
                clean_json_value(
                    {
                        "scenario": scenario,
                        "rating": scenario_rating,
                        "notes": scenario_notes,
                        "scenario_mode": scenario_mode,
                        "rater_confidence": rater_confidence,
                        "rater_experience_level": rater_experience_level,
                        "assume_safe_conditions": assume_safe_conditions,
                    }
                ),
                sort_keys=True,
            )

            if st.button("Save scenario rating"):
                if st.session_state.get("last_saved_scenario_key") == scenario_save_key:
                    st.warning(
                        "This scenario rating was already saved. "
                        "Generate a new scenario or change the rating/notes."
                    )

                else:
                    try:
                        save_scenario_rating(
                            scenario=scenario,
                            rating=scenario_rating,
                            notes=scenario_notes,
                            scenario_mode=scenario_mode,
                            rater_confidence=rater_confidence,
                            rater_experience_level=rater_experience_level,
                            assume_safe_conditions=assume_safe_conditions,
                        )

                        st.session_state["last_saved_scenario_key"] = scenario_save_key

                        st.success("Scenario rating saved.")

                        if scenario_source == "Historical weather":
                            st.session_state["current_scenario"] = generate_historical_scenario(
                                selected_scenario_activity,
                                latitude,
                                longitude,
                            )
                        else:
                            st.session_state["current_scenario"] = generate_random_scenario(
                                selected_scenario_activity
                            )

                        st.session_state["current_scenario_activity"] = selected_scenario_activity
                        st.session_state["current_scenario_source"] = scenario_source

                        st.rerun()

                    except Exception as e:
                        error_text = str(e)

                        if (
                            "duplicate key" in error_text
                            or "scenario_ratings_fingerprint_unique" in error_text
                        ):
                            st.warning("This exact scenario rating already exists.")

                        else:
                            st.error("Could not save scenario rating.")
                            st.write(type(e).__name__)
                            st.write(e)

    # -------------------------
    # Scenario Insights
    # -------------------------

    elif scenario_section == "Insights":
        st.subheader("Scenario Insights")

        scenario_ratings = load_scenario_ratings()

        if "id" in scenario_ratings.columns:
            scenario_ratings = scenario_ratings.drop_duplicates(
                subset=["id"],
                keep="first",
            ).reset_index(drop=True)

        if len(scenario_ratings) == 0:
            st.info("No scenario ratings saved yet.")

        else:
            scenario_ratings_clean = prepare_scenario_ratings_for_insights(
                scenario_ratings
            )

            with st.expander("Filter scenario insights", expanded=False):
                activity_filter_options = ["All"] + sorted(
                    scenario_ratings_clean["activity"]
                    .dropna()
                    .unique()
                    .tolist()
                )

                selected_activity_filter = st.selectbox(
                    "Activity",
                    options=activity_filter_options,
                    key="scenario_insights_activity_filter",
                )

                min_rating_filter = st.slider(
                    "Minimum rating",
                    min_value=1,
                    max_value=10,
                    value=1,
                    key="scenario_insights_min_rating",
                )

                if "rater_confidence" in scenario_ratings_clean.columns:
                    min_confidence_filter = st.slider(
                        "Minimum rater confidence",
                        min_value=1,
                        max_value=10,
                        value=1,
                        key="scenario_insights_min_confidence",
                    )
                else:
                    min_confidence_filter = 1

                if "rater_experience_level" in scenario_ratings_clean.columns:
                    experience_options = ["All"] + sorted(
                        scenario_ratings_clean["rater_experience_level"]
                        .dropna()
                        .unique()
                        .tolist()
                    )

                    selected_experience_filter = st.selectbox(
                        "Experience level",
                        options=experience_options,
                        key="scenario_insights_experience_filter",
                    )
                else:
                    selected_experience_filter = "All"

            filtered_scenarios = scenario_ratings_clean.copy()

            if selected_activity_filter != "All":
                filtered_scenarios = filtered_scenarios[
                    filtered_scenarios["activity"] == selected_activity_filter
                ]

            filtered_scenarios = filtered_scenarios[
                filtered_scenarios["rating"] >= min_rating_filter
            ]

            if "rater_confidence" in filtered_scenarios.columns:
                filtered_scenarios = filtered_scenarios[
                    filtered_scenarios["rater_confidence"].fillna(0) >= min_confidence_filter
                ]

            if (
                selected_experience_filter != "All"
                and "rater_experience_level" in filtered_scenarios.columns
            ):
                filtered_scenarios = filtered_scenarios[
                    filtered_scenarios["rater_experience_level"] == selected_experience_filter
                ]

            metric_col1, metric_col2, metric_col3 = st.columns(3)

            with metric_col1:
                st.metric(
                    "Total ratings",
                    len(filtered_scenarios),
                )

            with metric_col2:
                if len(filtered_scenarios) > 0:
                    st.metric(
                        "Average rating",
                        round(filtered_scenarios["rating"].mean(), 1),
                    )
                else:
                    st.metric("Average rating", "N/A")

            with metric_col3:
                if (
                    "rater_confidence" in filtered_scenarios.columns
                    and len(filtered_scenarios) > 0
                ):
                    st.metric(
                        "Average confidence",
                        round(filtered_scenarios["rater_confidence"].mean(), 1),
                    )
                else:
                    st.metric("Average confidence", "N/A")

            if len(filtered_scenarios) == 0:
                st.info("No scenario ratings match the selected filters.")

            else:
                st.write("### Ratings by Activity")

                rating_summary = build_scenario_activity_summary(
                    filtered_scenarios
                )

                st.dataframe(
                    rating_summary,
                    width="stretch",
                )

                st.bar_chart(
                    rating_summary.set_index("activity")["average_rating"]
                )

                st.write("### Highest-Rated Scenarios")

                top_scenarios = filtered_scenarios.sort_values(
                    "rating",
                    ascending=False,
                ).head(5)

                top_display_rows = []

                for _, scenario_row in top_scenarios.iterrows():
                    top_display_rows.append(
                        {
                            "Activity": scenario_row.get("activity"),
                            "Rating": scenario_row.get("rating"),
                            "Confidence": scenario_row.get("rater_confidence"),
                            "Scenario": describe_scenario_row(scenario_row),
                            "Notes": scenario_row.get("notes"),
                        }
                    )

                st.dataframe(
                    pd.DataFrame(top_display_rows),
                    width="stretch",
                )

                st.write("### Lowest-Rated Scenarios")

                low_scenarios = filtered_scenarios.sort_values(
                    "rating",
                    ascending=True,
                ).head(5)

                low_display_rows = []

                for _, scenario_row in low_scenarios.iterrows():
                    low_display_rows.append(
                        {
                            "Activity": scenario_row.get("activity"),
                            "Rating": scenario_row.get("rating"),
                            "Confidence": scenario_row.get("rater_confidence"),
                            "Scenario": describe_scenario_row(scenario_row),
                            "Notes": scenario_row.get("notes"),
                        }
                    )

                st.dataframe(
                    pd.DataFrame(low_display_rows),
                    width="stretch",
                )

                with st.expander("View raw scenario ratings", expanded=False):
                    st.dataframe(
                        filtered_scenarios,
                        width="stretch",
                    )

                st.download_button(
                    label="Download filtered scenario ratings CSV",
                    data=filtered_scenarios.to_csv(index=False),
                    file_name="scenario_ratings_filtered.csv",
                    mime="text/csv",
                )

    # -------------------------
    # Scenario Progress
    # -------------------------

    elif scenario_section == "Progress":
        st.subheader("Scenario Progress Goals")

        scenario_ratings = load_scenario_ratings()

        if "id" in scenario_ratings.columns:
            scenario_ratings = scenario_ratings.drop_duplicates(
                subset=["id"],
                keep="first",
            ).reset_index(drop=True)

        goal_per_activity = st.number_input(
            "Target ratings per activity",
            min_value=5,
            max_value=500,
            value=25,
            step=5,
            help="A good first target is 25 ratings per activity.",
            key="scenario_goal_per_activity",
        )

        progress_table = build_scenario_progress_table(
            scenario_ratings,
            goal_per_activity=goal_per_activity,
        )

        total_ratings = int(progress_table["rating_count"].sum())
        total_goal = int(progress_table["goal"].sum())
        total_progress = min(total_ratings / total_goal, 1) if total_goal > 0 else 0

        st.write(f"Overall progress: **{total_ratings}/{total_goal} ratings**")
        st.progress(total_progress)

        for _, progress_row in progress_table.iterrows():
            activity = progress_row["activity"]
            rating_count = int(progress_row["rating_count"])
            goal = int(progress_row["goal"])
            remaining = int(progress_row["remaining"])
            progress = float(progress_row["progress"])

            st.write(
                f"**{activity_label(activity)}:** "
                f"{rating_count}/{goal} ratings "
                f"({remaining} remaining)"
            )

            st.progress(progress)

        with st.expander("View scenario progress table", expanded=False):
            st.dataframe(
                progress_table,
                width="stretch",
            )

    # -------------------------
    # Manage Scenario Ratings
    # -------------------------

    elif scenario_section == "Manage":
        st.subheader("Manage Scenario Ratings")

        scenario_manage_df = load_scenario_ratings()

        if "id" in scenario_manage_df.columns:
            scenario_manage_df = scenario_manage_df.drop_duplicates(
                subset=["id"],
                keep="first",
            ).reset_index(drop=True)

        if len(scenario_manage_df) == 0:
            st.info("No scenario ratings available to manage.")

        elif "id" not in scenario_manage_df.columns:
            st.warning("Scenario rating IDs are not available.")

        else:
            scenario_manage_df["display_label"] = (
                scenario_manage_df["id"].astype(str)
                + " | "
                + scenario_manage_df["activity"].astype(str)
                + " | rating "
                + scenario_manage_df["rating"].astype(str)
                + " | "
                + scenario_manage_df["notes"].fillna("").astype(str).str.slice(0, 40)
            )

            selected_scenario_label = st.selectbox(
                "Choose a scenario rating to edit/delete",
                options=scenario_manage_df["display_label"].tolist(),
                key="manage_scenario_rating_selectbox",
            )

            selected_scenario = scenario_manage_df[
                scenario_manage_df["display_label"] == selected_scenario_label
            ].iloc[0]

            selected_scenario_id = int(selected_scenario["id"])

            st.write("Selected scenario rating:")

            st.dataframe(
                pd.DataFrame([selected_scenario.drop(labels=["display_label"])]),
                width="stretch",
            )

            with st.expander("Edit scenario rating", expanded=True):
                current_rating = selected_scenario.get("rating", 5)

                try:
                    current_rating = int(float(current_rating))
                except Exception:
                    current_rating = 5

                edit_scenario_rating = st.slider(
                    "Rating",
                    min_value=1,
                    max_value=10,
                    value=current_rating,
                    key=f"edit_scenario_rating_{selected_scenario_id}",
                )

                current_confidence = selected_scenario.get("rater_confidence", 7)

                try:
                    if pd.isna(current_confidence):
                        current_confidence = 7
                    current_confidence = int(float(current_confidence))
                except Exception:
                    current_confidence = 7

                edit_rater_confidence = st.slider(
                    "Rater confidence",
                    min_value=1,
                    max_value=10,
                    value=current_confidence,
                    key=f"edit_scenario_confidence_{selected_scenario_id}",
                )

                experience_options = [
                    "Beginner",
                    "Intermediate",
                    "Advanced",
                    "Expert",
                    "Not sure",
                ]

                current_experience = selected_scenario.get(
                    "rater_experience_level",
                    "Not sure",
                )

                if pd.isna(current_experience) or current_experience not in experience_options:
                    current_experience = "Not sure"

                edit_experience_level = st.selectbox(
                    "Experience level",
                    options=experience_options,
                    index=experience_options.index(current_experience),
                    key=f"edit_scenario_experience_{selected_scenario_id}",
                )

                current_assume_safe = selected_scenario.get(
                    "assume_safe_conditions",
                    True,
                )

                if pd.isna(current_assume_safe):
                    current_assume_safe = True

                edit_assume_safe_conditions = st.checkbox(
                    "Assume normal safety precautions are taken",
                    value=bool(current_assume_safe),
                    key=f"edit_scenario_assume_safe_{selected_scenario_id}",
                )

                current_notes = selected_scenario.get("notes", "")

                if pd.isna(current_notes):
                    current_notes = ""

                edit_scenario_notes = st.text_area(
                    "Notes",
                    value=str(current_notes),
                    key=f"edit_scenario_notes_{selected_scenario_id}",
                )

                if st.button(
                    "Save scenario rating edits",
                    key=f"save_scenario_edits_{selected_scenario_id}",
                ):
                    try:
                        update_scenario_rating(
                            selected_scenario_id,
                            {
                                "rating": edit_scenario_rating,
                                "notes": edit_scenario_notes,
                                "rater_confidence": edit_rater_confidence,
                                "rater_experience_level": edit_experience_level,
                                "assume_safe_conditions": edit_assume_safe_conditions,
                            },
                        )

                        st.success("Scenario rating updated.")
                        st.rerun()

                    except Exception as e:
                        st.error("Could not update scenario rating.")
                        st.write(type(e).__name__)
                        st.write(e)

            with st.expander("Danger zone: delete scenario rating", expanded=False):
                st.warning("Deleting a scenario rating cannot be undone.")

                confirm_delete_scenario = st.checkbox(
                    "Yes, delete this scenario rating",
                    key=f"confirm_delete_scenario_{selected_scenario_id}",
                )

                if st.button(
                    "Delete scenario rating",
                    key=f"delete_scenario_rating_{selected_scenario_id}",
                ):
                    if confirm_delete_scenario:
                        try:
                            delete_scenario_rating(selected_scenario_id)

                            st.success("Scenario rating deleted.")
                            st.rerun()

                        except Exception as e:
                            st.error("Could not delete scenario rating.")
                            st.write(type(e).__name__)
                            st.write(e)

                    else:
                        st.warning("Check the confirmation box before deleting.")

with home_tab:
    st.header("Today’s Plan")

    available_dates = sorted(
        predictions["date"]
        .dropna()
        .unique()
        .tolist()
    )

    if len(available_dates) == 0:
        st.info("No forecast dates are available.")

    else:
        today_string = pd.Timestamp.today().strftime("%Y-%m-%d")

        if today_string in available_dates:
            default_home_date_index = available_dates.index(today_string)
        else:
            default_home_date_index = 0

        selected_home_date = st.selectbox(
            "Choose day",
            options=available_dates,
            index=default_home_date_index,
            key="home_selected_date",
        )

        home_day_predictions = predictions[
            predictions["date"] == selected_home_date
        ].copy()

        if len(home_day_predictions) == 0:
            st.info("No activity predictions are available for this date.")

        else:
            home_sort_column = (
                "planning_score"
                if "planning_score" in home_day_predictions.columns
                else "predicted_score"
            )

            home_day_predictions = home_day_predictions.sort_values(
                home_sort_column,
                ascending=False,
            ).reset_index(drop=True)

            top_pick = home_day_predictions.iloc[0]

            saved_locations_for_home = load_saved_locations()
            activity_location_defaults_for_home = load_activity_location_defaults()

            home_default_location = get_default_location_for_activity(
                activity=top_pick["activity"],
                defaults_df=activity_location_defaults_for_home,
                saved_locations_df=saved_locations_for_home,
            )

            home_usgs_water_data = get_usgs_water_data_for_location(home_default_location)
            home_usgs_water_summary = format_usgs_water_summary(home_usgs_water_data)

            home_nws_alerts = get_nws_alerts_for_location(home_default_location)

            home_ndbc_data = get_ndbc_buoy_data_for_location(home_default_location)
            home_ndbc_summary = format_ndbc_buoy_summary(home_ndbc_data)

            home_chop_summary = get_location_chop_summary(
                location=home_default_location,
                wind_speed=top_pick.get("wind_max", 0),
                wind_gust=top_pick.get("gust_max", top_pick.get("wind_max", 0)),
            )

            home_chop_summary_text = format_chop_summary(home_chop_summary)

            home_is_water_activity = top_pick["activity"] in [
                "Fishing",
                "Kayaking",
                "Beach Day",
            ]

            home_data_quality_badges = build_data_quality_badges(
                forecast_source=forecast_source,
                default_location=home_default_location,
                usgs_water_data=home_usgs_water_data,
                ndbc_data=home_ndbc_data,
                nws_alerts=home_nws_alerts,
                chop_summary=home_chop_summary,
                schedule_aware=len(weekly_obligations) > 0,
                water_activity=home_is_water_activity,
            )

            if home_default_location is not None:
                home_location_name = home_default_location.get("name", "")
            else:
                home_location_name = ""

            next_best = home_day_predictions.iloc[1:3]

            top_window, top_window_score = get_recommended_window_for_activity(
                time_recommendations=time_recommendations,
                selected_date=top_pick["date"],
                selected_activity=top_pick["activity"],
            )

            # -------------------------
            # Main pick card
            # -------------------------

            with st.container(border=True):
                st.subheader("Top Pick")

                st.markdown(
                    f"### {activity_label(top_pick['activity'])}",
                )

                st.markdown(
                    score_badge_html(
                        top_pick["predicted_score"],
                        top_pick["label"],
                    ),
                    unsafe_allow_html=True,
                )

                render_data_quality_badges(home_data_quality_badges)

                metric_col1, metric_col2, metric_col3 = st.columns(3)

                with metric_col1:
                    st.metric(
                        "Best Window",
                        top_window,
                    )

                if home_location_name:
                    st.write(f"**Location:** {home_location_name}")

                if home_usgs_water_summary:
                    st.write(f"**Water data:** {home_usgs_water_summary}")

                if home_ndbc_summary:
                    st.write(f"**Buoy data:** {home_ndbc_summary}")

                if home_chop_summary_text and top_pick["activity"] in ["Fishing", "Kayaking", "Beach Day"]:
                    st.write(f"**Water chop estimate:** {home_chop_summary_text}")

                if len(home_nws_alerts) > 0:
                    st.warning("Active weather alerts for this location:")

                    for alert in home_nws_alerts[:2]:
                        st.write(
                            f"**{alert.get('event')}** — {alert.get('headline')}"
                        )

                with metric_col2:
                    st.metric(
                        "Planning Score",
                        top_pick.get("planning_score", "N/A"),
                    )

                with metric_col3:
                    st.metric(
                        "Forecast Confidence",
                        top_pick.get("forecast_confidence", "N/A"),
                        top_pick.get("forecast_confidence_label", ""),
                    )

                st.write(
                    f"**Weather:** {top_pick.get('avg_temp', 'N/A')}°F, "
                    f"wind {top_pick.get('wind_max', 'N/A')} mph, "
                    f"rain {top_pick.get('rain_chance', 'N/A')}%, "
                    f"bugs {top_pick.get('bug_index', 'N/A')}, "
                    f"water temp est: {top_pick.get('water_temp_est', 'N/A')}°F"
                )

                if home_usgs_water_data and home_usgs_water_data.get("water_temp_f") is not None:
                    st.write(
                        f"**Observed water temp:** "
                        f"{float(home_usgs_water_data['water_temp_f']):.1f}°F"
                    )
                else:
                    st.write(
                        f"**Estimated water temp:** "
                        f"{top_pick.get('water_temp_est', 'N/A')}°F"
                    )

                st.write(f"**Warnings:** {dashboard_warning_text(top_pick)}")

                st.write("**Why this is recommended:**")
                st.write(top_pick["explanation"])

                st.write("**Gear / Safety Notes:**")
                st.write(top_pick["gear_notes"])

                # Fishing species deeper dive
                if top_pick["activity"] == "Fishing":
                    species_breakdown = top_pick.get("species_breakdown", [])

                    if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                        best_species = species_breakdown[0]

                        st.success(
                            f"Best fishing target: {best_species['species']} "
                            f"with score {best_species['score']} "
                            f"({best_species['label']})"
                        )

                # Calendar download for top pick
                try:
                    home_start_dt, home_end_dt = parse_time_window_for_calendar(
                        top_pick["date"],
                        top_window,
                    )

                    home_calendar_title = str(top_pick["activity"])

                    if top_pick["activity"] == "Fishing":
                        species_breakdown = top_pick.get("species_breakdown", [])

                        if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                            best_species = species_breakdown[0]
                            home_calendar_title = f"Fishing - Target {best_species['species']}"

                    home_calendar_description = (
                        f"Predicted score: {top_pick['predicted_score']} ({top_pick['label']})\n"
                        f"Forecast confidence: {top_pick.get('forecast_confidence', 'N/A')} "
                        f"({top_pick.get('forecast_confidence_label', 'N/A')})\n"
                        f"Planning score: {top_pick.get('planning_score', 'N/A')}\n"
                        f"Recommended window: {top_window}\n\n"
                        f"Why: {top_pick['explanation']}\n\n"
                        f"Gear/Safety: {top_pick['gear_notes']}\n\n"
                        f"Weather: {top_pick.get('avg_temp', 'N/A')}°F, "
                        f"wind {top_pick.get('wind_max', 'N/A')} mph, "
                        f"rain {top_pick.get('rain_chance', 'N/A')}%, "
                        f"bugs {top_pick.get('bug_index', 'N/A')}, "
                        f"water temp est {top_pick.get('water_temp_est', 'N/A')}°F"
                    )

                    if home_usgs_water_summary:
                        home_calendar_description += f"\nWater data: {home_usgs_water_summary}"

                    if home_ndbc_summary:
                        home_calendar_description += f"\nBuoy data: {home_ndbc_summary}"

                    if home_chop_summary_text:
                        home_calendar_description += f"\nWater chop estimate: {home_chop_summary_text}"

                    if len(home_nws_alerts) > 0:
                        home_calendar_description += "\n\nActive alerts:\n"

                        for alert in home_nws_alerts[:3]:
                            home_calendar_description += f"- {alert.get('event')}: {alert.get('headline')}\n"

                    home_ics_file = create_calendar_event_ics(
                        title=home_calendar_title,
                        start_dt=home_start_dt,
                        end_dt=home_end_dt,
                        description=home_calendar_description,
                        location=home_location_name,
                    )

                    st.download_button(
                        label="Add top pick to calendar",
                        data=home_ics_file,
                        file_name=f"home-{clean_filename(top_pick['activity'])}-{top_pick['date']}.ics",
                        mime="text/calendar",
                        key=f"home_calendar_{top_pick['date']}_{top_pick['activity']}",
                    )

                except Exception:
                    st.caption("Calendar export is not available for this recommendation.")

            st.subheader("Outdoor Outlook")

            outlook_items = build_outdoor_outlook(predictions)

            if len(outlook_items) == 0:
                st.info("No outdoor outlook available yet.")
            else:
                for item in outlook_items:
                    st.info(item)

            # -------------------------
            # Next best options
            # -------------------------

            if len(next_best) > 0:
                st.subheader("Other Good Options")

                for rank, (_, option_row) in enumerate(next_best.iterrows(), start=2):
                    option_window, option_window_score = get_recommended_window_for_activity(
                        time_recommendations=time_recommendations,
                        selected_date=option_row["date"],
                        selected_activity=option_row["activity"],
                    )

                    expander_title = (
                        f"#{rank}: {activity_label(option_row['activity'])} — "
                        f"{option_row['predicted_score']} ({option_row['label']})"
                    )

                    with st.expander(expander_title, expanded=False):
                        st.markdown(
                            score_badge_html(
                                option_row["predicted_score"],
                                option_row["label"],
                            ),
                            unsafe_allow_html=True,
                        )

                        st.write(f"**Best window:** {option_window}")

                        if option_window_score is not None:
                            st.write(f"**Window score:** {option_window_score}")

                        st.write(
                            f"**Forecast confidence:** "
                            f"{option_row.get('forecast_confidence', 'N/A')} "
                            f"({option_row.get('forecast_confidence_label', 'N/A')})"
                        )

                        st.write(
                            f"**Planning score:** {option_row.get('planning_score', 'N/A')}"
                        )

                        st.write(
                            f"**Weather:** {option_row.get('avg_temp', 'N/A')}°F, "
                            f"wind {option_row.get('wind_max', 'N/A')} mph, "
                            f"rain {option_row.get('rain_chance', 'N/A')}%, "
                            f"bugs {option_row.get('bug_index', 'N/A')}"
                        )

                        st.write(f"**Warnings:** {dashboard_warning_text(option_row)}")

                        st.write("**Why this is a good option:**")
                        st.write(option_row["explanation"])

                        st.write("**Gear / Safety Notes:**")
                        st.write(option_row["gear_notes"])

                        if option_row["activity"] == "Fishing":
                            species_breakdown = option_row.get("species_breakdown", [])

                            if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                                best_species = species_breakdown[0]

                                st.success(
                                    f"Best fishing target: {best_species['species']} "
                                    f"with score {best_species['score']} "
                                    f"({best_species['label']})"
                                )

with planner_tab:
    st.header("Planner")

    st.write(
        "Plan your week and track how the forecast changes before your activity."
    )

    planner_dates = sorted(
        predictions["date"]
        .dropna()
        .unique()
        .tolist()
    )

    if len(planner_dates) == 0:
        st.info("No forecast dates are available.")

    else:
        # -------------------------
        # Planner controls
        # -------------------------

        control_col1, control_col2, control_col3 = st.columns(3)

        with control_col1:
            planner_view = st.radio(
                "View",
                options=["Week", "Weekend"],
                horizontal=True,
                key="planner_view_mode",
            )

        with control_col2:
            activity_group = st.selectbox(
                "Activity group",
                options=[
                    "All",
                    "Water",
                    "Land",
                    "Fishing only",
                ],
                key="planner_activity_group",
            )

        with control_col3:
            minimum_planning_score = st.slider(
                "Minimum planning score",
                min_value=0,
                max_value=100,
                value=60,
                step=5,
                key="planner_minimum_planning_score",
            )

        planner_predictions = predictions.copy()

        if planner_view == "Weekend":
            planner_predictions = get_weekend_predictions(
                planner_predictions
            )

        if activity_group == "Water":
            water_activities = ["Fishing", "Kayaking", "Beach Day"]
            planner_predictions = planner_predictions[
                planner_predictions["activity"].isin(water_activities)
            ]

        elif activity_group == "Land":
            land_activities = [
                "Camping",
                "Running",
                "Disc Golf",
                "Tennis",
            ]
            planner_predictions = planner_predictions[
                planner_predictions["activity"].isin(land_activities)
            ]

        elif activity_group == "Fishing only":
            planner_predictions = planner_predictions[
                planner_predictions["activity"] == "Fishing"
            ]

        sort_column = (
            "planning_score"
            if "planning_score" in planner_predictions.columns
            else "predicted_score"
        )

        if len(planner_predictions) > 0:
            planner_predictions = planner_predictions[
                planner_predictions[sort_column] >= minimum_planning_score
            ]

        if len(planner_predictions) == 0:
            st.info("No predictions match this planner view and minimum score.")

        else:
            # -------------------------
            # Best opportunities
            # -------------------------

            saved_locations_for_planner = load_saved_locations()
            activity_location_defaults_for_planner = load_activity_location_defaults()

            st.subheader("Best Opportunities")

            top_opportunity_count = st.slider(
                "Number of opportunities to show",
                min_value=3,
                max_value=10,
                value=5,
                step=1,
                key="planner_top_opportunity_count",
            )

            top_opportunities = planner_predictions.sort_values(
                sort_column,
                ascending=False,
            ).head(top_opportunity_count)

            for _, row in top_opportunities.iterrows():
                recommended_window, window_score = get_recommended_window_for_activity(
                    time_recommendations=time_recommendations,
                    selected_date=row["date"],
                    selected_activity=row["activity"],
                )

                default_location = get_default_location_for_activity(
                    activity=row["activity"],
                    defaults_df=activity_location_defaults_for_planner,
                    saved_locations_df=saved_locations_for_planner,
                )

                if default_location is not None:
                    planner_location_name = default_location.get("name", "")
                    planner_location_context = build_location_context_from_location(
                        default_location
                    )
                else:
                    planner_location_name = ""
                    planner_location_context = {
                        "latitude": latitude,
                        "longitude": longitude,
                        "location_query": st.session_state.get("location_query"),
                    }

                usgs_water_data = get_usgs_water_data_for_location(default_location)
                usgs_water_summary = format_usgs_water_summary(usgs_water_data)

                nws_alerts = get_nws_alerts_for_location(default_location)

                ndbc_data = get_ndbc_buoy_data_for_location(default_location)
                ndbc_summary = format_ndbc_buoy_summary(ndbc_data)

                chop_summary = get_location_chop_summary(
                    location=default_location,
                    wind_speed=row.get("wind_max", 0),
                    wind_gust=row.get("gust_max", row.get("wind_max", 0)),
                )

                chop_summary_text = format_chop_summary(chop_summary)

                planner_is_water_activity = row["activity"] in [
                    "Fishing",
                    "Kayaking",
                    "Beach Day",
                ]

                planner_data_quality_badges = build_data_quality_badges(
                    forecast_source=forecast_source,
                    default_location=default_location,
                    usgs_water_data=usgs_water_data,
                    ndbc_data=ndbc_data,
                    nws_alerts=nws_alerts,
                    chop_summary=chop_summary,
                    schedule_aware=len(weekly_obligations) > 0,
                    water_activity=planner_is_water_activity,
                )

                with st.container(border=True):
                    card_col1, card_col2 = st.columns([2, 1])

                    with card_col1:
                        st.subheader(
                            f"{activity_label(row['activity'])} — {row['date']}"
                        )

                        st.markdown(
                            score_badge_html(
                                row["predicted_score"],
                                row["label"],
                            ),
                            unsafe_allow_html=True,
                        )

                        render_data_quality_badges(planner_data_quality_badges)

                        st.write(f"**Suggested window:** {recommended_window}")

                        if planner_location_name:
                            st.write(f"**Location:** {planner_location_name}")

                        if usgs_water_summary:
                            st.write(f"**Water data:** {usgs_water_summary}")

                        if ndbc_summary:
                            st.write(f"**Buoy data:** {ndbc_summary}")

                        if chop_summary_text and row["activity"] in ["Fishing", "Kayaking", "Beach Day"]:
                            st.write(f"**Water chop estimate:** {chop_summary_text}")

                        if len(nws_alerts) > 0:
                            st.warning("Active weather alerts for this location:")

                            for alert in nws_alerts[:2]:
                                st.write(
                                    f"**{alert.get('event')}** — {alert.get('headline')}"
                                )

                        st.write(
                            f"**Planning score:** {row.get('planning_score', 'N/A')}"
                        )

                        st.write(
                            f"**Forecast confidence:** "
                            f"{row.get('forecast_confidence', 'N/A')} "
                            f"({row.get('forecast_confidence_label', 'N/A')})"
                        )

                        st.write(f"**Warnings:** {dashboard_warning_text(row)}")

                        if row["activity"] == "Fishing":
                            species_breakdown = row.get("species_breakdown", [])

                            if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                                best_species = species_breakdown[0]

                                st.success(
                                    f"Best fishing target: {best_species['species']} "
                                    f"({best_species['score']} · {best_species['label']})"
                                )

                    with card_col2:
                        try:
                            start_dt, end_dt = parse_time_window_for_calendar(
                                row["date"],
                                recommended_window,
                            )

                            calendar_title = str(row["activity"])

                            if row["activity"] == "Fishing":
                                species_breakdown = row.get("species_breakdown", [])

                                if isinstance(species_breakdown, list) and len(species_breakdown) > 0:
                                    best_species = species_breakdown[0]
                                    calendar_title = f"Fishing - Target {best_species['species']}"

                            calendar_description = (
                                f"Predicted score: {row['predicted_score']} ({row['label']})\n"
                                f"Forecast confidence: {row.get('forecast_confidence', 'N/A')} "
                                f"({row.get('forecast_confidence_label', 'N/A')})\n"
                                f"Planning score: {row.get('planning_score', 'N/A')}\n"
                                f"Recommended window: {recommended_window}\n\n"
                                f"Why: {row['explanation']}\n\n"
                                f"Gear/Safety: {row['gear_notes']}\n\n"
                                f"Weather: {row.get('avg_temp', 'N/A')}°F, "
                                f"wind {row.get('wind_max', 'N/A')} mph, "
                                f"rain {row.get('rain_chance', 'N/A')}%, "
                                f"bugs {row.get('bug_index', 'N/A')}, "
                                f"estimated water temp {row.get('water_temp_est', 'N/A')}°F"
                            )

                            if usgs_water_summary:
                                calendar_description += f"\nWater data: {usgs_water_summary}"
                            
                            if ndbc_summary:
                                calendar_description += f"\nBuoy data: {ndbc_summary}"

                            if chop_summary_text:
                                calendar_description += f"\nWater chop estimate: {chop_summary_text}"

                            if len(nws_alerts) > 0:
                                calendar_description += "\n\nActive alerts:\n"

                                for alert in nws_alerts[:3]:
                                    calendar_description += f"- {alert.get('event')}: {alert.get('headline')}\n"

                            ics_file = create_calendar_event_ics(
                                title=calendar_title,
                                start_dt=start_dt,
                                end_dt=end_dt,
                                description=calendar_description,
                                location=planner_location_name,
                            )

                            filename = (
                                f"{clean_filename(row['activity'])}-"
                                f"{row['date']}.ics"
                            )

                            st.download_button(
                                label="Add to calendar",
                                data=ics_file,
                                file_name=filename,
                                mime="text/calendar",
                                key=f"planner_calendar_{row['date']}_{row['activity']}",
                            )

                        except Exception:
                            st.caption("Calendar export unavailable.")

                        plan_notes = st.text_area(
                            "Plan notes",
                            placeholder="Optional notes for this plan",
                            key=f"planner_notes_{row['date']}_{row['activity']}",
                        )

                        if st.button(
                            "Save as planned",
                            key=f"save_plan_{row['date']}_{row['activity']}",
                        ):
                            try:
                                create_planned_activity_from_prediction(
                                    prediction_row=row,
                                    recommended_window=recommended_window,
                                    notes=plan_notes,
                                    location_name=planner_location_name,
                                    location_context=planner_location_context,
                                )

                                st.success("Activity saved as planned.")
                                st.rerun()

                            except Exception as e:
                                st.error("Could not save planned activity.")
                                st.write(type(e).__name__)
                                st.write(e)

            # -------------------------
            # Calendar-style day cards
            # -------------------------

            st.subheader("Calendar View")

            for planner_date in sorted(planner_predictions["date"].unique()):
                day_rows = planner_predictions[
                    planner_predictions["date"] == planner_date
                ].copy()

                if len(day_rows) == 0:
                    continue

                day_rows = day_rows.sort_values(
                    sort_column,
                    ascending=False,
                ).reset_index(drop=True)

                best = day_rows.iloc[0]
                alternatives = day_rows.iloc[1:3]

                recommended_window, _ = get_recommended_window_for_activity(
                    time_recommendations=time_recommendations,
                    selected_date=best["date"],
                    selected_activity=best["activity"],
                )

                best_default_location = get_default_location_for_activity(
                    activity=best["activity"],
                    defaults_df=activity_location_defaults_for_planner,
                    saved_locations_df=saved_locations_for_planner,
                )

                if best_default_location is not None:
                    best_location_name = best_default_location.get("name", "")
                else:
                    best_location_name = ""

                best_usgs_water_data = get_usgs_water_data_for_location(
                    best_default_location
                )

                best_usgs_water_summary = format_usgs_water_summary(
                    best_usgs_water_data
                )

                best_nws_alerts = get_nws_alerts_for_location(
                    best_default_location
                )

                with st.container(border=True):
                    st.markdown(
                        f"### {planner_date}: {activity_label(best['activity'])}"
                    )

                    day_col1, day_col2, day_col3 = st.columns(3)

                    with day_col1:
                        st.markdown(
                            score_badge_html(
                                best["predicted_score"],
                                best["label"],
                            ),
                            unsafe_allow_html=True,
                        )

                    with day_col2:
                        st.metric(
                            "Planning",
                            best.get("planning_score", "N/A"),
                            best.get("forecast_confidence_label", ""),
                        )

                    with day_col3:
                        st.metric(
                            "Window",
                            recommended_window,
                        )

                    if best_location_name:
                        st.write(f"**Location:** {best_location_name}")

                    if best_usgs_water_summary:
                        st.write(f"**Water data:** {best_usgs_water_summary}")

                    if len(best_nws_alerts) > 0:
                        st.warning("Active weather alerts for this location:")

                        for alert in best_nws_alerts[:2]:
                            st.write(
                                f"**{alert.get('event')}** — {alert.get('headline')}"
                            )

                    st.write(f"**Warnings:** {dashboard_warning_text(best)}")

                    if len(alternatives) > 0:
                        alt_text = []

                        for _, alt in alternatives.iterrows():
                            alt_text.append(
                                f"{activity_label(alt['activity'])} "
                                f"{int(alt['predicted_score'])}"
                            )

                        st.caption(
                            "Other options: " + " · ".join(alt_text)
                        )

                    with st.expander("View all activity details", expanded=False):
                        for _, detail_row in day_rows.iterrows():
                            detail_window, detail_window_score = get_recommended_window_for_activity(
                                time_recommendations=time_recommendations,
                                selected_date=detail_row["date"],
                                selected_activity=detail_row["activity"],
                            )

                            detail_default_location = get_default_location_for_activity(
                                activity=detail_row["activity"],
                                defaults_df=activity_location_defaults_for_planner,
                                saved_locations_df=saved_locations_for_planner,
                            )

                            detail_usgs_water_data = get_usgs_water_data_for_location(
                                detail_default_location
                            )

                            detail_usgs_water_summary = format_usgs_water_summary(
                                detail_usgs_water_data
                            )

                            st.markdown(
                                f"**{activity_label(detail_row['activity'])}: "
                                f"{detail_row['predicted_score']} "
                                f"({detail_row['label']})**"
                            )

                            st.write(f"Suggested window: {detail_window}")

                            st.write(
                                f"Planning score: "
                                f"{detail_row.get('planning_score', 'N/A')}"
                            )

                            st.write(
                                f"Forecast confidence: "
                                f"{detail_row.get('forecast_confidence', 'N/A')} "
                                f"({detail_row.get('forecast_confidence_label', 'N/A')})"
                            )

                            st.write(
                                f"Weather: {detail_row.get('avg_temp', 'N/A')}°F, "
                                f"wind {detail_row.get('wind_max', 'N/A')} mph, "
                                f"rain {detail_row.get('rain_chance', 'N/A')}%, "
                                f"bugs {detail_row.get('bug_index', 'N/A')}"
                            )

                            if detail_usgs_water_summary:
                                st.write(f"Water data: {detail_usgs_water_summary}")
                            else:
                                st.write(
                                    f"Estimated water temp: "
                                    f"{detail_row.get('water_temp_est', 'N/A')}°F"
                                )

                            st.write(detail_row["explanation"])

                            st.markdown("---")

            # -------------------------
            # Best day by activity
            # -------------------------

            st.subheader("Best Day for Each Activity")

            best_day_by_activity = build_best_day_by_activity(
                planner_predictions
            )

            if len(best_day_by_activity) == 0:
                st.info("No best-day activity data available.")

            else:
                st.dataframe(
                    best_day_by_activity,
                    width="stretch",
                )

        # -------------------------
        # Planned activities
        # -------------------------

        st.subheader("Planned Activities")

        plans = load_planned_activities()

        if len(plans) == 0:
            st.info("No planned activities yet.")

        else:
            plans_with_current = update_plans_with_current_forecast(
                plans,
                predictions,
            )

            st.dataframe(
                plans_with_current.sort_values("planned_date"),
                width="stretch",
            )

            plans_with_current["display_label"] = (
                plans_with_current["id"].astype(str)
                + " | "
                + plans_with_current["planned_date"].astype(str)
                + " | "
                + plans_with_current["activity"].astype(str)
                + " | "
                + plans_with_current["status"].astype(str)
            )

            selected_plan_label = st.selectbox(
                "Choose planned activity to update",
                options=plans_with_current["display_label"].tolist(),
                key="planner_selected_plan",
            )

            selected_plan = plans_with_current[
                plans_with_current["display_label"] == selected_plan_label
            ].iloc[0]

            selected_plan_id = int(selected_plan["id"])

            plan_already_logged = plan_has_activity_log(selected_plan_id)

            if plan_already_logged:
                st.success("This planned activity has already been logged.")

            status_col1, status_col2 = st.columns(2)

            with status_col1:
                new_plan_status = st.selectbox(
                    "Status",
                    options=PLAN_STATUSES,
                    index=PLAN_STATUSES.index(selected_plan["status"])
                    if selected_plan["status"] in PLAN_STATUSES
                    else 0,
                    key=f"planner_status_{selected_plan_id}",
                )

                if st.button(
                    "Update plan status",
                    key=f"update_plan_status_{selected_plan_id}",
                ):
                    update_planned_activity_status(
                        selected_plan_id,
                        new_plan_status,
                    )

                    st.success("Plan status updated.")
                    st.rerun()

            with status_col2:
                confirm_delete_plan = st.checkbox(
                    "Delete this planned activity",
                    key=f"confirm_delete_plan_{selected_plan_id}",
                )

                if st.button(
                    "Delete planned activity",
                    key=f"delete_plan_{selected_plan_id}",
                ):
                    if confirm_delete_plan:
                        delete_planned_activity(selected_plan_id)
                        st.success("Planned activity deleted.")
                        st.rerun()
                    else:
                        st.warning("Check the confirmation box before deleting.")

            st.markdown("---")
            st.subheader("Log This Planned Activity")

            with st.expander("Create activity log from this plan", expanded=False):
                planned_log_col1, planned_log_col2 = st.columns(2)

                with planned_log_col1:
                    planned_actual_enjoyment = st.slider(
                        "Actual enjoyment",
                        min_value=1,
                        max_value=10,
                        value=7,
                        key=f"planned_log_enjoyment_{selected_plan_id}",
                    )

                    planned_did_i_go = st.selectbox(
                        "Did you go?",
                        options=["Yes", "No", "Partially"],
                        key=f"planned_log_did_go_{selected_plan_id}",
                    )

                    planned_actual_time = st.text_input(
                        "Actual time",
                        value="",
                        placeholder="Example: 7:30 AM or 6:00 PM",
                        key=f"planned_log_actual_time_{selected_plan_id}",
                    )

                    planned_followed_window = st.selectbox(
                        "Did you go during the planned/recommended window?",
                        options=["Not sure", "Yes", "No", "Partially"],
                        key=f"planned_log_followed_window_{selected_plan_id}",
                    )

                with planned_log_col2:
                    planned_actual_bugs = st.slider(
                        "Actual bugs",
                        min_value=0,
                        max_value=10,
                        value=5,
                        key=f"planned_log_bugs_{selected_plan_id}",
                    )

                    planned_wind_annoyance = st.slider(
                        "Actual wind annoyance",
                        min_value=0,
                        max_value=10,
                        value=5,
                        key=f"planned_log_wind_{selected_plan_id}",
                    )

                    planned_humidity_comfort = st.slider(
                        "Actual humidity comfort",
                        min_value=0,
                        max_value=10,
                        value=7,
                        key=f"planned_log_humidity_{selected_plan_id}",
                    )

                planned_ground_wetness = "Not applicable"
                planned_water_conditions = "Not applicable"
                planned_fish_activity = "Not applicable"
                planned_visibility_light = "Not applicable"

                selected_plan_activity = selected_plan.get("activity")

                if selected_plan_activity in ["Camping", "Running", "Disc Golf", "Tennis"]:
                    planned_ground_wetness = st.selectbox(
                        "Actual ground/course/trail condition",
                        options=["Dry", "Damp", "Muddy", "Very muddy", "Not sure"],
                        key=f"planned_log_ground_{selected_plan_id}",
                    )

                if selected_plan_activity in FISHING_ACTIVITIES + ["Kayaking", "Beach Day"]:
                    planned_water_conditions = st.selectbox(
                        "Actual water conditions",
                        options=["Calm", "Light chop", "Choppy", "Rough", "Unsafe", "Not sure"],
                        key=f"planned_log_water_{selected_plan_id}",
                    )

                if selected_plan_activity in FISHING_ACTIVITIES:
                    planned_fish_activity = st.selectbox(
                        "Fish activity",
                        options=["None", "Low", "Medium", "High", "Not sure"],
                        key=f"planned_log_fish_{selected_plan_id}",
                    )

                if selected_plan_activity == "Running":
                    planned_visibility_light = st.selectbox(
                        "Visibility/light conditions",
                        options=["Bright daylight", "Low light but okay", "Too dark", "Not sure"],
                        key=f"planned_log_visibility_{selected_plan_id}",
                    )

                planned_notes = st.text_area(
                    "Notes",
                    value=selected_plan.get("notes", "") if pd.notna(selected_plan.get("notes", "")) else "",
                    placeholder="How did it go?",
                    key=f"planned_log_notes_{selected_plan_id}",
                )

                if st.button(
                    "Save activity log from plan",
                    key=f"save_log_from_plan_{selected_plan_id}",
                    disabled=plan_already_logged,
                ):
                    actual_score = planned_actual_enjoyment * 10

                    actual_data = {
                        "actual_time": planned_actual_time,
                        "followed_recommended_window": planned_followed_window,
                        "actual_enjoyment_1_to_10": planned_actual_enjoyment,
                        "actual_score_0_to_100": actual_score,
                        "did_i_go": planned_did_i_go,
                        "actual_bugs_1_to_10": planned_actual_bugs,
                        "actual_wind_annoyance_1_to_10": planned_wind_annoyance,
                        "actual_humidity_comfort_1_to_10": planned_humidity_comfort,
                        "actual_ground_wetness": planned_ground_wetness,
                        "actual_water_conditions": planned_water_conditions,
                        "fish_activity": planned_fish_activity,
                        "visibility_light": planned_visibility_light,
                        "notes": planned_notes,
                    }

                    try:
                        create_activity_log_from_plan(
                            selected_plan,
                            actual_data,
                        )

                        st.success("Activity log created and plan marked as Completed.")
                        st.rerun()

                    except Exception as e:
                        st.error("Could not create activity log from plan.")
                        st.write(type(e).__name__)
                        st.write(e)

# -------------------------
# Log actual result
# -------------------------
with log_tab:
    st.header("Log an Actual Result")

    log_mode = st.radio(
        "What type of entry are you logging?",
        options=["Current forecast date", "Past/custom date"],
        horizontal=True,
    )

    activity_options = sorted(predictions["activity"].unique())

    if log_mode == "Current forecast date":
        col1, col2 = st.columns(2)

        with col1:
            selected_date = st.selectbox(
                "Choose the date",
                options=sorted(predictions["date"].unique()),
                key="current_log_date",
            )

        with col2:
            activities_for_date = sorted(
                predictions[predictions["date"] == selected_date]["activity"].unique()
            )

            selected_activity = st.selectbox(
                "Choose the activity",
                options=activities_for_date,
                key="current_log_activity",
            )

    else:
        col1, col2 = st.columns(2)

        with col1:
            default_past_date = (pd.Timestamp.today() - pd.Timedelta(days=1)).date()

            selected_date_obj = st.date_input(
                "Date of activity",
                value=default_past_date,
                key="past_log_date",
            )

            selected_date = pd.to_datetime(selected_date_obj).strftime("%Y-%m-%d")

        with col2:
            selected_activity = st.selectbox(
                "Choose the activity",
                options=activity_options,
                key="past_log_activity",
            )


    selected_prediction = find_saved_prediction(
        predictions=predictions,
        selected_date=selected_date,
        selected_activity=selected_activity,
    )


    if selected_prediction is not None:
        predicted_score = int(selected_prediction["predicted_score"])
        predicted_label = selected_prediction.get("label", score_label(predicted_score))
        prediction_explanation = selected_prediction.get("explanation", "")
        prediction_gear_notes = selected_prediction.get("gear_notes", "")

    else:
        st.warning(
            "No saved prediction was found for this date/activity. "
            "You can manually enter the predicted score if you remember it."
        )

        know_predicted_score = st.checkbox(
            "I know or remember the predicted score",
            value=False,
        )

        if know_predicted_score:
            predicted_score = st.number_input(
                "Manually enter predicted score",
                min_value=0,
                max_value=100,
                value=50,
            )

            predicted_score = int(predicted_score)
            predicted_label = score_label(predicted_score)
        else:
            predicted_score = None
            predicted_label = "No prediction"

        prediction_explanation = "No saved prediction explanation available."
        prediction_gear_notes = "No saved gear notes available."


    st.subheader("Prediction Details")

    metric1, metric2, metric3 = st.columns(3)

    with metric1:
        if predicted_score is None:
            st.metric("Predicted Score", "N/A")
        else:
            st.metric("Predicted Score", predicted_score)

    with metric2:
        st.metric("Predicted Label", predicted_label)

    with metric3:
        st.metric("Activity", selected_activity)

    st.write("**Why this score:**")
    st.write(prediction_explanation)

    st.write("**Gear / Safety Notes:**")
    st.write(prediction_gear_notes)


    recommended_time_window, time_window_score = get_recommended_window_for_activity(
        time_recommendations=time_recommendations,
        selected_date=selected_date,
        selected_activity=selected_activity,
    )

    if log_mode == "Past/custom date" and recommended_time_window == "Not available":
        recommended_time_window = "Not available for this past/custom date"

    st.write("**Recommended Time Window:**")
    st.write(recommended_time_window)

    if time_window_score is not None:
        st.write(f"Window score: {time_window_score}")

    if selected_activity == "Running":
        matching_time = time_recommendations[
            time_recommendations["date"] == selected_date
        ]

        if len(matching_time) > 0:
            st.write(matching_time.iloc[0].get("Running Light Note", ""))

    st.subheader("Your Actual Experience")

    actual_enjoyment = st.slider(
        "How good was it actually?",
        min_value=1,
        max_value=10,
        value=7,
        help="1 = terrible, 10 = excellent",
    )

    actual_score = actual_enjoyment * 10

    did_i_go = st.selectbox(
        "Did you actually do this activity?",
        options=["Yes", "No", "Partially"],
    )

    with st.expander("Optional actual conditions", expanded=False):
        st.subheader("Actual Conditions")

        actual_time = st.text_input(
            "What time did you actually go?",
            placeholder="Example: 7:30 AM or 6:00 PM",
        )

        followed_recommended_window = st.selectbox(
            "Did you go during the recommended time window?",
            options=["Not sure", "Yes", "No", "Partially"],
        )

        actual_bugs = st.slider(
            "Actual bugs",
            min_value=0,
            max_value=10,
            value=5,
            help="0 = no bugs, 10 = terrible bugs",
        )

        actual_wind_annoyance = st.slider(
            "Actual wind annoyance",
            min_value=0,
            max_value=10,
            value=5,
            help="0 = no wind problem, 10 = wind ruined it",
        )

        actual_humidity_comfort = st.slider(
            "Actual humidity comfort",
            min_value=0,
            max_value=10,
            value=7,
            help="0 = miserable humidity, 10 = very comfortable",
        )

        actual_ground_wetness = "Not applicable"
        actual_water_conditions = "Not applicable"
        fish_activity = "Not applicable"
        visibility_light = "Not applicable"

        if selected_activity in ["Camping", "Running", "Disc Golf", "Tennis"]:
            actual_ground_wetness = st.selectbox(
                "Actual ground/course/trail condition",
                options=["Dry", "Damp", "Muddy", "Very muddy", "Not sure"],
            )

        if selected_activity in FISHING_ACTIVITIES + ["Kayaking", "Beach Day"]:
            actual_water_conditions = st.selectbox(
                "Actual water conditions",
                options=["Calm", "Light chop", "Choppy", "Rough", "Unsafe", "Not sure"],
            )

        if selected_activity in FISHING_ACTIVITIES:
            fish_activity = st.selectbox(
                "Fish activity",
                options=["None", "Low", "Medium", "High", "Not sure"],
            )

        if selected_activity == "Running":
            visibility_light = st.selectbox(
                "Visibility/light conditions",
                options=["Bright daylight", "Low light but okay", "Too dark", "Not sure"],
            )

    notes = st.text_area(
        "Notes",
        placeholder="Example: Bugs were worse than expected. Wind felt stronger. Fish were active near sunset.",
    )

    if st.button("Save Log Entry"):
        if predicted_score is None:
            prediction_error = None
            absolute_error = None
        else:
            prediction_error = actual_score - predicted_score
            absolute_error = abs(prediction_error)

        new_entry = {
            "logged_at": datetime.now().isoformat(timespec="seconds"),
            "date": selected_date,
            "activity": selected_activity,
            "predicted_score": predicted_score if predicted_score is not None else "",
            "recommended_time_window": recommended_time_window,
            "time_window_score": time_window_score,
            "actual_time": actual_time,
            "followed_recommended_window": followed_recommended_window,
            "actual_enjoyment_1_to_10": actual_enjoyment,
            "actual_score_0_to_100": actual_score,
            "prediction_error": prediction_error,
            "absolute_error": absolute_error,
            "did_i_go": did_i_go,
            "actual_bugs_1_to_10": actual_bugs,
            "actual_wind_annoyance_1_to_10": actual_wind_annoyance,
            "actual_humidity_comfort_1_to_10": actual_humidity_comfort,
            "actual_ground_wetness": actual_ground_wetness,
            "actual_water_conditions": actual_water_conditions,
            "fish_activity": fish_activity,
            "visibility_light": visibility_light,
            "notes": notes,
        }

        try:
            response = save_log_entry(new_entry)
            load_activity_log.clear()

            st.success("Log entry saved to Supabase!")
            st.rerun()

        except Exception as e:
            st.error("Could not save log entry to Supabase.")
            st.write(type(e).__name__)
            st.write(e)

# -------------------------
# Show history
# -------------------------
with history_tab:
    st.header("Prediction vs. Actual History")

    if len(activity_log) == 0:
        st.info("No activity logs yet. Save your first entry above.")

    else:
        st.dataframe(
            activity_log.sort_values("logged_at", ascending=False),
            width="stretch",
        )

        show_accuracy_charts(activity_log)

        st.subheader("Model Accuracy Report")

        accuracy_summary, accuracy_insights = build_accuracy_report(activity_log)

        if len(accuracy_summary) == 0:
            st.info("Not enough complete logs for an accuracy report yet.")
        else:
            st.dataframe(accuracy_summary, width="stretch")

            for insight in accuracy_insights:
                st.info(insight)

        st.write(
            """
            **How to read this:**

            - Positive error means the activity was better than predicted.
            - Negative error means it was worse than predicted.
            - Lower average absolute error means your model is more accurate.
            """
        )

        activity_log_csv = activity_log.to_csv(index=False)

        st.subheader("Personal Tuning Suggestions")

        tuning_suggestions = build_tuning_suggestions(activity_log)

        for suggestion in tuning_suggestions:
            st.warning(suggestion)

        st.download_button(
            label="Download activity log as CSV",
            data=activity_log_csv,
            file_name="activity_log.csv",
            mime="text/csv",
        )

        st.subheader("ML Training Export")

        with st.expander("Build and download ML training dataset", expanded=False):
            st.write(
                "This export combines scenario ratings and activity logs into a dataset "
                "that can be used later for model experiments."
            )

            scenario_ratings_for_ml = load_scenario_ratings()

            if "id" in scenario_ratings_for_ml.columns:
                scenario_ratings_for_ml = scenario_ratings_for_ml.drop_duplicates(
                    subset=["id"],
                    keep="first",
                ).reset_index(drop=True)

            prediction_history_for_ml = load_prediction_history()

            scenario_ml_dataset = build_scenario_ml_dataset(
                scenario_ratings_for_ml
            )

            activity_ml_dataset = build_activity_log_ml_dataset(
                activity_log,
                prediction_history=prediction_history_for_ml,
            )

            combined_ml_dataset = build_combined_ml_dataset(
                scenario_ratings=scenario_ratings_for_ml,
                activity_log=activity_log,
                prediction_history=prediction_history_for_ml,
            )

            metric_col1, metric_col2, metric_col3 = st.columns(3)

            with metric_col1:
                st.metric(
                    "Scenario ML rows",
                    len(scenario_ml_dataset),
                )

            with metric_col2:
                st.metric(
                    "Activity log ML rows",
                    len(activity_ml_dataset),
                )

            with metric_col3:
                st.metric(
                    "Combined ML rows",
                    len(combined_ml_dataset),
                )

            if len(combined_ml_dataset) == 0:
                st.info("No ML training rows available yet.")

            else:
                st.dataframe(
                    combined_ml_dataset.head(50),
                    width="stretch",
                )

                st.download_button(
                    label="Download combined ML dataset CSV",
                    data=combined_ml_dataset.to_csv(index=False),
                    file_name="ml_training_dataset.csv",
                    mime="text/csv",
                )

            if len(scenario_ml_dataset) > 0:
                st.download_button(
                    label="Download scenario-only ML dataset CSV",
                    data=scenario_ml_dataset.to_csv(index=False),
                    file_name="scenario_ml_dataset.csv",
                    mime="text/csv",
                )

            if len(activity_ml_dataset) > 0:
                st.download_button(
                    label="Download activity-log ML dataset CSV",
                    data=activity_ml_dataset.to_csv(index=False),
                    file_name="activity_log_ml_dataset.csv",
                    mime="text/csv",
                )

with manage_tab:
    st.header("Manage")

    manage_view = st.radio(
        "What would you like to manage?",
        options=[
            "Activity Logs",
            "Saved Locations",
            "Planned Activities",
            "Weekly Schedule",
        ],
        horizontal=True,
        key="manage_view_selector",
    )

    if manage_view == "Activity Logs":

        st.subheader("Activity Logs")
        st.caption("Edit or delete actual activity logs you have saved.")

        activity_log = load_activity_log()

        log_summary = summarize_activity_logs(activity_log)

        metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

        with metric_col1:
            st.metric("Total Logs", log_summary["total_logs"])

        with metric_col2:
            st.metric("Activities Logged", log_summary["unique_activities"])

        with metric_col3:
            st.metric("Avg Actual Score", log_summary["average_actual_score"])

        with metric_col4:
            st.metric("Latest Log", log_summary["latest_log"])

        if len(activity_log) == 0:
            st.info("No log entries available to manage.")

        elif "id" not in activity_log.columns:
            st.warning("Log IDs are not available, so entries cannot be edited or deleted yet.")

        else:
            manage_log = activity_log.copy()

            manage_log["display_label"] = (
                manage_log["id"].astype(str)
                + " | "
                + manage_log["date"].astype(str)
                + " | "
                + manage_log["activity"].astype(str)
                + " | score "
                + manage_log["actual_enjoyment_1_to_10"].astype(str)
                + " | "
                + manage_log["notes"].fillna("").astype(str).str.slice(0, 40)
            )

            selected_log_label = st.selectbox(
                "Choose a log entry to manage",
                options=manage_log["display_label"].tolist(),
                key="manage_log_selectbox",
            )

            selected_log = manage_log[
                manage_log["display_label"] == selected_log_label
            ].iloc[0]

            selected_log_id = int(selected_log["id"])

            st.write("Selected log:")

            with st.expander("View selected log details", expanded=False):
                st.dataframe(
                    pd.DataFrame([selected_log.drop(labels=["display_label"])]),
                    width="stretch",
                )

            st.markdown("---")
            st.write("### Edit Selected Log")

            def safe_int_value(value, default=5):
                try:
                    if pd.isna(value):
                        return default
                    return int(float(value))
                except Exception:
                    return default

            def safe_text_value(value, default=""):
                try:
                    if pd.isna(value):
                        return default
                    return str(value)
                except Exception:
                    return default

            def safe_option_value(value, options, default):
                value = safe_text_value(value, default)

                if value in options:
                    return value

                return default

            with st.expander("Edit score and notes", expanded=True):
                actual_time_edit = st.text_input(
                    "Actual time",
                    value=safe_text_value(selected_log.get("actual_time", "")),
                    key=f"edit_actual_time_{selected_log_id}",
                )

                enjoyment_edit = st.slider(
                    "Actual enjoyment score",
                    min_value=1,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_enjoyment_1_to_10", 7),
                        default=7,
                    ),
                    key=f"edit_enjoyment_{selected_log_id}",
                )

                did_i_go_options = ["Yes", "No", "Partially"]

                did_i_go_edit = st.selectbox(
                    "Did you actually do this activity?",
                    options=did_i_go_options,
                    index=did_i_go_options.index(
                        safe_option_value(
                            selected_log.get("did_i_go", "Yes"),
                            did_i_go_options,
                            "Yes",
                        )
                    ),
                    key=f"edit_did_i_go_{selected_log_id}",
                )

                notes_edit = st.text_area(
                    "Notes",
                    value=safe_text_value(selected_log.get("notes", "")),
                    key=f"edit_notes_{selected_log_id}",
                )

            with st.expander("Edit conditions", expanded=False):
                followed_options = ["Not sure", "Yes", "No", "Partially"]

                followed_recommended_window_edit = st.selectbox(
                    "Did you go during the recommended time window?",
                    options=followed_options,
                    index=followed_options.index(
                        safe_option_value(
                            selected_log.get("followed_recommended_window", "Not sure"),
                            followed_options,
                            "Not sure",
                        )
                    ),
                    key=f"edit_followed_window_{selected_log_id}",
                )

                actual_bugs_edit = st.slider(
                    "Actual bugs",
                    min_value=0,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_bugs_1_to_10", 5),
                        default=5,
                    ),
                    key=f"edit_bugs_{selected_log_id}",
                )

                actual_wind_annoyance_edit = st.slider(
                    "Actual wind annoyance",
                    min_value=0,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_wind_annoyance_1_to_10", 5),
                        default=5,
                    ),
                    key=f"edit_wind_{selected_log_id}",
                )

                actual_humidity_comfort_edit = st.slider(
                    "Actual humidity comfort",
                    min_value=0,
                    max_value=10,
                    value=safe_int_value(
                        selected_log.get("actual_humidity_comfort_1_to_10", 7),
                        default=7,
                    ),
                    key=f"edit_humidity_{selected_log_id}",
                )

                ground_options = ["Dry", "Damp", "Muddy", "Very muddy", "Not sure", "Not applicable"]

                actual_ground_wetness_edit = st.selectbox(
                    "Actual ground/course/trail condition",
                    options=ground_options,
                    index=ground_options.index(
                        safe_option_value(
                            selected_log.get("actual_ground_wetness", "Not applicable"),
                            ground_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_ground_{selected_log_id}",
                )

                water_options = ["Calm", "Light chop", "Choppy", "Rough", "Unsafe", "Not sure", "Not applicable"]

                actual_water_conditions_edit = st.selectbox(
                    "Actual water conditions",
                    options=water_options,
                    index=water_options.index(
                        safe_option_value(
                            selected_log.get("actual_water_conditions", "Not applicable"),
                            water_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_water_{selected_log_id}",
                )

                fish_options = ["None", "Low", "Medium", "High", "Not sure", "Not applicable"]

                fish_activity_edit = st.selectbox(
                    "Fish activity",
                    options=fish_options,
                    index=fish_options.index(
                        safe_option_value(
                            selected_log.get("fish_activity", "Not applicable"),
                            fish_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_fish_{selected_log_id}",
                )

                visibility_options = ["Bright daylight", "Low light but okay", "Too dark", "Not sure", "Not applicable"]

                visibility_light_edit = st.selectbox(
                    "Visibility/light conditions",
                    options=visibility_options,
                    index=visibility_options.index(
                        safe_option_value(
                            selected_log.get("visibility_light", "Not applicable"),
                            visibility_options,
                            "Not applicable",
                        )
                    ),
                    key=f"edit_visibility_{selected_log_id}",
                )

            predicted_score_for_edit = selected_log.get("predicted_score", None)
            actual_score_edit = enjoyment_edit * 10

            try:
                if pd.isna(predicted_score_for_edit):
                    prediction_error_edit = None
                    absolute_error_edit = None
                else:
                    prediction_error_edit = actual_score_edit - float(predicted_score_for_edit)
                    absolute_error_edit = abs(prediction_error_edit)
            except Exception:
                prediction_error_edit = None
                absolute_error_edit = None

            if st.button("Save edits to selected log", key=f"save_edits_{selected_log_id}"):
                updated_entry = {
                    "actual_time": actual_time_edit,
                    "followed_recommended_window": followed_recommended_window_edit,
                    "actual_enjoyment_1_to_10": enjoyment_edit,
                    "actual_score_0_to_100": actual_score_edit,
                    "prediction_error": prediction_error_edit,
                    "absolute_error": absolute_error_edit,
                    "did_i_go": did_i_go_edit,
                    "actual_bugs_1_to_10": actual_bugs_edit,
                    "actual_wind_annoyance_1_to_10": actual_wind_annoyance_edit,
                    "actual_humidity_comfort_1_to_10": actual_humidity_comfort_edit,
                    "actual_ground_wetness": actual_ground_wetness_edit,
                    "actual_water_conditions": actual_water_conditions_edit,
                    "fish_activity": fish_activity_edit,
                    "visibility_light": visibility_light_edit,
                    "notes": notes_edit,
                }

                try:
                    update_log_entry(selected_log_id, updated_entry)
                    load_activity_log.clear()
                    st.success("Log entry updated.")
                    st.rerun()

                except Exception as e:
                    st.error("Could not update log entry.")
                    st.write(type(e).__name__)
                    st.write(e)

            st.markdown("---")

            with st.expander("Danger zone: delete log", expanded=False):
                st.warning("Deleting a log entry cannot be undone.")

                confirm_delete = st.checkbox(
                    "Yes, I want to delete this log entry",
                    key=f"confirm_delete_log_{selected_log_id}",
                )

                if st.button("Delete selected log entry", key=f"delete_log_button_{selected_log_id}"):
                    if confirm_delete:
                        delete_log_entry(selected_log_id)
                        load_activity_log.clear()

                        st.success("Log entry deleted.")
                        st.rerun()

                    else:
                        st.warning("Check the confirmation box before deleting.")

    elif manage_view == "Weekly Schedule":

        st.subheader("Weekly Schedule / Obligations")
        st.caption("Add recurring unavailable times so suggested windows avoid them.")

        st.write(
            "Add recurring times when you are unavailable. "
            "Suggested activity windows will avoid these times."
        )

        with st.form("add_weekly_obligation_form"):
            obligation_label = st.text_input(
                "Label",
                placeholder="Example: Work, Class, Practice",
            )

            obligation_day_label = st.selectbox(
                "Day",
                options=list(DAY_OF_WEEK_OPTIONS.keys()),
            )

            col1, col2 = st.columns(2)

            with col1:
                obligation_start = st.time_input("Start time")

            with col2:
                obligation_end = st.time_input("End time")

            submitted_obligation = st.form_submit_button("Save obligation")

            if submitted_obligation:
                if obligation_label.strip() == "":
                    st.error("Please enter a label.")
                else:
                    save_weekly_obligation(
                        label=obligation_label,
                        day_of_week=DAY_OF_WEEK_OPTIONS[obligation_day_label],
                        start_time=obligation_start.strftime("%H:%M"),
                        end_time=obligation_end.strftime("%H:%M"),
                    )

                    st.success("Weekly obligation saved.")
                    st.rerun()

        obligations = load_weekly_obligations()

        obligation_summary = summarize_weekly_obligations(obligations)

        metric_col1, metric_col2, metric_col3 = st.columns(3)

        with metric_col1:
            st.metric("Total Obligations", obligation_summary["total_obligations"])

        with metric_col2:
            st.metric("Active", obligation_summary["active_obligations"])

        with metric_col3:
            st.metric("Days Blocked", obligation_summary["days_blocked"])

        if len(obligations) == 0:
            st.info("No weekly obligations saved.")

        else:
            display_obligations = obligations.copy()

            display_obligations["day"] = display_obligations["day_of_week"].apply(
                lambda value: DAY_OF_WEEK_LABELS.get(int(value), str(value))
            )

            with st.expander("View weekly schedule table", expanded=False):
                st.dataframe(
                    display_obligations[
                        [
                            "id",
                            "label",
                            "day",
                            "start_time",
                            "end_time",
                            "active",
                        ]
                    ],
                    width="stretch",
                )

            display_obligations["display_label"] = (
                display_obligations["id"].astype(str)
                + " | "
                + display_obligations["label"].astype(str)
                + " | "
                + display_obligations["day"].astype(str)
                + " | "
                + display_obligations["start_time"].astype(str)
                + "-"
                + display_obligations["end_time"].astype(str)
            )

            selected_obligation_label = st.selectbox(
                "Choose obligation to delete",
                options=display_obligations["display_label"].tolist(),
                key="delete_obligation_selectbox",
            )

            selected_obligation = display_obligations[
                display_obligations["display_label"] == selected_obligation_label
            ].iloc[0]

            confirm_delete_obligation = st.checkbox(
                "Yes, delete this weekly obligation",
                key=f"confirm_delete_obligation_{selected_obligation['id']}",
            )

            if st.button(
                "Delete selected obligation",
                key=f"delete_obligation_{selected_obligation['id']}",
            ):
                if confirm_delete_obligation:
                    delete_weekly_obligation(int(selected_obligation["id"]))
                    st.success("Obligation deleted.")
                    st.rerun()
                else:
                    st.warning("Check the confirmation box before deleting.")

    elif manage_view == "Saved Locations":

        st.subheader("Saved Locations")
        st.caption("Add, edit, delete, and assign default locations for activities.")

        saved_locations = load_saved_locations()

        activity_location_defaults = load_activity_location_defaults()

        location_summary = summarize_saved_locations(
            saved_locations,
            activity_location_defaults,
        )

        metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

        with metric_col1:
            st.metric("Saved Locations", location_summary["total_locations"])

        with metric_col2:
            st.metric("Activity Defaults", location_summary["default_mappings"])

        with metric_col3:
            st.metric("Water Locations", location_summary["water_locations"])

        with metric_col4:
            st.metric("USGS Enabled", location_summary["usgs_locations"])

        st.write("### Add New Location")

        location_search_input = st.text_input(
            "Search address/place or paste map link",
            placeholder="Example: Gallup Park Ann Arbor or 3000 Fuller Rd Ann Arbor",
            key="manage_new_location_search_input",
        )

        if st.button("Find saved location candidate", key="manage_find_location_candidate"):
            location_search_results = search_location_anything(
                location_search_input
            )

            st.session_state["new_location_search_results"] = location_search_results

            if len(location_search_results) == 0:
                st.warning("No matching locations found. Try a different search.")
            else:
                st.success("Location candidates found.")

        location_search_results = st.session_state.get(
            "new_location_search_results",
            [],
        )

        selected_candidate = None

        if len(location_search_results) > 0:
            candidate_labels = [
                f"{item['label']} ({item.get('source', 'source unknown')})"
                for item in location_search_results
            ]

            selected_candidate_label = st.selectbox(
                "Choose location candidate",
                options=candidate_labels,
                key="manage_new_location_candidate_select",
            )

            selected_index = candidate_labels.index(selected_candidate_label)
            selected_candidate = location_search_results[selected_index]

            st.write(
                f"Selected coordinates: "
                f"{selected_candidate['latitude']}, {selected_candidate['longitude']}"
            )

        with st.form("manage_add_saved_location_form"):
            default_name = ""

            if selected_candidate is not None:
                default_name = selected_candidate["label"].split(",")[0]

            new_location_name = st.text_input(
                "Location name",
                value=default_name,
                placeholder="Example: Local Pond, Tennis Courts, Kayak Launch",
            )

            if selected_candidate is not None:
                default_latitude = float(selected_candidate["latitude"])
                default_longitude = float(selected_candidate["longitude"])
            else:
                default_latitude = float(latitude)
                default_longitude = float(longitude)

            with st.expander("Advanced: coordinates", expanded=False):
                col1, col2 = st.columns(2)

                with col1:
                    new_location_latitude = st.number_input(
                        "Latitude",
                        format="%.6f",
                        value=default_latitude,
                    )

                with col2:
                    new_location_longitude = st.number_input(
                        "Longitude",
                        format="%.6f",
                        value=default_longitude,
                    )

            location_type_options = [
                "Home",
                "Lake",
                "River",
                "Pond",
                "Beach",
                "Park",
                "Disc Golf Course",
                "Tennis Courts",
                "Campground",
                "Trail",
                "Other",
            ]

            new_location_type = st.selectbox(
                "Location type",
                options=location_type_options,
            )

            water_type_options = [
                "Not applicable",
                "Freshwater lake",
                "River",
                "Pond",
                "Great Lake",
                "Ocean/coastal",
                "Unknown",
            ]

            new_water_type = st.selectbox(
                "Water type",
                options=water_type_options,
            )

            new_water_body_size = st.selectbox(
                "Water body size",
                options=WATER_BODY_SIZE_OPTIONS,
                help="Used to estimate chop/roughness for ponds and lakes.",
            )

            new_wind_exposure = st.selectbox(
                "Wind exposure",
                options=WIND_EXPOSURE_OPTIONS,
                help="Sheltered water is less affected by wind than open/exposed water.",
            )

            use_usgs_water_data = st.checkbox(
                "Use USGS water data for this location",
                value=False,
                help="Useful for river fishing/kayaking locations with a nearby USGS gauge.",
            )

            usgs_site_id = st.text_input(
                "USGS site ID",
                placeholder="Example: 04174500",
                help="Find site IDs at waterdata.usgs.gov. Leave blank if not using USGS.",
            )

            use_ndbc_data = st.checkbox(
                "Use NOAA buoy data for this location later",
                value=False,
                help="For future Great Lakes/coastal buoy data. Not used yet.",
            )

            ndbc_station_id = st.text_input(
                "NOAA/NDBC buoy station ID",
                placeholder="Optional, for future Great Lakes buoy data",
            )

            activity_options = sorted(predictions["activity"].unique())

            new_default_activities = st.multiselect(
                "Default activities for this location",
                options=activity_options,
            )

            use_location_water_temp = st.checkbox(
                "Set manual water temperature for this location",
                value=False,
            )

            if use_location_water_temp:
                new_manual_water_temp = st.number_input(
                    "Manual water temperature °F",
                    min_value=32,
                    max_value=95,
                    value=65,
                )
            else:
                new_manual_water_temp = None

            new_location_notes = st.text_area(
                "Notes",
                placeholder="Example: sheltered from wind, muddy after rain, good bass spot",
            )

            submitted_location = st.form_submit_button("Save Location")

            if submitted_location:
                if new_location_name.strip() == "":
                    st.error("Location name is required.")
                else:
                    save_saved_location({
                        "name": new_location_name,
                        "latitude": new_location_latitude,
                        "longitude": new_location_longitude,
                        "location_type": new_location_type,
                        "water_type": new_water_type,
                        "default_activities": new_default_activities,
                        "manual_water_temp": new_manual_water_temp,
                        "use_usgs_water_data": use_usgs_water_data,
                        "usgs_site_id": usgs_site_id,
                        "notes": new_location_notes,
                        "water_body_size": new_water_body_size,
                        "wind_exposure": new_wind_exposure,
                        "use_ndbc_data": use_ndbc_data,
                        "ndbc_station_id": ndbc_station_id,
                    })

                    st.success("Location saved.")
                    st.rerun()

        st.write("### Existing Locations")

        if len(saved_locations) == 0:
            st.info("No saved locations yet.")

        else:
            with st.expander("View saved locations table", expanded=False):
                st.dataframe(
                    saved_locations,
                    width="stretch",
                )

            saved_locations["display_label"] = (
                saved_locations["id"].astype(str)
                + " | "
                + saved_locations["name"].astype(str)
                + " | "
                + saved_locations["location_type"].astype(str)
            )

            selected_location_label = st.selectbox(
                "Choose location to edit/delete",
                options=saved_locations["display_label"].tolist(),
                key="manage_edit_saved_location_selectbox",
            )

            selected_location = saved_locations[
                saved_locations["display_label"] == selected_location_label
            ].iloc[0]

            selected_location_id = int(selected_location["id"])

            with st.expander("Edit selected location", expanded=False):
                edit_location_name = st.text_input(
                    "Location name",
                    value=str(selected_location.get("name", "")),
                    key=f"edit_location_name_{selected_location_id}",
                )

                edit_col1, edit_col2 = st.columns(2)

                with edit_col1:
                    edit_latitude = st.number_input(
                        "Latitude",
                        format="%.6f",
                        value=float(selected_location.get("latitude", latitude)),
                        key=f"edit_location_lat_{selected_location_id}",
                    )

                with edit_col2:
                    edit_longitude = st.number_input(
                        "Longitude",
                        format="%.6f",
                        value=float(selected_location.get("longitude", longitude)),
                        key=f"edit_location_lon_{selected_location_id}",
                    )

                edit_location_type = st.selectbox(
                    "Location type",
                    options=location_type_options,
                    index=location_type_options.index(selected_location.get("location_type"))
                    if selected_location.get("location_type") in location_type_options
                    else 0,
                    key=f"edit_location_type_{selected_location_id}",
                )

                edit_water_type = st.selectbox(
                    "Water type",
                    options=water_type_options,
                    index=water_type_options.index(selected_location.get("water_type"))
                    if selected_location.get("water_type") in water_type_options
                    else 0,
                    key=f"edit_water_type_{selected_location_id}",
                )

                current_water_body_size = selected_location.get("water_body_size", "Unknown")

                if pd.isna(current_water_body_size) or current_water_body_size not in WATER_BODY_SIZE_OPTIONS:
                    current_water_body_size = "Unknown"

                edit_water_body_size = st.selectbox(
                    "Water body size",
                    options=WATER_BODY_SIZE_OPTIONS,
                    index=WATER_BODY_SIZE_OPTIONS.index(current_water_body_size),
                    key=f"edit_water_body_size_{selected_location_id}",
                )

                current_wind_exposure = selected_location.get("wind_exposure", "Unknown")

                if pd.isna(current_wind_exposure) or current_wind_exposure not in WIND_EXPOSURE_OPTIONS:
                    current_wind_exposure = "Unknown"

                edit_wind_exposure = st.selectbox(
                    "Wind exposure",
                    options=WIND_EXPOSURE_OPTIONS,
                    index=WIND_EXPOSURE_OPTIONS.index(current_wind_exposure),
                    key=f"edit_wind_exposure_{selected_location_id}",
                )

                current_use_usgs = selected_location.get("use_usgs_water_data", False)

                if pd.isna(current_use_usgs):
                    current_use_usgs = False

                edit_use_usgs_water_data = st.checkbox(
                    "Use USGS water data for this location",
                    value=bool(current_use_usgs),
                    key=f"edit_use_usgs_water_data_{selected_location_id}",
                )

                current_usgs_site_id = selected_location.get("usgs_site_id", "")

                if pd.isna(current_usgs_site_id):
                    current_usgs_site_id = ""

                edit_usgs_site_id = st.text_input(
                    "USGS site ID",
                    value=str(current_usgs_site_id),
                    placeholder="Example: 04174500",
                    key=f"edit_usgs_site_id_{selected_location_id}",
                )

                current_use_ndbc = selected_location.get("use_ndbc_data", False)

                if pd.isna(current_use_ndbc):
                    current_use_ndbc = False

                edit_use_ndbc_data = st.checkbox(
                    "Use NOAA buoy data for this location later",
                    value=bool(current_use_ndbc),
                    key=f"edit_use_ndbc_data_{selected_location_id}",
                )

                current_ndbc_station_id = selected_location.get("ndbc_station_id", "")

                if pd.isna(current_ndbc_station_id):
                    current_ndbc_station_id = ""

                edit_ndbc_station_id = st.text_input(
                    "NOAA/NDBC buoy station ID",
                    value=str(current_ndbc_station_id),
                    placeholder="Optional, for future Great Lakes buoy data",
                    key=f"edit_ndbc_station_id_{selected_location_id}",
                )

                current_default_activities = selected_location.get("default_activities", [])

                if not isinstance(current_default_activities, list):
                    current_default_activities = []

                edit_default_activities = st.multiselect(
                    "Default activities",
                    options=activity_options,
                    default=[
                        activity
                        for activity in current_default_activities
                        if activity in activity_options
                    ],
                    key=f"edit_default_activities_{selected_location_id}",
                )

                current_water_temp = selected_location.get("manual_water_temp")

                use_edit_water_temp = st.checkbox(
                    "Set manual water temperature for this location",
                    value=not pd.isna(current_water_temp),
                    key=f"edit_use_water_temp_{selected_location_id}",
                )

                if use_edit_water_temp:
                    edit_manual_water_temp = st.number_input(
                        "Manual water temperature °F",
                        min_value=32,
                        max_value=95,
                        value=65 if pd.isna(current_water_temp) else int(float(current_water_temp)),
                        key=f"edit_manual_water_temp_{selected_location_id}",
                    )
                else:
                    edit_manual_water_temp = None

                edit_notes = st.text_area(
                    "Notes",
                    value="" if pd.isna(selected_location.get("notes")) else str(selected_location.get("notes")),
                    key=f"edit_location_notes_{selected_location_id}",
                )

                if st.button("Save location edits", key=f"save_location_edits_{selected_location_id}"):
                    update_saved_location(
                        selected_location_id,
                        {
                            "name": edit_location_name,
                            "latitude": edit_latitude,
                            "longitude": edit_longitude,
                            "location_type": edit_location_type,
                            "water_type": edit_water_type,
                            "default_activities": edit_default_activities,
                            "manual_water_temp": edit_manual_water_temp,
                            "use_usgs_water_data": edit_use_usgs_water_data,
                            "usgs_site_id": edit_usgs_site_id,
                            "notes": edit_notes,
                            "water_body_size": edit_water_body_size,
                            "wind_exposure": edit_wind_exposure,
                            "use_ndbc_data": edit_use_ndbc_data,
                            "ndbc_station_id": edit_ndbc_station_id,
                        },
                    )

                    st.success("Location updated.")
                    st.rerun()

            with st.expander("Danger zone: delete location", expanded=False):
                st.warning("Deleting a saved location cannot be undone.")

                confirm_delete_location = st.checkbox(
                    "Yes, delete this saved location",
                    key=f"confirm_delete_location_{selected_location_id}",
                )

                if st.button("Delete saved location", key=f"delete_location_{selected_location_id}"):
                    if confirm_delete_location:
                        delete_saved_location(selected_location_id)
                        st.success("Location deleted.")
                        st.rerun()
                    else:
                        st.warning("Check the confirmation box before deleting.")

        st.markdown("---")
        st.subheader("Default Location by Activity")

        saved_locations_for_defaults = load_saved_locations()
        activity_location_defaults = load_activity_location_defaults()

        if len(saved_locations_for_defaults) == 0:
            st.info("Save at least one location before setting activity defaults.")

        else:
            activity_options_for_defaults = sorted(predictions["activity"].unique())

            location_label_map = {}

            location_options = ["No default"]

            for _, location_row in saved_locations_for_defaults.iterrows():
                label = (
                    f"{location_row['name']} "
                    f"({location_row.get('location_type', 'Location')})"
                )

                location_options.append(label)
                location_label_map[label] = int(location_row["id"])

            for activity in activity_options_for_defaults:
                with st.expander(activity_label(activity), expanded=False):
                    current_default_location = get_default_location_for_activity(
                        activity=activity,
                        defaults_df=activity_location_defaults,
                        saved_locations_df=saved_locations_for_defaults,
                    )

                    if current_default_location is not None:
                        current_label = (
                            f"{current_default_location['name']} "
                            f"({current_default_location.get('location_type', 'Location')})"
                        )
                    else:
                        current_label = "No default"

                    if current_label in location_options:
                        current_index = location_options.index(current_label)
                    else:
                        current_index = 0

                    selected_default_location_label = st.selectbox(
                        "Default location",
                        options=location_options,
                        index=current_index,
                        key=f"default_location_select_{activity}",
                    )

                    col_a, col_b = st.columns(2)

                    with col_a:
                        if st.button(
                            "Save default",
                            key=f"save_default_location_{activity}",
                        ):
                            if selected_default_location_label == "No default":
                                delete_activity_location_default(activity)
                                st.success("Default location removed.")
                            else:
                                selected_location_id = location_label_map[
                                    selected_default_location_label
                                ]

                                save_activity_location_default(
                                    activity,
                                    selected_location_id,
                                )

                                st.success("Default location saved.")

                            st.rerun()

                    with col_b:
                        if st.button(
                            "Clear default",
                            key=f"clear_default_location_{activity}",
                        ):
                            delete_activity_location_default(activity)
                            st.success("Default location cleared.")
                            st.rerun()

    elif manage_view == "Planned Activities":

        st.subheader("Planned Activities")
        st.caption("Review planned activities and update their status.")

        plans = load_planned_activities()

        plan_summary = summarize_planned_activities(plans)

        metric_col1, metric_col2, metric_col3, metric_col4, metric_col5 = st.columns(5)

        with metric_col1:
            st.metric("Total", plan_summary["total_plans"])

        with metric_col2:
            st.metric("Planned", plan_summary["planned"])

        with metric_col3:
            st.metric("Maybe", plan_summary["maybe"])

        with metric_col4:
            st.metric("Completed", plan_summary["completed"])

        with metric_col5:
            st.metric("Canceled", plan_summary["canceled"])

        if len(plans) == 0:
            st.info("No planned activities yet.")

        else:
            plans_with_current = update_plans_with_current_forecast(
                plans,
                predictions,
            )

            with st.expander("View planned activities table", expanded=False):
                st.dataframe(
                    plans_with_current.sort_values("planned_date"),
                    width="stretch",
                )

            plans_with_current["display_label"] = (
                plans_with_current["id"].astype(str)
                + " | "
                + plans_with_current["planned_date"].astype(str)
                + " | "
                + plans_with_current["activity"].astype(str)
                + " | "
                + plans_with_current["status"].astype(str)
            )

            selected_plan_label = st.selectbox(
                "Choose planned activity to update",
                options=plans_with_current["display_label"].tolist(),
                key="manage_selected_plan",
            )

            selected_plan = plans_with_current[
                plans_with_current["display_label"] == selected_plan_label
            ].iloc[0]

            selected_plan_id = int(selected_plan["id"])

            new_plan_status = st.selectbox(
                "Status",
                options=PLAN_STATUSES,
                index=PLAN_STATUSES.index(selected_plan["status"])
                if selected_plan["status"] in PLAN_STATUSES
                else 0,
                key=f"manage_plan_status_{selected_plan_id}",
            )

            if st.button("Update plan status", key=f"manage_update_plan_status_{selected_plan_id}"):
                update_planned_activity_status(
                    selected_plan_id,
                    new_plan_status,
                )

                load_planned_activities.clear()
                st.success("Plan status updated.")
                st.rerun()

            with st.expander("Danger zone: delete planned activity", expanded=False):
                confirm_delete_plan = st.checkbox(
                    "Delete this planned activity",
                    key=f"manage_confirm_delete_plan_{selected_plan_id}",
                )

                if st.button("Delete planned activity", key=f"manage_delete_plan_{selected_plan_id}"):
                    if confirm_delete_plan:
                        delete_planned_activity(selected_plan_id)
                        load_planned_activities.clear()
                        st.success("Planned activity deleted.")
                        st.rerun()
                    else:
                        st.warning("Check the confirmation box before deleting.")