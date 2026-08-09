export type ForecastFreshnessStatus =
  | "fresh"
  | "aging"
  | "stale"
  | "missing"
  | "unknown";

export function formatForecastFreshness(generatedAt: string | null) {
  if (!generatedAt) {
    return "Recommendations have not been generated yet.";
  }

  const generatedDate = new Date(generatedAt);

  if (Number.isNaN(generatedDate.getTime())) {
    return "Recommendation update time is unavailable.";
  }

  const now = new Date();
  const diffMs = now.getTime() - generatedDate.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return "Recommendations updated just now.";
  }

  if (diffMinutes < 60) {
    return `Recommendations updated ${diffMinutes} minute${
      diffMinutes === 1 ? "" : "s"
    } ago.`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `Recommendations updated ${diffHours} hour${
      diffHours === 1 ? "" : "s"
    } ago.`;
  }

  return `Recommendations updated ${generatedDate.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    }
  )} at ${generatedDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}.`;
}

export function getForecastFreshnessStatus(
  generatedAt: string | null
): ForecastFreshnessStatus {
  if (!generatedAt) {
    return "missing";
  }

  const generatedDate = new Date(generatedAt);

  if (Number.isNaN(generatedDate.getTime())) {
    return "unknown";
  }

  const diffMs = Date.now() - generatedDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 3) {
    return "fresh";
  }

  if (diffHours <= 12) {
    return "aging";
  }

  return "stale";
}