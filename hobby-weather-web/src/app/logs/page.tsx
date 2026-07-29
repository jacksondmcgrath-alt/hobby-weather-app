"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";

type SavedLocation = {
  id: number;
  user_id: string | null;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  location_type: string | null;
  water_type: string | null;
  water_body_size: string | null;
  wind_exposure: string | null;
  manual_water_temp: number | null;
  use_usgs_water_data: boolean | null;
  usgs_site_id: string | null;
  use_ndbc_data: boolean | null;
  ndbc_station_id: string | null;
  notes: string | null;
};

const LOCATION_TYPE_OPTIONS = [
  "Home",
  "Lake",
  "River",
  "Pond",
  "Beach",
  "Park",
  "Disc Golf Course",
  "Tennis Courts",
  "Campground",
  "Trail",
  "Other",
];

const WATER_TYPE_OPTIONS = [
  "Not applicable",
  "Freshwater lake",
  "River",
  "Pond",
  "Great Lake",
  "Ocean/coastal",
  "Unknown",
];

const WATER_BODY_SIZE_OPTIONS = [
  "Not applicable",
  "Pond",
  "Small lake",
  "Medium lake",
  "Large lake",
  "Great Lake",
  "River",
  "Unknown",
];

const WIND_EXPOSURE_OPTIONS = [
  "Not applicable",
  "Sheltered",
  "Moderate",
  "Open/exposed",
  "Unknown",
];

export default function LocationsPage() {
  const { user, authLoading } = useUser();

  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Add form state
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [locationType, setLocationType] = useState("Other");
  const [waterType, setWaterType] = useState("Not applicable");
  const [waterBodySize, setWaterBodySize] = useState("Not applicable");
  const [windExposure, setWindExposure] = useState("Not applicable");

  const [manualWaterTemp, setManualWaterTemp] = useState("");
  const [useUsgsWaterData, setUseUsgsWaterData] = useState(false);
  const [usgsSiteId, setUsgsSiteId] = useState("");

  const [useNdbcData, setUseNdbcData] = useState(false);
  const [ndbcStationId, setNdbcStationId] = useState("");

  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editLatitude, setEditLatitude] = useState("");
  const [editLongitude, setEditLongitude] = useState("");
  const [editLocationType, setEditLocationType] = useState("Other");
  const [editWaterType, setEditWaterType] = useState("Not applicable");
  const [editWaterBodySize, setEditWaterBodySize] = useState("Not applicable");
  const [editWindExposure, setEditWindExposure] = useState("Not applicable");
  const [editManualWaterTemp, setEditManualWaterTemp] = useState("");
  const [editUseUsgsWaterData, setEditUseUsgsWaterData] = useState(false);
  const [editUsgsSiteId, setEditUsgsSiteId] = useState("");
  const [editUseNdbcData, setEditUseNdbcData] = useState(false);
  const [editNdbcStationId, setEditNdbcStationId] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [workingId, setWorkingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!user) {
      setLocations([]);
      return;
    }

    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadLocations() {
    if (!user) {
      return;
    }

    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("saved_locations")
      .select(
        [
          "id",
          "user_id",
          "name",
          "latitude",
          "longitude",
          "location_type",
          "water_type",
          "water_body_size",
          "wind_exposure",
          "manual_water_temp",
          "use_usgs_water_data",
          "usgs_site_id",
          "use_ndbc_data",
          "ndbc_station_id",
          "notes",
        ].join(",")
      )
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    setLocations(data ?? []);
    setLoading(false);
  }

  function parseOptionalNumber(value: string) {
    if (value.trim() === "") {
      return null;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return "INVALID";
    }

    return parsed;
  }

  async function handleSaveLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    if (!user) {
      setSaveError("You must be logged in to save a location.");
      setSaving(false);
      return;
    }

    const latitudeNumber = Number(latitude);
    const longitudeNumber = Number(longitude);

    if (Number.isNaN(latitudeNumber) || Number.isNaN(longitudeNumber)) {
      setSaveError("Latitude and longitude must be valid numbers.");
      setSaving(false);
      return;
    }

    const manualWaterTempValue = parseOptionalNumber(manualWaterTemp);

    if (manualWaterTempValue === "INVALID") {
      setSaveError("Manual water temperature must be a valid number.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("saved_locations").insert({
      user_id: user.id,
      name,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
      location_type: locationType,
      water_type: waterType,
      water_body_size: waterBodySize,
      wind_exposure: windExposure,
      manual_water_temp: manualWaterTempValue,
      use_usgs_water_data: useUsgsWaterData,
      usgs_site_id: usgsSiteId,
      use_ndbc_data: useNdbcData,
      ndbc_station_id: ndbcStationId,
      notes,
    });

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    setSaveMessage("Location saved.");

    setName("");
    setLatitude("");
    setLongitude("");
    setLocationType("Other");
    setWaterType("Not applicable");
    setWaterBodySize("Not applicable");
    setWindExposure("Not applicable");
    setManualWaterTemp("");
    setUseUsgsWaterData(false);
    setUsgsSiteId("");
    setUseNdbcData(false);
    setNdbcStationId("");
    setNotes("");

    await loadLocations();

    setSaving(false);
  }

  function startEditing(location: SavedLocation) {
    setEditingId(location.id);
    setEditName(location.name ?? "");
    setEditLatitude(
      location.latitude === null || location.latitude === undefined
        ? ""
        : String(location.latitude)
    );
    setEditLongitude(
      location.longitude === null || location.longitude === undefined
        ? ""
        : String(location.longitude)
    );
    setEditLocationType(location.location_type ?? "Other");
    setEditWaterType(location.water_type ?? "Not applicable");
    setEditWaterBodySize(location.water_body_size ?? "Not applicable");
    setEditWindExposure(location.wind_exposure ?? "Not applicable");
    setEditManualWaterTemp(
      location.manual_water_temp === null ||
        location.manual_water_temp === undefined
        ? ""
        : String(location.manual_water_temp)
    );
    setEditUseUsgsWaterData(Boolean(location.use_usgs_water_data));
    setEditUsgsSiteId(location.usgs_site_id ?? "");
    setEditUseNdbcData(Boolean(location.use_ndbc_data));
    setEditNdbcStationId(location.ndbc_station_id ?? "");
    setEditNotes(location.notes ?? "");
    setEditMessage("");
    setEditError("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
    setEditLatitude("");
    setEditLongitude("");
    setEditLocationType("Other");
    setEditWaterType("Not applicable");
    setEditWaterBodySize("Not applicable");
    setEditWindExposure("Not applicable");
    setEditManualWaterTemp("");
    setEditUseUsgsWaterData(false);
    setEditUsgsSiteId("");
    setEditUseNdbcData(false);
    setEditNdbcStationId("");
    setEditNotes("");
    setEditMessage("");
    setEditError("");
  }

  async function saveLocationEdits(locationId: number) {
    if (!user) {
      return;
    }

    setWorkingId(locationId);
    setEditMessage("");
    setEditError("");

    const latitudeNumber = Number(editLatitude);
    const longitudeNumber = Number(editLongitude);

    if (Number.isNaN(latitudeNumber) || Number.isNaN(longitudeNumber)) {
      setEditError("Latitude and longitude must be valid numbers.");
      setWorkingId(null);
      return;
    }

    const manualWaterTempValue = parseOptionalNumber(editManualWaterTemp);

    if (manualWaterTempValue === "INVALID") {
      setEditError("Manual water temperature must be a valid number.");
      setWorkingId(null);
      return;
    }

    const { error } = await supabase
      .from("saved_locations")
      .update({
        name: editName,
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        location_type: editLocationType,
        water_type: editWaterType,
        water_body_size: editWaterBodySize,
        wind_exposure: editWindExposure,
        manual_water_temp: manualWaterTempValue,
        use_usgs_water_data: editUseUsgsWaterData,
        usgs_site_id: editUsgsSiteId,
        use_ndbc_data: editUseNdbcData,
        ndbc_station_id: editNdbcStationId,
        notes: editNotes,
      })
      .eq("id", locationId)
      .eq("user_id", user.id);

    if (error) {
      setEditError(error.message);
      setWorkingId(null);
      return;
    }

    setEditMessage("Location updated.");
    setEditingId(null);

    await loadLocations();

    setWorkingId(null);
  }

  async function handleDeleteLocation(locationId: number) {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this saved location? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    setWorkingId(locationId);
    setDeleteError("");

    const { error } = await supabase
      .from("saved_locations")
      .delete()
      .eq("id", locationId)
      .eq("user_id", user.id);

    if (error) {
      setDeleteError(error.message);
      setWorkingId(null);
      return;
    }

    await loadLocations();

    setWorkingId(null);
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-slate-300">Loading...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <NavBar />

          <h1 className="text-3xl font-bold">Saved Locations</h1>

          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in on the Home page to manage saved locations.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <header>
          <h1 className="text-3xl font-bold">Saved Locations</h1>
          <p className="mt-2 text-slate-300">
            Add and manage places you use for running, fishing, kayaking,
            tennis, beach days, and more.
          </p>
        </header>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Add Location</h2>

          <form onSubmit={handleSaveLocation} className="mt-4 grid gap-4">
            <label className="grid gap-1">
              <span className="text-sm text-slate-300">Location name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Example: Local Pond, Tennis Courts, Kayak Launch"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                required
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm text-slate-300">Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  placeholder="42.2808"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-300">Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  placeholder="-83.7430"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput
                label="Location type"
                value={locationType}
                onChange={setLocationType}
                options={LOCATION_TYPE_OPTIONS}
              />

              <SelectInput
                label="Water type"
                value={waterType}
                onChange={setWaterType}
                options={WATER_TYPE_OPTIONS}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput
                label="Water body size"
                value={waterBodySize}
                onChange={setWaterBodySize}
                options={WATER_BODY_SIZE_OPTIONS}
              />

              <SelectInput
                label="Wind exposure"
                value={windExposure}
                onChange={setWindExposure}
                options={WIND_EXPOSURE_OPTIONS}
              />
            </div>

            <label className="grid gap-1">
              <span className="text-sm text-slate-300">
                Manual water temperature °F, optional
              </span>
              <input
                type="number"
                step="any"
                value={manualWaterTemp}
                onChange={(event) => setManualWaterTemp(event.target.value)}
                placeholder="Example: 68"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
                <input
                  type="checkbox"
                  checked={useUsgsWaterData}
                  onChange={(event) => setUseUsgsWaterData(event.target.checked)}
                />
                <span className="text-sm text-slate-300">
                  Use USGS water data
                </span>
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-300">USGS site ID</span>
                <input
                  type="text"
                  value={usgsSiteId}
                  onChange={(event) => setUsgsSiteId(event.target.value)}
                  placeholder="Example: 04174500"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
                <input
                  type="checkbox"
                  checked={useNdbcData}
                  onChange={(event) => setUseNdbcData(event.target.checked)}
                />
                <span className="text-sm text-slate-300">
                  Use NOAA/NDBC buoy data
                </span>
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-300">NDBC station ID</span>
                <input
                  type="text"
                  value={ndbcStationId}
                  onChange={(event) => setNdbcStationId(event.target.value)}
                  placeholder="Optional"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
                />
              </label>
            </div>

            <label className="grid gap-1">
              <span className="text-sm text-slate-300">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Example: Sheltered from west wind, muddy after rain, good bass spot"
                className="min-h-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save location"}
            </button>
          </form>

          {saveMessage && (
            <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
              {saveMessage}
            </div>
          )}

          {saveError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {saveError}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Your Saved Locations</h2>

          {loading && (
            <p className="mt-4 text-slate-300">Loading saved locations...</p>
          )}

          {loadError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {loadError}
            </div>
          )}

          {editMessage && (
            <div className="mt-4 rounded-lg bg-green-900/50 p-3 text-green-200">
              {editMessage}
            </div>
          )}

          {editError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {editError}
            </div>
          )}

          {deleteError && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-3 text-red-200">
              {deleteError}
            </div>
          )}

          {!loading && !loadError && locations.length === 0 && (
            <p className="mt-4 text-slate-300">
              No saved locations yet.
            </p>
          )}

          <div className="mt-4 grid gap-3">
            {locations.map((location) => (
              <div
                key={location.id}
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                {editingId === location.id ? (
                  <EditLocationForm
                    locationId={location.id}
                    editName={editName}
                    setEditName={setEditName}
                    editLatitude={editLatitude}
                    setEditLatitude={setEditLatitude}
                    editLongitude={editLongitude}
                    setEditLongitude={setEditLongitude}
                    editLocationType={editLocationType}
                    setEditLocationType={setEditLocationType}
                    editWaterType={editWaterType}
                    setEditWaterType={setEditWaterType}
                    editWaterBodySize={editWaterBodySize}
                    setEditWaterBodySize={setEditWaterBodySize}
                    editWindExposure={editWindExposure}
                    setEditWindExposure={setEditWindExposure}
                    editManualWaterTemp={editManualWaterTemp}
                    setEditManualWaterTemp={setEditManualWaterTemp}
                    editUseUsgsWaterData={editUseUsgsWaterData}
                    setEditUseUsgsWaterData={setEditUseUsgsWaterData}
                    editUsgsSiteId={editUsgsSiteId}
                    setEditUsgsSiteId={setEditUsgsSiteId}
                    editUseNdbcData={editUseNdbcData}
                    setEditUseNdbcData={setEditUseNdbcData}
                    editNdbcStationId={editNdbcStationId}
                    setEditNdbcStationId={setEditNdbcStationId}
                    editNotes={editNotes}
                    setEditNotes={setEditNotes}
                    workingId={workingId}
                    onSave={() => saveLocationEdits(location.id)}
                    onCancel={cancelEditing}
                  />
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-lg font-semibold">
                        {location.name ?? "Unnamed location"}
                      </div>

                      <div className="mt-1 text-sm text-slate-300">
                        {location.location_type ?? "Unknown type"} ·{" "}
                        {location.water_type ?? "Unknown water type"}
                      </div>

                      <div className="mt-1 text-sm text-slate-400">
                        {location.latitude}, {location.longitude}
                      </div>

                      <div className="mt-2 text-sm text-slate-400">
                        Water body: {location.water_body_size ?? "N/A"} · Wind exposure:{" "}
                        {location.wind_exposure ?? "N/A"}
                      </div>

                      {location.manual_water_temp !== null && (
                        <div className="mt-1 text-sm text-slate-400">
                          Manual water temp: {location.manual_water_temp}°F
                        </div>
                      )}

                      {location.use_usgs_water_data && (
                        <div className="mt-1 text-sm text-blue-300">
                          USGS site: {location.usgs_site_id || "not set"}
                        </div>
                      )}

                      {location.use_ndbc_data && (
                        <div className="mt-1 text-sm text-blue-300">
                          NDBC station: {location.ndbc_station_id || "not set"}
                        </div>
                      )}

                      {location.notes && (
                        <p className="mt-2 text-sm text-slate-300">
                          {location.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(location)}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteLocation(location.id)}
                        disabled={workingId === location.id}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {workingId === location.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function EditLocationForm({
  locationId,
  editName,
  setEditName,
  editLatitude,
  setEditLatitude,
  editLongitude,
  setEditLongitude,
  editLocationType,
  setEditLocationType,
  editWaterType,
  setEditWaterType,
  editWaterBodySize,
  setEditWaterBodySize,
  editWindExposure,
  setEditWindExposure,
  editManualWaterTemp,
  setEditManualWaterTemp,
  editUseUsgsWaterData,
  setEditUseUsgsWaterData,
  editUsgsSiteId,
  setEditUsgsSiteId,
  editUseNdbcData,
  setEditUseNdbcData,
  editNdbcStationId,
  setEditNdbcStationId,
  editNotes,
  setEditNotes,
  workingId,
  onSave,
  onCancel,
}: {
  locationId: number;
  editName: string;
  setEditName: (value: string) => void;
  editLatitude: string;
  setEditLatitude: (value: string) => void;
  editLongitude: string;
  setEditLongitude: (value: string) => void;
  editLocationType: string;
  setEditLocationType: (value: string) => void;
  editWaterType: string;
  setEditWaterType: (value: string) => void;
  editWaterBodySize: string;
  setEditWaterBodySize: (value: string) => void;
  editWindExposure: string;
  setEditWindExposure: (value: string) => void;
  editManualWaterTemp: string;
  setEditManualWaterTemp: (value: string) => void;
  editUseUsgsWaterData: boolean;
  setEditUseUsgsWaterData: (value: boolean) => void;
  editUsgsSiteId: string;
  setEditUsgsSiteId: (value: string) => void;
  editUseNdbcData: boolean;
  setEditUseNdbcData: (value: boolean) => void;
  editNdbcStationId: string;
  setEditNdbcStationId: (value: string) => void;
  editNotes: string;
  setEditNotes: (value: string) => void;
  workingId: number | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="text-lg font-semibold">Editing location</div>

      <label className="grid gap-1">
        <span className="text-sm text-slate-300">Location name</span>
        <input
          type="text"
          value={editName}
          onChange={(event) => setEditName(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Latitude</span>
          <input
            type="number"
            step="any"
            value={editLatitude}
            onChange={(event) => setEditLatitude(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Longitude</span>
          <input
            type="number"
            step="any"
            value={editLongitude}
            onChange={(event) => setEditLongitude(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="Location type"
          value={editLocationType}
          onChange={setEditLocationType}
          options={LOCATION_TYPE_OPTIONS}
        />

        <SelectInput
          label="Water type"
          value={editWaterType}
          onChange={setEditWaterType}
          options={WATER_TYPE_OPTIONS}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="Water body size"
          value={editWaterBodySize}
          onChange={setEditWaterBodySize}
          options={WATER_BODY_SIZE_OPTIONS}
        />

        <SelectInput
          label="Wind exposure"
          value={editWindExposure}
          onChange={setEditWindExposure}
          options={WIND_EXPOSURE_OPTIONS}
        />
      </div>

      <label className="grid gap-1">
        <span className="text-sm text-slate-300">
          Manual water temperature °F, optional
        </span>
        <input
          type="number"
          step="any"
          value={editManualWaterTemp}
          onChange={(event) => setEditManualWaterTemp(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <input
            type="checkbox"
            checked={editUseUsgsWaterData}
            onChange={(event) => setEditUseUsgsWaterData(event.target.checked)}
          />
          <span className="text-sm text-slate-300">
            Use USGS water data
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">USGS site ID</span>
          <input
            type="text"
            value={editUsgsSiteId}
            onChange={(event) => setEditUsgsSiteId(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <input
            type="checkbox"
            checked={editUseNdbcData}
            onChange={(event) => setEditUseNdbcData(event.target.checked)}
          />
          <span className="text-sm text-slate-300">
            Use NOAA/NDBC buoy data
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">NDBC station ID</span>
          <input
            type="text"
            value={editNdbcStationId}
            onChange={(event) => setEditNdbcStationId(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
          />
        </label>
      </div>

      <label className="grid gap-1">
        <span className="text-sm text-slate-300">Notes</span>
        <textarea
          value={editNotes}
          onChange={(event) => setEditNotes(event.target.value)}
          className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-400"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={workingId === locationId}
          className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {workingId === locationId ? "Saving..." : "Save edits"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}