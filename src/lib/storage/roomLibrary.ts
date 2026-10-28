import { DEFAULT_ROOM_SIZES, type RoomDefault } from "../model/defaults";
import type { RoomType } from "../model/types";

const KEY = "buildvision.roomLibrary.v1";

export type RoomLibrary = Record<RoomType, RoomDefault>;

export function defaultLibrary(): RoomLibrary {
  return JSON.parse(JSON.stringify(DEFAULT_ROOM_SIZES)) as RoomLibrary;
}

export function loadLibrary(): RoomLibrary {
  const lib = defaultLibrary();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return lib;
    const data = JSON.parse(raw) as Record<string, Partial<RoomDefault>>;
    for (const type of Object.keys(lib) as RoomType[]) {
      const v = data[type];
      if (v && typeof v.width === "number" && typeof v.depth === "number" && v.width > 0.2 && v.depth > 0.2 && v.width < 100 && v.depth < 100) {
        lib[type] = { width: v.width, depth: v.depth };
      }
    }
  } catch {
    /* storage unavailable: defaults are fine */
  }
  return lib;
}

export function saveLibrary(lib: RoomLibrary): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lib));
  } catch {
    /* ignore */
  }
}
