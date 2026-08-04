"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/useUser";

const USER_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/planner", label: "Planner" },
  { href: "/plans", label: "Plans" },
  { href: "/logs", label: "Logs" },
  { href: "/scenarios", label: "Scenarios" },
];

const PUBLIC_NAV_ITEMS = [{ href: "/", label: "Home" }];

const SETUP_NAV_ITEMS = [
  { href: "/locations", label: "Locations" },
  { href: "/activity-defaults", label: "Default Locations" },
  { href: "/schedule", label: "Schedule" },
  { href: "/preferences", label: "Preferences" },
  { href: "/profile", label: "Profile" },
];

const ADMIN_NAV_ITEMS = [
  { href: "/analytics", label: "Analytics" },
  { href: "/exports", label: "Exports" },
];

function isAdminEmail(email: string | undefined) {
  if (!email) return false;

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase());
}

export function NavBar() {
  const pathname = usePathname();
  const { user, authLoading } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = isAdminEmail(user?.email);
  const navItems = user ? USER_NAV_ITEMS : PUBLIC_NAV_ITEMS;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  const setupIsActive = SETUP_NAV_ITEMS.some((item) => isActive(item.href));
  const adminIsActive = ADMIN_NAV_ITEMS.some((item) => isActive(item.href));
  const menuIsActive = setupIsActive || adminIsActive;

  return (
    <nav className="sticky top-3 z-40 mb-6 rounded-2xl border border-slate-800/80 bg-slate-950/85 px-3 py-2 shadow-xl shadow-slate-950/40 backdrop-blur-xl">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="group flex min-w-0 shrink-0 items-center gap-2 rounded-xl px-1 py-1"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[rgb(var(--season-rgb)_/_0.30)] bg-[rgb(var(--season-rgb)_/_0.10)] text-xs font-black tracking-tight text-white shadow-[0_0_16px_rgb(var(--season-rgb)_/_0.12)] transition group-hover:bg-[rgb(var(--season-rgb)_/_0.16)]">
              HW
            </div>

            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-bold tracking-tight text-white transition group-hover:text-[rgb(var(--season-soft-rgb))]">
                Hobby Weather
              </div>

              <div className="hidden text-[11px] text-slate-400 sm:block">
                Forecasts for better plans
              </div>
            </div>
          </Link>

          {!authLoading && user && (
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm font-semibold transition md:hidden ${
                menuIsActive || menuOpen
                  ? "border-[rgb(var(--season-rgb)_/_0.35)] bg-[rgb(var(--season-rgb)_/_0.14)] text-white"
                  : "border-transparent text-slate-300 hover:bg-[rgb(var(--season-rgb)_/_0.12)] hover:text-white"
              }`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              Menu
            </button>
          )}
        </div>

        {/* Desktop nav */}
        <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 md:flex md:justify-end">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}

          {!authLoading && user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm font-semibold transition ${
                  menuIsActive
                    ? "border-[rgb(var(--season-rgb)_/_0.35)] bg-[rgb(var(--season-rgb)_/_0.14)] text-white shadow-[0_0_18px_rgb(var(--season-rgb)_/_0.12)]"
                    : "border-transparent text-slate-300 hover:bg-[rgb(var(--season-rgb)_/_0.12)] hover:text-white"
                }`}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {menuIsActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--season-rgb))]" />
                )}
                More
              </button>

              {menuOpen && (
                <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/80 backdrop-blur-xl">
                  <MoreMenuContent isAdmin={isAdmin} isActive={isActive} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile nav */}
        <div className="flex gap-1 overflow-x-auto pb-1 md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
              compact
            />
          ))}
        </div>

        {/* Mobile More panel */}
        {menuOpen && !authLoading && user && (
          <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/70 backdrop-blur-xl md:hidden">
            <MoreMenuContent isAdmin={isAdmin} isActive={isActive} />
          </div>
        )}
      </div>
    </nav>
  );
}

function MoreMenuContent({
  isAdmin,
  isActive,
}: {
  isAdmin: boolean;
  isActive: (href: string) => boolean;
}) {
  return (
    <>
      <MenuSection title="Setup">
        {SETUP_NAV_ITEMS.map((item) => (
          <MenuLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={isActive(item.href)}
          />
        ))}
      </MenuSection>

      {isAdmin && (
        <>
          <div className="my-2 h-px bg-slate-800" />

          <MenuSection title="Admin">
            {ADMIN_NAV_ITEMS.map((item) => (
              <MenuLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(item.href)}
              />
            ))}
          </MenuSection>
        </>
      )}
    </>
  );
}

function NavLink({
  href,
  label,
  active,
  compact = false,
}: {
  href: string;
  label: string;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border text-sm font-semibold transition ${
        compact ? "px-2.5 py-1.5" : "px-2.5 py-1.5"
      } ${
        active
          ? "border-[rgb(var(--season-rgb)_/_0.35)] bg-[rgb(var(--season-rgb)_/_0.14)] text-white shadow-[0_0_18px_rgb(var(--season-rgb)_/_0.12)]"
          : "border-transparent text-slate-300 hover:bg-[rgb(var(--season-rgb)_/_0.12)] hover:text-white"
      }`}
    >
      {active && (
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--season-rgb))]" />
      )}

      {label}
    </Link>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>

      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function MenuLink({
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
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
        active
          ? "border-[rgb(var(--season-rgb)_/_0.35)] bg-[rgb(var(--season-rgb)_/_0.14)] text-white shadow-[0_0_16px_rgb(var(--season-rgb)_/_0.10)]"
          : "border-transparent text-slate-300 hover:bg-[rgb(var(--season-rgb)_/_0.12)] hover:text-white"
      }`}
    >
      {active && (
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--season-rgb))]" />
      )}

      {label}
    </Link>
  );
}