export type WindowStability =
  | "stable"
  | "variable"
  | "uncertain"
  | "unavailable";

export type AlternativeWindow = {
  recommendedWindow: string;
  windowScore: number;
  startHour: number;
  endHour: number;
  stability: WindowStability;
};

export type WindowRecommendationContext = {
  recommendedWindow: string;
  windowScore: number;
  startHour: number | null;
  endHour: number | null;
  durationHours: number;
  stability: WindowStability;
  reasons: string[];
  alternatives: AlternativeWindow[];
  windowLabel: string;
};