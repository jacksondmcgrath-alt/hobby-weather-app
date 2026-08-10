import type { SupabaseAdminClient } from "@/lib/server/lumora/auth";
import {
  findHomeLocation,
  type SavedLocation,
} from "@/lib/server/lumora/userData";
import { hasValidCoordinates } from "@/lib/server/lumora/distance";

export type ActivityDefault = {
  activity: string | null;
  saved_location_id: number | null;
};

export async function loadActivityDefaults(
  admin: SupabaseAdminClient,
  userId: string
) {
  const { data, error } = await admin
    .from("activity_location_defaults")
    .select("activity,saved_location_id")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []) as ActivityDefault[];
}

export function findFirstValidLocation(locations: SavedLocation[]) {
  return locations.find((location) => hasValidCoordinates(location)) ?? null;
}

export function buildActivityLocationMap(
  locations: SavedLocation[],
  defaults: ActivityDefault[],
  enabledActivities: string[]
) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const fallback = findHomeLocation(locations) ?? findFirstValidLocation(locations);

  const map = new Map<string, SavedLocation>();

  for (const activity of enabledActivities) {
    const defaultRow = defaults.find((item) => item.activity === activity);

    const defaultLocation =
      defaultRow?.saved_location_id !== null &&
      defaultRow?.saved_location_id !== undefined
        ? byId.get(defaultRow.saved_location_id)
        : undefined;

    if (defaultLocation) {
      map.set(activity, defaultLocation);
    } else if (fallback) {
      map.set(activity, fallback);
    }
  }

  return map;
}