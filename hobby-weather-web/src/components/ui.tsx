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
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
      className={`rounded-2xl border border-slate-800/80 bg-slate-900/95 p-5 shadow-xl shadow-slate-950/30 ${
        hover ? "transition hover:-translate-y-0.5 hover:border-slate-700" : ""
      } ${className}`}
    >
      {children}
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
      className={`rounded-xl border border-slate-700/70 bg-white/[0.04] p-4 ${className}`}
    >
      {children}
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
        "bg-[rgb(var(--brand-rgb))] text-[#030716] shadow-lg shadow-[rgb(var(--brand-rgb)_/_0.22)] hover:bg-[rgb(var(--brand-soft-rgb))]",
    secondary:
        "bg-slate-800 text-white hover:bg-slate-700",
    danger:
        "bg-red-600 text-white shadow-lg shadow-red-950/20 hover:bg-red-500",
    ghost:
        "bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white",
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
      className={`rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${styles[variant]} ${className}`}
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
    if (confidence >= 0.75 || normalizedLabel.toLowerCase().includes("high")) {
      styles = "bg-green-600 text-white";
    } else if (
      confidence >= 0.45 ||
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