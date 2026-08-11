import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildStandalone } from "../scripts/build.mjs";

describe("standalone build", () => {
  it("inlines AugmentedMD chrome and app logic", async () => {
    const html = await buildStandalone();
    assert.match(html, /Figure Extractor/);
    assert.match(html, /--brand-gradient/);
    assert.match(html, /AugmentedMD/);
    assert.match(html, /Extract SVGs/);
    assert.match(html, /Download ZIP/);
    assert.doesNotMatch(html, /\{\{CSS\}\}/);
    assert.doesNotMatch(html, /\{\{SCRIPT\}\}/);
    assert.match(html, /pdfjsWorker/);
  });

  it("writes figure-extractor.html via npm build artifact", async () => {
    const html = await readFile(new URL("../figure-extractor.html", import.meta.url), "utf8");
    assert.ok(html.length > 50_000);
  });
});
