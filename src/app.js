import * as pdfjs from "pdfjs-dist";
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs";
import JSZip from "jszip";
import { extractFromPdf } from "./extract.js";
import { downloadText, downloadZip } from "./download.js";

// Run the pdf.js worker on the main thread (offline single-file friendly).
globalThis.pdfjsWorker = pdfWorker;

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file");
const fileNameEl = document.getElementById("fileName");
const clearBtn = document.getElementById("clear");
const extractBtn = document.getElementById("extract");
const zipBtn = document.getElementById("zip");
const downloadAllBtn = document.getElementById("downloadAll");
const summary = document.getElementById("summary");
const statusDetail = document.getElementById("statusDetail");
const gallery = document.getElementById("gallery");
const progress = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const progressBar = document.getElementById("progressBar");

/** @type {{ file: File, buffer: ArrayBuffer } | null} */
let loaded = null;
/** @type {{ slug: string, pageCount: number, figureCount: number, assets: any[] } | null} */
let result = null;

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
  gallery.innerHTML = `<div class="gallery-empty">Your first page and figures will appear here after extraction.</div>`;
  zipBtn.disabled = true;
  downloadAllBtn.disabled = true;
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
  result = null;
  fileNameEl.hidden = false;
  fileNameEl.textContent = file.name;
  clearBtn.disabled = false;
  extractBtn.disabled = false;
  zipBtn.disabled = true;
  downloadAllBtn.disabled = true;
  summary.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  statusDetail.textContent = "Ready to extract.";
  gallery.innerHTML = `<div class="gallery-empty">Click <strong>Extract SVGs</strong> to process this article.</div>`;
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
  resetResults();
  hideProgress();
}

function renderGallery(assets) {
  if (!assets.length) {
    gallery.innerHTML = `<div class="gallery-empty">No extractable assets were found in this PDF.</div>`;
    return;
  }
  const grid = document.createElement("div");
  grid.className = "gallery";
  for (const asset of assets) {
    const card = document.createElement("article");
    card.className = "asset-card";
    card.innerHTML = `
      <div class="asset-preview">
        <img alt="${escapeAttr(asset.label)}" src="${asset.previewUrl}" loading="lazy">
      </div>
      <div class="asset-body">
        <div class="asset-meta">
          <span class="tag ${asset.kind}">${asset.kind === "page" ? "First page" : "Figure"}</span>
          <h3>${escapeHtml(asset.label)}</h3>
          <p>${escapeHtml(asset.name)} · ${asset.width}&times;${asset.height}px${asset.page ? ` · p.${asset.page}` : ""}</p>
        </div>
        <div class="asset-actions">
          <button class="scrub secondary" type="button" data-id="${escapeAttr(asset.id)}">Download SVG</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
  gallery.replaceChildren(grid);
  gallery.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const asset = result?.assets.find((a) => a.id === btn.getAttribute("data-id"));
      if (asset) downloadText(asset.svg, asset.name);
    });
  });
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

async function runExtract() {
  if (!loaded) return;
  extractBtn.disabled = true;
  zipBtn.disabled = true;
  downloadAllBtn.disabled = true;
  setProgress("Starting…", 2);
  try {
    // Clone buffer — pdf.js may transfer/detach the original ArrayBuffer.
    const data = loaded.buffer.slice(0);
    result = await extractFromPdf(data, {
      pdfjs,
      filename: loaded.file.name,
      onProgress: setProgress,
    });
    renderGallery(result.assets);
    const figLabel = result.figureCount === 1 ? "1 figure" : `${result.figureCount} figures`;
    summary.textContent = `${loaded.file.name} · ${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · ${figLabel}`;
    statusDetail.textContent = `${result.assets.length} SVG${result.assets.length === 1 ? "" : "s"} ready.`;
    zipBtn.disabled = result.assets.length === 0;
    downloadAllBtn.disabled = result.assets.length === 0;
  } catch (err) {
    console.error(err);
    summary.textContent = "Extraction failed.";
    statusDetail.textContent = err?.message || "Unknown error";
    gallery.innerHTML = `<div class="gallery-empty">Could not process this PDF. Try another file or a less restricted download.</div>`;
    result = null;
  } finally {
    extractBtn.disabled = !loaded;
    hideProgress();
  }
}

async function runZip() {
  if (!result?.assets?.length) return;
  zipBtn.disabled = true;
  downloadAllBtn.disabled = true;
  const prev = zipBtn.textContent;
  zipBtn.textContent = "Building ZIP…";
  try {
    await downloadZip(
      JSZip,
      result.assets.map((a) => ({ name: a.name, svg: a.svg })),
      `${result.slug}-svgs.zip`,
    );
  } finally {
    zipBtn.textContent = prev;
    zipBtn.disabled = false;
    downloadAllBtn.disabled = false;
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
zipBtn.addEventListener("click", runZip);
downloadAllBtn.addEventListener("click", runZip);
