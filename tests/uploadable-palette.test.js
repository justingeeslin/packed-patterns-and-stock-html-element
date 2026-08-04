import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../src/UploadablePalette.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

const SIMPLE_SVG = `
  <svg xmlns="${SVG_NS}" viewBox="0 0 60 40">
    <path id="front-path" d="M 5 5 L 55 5 L 45 35 L 15 35 Z" fill="none"></path>
    <circle id="notch" cx="30" cy="10" r="4"></circle>
  </svg>
`;

function createFixture({ board = "board" } = {}) {
  const container = document.createElement("div");

  container.innerHTML = `
    <svg id="${board}" xmlns="${SVG_NS}"></svg>
    <uploadable-palette board="${board}"></uploadable-palette>
  `;

  document.body.appendChild(container);

  return {
    container,
    board: container.querySelector(`#${CSS.escape(board)}`),
    palette: container.querySelector("uploadable-palette"),
  };
}

function createSvgFile(contents = SIMPLE_SVG, name = "front-bodice.svg") {
  return new File([contents], name, {
    type: "image/svg+xml",
  });
}

function waitForUploadEvents(palette, count) {
  return new Promise((resolve) => {
    const events = [];
    const onUploaded = (event) => {
      events.push(event);

      if (events.length === count) {
        palette.removeEventListener("svg-uploaded", onUploaded);
        resolve(events);
      }
    };

    palette.addEventListener("svg-uploaded", onUploaded);
  });
}

async function uploadFiles(palette, files) {
  const input = palette.shadowRoot.querySelector("#svgPieceUpload");
  const uploads = waitForUploadEvents(palette, files.length);

  Object.defineProperty(input, "files", {
    value: files,
    configurable: true,
  });

  input.dispatchEvent(
    new Event("change", {
      bubbles: true,
    }),
  );

  return uploads;
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

describe("UploadablePalette", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("registers the custom element", () => {
    expect(customElements.get("uploadable-palette")).toBeDefined();
  });

  test("renders the SVG upload input", () => {
    const { palette } = createFixture();
    const input = palette.shadowRoot.querySelector("#svgPieceUpload");

    expect(input).not.toBeNull();
    expect(input.accept).toContain(".svg");
    expect(input.multiple).toBe(true);
  });

  test("adds an uploaded SVG as a piece quantity control", async () => {
    const { palette } = createFixture();

    const [event] = await uploadFiles(palette, [createSvgFile()]);
    const control = event.detail.control;

    expect(control.tagName.toLowerCase()).toBe("piece-quantity-control");
    expect(control.id).toBe("uploaded-front-bodice-0-control");
    expect(control.getAttribute("board")).toBe("board");
    expect(control.getAttribute("piece-kind")).toBe("uploaded-front-bodice-0");
    expect(control.getAttribute("label")).toBe("Front Bodice");
    expect(control.getAttribute("value")).toBe("0");
    expect(palette.shadowRoot.getElementById(control.id)).toBe(control);
  });

  test("creates a miniaturized preview SVG from the uploaded SVG", async () => {
    const { palette } = createFixture();

    const [event] = await uploadFiles(palette, [createSvgFile()]);
    const preview = event.detail.control.querySelector('svg[slot="preview"]');

    expect(preview).not.toBeNull();
    expect(preview.getAttribute("width")).toBe("48");
    expect(preview.getAttribute("height")).toBe("48");
    expect(preview.getAttribute("viewBox")).toBe("0 0 60 40");
    expect(preview.querySelector("#front-path")).not.toBeNull();
    expect(preview.querySelector("#notch")).not.toBeNull();
  });

  test("stores the uploaded SVG content in the shape template", async () => {
    const { palette } = createFixture();

    const [event] = await uploadFiles(palette, [createSvgFile()]);
    const template = event.detail.control.querySelector('template[slot="shape"]');
    const templateSvg = template.content.querySelector("svg");
    const wrapper = templateSvg.querySelector("g");

    expect(templateSvg.getAttribute("viewBox")).toBe("0 0 60 40");
    expect(wrapper.getAttribute("role")).toBe("garment");
    expect(wrapper.getAttribute("data-draggable")).toBe("true");
    expect(wrapper.querySelector("#front-path")).not.toBeNull();
    expect(wrapper.querySelector("#notch")).not.toBeNull();
  });

  test("uses unique IDs for multiple uploads with the same filename", async () => {
    const { palette } = createFixture();

    const events = await uploadFiles(palette, [
      createSvgFile(SIMPLE_SVG, "front-bodice.svg"),
      createSvgFile(SIMPLE_SVG, "front-bodice.svg"),
    ]);

    expect(events.map((event) => event.detail.controlId)).toEqual([
      "uploaded-front-bodice-0-control",
      "uploaded-front-bodice-1-control",
    ]);
  });

  test("uploaded controls can add their SVG content to the board", async () => {
    const { palette, board } = createFixture();

    const [event] = await uploadFiles(palette, [createSvgFile()]);
    const control = event.detail.control;

    await setQuantity(control, 1);

    const piece = board.querySelector(
      '[data-owner-control="uploaded-front-bodice-0-control"]',
    );

    expect(piece).not.toBeNull();
    expect(piece.getAttribute("data-piece-kind")).toBe("uploaded-front-bodice-0");
    expect(piece.getAttribute("data-owner-control")).toBe(
      "uploaded-front-bodice-0-control",
    );
    expect(piece.getAttribute("role")).toBe("garment");
    expect(piece.querySelector("#front-path")).not.toBeNull();
    expect(piece.querySelector("#notch")).not.toBeNull();
  });
});
