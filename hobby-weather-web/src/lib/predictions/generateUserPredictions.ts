import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVITY_OPTIONS,
  DEFAULT_ENABLED_ACTIVITIES,
} from "@/lib/activityMeta";
import {
  clampScore,
  scoreActivity,
  calibrateActivityScore,
  type DailyWeather,
} from "@/lib/predictions/scoringProfiles";
import { getRecommendedWindowForActivity } from "@/lib/predictions/windowScoring";
import {
  addDaysString,
  todayString,
  isDateInAllowedWindow,
} from "@/lib/server/lumora/dates";
import {
  aggregateDailyWeather,
  buildWeatherSnapshot,
  fetchWeatherBundleWithCache,
} from "@/lib/server/lumora/weather";
import {
  forecastConfidence,
  forecastConfidenceLabel,
  scoreLabel,
} from "@/lib/server/lumora/forecastConfidence";
import {
  applyPreferenceAdjustment,
  loadPreferences,
  type Preferences,
} from "@/lib/server/lumora/preferences";
import {
  buildLocationContext,
  loadSavedLocations,
  loadWeeklyObligations,
  type SavedLocation,
} from "@/lib/server/lumora/userData";
import {
  buildActivityLocationMap,
  loadActivityDefaults,
} from "@/lib/server/lumora/activityDefaults";
import type { ScoreComponents } from "@/lib/server/lumora/rankCandidates";

const ACTIVITIES = ACTIVITY_OPTIONS;

type SupabaseAdmin = SupabaseClient<any, "public", any>;

type PredictionResult = {
  predictionsWritten: number;
  locationsUsed: number;
};

function buildGearNotes(day: DailyWeather) {
  const notes: string[] = [];

  if (day.stormSafety < 60) notes.push("watch storm risk closely");
  if (day.bugIndex >= 55) notes.push("bring bug spray");
  if (day.uvIndex >= 6) notes.push("bring sunscreen");
  if (day.gustMax >= 25) notes.push("expect gusty wind");
  if (day.rainChance >= 50) notes.push("bring rain gear");
  if (day.aqi >= 101) notes.push("air quality caution");

  if (notes.length === 0) {
    return "No special gear concerns.";
  }

  return `${notes.join("; ")}.`;
}

export async function generateUserPredictionsNow({
  admin,
  userId,
}: {
  admin: SupabaseAdmin;
  userId: string;
}): Promise<PredictionResult> {
  const preferences = await loadPreferences(admin, userId);
  const locations = await loadSavedLocations(admin, userId);
  const defaults = await loadActivityDefaults(admin, userId);
  const obligations = await loadWeeklyObligations(admin, userId);

  const enabledActivities =
    Array.isArray(preferences.enabled_activities) &&
    preferences.enabled_activities.length > 0
      ? preferences.enabled_activities.filter((activity) =>
          ACTIVITIES.includes(activity)
        )
      : [...DEFAULT_ENABLED_ACTIVITIES];

  if (locations.length === 0) {
    return {
      predictionsWritten: 0,
      locationsUsed: 0,
    };
  }

  const activityLocationMap = buildActivityLocationMap(
    locations,
    defaults,
    enabledActivities
  );

  const uniqueLocations = Array.from(
    new Map(
      Array.from(activityLocationMap.values()).map((location) => [
        location.id,
        location,
      ])
    ).values()
  );

  const dailyWeatherByLocationId = new Map<number, DailyWeather[]>();

  for (const location of uniqueLocations) {
    if (location.latitude === null || location.longitude === null) continue;

    const { forecast, airQuality } = await fetchWeatherBundleWithCache({
        admin,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        ttlHours: 3,
        jobSource: "generate_user_predictions",
    });

      dailyWeatherByLocationId.set(
        location.id,
        aggregateDailyWeather(forecast, airQuality)
    );
  }

  const rows: Record<string, unknown>[] = [];

  for (const activity of enabledActivities) {
    const location = activityLocationMap.get(activity);

    if (!location) continue;

    const days = dailyWeatherByLocationId.get(location.id) ?? [];

    for (const day of days) {
      const base = scoreActivity(activity, day);
      const adjustment = applyPreferenceAdjustment(activity, day, preferences);
      const predictedScore = calibrateActivityScore({
        activity,
        day,
        score: base.score + adjustment,
        });
      const confidence = forecastConfidence(day.date, day);
      const planningScore = clampScore(predictedScore * 0.8 + confidence * 0.2);

      const windowRecommendation = getRecommendedWindowForActivity({
        activity,
        date: day.date,
        day,
        obligations,
      });

      const scoreComponents: ScoreComponents = {
        base_score: base.score,
        preference_adjustment: Math.round(adjustment),
        calibrated_score: predictedScore,
        planning_score: planningScore,
        forecast_confidence: confidence,
        window_score: windowRecommendation.windowScore,
        };

      const weatherSnapshot = buildWeatherSnapshot(day);

      let explanation = base.explanation;

      if (adjustment > 1) {
        explanation += ` Your preferences increased this score by ${Math.round(
          adjustment
        )} points.`;
      } else if (adjustment < -1) {
        explanation += ` Your preferences decreased this score by ${Math.abs(
          Math.round(adjustment)
        )} points.`;
      } else {
        explanation += " Your preferences did not meaningfully change this score.";
      }

      if (location.name) {
        explanation += ` Location used: ${location.name}.`;
      }

      if (windowRecommendation.windowScore > 0) {
        explanation += ` Suggested window: ${windowRecommendation.recommendedWindow}.`;
      } else {
        explanation += " No clear open window was found around your saved schedule.";
      }

      const context = buildLocationContext(location);

      rows.push({
        user_id: userId,
        date: day.date,
        activity,

        predicted_score: predictedScore,
        planning_score: planningScore,
        forecast_confidence: confidence,
        forecast_confidence_label: forecastConfidenceLabel(confidence),
        label: scoreLabel(predictedScore),

        recommended_window: windowRecommendation.recommendedWindow,
        window_score: windowRecommendation.windowScore,

        saved_location_id: location.id,
        location_name: location.name,
        location_context: context,

        explanation,
        gear_notes: buildGearNotes(day),

        weather_snapshot: weatherSnapshot,
        species_breakdown: null,
        best_species: null,
        best_species_score: null,

        rule_score: base.score,
        ml_score: null,
        final_score: predictedScore,
        scoring_method: "typescript_direct_user_location_hourly_windows_v2",
        model_version: "none",
        feature_json: {
          source: "typescript_api_route",
          weather_snapshot: weatherSnapshot,
          preferences,
          location_context: context,
          score_components: scoreComponents,
        },
        data_quality_json: {
          prediction_source: "typescript_direct_user_location_hourly_windows_v2",
          prediction_window: "today_through_14_days",
          default_location_used: true,
          schedule_aware_window_used: true,
          window_scoring_version: "hourly_windows_v2",
          ml_used: false,
        },
        prediction_source: "typescript_api_route_hourly_windows_v2",
        generated_at: new Date().toISOString(),

        ml_status: "no_model_available",
        ml_weight: 0,
        rule_weight: 1,
        blended_score: predictedScore,
        model_input_json: {
          activity,
          date: day.date,
          weather: weatherSnapshot,
          preferences,
          location: context,
          score_components: scoreComponents,
        },
        model_explanation:
          "No ML model applied yet. Using TypeScript rule-based scoring with saved/default location context.",
      });
    }
  }

  if (rows.length > 0) {
    const startDate = todayString();
    const endDate = addDaysString(14);

    const { error: deleteError } = await admin
      .from("user_predictions")
      .delete()
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (deleteError) {
      throw deleteError;
    }

    const { error } = await admin
      .from("user_predictions")
      .upsert(rows as any[], {
        onConflict: "user_id,date,activity",
      });

    if (error) {
      throw error;
    }
  }

  return {
    predictionsWritten: rows.length,
    locationsUsed: uniqueLocations.length,
  };
}