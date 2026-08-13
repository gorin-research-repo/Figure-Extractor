import { articleSlug, padIndex, wrapImageInSvg } from "./svg.js";
import { DEFAULT_QUALITY_ID, getQualityPreset, resolvePageScale } from "./quality.js";

/**
 * Render every page of a PDF ArrayBuffer to high-resolution SVG assets.
 *
 * @param {ArrayBuffer} data
 * @param {object} options
 * @param {typeof import("pdfjs-dist")} options.pdfjs
 * @param {string} [options.filename]
 * @param {(msg: string, pct?: number) => void} [options.onProgress]
 * @param {number} [options.dpi] Target dots-per-inch (default 300)
 */
export async function extractFromPdf(data, options) {
  const {
    pdfjs,
    filename = "article.pdf",
    onProgress = () => {},
    dpi = getQualityPreset(DEFAULT_QUALITY_ID).dpi,
  } = options;

  if (!pdfjs?.getDocument) {
    throw new Error("pdf.js library is not available.");
  }

  onProgress("Opening PDF…", 5);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const slug = articleSlug(filename);
  const assets = [];
  const total = pdf.numPages;
  let effectiveDpi = Math.round(dpi);
  let anyCapped = false;

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    const pct = 8 + Math.round((pageNum / total) * 88);
    onProgress(`Rendering page ${pageNum} of ${total} at ~${Math.round(dpi)} DPI…`, pct);
    const page = await pdf.getPage(pageNum);
    const plan = resolvePageScale(page, dpi);
    if (plan.capped) anyCapped = true;
    effectiveDpi = plan.dpi;
    const rendered = await renderPageToSvg(page, plan.scale, `Page ${pageNum} · ${plan.dpi} DPI`);
    const n = padIndex(pageNum);
    assets.push({
      id: `page-${n}`,
      kind: "page",
      name: `${slug}-page-${n}.svg`,
      label: `Page ${pageNum}`,
      page: pageNum,
      width: rendered.width,
      height: rendered.height,
      dpi: plan.dpi,
      svg: rendered.svg,
      previewUrl: rendered.previewUrl,
    });
  }

  onProgress("Done", 100);
  return {
    slug,
    pageCount: total,
    dpi: effectiveDpi,
    requestedDpi: Math.round(dpi),
    capped: anyCapped,
    assets,
  };
}

/** Render a pdf.js page to a high-resolution PNG embedded in SVG. */
export async function renderPageToSvg(page, scale, title = "Page") {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not create canvas context.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    intent: "print",
  }).promise;

  const href = canvas.toDataURL("image/png");
  const svg = wrapImageInSvg({
    width: canvas.width,
    height: canvas.height,
    href,
    title,
  });
  return { svg, width: canvas.width, height: canvas.height, previewUrl: href };
}
