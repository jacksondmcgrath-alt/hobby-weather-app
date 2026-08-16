import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/45 p-5 shadow-xl shadow-slate-950/25 backdrop-blur-sm sm:p-6">
      <div className="pointer-events-none absolute right-[-6rem] top-[-7rem] h-56 w-56 rounded-full bg-[rgb(var(--brand-rgb)_/_0.13)] blur-3xl" />
      <div className="pointer-events-none absolute left-[-7rem] bottom-[-8rem] h-60 w-60 rounded-full bg-[rgb(var(--brand-warm-rgb)_/_0.10)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow && (
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
              {eyebrow}
            </div>
          )}

          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              {description}
            </p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm leading-6 text-slate-300">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/90 p-5 shadow-xl shadow-slate-950/35 backdrop-blur-sm ${
        hover ? "transition hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900" : ""
      } ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgb(var(--brand-rgb)_/_0.06),transparent_34%)]" />

      <div className="relative">
        {children}
      </div>
    </section>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-700/70 bg-white/[0.045] p-4 shadow-sm shadow-slate-950/20 ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative">
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  type = "button",
  onClick,
  disabled = false,
  variant = "primary",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const styles = {
    primary:
      "bg-[rgb(var(--brand-rgb))] text-[#030716] shadow-lg shadow-[rgb(var(--brand-rgb)_/_0.20)] hover:bg-[rgb(var(--brand-soft-rgb))]",
    secondary:
      "border border-slate-700 bg-slate-800/90 text-white shadow-sm shadow-slate-950/20 hover:border-slate-600 hover:bg-slate-700",
    danger:
      "bg-red-600 text-white shadow-lg shadow-red-950/20 hover:bg-red-500",
    ghost:
      "border border-white/5 bg-white/5 text-slate-200 hover:border-white/10 hover:bg-white/10 hover:text-white",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-rgb)_/_0.75)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030716] disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function StatusMessage({
  type,
  children,
}: {
  type: "success" | "error" | "info" | "warning";
  children: ReactNode;
}) {
  const styles = {
    success: "border-green-700/50 bg-green-950/50 text-green-200",
    error: "border-red-700/50 bg-red-950/50 text-red-200",
    info: "border-slate-700 bg-slate-800/80 text-slate-300",
    warning: "border-amber-700/50 bg-amber-950/50 text-amber-200",
  };

  return (
    <div className={`mt-4 rounded-xl border p-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "good" | "info" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    good: "bg-green-600 text-white",
    info: "bg-[rgb(var(--brand-rgb))] text-[#030716]",
    warning: "bg-amber-500 text-slate-950",
    danger: "bg-red-600 text-white",
    neutral: "bg-slate-700 text-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function ScoreBadge({
  score,
  label,
  size = "md",
}: {
  score: number | null | undefined;
  label?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const numericScore = score ?? null;

  let styles = "bg-slate-700 text-slate-200";
  let defaultLabel = "Unknown";

  if (numericScore !== null) {
    if (numericScore >= 80) {
      styles = "bg-green-500 text-slate-950";
      defaultLabel = "Great";
    } else if (numericScore >= 65) {
      styles = "bg-[rgb(var(--brand-rgb))] text-[#030716]";
      defaultLabel = "Good";
    } else if (numericScore >= 50) {
      styles = "bg-amber-400 text-slate-950";
      defaultLabel = "Okay";
    } else if (numericScore >= 35) {
      styles = "bg-orange-500 text-white";
      defaultLabel = "Poor";
    } else {
      styles = "bg-red-600 text-white";
      defaultLabel = "Bad";
    }
  }

  const sizes = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full font-black shadow-lg shadow-slate-950/20 ${sizes[size]} ${styles}`}
    >
      <span className="tabular-nums">
        {numericScore ?? "?"}
      </span>

      <span className="font-bold">
        {label ?? defaultLabel}
      </span>
    </div>
  );
}

export function ConfidenceBadge({
  confidence,
  label,
}: {
  confidence?: number | null;
  label?: string | null;
}) {
  const normalizedLabel = label ?? "Unknown";

  let styles = "bg-slate-700 text-slate-200";

  if (confidence !== null && confidence !== undefined) {
    if (confidence >= 75 || normalizedLabel.toLowerCase().includes("high")) {
      styles = "bg-green-600 text-white";
    } else if (
      confidence >= 55 ||
      normalizedLabel.toLowerCase().includes("solid") ||
      normalizedLabel.toLowerCase().includes("medium")
    ) {
      styles = "bg-sky-500 text-white";
    } else {
      styles = "bg-orange-500 text-white";
    }
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles}`}
    >
      Confidence: {normalizedLabel}
    </span>
  );
}

export function WeatherStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-white/[0.04] px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>

      <div className="mt-1 text-sm font-bold text-white">
        {value}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-3xl font-black tracking-tight text-white tabular-nums">
        {value}
      </div>

      <div className="mt-1 text-sm font-medium text-slate-300">
        {label}
      </div>

      {hint && (
        <div className="mt-2 text-xs text-slate-500">
          {hint}
        </div>
      )}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 p-6 text-center">
      <h3 className="text-lg font-semibold text-white">
        {title}
      </h3>

      {description && (
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-300">
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Divider() {
  return <div className="my-5 h-px bg-slate-800" />;
}

export function Callout({
  title,
  children,
  type = "info",
  action,
}: {
  title?: string;
  children: ReactNode;
  type?: "info" | "success" | "warning" | "danger";
  action?: ReactNode;
}) {
  const styles = {
    info: "border-sky-500/20 bg-sky-500/10 text-sky-100",
    success: "border-green-500/20 bg-green-500/10 text-green-100",
    warning: "border-amber-500/25 bg-amber-500/10 text-amber-100",
    danger: "border-red-500/25 bg-red-500/10 text-red-100",
  };

  return (
    <div className={`rounded-2xl border p-4 ${styles[type]}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {title && (
            <div className="font-semibold text-white">
              {title}
            </div>
          )}

          <div className={title ? "mt-1 text-sm leading-6" : "text-sm leading-6"}>
            {children}
          </div>
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

function clampMetric(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function formatSignedPoints(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  const rounded = Math.round(Number(value));

  if (rounded > 0) return `+${rounded} pts`;
  if (rounded < 0) return `${rounded} pts`;
  return "0 pts";
}

function personalImpactLabel(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Unknown";
  }

  const rounded = Math.round(Number(value));

  if (rounded >= 2) return "Boost";
  if (rounded <= -2) return "Caution";
  return "Neutral";
}

function personalImpactStyles(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "border-slate-700 bg-slate-800/80 text-slate-300";
  }

  const rounded = Math.round(Number(value));

  if (rounded >= 2) {
    return "border-[rgb(var(--brand-warm-soft-rgb)_/_0.35)] bg-[rgb(var(--brand-warm-rgb)_/_0.14)] text-[rgb(var(--brand-warm-soft-rgb))]";
  }

  if (rounded <= -2) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  return "border-slate-700 bg-white/[0.05] text-slate-300";
}

export function LumoraScoreBar({
  label,
  score,
  caption,
  size = "md",
}: {
  label: string;
  score: number | null | undefined;
  caption?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const normalized = clampMetric(score);

  const sizes = {
    sm: {
      number: "text-2xl",
      bar: "h-1.5",
      label: "text-[11px]",
    },
    md: {
      number: "text-4xl",
      bar: "h-2",
      label: "text-xs",
    },
    lg: {
      number: "text-5xl",
      bar: "h-2.5",
      label: "text-xs",
    },
  };

  const activeSize = sizes[size];

  const meterProps =
    normalized !== null
      ? {
          role: "meter" as const,
          "aria-label": label,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": normalized,
        }
      : {
          role: "img" as const,
          "aria-label": `${label}: not available`,
        };

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div
            className={`${activeSize.label} font-bold uppercase tracking-[0.22em] text-slate-500`}
          >
            {label}
          </div>

          {caption && (
            <div className="mt-1 text-sm text-slate-300">
              {caption}
            </div>
          )}
        </div>

        <div
          className={`${activeSize.number} shrink-0 font-black leading-none tracking-tight text-white tabular-nums`}
        >
          {normalized ?? "—"}
        </div>
      </div>

      <div
        {...meterProps}
        className={`relative mt-3 overflow-hidden rounded-full bg-slate-800/90 ${activeSize.bar}`}
      >
        {normalized !== null ? (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(15_23_42),rgb(30_41_59),rgb(67_56_202),rgb(142_167_255),rgb(183_167_255),rgb(255_170_138),rgb(255_226_160))]" />

            <div
              className="absolute inset-y-0 right-0 bg-slate-950/95"
              style={{
                width: `${100 - normalized}%`,
              }}
            />

            <div className="absolute inset-0 bg-white/10 mix-blend-soft-light" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(30_41_59),rgb(51_65_85))]" />
        )}
      </div>
    </div>
  );
}

export function PersonalImpactChip({
  value,
}: {
  value: number | null | undefined;
}) {
  const label = personalImpactLabel(value);
  const display = formatSignedPoints(value);

  const accessibleLabel =
    value === null || value === undefined || !Number.isFinite(Number(value))
      ? "Personal impact not available"
      : `Personal impact: ${display}${label ? `, ${label}` : ""}`;

  return (
    <span
      aria-label={accessibleLabel}
      title="Effect of your preferences on this score"
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold ${personalImpactStyles(
        value
      )}`}
    >
      <span className="tabular-nums">
        {display}
      </span>

      {label && (
        <span className="text-[10px] uppercase tracking-wide opacity-85">
          {label}
        </span>
      )}
    </span>
  );
}

export type DecisionStripItem = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: "window" | "personal" | "stability" | "neutral";
};

export function DecisionStrip({
  items,
  mobilePriority,
}: {
  items: DecisionStripItem[];
  mobilePriority?: "first";
}) {
  const accents = {
    window:
      "from-[rgb(var(--brand-soft-rgb)_/_0.52)] to-[rgb(var(--brand-rgb)_/_0.20)]",
    personal:
      "from-[rgb(var(--brand-warm-rgb)_/_0.50)] to-[rgb(var(--brand-warm-soft-rgb)_/_0.20)]",
    stability: "from-sky-300/45 to-[rgb(var(--brand-rgb)_/_0.18)]",
    neutral: "from-slate-500/40 to-slate-700/20",
  };

  return (
    <div
      className={`grid overflow-hidden rounded-2xl bg-slate-950/45 shadow-inner shadow-slate-950/30 ${
        mobilePriority === "first" ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-3"
      }`}
    >
      {items.map((item, index) => {
        const firstPriority = mobilePriority === "first" && index === 0;

        return (
          <div
            key={`${item.label}-${index}`}
            className={`relative min-w-0 p-4 ${
              firstPriority ? "col-span-2 sm:col-span-1" : ""
            } ${
              index > 0
                ? "border-t border-white/5 sm:border-l sm:border-t-0"
                : ""
            } ${
              mobilePriority === "first" && index === 2
                ? "border-l border-white/5 sm:border-l"
                : ""
            }`}
          >
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${
                accents[item.accent ?? "neutral"]
              }`}
            />

            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {item.label}
            </div>

            <div className="mt-2 break-words text-sm font-bold text-white">
              {item.value}
            </div>

            {item.detail && (
              <div className="mt-1 break-words text-xs leading-5 text-slate-400">
                {item.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}