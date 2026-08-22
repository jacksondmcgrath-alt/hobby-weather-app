import type {
  WindowRecommendationContext,
  WindowStability,
} from "@/lib/predictions/windowTypes";

function formatWindowStability(
  stability: WindowStability | null | undefined
) {
  if (stability === "stable") return "Stable";
  if (stability === "variable") return "Variable";
  if (stability === "uncertain") return "Uncertain";
  return "Not available";
}

function getValidReasons(
  recommendation: WindowRecommendationContext | null | undefined
) {
  if (!Array.isArray(recommendation?.reasons)) {
    return [];
  }

  return recommendation.reasons.filter(
    (reason): reason is string =>
      typeof reason === "string" && reason.trim() !== ""
  );
}

export function WindowReasonChips({
  recommendation,
}: {
  recommendation: WindowRecommendationContext | null | undefined;
}) {
  const reasons = getValidReasons(recommendation);

  if (reasons.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {reasons.map((reason, index) => (
        <span
          key={`${reason}-${index}`}
          className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/[0.055]"
        >
          {reason}
        </span>
      ))}
    </div>
  );
}

export function WindowDetails({
  recommendation,
  showAlternatives = true,
  summary = "Window details",
  className = "",
}: {
  recommendation: WindowRecommendationContext | null | undefined;
  showAlternatives?: boolean;
  summary?: string;
  className?: string;
}) {
  const reasons = getValidReasons(recommendation);

  const alternatives =
    showAlternatives && Array.isArray(recommendation?.alternatives)
      ? recommendation.alternatives
      : [];

  if (reasons.length === 0 && alternatives.length === 0) {
    return null;
  }

  return (
    <details
      className={`rounded-xl bg-slate-950/45 p-3 text-sm text-slate-300 ring-1 ring-white/[0.055] ${className}`}
    >
      <summary className="cursor-pointer font-semibold text-white">
        {summary}
      </summary>

      <div className="mt-4 grid gap-4">
        {reasons.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Why this window
            </div>

            <div className="mt-2">
              <WindowReasonChips recommendation={recommendation} />
            </div>
          </div>
        )}

        {alternatives.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Other workable windows
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {alternatives.map((alternative, index) => (
                <div
                  key={`${alternative.startHour}-${alternative.endHour}-${index}`}
                  className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.05]"
                >
                  <div className="font-semibold text-white">
                    {alternative.recommendedWindow}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>Window score {alternative.windowScore}</span>
                    <span>
                      {formatWindowStability(alternative.stability)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Alternatives are informational for now. Saving this
              recommendation uses the best window shown above.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}