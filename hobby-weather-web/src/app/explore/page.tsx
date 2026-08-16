"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { ACTIVITY_OPTIONS, activityLabel } from "@/lib/activityMeta";
import {
  PageHeader,
  Card,
  SectionTitle,
  StatusMessage,
  Button,
  Badge,
  EmptyState,
  Panel,
} from "@/components/ui";
import { trackEvent } from "@/lib/trackEvent";

type SavedLocation = {
  id: number;
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

type ScoreComponents = {
  base_score?: number | null;
  preference_adjustment?: number | null;
  calibrated_score?: number | null;
  planning_score?: number | null;
  forecast_confidence?: number | null;
  window_score?: number | null;
};

type LocationRanking = {
  result_id?: string;
  source?: "saved" | "osm";

  location_id: number | null;
  location_name: string | null;

  external_id?: string | null;
  external_type?: string | null;
  external_source?: string | null;
  map_url?: string | null;

  latitude: number | null;
  longitude: number | null;
  location_type: string | null;
  water_type: string | null;
  water_body_size: string | null;
  wind_exposure: string | null;
  use_usgs_water_data: boolean | null;
  use_ndbc_data: boolean | null;
  distance_miles: number | null;
  activity: string;
  date: string;
  score: number;
  planning_score: number | null;
  forecast_confidence?: number | null;
  forecast_confidence_label?: string | null;
  label: string;
  score_components?: ScoreComponents | null;

  recommended_window: string | null;
  window_score: number | null;
  explanation: string;
  weather_snapshot: {
    avg_temp?: number | null;
    wind_max?: number | null;
    gust_max?: number | null;
    rain_chance?: number | null;
    bug_index?: number | null;
    water_temp_est?: number | null;
    aqi?: number | null;
    uv_index?: number | null;
  } | null;
  location_context?: Record<string, unknown> | null;
};

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function getDefaultExploreDate() {
  return addDays(1);
}

function formatFriendlyDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  const today = toDateString(new Date());
  const tomorrow = addDays(1);

  if (dateString === today) return "Today";
  if (dateString === tomorrow) return "Tomorrow";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ExplorePage() {
  const { user, authLoading } = useUser();

  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");

  const [selectedActivity, setSelectedActivity] = useState("Running");
  const [selectedDate, setSelectedDate] = useState(getDefaultExploreDate());
  const [exploreMode, setExploreMode] = useState<"day" | "week">("day");
  const [exploreScope, setExploreScope] = useState<"saved" | "discover">(
    "saved"
    );
  const [maxDistanceMiles, setMaxDistanceMiles] = useState(25);

  const [rankings, setRankings] = useState<LocationRanking[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState("");
  const [rankingMessage, setRankingMessage] = useState("");
  const [savingPlanKey, setSavingPlanKey] = useState<string | null>(null);
  const [savingLocationKey, setSavingLocationKey] = useState<string | null>(null);

  const availableDates = useMemo(() => {
    return Array.from({ length: 14 }, (_item, index) => addDays(index + 1));
  }, []);

  const defaultCandidateInsight = useMemo(() => {
    if (exploreMode !== "week" || rankings.length === 0) return null;

    const topRankings = rankings.slice(0, 10);

    const counts = new Map<
        string,
        {
            locationName: string | null;
            count: number;
        }
        >();

    for (const ranking of topRankings) {
        const key = getRankingKey(ranking);

        const current = counts.get(key) ?? {
            locationName: ranking.location_name,
            count: 0,
        };

        current.count += 1;
        counts.set(key, current);
        }

    const best = Array.from(counts.entries()).sort(
      (a, b) => b[1].count - a[1].count
    )[0];

    if (!best || best[1].count < 2) return null;

    return {
      locationId: best[0],
      locationName: best[1].locationName,
      count: best[1].count,
    };
  }, [exploreMode, rankings]);

  useEffect(() => {
    if (!user) {
      setLocations([]);
      return;
    }

    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadLocations() {
    if (!user) return;

    setLocationsLoading(true);
    setLocationsError("");

    const { data, error } = await supabase
      .from("saved_locations")
      .select(
        [
          "id",
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
      setLocationsError(error.message);
      setLocations([]);
      setLocationsLoading(false);
      return;
    }

    setLocations((data ?? []) as unknown as SavedLocation[]);
    setLocationsLoading(false);
  }

  async function runExploreSearch() {
    if (!user) return;

    setRankingLoading(true);
    setRankingError("");
    setRankingMessage("");
    setRankings([]);

    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
        setRankingError("You must be logged in.");
        setRankingLoading(false);
        return;
    }

    const endpoint =
        exploreScope === "discover"
        ? "/api/locations/discover"
        : "/api/locations/rank";

    try {
        const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            activity: selectedActivity,
            date: selectedDate,
            mode: exploreMode,
            radiusMiles: maxDistanceMiles,
        }),
        });

        const text = await response.text();

        let result: any = {};

        if (text) {
        try {
            result = JSON.parse(text);
        } catch {
            throw new Error(`Server returned non-JSON response: ${text}`);
        }
        }

        if (!response.ok) {
        setRankingError(
            result.error ??
            result.message ??
            `Could not explore locations. Status ${response.status}.`
        );
        setRankingLoading(false);
        return;
        }

        const nextRankings = result.rankings ?? [];

        setRankings(nextRankings);
        setRankingMessage(result.message ?? "Explore results ready.");

        await trackEvent(
        user.id,
        exploreScope === "discover"
            ? "explore_discovery_run"
            : "explore_saved_rank_run",
        {
            activity: selectedActivity,
            date: selectedDate,
            mode: exploreMode,
            radius_miles: exploreScope === "discover" ? maxDistanceMiles : null,
            result_count: nextRankings.length,
        }
        );
    } catch (error) {
        setRankingError(
        error instanceof Error ? error.message : "Could not explore locations."
        );
    }

    setRankingLoading(false);
    }

  async function saveRankingAsPlan(ranking: LocationRanking) {
    if (!user) return;

    const key = getRankingKey(ranking);

    setSavingPlanKey(key);
    setRankingError("");
    setRankingMessage("");

    const { data: existingPlans, error: existingError } = await supabase
      .from("planned_activities")
      .select("id")
      .eq("user_id", user.id)
      .eq("activity", ranking.activity)
      .eq("planned_date", ranking.date)
      .eq("location_name", ranking.location_name ?? "")
      .limit(1);

    if (existingError) {
      setRankingError(existingError.message);
      setSavingPlanKey(null);
      return;
    }

    if ((existingPlans ?? []).length > 0) {
      setRankingError("This location/activity/date is already saved as a plan.");
      setSavingPlanKey(null);
      return;
    }

    const { error } = await supabase.from("planned_activities").insert({
        user_id: user.id,
        activity: ranking.activity,
        planned_date: ranking.date,
        planned_window: ranking.recommended_window ?? "Suggested time TBD",
        status: "Planned",
        location_name: ranking.location_name ?? "",
        score_at_planning: ranking.score,
        planning_score_at_planning: ranking.planning_score,
        forecast_confidence_at_planning: ranking.forecast_confidence ?? null,
        forecast_confidence_label_at_planning:
            ranking.forecast_confidence_label ?? null,
        weather_snapshot_at_planning: ranking.weather_snapshot,
        location_context_at_planning: ranking.location_context ?? null,
        preference_snapshot_at_planning: null,
        prediction_context_at_planning: {
            source: ranking.source ?? "saved",
            result_id: ranking.result_id ?? null,
            external_id: ranking.external_id ?? null,
            external_type: ranking.external_type ?? null,
            external_source: ranking.external_source ?? null,
            score: ranking.score,
            planning_score: ranking.planning_score,
            forecast_confidence: ranking.forecast_confidence ?? null,
            forecast_confidence_label: ranking.forecast_confidence_label ?? null,
            recommended_window: ranking.recommended_window,
            window_score: ranking.window_score,
            score_components: ranking.score_components ?? null,
        },
        notes: `Created from Explore. Lumora ranked this location for ${ranking.activity}.`,
        });

    if (error) {
        setRankingError(error.message);
        setSavingPlanKey(null);
        return;
    }

    await trackEvent(user.id, "explore_result_saved_as_plan", {
        activity: ranking.activity,
        date: ranking.date,
        location_name: ranking.location_name,
        source: ranking.source ?? "saved",
        score: ranking.score,
        planning_score: ranking.planning_score,
    });

        setRankingMessage("Saved as a plan.");
        setSavingPlanKey(null);
  }

  async function saveDiscoveredAsLocation(ranking: LocationRanking) {
    if (!user) return;

    if (ranking.latitude === null || ranking.longitude === null) {
        setRankingError("This discovered location is missing coordinates.");
        return;
    }

    const key = getRankingKey(ranking);

    setSavingLocationKey(key);
    setRankingError("");
    setRankingMessage("");

    const name = ranking.location_name ?? "Discovered location";

    const { data: existingLocations, error: existingError } = await supabase
        .from("saved_locations")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .eq("latitude", ranking.latitude)
        .eq("longitude", ranking.longitude)
        .limit(1);

    if (existingError) {
        setRankingError(existingError.message);
        setSavingLocationKey(null);
        return;
    }

    if ((existingLocations ?? []).length > 0) {
        await trackEvent(user.id, "explore_discovered_location_already_saved", {
            activity: ranking.activity,
            location_name: ranking.location_name,
            source: ranking.source,
            external_source: ranking.external_source,
            external_id: ranking.external_id,
        });

        setRankingError("This location already appears to be saved.");
        setSavingLocationKey(null);
        return;
    }

    const mapsUrl =
        ranking.map_url ?? googleMapsUrl(ranking.latitude, ranking.longitude);

    const notesParts = [
        `Discovered through Lumora Explore for ${ranking.activity}.`,
    ];

    if (ranking.external_source) {
        notesParts.push(`Source: ${ranking.external_source}.`);
    }

    if (ranking.external_id) {
        notesParts.push(`External ID: ${ranking.external_id}.`);
    }

    if (mapsUrl) {
        notesParts.push(`Map: ${mapsUrl}`);
    }

    const { error } = await supabase.from("saved_locations").insert({
        user_id: user.id,
        name,
        latitude: ranking.latitude,
        longitude: ranking.longitude,
        location_type: ranking.location_type ?? "Other",
        water_type: ranking.water_type ?? "Not applicable",
        water_body_size: ranking.water_body_size ?? "Not applicable",
        wind_exposure: ranking.wind_exposure ?? "Unknown",
        manual_water_temp: null,
        use_usgs_water_data: false,
        usgs_site_id: "",
        use_ndbc_data: false,
        ndbc_station_id: "",
        notes: notesParts.join(" "),
    });

    if (error) {
        setRankingError(error.message);
        setSavingLocationKey(null);
        return;
    }

    await trackEvent(user.id, "explore_discovered_location_saved", {
        activity: ranking.activity,
        location_name: ranking.location_name,
        source: ranking.source,
        external_source: ranking.external_source,
        external_id: ranking.external_id,
        latitude: ranking.latitude,
        longitude: ranking.longitude,
    });

    setRankingMessage("Discovered location saved.");
    setSavingLocationKey(null);

    await loadLocations();
    }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <>
        <PageHeader
          title="Explore"
          description="Log in to compare saved locations for your activities."
        />

        <Card className="mt-6">
          <p className="text-slate-300">Please log in to use Explore.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Where to go"
        title="Explore"
        description="Choose an activity and date, then let Lumora rank your saved locations or discover nearby places to try."
      />

      {locationsError && (
        <StatusMessage type="error">{locationsError}</StatusMessage>
      )}

      {rankingError && (
        <StatusMessage type="error">{rankingError}</StatusMessage>
      )}

      {rankingMessage && (
        <StatusMessage type="success">{rankingMessage}</StatusMessage>
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <SectionTitle
            title="Find the best location"
            description="Lumora will compare your saved places for the selected activity and day."
          />

          <div className="mt-5 grid gap-4">

            <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/60 p-1">
                <button
                    type="button"
                    onClick={() => setExploreScope("saved")}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    exploreScope === "saved"
                        ? "bg-[rgb(var(--brand-rgb)_/_0.18)] text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                >
                    My saved places
                </button>

                <button
                    type="button"
                    onClick={() => setExploreScope("discover")}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    exploreScope === "discover"
                        ? "bg-[rgb(var(--brand-rgb)_/_0.18)] text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                >
                    Discover nearby
                </button>
                </div>

            <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/60 p-1">
              <button
                type="button"
                onClick={() => setExploreMode("day")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  exploreMode === "day"
                    ? "bg-[rgb(var(--brand-rgb)_/_0.18)] text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                Selected day
              </button>

              <button
                type="button"
                onClick={() => setExploreMode("week")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  exploreMode === "week"
                    ? "bg-[rgb(var(--brand-rgb)_/_0.18)] text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                Best this week
              </button>
            </div>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-300">
                Activity
              </span>

              <select
                value={selectedActivity}
                onChange={(event) => setSelectedActivity(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--brand-rgb))] focus:ring-2 focus:ring-[rgb(var(--brand-rgb)_/_0.18)]"
              >
                {ACTIVITY_OPTIONS.map((activity) => (
                  <option key={activity} value={activity}>
                    {activityLabel(activity)}
                  </option>
                ))}
              </select>
            </label>

            {exploreMode === "day" && (
              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-300">
                  Date
                </span>

                <select
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--brand-rgb))] focus:ring-2 focus:ring-[rgb(var(--brand-rgb)_/_0.18)]"
                >
                  {availableDates.map((date) => (
                    <option key={date} value={date}>
                      {formatFriendlyDate(date)} · {date}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {exploreScope === "discover" && (
            <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-300">
                Search radius
                </span>

                <select
                value={maxDistanceMiles}
                onChange={(event) => setMaxDistanceMiles(Number(event.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--brand-rgb))] focus:ring-2 focus:ring-[rgb(var(--brand-rgb)_/_0.18)]"
                >
                <option value={5}>Within 5 miles</option>
                <option value={10}>Within 10 miles</option>
                <option value={25}>Within 25 miles</option>
                <option value={50}>Within 50 miles</option>
                </select>

                <p className="text-xs text-slate-500">
                Discovery currently searches around your saved Home location using
                OpenStreetMap.
                </p>
            </label>
            )}

            

            <Button
                type="button"
                onClick={runExploreSearch}
                disabled={
                    rankingLoading || (exploreScope === "saved" && locations.length === 0)
                }
                >
                {rankingLoading
                    ? exploreScope === "discover"
                    ? "Searching..."
                    : "Ranking..."
                    : exploreScope === "discover"
                    ? "Discover nearby places"
                    : exploreMode === "week"
                        ? "Find best this week"
                        : "Rank my locations"}
                </Button>
          </div>

          {locationsLoading && (
            <p className="mt-4 text-sm text-slate-300">
              Loading saved locations...
            </p>
          )}

          {!locationsLoading && locations.length === 0 && (
            <div className="mt-5">
              <EmptyState
                title="No saved locations yet"
                description="Add a few saved locations first, then Explore can compare where to go."
                action={
                  <Link
                    href="/locations"
                    className="inline-flex rounded-lg bg-[rgb(var(--brand-rgb))] px-4 py-2 text-sm font-semibold text-[#030716] transition hover:bg-[rgb(var(--brand-soft-rgb))]"
                  >
                    Add locations
                  </Link>
                }
              />
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="Saved locations"
            description="These are the locations that Explore can compare."
          />

          {locations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">
              No saved locations available.
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              {locations.map((location) => (
                <Panel key={location.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-semibold text-white">
                        {location.name ?? "Unnamed location"}
                      </div>

                      <div className="mt-1 text-sm text-slate-400">
                        {location.latitude}, {location.longitude}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="neutral">
                          {location.location_type ?? "Location"}
                        </Badge>

                        {location.water_type &&
                          location.water_type !== "Not applicable" && (
                            <Badge variant="info">
                              {location.water_type}
                            </Badge>
                          )}
                      </div>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="mt-8">
        <Card>
          <SectionTitle
            title="Location rankings"
            description={
                exploreScope === "discover"
                ? exploreMode === "week"
                    ? "Lumora searches nearby OpenStreetMap places and compares them across the next 7 days."
                    : "Lumora searches nearby OpenStreetMap places and compares them for your selected activity and date."
                : exploreMode === "week"
                    ? "Lumora compares saved locations across the next 7 days."
                    : "Lumora compares saved locations for your selected activity and date."
            }
            />

          {rankings.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No rankings yet"
                description={
                    exploreScope === "discover"
                    ? "Choose an activity, date, and radius, then discover nearby places."
                    : "Choose an activity and date, then rank your saved locations."
                }
                />
            </div>
          ) : (
            <>
              {defaultCandidateInsight && (
                <div className="mt-5 rounded-2xl border border-[rgb(var(--brand-warm-rgb)_/_0.25)] bg-[rgb(var(--brand-warm-rgb)_/_0.08)] p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-[rgb(var(--brand-warm-soft-rgb))]">
                    Default candidate insight
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {defaultCandidateInsight.locationName ?? "This location"}{" "}
                    appears in your top weekly Explore results{" "}
                    {defaultCandidateInsight.count} times. If that pattern
                    continues, it may be worth considering as a future default
                    for {activityLabel(selectedActivity)}.
                  </p>
                </div>
              )}

              <div className="mt-5 grid gap-3">
                {rankings.map((ranking, index) => {
                  const saveKey = getRankingKey(ranking);
                  const mapUrl =
                        ranking.map_url ?? googleMapsUrl(ranking.latitude, ranking.longitude);
                  const rankingReasons = buildRankingReasons(ranking, index);
  

                  return (
                    <Panel key={getRankingKey(ranking, index)}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[rgb(var(--brand-warm-soft-rgb))]">
                            #{index + 1}
                          </div>

                          <div className="mt-1 text-xl font-semibold text-white">
                            {ranking.location_name ?? "Unnamed location"}
                          </div>

                          <div className="mt-1 text-sm text-slate-300">
                            {activityLabel(ranking.activity)} ·{" "}
                            {formatFriendlyDate(ranking.date)}
                          </div>

                          <div className="mt-3 text-sm leading-6 text-slate-300">
                            {ranking.explanation}
                          </div>

                          {rankingReasons.length > 0 && (
                            <div className="mt-3 rounded-xl border border-slate-700/70 bg-white/[0.04] p-3">
                              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                Why this location
                              </div>

                              <ul className="mt-2 grid gap-1 text-sm text-slate-300">
                                {rankingReasons.map((reason, reasonIndex) => (
                                    <li key={`${reason}-${reasonIndex}`}>• {reason}</li>
                                    ))}
                              </ul>
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {getLocationBadges(ranking).map((badge) => (
                                <Badge key={badge.key} variant={badge.variant}>
                                    {badge.label}
                                </Badge>
                                ))}

                            {ranking.source && ranking.source !== "saved" && (
                                <Badge variant="neutral">
                                    {ranking.external_source ?? ranking.source}
                                </Badge>
                                )}

                            {ranking.recommended_window && (
                              <Badge variant="info">
                                {ranking.recommended_window}
                              </Badge>
                            )}

                            {ranking.weather_snapshot && (
                              <Badge variant="neutral">
                                {ranking.weather_snapshot.avg_temp ?? "?"}°F ·
                                wind {ranking.weather_snapshot.wind_max ?? "?"}{" "}
                                mph · rain{" "}
                                {ranking.weather_snapshot.rain_chance ?? "?"}%
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-2 sm:min-w-44">
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <div className="rounded-full bg-[rgb(var(--brand-warm-rgb)_/_0.18)] px-4 py-2 text-lg font-black text-white">
                              {ranking.planning_score ?? ranking.score}
                            </div>

                            <Badge variant="neutral">{ranking.label}</Badge>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => saveRankingAsPlan(ranking)}
                            disabled={savingPlanKey === saveKey}
                          >
                            {savingPlanKey === saveKey
                              ? "Saving..."
                              : "Save as plan"}
                          </Button>
                          
                          {ranking.source && ranking.source !== "saved" && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => saveDiscoveredAsLocation(ranking)}
                                disabled={savingLocationKey === saveKey}
                            >
                                {savingLocationKey === saveKey
                                ? "Saving location..."
                                : "Save location"}
                            </Button>
                            )}

                          {mapUrl && (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg bg-white/5 px-3 py-2 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                            >
                              Open map
                            </a>
                          )}
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>

              <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Window</th>
                      <th className="px-4 py-3">Temp</th>
                      <th className="px-4 py-3">Wind</th>
                      <th className="px-4 py-3">Rain</th>
                      <th className="px-4 py-3">Distance</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rankings.slice(0, 10).map((ranking, index) => (
                        <tr
                            key={`${getRankingKey(ranking, index)}-table`}
                            className="border-b border-slate-900 last:border-0"
                        >
                        <td className="px-4 py-3 font-medium text-white">
                          {ranking.location_name ?? "Unnamed"}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {formatFriendlyDate(ranking.date)}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {ranking.planning_score ?? ranking.score}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {ranking.recommended_window ?? "TBD"}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {ranking.weather_snapshot?.avg_temp ?? "?"}°F
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {ranking.weather_snapshot?.wind_max ?? "?"} mph
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {ranking.weather_snapshot?.rain_chance ?? "?"}%
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {formatDistance(ranking.distance_miles) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </section>
    </>
  );
}

function getRankingKey(ranking: LocationRanking, index?: number) {
  if (ranking.result_id) {
    return ranking.result_id;
  }

  const fallbackParts = [
    ranking.source ?? "saved",
    ranking.location_id ??
      ranking.external_id ??
      ranking.location_name ??
      "location",
    ranking.latitude ?? "lat",
    ranking.longitude ?? "lon",
    ranking.activity,
    ranking.date,
  ];

  if (index !== undefined) {
    fallbackParts.push(index);
  }

  return fallbackParts.join("-");
}

function googleMapsUrl(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return null;

  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function formatDistance(distance: number | null) {
  if (distance === null || distance === undefined) return null;

  if (distance < 0.1) {
    return "At home";
  }

  return `${distance.toFixed(1)} mi away`;
}

function getLocationBadges(ranking: LocationRanking) {
  const badges: {
    key: string;
    label: string;
    variant: "good" | "info" | "warning" | "danger" | "neutral";
  }[] = [];

  if (ranking.location_type) {
    badges.push({
      key: `location-type-${ranking.location_type}`,
      label: ranking.location_type,
      variant: ranking.location_type === "Home" ? "good" : "neutral",
    });
  }

  if (ranking.water_type && ranking.water_type !== "Not applicable") {
    badges.push({
      key: `water-type-${ranking.water_type}`,
      label: ranking.water_type,
      variant: "info",
    });
  }

  if (ranking.water_body_size && ranking.water_body_size !== "Not applicable") {
    badges.push({
      key: `water-body-size-${ranking.water_body_size}`,
      label: ranking.water_body_size,
      variant: "neutral",
    });
  }

  if (ranking.wind_exposure && ranking.wind_exposure !== "Not applicable") {
    badges.push({
      key: `wind-exposure-${ranking.wind_exposure}`,
      label: ranking.wind_exposure,
      variant:
        ranking.wind_exposure === "Sheltered"
          ? "good"
          : ranking.wind_exposure === "Open/exposed"
            ? "warning"
            : "neutral",
    });
  }

  if (ranking.use_usgs_water_data) {
    badges.push({
      key: "usgs",
      label: "USGS",
      variant: "good",
    });
  }

  if (ranking.use_ndbc_data) {
    badges.push({
      key: "ndbc",
      label: "NDBC",
      variant: "info",
    });
  }

  const distance = formatDistance(ranking.distance_miles);

  if (distance) {
    badges.push({
      key: `distance-${distance}`,
      label: distance,
      variant: "neutral",
    });
  }

  return badges;
}

function buildRankingReasons(ranking: LocationRanking, index: number) {
  const reasons: string[] = [];

  if (index === 0) {
    reasons.push("Highest planning score in this comparison");
  }

  if (
    ranking.recommended_window &&
    !ranking.recommended_window.includes("No clear")
  ) {
    reasons.push("Has a usable recommended window");
  }

  if (ranking.weather_snapshot?.wind_max !== undefined) {
    const wind = ranking.weather_snapshot.wind_max;

    if (wind !== null && wind <= 8) {
      reasons.push("Light wind");
    } else if (wind !== null && wind <= 15) {
      reasons.push("Manageable wind");
    }
  }

  if (ranking.weather_snapshot?.rain_chance !== undefined) {
    const rain = ranking.weather_snapshot.rain_chance;

    if (rain !== null && rain <= 20) {
      reasons.push("Low rain risk");
    }
  }

  if (ranking.water_type && ranking.water_type !== "Not applicable") {
    reasons.push("Relevant water context");
  }

  if (ranking.wind_exposure === "Sheltered") {
    reasons.push("Sheltered from wind");
  }

  if (ranking.use_usgs_water_data || ranking.use_ndbc_data) {
    reasons.push("Extra environmental data available");
  }

  return reasons.slice(0, 4);
}