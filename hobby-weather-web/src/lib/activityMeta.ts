export type ActivityCategory =
  | "Fitness"
  | "Water"
  | "Sports"
  | "Nature"
  | "Winter"
  | "Family"
  | "Specialized";

export type ActivityMeta = {
  icon: string;
  category: ActivityCategory;
  defaultEnabled: boolean;
  scoringProfile: string;
  conditionNeeds: string[];
};

export const ACTIVITY_META: Record<string, ActivityMeta> = {
  Fishing: {
    icon: "🎣",
    category: "Water",
    defaultEnabled: true,
    scoringProfile: "fishing",
    conditionNeeds: ["forecast", "water", "bugs", "pressure", "storm"],
  },
  Camping: {
    icon: "⛺",
    category: "Nature",
    defaultEnabled: true,
    scoringProfile: "camping",
    conditionNeeds: ["forecast", "bugs", "ground", "storm"],
  },
  Running: {
    icon: "🏃",
    category: "Fitness",
    defaultEnabled: true,
    scoringProfile: "running",
    conditionNeeds: ["forecast", "aqi", "uv", "dew_point", "storm"],
  },
  Walking: {
    icon: "🚶",
    category: "Fitness",
    defaultEnabled: true,
    scoringProfile: "walking",
    conditionNeeds: ["forecast", "aqi", "uv", "storm"],
  },
  Hiking: {
    icon: "🥾",
    category: "Fitness",
    defaultEnabled: true,
    scoringProfile: "hiking",
    conditionNeeds: ["forecast", "aqi", "bugs", "storm", "ground"],
  },
  Cycling: {
    icon: "🚴",
    category: "Fitness",
    defaultEnabled: true,
    scoringProfile: "cycling",
    conditionNeeds: ["forecast", "aqi", "wind", "storm"],
  },
  Kayaking: {
    icon: "🛶",
    category: "Water",
    defaultEnabled: true,
    scoringProfile: "kayaking",
    conditionNeeds: ["forecast", "water", "wind", "storm"],
  },
  Canoeing: {
    icon: "🛶",
    category: "Water",
    defaultEnabled: false,
    scoringProfile: "kayaking",
    conditionNeeds: ["forecast", "water", "wind", "storm"],
  },
  Paddleboarding: {
    icon: "🏄",
    category: "Water",
    defaultEnabled: false,
    scoringProfile: "paddleboarding",
    conditionNeeds: ["forecast", "water", "wind", "storm"],
  },
  "Beach Day": {
    icon: "🏖️",
    category: "Water",
    defaultEnabled: true,
    scoringProfile: "beach",
    conditionNeeds: ["forecast", "uv", "water", "wind", "storm"],
  },
  Swimming: {
    icon: "🏊",
    category: "Water",
    defaultEnabled: false,
    scoringProfile: "swimming",
    conditionNeeds: ["forecast", "water", "uv", "storm"],
  },
  Tennis: {
    icon: "🎾",
    category: "Sports",
    defaultEnabled: true,
    scoringProfile: "tennis",
    conditionNeeds: ["forecast", "wind", "storm"],
  },
  Pickleball: {
    icon: "🏓",
    category: "Sports",
    defaultEnabled: false,
    scoringProfile: "tennis",
    conditionNeeds: ["forecast", "wind", "storm"],
  },
  Golf: {
    icon: "⛳",
    category: "Sports",
    defaultEnabled: false,
    scoringProfile: "golf",
    conditionNeeds: ["forecast", "wind", "storm", "ground"],
  },
  "Disc Golf": {
    icon: "🥏",
    category: "Sports",
    defaultEnabled: true,
    scoringProfile: "disc_golf",
    conditionNeeds: ["forecast", "wind", "bugs", "ground", "storm"],
  },
  Soccer: {
    icon: "⚽",
    category: "Sports",
    defaultEnabled: false,
    scoringProfile: "field_sport",
    conditionNeeds: ["forecast", "heat", "storm", "ground"],
  },
  Baseball: {
    icon: "⚾",
    category: "Sports",
    defaultEnabled: false,
    scoringProfile: "field_sport",
    conditionNeeds: ["forecast", "wind", "storm", "ground"],
  },
  Basketball: {
    icon: "🏀",
    category: "Sports",
    defaultEnabled: false,
    scoringProfile: "court_sport",
    conditionNeeds: ["forecast", "heat", "rain", "storm"],
  },
  Volleyball: {
    icon: "🏐",
    category: "Sports",
    defaultEnabled: false,
    scoringProfile: "field_sport",
    conditionNeeds: ["forecast", "wind", "rain", "storm"],
  },
  Photography: {
    icon: "📷",
    category: "Nature",
    defaultEnabled: false,
    scoringProfile: "photography",
    conditionNeeds: ["forecast", "clouds", "light", "visibility"],
  },
  Birdwatching: {
    icon: "🐦",
    category: "Nature",
    defaultEnabled: false,
    scoringProfile: "wildlife",
    conditionNeeds: ["forecast", "wind", "rain", "season", "light"],
  },
  "Wildlife Watching": {
    icon: "🦌",
    category: "Nature",
    defaultEnabled: false,
    scoringProfile: "wildlife",
    conditionNeeds: ["forecast", "wind", "rain", "season", "light"],
  },
  Stargazing: {
    icon: "✨",
    category: "Nature",
    defaultEnabled: false,
    scoringProfile: "stargazing",
    conditionNeeds: ["clouds", "moon", "visibility", "light_pollution"],
  },
  Picnic: {
    icon: "🧺",
    category: "Family",
    defaultEnabled: false,
    scoringProfile: "picnic",
    conditionNeeds: ["forecast", "bugs", "storm", "ground"],
  },
  Gardening: {
    icon: "🌱",
    category: "Nature",
    defaultEnabled: false,
    scoringProfile: "gardening",
    conditionNeeds: ["forecast", "heat", "rain", "wind"],
  },
  "Dog Walking": {
    icon: "🐕",
    category: "Family",
    defaultEnabled: false,
    scoringProfile: "walking",
    conditionNeeds: ["forecast", "heat", "aqi", "storm"],
  },
  "Outdoor Workout": {
    icon: "💪",
    category: "Fitness",
    defaultEnabled: false,
    scoringProfile: "outdoor_workout",
    conditionNeeds: ["forecast", "heat", "aqi", "storm"],
  },
  "Outdoor Yoga": {
    icon: "🧘",
    category: "Fitness",
    defaultEnabled: false,
    scoringProfile: "outdoor_yoga",
    conditionNeeds: ["forecast", "wind", "comfort", "storm"],
  },
  "Drone Flying": {
    icon: "🚁",
    category: "Specialized",
    defaultEnabled: false,
    scoringProfile: "drone",
    conditionNeeds: ["forecast", "wind", "gusts", "visibility", "storm"],
  },
  "Kite Flying": {
    icon: "🪁",
    category: "Family",
    defaultEnabled: false,
    scoringProfile: "kite",
    conditionNeeds: ["forecast", "wind", "rain", "storm"],
  },
  Sledding: {
    icon: "🛷",
    category: "Winter",
    defaultEnabled: false,
    scoringProfile: "sledding",
    conditionNeeds: ["forecast", "snow", "temperature", "wind"],
  },
  Snowshoeing: {
    icon: "❄️",
    category: "Winter",
    defaultEnabled: false,
    scoringProfile: "winter_hiking",
    conditionNeeds: ["forecast", "snow", "temperature", "wind"],
  },
  "Ice Fishing": {
    icon: "🧊",
    category: "Winter",
    defaultEnabled: false,
    scoringProfile: "ice_fishing",
    conditionNeeds: ["forecast", "ice", "wind", "temperature"],
  },
  Skiing: {
    icon: "⛷️",
    category: "Winter",
    defaultEnabled: false,
    scoringProfile: "skiing",
    conditionNeeds: ["forecast", "snow", "wind", "temperature"],
  },
  Snowboarding: {
    icon: "🏂",
    category: "Winter",
    defaultEnabled: false,
    scoringProfile: "skiing",
    conditionNeeds: ["forecast", "snow", "wind", "temperature"],
  },
};

export const ACTIVITY_OPTIONS = Object.keys(ACTIVITY_META);

export const DEFAULT_ENABLED_ACTIVITIES = ACTIVITY_OPTIONS.filter(
  (activity) => ACTIVITY_META[activity]?.defaultEnabled
);

export const ACTIVITY_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(ACTIVITY_META).map(([activity, meta]) => [
    activity,
    meta.icon,
  ])
);

export function activityLabel(activity: string | null | undefined) {
  if (!activity) return "⭐ Unknown";

  return `${ACTIVITY_ICONS[activity] ?? "⭐"} ${activity}`;
}

export const PLAN_STATUS_OPTIONS = [
  "Planned",
  "Maybe",
  "Completed",
  "Canceled",
];

export const WATER_ACTIVITIES = ACTIVITY_OPTIONS.filter(
  (activity) => ACTIVITY_META[activity]?.category === "Water"
);

export const LAND_ACTIVITIES = ACTIVITY_OPTIONS.filter(
  (activity) => ACTIVITY_META[activity]?.category !== "Water"
);

export function activitiesByCategory() {
  return ACTIVITY_OPTIONS.reduce<Record<string, string[]>>((groups, activity) => {
    const category = ACTIVITY_META[activity]?.category ?? "Other";

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(activity);

    return groups;
  }, {});
}