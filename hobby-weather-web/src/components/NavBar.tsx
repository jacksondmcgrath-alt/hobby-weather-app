import Link from "next/link";

export function NavBar() {
  return (
    <nav className="mb-8 flex flex-wrap gap-3 rounded-2xl bg-slate-900 p-3">
      <Link
        href="/"
        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
      >
        Home
      </Link>

      <Link
        href="/locations"
        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
      >
        Locations
      </Link>

      <Link
        href="/logs"
        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
      >
        Activity Logs
      </Link>
    </nav>
  );
}