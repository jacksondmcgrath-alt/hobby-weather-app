"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { PageHeader, Card, StatusMessage } from "@/components/ui";

type ExportTableName =
  | "saved_locations"
  | "activity_logs"
  | "planned_activities"
  | "scenario_ratings"
  | "weekly_obligations"
  | "activity_location_defaults"
  | "app_preferences"
  | "user_predictions";

const RAW_EXPORT_TABLES: {
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
  { label: "User Predictions", table: "user_predictions" },
];

function safeString(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

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
    const stringValue = safeString(value);
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

function flattenObject(
  value: unknown,
  prefix: string,
  output: Record<string, unknown>
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  const objectValue = value as Record<string, unknown>;

  for (const [key, nestedValue] of Object.entries(objectValue)) {
    const flatKey = `${prefix}_${key}`;

    if (
      nestedValue &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      flattenObject(nestedValue, flatKey, output);
    } else {
      output[flatKey] = nestedValue;
    }
  }
}

function buildScenarioMlRows(rows: Record<string, unknown>[]) {
  return rows
    .filter((row) => row.rating_0_to_100 !== null && row.rating_0_to_100 !== undefined)
    .map((row) => {
      const output: Record<string, unknown> = {
        training_source: "scenario_rating",
        target_score: row.rating_0_to_100,
        activity: row.activity,
        rating: row.rating,
        rating_0_to_100: row.rating_0_to_100,
        rater_confidence: row.rater_confidence,
        rater_experience_level: row.rater_experience_level,
        scenario_mode: row.scenario_mode,
        scenario_generation_method: row.scenario_generation_method,
        rating_target: row.rating_target,

        temperature: row.temperature,
        wind_speed: row.wind_speed,
        wind_gust: row.wind_gust,
        rain_chance: row.rain_chance,
        humidity: row.humidity,
        cloud_cover: row.cloud_cover,
        pressure_change: row.pressure_change,
        bug_index: row.bug_index,
        water_temp: row.water_temp,
        storm_safety: row.storm_safety,
        dew_point: row.dew_point,
        aqi: row.aqi,
        uv_index: row.uv_index,

        notes: row.notes,
      };

      flattenObject(row.advanced_features, "advanced", output);
      flattenObject(row.location_context, "location", output);

      output.shown_features = safeString(row.shown_features);
      output.hidden_features = safeString(row.hidden_features);
      output.required_context_missing = safeString(row.required_context_missing);

      return output;
    });
}

function buildActivityLogMlRows(rows: Record<string, unknown>[]) {
  return rows
    .filter((row) => row.actual_score_0_to_100 !== null && row.actual_score_0_to_100 !== undefined)
    .map((row) => ({
      training_source: "activity_log",
      target_score: row.actual_score_0_to_100,
      activity: row.activity,
      date: row.date,
      predicted_score: row.predicted_score,
      actual_enjoyment_1_to_10: row.actual_enjoyment_1_to_10,
      actual_score_0_to_100: row.actual_score_0_to_100,
      prediction_error: row.prediction_error,
      absolute_error: row.absolute_error,
      did_i_go: row.did_i_go,
      actual_bugs_1_to_10: row.actual_bugs_1_to_10,
      actual_wind_annoyance_1_to_10: row.actual_wind_annoyance_1_to_10,
      actual_humidity_comfort_1_to_10: row.actual_humidity_comfort_1_to_10,
      actual_ground_wetness: row.actual_ground_wetness,
      actual_water_conditions: row.actual_water_conditions,
      fish_activity: row.fish_activity,
      visibility_light: row.visibility_light,
      notes: row.notes,
    }));
}

function buildUserPredictionMlRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const output: Record<string, unknown> = {
      training_source: "user_prediction",
      activity: row.activity,
      date: row.date,
      predicted_score: row.predicted_score,
      planning_score: row.planning_score,
      forecast_confidence: row.forecast_confidence,
      forecast_confidence_label: row.forecast_confidence_label,
      label: row.label,
      rule_score: row.rule_score,
      ml_score: row.ml_score,
      final_score: row.final_score,
      blended_score: row.blended_score,
      scoring_method: row.scoring_method,
      model_version: row.model_version,
      ml_status: row.ml_status,
      ml_weight: row.ml_weight,
      rule_weight: row.rule_weight,
      prediction_source: row.prediction_source,
      recommended_window: row.recommended_window,
      window_score: row.window_score,
      location_name: row.location_name,
      best_species: row.best_species,
      best_species_score: row.best_species_score,
    };

    flattenObject(row.weather_snapshot, "weather", output);
    flattenObject(row.location_context, "location", output);
    flattenObject(row.feature_json, "feature", output);
    flattenObject(row.data_quality_json, "data_quality", output);
    flattenObject(row.model_input_json, "model_input", output);

    output.species_breakdown = safeString(row.species_breakdown);
    output.model_explanation = row.model_explanation;

    return output;
  });
}

export default function ExportsPage() {
  const { user, authLoading } = useUser();

  const [loadingLabel, setLoadingLabel] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadUserTable(tableName: ExportTableName) {
    if (!user) return [];

    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return (data ?? []) as Record<string, unknown>[];
  }

  async function exportRawTable(tableName: ExportTableName, label: string) {
    setLoadingLabel(label);
    setMessage("");
    setErrorMessage("");

    try {
      const rows = await loadUserTable(tableName);

      if (rows.length === 0) {
        setMessage(`No rows found for ${label}.`);
        setLoadingLabel("");
        return;
      }

      downloadTextFile(
        `${tableName}.csv`,
        convertToCsv(rows)
      );

      setMessage(`Downloaded ${rows.length} rows from ${label}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not export data."
      );
    }

    setLoadingLabel("");
  }

  async function exportScenarioMlDataset() {
    setLoadingLabel("Scenario ML Dataset");
    setMessage("");
    setErrorMessage("");

    try {
      const rows = await loadUserTable("scenario_ratings");
      const mlRows = buildScenarioMlRows(rows);

      if (mlRows.length === 0) {
        setMessage("No scenario ML rows available.");
        setLoadingLabel("");
        return;
      }

      downloadTextFile(
        "scenario_ml_dataset.csv",
        convertToCsv(mlRows)
      );

      setMessage(`Downloaded ${mlRows.length} scenario ML rows.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not export scenario ML dataset."
      );
    }

    setLoadingLabel("");
  }

  async function exportActivityLogMlDataset() {
    setLoadingLabel("Activity Log ML Dataset");
    setMessage("");
    setErrorMessage("");

    try {
      const rows = await loadUserTable("activity_logs");
      const mlRows = buildActivityLogMlRows(rows);

      if (mlRows.length === 0) {
        setMessage("No activity log ML rows available.");
        setLoadingLabel("");
        return;
      }

      downloadTextFile(
        "activity_log_ml_dataset.csv",
        convertToCsv(mlRows)
      );

      setMessage(`Downloaded ${mlRows.length} activity log ML rows.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not export activity log ML dataset."
      );
    }

    setLoadingLabel("");
  }

  async function exportUserPredictionMlDataset() {
    setLoadingLabel("User Prediction ML Dataset");
    setMessage("");
    setErrorMessage("");

    try {
      const rows = await loadUserTable("user_predictions");
      const mlRows = buildUserPredictionMlRows(rows);

      if (mlRows.length === 0) {
        setMessage("No user prediction rows available.");
        setLoadingLabel("");
        return;
      }

      downloadTextFile(
        "user_predictions_ml_dataset.csv",
        convertToCsv(mlRows)
      );

      setMessage(`Downloaded ${mlRows.length} user prediction rows.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not export user prediction dataset."
      );
    }

    setLoadingLabel("");
  }

  async function exportCombinedMlDataset() {
    setLoadingLabel("Combined ML Dataset");
    setMessage("");
    setErrorMessage("");

    try {
      const scenarioRows = buildScenarioMlRows(
        await loadUserTable("scenario_ratings")
      );

      const activityRows = buildActivityLogMlRows(
        await loadUserTable("activity_logs")
      );

      const combinedRows = [
        ...scenarioRows,
        ...activityRows,
      ];

      if (combinedRows.length === 0) {
        setMessage("No combined ML rows available.");
        setLoadingLabel("");
        return;
      }

      downloadTextFile(
        "combined_ml_dataset.csv",
        convertToCsv(combinedRows)
      );

      setMessage(`Downloaded ${combinedRows.length} combined ML rows.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not export combined ML dataset."
      );
    }

    setLoadingLabel("");
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
  return (
        <>
        <PageHeader title="Data Exports" />

        <Card className="mt-6">
            <p className="text-slate-300">
            Please log in to export your data.
            </p>
        </Card>
        </>
    );
  }

  return (
    <>
        <PageHeader
        title="Data Exports"
        description="Download your saved app data and ML-ready datasets."
      />

      {message && (
        <StatusMessage type="success">
          {message}
        </StatusMessage>
      )}

      {errorMessage && (
        <StatusMessage type="error">
          {errorMessage}
        </StatusMessage>
      )}

      <Card className="mt-8">
        <h2 className="text-xl font-semibold">ML Training Exports</h2>

        <p className="mt-2 text-sm text-slate-300">
          These exports are structured for future modeling experiments.
        </p>

        <div className="mt-4 grid gap-3">
          <ExportButton
            label="Scenario ML Dataset"
            loadingLabel={loadingLabel}
            onClick={exportScenarioMlDataset}
          />

          <ExportButton
            label="Activity Log ML Dataset"
            loadingLabel={loadingLabel}
            onClick={exportActivityLogMlDataset}
          />

          <ExportButton
            label="User Prediction Dataset"
            loadingLabel={loadingLabel}
            onClick={exportUserPredictionMlDataset}
          />

          <ExportButton
            label="Combined ML Dataset"
            loadingLabel={loadingLabel}
            onClick={exportCombinedMlDataset}
          />
        </div>
      </Card>

      <Card className="mt-8">
        <h2 className="text-xl font-semibold">Raw Table Exports</h2>

        <div className="mt-4 grid gap-3">
          {RAW_EXPORT_TABLES.map((item) => (
            <ExportButton
              key={item.table}
              label={item.label}
              loadingLabel={loadingLabel}
              onClick={() => exportRawTable(item.table, item.label)}
            />
          ))}
        </div>
      </Card>
    </>
  );
}

function ExportButton({
  label,
  loadingLabel,
  onClick,
}: {
  label: string;
  loadingLabel: string;
  onClick: () => void;
}) {
  const loading = loadingLabel === label;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-semibold">{label}</div>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={loadingLabel !== "" && !loading}
        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Exporting..." : "Download CSV"}
      </button>
    </div>
  );
}