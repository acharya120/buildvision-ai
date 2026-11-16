import type { AutoDesignInput } from "./autodesign";
import type { CommercialInput } from "./autodesignCorridor";

/**
 * Starting points for the Auto design generator. A preset only fills in the generator's own inputs; you can change any
 * of them before generating, and nothing is applied to your drawing until you pick a layout. Sizes are typical
 * starting values, not code requirements. Check your local rules.
 */
export interface DesignPreset {
  id: string;
  label: string;
  note: string;
  /** suggested plot, metres (shown as a hint; the plot is only changed if you ask) */
  plot: { width: number; depth: number };
  kind: "house" | "corridor";
  house?: Partial<AutoDesignInput>;
  corridor?: Partial<CommercialInput>;
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "2bhk", label: "2BHK", kind: "house", plot: { width: 9, depth: 12 },
    note: "Single floor, 2 bedrooms with attached bath for the master, living, dining, kitchen, utility and a balcony.",
    house: { floors: 1, bedrooms: 2, includeDining: true, includeStudy: false, includeGarage: false, includeBalcony: true, includeUtility: true, attachedBathMaster: true, sizing: "standard" },
  },
  {
    id: "3bhk", label: "3BHK", kind: "house", plot: { width: 12, depth: 15 },
    note: "Single floor, 3 bedrooms, living, dining, kitchen, utility and a balcony.",
    house: { floors: 1, bedrooms: 3, includeDining: true, includeStudy: false, includeGarage: false, includeBalcony: true, includeUtility: true, attachedBathMaster: true, sizing: "standard" },
  },
  {
    id: "duplex", label: "Duplex", kind: "house", plot: { width: 12, depth: 15 },
    note: "Two floors with a stair, 3 bedrooms, garage on the ground floor and a balcony upstairs.",
    house: { floors: 2, bedrooms: 3, includeDining: true, includeStudy: false, includeGarage: true, includeBalcony: true, includeUtility: true, attachedBathMaster: true, sizing: "standard" },
  },
  {
    id: "small-office", label: "Small office", kind: "corridor", plot: { width: 15, depth: 20 },
    note: "Two floors, a row of offices on each side of a corridor, ground-floor reception, no lift.",
    corridor: { floors: 2, roomType: "office", roomsPerFloor: 0, roomWidth: 4, roomDepth: 5, includeLift: false, groundReception: true, floorHeight: 3.2 },
  },
];
