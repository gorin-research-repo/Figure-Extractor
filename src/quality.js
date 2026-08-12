/** PDF user-space is 72 points per inch. */
export const PDF_DPI = 72;

/** Practical browser canvas edge limit (Chrome is higher; Safari/mobile often lower). */
export const MAX_CANVAS_SIDE = 8192;

export const QUALITY_PRESETS = [
  {
    id: "screen",
    label: "Screen · 150 DPI",
    dpi: 150,
    hint: "Faster, fine for slides",
  },
  {
    id: "print",
    label: "Print · 300 DPI",
    dpi: 300,
    hint: "Journal-grade default",
  },
  {
    id: "ultra",
    label: "Ultra · 450 DPI",
    dpi: 450,
    hint: "Sharper crops, heavier",
  },
  {
    id: "max",
    label: "Max · 600 DPI",
    dpi: 600,
    hint: "Highest; may be slow",
  },
];

export const DEFAULT_QUALITY_ID = "print";

export function getQualityPreset(id) {
  return QUALITY_PRESETS.find((p) => p.id === id) || QUALITY_PRESETS.find((p) => p.id === DEFAULT_QUALITY_ID);
}

/** Convert DPI to pdf.js viewport scale (72pt = 1in). */
export function dpiToScale(dpi) {
  const value = Number(dpi);
  if (!Number.isFinite(value) || value <= 0) return 300 / PDF_DPI;
  return value / PDF_DPI;
}

/**
 * Pick a render scale for a page at the requested DPI, clamped to canvas limits.
 * @param {{ getViewport: (opts: { scale: number }) => { width: number, height: number } }} page
 * @param {number} dpi
 * @param {number} [maxSide]
 */
export function resolvePageScale(page, dpi, maxSide = MAX_CANVAS_SIDE) {
  const requested = dpiToScale(dpi);
  const base = page.getViewport({ scale: 1 });
  const maxDim = Math.max(base.width, base.height) || 1;
  const capped = Math.min(requested, maxSide / maxDim);
  const scale = Math.max(0.25, capped);
  const viewport = page.getViewport({ scale });
  return {
    scale,
    dpi: Math.round(scale * PDF_DPI),
    requestedDpi: Math.round(Number(dpi) || 300),
    capped: scale + 1e-6 < requested,
    width: Math.max(1, Math.floor(viewport.width)),
    height: Math.max(1, Math.floor(viewport.height)),
  };
}
