# Figure Extractor — AugmentedMD

Extract the **first page** of a journal article PDF and **all embedded figures** as high-resolution SVG files. Upload in the browser, preview results, then download SVGs individually or as a ZIP.

Nothing is uploaded — processing runs entirely on your device.

## Use

Open the standalone page:

```bash
npm install
npm start
```

Then visit [http://localhost:8080/figure-extractor.html](http://localhost:8080/figure-extractor.html).

Or open `figure-extractor.html` directly after `npm run build`.

1. Drop or choose a journal PDF  
2. Click **Extract SVGs**  
3. Download each SVG, or **Download ZIP** for all assets  

## What you get

| Asset | Output |
| --- | --- |
| First page | `{article}-first-page.svg` — page rendered at 3× scale, wrapped as SVG |
| Figures | `{article}-figure-01.svg`, … — embedded images at native resolution (icons/tiny assets skipped) |

## Develop

```bash
npm run build   # → figure-extractor.html
npm test        # unit + build checks
npm start       # build + local static server on :8080
```

```
src/
  template.html   # AugmentedMD chrome
  ui.css          # design tokens + tool UI
  app.js          # upload / gallery / downloads
  extract.js      # pdf.js first-page + figure extraction
  svg.js          # SVG wrap + naming helpers
  download.js     # Blob + ZIP helpers
scripts/build.mjs
figure-extractor.html   # generated standalone ship file
```

## Stack

- Vanilla HTML/CSS/JS (AugmentedMD theme)
- [pdf.js](https://mozilla.github.io/pdf.js/) for parsing/rendering
- [JSZip](https://stuk.github.io/jszip/) for ZIP downloads
- esbuild single-file bundle

## License

Open source — part of [AugmentedMD](https://github.com/gorin-research-repo/augmentedmd).

Tool by [@michael_gorin](https://twitter.com/michael_gorin) / [@AugmentedMD](https://twitter.com/AugmentedMD)
