import { wrapImageInSvg } from "./svg.js";

/**
 * Normalize a crop rectangle to integer pixel bounds inside the source image.
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {number} imageWidth
 * @param {number} imageHeight
 */
export function normalizeCropRect(rect, imageWidth, imageHeight) {
  const iw = Math.max(1, Math.round(imageWidth));
  const ih = Math.max(1, Math.round(imageHeight));
  let x1 = Number(rect.x) || 0;
  let y1 = Number(rect.y) || 0;
  let x2 = x1 + (Number(rect.width) || 0);
  let y2 = y1 + (Number(rect.height) || 0);

  // Allow inverted drags.
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];

  x1 = Math.max(0, Math.min(iw, x1));
  y1 = Math.max(0, Math.min(ih, y1));
  x2 = Math.max(0, Math.min(iw, x2));
  y2 = Math.max(0, Math.min(ih, y2));

  const width = Math.max(0, Math.round(x2 - x1));
  const height = Math.max(0, Math.round(y2 - y1));
  return {
    x: Math.round(x1),
    y: Math.round(y1),
    width,
    height,
  };
}

export function isValidCrop(rect, minSide = 8) {
  return !!rect && rect.width >= minSide && rect.height >= minSide;
}

/**
 * Map a rectangle from displayed element coords into source image pixels.
 * Accounts for object-fit: contain letterboxing.
 */
export function displayRectToImageRect(displayRect, displaySize, imageSize) {
  const { width: dw, height: dh } = displaySize;
  const { width: iw, height: ih } = imageSize;
  if (!dw || !dh || !iw || !ih) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const scale = Math.min(dw / iw, dh / ih);
  const renderedW = iw * scale;
  const renderedH = ih * scale;
  const offsetX = (dw - renderedW) / 2;
  const offsetY = (dh - renderedH) / 2;

  return normalizeCropRect(
    {
      x: (displayRect.x - offsetX) / scale,
      y: (displayRect.y - offsetY) / scale,
      width: displayRect.width / scale,
      height: displayRect.height / scale,
    },
    iw,
    ih,
  );
}

/**
 * Crop a source image (HTMLImageElement or canvas) to an SVG string.
 * @returns {Promise<{ svg: string, width: number, height: number, previewUrl: string }>}
 */
export async function cropImageToSvg(source, crop, title = "Figure") {
  const rect = normalizeCropRect(crop, source.width, source.height);
  if (!isValidCrop(rect)) {
    throw new Error("Crop area is too small.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not create canvas context.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );

  const href = canvas.toDataURL("image/png");
  const svg = wrapImageInSvg({
    width: rect.width,
    height: rect.height,
    href,
    title,
  });
  return { svg, width: rect.width, height: rect.height, previewUrl: href };
}
