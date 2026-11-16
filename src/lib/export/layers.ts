/** Optional drawing layers for SVG and DXF export. Default = everything on. */
export interface ExportLayers {
  /** background grid and, when the project's structural details are on, the labelled structural grid lines */
  grid: boolean;
  /** dimension lines (plot width and depth, and your own dimensions) */
  dimensions: boolean;
  /** furniture symbols (indicative sizes, not design) */
  furniture: boolean;
}
export const DEFAULT_LAYERS: ExportLayers = { grid: true, dimensions: true, furniture: true };
