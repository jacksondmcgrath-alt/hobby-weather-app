"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";

type TimeMode = "morning" | "day" | "evening" | "night";
type SeasonMode = "spring" | "summer" | "fall" | "winter";

type CSSVariableStyle = CSSProperties & Record<`--${string}`, string>;

function getTimeMode(): TimeMode {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 10) {
    return "morning";
  }

  if (hour >= 10 && hour < 17) {
    return "day";
  }

  if (hour >= 17 && hour < 21) {
    return "evening";
  }

  return "night";
}

function getSeasonMode(): SeasonMode {
  const month = new Date().getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return "spring";
  }

  if (month >= 6 && month <= 8) {
    return "summer";
  }

  if (month >= 9 && month <= 11) {
    return "fall";
  }

  return "winter";
}

const TIME_MODE_STYLES: Record<
  TimeMode,
  {
    background: string;
    mainGlow: string;
    skyGlow: string;
    horizonGlow: string;
    overlay: string;
  }
> = {
  morning: {
    background: "bg-slate-950",
    mainGlow: "bg-sky-300/30",
    skyGlow: "bg-cyan-300/20",
    horizonGlow: "bg-blue-400/15",
    overlay:
      "bg-gradient-to-b from-sky-900/60 via-slate-950/78 to-slate-950",
  },
  day: {
    background: "bg-sky-950",
    mainGlow: "bg-sky-400/35",
    skyGlow: "bg-cyan-300/25",
    horizonGlow: "bg-blue-500/15",
    overlay:
      "bg-gradient-to-b from-sky-800/60 via-slate-950/78 to-slate-950",
  },
  evening: {
    background: "bg-slate-950",
    mainGlow: "bg-indigo-400/22",
    skyGlow: "bg-purple-500/16",
    horizonGlow: "bg-orange-400/18",
    overlay:
      "bg-gradient-to-b from-indigo-950/72 via-slate-950/82 to-slate-950",
  },
  night: {
    background: "bg-slate-950",
    mainGlow: "bg-blue-500/18",
    skyGlow: "bg-indigo-500/16",
    horizonGlow: "bg-cyan-500/12",
    overlay:
      "bg-gradient-to-b from-slate-950/92 via-slate-950/86 to-blue-950/45",
  },
};

const SEASON_MODE_STYLES: Record<
  SeasonMode,
  {
    name: string;
    rgb: string;
    softRgb: string;
  }
> = {
  spring: {
    name: "Spring",
    rgb: "16 185 129",
    softRgb: "110 231 183",
  },
  summer: {
    name: "Summer",
    rgb: "250 204 21",
    softRgb: "253 224 71",
  },
  fall: {
    name: "Fall",
    rgb: "249 115 22",
    softRgb: "248 113 113",
  },
  winter: {
    name: "Winter",
    rgb: "226 232 240",
    softRgb: "186 230 253",
  },
};

export function AppShell({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  const [timeMode, setTimeMode] = useState<TimeMode>("night");
  const [seasonMode, setSeasonMode] = useState<SeasonMode>("winter");

  useEffect(() => {
    function updateModes() {
      setTimeMode(getTimeMode());
      setSeasonMode(getSeasonMode());
    }

    updateModes();

    const interval = window.setInterval(updateModes, 5 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const timeStyles = TIME_MODE_STYLES[timeMode];
  const seasonStyles = SEASON_MODE_STYLES[seasonMode];

  const seasonalVariables: CSSVariableStyle = {
    "--season-rgb": seasonStyles.rgb,
    "--season-soft-rgb": seasonStyles.softRgb,
    "--season-name": `"${seasonStyles.name}"`,
  };

  return (
    <main
      style={seasonalVariables}
      data-time-mode={timeMode}
      data-season-mode={seasonMode}
      className={`min-h-screen text-white transition-colors duration-700 ${timeStyles.background}`}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Time-of-day sky glow */}
        <div
          className={`absolute left-1/2 top-[-14rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full blur-[130px] ${timeStyles.mainGlow}`}
        />

        <div
          className={`absolute left-[5%] top-[42%] h-[28rem] w-[28rem] rounded-full blur-[130px] ${timeStyles.skyGlow}`}
        />

        <div
          className={`absolute right-[10%] bottom-[4%] h-[26rem] w-[26rem] rounded-full blur-[130px] ${timeStyles.horizonGlow}`}
        />

        {/* Seasonal accent glow */}
        <div className="absolute right-[-8rem] top-[16%] h-[36rem] w-[36rem] rounded-full bg-[rgb(var(--season-rgb)/0.28)] blur-[140px]" />

        <div className="absolute bottom-[-10rem] left-[-8rem] h-[34rem] w-[34rem] rounded-full bg-[rgb(var(--season-soft-rgb)/0.16)] blur-[140px]" />

        <div className="absolute left-[48%] top-[62%] h-[22rem] w-[22rem] rounded-full bg-[rgb(var(--season-rgb)/0.10)] blur-[120px]" />

        {/* Morning/day soft cloud forms */}
        {(timeMode === "morning" || timeMode === "day") && (
          <div className="absolute inset-0 opacity-35">
            <div className="absolute left-[6%] top-[16%] h-20 w-56 rounded-full bg-white/20 blur-2xl" />
            <div className="absolute left-[14%] top-[19%] h-12 w-40 rounded-full bg-white/20 blur-2xl" />
            <div className="absolute left-[22%] top-[17%] h-10 w-32 rounded-full bg-white/10 blur-2xl" />

            <div className="absolute right-[7%] top-[27%] h-16 w-60 rounded-full bg-white/16 blur-2xl" />
            <div className="absolute right-[17%] top-[31%] h-12 w-40 rounded-full bg-white/16 blur-2xl" />

            <div className="absolute left-[44%] top-[10%] h-12 w-44 rounded-full bg-white/12 blur-2xl" />
          </div>
        )}

        {/* Evening horizon warmth */}
        {timeMode === "evening" && (
          <>
            <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-orange-500/16 via-purple-500/8 to-transparent" />
            <div className="absolute bottom-[12%] left-1/2 h-24 w-[42rem] -translate-x-1/2 rounded-full bg-orange-300/10 blur-[90px]" />
          </>
        )}

        {/* Night stars */}
        {timeMode === "night" && (
          <div className="absolute inset-0 opacity-45">
            <div className="absolute left-[12%] top-[18%] h-1 w-1 rounded-full bg-white/80" />
            <div className="absolute left-[28%] top-[32%] h-0.5 w-0.5 rounded-full bg-white/70" />
            <div className="absolute left-[46%] top-[14%] h-1 w-1 rounded-full bg-white/60" />
            <div className="absolute right-[18%] top-[24%] h-1 w-1 rounded-full bg-white/70" />
            <div className="absolute right-[34%] top-[42%] h-0.5 w-0.5 rounded-full bg-white/60" />
            <div className="absolute bottom-[26%] left-[18%] h-0.5 w-0.5 rounded-full bg-white/60" />
            <div className="absolute bottom-[34%] right-[22%] h-1 w-1 rounded-full bg-white/50" />
            <div className="absolute bottom-[16%] right-[44%] h-0.5 w-0.5 rounded-full bg-white/50" />
            <div className="absolute left-[62%] top-[52%] h-1 w-1 rounded-full bg-white/40" />
          </div>
        )}

        {/* Readability layer */}
        <div className={`absolute inset-0 ${timeStyles.overlay}`} />

        {/* Very subtle vignette so edges feel natural */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgb(2_6_23/0.25)_72%,rgb(2_6_23/0.72)_100%)]" />
      </div>

      <div className="relative px-4 py-3 sm:px-6 sm:py-5 lg:px-8">
        <div className={`mx-auto ${maxWidth}`}>
          <NavBar />

          <div className="pb-10">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}