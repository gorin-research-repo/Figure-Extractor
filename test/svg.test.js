import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  articleSlug,
  escapeXml,
  padIndex,
  wrapImageInSvg,
} from "../src/svg.js";
import {
  displayRectToImageRect,
  isValidCrop,
  normalizeCropRect,
} from "../src/crop.js";
import {
  DEFAULT_QUALITY_ID,
  dpiToScale,
  getQualityPreset,
  resolvePageScale,
} from "../src/quality.js";

describe("articleSlug", () => {
  it("strips pdf extension and normalizes", () => {
    assert.equal(articleSlug("Nature Med Article (2024).PDF"), "nature-med-article-2024");
  });

  it("falls back for empty names", () => {
    assert.equal(articleSlug("..."), "article");
  });
});

describe("wrapImageInSvg", () => {
  it("emits a standalone SVG with image href", () => {
    const svg = wrapImageInSvg({
      width: 100,
      height: 50,
      href: "data:image/png;base64,AAA",
      title: "Page 1",
    });
    assert.match(svg, /^<\?xml /);
    assert.match(svg, /viewBox="0 0 100 50"/);
    assert.match(svg, /href="data:image\/png;base64,AAA"/);
    assert.match(svg, /<title>Page 1<\/title>/);
  });
});

describe("helpers", () => {
  it("escapes XML", () => {
    assert.equal(escapeXml(`a<"&>'`), "a&lt;&quot;&amp;&gt;&apos;");
  });

  it("pads indexes", () => {
    assert.equal(padIndex(3), "03");
  });
});

describe("normalizeCropRect", () => {
  it("clamps and rounds inverted drags", () => {
    assert.deepEqual(
      normalizeCropRect({ x: 80, y: 90, width: -50, height: -40 }, 100, 100),
      { x: 30, y: 50, width: 50, height: 40 },
    );
  });

  it("rejects tiny crops via isValidCrop", () => {
    assert.equal(isValidCrop({ x: 0, y: 0, width: 4, height: 4 }), false);
    assert.equal(isValidCrop({ x: 0, y: 0, width: 20, height: 20 }), true);
  });
});

describe("displayRectToImageRect", () => {
  it("maps contain-fit display coords to image pixels", () => {
    const mapped = displayRectToImageRect(
      { x: 0, y: 100, width: 400, height: 200 },
      { width: 400, height: 400 },
      { width: 200, height: 100 },
    );
    assert.deepEqual(mapped, { x: 0, y: 0, width: 200, height: 100 });
  });
});

describe("quality / DPI", () => {
  it("defaults to print 300 DPI", () => {
    assert.equal(getQualityPreset(DEFAULT_QUALITY_ID).dpi, 300);
    assert.equal(dpiToScale(300), 300 / 72);
  });

  it("caps scale so canvas stays within max side", () => {
    const page = {
      getViewport({ scale }) {
        return { width: 612 * scale, height: 792 * scale };
      },
    };
    const plan = resolvePageScale(page, 600, 4096);
    assert.equal(plan.capped, true);
    assert.ok(plan.width <= 4096);
    assert.ok(plan.height <= 4096);
    assert.ok(plan.dpi < 600);
  });

  it("keeps requested DPI when page fits", () => {
    const page = {
      getViewport({ scale }) {
        return { width: 200 * scale, height: 200 * scale };
      },
    };
    const plan = resolvePageScale(page, 300, 8192);
    assert.equal(plan.capped, false);
    assert.equal(plan.dpi, 300);
  });
});
