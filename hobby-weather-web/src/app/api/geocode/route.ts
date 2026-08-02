import { NextRequest, NextResponse } from "next/server";

type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  source: string;
};

type NominatimItem = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function extractCoordinatesFromText(text: string): GeocodeResult | null {
  const coordinatePattern = "(-?\\d+(?:\\.\\d+)?)";

  const atMatch = text.match(
    new RegExp(`@${coordinatePattern},${coordinatePattern}`)
  );

  if (atMatch) {
    const latitude = Number(atMatch[1]);
    const longitude = Number(atMatch[2]);

    if (isValidCoordinate(latitude, longitude)) {
      return {
        label: "Coordinates from map link",
        latitude,
        longitude,
        source: "Coordinates",
      };
    }
  }

  const plainMatch = text.match(
    new RegExp(`${coordinatePattern}\\s*,\\s*${coordinatePattern}`)
  );

  if (plainMatch) {
    const latitude = Number(plainMatch[1]);
    const longitude = Number(plainMatch[2]);

    if (isValidCoordinate(latitude, longitude)) {
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

  const data = (await response.json()) as NominatimItem[];

  return data
    .map((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);

      if (!isValidCoordinate(latitude, longitude)) {
        return null;
      }

      return {
        label: item.display_name ?? "Unknown location",
        latitude,
        longitude,
        source: "OpenStreetMap",
      };
    })
    .filter((item): item is GeocodeResult => item !== null);
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