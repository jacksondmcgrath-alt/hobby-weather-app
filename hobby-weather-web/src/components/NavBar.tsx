"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MAIN_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/planner", label: "Planner" },
  { href: "/logs", label: "Logs" },
  { href: "/scenarios", label: "Scenarios" },
];

const MORE_NAV_ITEMS = [
  { href: "/locations", label: "Locations" },
  { href: "/activity-defaults", label: "Activity Defaults" },
  { href: "/schedule", label: "Schedule" },
  { href: "/plans", label: "Plans" },
  { href: "/preferences", label: "Preferences" },
  { href: "/exports", label: "Exports" },
  { href: "/analytics", label: "Analytics" },
  { href: "/profile", label: "Profile" },
];

export function NavBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : pathname.startsWith(href);
  }

  const moreIsActive = MORE_NAV_ITEMS.some((item) => isActive(item.href));

  return (
    <nav className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="block">
          <div className="text-sm font-bold text-white">
            🌤️ Hobby Weather
          </div>
          <div className="text-xs text-slate-400">
            Planner & activity logger
          </div>
        </Link>

        <div className="flex flex-wrap gap-2">
          {MAIN_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((current) => !current)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                moreIsActive
                  ? "bg-blue-500 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              More ▾
            </button>

            {moreOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
                {MORE_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`block rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      isActive(item.href)
                        ? "bg-blue-500 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-blue-500 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}