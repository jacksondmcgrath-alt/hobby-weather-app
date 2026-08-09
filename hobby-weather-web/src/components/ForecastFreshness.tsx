import {
  formatForecastFreshness,
  getForecastFreshnessStatus,
  type ForecastFreshnessStatus,
} from "@/lib/forecastFreshness";

export function ForecastFreshness({
  generatedAt,
}: {
  generatedAt: string | null;
}) {
  const status = getForecastFreshnessStatus(generatedAt);

  const styles: Record<ForecastFreshnessStatus, string> = {
    fresh: "border-green-500/20 bg-green-500/10 text-green-200",
    aging: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    stale: "border-orange-500/20 bg-orange-500/10 text-orange-200",
    missing: "border-slate-700 bg-white/[0.04] text-slate-300",
    unknown: "border-slate-700 bg-white/[0.04] text-slate-300",
  };

  return (
    <div
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {formatForecastFreshness(generatedAt)}
    </div>
  );
}