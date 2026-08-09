import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ACTIVITY_OPTIONS } from "@/lib/activityMeta";
import {
  getWeekDates,
  isDateInAllowedWindow,
} from "@/lib/server/lumora/dates";
import { loadPreferences } from "@/lib/server/lumora/preferences";
import {
  findHomeLocation,
  getValidSavedLocations,
  loadSavedLocations,
  loadWeeklyObligations,
} from "@/lib/server/lumora/userData";
import { discoverOsmCandidates } from "@/lib/server/lumora/osmDiscovery";
import { rankLocationCandidatesForExplore } from "@/lib/server/lumora/rankCandidates";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseAdmin = any;

type DiscoverLocationsRequest = {
  activity?: string;
  date?: string;
  mode?: "day" | "week";
  radiusMiles?: number;
};

function normalizeRadiusMiles(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 25;

  return Math.max(1, Math.min(50, parsed));
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Server is missing Supabase environment variables for location discovery.",
      },
      { status: 500 }
    );
  }

  let body: DiscoverLocationsRequest = {};

  try {
    body = (await request.json()) as DiscoverLocationsRequest;
  } catch {
    body = {};
  }

  const activity = body.activity?.trim();
  const selectedDate = body.date?.trim();
  const mode = body.mode ?? "day";
  const radiusMiles = normalizeRadiusMiles(body.radiusMiles);

  if (!activity || !ACTIVITY_OPTIONS.includes(activity)) {
    return NextResponse.json(
      { error: "Choose a valid activity." },
      { status: 400 }
    );
  }

  if (mode === "day" && (!selectedDate || !isDateInAllowedWindow(selectedDate))) {
    return NextResponse.json(
      { error: "Choose a valid date in the next 14 days." },
      { status: 400 }
    );
  }

  const targetDates =
    mode === "week" ? getWeekDates() : [selectedDate as string];

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing authorization token." },
      { status: 401 }
    );
  }

  const accessToken = authHeader.replace("Bearer ", "");

  const authClient = createClient(supabaseUrl, supabaseAnonKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json(
      { error: "Could not verify user." },
      { status: 401 }
    );
  }

  const admin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey
  ) as SupabaseAdmin;

  try {
    const preferences = await loadPreferences(admin, user.id);
    const obligations = await loadWeeklyObligations(admin, user.id);

    const locations = await loadSavedLocations(admin, user.id);
    const validLocations = getValidSavedLocations(locations);
    const homeLocation = findHomeLocation(validLocations);

    if (!homeLocation) {
      return NextResponse.json(
        {
          error:
            "Add a saved Home location before using nearby discovery. Lumora uses Home as the search origin for now.",
        },
        { status: 400 }
      );
    }

    if (homeLocation.latitude === null || homeLocation.longitude === null) {
      return NextResponse.json(
        {
          error:
            "Your saved Home location is missing coordinates. Update it before using nearby discovery.",
        },
        { status: 400 }
      );
    }

    const maxCandidates = mode === "week" ? 6 : 8;

    const candidates = await discoverOsmCandidates({
      activity,
      latitude: Number(homeLocation.latitude),
      longitude: Number(homeLocation.longitude),
      radiusMiles,
      maxCandidates,
    });

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        message: `No nearby OpenStreetMap candidates found within ${radiusMiles} mile${
          radiusMiles === 1 ? "" : "s"
        }. Try a larger radius or a different activity.`,
        rankings: [],
      });
    }

    const rankings = await rankLocationCandidatesForExplore({
        admin,
        candidates,
        originLocation: homeLocation,
        activity,
        targetDates,
        preferences,
        obligations,
    });

    const limitedRankings = mode === "week" ? rankings.slice(0, 15) : rankings;

    return NextResponse.json({
        ok: true,
        message: `Discovered and ranked ${limitedRankings.length} nearby option${
            limitedRankings.length === 1 ? "" : "s"
        } from OpenStreetMap.`,
        rankings: limitedRankings,
        discovery: {
            source: "OpenStreetMap",
            radius_miles: radiusMiles,
            candidates_found: candidates.length,
            rankings_returned: limitedRankings.length,
            mode,
            activity,
            target_dates: targetDates,
            origin_location_id: homeLocation.id,
            origin_location_name: homeLocation.name,
        },
        });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not discover nearby locations.",
      },
      { status: 500 }
    );
  }
}