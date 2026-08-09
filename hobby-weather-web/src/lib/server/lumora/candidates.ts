import {
  hasValidCoordinates,
  roundedDistanceMiles,
} from "@/lib/server/lumora/distance";
import type { SavedLocation } from "@/lib/server/lumora/userData";

export type LumoraLocationSource = "saved" | "osm";

export type LumoraLocationCandidate = {
  source: LumoraLocationSource;
  source_id: string;

  saved_location_id: number | null;

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

  map_url?: string | null;
  external_id?: string | null;
  external_type?: string | null;
  external_source?: string | null;
  raw_source_data?: Record<string, unknown> | null;
};

export type CandidateOrigin = {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
} | null;

export function savedLocationToCandidate(
  location: SavedLocation
): LumoraLocationCandidate {
  return {
    source: "saved",
    source_id: String(location.id),

    saved_location_id: location.id,

    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,

    location_type: location.location_type,
    water_type: location.water_type,
    water_body_size: location.water_body_size,
    wind_exposure: location.wind_exposure,

    manual_water_temp: location.manual_water_temp,
    use_usgs_water_data: location.use_usgs_water_data,
    usgs_site_id: location.usgs_site_id,
    use_ndbc_data: location.use_ndbc_data,
    ndbc_station_id: location.ndbc_station_id,

    notes: location.notes,

    map_url:
      location.latitude !== null && location.longitude !== null
        ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
        : null,
    external_id: null,
    external_type: null,
    external_source: null,
    raw_source_data: null,
  };
}

export function savedLocationsToCandidates(
  locations: SavedLocation[]
): LumoraLocationCandidate[] {
  return locations.map(savedLocationToCandidate);
}

export function buildCandidateLocationContext(
  candidate: LumoraLocationCandidate
) {
  return {
    source: candidate.source,
    source_id: candidate.source_id,

    saved_location_id: candidate.saved_location_id,
    location_name: candidate.name,
    latitude: candidate.latitude,
    longitude: candidate.longitude,

    location_type: candidate.location_type,
    water_type: candidate.water_type,
    water_body_size: candidate.water_body_size,
    wind_exposure: candidate.wind_exposure,

    manual_water_temp: candidate.manual_water_temp,
    use_usgs_water_data: candidate.use_usgs_water_data,
    usgs_site_id: candidate.usgs_site_id,
    use_ndbc_data: candidate.use_ndbc_data,
    ndbc_station_id: candidate.ndbc_station_id,

    notes: candidate.notes,

    map_url: candidate.map_url ?? null,
    external_id: candidate.external_id ?? null,
    external_type: candidate.external_type ?? null,
    external_source: candidate.external_source ?? null,
  };
}

export function distanceFromOriginMiles(
  origin: CandidateOrigin,
  candidate: LumoraLocationCandidate
) {
  if (!origin) return null;

  if (!hasValidCoordinates(origin) || !hasValidCoordinates(candidate)) {
    return null;
  }

  return roundedDistanceMiles({
    fromLat: Number(origin.latitude),
    fromLon: Number(origin.longitude),
    toLat: Number(candidate.latitude),
    toLon: Number(candidate.longitude),
  });
}