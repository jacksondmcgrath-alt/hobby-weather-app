import { distanceMiles } from "@/lib/server/lumora/distance";
import {
  getOsmDiscoveryRulesForActivity,
  type OsmDiscoveryRule,
} from "@/lib/server/lumora/osmDiscoveryRules";
import type { LumoraLocationCandidate } from "@/lib/server/lumora/candidates";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string>;
};

type DiscoverOsmCandidatesInput = {
  activity: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  maxCandidates?: number;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function milesToMeters(miles: number) {
  return Math.round(miles * 1609.344);
}

function clampRadiusMiles(radiusMiles: number) {
  if (!Number.isFinite(radiusMiles)) return 25;

  return Math.max(1, Math.min(50, radiusMiles));
}

function escapeOverpassValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function selectorFromRule(rule: OsmDiscoveryRule) {
  return Object.entries(rule.tags)
    .map(
      ([key, value]) =>
        `["${escapeOverpassValue(key)}"="${escapeOverpassValue(value)}"]`
    )
    .join("");
}

function buildOverpassQuery({
  rules,
  latitude,
  longitude,
  radiusMeters,
  overpassLimit,
}: {
  rules: OsmDiscoveryRule[];
  latitude: number;
  longitude: number;
  radiusMeters: number;
  overpassLimit: number;
}) {
  const selectors = rules
    .map((rule) => selectorFromRule(rule))
    .filter(Boolean);

  const parts = selectors.flatMap((selector) => [
    `node${selector}(around:${radiusMeters},${latitude},${longitude});`,
    `way${selector}(around:${radiusMeters},${latitude},${longitude});`,
    `relation${selector}(around:${radiusMeters},${latitude},${longitude});`,
  ]);

  return `
[out:json][timeout:25];
(
${parts.join("\n")}
);
out center ${overpassLimit};
`;
}

async function fetchOverpass(query: string) {
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "lumora-weather-planner/1.0",
        },
        body: new URLSearchParams({
          data: query,
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Overpass error ${response.status} from ${endpoint}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not query OpenStreetMap.");
}

function getElementCoordinates(element: OverpassElement) {
  const latitude =
    element.type === "node" ? element.lat : element.center?.lat ?? element.lat;
  const longitude =
    element.type === "node" ? element.lon : element.center?.lon ?? element.lon;

  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude))
  ) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

function getOsmName(tags: Record<string, string> | undefined) {
  if (!tags) return null;

  return (
    tags.name ??
    tags.official_name ??
    tags.alt_name ??
    tags.operator ??
    tags.description ??
    null
  );
}

function humanizeOsmType(tags: Record<string, string> | undefined) {
  if (!tags) return "Outdoor location";

  if (tags.leisure === "park") return "Park";
  if (tags.leisure === "track") return "Track";
  if (tags.leisure === "pitch") {
    if (tags.sport === "tennis") return "Tennis Courts";
    if (tags.sport === "pickleball") return "Pickleball Courts";
    if (tags.sport === "basketball") return "Basketball Court";
    if (tags.sport === "soccer") return "Soccer Field";
    if (tags.sport === "baseball") return "Baseball Field";
    if (tags.sport === "volleyball") return "Volleyball Court";
    return "Sports Field";
  }

  if (tags.leisure === "golf_course") return "Golf Course";
  if (tags.leisure === "disc_golf_course") return "Disc Golf Course";
  if (tags.leisure === "nature_reserve") return "Nature Reserve";
  if (tags.leisure === "garden") return "Garden";
  if (tags.leisure === "marina") return "Marina";
  if (tags.leisure === "slipway") return "Boat Launch";
  if (tags.leisure === "swimming_area") return "Swimming Area";
  if (tags.leisure === "fitness_station") return "Fitness Station";

  if (tags.tourism === "camp_site") return "Campground";
  if (tags.tourism === "viewpoint") return "Viewpoint";
  if (tags.tourism === "picnic_site") return "Picnic Site";

  if (tags.natural === "beach") return "Beach";
  if (tags.natural === "wetland") return "Wetland";
  if (tags.natural === "water") return "Water";
  if (tags.water === "lake") return "Lake";
  if (tags.water === "pond") return "Pond";
  if (tags.waterway === "river") return "River";

  if (tags.boundary === "protected_area") return "Protected Area";

  if (tags.route === "hiking") return "Trail";
  if (tags.route === "bicycle") return "Bike Route";
  if (tags.route === "running") return "Running Route";

  if (tags["piste:type"]) return "Winter Recreation";

  return "Outdoor location";
}

function inferWaterType(tags: Record<string, string> | undefined) {
  if (!tags) return "Not applicable";

  if (tags.water === "lake") return "Freshwater lake";
  if (tags.water === "pond") return "Pond";
  if (tags.waterway === "river") return "River";
  if (tags.natural === "water") return "Unknown";
  if (tags.natural === "beach") return "Unknown";
  if (tags.leisure === "marina" || tags.leisure === "slipway") return "Unknown";

  return "Not applicable";
}

function inferWaterBodySize(tags: Record<string, string> | undefined) {
  if (!tags) return "Not applicable";

  if (tags.water === "pond") return "Pond";
  if (tags.water === "lake") return "Unknown";
  if (tags.waterway === "river") return "River";
  if (tags.natural === "water") return "Unknown";

  return "Not applicable";
}

function inferWindExposure(tags: Record<string, string> | undefined) {
  if (!tags) return "Unknown";

  if (
    tags.natural === "beach" ||
    tags.water === "lake" ||
    tags.leisure === "marina" ||
    tags.leisure === "slipway"
  ) {
    return "Open/exposed";
  }

  if (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.leisure === "nature_reserve"
  ) {
    return "Unknown";
  }

  return "Unknown";
}

function mapUrl(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function candidateApproxKey(candidate: LumoraLocationCandidate) {
  const name = normalizeText(candidate.name);
  const type = normalizeText(candidate.location_type);

  const latitude =
    candidate.latitude !== null && candidate.latitude !== undefined
      ? Number(candidate.latitude).toFixed(3)
      : "lat";

  const longitude =
    candidate.longitude !== null && candidate.longitude !== undefined
      ? Number(candidate.longitude).toFixed(3)
      : "lon";

  return `${name}|${type}|${latitude}|${longitude}`;
}

function dedupeCandidates(candidates: LumoraLocationCandidate[]) {
  const bySourceId = new Map<string, LumoraLocationCandidate>();

  for (const candidate of candidates) {
    bySourceId.set(candidate.source_id, candidate);
  }

  const byApproxPlace = new Map<string, LumoraLocationCandidate>();

  for (const candidate of bySourceId.values()) {
    const key = candidateApproxKey(candidate);
    const existing = byApproxPlace.get(key);

    if (!existing) {
      byApproxPlace.set(key, candidate);
      continue;
    }

    const existingScore =
      typeof existing.raw_source_data?.quality_score === "number"
        ? existing.raw_source_data.quality_score
        : 0;

    const candidateScore =
      typeof candidate.raw_source_data?.quality_score === "number"
        ? candidate.raw_source_data.quality_score
        : 0;

    if (candidateScore > existingScore) {
      byApproxPlace.set(key, candidate);
    }
  }

  return Array.from(byApproxPlace.values());
}

function qualityScore({
  element,
  latitude,
  longitude,
  originLatitude,
  originLongitude,
}: {
  element: OverpassElement;
  latitude: number;
  longitude: number;
  originLatitude: number;
  originLongitude: number;
}) {
  const tags = element.tags ?? {};
  let score = 0;

  if (getOsmName(tags)) score += 50;
  if (tags.leisure || tags.tourism || tags.natural || tags.water) score += 20;
  if (tags.sport) score += 10;

  const distance = distanceMiles({
    fromLat: originLatitude,
    fromLon: originLongitude,
    toLat: latitude,
    toLon: longitude,
  });

  score -= Math.min(distance, 50) * 0.5;

  return score;
}

function overpassElementToCandidate({
  element,
  originLatitude,
  originLongitude,
}: {
  element: OverpassElement;
  originLatitude: number;
  originLongitude: number;
}): LumoraLocationCandidate | null {
  const coordinates = getElementCoordinates(element);

  if (!coordinates) return null;

  const tags = element.tags ?? {};
  const osmName = getOsmName(tags);
  const locationType = humanizeOsmType(tags);

  const displayName =
    osmName ??
    `${locationType} near ${coordinates.latitude.toFixed(
      3
    )}, ${coordinates.longitude.toFixed(3)}`;

  return {
    source: "osm",
    source_id: `${element.type}-${element.id}`,

    saved_location_id: null,

    name: displayName,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,

    location_type: locationType,
    water_type: inferWaterType(tags),
    water_body_size: inferWaterBodySize(tags),
    wind_exposure: inferWindExposure(tags),

    manual_water_temp: null,
    use_usgs_water_data: false,
    usgs_site_id: null,
    use_ndbc_data: false,
    ndbc_station_id: null,

    notes: `Discovered from OpenStreetMap. OSM ${element.type}/${element.id}.`,

    map_url: mapUrl(coordinates.latitude, coordinates.longitude),
    external_id: String(element.id),
    external_type: element.type,
    external_source: "OpenStreetMap",
    raw_source_data: {
      type: element.type,
      id: element.id,
      tags,
      quality_score: qualityScore({
        element,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        originLatitude,
        originLongitude,
      }),
    },
  };
}

export async function discoverOsmCandidates({
  activity,
  latitude,
  longitude,
  radiusMiles,
  maxCandidates = 8,
}: DiscoverOsmCandidatesInput) {
  const safeRadiusMiles = clampRadiusMiles(radiusMiles);
  const radiusMeters = milesToMeters(safeRadiusMiles);

  const rules = getOsmDiscoveryRulesForActivity(activity);

  const query = buildOverpassQuery({
    rules,
    latitude,
    longitude,
    radiusMeters,
    overpassLimit: 75,
  });

  const data = await fetchOverpass(query);

  const elements = (data?.elements ?? []) as OverpassElement[];

  const candidates = elements
    .map((element) =>
      overpassElementToCandidate({
        element,
        originLatitude: latitude,
        originLongitude: longitude,
      })
    )
    .filter((item): item is LumoraLocationCandidate => item !== null);

  const deduped = dedupeCandidates(candidates);

  return deduped
    .sort((a, b) => {
      const aScore =
        typeof a.raw_source_data?.quality_score === "number"
          ? a.raw_source_data.quality_score
          : 0;

      const bScore =
        typeof b.raw_source_data?.quality_score === "number"
          ? b.raw_source_data.quality_score
          : 0;

      return bScore - aScore;
    })
    .slice(0, maxCandidates);
}