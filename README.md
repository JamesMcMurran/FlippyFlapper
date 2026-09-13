# Flippy Flapper: HTML5 app and JavaScript library

## Use the app

1. Extract the entire ZIP.
2. Open `index.html` in a current desktop browser.
3. Click **Open page images** and select your JPEG, PNG, WebP, or AVIF pages.

No installation, Node.js, npm, build step, or server is required. The app and demo work offline. Your chosen images stay in your browser and are never uploaded.

The app opens the first interior spread (pages 2–3) with **View → Facing pages** selected. Choose **Auto** for a responsive layout or **Single page** for one-page reading. Short desktop windows keep both pages visible. Covers still appear alone; use **First page** to see the front cover. Both layouts use a deforming paper mesh: a moving curl bends the outer edge back while the untouched sheet stays flat.

Pages are sorted naturally by filename: `001.webp`, `002.webp`, etc. Page 1 is the front cover. Interior spreads are 2–3, 4–5, etc. Images may have different aspect ratios. They are fitted on white paper without stretching. The selected files provide full-resolution page textures; the app creates separate WebP thumbnails (PNG fallback if the browser cannot encode WebP). Selected page files are used directly without recompression. Choose the files again after closing or reloading the app; layout choices are kept only for the current session. The app does not convert PDFs.

The bundled demo uses quality-90 WebP pages at the original 2550 × 3300 resolution and quality-80 WebP thumbnails. WebP reduces download size; decoded image dimensions and rendering workload remain the same. For your own magazine, export full-size WebP pages and pass their paths in the manifest.

## Mixed image sizes and fold-outs

Open **Page layouts** after selecting your images. **Paper size from** chooses the image whose proportions define a normal page (initially the first image).

| Layout | Result |
|---|---|
| Auto | First/last images become single covers when not wide. Images at least 1.6× the base paper aspect ratio become spreads. Others fit a single page. |
| Single page · white borders | The complete image fits inside one page, with white space where the proportions differ. |
| Two-page spread | One image supplies the left and right halves of a complete spread. Each half turns normally. |
| Fold-out · two panels | One closed page has a second panel hinged at its outside edge. Click **Open fold-out** to reveal the full image beside its facing page. |
| Single cover | Front or back cover stands alone. Available for the first and last source images. |

A fold-out on the left opens left; one on the right opens right. The book scales and centers to fit all open panels. The folded view shows the inner half of the image; unfolding reveals the other half. Navigation closes open panels before the normal curl. The first drag on an open fold-out closes it; subsequent drags turn pages normally. Zoom, thumbnails, and single-page mode remain available.

**Demo → Mixed pages** demonstrates both fold-out directions, a square image with white borders, a complete two-page image, and single covers. `examples/mixed.html` is the equivalent minimal library example.

Page numbers count physical reading pages. A two-page source image occupies two numbers. Fold-outs occupy one number plus their wing. White blank pages are inserted where necessary to keep a spread together or the final cover alone. **Page layouts** lists original image filenames so these numbering changes do not affect which image you edit.

For the JavaScript library, declare each source image's optional `layout` (`single`, `spread`, `foldout`, or `cover`). It defaults to `single`. Set `pageWidth` and `pageHeight` to the normal paper size, and set `pageCount` to the number of source image entries:

```js
const manifest = {
  title: 'My magazine', pageWidth: 2550, pageHeight: 3300, pageCount: 4,
  pages: [
    {index: 1, layout: 'cover', image: 'cover.webp', thumbnail: 'cover-small.webp'},
    {index: 2, layout: 'spread', image: 'center-spread.webp', thumbnail: 'spread-small.webp'},
    {index: 3, layout: 'foldout', image: 'foldout.webp', thumbnail: 'foldout-small.webp'},
    {index: 4, layout: 'cover', image: 'back.webp', thumbnail: 'back-small.webp'}
  ]
};
```

`goToPage()` and `initialPage` use physical page numbers. Use `initialSourceIndex` to open a particular input image instead. `getState()` includes `sourceIndex` (null for alignment blanks) and `foldoutsOpen` (physical page numbers).

## Put the library in your own HTML5 page

Copy these two files from `lib/` into your website:

- `flippy-flapper.js`
- `flippy-flapper.css`

```html
<link rel="stylesheet" href="flippy-flapper.css">
<div id="magazine" style="width:100%;height:650px"></div>
<script src="flippy-flapper.js"></script>
<script>
  const viewer = FlippyFlapper.createMagazineViewer(
    document.getElementById('magazine'),
    {
      manifest: {
        title: 'My magazine',
        pageWidth: 2550,
        pageHeight: 3300,
        pageCount: 2,
        pages: [
          {index: 1, image: 'pages/001.webp', thumbnail: 'thumbs/001.webp'},
          {index: 2, image: 'pages/002.webp', thumbnail: 'thumbs/002.webp'}
        ]
      }
    }
  );
</script>
```

Open `examples/embed.html` for a working example using the included demo. It includes host-page content and external navigation buttons.

You can alternatively pass `{manifestUrl: 'magazine/manifest.json'}` when served over HTTP/HTTPS. Browsers restrict `fetch()` from local files, so use the inline `manifest` object when opening HTML directly from disk. Relative inline image paths resolve against the host HTML document; set `baseUrl` to resolve against another directory. Remote artwork needs suitable CORS headers for textured rendering.

The classic script exposes only `window.FlippyFlapper`. There are no framework or runtime dependencies. The stylesheet uses `ff-` classes and does not reset your page's body, headings, or buttons. Reader keyboard shortcuts normally apply when focus is inside that reader. The HTML5 app also enables Left/Right arrows from the surrounding page. To enable this in your own host page, set `globalArrowKeys: true` on one viewer. Text inputs, selects, and open dialogs keep their normal key behavior. Multiple readers can coexist. `showHeader` defaults to `false`; the HTML5 app enables it for the magazine title.

Arrow buttons, keyboard navigation, and auto flip use a one-second turn with a gentle start and finish. Manual dragging stays directly tied to the pointer, with the original release timing. Set `navigationTurnDurationMs` when creating the viewer to adjust button-driven animation (default `1000`). `pageTurnDurationMs` controls drag-release settling (default `450`). Reduced-motion transitions remain brief.

## JavaScript API

`FlippyFlapper.create(element, options)` is an alias for `createMagazineViewer`.

```js
await viewer.ready; // Rejects if the manifest cannot be loaded or validated.
viewer.next();
viewer.previous();
viewer.first();
viewer.last();
viewer.goToPage(5);
viewer.zoomIn();
viewer.zoomOut();
viewer.fit();
viewer.setSpreadMode('always'); // auto, always (facing pages), or never (single)
viewer.openThumbnails();
viewer.closeThumbnails();
viewer.enterFullscreen();
viewer.exitFullscreen();
viewer.startAutoFlip();
viewer.stopAutoFlip();
await viewer.openFoldout(); // First visible closed fold-out, or pass its physical page number.
await viewer.closeFoldout(); // All open fold-outs, or pass one page number.
viewer.getState();
const unsubscribe = viewer.on('pagechange', event => console.log(event.state));
unsubscribe();
viewer.destroy(); // Releases resources and restores the container's original attributes.
```

Events: `pagechange`, `turnstart`, `turnend`, `zoomchange`, `fullscreenchange`, `foldoutchange`.

`lib/flippy-flapper.esm.js` is the optional ES module build for sites already using modules. `lib/flippy-flapper.d.ts` describes the API for TypeScript consumers.

The library includes mouse/touch page turns, single/spread layouts, page entry, thumbnails, zoom/pan, fullscreen, auto flip, keyboard controls, and reduced-motion support. The renderer attempts WebGL hardware acceleration, including for locally selected image files. Curl geometry runs in the vertex shader and full-resolution textures stay on the GPU during the turn. If WebGL or texture upload is unavailable (including browser restrictions on local demo images), Canvas uses prebuilt full-resolution tiles and a reusable mesh. Tiles are released after each turn. No thumbnail artwork is used for moving pages.

Mouse gestures recover automatically after a missed release or a window focus change. Page artwork does not use native image dragging; start a turn anywhere in the outer 60% of either facing page. In Single page view, the left half turns backward and the right half turns forward.

## Demo photography

Demo layouts and text were created for this project. Images: Rinalds Vanags, https://unsplash.com/photos/an-aerial-view-of-a-rocky-coastline-with-blue-water--yvr2F5lGCI, and Jens Riesenberg, https://unsplash.com/photos/a-close-up-of-a-large-green-leaf-KsWn2nIB2HE. Used under https://unsplash.com/license.
