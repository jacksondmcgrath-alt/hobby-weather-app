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
import { rankSavedLocationsForExplore } from "@/lib/server/lumora/rankCandidates";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseAdmin = any;

type RankLocationsRequest = {
  activity?: string;
  date?: string;
  mode?: "day" | "week";
};

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Server is missing Supabase environment variables for location ranking.",
      },
      { status: 500 }
    );
  }

  let body: RankLocationsRequest = {};

  try {
    body = (await request.json()) as RankLocationsRequest;
  } catch {
    body = {};
  }

  const activity = body.activity?.trim();
  const selectedDate = body.date?.trim();
  const mode = body.mode ?? "day";

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

  const targetDates = mode === "week" ? getWeekDates() : [selectedDate as string];

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

    if (validLocations.length === 0) {
      return NextResponse.json(
        {
          error: "Add at least one saved location before using Explore.",
        },
        { status: 400 }
      );
    }

    const rankings = await rankSavedLocationsForExplore({
        admin,
        locations: validLocations,
        homeLocation,
        activity,
        targetDates,
        preferences,
        obligations,
    });

    const limitedRankings = mode === "week" ? rankings.slice(0, 15) : rankings;

    return NextResponse.json({
      ok: true,
      message: `Ranked ${limitedRankings.length} saved location option${
        limitedRankings.length === 1 ? "" : "s"
      }.`,
      rankings: limitedRankings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not rank locations.",
      },
      { status: 500 }
    );
  }
}