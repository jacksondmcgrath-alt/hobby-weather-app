"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";

type ExportTableName =
  | "saved_locations"
  | "activity_logs"
  | "planned_activities"
  | "scenario_ratings"
  | "weekly_obligations"
  | "activity_location_defaults"
  | "app_preferences";

const EXPORT_TABLES: {
  label: string;
  table: ExportTableName;
}[] = [
  { label: "Saved Locations", table: "saved_locations" },
  { label: "Activity Logs", table: "activity_logs" },
  { label: "Planned Activities", table: "planned_activities" },
  { label: "Scenario Ratings", table: "scenario_ratings" },
  { label: "Weekly Obligations", table: "weekly_obligations" },
  { label: "Activity Location Defaults", table: "activity_location_defaults" },
  { label: "App Preferences", table: "app_preferences" },
];

function convertToCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const escapeCell = (value: unknown) => {
    if (value === null || value === undefined) {
      return "";
    }

    const stringValue =
      typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCell(row[header])).join(",")
    ),
  ];

  return csvRows.join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export default function ExportsPage() {
  const { user, authLoading } = useUser();

  const [loadingTable, setLoadingTable] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function exportTable(tableName: ExportTableName, label: string) {
    if (!user) {
      return;
    }

    setLoadingTable(tableName);
    setMessage("");
    setErrorMessage("");

    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      setErrorMessage(error.message);
      setLoadingTable(null);
      return;
    }

    const rows = (data ?? []) as Record<string, unknown>[];

    if (rows.length === 0) {
      setMessage(`No rows found for ${label}.`);
      setLoadingTable(null);
      return;
    }

    const csv = convertToCsv(rows);

    const safeName = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    downloadTextFile(`${safeName}.csv`, csv);

    setMessage(`Downloaded ${rows.length} rows from ${label}.`);
    setLoadingTable(null);
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">Loading...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <NavBar />
          <h1 className="text-3xl font-bold">Data Exports</h1>
          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in to export your data.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <h1 className="text-3xl font-bold">Data Exports</h1>
        <p className="mt-2 text-slate-300">
          Download your saved app data as CSV files.
        </p>

        {message && (
          <div className="mt-6 rounded-lg bg-green-900/50 p-3 text-green-200">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-lg bg-red-900/50 p-3 text-red-200">
            {errorMessage}
          </div>
        )}

        <section className="mt-8 grid gap-3">
          {EXPORT_TABLES.map((item) => (
            <div
              key={item.table}
              className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-semibold">{item.label}</div>
                <div className="text-sm text-slate-400">
                  Export rows from {item.table}
                </div>
              </div>

              <button
                type="button"
                onClick={() => exportTable(item.table, item.label)}
                disabled={loadingTable === item.table}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingTable === item.table ? "Exporting..." : "Download CSV"}
              </button>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}