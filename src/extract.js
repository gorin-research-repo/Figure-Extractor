import {
  articleSlug,
  hashBytes,
  isFigureCandidate,
  padIndex,
  wrapImageInSvg,
} from "./svg.js";

/** Default render scale for the first-page SVG (high-res raster wrapped in SVG). */
export const FIRST_PAGE_SCALE = 3;

/**
 * Extract the first page and figure-sized images from a PDF ArrayBuffer.
 * Runs entirely in-browser via pdf.js — nothing is uploaded.
 *
 * @param {ArrayBuffer} data
 * @param {object} options
 * @param {typeof import("pdfjs-dist")} options.pdfjs
 * @param {string} [options.filename]
 * @param {(msg: string, pct?: number) => void} [options.onProgress]
 * @param {number} [options.firstPageScale]
 */
export async function extractFromPdf(data, options) {
  const {
    pdfjs,
    filename = "article.pdf",
    onProgress = () => {},
    firstPageScale = FIRST_PAGE_SCALE,
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

  onProgress("Rendering first page…", 15);
  const firstPage = await pdf.getPage(1);
  const firstSvg = await renderPageToSvg(firstPage, firstPageScale);
  assets.push({
    id: "first-page",
    kind: "page",
    name: `${slug}-first-page.svg`,
    label: "First page",
    page: 1,
    width: firstSvg.width,
    height: firstSvg.height,
    svg: firstSvg.svg,
    previewUrl: firstSvg.previewUrl,
  });

  onProgress("Scanning for figures…", 35);
  const figures = await collectFigures(pdf, pdfjs, onProgress);
  figures.forEach((fig, index) => {
    const n = padIndex(index + 1);
    const name = `${slug}-figure-${n}.svg`;
    const svg = wrapImageInSvg({
      width: fig.width,
      height: fig.height,
      href: fig.href,
      title: `Figure ${index + 1} (page ${fig.page})`,
    });
    assets.push({
      id: `figure-${n}`,
      kind: "figure",
      name,
      label: `Figure ${index + 1}`,
      page: fig.page,
      width: fig.width,
      height: fig.height,
      svg,
      previewUrl: fig.href,
    });
  });

  onProgress("Done", 100);
  return {
    slug,
    pageCount: pdf.numPages,
    figureCount: figures.length,
    assets,
  };
}

/** Render a pdf.js page to a high-resolution PNG embedded in SVG. */
export async function renderPageToSvg(page, scale = FIRST_PAGE_SCALE) {
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
    intent: "display",
  }).promise;

  const href = canvas.toDataURL("image/png");
  const svg = wrapImageInSvg({
    width: canvas.width,
    height: canvas.height,
    href,
    title: "First page",
  });
  return { svg, width: canvas.width, height: canvas.height, previewUrl: href };
}

/**
 * Walk every page, resolve embedded images, and keep figure-sized uniques.
 */
async function collectFigures(pdf, pdfjs, onProgress) {
  const OPS = pdfjs.OPS;
  const seen = new Set();
  const figures = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const pct = 35 + Math.round((pageNum / pdf.numPages) * 55);
    onProgress(`Scanning page ${pageNum} of ${pdf.numPages}…`, pct);
    const page = await pdf.getPage(pageNum);

    // Operator list pulls image resources into page.objs.
    const ops = await page.getOperatorList();
    const names = new Set();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintImageXObjectRepeat ||
        fn === OPS.paintXObject
      ) {
        const imgName = ops.argsArray[i]?.[0];
        if (typeof imgName === "string") names.add(imgName);
      } else if (
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintInlineImageXObjectGroup
      ) {
        const raw = ops.argsArray[i]?.[0];
        await maybeAddFigure(raw, pageNum, seen, figures);
      }
    }

    // Soft-render at low scale so delayed bitmaps resolve into objs.
    if (names.size) {
      try {
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          await page.render({
            canvas,
            canvasContext: ctx,
            viewport,
            intent: "display",
          }).promise;
        }
      } catch {
        /* image objs may still be available from getOperatorList */
      }
    }

    for (const name of names) {
      const raw = await resolveImageObject(page, name);
      await maybeAddFigure(raw, pageNum, seen, figures);
    }

    // Catch any other decoded image-like objects on the page.
    try {
      for (const [, data] of page.objs) {
        if (looksLikeImage(data)) {
          await maybeAddFigure(data, pageNum, seen, figures);
        }
      }
    } catch {
      /* ignore iteration issues on older shapes */
    }
  }

  return figures;
}

async function maybeAddFigure(raw, pageNum, seen, figures) {
  const normalized = await normalizeImage(raw);
  if (!normalized) return;
  if (!isFigureCandidate(normalized)) return;
  const key = `${normalized.width}x${normalized.height}:${hashBytes(normalized.rgba)}`;
  if (seen.has(key)) return;
  seen.add(key);
  const href = rgbaToPngDataUrl(normalized.width, normalized.height, normalized.rgba);
  if (!href) return;
  figures.push({
    page: pageNum,
    width: normalized.width,
    height: normalized.height,
    href,
  });
}

function looksLikeImage(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof ImageBitmap !== "undefined" && data instanceof ImageBitmap) return true;
  if (data.bitmap && typeof ImageBitmap !== "undefined" && data.bitmap instanceof ImageBitmap) {
    return true;
  }
  const width = data.width || data.w;
  const height = data.height || data.h;
  return !!(width && height && (data.data || data.kind));
}

function resolveImageObject(page, name) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value || null);
    };

    const tryStore = (store) => {
      if (!store) return;
      try {
        store.get(name, (data) => finish(data));
      } catch {
        /* ignore */
      }
      try {
        if (typeof store.has === "function" && store.has(name)) {
          finish(store.get(name));
        }
      } catch {
        /* not resolved yet */
      }
    };

    tryStore(page.objs);
    tryStore(page.commonObjs);
    setTimeout(() => finish(null), 100);
  });
}

/**
 * Normalize pdf.js image payloads into { width, height, rgba }.
 */
async function normalizeImage(img) {
  if (!img) return null;

  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
    return imageBitmapToRgba(img);
  }

  if (img.bitmap && typeof ImageBitmap !== "undefined" && img.bitmap instanceof ImageBitmap) {
    return imageBitmapToRgba(img.bitmap);
  }

  const width = img.width || img.w;
  const height = img.height || img.h;
  if (!width || !height) return null;

  const data = img.data;
  if (!data) return null;

  const kind = img.kind;
  const rgba = toRgba(data, width, height, kind);
  if (!rgba) return null;
  return { width, height, rgba };
}

function imageBitmapToRgba(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, rgba: imageData.data };
}

function toRgba(data, width, height, kind) {
  const src = data instanceof Uint8ClampedArray || data instanceof Uint8Array
    ? data
    : new Uint8Array(data);
  const expected = width * height * 4;

  // pdf.js ImageKind: 1=GRAYSCALE_1BPP, 2=RGB_24BPP, 3=RGBA_32BPP
  if (kind === 1) {
    // 1bpp packed — expand roughly (best-effort for rare journal assets)
    const out = new Uint8ClampedArray(expected);
    let bitPos = 0;
    for (let i = 0; i < width * height; i++) {
      const byte = src[bitPos >> 3] || 0;
      const bit = (byte >> (7 - (bitPos & 7))) & 1;
      const v = bit ? 0 : 255;
      const j = i * 4;
      out[j] = out[j + 1] = out[j + 2] = v;
      out[j + 3] = 255;
      bitPos++;
    }
    return out;
  }

  if (kind === 3 || src.length === expected) {
    return new Uint8ClampedArray(src.buffer, src.byteOffset, expected);
  }

  if (src.length === width * height) {
    const out = new Uint8ClampedArray(expected);
    for (let i = 0, j = 0; i < src.length; i++, j += 4) {
      const v = src[i];
      out[j] = v;
      out[j + 1] = v;
      out[j + 2] = v;
      out[j + 3] = 255;
    }
    return out;
  }

  if (kind === 2 || src.length === width * height * 3) {
    const out = new Uint8ClampedArray(expected);
    for (let i = 0, j = 0; j < expected; i += 3, j += 4) {
      out[j] = src[i];
      out[j + 1] = src[i + 1];
      out[j + 2] = src[i + 2];
      out[j + 3] = 255;
    }
    return out;
  }

  return null;
}

function rgbaToPngDataUrl(width, height, rgba) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const copy = rgba instanceof Uint8ClampedArray
    ? rgba
    : new Uint8ClampedArray(rgba);
  const imageData = new ImageData(copy, width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
