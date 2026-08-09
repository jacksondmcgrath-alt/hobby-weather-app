import {
  clampScore,
  type DailyWeather,
} from "@/lib/predictions/scoringProfiles";
import { todayString } from "@/lib/server/lumora/dates";

export function scoreLabel(score: number) {
  if (score >= 95) return "Exceptional";
  if (score >= 85) return "Great";
  if (score >= 70) return "Good";
  if (score >= 55) return "Okay";
  if (score >= 40) return "Marginal";
  return "Poor";
}

export function forecastConfidence(date: string, day: DailyWeather) {
  const today = new Date(todayString());
  const forecastDate = new Date(`${date}T12:00:00`);

  const daysOut = Math.round(
    (forecastDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  let leadScore = 40;

  if (daysOut <= 0) leadScore = 95;
  else if (daysOut === 1) leadScore = 90;
  else if (daysOut === 2) leadScore = 82;
  else if (daysOut === 3) leadScore = 74;
  else if (daysOut === 4) leadScore = 65;
  else if (daysOut === 5) leadScore = 58;
  else if (daysOut === 6) leadScore = 52;
  else if (daysOut === 7) leadScore = 47;

  let complexityScore = 100;

  if (day.rainChance >= 30 && day.rainChance <= 70) {
    complexityScore -= 15;
  } else if (day.rainChance > 70) {
    complexityScore -= 10;
  }

  if (day.windMax >= 18) complexityScore -= 10;
  if (day.gustMax >= 25) complexityScore -= 10;
  if (day.stormSafety < 60) complexityScore -= 20;

  return clampScore(leadScore * 0.75 + complexityScore * 0.25);
}

export function forecastConfidenceLabel(score: number) {
  if (score >= 85) return "High confidence";
  if (score >= 70) return "Solid";
  if (score >= 55) return "Watch closely";
  if (score >= 40) return "Uncertain";
  return "Very uncertain";
}