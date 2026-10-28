import type { BuildingSettings, BuildingType, Room, RoomType } from "./types";
import { newId } from "./ids";

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living: "Living room",
  bedroom: "Bedroom",
  "master-bedroom": "Master bedroom",
  kitchen: "Kitchen",
  dining: "Dining room",
  bathroom: "Bathroom",
  toilet: "Toilet",
  utility: "Utility room",
  store: "Store room",
  study: "Study room",
  balcony: "Balcony",
  lobby: "Lobby",
  staircase: "Staircase",
  garage: "Garage",
  custom: "Custom room",
};

export const ROOM_TYPES = Object.keys(ROOM_TYPE_LABELS) as RoomType[];

export const ROOM_COLORS: Record<RoomType, string> = {
  living: "#fde8c8",
  bedroom: "#d7e8fb",
  "master-bedroom": "#c9dbf7",
  kitchen: "#fbd9d4",
  dining: "#fbe7b5",
  bathroom: "#cdeef0",
  toilet: "#cdeef0",
  utility: "#e4e1f3",
  store: "#e5e5e5",
  study: "#dcefd0",
  balcony: "#e2f4dc",
  lobby: "#f3ebdc",
  staircase: "#d9d2c5",
  garage: "#d8dbe2",
  custom: "#ececf5",
};

export interface RoomDefault {
  width: number; // m
  depth: number; // m
}

/** Starting suggestions only (meters). Users can edit them; they are not code-mandated standards. */
export const DEFAULT_ROOM_SIZES: Record<RoomType, RoomDefault> = {
  living: { width: 4.0, depth: 3.6 },
  bedroom: { width: 3.3, depth: 3.0 },
  "master-bedroom": { width: 3.6, depth: 3.3 },
  kitchen: { width: 3.0, depth: 2.7 },
  dining: { width: 3.0, depth: 3.0 },
  bathroom: { width: 1.8, depth: 2.4 },
  toilet: { width: 1.2, depth: 1.5 },
  utility: { width: 1.5, depth: 2.0 },
  store: { width: 1.8, depth: 1.8 },
  study: { width: 2.4, depth: 2.7 },
  balcony: { width: 3.0, depth: 1.2 },
  lobby: { width: 2.4, depth: 2.4 },
  staircase: { width: 1.2, depth: 3.0 },
  garage: { width: 3.0, depth: 5.5 },
  custom: { width: 3.0, depth: 3.0 },
};

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  "single-floor": "Single-floor house",
  duplex: "Duplex",
  triplex: "Triplex",
  bungalow: "Bungalow",
  villa: "Villa",
  apartment: "Apartment / flat",
  custom: "Custom",
};

export const SUGGESTED_FLOORS: Record<BuildingType, number> = {
  "single-floor": 1,
  duplex: 2,
  triplex: 3,
  bungalow: 1,
  villa: 2,
  apartment: 1,
  custom: 1,
};

export const DEFAULT_FLOOR_HEIGHT = 3.0;

export const FLOOR_NAMES = ["Ground Floor", "First Floor", "Second Floor", "Third Floor", "Fourth Floor", "Fifth Floor"];
export const floorNameFor = (index: number) => FLOOR_NAMES[index] ?? `Floor ${index + 1}`;

export function defaultSettings(): BuildingSettings {
  return {
    gridStep: 0.15,
    snap: true,
    defaultWallThickness: 0.115,
    allowOverlap: false,
    requireAdjoining: false,
    estimate: {
      currency: "₹",
      paintExtraDeductionPct: 0,
      includeSlabConcrete: true,
      slabThickness: 0.125,
    },
  };
}

export function makeRoom(
  type: RoomType,
  x: number,
  y: number,
  size?: Partial<RoomDefault>,
  name?: string,
): Room {
  const base = DEFAULT_ROOM_SIZES[type];
  return {
    id: newId("room"),
    name: name ?? ROOM_TYPE_LABELS[type],
    type,
    x,
    y,
    width: size?.width ?? base.width,
    depth: size?.depth ?? base.depth,
  };
}
