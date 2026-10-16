// tests/piece-quantity-control.test.js

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../src/PieceQuantityControl.js";

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

function createFixture({
  id = "triangle-control",
  board = "board",
  pieceKind = "triangle",
  label = "Triangles",
  value = 0,
  template = `
	<template slot="shape">
	  <svg xmlns="http://www.w3.org/2000/svg">
		<g class="piece">
		  <path d="M 0 20 L 10 0 L 20 20 Z"></path>
		</g>
	  </svg>
	</template>
  `,
} = {}) {
  const container = document.createElement("div");

  container.innerHTML = `
	<svg id="${board}" xmlns="http://www.w3.org/2000/svg"></svg>

	<piece-quantity-control
	  id="${id}"
	  board="${board}"
	  piece-kind="${pieceKind}"
	  label="${label}"
	  value="${value}">
	  ${template}
	</piece-quantity-control>
  `;

  document.body.appendChild(container);

  return {
	container,
	board: container.querySelector(`#${CSS.escape(board)}`),
	control: container.querySelector("piece-quantity-control"),
  };
}

function getOwnedPieces(board, owner, pieceKind) {
  return Array.from(
	board.querySelectorAll(
	  `[data-owner-control="${CSS.escape(owner)}"]` +
		`[data-piece-kind="${CSS.escape(pieceKind)}"]`,
	),
  );
}

async function setQuantity(control, value) {
  control.qtyInput.value = String(value);
  control.qtyInput.dispatchEvent(
	new Event("input", {
	  bubbles: true,
	  composed: true,
	}),
  );

  await nextFrame();
}

describe("PieceQuantityControl", () => {
  beforeEach(() => {
	document.body.innerHTML = "";
  });

  afterEach(() => {
	document.body.innerHTML = "";
  });

  test("registers the custom element", () => {
	expect(customElements.get("piece-quantity-control")).toBeDefined();
  });

  test("creates an open shadow root", () => {
	const { control } = createFixture();

	expect(control.shadowRoot).not.toBeNull();
	expect(control.shadowRoot.querySelector(".control")).not.toBeNull();
	expect(control.qtyInput).not.toBeNull();
  });

  test("hides the CV debug button when no debug images are available", () => {
	const { control } = createFixture();

	expect(control.debugButton.hidden).toBe(true);
	expect(control.debugImages).toEqual([]);
  });

  test("opens a CV debug image viewer when debug images are available", () => {
	const { control } = createFixture();

	control.debugImages = [
	  {
		name: "imgWarp",
		filename: "3_imgWarp.png",
		mime_type: "image/png",
		url: "/debug-images/session/3_imgWarp.png",
	  },
	];

	control.debugButton.click();

	const image = control.shadowRoot.querySelector(".debug-figure img");
	const openLink = control.shadowRoot.querySelector(".debug-caption a");

	expect(control.debugButton.hidden).toBe(false);
	expect(control.debugButton.textContent).toBe("CV Debug");
	expect(control.debugModalEl.hidden).toBe(false);
	expect(image.alt).toBe("imgWarp");
	expect(new URL(image.src).pathname).toBe(
	  "/debug-images/session/3_imgWarp.png",
	);
	expect(openLink.target).toBe("_blank");

	control.debugCloseButton.click();

	expect(control.debugModalEl.hidden).toBe(true);
  });

  test("renders the label attribute", () => {
	const { control } = createFixture({
	  label: "Squares",
	});

	expect(control.labelEl.textContent).toBe("Squares");
  });

  test("uses piece-kind as the default label", () => {
	const { control } = createFixture({
	  pieceKind: "hexagon",
	  label: "",
	});

	control.removeAttribute("label");

	expect(control.labelEl.textContent).toBe("hexagon");
  });

  test("renders the initial value in the number input", () => {
	const { control } = createFixture({
	  value: 4,
	});

	expect(control.qtyInput.value).toBe("4");
	expect(control.value).toBe(4);
  });

  test("normalizes negative values to zero", () => {
	const { control } = createFixture();

	control.value = -5;

	expect(control.getAttribute("value")).toBe("0");
	expect(control.qtyInput.value).toBe("0");
	expect(control.value).toBe(0);
  });

  test("normalizes nonnumeric values to zero", () => {
	const { control } = createFixture();

	control.value = "not-a-number";

	expect(control.value).toBe(0);
	expect(control.qtyInput.value).toBe("0");
  });

  test("updates the label when the label attribute changes", () => {
	const { control } = createFixture({
	  label: "Triangles",
	});

	control.setAttribute("label", "Large triangles");

	expect(control.labelEl.textContent).toBe("Large triangles");
  });

  test("updates the input when the value attribute changes", () => {
	const { control } = createFixture({
	  value: 1,
	});

	control.setAttribute("value", "7");

	expect(control.qtyInput.value).toBe("7");
	expect(control.value).toBe(7);
  });

  test("finds the target SVG board", () => {
	const { control, board } = createFixture();

	expect(control.boardSvgElement).toBe(board);
  });

  test("adds SVG pieces when the requested quantity increases", async () => {
	const { control, board } = createFixture();

	await setQuantity(control, 3);

	const pieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(pieces).toHaveLength(3);
	expect(control.value).toBe(3);
	expect(control.getAttribute("value")).toBe("3");
  });

  test("adds ownership metadata to generated pieces", async () => {
	const { control, board } = createFixture();

	await setQuantity(control, 1);

	const [piece] = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(piece.getAttribute("data-owner-control")).toBe(
	  "triangle-control",
	);

	expect(piece.getAttribute("data-piece-kind")).toBe(
	  "triangle",
	);

	expect(piece.getAttribute("data-instance-id")).toBe(
	  "triangle-control-0",
	);
  });

  test("increments instance IDs for newly generated pieces", async () => {
	const { control, board } = createFixture();

	await setQuantity(control, 3);

	const pieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(
	  pieces.map((piece) =>
		piece.getAttribute("data-instance-id"),
	  ),
	).toEqual([
	  "triangle-control-0",
	  "triangle-control-1",
	  "triangle-control-2",
	]);
  });

  test("positions pieces in a six-column grid", async () => {
	const { control, board } = createFixture();

	await setQuantity(control, 7);

	const pieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(pieces[0].getAttribute("transform")).toBe(
	  "translate(80, 80)",
	);

	expect(pieces[1].getAttribute("transform")).toBe(
	  "translate(200, 80)",
	);

	expect(pieces[5].getAttribute("transform")).toBe(
	  "translate(680, 80)",
	);

	expect(pieces[6].getAttribute("transform")).toBe(
	  "translate(80, 200)",
	);
  });

  test("preserves an existing template transform", async () => {
	const { control, board } = createFixture({
	  template: `
		<template slot="shape">
		  <svg xmlns="http://www.w3.org/2000/svg">
			<g transform="scale(2)">
			  <circle cx="0" cy="0" r="10"></circle>
			</g>
		  </svg>
		</template>
	  `,
	});

	await setQuantity(control, 1);

	const [piece] = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(piece.getAttribute("transform")).toBe(
	  "translate(80, 80) scale(2)",
	);
  });

  test("removes pieces when the requested quantity decreases", async () => {
	const { control, board } = createFixture();

	await setQuantity(control, 5);
	await setQuantity(control, 2);

	const pieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(pieces).toHaveLength(2);
	expect(control.value).toBe(2);
  });

  test("removes the most recently added pieces first", async () => {
	const { control, board } = createFixture();

	await setQuantity(control, 4);

	const originalPieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	const firstPiece = originalPieces[0];
	const secondPiece = originalPieces[1];

	await setQuantity(control, 2);

	const remainingPieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(remainingPieces).toHaveLength(2);
	expect(remainingPieces[0]).toBe(firstPiece);
	expect(remainingPieces[1]).toBe(secondPiece);
  });

  test("treats multiple template roots as one quantity unit", async () => {
	const { control, board } = createFixture({
	  template: `
		<template slot="shape">
		  <svg xmlns="http://www.w3.org/2000/svg">
			<g id="front-piece"><path d="M0 0 L10 0 L5 10 Z"></path></g>
			<g id="back-piece"><path d="M0 0 L20 0 L20 8 L0 8 Z"></path></g>
		  </svg>
		</template>
	  `,
	});

	await setQuantity(control, 2);

	let pieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(pieces).toHaveLength(4);
	expect(pieces.map((piece) => piece.id)).toEqual([
	  "front-piece",
	  "back-piece",
	  "front-piece",
	  "back-piece",
	]);
	expect(pieces.map((piece) => piece.getAttribute("data-owner-unit"))).toEqual([
	  "triangle-control-0",
	  "triangle-control-0",
	  "triangle-control-1",
	  "triangle-control-1",
	]);
	expect(pieces.map((piece) => piece.getAttribute("transform"))).toEqual([
	  "translate(80, 80)",
	  "translate(200, 80)",
	  "translate(320, 80)",
	  "translate(440, 80)",
	]);

	await setQuantity(control, 1);

	pieces = getOwnedPieces(
	  board,
	  "triangle-control",
	  "triangle",
	);

	expect(pieces).toHaveLength(2);
	expect(pieces.map((piece) => piece.id)).toEqual([
	  "front-piece",
	  "back-piece",
	]);
	expect(
	  new Set(pieces.map((piece) => piece.getAttribute("data-owner-unit"))),
	).toEqual(new Set(["triangle-control-0"]));
  });

  test("does not remove pieces owned by another control", async () => {
	const container = document.createElement("div");

	container.innerHTML = `
	  <svg id="shared-board" xmlns="http://www.w3.org/2000/svg"></svg>

	  <piece-quantity-control
		id="control-a"
		board="shared-board"
		piece-kind="triangle">
		<template slot="shape">
		  <svg xmlns="http://www.w3.org/2000/svg">
			<g><path d="M0 0 L10 0 L5 10 Z"></path></g>
		  </svg>
		</template>
	  </piece-quantity-control>

	  <piece-quantity-control
		id="control-b"
		board="shared-board"
		piece-kind="triangle">
		<template slot="shape">
		  <svg xmlns="http://www.w3.org/2000/svg">
			<g><path d="M0 0 L10 0 L5 10 Z"></path></g>
		  </svg>
		</template>
	  </piece-quantity-control>
	`;

	document.body.appendChild(container);

	const board = container.querySelector("#shared-board");
	const controlA = container.querySelector("#control-a");
	const controlB = container.querySelector("#control-b");

	await setQuantity(controlA, 3);
	await setQuantity(controlB, 2);
	await setQuantity(controlA, 1);

	expect(
	  getOwnedPieces(board, "control-a", "triangle"),
	).toHaveLength(1);

	expect(
	  getOwnedPieces(board, "control-b", "triangle"),
	).toHaveLength(2);
  });

  test("isolates pieces by piece kind", async () => {
	const container = document.createElement("div");
	const SVG_NS = "http://www.w3.org/2000/svg";
	container.innerHTML = `
	  <svg id="shared-board" xmlns="http://www.w3.org/2000/svg"></svg>

	  <piece-quantity-control
		id="piece-control"
		board="shared-board"
		piece-kind="triangle">
		<template slot="shape">
		  <svg xmlns="http://www.w3.org/2000/svg">
			<g><path d="M0 0 L10 0 L5 10 Z"></path></g>
		  </svg>
		</template>
	  </piece-quantity-control>
	`;

	document.body.appendChild(container);

	const board = container.querySelector("#shared-board");
	const control = container.querySelector("#piece-control");

	const unrelated = document.createElementNS(SVG_NS, "g");
	unrelated.setAttribute("data-owner-control", "piece-control");
	unrelated.setAttribute("data-piece-kind", "square");
	board.appendChild(unrelated);

	await setQuantity(control, 2);
	await setQuantity(control, 0);

	expect(unrelated.isConnected).toBe(true);

	expect(
	  getOwnedPieces(board, "piece-control", "triangle"),
	).toHaveLength(0);
  });

  test("uses the name attribute when no id is provided", async () => {
	const { control, board } = createFixture({
	  id: "",
	});

	control.removeAttribute("id");
	control.setAttribute("name", "named-control");

	await setQuantity(control, 1);

	const [piece] = getOwnedPieces(
	  board,
	  "named-control",
	  "triangle",
	);

	expect(piece).toBeDefined();
  });

  test("uses piece-kind as the owner ID when id and name are absent", async () => {
	const { control, board } = createFixture({
	  id: "",
	  pieceKind: "circle",
	});

	control.removeAttribute("id");
	control.removeAttribute("name");

	await setQuantity(control, 1);

	expect(
	  getOwnedPieces(board, "circle", "circle"),
	).toHaveLength(1);
  });

  test("throws when the shape template is missing", () => {
	const { control } = createFixture({
	  template: "",
	});

	expect(() => control._createOwnedNode(0)).toThrow(
	  "Missing <template slot=\"shape\">",
	);
  });

  test("throws when the template does not contain an SVG root", () => {
	const { control } = createFixture({
	  template: `
		<template slot="shape">
		  <div>Not SVG</div>
		</template>
	  `,
	});

	expect(() => control._createOwnedNode(0)).toThrow(
	  "Shape template must contain an <svg> root",
	);
  });

  test("throws when the SVG template has no child shape", () => {
	const { control } = createFixture({
	  template: `
		<template slot="shape">
		  <svg xmlns="http://www.w3.org/2000/svg"></svg>
		</template>
	  `,
	});

	expect(() => control._createOwnedNode(0)).toThrow(
	  "Shape template SVG must contain one root SVG child element",
	);
  });

  test("removes the input listener when disconnected", async () => {
	const { control, board } = createFixture();

	const input = control.qtyInput;

	control.remove();

	input.value = "3";
	input.dispatchEvent(new Event("input"));

	await nextFrame();

	expect(board.children).toHaveLength(0);
  });
});
