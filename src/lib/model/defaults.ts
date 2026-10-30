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
  office: "Office",
  reception: "Reception",
  "meeting-room": "Meeting room",
  classroom: "Classroom",
  ward: "Ward / patient room",
  shop: "Shop / retail unit",
  hall: "Hall",
  warehouse: "Warehouse / storage hall",
  workshop: "Workshop / production",
  laboratory: "Laboratory",
  corridor: "Corridor",
  lift: "Lift / elevator",
  parking: "Parking bay",
  pantry: "Pantry",
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
  office: "#dfe9f7",
  reception: "#f6e6c8",
  "meeting-room": "#d5e2f0",
  classroom: "#e4efd2",
  ward: "#d3eef2",
  shop: "#f8dcc8",
  hall: "#f1e2f2",
  warehouse: "#d9d6cf",
  workshop: "#d6d9c8",
  laboratory: "#d9ecec",
  corridor: "#f3ebdc",
  lift: "#c9ccd4",
  parking: "#dcdfe6",
  pantry: "#f5e1d0",
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
  office: { width: 4.0, depth: 4.0 },
  reception: { width: 5.0, depth: 4.0 },
  "meeting-room": { width: 5.0, depth: 4.0 },
  classroom: { width: 7.5, depth: 6.0 },
  ward: { width: 4.0, depth: 5.0 },
  shop: { width: 4.0, depth: 6.0 },
  hall: { width: 10.0, depth: 6.0 },
  warehouse: { width: 12.0, depth: 10.0 },
  workshop: { width: 8.0, depth: 6.0 },
  laboratory: { width: 6.0, depth: 5.0 },
  corridor: { width: 1.8, depth: 6.0 },
  lift: { width: 2.0, depth: 2.0 },
  parking: { width: 2.5, depth: 5.0 },
  pantry: { width: 2.0, depth: 2.5 },
  custom: { width: 3.0, depth: 3.0 },
};

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  "single-floor": "Single-floor house",
  duplex: "Duplex",
  triplex: "Triplex",
  bungalow: "Bungalow",
  villa: "Villa",
  apartment: "Apartment / flat",
  farmhouse: "Farmhouse",
  shop: "Shop",
  office: "Office building",
  restaurant: "Restaurant / cafe",
  hotel: "Hotel / guest house",
  school: "School / college",
  hospital: "Hospital / clinic",
  warehouse: "Warehouse",
  factory: "Factory / workshop",
  mall: "Shopping mall",
  "mixed-use": "Mixed-use (shops + flats)",
  "community-hall": "Community hall / temple",
  custom: "Custom",
};

export const SUGGESTED_FLOORS: Record<BuildingType, number> = {
  "single-floor": 1,
  duplex: 2,
  triplex: 3,
  bungalow: 1,
  villa: 2,
  apartment: 1,
  farmhouse: 1,
  shop: 1,
  office: 4,
  restaurant: 1,
  hotel: 4,
  school: 3,
  hospital: 4,
  warehouse: 1,
  factory: 1,
  mall: 3,
  "mixed-use": 4,
  "community-hall": 1,
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
    exteriorWallThickness: 0.23,
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
