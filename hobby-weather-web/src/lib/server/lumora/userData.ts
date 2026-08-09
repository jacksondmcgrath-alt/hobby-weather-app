import type { WeeklyObligation } from "@/lib/predictions/windowScoring";
import {
  hasValidCoordinates,
  roundedDistanceMiles,
} from "@/lib/server/lumora/distance";

export type SupabaseAdminLike = any;

export type SavedLocation = {
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

export type LocationContext = {
  saved_location_id: number;
  location_name: string | null;
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

export async function loadSavedLocations(
  admin: SupabaseAdminLike,
  userId: string
) {
  const { data, error } = await admin
    .from("saved_locations")
    .select("*")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []) as SavedLocation[];
}

export async function loadWeeklyObligations(
  admin: SupabaseAdminLike,
  userId: string
) {
  const { data, error } = await admin
    .from("weekly_obligations")
    .select("id,label,day_of_week,start_time,end_time,active")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) throw error;

  return (data ?? []) as WeeklyObligation[];
}

export function getValidSavedLocations(locations: SavedLocation[]) {
  return locations.filter((location) => hasValidCoordinates(location));
}

export function findHomeLocation(locations: SavedLocation[]) {
  return (
    locations.find(
      (location) => location.location_type?.toLowerCase() === "home"
    ) ?? null
  );
}

export function buildLocationContext(
  location: SavedLocation
): LocationContext {
  return {
    saved_location_id: location.id,
    location_name: location.name,
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
  };
}

export function distanceFromHomeMiles(
  homeLocation: SavedLocation | null,
  location: SavedLocation
) {
  if (!homeLocation) return null;

  if (!hasValidCoordinates(homeLocation) || !hasValidCoordinates(location)) {
    return null;
  }

  return roundedDistanceMiles({
    fromLat: Number(homeLocation.latitude),
    fromLon: Number(homeLocation.longitude),
    toLat: Number(location.latitude),
    toLon: Number(location.longitude),
  });
}