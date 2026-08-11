import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildStandalone() {
  const result = await esbuild.build({
    entryPoints: [join(root, "src/app.js")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["es2022"],
    logLevel: "warning",
  });

  const appBundle = result.outputFiles[0].text;
  const css = await readFile(join(root, "src/ui.css"), "utf8");
  const template = await readFile(join(root, "src/template.html"), "utf8");

  if (/<\/script/i.test(appBundle)) {
    throw new Error("Inlined script would terminate the HTML script element early.");
  }

  return template
    .replace("/* {{CSS}} */", () => css.trim())
    .replace("/* {{SCRIPT}} */", () => appBundle.trim())
    .replace('<script type="module">', "<script>");
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const html = await buildStandalone();
  await writeFile(join(root, "figure-extractor.html"), html);
  await writeFile(join(root, "index.html"), html);
  console.log(`Wrote figure-extractor.html and index.html (${html.length.toLocaleString()} bytes)`);
}
