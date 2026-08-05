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
