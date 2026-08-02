import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header>
      <h1 className="text-3xl font-bold tracking-tight text-white">
        {title}
      </h1>

      {description && (
        <p className="mt-2 max-w-3xl text-slate-300">
          {description}
        </p>
      )}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow ${className}`}
    >
      {children}
    </section>
  );
}

export function Button({
  children,
  type = "button",
  onClick,
  disabled = false,
  variant = "primary",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-blue-500 text-white hover:bg-blue-400",
    secondary: "bg-slate-700 text-white hover:bg-slate-600",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function StatusMessage({
  type,
  children,
}: {
  type: "success" | "error" | "info";
  children: ReactNode;
}) {
  const styles = {
    success: "bg-green-900/50 text-green-200",
    error: "bg-red-900/50 text-red-200",
    info: "bg-slate-800 text-slate-300",
  };

  return (
    <div className={`mt-4 rounded-lg p-3 ${styles[type]}`}>
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
    info: "bg-blue-500 text-white",
    warning: "bg-orange-500 text-white",
    danger: "bg-red-600 text-white",
    neutral: "bg-slate-700 text-slate-200",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles[variant]}`}
    >
      {children}
    </span>
  );
}