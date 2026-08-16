"use client";

import type { CSSProperties, ReactNode } from "react";
import { NavBar } from "@/components/NavBar";

type CSSVariableStyle = CSSProperties & Record<`--${string}`, string>;

const lumoraVariables: CSSVariableStyle = {
  "--brand-rgb": "142 167 255",
  "--brand-soft-rgb": "183 167 255",
  "--brand-warm-rgb": "255 107 95",
  "--brand-warm-soft-rgb": "255 170 138",
  "--brand-mint-rgb": "121 225 204",

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
      className="min-h-screen bg-[#030716] text-white selection:bg-[rgb(var(--brand-rgb)_/_0.35)] selection:text-white"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-slate-950"
      >
        Skip to content
      </a>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#030716]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgb(38_50_143/0.42),transparent_34%),radial-gradient(circle_at_82%_24%,rgb(142_167_255/0.18),transparent_28%),radial-gradient(circle_at_18%_80%,rgb(255_107_95/0.13),transparent_32%)]" />

        <div className="absolute left-1/2 top-[-18rem] h-[48rem] w-[48rem] -translate-x-1/2 rounded-full bg-[rgb(var(--brand-rgb)_/_0.20)] blur-[160px]" />

        <div className="absolute right-[-12rem] top-[18%] h-[38rem] w-[38rem] rounded-full bg-[rgb(var(--brand-soft-rgb)_/_0.18)] blur-[150px]" />

        <div className="absolute bottom-[-14rem] left-[-10rem] h-[40rem] w-[40rem] rounded-full bg-[rgb(var(--brand-warm-rgb)_/_0.14)] blur-[160px]" />

        <div className="absolute left-[44%] top-[58%] h-[26rem] w-[26rem] rounded-full bg-[rgb(var(--brand-warm-soft-rgb)_/_0.10)] blur-[140px]" />

        <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:44px_44px]" />

        <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(circle_at_center,rgb(255_255_255)_1px,transparent_1px)] [background-size:18px_18px]" />

        <div className="absolute inset-x-[-10%] top-[18%] h-40 rotate-[-4deg] rounded-[100%] border-t border-[rgb(var(--brand-rgb)_/_0.12)]" />
        <div className="absolute inset-x-[-12%] top-[31%] h-44 rotate-[3deg] rounded-[100%] border-t border-[rgb(var(--brand-soft-rgb)_/_0.10)]" />
        <div className="absolute inset-x-[-10%] top-[50%] h-48 rotate-[-2deg] rounded-[100%] border-t border-[rgb(var(--brand-rgb)_/_0.08)]" />
        <div className="absolute inset-x-[-14%] top-[68%] h-44 rotate-[4deg] rounded-[100%] border-t border-[rgb(var(--brand-warm-rgb)_/_0.08)]" />

        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(3_7_22/0.48),rgb(3_7_22/0.82)_46%,rgb(3_7_22/0.98))]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgb(3_7_22/0.20)_58%,rgb(3_7_22/0.86)_100%)]" />
      </div>

      <div className="relative px-4 py-3 sm:px-6 sm:py-5 lg:px-8">
        <div className={`mx-auto ${maxWidth}`}>
          <NavBar />

          <div id="main-content" className="pb-12">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}