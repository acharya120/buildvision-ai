import type { Project } from "../model/types";

/** Set by the account code when someone is logged in; empty otherwise, so the app works exactly as before. */
export interface CloudHooks {
  saveProject?: (p: Project) => void;
  deleteProject?: (id: string) => void;
  kv?: (key: "roomLibrary" | "ratePresets", json: string) => void;
}
export const cloudHooks: CloudHooks = {};
