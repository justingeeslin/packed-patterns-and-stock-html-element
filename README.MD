[![Tests](https://github.com/justingeeslin/packed-patterns-and-stock-html-element/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/justingeeslin/packed-patterns-and-stock-html-element/actions/workflows/unit-tests.yml)

## PatternPackBoard endpoint

`<pattern-pack-board>` posts packing requests to the default Packaide proxy unless
an endpoint is configured:

```html
<pattern-pack-board endpoint="/api/pack/sync"></pattern-pack-board>
```

The same setting is available as a JavaScript property for tests or runtime
switching:

```js
const board = document.querySelector("pattern-pack-board");
board.endpoint = "/api/pack/v2";
```

The board renders an inch grid by default. With `board-pixels-per-mm="1"`,
one major grid square is `25.4` board units, matching 1 inch when uploaded
pieces are normalized to 1 px per mm. Minor grid lines default to quarter-inch
subdivisions:

```html
<pattern-pack-board
  board-pixels-per-mm="1"
  grid-subdivisions-per-inch="4"
  grid-major-inches="1">
</pattern-pack-board>
```

## UploadablePalette image conversions

`<uploadable-palette>` adds uploaded SVG files directly as
`<piece-quantity-control>` entries. Non-SVG image uploads are posted to
`photo-upload-endpoint` first, then the returned file URL is sent to the OpenCV
SVG endpoint:

```html
<uploadable-palette
  board="board"
  photo-upload-endpoint="../upload.php"
  opencv-endpoint="https://shrouded-tor-52623-62e8e1beefb8.herokuapp.com"
  board-pixels-per-mm="1"
  uploaded-svg-pixels-per-mm="1"
  reference-width-mm="215.9"
  reference-height-mm="279.4">
</uploadable-palette>
```

The OpenCV request is sent as
`?url=...&reference_width_mm=215.9&reference_height_mm=279.4&debug_image_urls=1`,
and the returned SVG is added through the same path as a directly uploaded SVG.

JSON OpenCV responses may include `debug_image_urls`, a list of snapshots from
the CV pipeline. When present, the generated `<piece-quantity-control>` shows a
CV Debug button that opens a troubleshooting viewer with those images. Failed
OpenCV responses can include the same field; in that case the upload error
shows a Show Debug Images button without adding a new pattern control.

Uploaded pattern geometry is normalized to the board coordinate system with
`board-pixels-per-mm`, which defaults to `1`, meaning 1 board pixel equals 1 mm.
Uploaded SVG geometry uses `uploaded-svg-pixels-per-mm`, also defaulting to `1`.
SVG `<desc>` metadata, including DXF export details like `scale = 25.400000`,
is logged for diagnostics only and does not change uploaded piece scale.

The same settings can be changed from JavaScript:

```js
const palette = document.querySelector("uploadable-palette");
palette.boardPixelsPerMm = 1;
palette.uploadedSvgPixelsPerMm = 3.7795;
```

After a non-SVG file is uploaded, the component opens an HTML modal for the
reference object width, height, and unit before the OpenCV request is sent.
Units may be millimeters, centimeters, or inches. The component converts those
values to millimeters for the endpoint. It also logs when the native
`window.prompt` API is unavailable, since the modal is used instead of native
browser prompts.

## Local irregular stock worker test

The example pages post to `/__packaide_irregular_stock`, which Vite proxies to
the local worker endpoint when `PACKAIDE_IRREGULAR_STOCK_ENDPOINT` is set:

```shell
PACKAIDE_IRREGULAR_STOCK_ENDPOINT="http://127.0.0.1:8000/runsync" ./node_modules/.bin/vite --host 127.0.0.1
```

Open `http://127.0.0.1:5173/example.html`,
`http://127.0.0.1:5173/example-2-pieces.html`,
`http://127.0.0.1:5173/example-2-bins.html`, or
`http://127.0.0.1:5173/example-2-uploadable-palettes.html`.

You can also override an example endpoint with `?endpoint=...`.

The irregular-stock contract test is skipped unless the local worker endpoint is
provided. Start the local worker endpoint, then run:

```shell
PACKAIDE_IRREGULAR_STOCK_ENDPOINT="http://127.0.0.1:8000/runsync" npm run test:run -- tests/pattern-pack-board.test.js
```

For the Docker worker image, the payload schema matches the file mounted by:

```shell
docker run --rm -v "$PWD/test_input.json:/test_input.json:ro" packaide-irregular-stock-worker:dev
```
