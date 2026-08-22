export type DaylightRule = "required" | "preferred" | "night" | "none";

export type PreferredPeriod =
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

export type ActivityWindowProfile = {
  durationHours: number;
  earliestStartHour: number;
  latestEndHour: number;
  daylightRule: DaylightRule;
  daylightStartBufferHours?: number;
  daylightEndBufferHours?: number;
  preferredPeriods: PreferredPeriod[];
  windowLabel?: string;
};

const DEFAULT_WINDOW_PROFILE: ActivityWindowProfile = {
  durationHours: 2,
  earliestStartHour: 6,
  latestEndHour: 22,
  daylightRule: "preferred",
  preferredPeriods: ["morning", "afternoon", "evening", "midday"],
};

export const ACTIVITY_WINDOW_PROFILES: Record<
  string,
  ActivityWindowProfile
> = {
  Fishing: {
    durationHours: 3,
    earliestStartHour: 5,
    latestEndHour: 22,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Camping: {
    durationHours: 3,
    earliestStartHour: 12,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["afternoon", "evening", "midday", "morning"],
    windowLabel: "Best setup window",
  },

  Running: {
    durationHours: 1,
    earliestStartHour: 5,
    latestEndHour: 22,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Walking: {
    durationHours: 1,
    earliestStartHour: 6,
    latestEndHour: 22,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  "Dog Walking": {
    durationHours: 1,
    earliestStartHour: 6,
    latestEndHour: 22,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Hiking: {
    durationHours: 3,
    earliestStartHour: 6,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "afternoon", "midday", "evening"],
  },

  Cycling: {
    durationHours: 2,
    earliestStartHour: 6,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Kayaking: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 20,
    daylightRule: "required",
    daylightStartBufferHours: 1,
    daylightEndBufferHours: 1,
    preferredPeriods: ["morning", "midday", "afternoon", "evening"],
  },

  Canoeing: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 20,
    daylightRule: "required",
    daylightStartBufferHours: 1,
    daylightEndBufferHours: 1,
    preferredPeriods: ["morning", "midday", "afternoon", "evening"],
  },

  Paddleboarding: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 20,
    daylightRule: "required",
    daylightStartBufferHours: 1,
    daylightEndBufferHours: 1,
    preferredPeriods: ["morning", "midday", "afternoon", "evening"],
  },

  "Beach Day": {
    durationHours: 3,
    earliestStartHour: 8,
    latestEndHour: 20,
    daylightRule: "required",
    preferredPeriods: ["midday", "afternoon", "morning", "evening"],
  },

  Swimming: {
    durationHours: 1,
    earliestStartHour: 8,
    latestEndHour: 20,
    daylightRule: "required",
    preferredPeriods: ["midday", "afternoon", "morning", "evening"],
  },

  Tennis: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Pickleball: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Golf: {
    durationHours: 4,
    earliestStartHour: 6,
    latestEndHour: 20,
    daylightRule: "required",
    preferredPeriods: ["morning", "midday", "afternoon", "evening"],
  },

  "Disc Golf": {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "afternoon", "evening", "midday"],
  },

  Soccer: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Baseball: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["afternoon", "evening", "morning", "midday"],
  },

  Basketball: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Volleyball: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Photography: {
    durationHours: 2,
    earliestStartHour: 5,
    latestEndHour: 22,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Birdwatching: {
    durationHours: 2,
    earliestStartHour: 5,
    latestEndHour: 21,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  "Wildlife Watching": {
    durationHours: 2,
    earliestStartHour: 5,
    latestEndHour: 21,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  Stargazing: {
    durationHours: 2,
    earliestStartHour: 18,
    latestEndHour: 24,
    daylightRule: "night",
    preferredPeriods: ["night"],
  },

  Picnic: {
    durationHours: 2,
    earliestStartHour: 9,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["midday", "afternoon", "evening", "morning"],
  },

  Gardening: {
    durationHours: 2,
    earliestStartHour: 7,
    latestEndHour: 20,
    daylightRule: "required",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  "Outdoor Workout": {
    durationHours: 1,
    earliestStartHour: 6,
    latestEndHour: 21,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  "Outdoor Yoga": {
    durationHours: 1,
    earliestStartHour: 6,
    latestEndHour: 21,
    daylightRule: "preferred",
    preferredPeriods: ["morning", "evening", "afternoon", "midday"],
  },

  "Drone Flying": {
    durationHours: 1,
    earliestStartHour: 7,
    latestEndHour: 21,
    daylightRule: "required",
    preferredPeriods: ["morning", "afternoon", "evening", "midday"],
  },

  "Kite Flying": {
    durationHours: 1,
    earliestStartHour: 8,
    latestEndHour: 20,
    daylightRule: "required",
    preferredPeriods: ["afternoon", "midday", "evening", "morning"],
  },

  Sledding: {
    durationHours: 2,
    earliestStartHour: 8,
    latestEndHour: 18,
    daylightRule: "required",
    preferredPeriods: ["afternoon", "morning", "midday", "evening"],
  },

  Snowshoeing: {
    durationHours: 2,
    earliestStartHour: 8,
    latestEndHour: 18,
    daylightRule: "required",
    preferredPeriods: ["morning", "afternoon", "midday", "evening"],
  },

  "Ice Fishing": {
    durationHours: 3,
    earliestStartHour: 7,
    latestEndHour: 18,
    daylightRule: "required",
    preferredPeriods: ["morning", "afternoon", "midday", "evening"],
  },

  Skiing: {
    durationHours: 4,
    earliestStartHour: 8,
    latestEndHour: 18,
    daylightRule: "required",
    preferredPeriods: ["morning", "afternoon", "midday", "evening"],
  },

  Snowboarding: {
    durationHours: 4,
    earliestStartHour: 8,
    latestEndHour: 18,
    daylightRule: "required",
    preferredPeriods: ["morning", "afternoon", "midday", "evening"],
  },
};

export function getActivityWindowProfile(activity: string) {
  return ACTIVITY_WINDOW_PROFILES[activity] ?? DEFAULT_WINDOW_PROFILE;
}