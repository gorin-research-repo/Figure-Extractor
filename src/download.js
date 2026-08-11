/** Trigger a browser download for a Blob or string payload. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(text, filename, mime = "image/svg+xml") {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/**
 * Build a ZIP of all extracted assets using JSZip.
 * @param {typeof import("jszip")} JSZip
 * @param {{ name: string, svg: string }[]} assets
 * @param {string} zipName
 */
export async function downloadZip(JSZip, assets, zipName) {
  const zip = new JSZip();
  const folder = zip.folder("figures") || zip;
  for (const asset of assets) {
    folder.file(asset.name, asset.svg);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}
