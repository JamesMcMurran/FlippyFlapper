# Flippy Flapper

An HTML5 magazine reader and dependency-free JavaScript library with curved page turns, facing pages, and fold-outs.

Read your own page images in the standalone app, or embed a magazine in an existing website. No framework, account, application server, or runtime package installation is required.

## Features

- **Curved page turns:** drag a sheet with the mouse or touch, or turn with buttons and keyboard shortcuts.
- **Full-resolution artwork:** moving pages use the original page images, with separate thumbnails for navigation.
- **Facing and single pages:** responsive layouts, standalone covers, and a visible center fold.
- **Mixed image proportions:** images fit on white paper without stretching.
- **Spreads and fold-outs:** display one image across two pages, or unfold an extra panel to the left or right.
- **Reader controls:** page entry, thumbnails, zoom and pan, fullscreen, and automatic page turns.
- **Local image selection:** the standalone app reads chosen images in your browser without uploading them.
- **Flexible integration:** classic script and ES module builds, scoped styles, TypeScript declarations, and multiple readers per page.

## Try the app

1. Download or clone the repository.
2. Open `index.html` in a desktop browser, keeping the folder and its assets together.
3. Choose **Open page images** and select your JPEG, PNG, WebP, or browser-supported AVIF files.
4. Use **Page layouts** to adjust the paper proportions and assign spreads, fold-outs, or covers.

The bundled app and demos can run offline. No build step is needed. The app initially opens the **Field Notes** demo in facing-page view. Choose **Demo → Mixed pages** to explore square artwork, wide spreads, and fold-outs.

Files are sorted naturally by filename, such as `001.webp`, `002.webp`, and `003.webp`. Selected images are used without recompression; the app generates separate thumbnails. Imported images and layout choices last for the current session, so select them again after reloading.

The app files and bundled examples are included directly in this checkout.

## Embed in an HTML5 page

Copy these files from `lib/` into your website:

- `flippy-flapper.js`
- `flippy-flapper.css`

Add your page images and thumbnails, then create a reader:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My magazine</title>
  <link rel="stylesheet" href="flippy-flapper.css">
</head>
<body>
  <div id="magazine" style="width:100%; height:80vh; min-height:300px"></div>
  <script src="flippy-flapper.js"></script>
  <script>
    const viewer = FlippyFlapper.createMagazineViewer(
      document.getElementById('magazine'),
      {
        initialPage: 2,
        spreadMode: 'always',
        globalArrowKeys: true,
        manifest: {
          title: 'My magazine',
          pageWidth: 2550,
          pageHeight: 3300,
          pageCount: 4,
          pages: [
            { index: 1, layout: 'cover', image: 'pages/001.webp', thumbnail: 'thumbs/001.webp' },
            { index: 2, image: 'pages/002.webp', thumbnail: 'thumbs/002.webp' },
            { index: 3, image: 'pages/003.webp', thumbnail: 'thumbs/003.webp' },
            { index: 4, layout: 'cover', image: 'pages/004.webp', thumbnail: 'thumbs/004.webp' }
          ]
        }
      }
    );

    viewer.ready.catch(error => console.error('Magazine could not open:', error));
  </script>
</body>
</html>
```

For a ready-to-run example, open [examples/embed.html](examples/embed.html). The [mixed-page example](examples/mixed.html) demonstrates spreads and fold-outs.

For an ES module integration, load the same stylesheet and import:

```js
import { createMagazineViewer } from './flippy-flapper.esm.js';
```

An HTTP/HTTPS site can use `manifestUrl: './magazine/manifest.json'` instead of an inline `manifest`. Relative asset paths resolve against the manifest URL. Inline manifests resolve against the host document unless `baseUrl` is supplied. Use an inline manifest for direct local-file use, where browsers restrict JSON fetching. Serve remote artwork with suitable CORS headers.

## Page layouts and numbering

`pageWidth` and `pageHeight` define the proportions of normal paper. Each source entry needs an `image` and `thumbnail`; indexes start at 1 and are consecutive. `pageCount` counts source entries.

| Source `layout` | Display |
| --- | --- |
| `single` (default) | One image fitted inside one page, with white borders where needed. |
| `cover` | A standalone front or back cover. Valid only for the first or last source entry. |
| `spread` | One image divided across two facing pages. Each half turns as part of its sheet. |
| `foldout` | One reading page with an additional panel hinged at the outer edge. |

The app can automatically classify wide images as spreads. Library manifests use the explicit layouts above; an omitted layout means `single`.

Reading-page numbers can differ from source indexes. A spread occupies two reading pages, while a fold-out occupies one plus its wing. Alignment blanks are inserted when necessary to keep a spread together or an explicit back cover alone.

`initialPage` and `goToPage()` use reading-page numbers. Use `initialSourceIndex` to open a particular source image. `getState()` reports `pageIndex`, `sourceIndex`, `pageCount` (including alignment blanks), `sourcePageCount`, `visiblePages` (reading-page/source pairs), and `foldoutsOpen`. Each half of a spread maps to the same source index. Counts are zero and visible pages are empty before a manifest loads. Alignment blanks have a null source index.

Fold-outs open toward their outside edge. The folded view shows the inner half of the image; opening reveals the other half and fits the expanded book to the available width. Navigation closes open fold-outs before turning. A drag on an open fold-out closes it; the next drag turns the page.

## Controls

Start a drag anywhere in the **outer 60% of either facing page**. In single-page view, the left half starts a backward turn and the right half starts a forward turn. When zoomed in, drag to pan. Two touch contacts control pinch zoom.

| Key | Action |
| --- | --- |
| Left / Right arrow | Previous / next page |
| Home / End | First / last page |
| Space | Next page |
| `+` / `-` | Zoom in / out |
| `0` | Fit to the reader |
| `T` | Toggle thumbnails |
| `F` | Toggle fullscreen |
| Escape | Close fold-outs and thumbnails; reset zoom |

Shortcuts normally apply while the reader has focus. The standalone app enables arrow keys across the surrounding page. Set `globalArrowKeys: true` on one embedded reader for the same behavior. Text fields, selects, and open dialogs retain their normal keyboard handling.

## Configuration

Common library options:

| Option | Default | Purpose |
| --- | --- | --- |
| `initialPage` | `1` | Initial reading page |
| `spreadMode` | `'auto'` | `'auto'`, `'always'` for facing pages, or `'never'` for single pages |
| `showHeader` | `false` | Show the title header |
| `showToolbar` | `true` | Show reader controls |
| `showThumbnails` | `false` | Open the thumbnail tray initially |
| `globalArrowKeys` | `false` | Enable page arrows outside the reader |
| `animatePageTurns` | `true` | Set `false` for immediate button/keyboard navigation without curl animations; drag turns are disabled while zoom/pan remain available |
| `navigationTurnDurationMs` | `1000` | Button, keyboard, and automatic turn duration |
| `pageTurnDurationMs` | `450` | Base duration for settling a released drag |
| `autoFlipIntervalMs` | `5000` | Pause between automatic turns |
| `maxZoom` | `3` | Maximum zoom relative to fitted size |

Manual turns follow the pointer. Reduced-motion preferences use a brief transition. Set `animatePageTurns: false` for navigation without a transition, or call `viewer.setPageTurnAnimation(false)` at runtime. See the [TypeScript declarations](lib/flippy-flapper.d.ts) for all options and public methods.

## JavaScript API

`FlippyFlapper.create()` is an alias for `createMagazineViewer()`.

```js
await viewer.ready;
await viewer.next();
await viewer.previous();
viewer.goToPage(5);
viewer.fit();
viewer.setSpreadMode('auto');
viewer.openThumbnails();
await viewer.openFoldout();
await viewer.closeFoldout();

const unsubscribe = viewer.on('pagechange', ({ state }) => {
  console.log('Reading page:', state.pageIndex);
});

console.log(viewer.getState());
unsubscribe();
viewer.destroy();
```

Additional methods include `first()`, `last()`, `zoomIn()`, `zoomOut()`, `closeThumbnails()`, `enterFullscreen()`, `exitFullscreen()`, `startAutoFlip()`, and `stopAutoFlip()`.

Events: `pagechange`, `turnstart`, `turnend`, `zoomchange`, `fullscreenchange`, and `foldoutchange`.

Navigation commands during an active turn are ignored. `goToPage()` jumps directly. `destroy()` removes the viewer, releases its resources, and restores the container's original attributes.

## Rendering and compatibility

The reader attempts WebGL rendering, using a deforming mesh and original image textures. A Canvas 2D fallback uses the same curl geometry with reusable image tiles. A simpler transition is available when curved rendering cannot be used. Nearby images are preloaded and decoded-image caches are bounded.

WebP reduces asset size, but image dimensions still affect decoding, memory, and rendering cost. Full-resolution rendering does not guarantee a particular frame rate on every device.

Browser checks currently cover Chrome with the Canvas fallback. WebGL execution, Safari, Firefox, physical touch devices, and direct `file://` launch still need broader verification.

The app reads exported page images. PDF conversion, OCR/search, magazine editing, persistent import storage, and a publishing backend are not included.

## Development

The distributable library files live in `lib/`. This checkout contains no separate
library source tree or build step. Keep the classic and ES module builds aligned
when changing behavior and update `lib/flippy-flapper.d.ts` for public API changes.

Run the dependency-free API regression tests with Node.js 20 or later:

```sh
npm test
```

For browser checks, serve this checkout with a local HTTP server and open
`index.html` or `examples/embed.html`. Test desktop and narrow-screen layouts;
physical touch devices and Safari/Firefox still require separate verification.

## Contributing

Bug reports should include the browser and operating system, steps to reproduce, page layout, and whether the issue occurs in the bundled demo. Include a small sample using images you have permission to share when the issue depends on particular artwork.

Keep changes focused. For library changes, update both distributed JavaScript files, run `npm test`, and update the relevant documentation. For rendering or input changes, verify the affected interaction in the app and record any browser-specific limitations.

## License

The software is provided under the [MIT License](LICENSE).

Bundled demo photography is separately provided under the [Unsplash License](https://unsplash.com/license):

- [Ireland coast by Rinalds Vanags](https://unsplash.com/photos/an-aerial-view-of-a-rocky-coastline-with-blue-water--yvr2F5lGCI)
- [Leaf by Jens Riesenberg](https://unsplash.com/photos/a-close-up-of-a-large-green-leaf-KsWn2nIB2HE)

Demo page layouts and text were created for this project. A software license does not replace the original terms for third-party photography.

### Cover spreads

Use `layout: 'cover-spread'` on the first source image when it contains the back
cover on the left and front cover on the right. The right half becomes reading
page 1; the left half becomes the final back cover, with an alignment blank
only when needed. Interior `spread` sources remain left-half then right-half
and can be read individually in single-page mode. A cover spread is allowed
only at the beginning of the manifest.
