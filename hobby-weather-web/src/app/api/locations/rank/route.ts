import { NextRequest, NextResponse } from "next/server";
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
import { authenticateApiRequest } from "@/lib/server/lumora/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type RankLocationsRequest = {
  activity?: string;
  date?: string;
  mode?: "day" | "week";
};

export async function POST(request: NextRequest) {

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

  const auth = await authenticateApiRequest(request);

    if (!auth.ok) {
    return auth.response;
    }

    const { user, admin } = auth;

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