import type { Room } from "../model/types";

export interface FurnitureBox {
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  label: string;
}

/**
 * Simple placeholder furniture so interiors read as rooms in the 3D view. Boxes only, placed by fixed
 * rules and skipped when they do not fit. It is NOT an interior design and ignores door positions.
 */
export function furnitureFor(room: Pick<Room, "type" | "x" | "y" | "width" | "depth">): FurnitureBox[] {
  const { x, y, width: w, depth: d } = room;
  const m = 0.2;
  const out: FurnitureBox[] = [];
  const add = (bx: number, by: number, bw: number, bd: number, h: number, color: string, label: string) => {
    if (bw <= w - 2 * m + 1e-6 && bd <= d - 2 * m + 1e-6) out.push({ x: x + bx, y: y + by, width: bw, depth: bd, height: h, color, label });
  };
  switch (room.type) {
    case "bedroom":
    case "master-bedroom": {
      const bw = room.type === "master-bedroom" ? 1.8 : 1.4;
      add((w - bw) / 2, m, bw, 2.0, 0.45, "#c7b8a6", "Bed");
      if (w - bw >= 1.0) add(w - 0.35 - m, d - 1.3 - m, 0.35, 0.45, 0.5, "#9c7f5f", "Side table");
      if (d >= 3.2) add(m, d - 0.55 - m, Math.min(1.5, w - 2 * m), 0.55, 1.9, "#a98967", "Wardrobe");
      break;
    }
    case "living": {
      add((w - 2.0) / 2, m, 2.0, 0.9, 0.8, "#7a8fa6", "Sofa");
      add((w - 1.0) / 2, Math.min(d - 0.6 - m, 1.4), 1.0, 0.6, 0.4, "#8b6f4e", "Coffee table");
      add((w - 1.4) / 2, d - 0.4 - m, 1.4, 0.4, 0.5, "#4b4b4b", "TV unit");
      break;
    }
    case "dining": {
      const tw = Math.min(1.8, w - 1.0);
      const td = Math.min(0.9, d - 1.0);
      if (tw >= 1.0 && td >= 0.7) add((w - tw) / 2, (d - td) / 2, tw, td, 0.75, "#8b6f4e", "Dining table");
      break;
    }
    case "kitchen": {
      add(m, m, w - 2 * m, 0.6, 0.9, "#d9d2c5", "Counter");
      add(w - 0.7 - m, d - 0.7 - m, 0.7, 0.7, 1.7, "#e8e8e8", "Fridge");
      break;
    }
    case "bathroom": {
      add(w - 0.4 - m, m, 0.4, 0.65, 0.4, "#ffffff", "WC");
      add(m, m, 0.5, 0.4, 0.85, "#ffffff", "Basin");
      if (d >= 2.0) add(m, d - 0.9 - m, 0.9, 0.9, 0.08, "#dfeff2", "Shower tray");
      break;
    }
    case "toilet": {
      add(w - 0.4 - m, m, 0.4, 0.65, 0.4, "#ffffff", "WC");
      break;
    }
    case "study": {
      add(m, m, Math.min(1.2, w - 2 * m), 0.6, 0.75, "#8b6f4e", "Desk");
      add(m + 0.35, 0.9, 0.45, 0.45, 0.45, "#444444", "Chair");
      break;
    }
    case "garage": {
      add((w - 1.8) / 2, (d - 4.2) / 2, 1.8, 4.2, 1.4, "#9aa5b1", "Car (placeholder)");
      break;
    }
    case "utility":
    case "store": {
      add(m, m, Math.min(1.2, w - 2 * m), 0.4, 1.8, "#a98967", "Shelves");
      break;
    }
    default:
      break;
  }
  return out;
}
