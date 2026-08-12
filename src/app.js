import * as pdfjs from "pdfjs-dist";
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs";
import { extractFromPdf } from "./extract.js";
import { downloadText } from "./download.js";
import {
  cropImageToSvg,
  displayRectToImageRect,
  isValidCrop,
  normalizeCropRect,
} from "./crop.js";
import { padIndex } from "./svg.js";
import { getQualityPreset } from "./quality.js";

// Run the pdf.js worker on the main thread (offline single-file friendly).
globalThis.pdfjsWorker = pdfWorker;

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file");
const fileNameEl = document.getElementById("fileName");
const clearBtn = document.getElementById("clear");
const extractBtn = document.getElementById("extract");
const qualitySelect = document.getElementById("quality");
const summary = document.getElementById("summary");
const statusDetail = document.getElementById("statusDetail");
const gallery = document.getElementById("gallery");
const pageHint = document.getElementById("pageHint");
const progress = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const progressBar = document.getElementById("progressBar");
const cropPanel = document.getElementById("cropPanel");
const cropStage = document.getElementById("cropStage");
const cropImage = document.getElementById("cropImage");
const cropShade = document.getElementById("cropShade");
const cropBox = document.getElementById("cropBox");
const cropMeta = document.getElementById("cropMeta");
const resetCropBtn = document.getElementById("resetCrop");
const clearSelectionBtn = document.getElementById("clearSelection");
const downloadCropBtn = document.getElementById("downloadCrop");
const downloadFullBtn = document.getElementById("downloadFull");

/** @type {{ file: File, buffer: ArrayBuffer } | null} */
let loaded = null;
/** @type {{ slug: string, pageCount: number, dpi?: number, assets: any[] } | null} */
let result = null;
/** @type {any | null} */
let selected = null;
/** Display-space crop rect relative to the image element's box, or null. */
let displayCrop = null;
/** @type {HTMLImageElement | null} */
let sourceImage = null;

/** @type {null | { mode: "draw" | "move" | "resize", handle?: string, startX: number, startY: number, origin: any }} */
let drag = null;

function selectedDpi() {
  return getQualityPreset(qualitySelect?.value).dpi;
}

function qualityHint() {
  const preset = getQualityPreset(qualitySelect?.value);
  return `${preset.label} — ${preset.hint}`;
}

function setProgress(msg, pct = 0) {
  progress.classList.add("visible");
  progressText.textContent = msg;
  progressPct.textContent = `${Math.round(pct)}%`;
  progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function hideProgress() {
  progress.classList.remove("visible");
  progressBar.style.width = "0%";
}

function resetResults() {
  result = null;
  selected = null;
  displayCrop = null;
  sourceImage = null;
  gallery.innerHTML = `<div class="gallery-empty">Page SVGs will appear here after extraction.</div>`;
  pageHint.textContent = "Choose a page to crop";
  cropPanel.hidden = true;
  statusDetail.textContent = "";
}

async function loadFile(file) {
  if (!file) return;
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    summary.textContent = "Please choose a PDF file.";
    return;
  }
  const buffer = await file.arrayBuffer();
  loaded = { file, buffer };
  resetResults();
  fileNameEl.hidden = false;
  fileNameEl.textContent = file.name;
  clearBtn.disabled = false;
  extractBtn.disabled = false;
  summary.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  statusDetail.textContent = `Ready · ${qualityHint()}`;
  gallery.innerHTML = `<div class="gallery-empty">Click <strong>Extract pages</strong> to render this article.</div>`;
  hideProgress();
}

function clearAll() {
  loaded = null;
  fileInput.value = "";
  fileNameEl.hidden = true;
  fileNameEl.textContent = "";
  clearBtn.disabled = true;
  extractBtn.disabled = true;
  summary.textContent = "Waiting for a PDF.";
  statusDetail.textContent = "Higher DPI = sharper crops, slower + more memory";
  resetResults();
  hideProgress();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function renderGallery(assets) {
  if (!assets.length) {
    gallery.innerHTML = `<div class="gallery-empty">No pages were found in this PDF.</div>`;
    return;
  }
  const grid = document.createElement("div");
  grid.className = "gallery";
  for (const asset of assets) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "asset-card" + (selected?.id === asset.id ? " selected" : "");
    card.setAttribute("data-id", asset.id);
    card.innerHTML = `
      <div class="asset-preview">
        <img alt="${escapeAttr(asset.label)}" src="${asset.previewUrl}" loading="lazy">
      </div>
      <div class="asset-body">
        <div class="asset-meta">
          <span class="tag">Page</span>
          <h3>${escapeHtml(asset.label)}</h3>
          <p>${asset.width}&times;${asset.height}px${asset.dpi ? ` · ${asset.dpi} DPI` : ""}</p>
        </div>
      </div>
    `;
    card.addEventListener("click", () => selectPage(asset.id));
    grid.appendChild(card);
  }
  gallery.replaceChildren(grid);
}

function selectPage(id) {
  const asset = result?.assets.find((a) => a.id === id);
  if (!asset) return;
  selected = asset;
  displayCrop = null;
  pageHint.textContent = `${asset.label} selected`;
  gallery.querySelectorAll(".asset-card").forEach((el) => {
    el.classList.toggle("selected", el.getAttribute("data-id") === id);
  });
  openCropWorkspace(asset);
}

function openCropWorkspace(asset) {
  cropPanel.hidden = false;
  cropImage.onload = () => {
    sourceImage = cropImage;
    updateCropUi();
  };
  cropImage.src = asset.previewUrl;
  sourceImage = cropImage.complete ? cropImage : null;
  updateCropUi();
  cropPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearPageSelection() {
  selected = null;
  displayCrop = null;
  sourceImage = null;
  cropPanel.hidden = true;
  pageHint.textContent = "Choose a page to crop";
  gallery.querySelectorAll(".asset-card.selected").forEach((el) => el.classList.remove("selected"));
}

function getImageBox() {
  const stageRect = cropStage.getBoundingClientRect();
  const imgRect = cropImage.getBoundingClientRect();
  return {
    left: imgRect.left - stageRect.left + cropStage.scrollLeft,
    top: imgRect.top - stageRect.top + cropStage.scrollTop,
    width: imgRect.width,
    height: imgRect.height,
  };
}

function pointerToDisplay(clientX, clientY) {
  const stageRect = cropStage.getBoundingClientRect();
  const box = getImageBox();
  return {
    x: clientX - stageRect.left + cropStage.scrollLeft - box.left,
    y: clientY - stageRect.top + cropStage.scrollTop - box.top,
  };
}

function clampDisplayRect(rect) {
  const box = getImageBox();
  return normalizeCropRect(rect, box.width, box.height);
}

function currentImageCrop() {
  if (!selected || !displayCrop) return null;
  const box = getImageBox();
  return displayRectToImageRect(displayCrop, box, {
    width: selected.width,
    height: selected.height,
  });
}

function updateCropUi() {
  if (!displayCrop || !isValidCrop(displayCrop, 4)) {
    cropBox.hidden = true;
    cropShade.hidden = true;
    cropMeta.textContent = "No crop selected — full page will download.";
    downloadCropBtn.textContent = "Download SVG";
    return;
  }

  const box = getImageBox();
  const rect = clampDisplayRect(displayCrop);
  displayCrop = rect;

  cropBox.hidden = false;
  cropShade.hidden = false;
  cropBox.style.left = `${box.left + rect.x}px`;
  cropBox.style.top = `${box.top + rect.y}px`;
  cropBox.style.width = `${rect.width}px`;
  cropBox.style.height = `${rect.height}px`;

  const top = box.top + rect.y;
  const left = box.left + rect.x;
  const right = left + rect.width;
  const bottom = top + rect.height;
  // Punch a hole in the shade over the crop (polygon with outer + inner ring).
  const w = cropStage.clientWidth + cropStage.scrollWidth;
  const h = cropStage.clientHeight + cropStage.scrollHeight;
  cropShade.style.width = `${Math.max(cropStage.scrollWidth, cropStage.clientWidth)}px`;
  cropShade.style.height = `${Math.max(cropStage.scrollHeight, cropStage.clientHeight)}px`;
  cropShade.style.clipPath = `polygon(evenodd, 0 0, ${w}px 0, ${w}px ${h}px, 0 ${h}px, 0 0, ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px)`;

  const imageCrop = currentImageCrop();
  if (imageCrop && isValidCrop(imageCrop)) {
    cropMeta.textContent = `Crop ${imageCrop.width}×${imageCrop.height}px from ${selected.label}`;
    downloadCropBtn.textContent = "Download cropped SVG";
  } else {
    cropMeta.textContent = "Crop too small — drag a larger area.";
  }
}

function onPointerDown(e) {
  if (!selected || cropPanel.hidden) return;
  if (e.button != null && e.button !== 0) return;
  const handle = e.target?.dataset?.handle;
  const point = pointerToDisplay(e.clientX, e.clientY);
  const box = getImageBox();

  if (handle && displayCrop) {
    drag = {
      mode: "resize",
      handle,
      startX: point.x,
      startY: point.y,
      origin: { ...displayCrop },
    };
  } else if (
    displayCrop &&
    point.x >= displayCrop.x &&
    point.y >= displayCrop.y &&
    point.x <= displayCrop.x + displayCrop.width &&
    point.y <= displayCrop.y + displayCrop.height
  ) {
    drag = {
      mode: "move",
      startX: point.x,
      startY: point.y,
      origin: { ...displayCrop },
    };
  } else {
    // Start a new draw, clamped to image bounds.
    const x = Math.max(0, Math.min(box.width, point.x));
    const y = Math.max(0, Math.min(box.height, point.y));
    drag = {
      mode: "draw",
      startX: x,
      startY: y,
      origin: { x, y, width: 0, height: 0 },
    };
    displayCrop = { x, y, width: 0, height: 0 };
  }

  cropStage.setPointerCapture?.(e.pointerId);
  e.preventDefault();
  updateCropUi();
}

function onPointerMove(e) {
  if (!drag) return;
  const point = pointerToDisplay(e.clientX, e.clientY);
  const box = getImageBox();

  if (drag.mode === "draw") {
    displayCrop = clampDisplayRect({
      x: drag.startX,
      y: drag.startY,
      width: point.x - drag.startX,
      height: point.y - drag.startY,
    });
  } else if (drag.mode === "move") {
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    displayCrop = clampDisplayRect({
      x: drag.origin.x + dx,
      y: drag.origin.y + dy,
      width: drag.origin.width,
      height: drag.origin.height,
    });
  } else if (drag.mode === "resize") {
    let { x, y, width, height } = drag.origin;
    const right = x + width;
    const bottom = y + height;
    const px = Math.max(0, Math.min(box.width, point.x));
    const py = Math.max(0, Math.min(box.height, point.y));
    if (drag.handle.includes("n")) {
      y = Math.min(py, bottom - 4);
      height = bottom - y;
    }
    if (drag.handle.includes("s")) {
      height = Math.max(4, py - y);
    }
    if (drag.handle.includes("w")) {
      x = Math.min(px, right - 4);
      width = right - x;
    }
    if (drag.handle.includes("e")) {
      width = Math.max(4, px - x);
    }
    displayCrop = clampDisplayRect({ x, y, width, height });
  }
  updateCropUi();
}

function onPointerUp(e) {
  if (!drag) return;
  drag = null;
  try {
    cropStage.releasePointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
  if (displayCrop && !isValidCrop(displayCrop, 4)) {
    displayCrop = null;
  }
  updateCropUi();
}

async function downloadSelected({ fullPage = false } = {}) {
  if (!selected) return;
  downloadCropBtn.disabled = true;
  downloadFullBtn.disabled = true;
  try {
    if (fullPage || !displayCrop || !isValidCrop(displayCrop, 4)) {
      downloadText(selected.svg, selected.name);
      return;
    }

    const imageCrop = currentImageCrop();
    if (!imageCrop || !isValidCrop(imageCrop)) {
      downloadText(selected.svg, selected.name);
      return;
    }

    // Ensure natural-resolution source is available.
    const img = new Image();
    img.src = selected.previewUrl;
    if (!img.complete) {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    }

    const cropped = await cropImageToSvg(
      img,
      imageCrop,
      `${selected.label} crop`,
    );
    const n = padIndex(selected.page);
    const name = `${result.slug}-page-${n}-crop.svg`;
    downloadText(cropped.svg, name);
  } catch (err) {
    console.error(err);
    statusDetail.textContent = err?.message || "Download failed.";
  } finally {
    downloadCropBtn.disabled = false;
    downloadFullBtn.disabled = false;
  }
}

async function runExtract() {
  if (!loaded) return;
  extractBtn.disabled = true;
  if (qualitySelect) qualitySelect.disabled = true;
  const dpi = selectedDpi();
  setProgress(`Starting at ${dpi} DPI…`, 2);
  try {
    const data = loaded.buffer.slice(0);
    result = await extractFromPdf(data, {
      pdfjs,
      filename: loaded.file.name,
      dpi,
      onProgress: setProgress,
    });
    selected = null;
    displayCrop = null;
    cropPanel.hidden = true;
    renderGallery(result.assets);
    const dpiLabel = result.capped
      ? `${result.dpi} DPI (capped from ${result.requestedDpi})`
      : `${result.dpi} DPI`;
    summary.textContent = `${loaded.file.name} · ${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · ${dpiLabel}`;
    statusDetail.textContent = `${result.assets.length} page SVG${result.assets.length === 1 ? "" : "s"} ready — select one to crop.`;
    pageHint.textContent = "Choose a page to crop";
  } catch (err) {
    console.error(err);
    summary.textContent = "Extraction failed.";
    statusDetail.textContent = err?.message || "Unknown error";
    gallery.innerHTML = `<div class="gallery-empty">Could not process this PDF. Try another file${dpi >= 450 ? " or a lower DPI" : ""}.</div>`;
    result = null;
  } finally {
    extractBtn.disabled = !loaded;
    if (qualitySelect) qualitySelect.disabled = false;
    hideProgress();
  }
}

// ── Events ──────────────────────────────────────────────────────────────
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

["dragenter", "dragover"].forEach((type) => {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((type) => {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  });
});
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
});

clearBtn.addEventListener("click", clearAll);
extractBtn.addEventListener("click", runExtract);
qualitySelect?.addEventListener("change", () => {
  if (loaded && !result) statusDetail.textContent = `Ready · ${qualityHint()}`;
  else if (!loaded) statusDetail.textContent = `${qualityHint()}. Higher DPI uses more memory.`;
  else statusDetail.textContent = `Quality set to ${qualityHint()} — re-extract to apply.`;
});
resetCropBtn.addEventListener("click", () => {
  displayCrop = null;
  updateCropUi();
});
clearSelectionBtn.addEventListener("click", clearPageSelection);
downloadCropBtn.addEventListener("click", () => downloadSelected({ fullPage: false }));
downloadFullBtn.addEventListener("click", () => downloadSelected({ fullPage: true }));

cropStage.addEventListener("pointerdown", onPointerDown);
cropStage.addEventListener("pointermove", onPointerMove);
cropStage.addEventListener("pointerup", onPointerUp);
cropStage.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", () => {
  if (!cropPanel.hidden) updateCropUi();
});
