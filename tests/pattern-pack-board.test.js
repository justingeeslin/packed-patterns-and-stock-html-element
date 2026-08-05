import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_PACKAIDE_ENDPOINT,
  PatternPackBoard,
} from "../src/PatternPackBoard.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LOCAL_PACKAIDE_ENDPOINT = __PACKAIDE_IRREGULAR_STOCK_ENDPOINT__;

function createFixture({ endpoint, attributes = "", svg } = {}) {
  const container = document.createElement("div");
  const endpointAttribute =
	endpoint === undefined ? "" : ` endpoint="${endpoint}"`;
  const boardSvg = svg || `
	  <svg id="board" xmlns="${SVG_NS}" viewBox="0 0 20 20">
		<polygon id="stock" role="stock" points="0,0 20,0 16,20 0,20"></polygon>
		<path id="part" role="garment" d="M 1 1 L 9 1 L 1 9 Z"></path>
	  </svg>
	`;

  container.innerHTML = `
	<pattern-pack-board${endpointAttribute}${attributes}>
	  ${boardSvg}
	</pattern-pack-board>
  `;

  document.body.appendChild(container);

  return {
	container,
	board: container.querySelector("pattern-pack-board"),
  };
}

function jsonResponse(data, options = {}) {
  return new Response(JSON.stringify(data), {
	status: options.status ?? 200,
	headers: {
	  "Content-Type": "application/json",
	},
  });
}

function parseSvg(svgText) {
  return new DOMParser().parseFromString(svgText, "image/svg+xml");
}

function workerResultSvg({ id = "packed-part" } = {}) {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 20 20"><polygon id="packed-stock" role="stock" points="0,0 20,0 16,20 0,20"></polygon><path id="${id}" role="garment" d="M 2 2 L 10 2 L 2 10 Z"></path></svg>`;
}

describe("PatternPackBoard", () => {
  beforeEach(() => {
	document.body.innerHTML = "";
  });

  afterEach(() => {
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
  });

  test("registers the custom element", () => {
	expect(customElements.get("pattern-pack-board")).toBe(PatternPackBoard);
  });

  test("uses the default Packaide endpoint when none is configured", () => {
	const board = document.createElement("pattern-pack-board");

	expect(board.endpoint).toBe(DEFAULT_PACKAIDE_ENDPOINT);
	expect(board.getAttribute("endpoint")).toBeNull();
  });

  test("uses the endpoint attribute when configured in markup", () => {
	const { board } = createFixture({
	  endpoint: "/api/pack/v2",
	});

	expect(board.endpoint).toBe("/api/pack/v2");
  });

  test("reflects the endpoint property to the endpoint attribute", () => {
	const board = document.createElement("pattern-pack-board");

	board.endpoint = "/api/pack/candidate";

	expect(board.getAttribute("endpoint")).toBe("/api/pack/candidate");
	expect(board.endpoint).toBe("/api/pack/candidate");

	board.endpoint = null;

	expect(board.getAttribute("endpoint")).toBeNull();
	expect(board.endpoint).toBe(DEFAULT_PACKAIDE_ENDPOINT);
  });

  test("posts Packaide irregular stock payloads to the configured endpoint", async () => {
	const { board } = createFixture({
	  endpoint: "/api/pack/irregular",
	});

	const fetchMock = vi.fn().mockResolvedValue(
	  jsonResponse({
		outputs: [{ sheet_index: 0, svg: workerResultSvg() }],
		placed: 1,
		unplaced: 0,
		svg: workerResultSvg(),
	  }),
	);

	vi.stubGlobal("fetch", fetchMock);

	await board.syncNow();

	const [url, options] = fetchMock.mock.calls[0];
	const payload = JSON.parse(options.body);

	expect(url).toBe("/api/pack/irregular");
	expect(options.method).toBe("POST");
	expect(options.headers).toEqual({
	  "Content-Type": "application/json",
	});
	expect(payload).toEqual({
	  input: expect.objectContaining({
		offset: 0,
		parts_svg: expect.any(String),
		persist: false,
		rotations: 1,
		stock_svg: expect.any(String),
		tolerance: 0.03,
	  }),
	});
	expect(payload.input).not.toHaveProperty("stock_svgs");

	const stockDoc = parseSvg(payload.input.stock_svg);
	const partsDoc = parseSvg(payload.input.parts_svg);
	expect(stockDoc.documentElement.getAttribute("viewBox")).toBe("0 0 20 20");
	expect(stockDoc.querySelector("#stock")?.getAttribute("role")).toBe("stock");
	expect(partsDoc.querySelector("#part")?.getAttribute("role")).toBe("garment");

	const packedSvg = board.querySelector("svg");
	expect(packedSvg.getAttribute("id")).toBe("board");
	expect(packedSvg.querySelector("#packed-part")).not.toBeNull();
  });

  test("posts multiple stock SVGs as stock_svgs", () => {
	const { board } = createFixture({
	  attributes: ' partial-solution="true" rotations="4" tolerance="0.01" offset="2" stock-inset="0.125"',
	  svg: `
		<svg id="board" xmlns="${SVG_NS}" viewBox="0 0 50 50" width="50" height="50">
		  <polygon id="stock-a" role="stock" points="0,0 20,0 20,20 0,20"></polygon>
		  <polygon id="stock-b" role="stock" points="25,0 50,0 50,20 25,20"></polygon>
		  <polygon id="part-a" role="garment" points="0,0 10,0 0,10"></polygon>
		</svg>
	  `,
	});

	const payload = board.getPayload();

	expect(payload.input).toEqual(expect.objectContaining({
	  offset: 2,
	  partial_solution: true,
	  parts_svg: expect.any(String),
	  rotations: 4,
	  stock_inset: 0.125,
	  stock_svgs: [expect.any(String), expect.any(String)],
	  tolerance: 0.01,
	}));
	expect(payload.input).not.toHaveProperty("stock_svg");
	expect(parseSvg(payload.input.stock_svgs[0]).querySelector("#stock-a")).not.toBeNull();
	expect(parseSvg(payload.input.stock_svgs[1]).querySelector("#stock-b")).not.toBeNull();
  });

  test("consumes RunPod-wrapped worker output SVGs", async () => {
	const { board } = createFixture({
	  endpoint: "/api/runpod/runsync",
	});

	vi.stubGlobal(
	  "fetch",
	  vi.fn().mockResolvedValue(
		jsonResponse({
		  status: "COMPLETED",
		  output: {
			outputs: [{ sheet_index: 0, svg: workerResultSvg({ id: "wrapped-output" }) }],
			placed: 1,
			unplaced: 0,
		  },
		}),
	  ),
	);

	await board.syncNow();

	expect(board.querySelector("#wrapped-output")).not.toBeNull();
	expect(window.pack_output).toEqual(expect.objectContaining({
	  placed: 1,
	  unplaced: 0,
	}));
  });

  test("still consumes legacy garment_marker responses", async () => {
	const { board } = createFixture({
	  endpoint: "/api/legacy-packaide",
	});

	vi.stubGlobal(
	  "fetch",
	  vi.fn().mockResolvedValue(
		jsonResponse({
		  status: "COMPLETE",
		  output: {
			garment_marker: `<svg xmlns="${SVG_NS}" viewBox="0 0 20 20"><path id="legacy-output" d="M 2 2 L 18 2 L 18 18 L 2 18 Z"></path></svg>`,
		  },
		}),
	  ),
	);

	await board.syncNow();

	expect(board.querySelector("#legacy-output")).not.toBeNull();
  });

  const testWithLocalEndpoint = LOCAL_PACKAIDE_ENDPOINT ? test : test.skip;

  testWithLocalEndpoint(
	"round trips against the local Packaide irregular-stock endpoint",
	async () => {
	  const { board } = createFixture({
		endpoint: LOCAL_PACKAIDE_ENDPOINT,
		attributes: ' persist="false" partial-solution="true"',
		svg: `
		  <svg id="board" xmlns="${SVG_NS}" viewBox="0 0 2.5 2.5" width="2.5" height="2.5">
			<circle id="stock" role="stock" cx="1.25" cy="1.25" r="1.25"></circle>
			<circle id="part" role="garment" cx="0.5" cy="0.5" r="0.35"></circle>
		  </svg>
		`,
	  });

	  await board.syncNow();

	  expect(window.pack_output).toEqual(expect.objectContaining({
		placed: expect.any(Number),
		unplaced: expect.any(Number),
	  }));
	  expect(board.querySelector("svg")).not.toBeNull();
	},
	60000,
  );
});
