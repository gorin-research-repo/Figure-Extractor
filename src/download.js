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
