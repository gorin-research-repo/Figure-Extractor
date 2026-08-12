# Figure Extractor — AugmentedMD

Convert **every page** of a journal article PDF into a high-resolution SVG, then **select a page, crop the figure, and download**.

Nothing is uploaded — processing runs entirely on your device.

## Use

```bash
npm install
npm start
```

Visit [http://localhost:8080/](http://localhost:8080/) (or `figure-extractor.html`).

1. Drop or choose a journal PDF  
2. Choose render quality (default **Print · 300 DPI**)  
3. Click **Extract pages**  
4. Select a page, crop the figure, download SVG  

Higher DPI (450 / 600) makes sharper crops but uses more memory and may be capped on very large pages.

## Develop

```bash
npm run build   # → index.html + figure-extractor.html
npm test
npm start
```

```
src/
  template.html   # AugmentedMD chrome
  ui.css          # design tokens + crop UI
  app.js          # upload / page select / crop / download
  extract.js      # pdf.js page → high-res SVG
  crop.js         # crop geometry + SVG export
  svg.js          # SVG wrap + naming helpers
  download.js     # Blob download helper
scripts/build.mjs
```

## Stack

- Vanilla HTML/CSS/JS (AugmentedMD theme)
- [pdf.js](https://mozilla.github.io/pdf.js/) for page rendering
- esbuild single-file bundle

## License

Open source — part of [AugmentedMD](https://github.com/gorin-research-repo/augmentedmd).

Tool by [@michael_gorin](https://twitter.com/michael_gorin) / [@AugmentedMD](https://twitter.com/AugmentedMD)
