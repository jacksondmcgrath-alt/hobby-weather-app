export type PreferenceGroup = "core" | "activity";

export type PreferenceDefinition = {
  key: string;
  label: string;
  help: string;
  defaultValue: number;
  group: PreferenceGroup;
  subgroup: string;
  activities?: string[];
};

export const CORE_PREFERENCE_DEFINITIONS = [
  {
    key: "rain_caution",
    label: "Rain caution",
    help: "0 = rain does not bother me, 10 = avoid rain strongly",
    defaultValue: 6,
    group: "core",
    subgroup: "Weather comfort",
  },
  {
    key: "storm_caution",
    label: "Storm caution",
    help: "Higher means storm risk lowers recommendations more strongly",
    defaultValue: 8,
    group: "core",
    subgroup: "Weather comfort",
  },
  {
    key: "general_heat_sensitivity",
    label: "Heat sensitivity",
    help: "Higher means warm or hot weather hurts active outdoor scores more",
    defaultValue: 6,
    group: "core",
    subgroup: "Temperature comfort",
  },
  {
    key: "cold_sensitivity",
    label: "Cold sensitivity",
    help: "Higher means cold weather hurts comfort-focused activities more",
    defaultValue: 5,
    group: "core",
    subgroup: "Temperature comfort",
  },
  {
    key: "humidity_sensitivity",
    label: "Humidity sensitivity",
    help: "Higher means sticky or high-dew-point conditions hurt comfort more",
    defaultValue: 6,
    group: "core",
    subgroup: "Air comfort",
  },
  {
    key: "aqi_sensitivity",
    label: "Air quality sensitivity",
    help: "Higher means AQI concerns hurt active outdoor scores more",
    defaultValue: 6,
    group: "core",
    subgroup: "Air comfort",
  },
  {
    key: "uv_sensitivity",
    label: "UV sensitivity",
    help: "Higher means strong sun/UV hurts outdoor comfort more",
    defaultValue: 5,
    group: "core",
    subgroup: "Sun comfort",
  },
  {
    key: "bug_tolerance",
    label: "Bug tolerance",
    help: "0 = I hate bugs, 10 = bugs do not bother me much",
    defaultValue: 5,
    group: "core",
    subgroup: "Outdoor comfort",
  },
  {
    key: "wind_sensitivity",
    label: "Wind sensitivity",
    help: "Higher means wind hurts general comfort more",
    defaultValue: 6,
    group: "core",
    subgroup: "Outdoor comfort",
  },
  {
    key: "schedule_strictness",
    label: "Schedule strictness",
    help: "Higher means Lumora should avoid busy or uncertain windows more strongly",
    defaultValue: 7,
    group: "core",
    subgroup: "Planning",
  },
] as const satisfies readonly PreferenceDefinition[];

export const ACTIVITY_PREFERENCE_DEFINITIONS = [
  {
    key: "fishing_bug_boost",
    label: "Fishing insect activity importance",
    help: "Higher means bug/insect activity helps fishing more",
    defaultValue: 6,
    group: "activity",
    subgroup: "Fishing",
    activities: ["Fishing", "Ice Fishing"],
  },
  {
    key: "fishing_wind_tolerance",
    label: "Fishing wind tolerance",
    help: "Higher means you are more okay with wind while fishing",
    defaultValue: 6,
    group: "activity",
    subgroup: "Fishing",
    activities: ["Fishing", "Ice Fishing"],
  },
  {
    key: "fishing_pressure_importance",
    label: "Fishing pressure importance",
    help: "Higher means pressure trends matter more for fishing scores",
    defaultValue: 6,
    group: "activity",
    subgroup: "Fishing",
    activities: ["Fishing", "Ice Fishing"],
  },
  {
    key: "fishing_water_temp_importance",
    label: "Fishing water temperature importance",
    help: "Higher means water temperature matters more for fishing scores",
    defaultValue: 7,
    group: "activity",
    subgroup: "Fishing",
    activities: ["Fishing", "Ice Fishing"],
  },
  {
    key: "camping_bug_sensitivity",
    label: "Camping bug sensitivity",
    help: "Higher means bugs hurt camping scores more",
    defaultValue: 8,
    group: "activity",
    subgroup: "Camping",
    activities: ["Camping"],
  },
  {
    key: "camping_ground_wetness_sensitivity",
    label: "Camping ground wetness sensitivity",
    help: "Higher means wet or muddy ground hurts camping more",
    defaultValue: 7,
    group: "activity",
    subgroup: "Camping",
    activities: ["Camping"],
  },
  {
    key: "running_wind_sensitivity",
    label: "Running wind sensitivity",
    help: "Higher means wind hurts running scores more",
    defaultValue: 6,
    group: "activity",
    subgroup: "Running",
    activities: ["Running"],
  },
  {
    key: "running_heat_sensitivity",
    label: "Running heat sensitivity",
    help: "Higher means warm weather hurts running scores more",
    defaultValue: 7,
    group: "activity",
    subgroup: "Running",
    activities: ["Running"],
  },
  {
    key: "cycling_wind_sensitivity",
    label: "Cycling wind sensitivity",
    help: "Higher means wind and gusts hurt cycling scores more",
    defaultValue: 7,
    group: "activity",
    subgroup: "Cycling",
    activities: ["Cycling"],
  },
  {
    key: "hiking_bug_sensitivity",
    label: "Hiking bug sensitivity",
    help: "Higher means bugs hurt hiking scores more",
    defaultValue: 6,
    group: "activity",
    subgroup: "Hiking",
    activities: ["Hiking"],
  },
  {
    key: "kayaking_wind_caution",
    label: "Paddling wind caution",
    help: "Higher means wind/gusts hurt kayaking, canoeing, and paddleboarding scores more",
    defaultValue: 8,
    group: "activity",
    subgroup: "Paddling",
    activities: ["Kayaking", "Canoeing", "Paddleboarding"],
  },
  {
    key: "paddling_water_temp_caution",
    label: "Paddling water temperature caution",
    help: "Higher means cold water hurts paddling scores more",
    defaultValue: 7,
    group: "activity",
    subgroup: "Paddling",
    activities: ["Kayaking", "Canoeing", "Paddleboarding"],
  },
  {
    key: "disc_golf_wind_sensitivity",
    label: "Disc golf wind sensitivity",
    help: "Higher means wind hurts disc golf scores more",
    defaultValue: 6,
    group: "activity",
    subgroup: "Disc Golf",
    activities: ["Disc Golf"],
  },
  {
    key: "beach_uv_sensitivity",
    label: "Beach UV sensitivity",
    help: "Higher means strong sun/UV hurts beach and swimming scores more",
    defaultValue: 6,
    group: "activity",
    subgroup: "Beach and Swimming",
    activities: ["Beach Day", "Swimming"],
  },
  {
    key: "beach_wind_sensitivity",
    label: "Beach wind sensitivity",
    help: "Higher means wind hurts beach and swimming comfort more",
    defaultValue: 5,
    group: "activity",
    subgroup: "Beach and Swimming",
    activities: ["Beach Day", "Swimming"],
  },
  {
    key: "photography_cloud_preference",
    label: "Photography cloud preference",
    help: "Higher means you prefer interesting cloud cover over clear skies",
    defaultValue: 6,
    group: "activity",
    subgroup: "Photography",
    activities: ["Photography"],
  },
  {
    key: "photography_golden_hour_importance",
    label: "Golden hour importance",
    help: "Higher means morning/evening light should matter more for photography",
    defaultValue: 7,
    group: "activity",
    subgroup: "Photography",
    activities: ["Photography"],
  },
  {
    key: "drone_wind_sensitivity",
    label: "Drone wind caution",
    help: "Higher means wind/gusts hurt drone flying scores more",
    defaultValue: 9,
    group: "activity",
    subgroup: "Drone Flying",
    activities: ["Drone Flying"],
  },
  {
    key: "kite_wind_preference",
    label: "Kite wind preference",
    help: "Higher means you prefer stronger wind for kite flying, within safe limits",
    defaultValue: 6,
    group: "activity",
    subgroup: "Kite Flying",
    activities: ["Kite Flying"],
  },
  {
    key: "stargazing_cloud_strictness",
    label: "Stargazing cloud strictness",
    help: "Higher means cloud cover hurts stargazing scores more",
    defaultValue: 9,
    group: "activity",
    subgroup: "Stargazing",
    activities: ["Stargazing"],
  },
  {
    key: "winter_cold_tolerance",
    label: "Winter cold tolerance",
    help: "Higher means you are more comfortable with cold winter activities",
    defaultValue: 5,
    group: "activity",
    subgroup: "Winter",
    activities: ["Skiing", "Snowboarding", "Sledding", "Snowshoeing", "Ice Fishing"],
  },
] as const satisfies readonly PreferenceDefinition[];

export const PREFERENCE_DEFINITIONS = [
  ...CORE_PREFERENCE_DEFINITIONS,
  ...ACTIVITY_PREFERENCE_DEFINITIONS,
] as const;

export type PreferenceKey = (typeof PREFERENCE_DEFINITIONS)[number]["key"];

export const DEFAULT_NUMERIC_PREFERENCES = PREFERENCE_DEFINITIONS.reduce(
  (result, definition) => {
    result[definition.key as PreferenceKey] = definition.defaultValue;
    return result;
  },
  {} as Record<PreferenceKey, number>
);

export function groupedPreferenceDefinitions(
  definitions: readonly PreferenceDefinition[]
) {
  return definitions.reduce<Record<string, PreferenceDefinition[]>>(
    (groups, definition) => {
      if (!groups[definition.subgroup]) {
        groups[definition.subgroup] = [];
      }

      groups[definition.subgroup].push(definition);

      return groups;
    },
    {}
  );
}

export function activityPreferenceIsVisible({
  definition,
  enabledActivities,
  showAll,
}: {
  definition: PreferenceDefinition;
  enabledActivities: string[];
  showAll: boolean;
}) {
  if (showAll) return true;

  if (!definition.activities || definition.activities.length === 0) {
    return true;
  }

  return definition.activities.some((activity) =>
    enabledActivities.includes(activity)
  );
}