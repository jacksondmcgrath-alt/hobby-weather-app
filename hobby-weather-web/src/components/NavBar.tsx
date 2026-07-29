import Link from "next/link";

export function NavBar() {
  return (
    <nav className="mb-8 flex flex-wrap gap-3 rounded-2xl bg-slate-900 p-3">
      <NavLink href="/" label="Home" />
      <NavLink href="/locations" label="Locations" />
      <NavLink href="/activity-defaults" label="Activity Defaults" />
      <NavLink href="/schedule" label="Schedule" />
      <NavLink href="/planner" label="Planner" />
      <NavLink href="/logs" label="Activity Logs" />
      <NavLink href="/plans" label="Plans" />
      <NavLink href="/scenarios" label="Scenarios" />
      <NavLink href="/preferences" label="Preferences" />
      <NavLink href="/exports" label="Exports" />
    </nav>
  );
}

function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
    >
      {label}
    </Link>
  );
}