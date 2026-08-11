import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  articleSlug,
  escapeXml,
  hashBytes,
  isFigureCandidate,
  padIndex,
  wrapImageInSvg,
} from "../src/svg.js";

describe("articleSlug", () => {
  it("strips pdf extension and normalizes", () => {
    assert.equal(articleSlug("Nature Med Article (2024).PDF"), "nature-med-article-2024");
  });

  it("falls back for empty names", () => {
    assert.equal(articleSlug("..."), "article");
  });
});

describe("isFigureCandidate", () => {
  it("rejects tiny icons", () => {
    assert.equal(isFigureCandidate({ width: 32, height: 32 }), false);
  });

  it("accepts journal-sized figures", () => {
    assert.equal(isFigureCandidate({ width: 800, height: 600 }), true);
  });
});

describe("wrapImageInSvg", () => {
  it("emits a standalone SVG with image href", () => {
    const svg = wrapImageInSvg({
      width: 100,
      height: 50,
      href: "data:image/png;base64,AAA",
      title: "Figure 1",
    });
    assert.match(svg, /^<\?xml /);
    assert.match(svg, /viewBox="0 0 100 50"/);
    assert.match(svg, /href="data:image\/png;base64,AAA"/);
    assert.match(svg, /<title>Figure 1<\/title>/);
  });
});

describe("helpers", () => {
  it("escapes XML", () => {
    assert.equal(escapeXml(`a<"&>'`), "a&lt;&quot;&amp;&gt;&apos;");
  });

  it("pads indexes", () => {
    assert.equal(padIndex(3), "03");
  });

  it("hashes bytes stably", () => {
    const a = hashBytes(new Uint8Array([1, 2, 3, 4]));
    const b = hashBytes(new Uint8Array([1, 2, 3, 4]));
    const c = hashBytes(new Uint8Array([1, 2, 3, 5]));
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});
