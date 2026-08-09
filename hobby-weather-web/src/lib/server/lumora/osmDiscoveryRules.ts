export type OsmDiscoveryRule = {
  tags: Record<string, string>;
  label: string;
};

const DEFAULT_RULES: OsmDiscoveryRule[] = [
  {
    label: "Park",
    tags: {
      leisure: "park",
    },
  },
  {
    label: "Nature reserve",
    tags: {
      leisure: "nature_reserve",
    },
  },
];

export const OSM_DISCOVERY_RULES_BY_ACTIVITY: Record<
  string,
  OsmDiscoveryRule[]
> = {
  Running: [
    { label: "Park", tags: { leisure: "park" } },
    { label: "Track", tags: { leisure: "track" } },
    { label: "Athletics area", tags: { leisure: "pitch", sport: "athletics" } },
    { label: "Running route", tags: { route: "running" } },
  ],

  Walking: [
    { label: "Park", tags: { leisure: "park" } },
    { label: "Garden", tags: { leisure: "garden" } },
    { label: "Nature reserve", tags: { leisure: "nature_reserve" } },
    { label: "Protected area", tags: { boundary: "protected_area" } },
  ],

  "Dog Walking": [
    { label: "Park", tags: { leisure: "park" } },
    { label: "Dog park", tags: { leisure: "dog_park" } },
    { label: "Nature reserve", tags: { leisure: "nature_reserve" } },
  ],

  Hiking: [
    { label: "Hiking route", tags: { route: "hiking" } },
    { label: "Nature reserve", tags: { leisure: "nature_reserve" } },
    { label: "Protected area", tags: { boundary: "protected_area" } },
    { label: "Park", tags: { leisure: "park" } },
  ],

  Cycling: [
    { label: "Bike route", tags: { route: "bicycle" } },
    { label: "Cycleway", tags: { highway: "cycleway" } },
    { label: "Park", tags: { leisure: "park" } },
  ],

  Fishing: [
    { label: "Fishing area", tags: { leisure: "fishing" } },
    { label: "Lake", tags: { water: "lake" } },
    { label: "Pond", tags: { water: "pond" } },
    { label: "Water", tags: { natural: "water" } },
  ],

  "Ice Fishing": [
    { label: "Lake", tags: { water: "lake" } },
    { label: "Pond", tags: { water: "pond" } },
    { label: "Water", tags: { natural: "water" } },
  ],

  Kayaking: [
    { label: "Marina", tags: { leisure: "marina" } },
    { label: "Boat rental", tags: { amenity: "boat_rental" } },
    { label: "Boat launch", tags: { leisure: "slipway" } },
    { label: "River", tags: { waterway: "river" } },
    { label: "Lake", tags: { water: "lake" } },
  ],

  Canoeing: [
    { label: "Marina", tags: { leisure: "marina" } },
    { label: "Boat rental", tags: { amenity: "boat_rental" } },
    { label: "Boat launch", tags: { leisure: "slipway" } },
    { label: "River", tags: { waterway: "river" } },
    { label: "Lake", tags: { water: "lake" } },
  ],

  Paddleboarding: [
    { label: "Marina", tags: { leisure: "marina" } },
    { label: "Boat rental", tags: { amenity: "boat_rental" } },
    { label: "Boat launch", tags: { leisure: "slipway" } },
    { label: "Lake", tags: { water: "lake" } },
    { label: "Beach", tags: { natural: "beach" } },
  ],

  "Beach Day": [
    { label: "Beach", tags: { natural: "beach" } },
    { label: "Beach resort", tags: { leisure: "beach_resort" } },
    { label: "Swimming area", tags: { leisure: "swimming_area" } },
    { label: "Lake", tags: { water: "lake" } },
  ],

  Swimming: [
    { label: "Swimming area", tags: { leisure: "swimming_area" } },
    { label: "Beach", tags: { natural: "beach" } },
    { label: "Swimming", tags: { sport: "swimming" } },
    { label: "Lake", tags: { water: "lake" } },
  ],

  Tennis: [
    { label: "Tennis courts", tags: { leisure: "pitch", sport: "tennis" } },
  ],

  Pickleball: [
    { label: "Pickleball courts", tags: { leisure: "pitch", sport: "pickleball" } },
    { label: "Tennis courts", tags: { leisure: "pitch", sport: "tennis" } },
  ],

  Golf: [
    { label: "Golf course", tags: { leisure: "golf_course" } },
  ],

  "Disc Golf": [
    { label: "Disc golf course", tags: { leisure: "disc_golf_course" } },
    { label: "Disc golf", tags: { sport: "disc_golf" } },
  ],

  Soccer: [
    { label: "Soccer field", tags: { leisure: "pitch", sport: "soccer" } },
  ],

  Baseball: [
    { label: "Baseball field", tags: { leisure: "pitch", sport: "baseball" } },
  ],

  Basketball: [
    { label: "Basketball court", tags: { leisure: "pitch", sport: "basketball" } },
  ],

  Volleyball: [
    { label: "Volleyball court", tags: { leisure: "pitch", sport: "volleyball" } },
  ],

  Camping: [
    { label: "Campground", tags: { tourism: "camp_site" } },
    { label: "Park", tags: { leisure: "park" } },
  ],

  Photography: [
    { label: "Viewpoint", tags: { tourism: "viewpoint" } },
    { label: "Garden", tags: { leisure: "garden" } },
    { label: "Park", tags: { leisure: "park" } },
    { label: "Nature reserve", tags: { leisure: "nature_reserve" } },
  ],

  Birdwatching: [
    { label: "Nature reserve", tags: { leisure: "nature_reserve" } },
    { label: "Wetland", tags: { natural: "wetland" } },
    { label: "Protected area", tags: { boundary: "protected_area" } },
  ],

  "Wildlife Watching": [
    { label: "Nature reserve", tags: { leisure: "nature_reserve" } },
    { label: "Wetland", tags: { natural: "wetland" } },
    { label: "Protected area", tags: { boundary: "protected_area" } },
  ],

  Stargazing: [
    { label: "Viewpoint", tags: { tourism: "viewpoint" } },
    { label: "Park", tags: { leisure: "park" } },
    { label: "Protected area", tags: { boundary: "protected_area" } },
  ],

  Picnic: [
    { label: "Picnic site", tags: { tourism: "picnic_site" } },
    { label: "Park", tags: { leisure: "park" } },
  ],

  Gardening: [
    { label: "Garden", tags: { leisure: "garden" } },
    { label: "Allotments", tags: { landuse: "allotments" } },
  ],

  "Outdoor Workout": [
    { label: "Fitness station", tags: { leisure: "fitness_station" } },
    { label: "Park", tags: { leisure: "park" } },
  ],

  "Outdoor Yoga": [
    { label: "Park", tags: { leisure: "park" } },
    { label: "Garden", tags: { leisure: "garden" } },
  ],

  "Drone Flying": [
    { label: "Park", tags: { leisure: "park" } },
    { label: "Viewpoint", tags: { tourism: "viewpoint" } },
  ],

  "Kite Flying": [
    { label: "Park", tags: { leisure: "park" } },
    { label: "Beach", tags: { natural: "beach" } },
  ],

  Sledding: [
    { label: "Sledding area", tags: { "piste:type": "sled" } },
    { label: "Park", tags: { leisure: "park" } },
  ],

  Snowshoeing: [
    { label: "Hiking route", tags: { route: "hiking" } },
    { label: "Nature reserve", tags: { leisure: "nature_reserve" } },
  ],

  Skiing: [
    { label: "Ski piste", tags: { "piste:type": "downhill" } },
    { label: "Nordic ski trail", tags: { "piste:type": "nordic" } },
  ],

  Snowboarding: [
    { label: "Ski piste", tags: { "piste:type": "downhill" } },
  ],
};

export function getOsmDiscoveryRulesForActivity(activity: string) {
  return OSM_DISCOVERY_RULES_BY_ACTIVITY[activity] ?? DEFAULT_RULES;
}