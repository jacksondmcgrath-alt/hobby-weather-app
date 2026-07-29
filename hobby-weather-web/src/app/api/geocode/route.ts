import { NextRequest, NextResponse } from "next/server";

type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  source: string;
};

function extractCoordinatesFromText(text: string): GeocodeResult | null {
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

  if (atMatch) {
    return {
      label: "Coordinates from map link",
      latitude: Number(atMatch[1]),
      longitude: Number(atMatch[2]),
      source: "Coordinates",
    };
  }

  const plainMatch = text.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);

  if (plainMatch) {
    const latitude = Number(plainMatch[1]);
    const longitude = Number(plainMatch[2]);

    if (
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return {
        label: "Coordinates from text",
        latitude,
        longitude,
        source: "Coordinates",
      };
    }
  }

  return null;
}

async function searchNominatim(query: string): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");

  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "hobby-weather-planner/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data = await response.json();

  return data.map((item: any) => ({
    label: item.display_name ?? "Unknown location",
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    source: "OpenStreetMap",
  }));
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({
      results: [],
    });
  }

  const coordinateResult = extractCoordinatesFromText(query);

  if (coordinateResult) {
    return NextResponse.json({
      results: [coordinateResult],
    });
  }

  try {
    const results = await searchNominatim(query);

    return NextResponse.json({
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not search for location.",
      },
      {
        status: 500,
      }
    );
  }
}