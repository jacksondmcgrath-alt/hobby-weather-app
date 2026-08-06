"use client";

import type { CSSProperties, ReactNode } from "react";
import { NavBar } from "@/components/NavBar";

type CSSVariableStyle = CSSProperties & Record<`--${string}`, string>;

const lumoraVariables: CSSVariableStyle = {
  "--brand-rgb": "142 167 255", // periwinkle
  "--brand-soft-rgb": "183 167 255", // soft violet
  "--brand-warm-rgb": "255 107 95", // coral
  "--brand-warm-soft-rgb": "255 170 138", // peach
  "--brand-mint-rgb": "121 225 204", // mint

  // Temporary compatibility with existing components/pages that still use these names.
  "--season-rgb": "142 167 255",
  "--season-soft-rgb": "255 170 138",
};

export function AppShell({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <main
      style={lumoraVariables}
      className="min-h-screen bg-[#030716] text-white"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Deep base atmosphere */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgb(38_50_143/0.34),transparent_34%),radial-gradient(circle_at_78%_32%,rgb(142_167_255/0.16),transparent_30%),radial-gradient(circle_at_18%_78%,rgb(255_107_95/0.10),transparent_30%)]" />

        {/* Forecast-layer inspired glows */}
        <div className="absolute left-1/2 top-[-16rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-[rgb(var(--brand-rgb)_/_0.18)] blur-[150px]" />

        <div className="absolute right-[-10rem] top-[20%] h-[34rem] w-[34rem] rounded-full bg-[rgb(var(--brand-soft-rgb)_/_0.16)] blur-[140px]" />

        <div className="absolute bottom-[-12rem] left-[-8rem] h-[36rem] w-[36rem] rounded-full bg-[rgb(var(--brand-warm-rgb)_/_0.12)] blur-[150px]" />

        <div className="absolute left-[46%] top-[54%] h-[24rem] w-[24rem] rounded-full bg-[rgb(var(--brand-warm-soft-rgb)_/_0.10)] blur-[130px]" />

        {/* Very subtle contour-like bands */}
        <div className="absolute inset-x-[-10%] top-[18%] h-40 rotate-[-4deg] rounded-[100%] border-t border-[rgb(var(--brand-rgb)_/_0.12)]" />
        <div className="absolute inset-x-[-12%] top-[30%] h-44 rotate-[3deg] rounded-[100%] border-t border-[rgb(var(--brand-soft-rgb)_/_0.10)]" />
        <div className="absolute inset-x-[-10%] top-[48%] h-48 rotate-[-2deg] rounded-[100%] border-t border-[rgb(var(--brand-rgb)_/_0.08)]" />
        <div className="absolute inset-x-[-14%] top-[66%] h-44 rotate-[4deg] rounded-[100%] border-t border-[rgb(var(--brand-warm-rgb)_/_0.08)]" />

        {/* Readability overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(3_7_22/0.52),rgb(3_7_22/0.82)_45%,rgb(3_7_22/0.96))]" />

        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgb(3_7_22/0.22)_62%,rgb(3_7_22/0.82)_100%)]" />
      </div>

      <div className="relative px-4 py-3 sm:px-6 sm:py-5 lg:px-8">
        <div className={`mx-auto ${maxWidth}`}>
          <NavBar />

          <div className="pb-10">{children}</div>
        </div>
      </div>
    </main>
  );
}