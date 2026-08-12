/** Pure SVG helpers (no DOM / PDF dependency) — safe for Node tests. */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Wrap a raster image (PNG/JPEG data URL or href) in a standalone SVG document.
 * @param {{ width: number, height: number, href: string, title?: string }} opts
 */
export function wrapImageInSvg({ width, height, href, title = "" }) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const titleEl = title
    ? `<title>${escapeXml(title)}</title>\n  `
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${titleEl}<image width="${w}" height="${h}" href="${href}" xlink:href="${href}" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Stable, filesystem-safe basename from an uploaded PDF name. */
export function articleSlug(filename = "article") {
  const base = String(filename).replace(/\.pdf$/i, "").trim() || "article";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "article";
}

export function padIndex(n, width = 2) {
  return String(n).padStart(width, "0");
}
