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

type OverpassResponse = {
  elements?: OverpassElement[];
  remark?: string;
};

type DiscoverOsmCandidatesInput = {
  activity: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  maxCandidates?: number;
};

type OverpassRequestMethod = "post-form" | "get";

type OverpassEndpoint = {
  url: string;
  timeoutMs: number;
  method: OverpassRequestMethod;
};

type DiscoveryCacheAdmin = any;

export type DiscoverOsmCandidatesResult = {
  candidates: LumoraLocationCandidate[];
  cacheStatus: "hit" | "miss" | "stale";
};

export class OsmDiscoveryError extends Error {
  status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "OsmDiscoveryError";
    this.status = status;
  }
}

const OVERPASS_ENDPOINTS: OverpassEndpoint[] = [
  {
    url: "https://overpass-api.de/api/interpreter",
    timeoutMs: 20_000,
    method: "get",
  },
  {
    url: "https://overpass.private.coffee/api/interpreter",
    timeoutMs: 10_000,
    method: "post-form",
  },
  {
    url: "https://overpass.kumi.systems/api/interpreter",
    timeoutMs: 10_000,
    method: "post-form",
  },
];

const OSM_DISCOVERY_CACHE_TYPE = "osm_discovery_candidates_v4";
const OSM_DISCOVERY_CACHE_SOURCE = "openstreetmap_overpass";
const OSM_DISCOVERY_CACHE_TTL_HOURS = 24;
const OSM_DISCOVERY_RULES_VERSION = "rules-v4";

function clampRadiusMiles(radiusMiles: number) {
  if (!Number.isFinite(radiusMiles)) return 25;

  return Math.max(1, Math.min(50, radiusMiles));
}

function normalizeActivityForCache(activity: string) {
  return activity
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function osmDiscoveryCacheKey({
  activity,
  latitude,
  longitude,
  radiusMiles,
}: {
  activity: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}) {
  return [
    latitude.toFixed(2),
    longitude.toFixed(2),
    normalizeActivityForCache(activity),
    radiusMiles.toFixed(1),
    OSM_DISCOVERY_RULES_VERSION,
  ].join("|");
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function parseCachedCandidates(
  value: unknown
): LumoraLocationCandidate[] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as {
    candidates?: unknown;
  };

  if (!Array.isArray(data.candidates)) {
    return null;
  }

  return data.candidates as LumoraLocationCandidate[];
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

function ruleUsesRelations(rule: OsmDiscoveryRule) {
  return (
    "route" in rule.tags ||
    "boundary" in rule.tags ||
    "piste:type" in rule.tags
  );
}

function buildOverpassQuery({
  rules,
  latitude,
  longitude,
  radiusMiles,
  overpassLimit,
  requireName = true,
  ruleLimit = 3,
}: {
  rules: OsmDiscoveryRule[];
  latitude: number;
  longitude: number;
  radiusMiles: number;
  overpassLimit: number;
  requireName?: boolean;
  ruleLimit?: number;
}) {
  const radiusMeters = Math.round(
    clampRadiusMiles(radiusMiles) * 1609.344
  );

  const selectedRules = rules.slice(0, ruleLimit);

  const parts = selectedRules.flatMap((rule) => {
    const selector = selectorFromRule(rule);

    if (!selector) return [];

    const nameSelector = requireName ? '["name"]' : "";

    const queryParts = [
      `node${selector}${nameSelector}(around:${radiusMeters},${latitude},${longitude});`,
      `way${selector}${nameSelector}(around:${radiusMeters},${latitude},${longitude});`,
    ];

    if (requireName && ruleUsesRelations(rule)) {
      queryParts.push(
        `relation${selector}["name"](around:${radiusMeters},${latitude},${longitude});`
      );
    }

    return queryParts;
  });

  return `
[out:json][timeout:12];
(
${parts.join("\n")}
);
out center ${overpassLimit};
`;
}

function buildOverpassRequest(
  endpoint: OverpassEndpoint,
  query: string,
  signal: AbortSignal
): {
  url: string;
  init: RequestInit;
} {
  const commonHeaders = {
    Accept: "application/json",
    "User-Agent": "Lumora/0.1",
  };

  if (endpoint.method === "get") {
    const url = new URL(endpoint.url);
    url.searchParams.set("data", query);

    return {
      url: url.toString(),
      init: {
        method: "GET",
        headers: commonHeaders,
        cache: "no-store",
        signal,
      },
    };
  }

  return {
    url: endpoint.url,
    init: {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({
        data: query,
      }).toString(),
      cache: "no-store",
      signal,
    },
  };
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  const failures: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      endpoint.timeoutMs
    );

    const startedAt = Date.now();

    try {
      const request = buildOverpassRequest(
        endpoint,
        query,
        controller.signal
      );

      if (process.env.NODE_ENV === "development") {
        console.log("Overpass request started:", {
          endpoint: endpoint.url,
          method: endpoint.method,
          timeoutMs: endpoint.timeoutMs,
        });
      }

      const response = await fetch(request.url, request.init);

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");

        throw new Error(
          `Status ${response.status}${
            responseText
              ? `: ${responseText.slice(0, 200)}`
              : ""
          }`
        );
      }

      const data = (await response.json()) as OverpassResponse;

      if (data.remark) {
        throw new Error(`Overpass remark: ${data.remark}`);
      }

      if (process.env.NODE_ENV === "development") {
        console.log("Overpass request completed:", {
          endpoint: endpoint.url,
          method: endpoint.method,
          elapsedMs: Date.now() - startedAt,
          elements: Array.isArray(data.elements)
            ? data.elements.length
            : 0,
        });
      }

      return data;
    } catch (error) {
      const aborted =
        error instanceof Error && error.name === "AbortError";

      const message = aborted
        ? `Timed out after ${endpoint.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Unknown request failure";

      failures.push(
        `${endpoint.url} (${endpoint.method}): ${message}`
      );

      console.warn("Overpass endpoint failed:", {
        endpoint: endpoint.url,
        method: endpoint.method,
        elapsedMs: Date.now() - startedAt,
        message,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.error("All Overpass endpoints failed:", failures);
  }

  throw new OsmDiscoveryError(
    "Nearby place discovery is temporarily unavailable because the OpenStreetMap search service did not respond. Please try again shortly or use My saved places.",
    503
  );
}

function getElementCoordinates(element: OverpassElement) {
  const latitude =
    element.type === "node"
      ? element.lat
      : element.center?.lat ?? element.lat;

  const longitude =
    element.type === "node"
      ? element.lon
      : element.center?.lon ?? element.lon;

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
  if (tags.leisure === "disc_golf_course") {
    return "Disc Golf Course";
  }

  if (tags.leisure === "nature_reserve") {
    return "Nature Reserve";
  }

  if (tags.leisure === "garden") return "Garden";
  if (tags.leisure === "marina") return "Marina";
  if (tags.leisure === "slipway") return "Boat Launch";
  if (tags.leisure === "swimming_area") return "Swimming Area";
  if (tags.leisure === "fitness_station") {
    return "Fitness Station";
  }

  if (tags.tourism === "camp_site") return "Campground";
  if (tags.tourism === "viewpoint") return "Viewpoint";
  if (tags.tourism === "picnic_site") return "Picnic Site";

  if (tags.natural === "beach") return "Beach";
  if (tags.natural === "wetland") return "Wetland";
  if (tags.natural === "water") return "Water";

  if (tags.water === "lake") return "Lake";
  if (tags.water === "pond") return "Pond";
  if (tags.waterway === "river") return "River";

  if (tags.boundary === "protected_area") {
    return "Protected Area";
  }

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

  if (
    tags.leisure === "marina" ||
    tags.leisure === "slipway"
  ) {
    return "Unknown";
  }

  return "Not applicable";
}

function inferWaterBodySize(
  tags: Record<string, string> | undefined
) {
  if (!tags) return "Not applicable";

  if (tags.water === "pond") return "Pond";
  if (tags.water === "lake") return "Unknown";
  if (tags.waterway === "river") return "River";
  if (tags.natural === "water") return "Unknown";

  return "Not applicable";
}

function inferWindExposure(
  tags: Record<string, string> | undefined
) {
  if (!tags) return "Unknown";

  if (
    tags.natural === "beach" ||
    tags.water === "lake" ||
    tags.leisure === "marina" ||
    tags.leisure === "slipway"
  ) {
    return "Open/exposed";
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
    candidate.latitude !== null &&
    candidate.latitude !== undefined
      ? Number(candidate.latitude).toFixed(3)
      : "lat";

  const longitude =
    candidate.longitude !== null &&
    candidate.longitude !== undefined
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
  if (
    tags.leisure ||
    tags.tourism ||
    tags.natural ||
    tags.water
  ) {
    score += 20;
  }

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

    map_url: mapUrl(
      coordinates.latitude,
      coordinates.longitude
    ),
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

async function discoverOsmCandidatesDirect({
  activity,
  latitude,
  longitude,
  radiusMiles,
  maxCandidates = 8,
}: DiscoverOsmCandidatesInput) {
  const safeRadiusMiles = clampRadiusMiles(radiusMiles);
  const rules = getOsmDiscoveryRulesForActivity(activity);

  if (process.env.NODE_ENV === "development") {
    console.log("OSM discovery search input:", {
      activity,
      latitude,
      longitude,
      radiusMiles: safeRadiusMiles,
      rules: rules.slice(0, 3).map((rule) => rule.tags),
    });
  }

  const namedQuery = buildOverpassQuery({
    rules,
    latitude,
    longitude,
    radiusMiles: safeRadiusMiles,
    overpassLimit: 20,
    requireName: true,
    ruleLimit: 3,
  });

  const namedData = await fetchOverpass(namedQuery);
  let elements = namedData.elements ?? [];

  if (process.env.NODE_ENV === "development") {
    console.log("Named OSM discovery result:", {
      activity,
      radiusMiles: safeRadiusMiles,
      elements: elements.length,
    });
  }

  if (elements.length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "No named OpenStreetMap candidates found; trying broader node/way search."
      );
    }

    const broaderQuery = buildOverpassQuery({
      rules,
      latitude,
      longitude,
      radiusMiles: safeRadiusMiles,
      overpassLimit: 20,
      requireName: false,
      ruleLimit: 2,
    });

    const broaderData = await fetchOverpass(broaderQuery);
    elements = broaderData.elements ?? [];

    if (process.env.NODE_ENV === "development") {
      console.log("Broader OSM discovery result:", {
        activity,
        radiusMiles: safeRadiusMiles,
        elements: elements.length,
      });
    }
  }

  const candidates = elements
    .map((element) =>
      overpassElementToCandidate({
        element,
        originLatitude: latitude,
        originLongitude: longitude,
      })
    )
    .filter(
      (item): item is LumoraLocationCandidate => item !== null
    );
    if (process.env.NODE_ENV === "development") {
      console.log("Converted OSM discovery candidates:", {
        activity,
        elements: elements.length,
        candidates: candidates.length,
      });
    }

  return dedupeCandidates(candidates)
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

export async function discoverOsmCandidates({
  admin,
  activity,
  latitude,
  longitude,
  radiusMiles,
  maxCandidates = 8,
}: DiscoverOsmCandidatesInput & {
  admin?: DiscoveryCacheAdmin;
}): Promise<DiscoverOsmCandidatesResult> {
  const safeRadiusMiles = clampRadiusMiles(radiusMiles);

  if (!admin) {
    const candidates = await discoverOsmCandidatesDirect({
      activity,
      latitude,
      longitude,
      radiusMiles: safeRadiusMiles,
      maxCandidates,
    });

    return {
      candidates,
      cacheStatus: "miss",
    };
  }

  const cacheKey = osmDiscoveryCacheKey({
    activity,
    latitude,
    longitude,
    radiusMiles: safeRadiusMiles,
  });

  const nowIso = new Date().toISOString();

  const { data: freshRow, error: freshReadError } = await admin
    .from("environment_cache")
    .select("data_json,expires_at")
    .eq("data_type", OSM_DISCOVERY_CACHE_TYPE)
    .eq("source", OSM_DISCOVERY_CACHE_SOURCE)
    .eq("cache_key", cacheKey)
    .gt("expires_at", nowIso)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (freshReadError) {
    console.warn(
      "Could not read fresh OSM discovery cache:",
      freshReadError
    );
  }

  if (!freshReadError && freshRow?.data_json) {
    const cachedCandidates = parseCachedCandidates(
      freshRow.data_json
    );

    // During discovery-rule tuning, do not let an empty cached result
    // prevent a fresh search.
    if (cachedCandidates && cachedCandidates.length > 0) {
      return {
        candidates: cachedCandidates.slice(0, maxCandidates),
        cacheStatus: "hit",
      };
    }
  }

  const { data: staleRow, error: staleReadError } = await admin
    .from("environment_cache")
    .select("data_json,expires_at")
    .eq("data_type", OSM_DISCOVERY_CACHE_TYPE)
    .eq("source", OSM_DISCOVERY_CACHE_SOURCE)
    .eq("cache_key", cacheKey)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (staleReadError) {
    console.warn(
      "Could not read stale OSM discovery cache:",
      staleReadError
    );
  }

  try {
    const candidates = await discoverOsmCandidatesDirect({
      activity,
      latitude,
      longitude,
      radiusMiles: safeRadiusMiles,
      maxCandidates,
    });

    const fetchedAt = new Date();

    if (candidates.length > 0) {
      const { error: cacheWriteError } = await admin
        .from("environment_cache")
        .upsert(
          {
            cache_key: cacheKey,
            location_id: null,
            data_type: OSM_DISCOVERY_CACHE_TYPE,
            source: OSM_DISCOVERY_CACHE_SOURCE,

            data_json: {
              activity,
              latitude_rounded: Number(latitude.toFixed(2)),
              longitude_rounded: Number(longitude.toFixed(2)),
              radius_miles: Number(safeRadiusMiles.toFixed(1)),
              rules_version: OSM_DISCOVERY_RULES_VERSION,
              candidates,
            },

            fetched_at: fetchedAt.toISOString(),
            expires_at: addHours(
              fetchedAt,
              OSM_DISCOVERY_CACHE_TTL_HOURS
            ).toISOString(),

            job_source: "nextjs_discovery",
            updated_at: fetchedAt.toISOString(),
          },
          {
            onConflict: "data_type,source,cache_key",
          }
        );

      if (cacheWriteError) {
        console.warn(
          "Could not write OSM discovery cache:",
          cacheWriteError
        );
      }
    }

    return {
      candidates,
      cacheStatus: "miss",
    };
  } catch (error) {
    if (staleRow?.data_json) {
      const staleCandidates = parseCachedCandidates(
        staleRow.data_json
      );

      if (staleCandidates && staleCandidates.length > 0) {
        console.warn(
          "Using stale OSM discovery cache after Overpass failure."
        );

        return {
          candidates: staleCandidates.slice(0, maxCandidates),
          cacheStatus: "stale",
        };
      }
    }

    throw error;
  }
}