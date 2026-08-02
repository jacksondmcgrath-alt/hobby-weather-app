export const ACTIVITY_OPTIONS = [
  "Fishing",
  "Camping",
  "Running",
  "Kayaking",
  "Disc Golf",
  "Tennis",
  "Beach Day",
];

export const ACTIVITY_ICONS: Record<string, string> = {
  Fishing: "🎣",
  Camping: "⛺",
  Running: "🏃",
  Kayaking: "🛶",
  "Disc Golf": "🥏",
  Tennis: "🎾",
  "Beach Day": "🏖️",
};

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

export const WATER_ACTIVITIES = [
  "Fishing",
  "Kayaking",
  "Beach Day",
];

export const LAND_ACTIVITIES = [
  "Camping",
  "Running",
  "Disc Golf",
  "Tennis",
];