import {
  calibrateActivityScore,
  clampScore,
  scoreActivity,
} from "@/lib/predictions/scoringProfiles";
import {
  getRecommendedWindowForActivity,
  type WeeklyObligation,
} from "@/lib/predictions/windowScoring";
import {
  forecastConfidence,
  forecastConfidenceLabel,
  scoreLabel,
} from "@/lib/server/lumora/forecastConfidence";
import {
  aggregateDailyWeather,
  buildWeatherSnapshot,
  fetchWeatherBundleWithCache,
  weatherCacheKey,
  type WeatherBundle,
} from "@/lib/server/lumora/weather";
import {
  applyPreferenceAdjustment,
  type Preferences,
} from "@/lib/server/lumora/preferences";
import type { SavedLocation } from "@/lib/server/lumora/userData";
import {
  buildCandidateLocationContext,
  distanceFromOriginMiles,
  savedLocationsToCandidates,
  type CandidateOrigin,
  type LumoraLocationCandidate,
  type LumoraLocationSource,
} from "@/lib/server/lumora/candidates";
import {
  getRecommendedWindowForActivity,
  type WeeklyObligation,
  type WindowRecommendationV2,
} from "@/lib/predictions/windowScoring";

function getWeatherBundle({
  admin,
  latitude,
  longitude,
  weatherCache,
}: {
  admin?: any;
  latitude: number;
  longitude: number;
  weatherCache: Map<string, Promise<WeatherBundle>>;
}) {
  const key = weatherCacheKey(latitude, longitude);

  if (!weatherCache.has(key)) {
    weatherCache.set(
      key,
      fetchWeatherBundleWithCache({
        admin,
        latitude,
        longitude,
        ttlHours: 3,
        jobSource: "rank_candidates",
      })
    );
  }

  return weatherCache.get(key)!;
}

export type ScoreComponents = {
  base_score: number;
  preference_adjustment: number;
  calibrated_score: number;
  planning_score: number;
  forecast_confidence: number;
  window_score: number | null;
};

export type ExploreLocationRanking = {
  result_id: string;
  source: LumoraLocationSource;

  location_id: number | null;
  location_name: string | null;

  external_id?: string | null;
  external_type?: string | null;
  external_source?: string | null;
  map_url?: string | null;

  activity: string;
  date: string;

  score: number;
  planning_score: number;
  forecast_confidence: number;
  forecast_confidence_label: string;
  label: string;

  score_components: ScoreComponents;

  recommended_window: string | null;
  window_score: number | null;

  explanation: string;
  weather_snapshot: ReturnType<typeof buildWeatherSnapshot>;
  location_context: ReturnType<typeof buildCandidateLocationContext>;

  latitude: number | null;
  longitude: number | null;

  location_type: string | null;
  water_type: string | null;
  water_body_size: string | null;
  wind_exposure: string | null;

  use_usgs_water_data: boolean | null;
  use_ndbc_data: boolean | null;

  distance_miles: number | null;

  window_stability: WindowRecommendationV2["stability"];
  window_reasons: string[];
  alternative_windows: WindowRecommendationV2["alternatives"];
  window_label: string;
};

export async function rankLocationCandidatesForExplore({
  admin,
  candidates,
  originLocation,
  activity,
  targetDates,
  preferences,
  obligations,
}: {
  admin?: any;
  candidates: LumoraLocationCandidate[];
  originLocation: CandidateOrigin;
  activity: string;
  targetDates: string[];
  preferences: Preferences;
  obligations: WeeklyObligation[];
}) {
  const rankings: ExploreLocationRanking[] = [];
  const weatherCache = new Map<string, Promise<WeatherBundle>>();

  for (const candidate of candidates) {
    if (candidate.latitude === null || candidate.longitude === null) {
      continue;
    }

    try {
      const { forecast, airQuality } = await getWeatherBundle({
        admin,
        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),
        weatherCache,
        });

      const days = aggregateDailyWeather(forecast, airQuality);

      for (const targetDate of targetDates) {
        const day = days.find((item) => item.date === targetDate);

        if (!day) continue;

        const base = scoreActivity(activity, day);
        const adjustment = applyPreferenceAdjustment(activity, day, preferences);

        const score = calibrateActivityScore({
          activity,
          day,
          score: base.score + adjustment,
        });

        const confidence = forecastConfidence(day.date, day);
        const planningScore = clampScore(score * 0.8 + confidence * 0.2);

        const windowRecommendation = getRecommendedWindowForActivity({
          activity,
          date: day.date,
          day,
          obligations,
        });

        const scoreComponents: ScoreComponents = {
            base_score: base.score,
            preference_adjustment: Math.round(adjustment),
            calibrated_score: score,
            planning_score: planningScore,
            forecast_confidence: confidence,
            window_score: windowRecommendation.windowScore,
            };

        const weatherSnapshot = buildWeatherSnapshot(day);

        let explanation = `${
          candidate.name ?? "This location"
        } scored ${score} for ${activity}. ${base.explanation}`;

        if (adjustment > 1) {
          explanation += ` Your preferences increased this score by ${Math.round(
            adjustment
          )} points.`;
        } else if (adjustment < -1) {
          explanation += ` Your preferences decreased this score by ${Math.abs(
            Math.round(adjustment)
          )} points.`;
        }

        if (candidate.location_type) {
          explanation += ` Location type: ${candidate.location_type}.`;
        }

        if (
          candidate.water_type &&
          candidate.water_type !== "Not applicable"
        ) {
          explanation += ` Water context: ${candidate.water_type}.`;
        }

        if (candidate.source !== "saved") {
          explanation += ` Source: ${
            candidate.external_source ?? candidate.source
          }.`;
        }

        if (windowRecommendation.windowScore > 0) {
          explanation += ` Suggested window: ${windowRecommendation.recommendedWindow}.`;
        } else {
          explanation +=
            " No clear open window was found around your saved schedule.";
        }

        const resultId = [
          candidate.source,
          candidate.source_id,
          activity,
          targetDate,
        ].join("-");

        rankings.push({
          result_id: resultId,
          source: candidate.source,

          location_id: candidate.saved_location_id,
          location_name: candidate.name,

          external_id: candidate.external_id ?? null,
          external_type: candidate.external_type ?? null,
          external_source: candidate.external_source ?? null,
          map_url: candidate.map_url ?? null,

          activity,
          date: targetDate,

          score,
          planning_score: planningScore,
          forecast_confidence: confidence,
          forecast_confidence_label: forecastConfidenceLabel(confidence),
          label: scoreLabel(score),
          
          score_components: scoreComponents,

          recommended_window: windowRecommendation.recommendedWindow,
          window_score: windowRecommendation.windowScore,

          window_stability: windowRecommendation.stability,
          window_reasons: windowRecommendation.reasons,
          alternative_windows: windowRecommendation.alternatives,
          window_label: windowRecommendation.windowLabel,

          explanation,
          weather_snapshot: weatherSnapshot,
          location_context: buildCandidateLocationContext(candidate),

          latitude: candidate.latitude,
          longitude: candidate.longitude,

          location_type: candidate.location_type,
          water_type: candidate.water_type,
          water_body_size: candidate.water_body_size,
          wind_exposure: candidate.wind_exposure,

          use_usgs_water_data: candidate.use_usgs_water_data,
          use_ndbc_data: candidate.use_ndbc_data,

          distance_miles: distanceFromOriginMiles(originLocation, candidate),

        });
      }
    } catch (error) {
      console.warn(
        `Could not rank candidate ${candidate.name ?? candidate.source_id}:`,
        error
      );
    }
  }

  return rankings.sort((a, b) => b.planning_score - a.planning_score);
}

export async function rankSavedLocationsForExplore({
  admin,
  locations,
  homeLocation,
  activity,
  targetDates,
  preferences,
  obligations,
}: {
  admin?: any;
  locations: SavedLocation[];
  homeLocation: SavedLocation | null;
  activity: string;
  targetDates: string[];
  preferences: Preferences;
  obligations: WeeklyObligation[];
}) {
  return rankLocationCandidatesForExplore({
    admin,
    candidates: savedLocationsToCandidates(locations),
    originLocation: homeLocation,
    activity,
    targetDates,
    preferences,
    obligations,
  });
}