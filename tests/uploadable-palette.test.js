import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

const SIZED_SVG_WITHOUT_VIEWBOX = `
  <svg xmlns="${SVG_NS}" width="72" height="36">
    <path d="M 0 0 L 72 0 L 72 36 L 0 36 Z"></path>
  </svg>
`;

const SIZELESS_SVG_WITHOUT_VIEWBOX = `
  <svg xmlns="${SVG_NS}">
    <path d="M 0 0 L 20 0 L 20 20 L 0 20 Z"></path>
  </svg>
`;

const OFFSET_LAYER_SVG = `
  <svg xmlns="${SVG_NS}" viewBox="0 0 1000 1000">
    <g id="exported-layer" transform="translate(820,730)">
      <path id="offset-path" d="M 20 30 L 80 30 L 80 90 L 20 90 Z" fill="none"></path>
    </g>
  </svg>
`;

const INKSCAPE_LAYER_SVG = `
  <svg
    xmlns="${SVG_NS}"
    xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
    viewBox="0 0 1000 1000"
  >
    <g
      id="layer1"
      inkscape:groupmode="layer"
      inkscape:label="Layer 1"
      transform="translate(300,400)"
    >
      <path id="inkscape-path" d="M 10 10 L 70 10 L 70 50 L 10 50 Z" fill="none"></path>
    </g>
  </svg>
`;

const DXF_SCALED_SVG = `
  <svg xmlns="${SVG_NS}" viewBox="0 0 254 254">
    <desc>sample.dxf - scale = 25.400000, origin = (0.000000, 0.000000), method = file</desc>
    <path id="scaled-path" d="M 0 0 L 254 0 L 254 127 L 0 127 Z" fill="none"></path>
  </svg>
`;

const SPACED_SHAPES_WITH_TEXT_SVG = `
  <svg xmlns="${SVG_NS}" viewBox="0 0 320 80">
    <text id="cut-label" x="10" y="70">Cut 1</text>
    <g id="left-piece">
      <path id="left-outline" d="M 10 10 L 70 10 L 70 50 L 10 50 Z" fill="none"></path>
    </g>
    <g id="right-piece" transform="translate(220,0)">
      <path id="right-outline" d="M 10 10 L 70 10 L 70 50 L 10 50 Z" fill="none"></path>
    </g>
  </svg>
`;

const DEBUG_IMAGE_URLS = [
  {
    name: "imgContours_page",
    filename: "0_imgContours_page.png",
    mime_type: "image/png",
    url: "https://example.com/debug-images/session/0_imgContours_page.png",
  },
  {
    name: "imgWarp",
    filename: "3_imgWarp.png",
    mime_type: "image/png",
    url: "https://example.com/debug-images/session/3_imgWarp.png",
  },
];

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

function createImageFile(contents = "fake image contents", name = "front-bodice.jpg") {
  return new File([contents], name, {
    type: "image/jpeg",
  });
}

function jsonResponse(data, options = {}) {
  return new Response(JSON.stringify(data), {
    status: options.status ?? 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function svgResponse(svgText, options = {}) {
  return new Response(svgText, {
    status: options.status ?? 200,
    headers: {
      "Content-Type": "image/svg+xml",
    },
  });
}

function referenceControls(palette) {
  return {
    modal: palette.shadowRoot.querySelector("#referenceDimensionModal"),
    form: palette.shadowRoot.querySelector("#referenceDimensionForm"),
    widthInput: palette.shadowRoot.querySelector("#referenceWidthInput"),
    heightInput: palette.shadowRoot.querySelector("#referenceHeightInput"),
    unitSelect: palette.shadowRoot.querySelector("#referenceUnitSelect"),
    preview: palette.shadowRoot.querySelector("#referenceImagePreview"),
    previewImage: palette.shadowRoot.querySelector("#referenceImagePreviewImg"),
    error: palette.shadowRoot.querySelector("#referenceDimensionError"),
    cancelButton: palette.shadowRoot.querySelector("#referenceCancelButton"),
  };
}

function failureDebugControls(palette) {
  return {
    button: palette.shadowRoot.querySelector(".failure-debug-button"),
    modal: palette.shadowRoot.querySelector("#failureDebugModal"),
    closeButton: palette.shadowRoot.querySelector(".failure-debug-close"),
    images: () =>
      Array.from(
        palette.shadowRoot.querySelectorAll(".failure-debug-figure img"),
      ),
  };
}

async function waitForReferenceModal(palette) {
  const controls = referenceControls(palette);

  for (let index = 0; index < 20; index += 1) {
    await nextFrame();

    if (!controls.modal.hidden) {
      return controls;
    }
  }

  throw new Error("Reference dimension modal did not open.");
}

async function submitReferenceDimensions(
  palette,
  { width = "215.9", height = "279.4", unit = "mm" } = {},
) {
  const controls = await waitForReferenceModal(palette);
  controls.widthInput.value = String(width);
  controls.heightInput.value = String(height);
  controls.unitSelect.value = unit;
  controls.form.dispatchEvent(
    new Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );

  return controls;
}

async function cancelReferenceDimensions(palette) {
  const controls = await waitForReferenceModal(palette);
  controls.cancelButton.click();

  return controls;
}

async function uploadFilesWithReference(palette, files, referenceDimensions) {
  const uploads = waitForUploadEvents(palette, files.length);
  dispatchFiles(palette, files);
  await submitReferenceDimensions(palette, referenceDimensions);

  return uploads;
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

function waitForEvent(target, eventName) {
  return new Promise((resolve) => {
    target.addEventListener(eventName, resolve, {
      once: true,
    });
  });
}

function dispatchFiles(palette, files) {
  const input = palette.shadowRoot.querySelector("#svgPieceUpload");

  Object.defineProperty(input, "files", {
    value: files,
    configurable: true,
  });

  input.dispatchEvent(
    new Event("change", {
      bubbles: true,
    }),
  );

  return input;
}

async function uploadFiles(palette, files) {
  const uploads = waitForUploadEvents(palette, files.length);
  dispatchFiles(palette, files);

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
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("registers the custom element", () => {
    expect(customElements.get("uploadable-palette")).toBeDefined();
  });

  test("renders the SVG upload input", () => {
    const { palette } = createFixture();
    const input = palette.shadowRoot.querySelector("#svgPieceUpload");
    const controls = referenceControls(palette);

    expect(input).not.toBeNull();
    expect(input.accept).toContain(".svg");
    expect(input.accept).toContain("image/*");
    expect(input.multiple).toBe(true);
    expect(controls.modal.hidden).toBe(true);
    expect(controls.widthInput).not.toBeNull();
    expect(controls.heightInput).not.toBeNull();
    expect(controls.unitSelect).not.toBeNull();
    expect(controls.preview).not.toBeNull();
    expect(controls.preview.hidden).toBe(true);
    expect(controls.previewImage).not.toBeNull();
    expect(controls.previewImage.hasAttribute("src")).toBe(false);
  });

  test("logs when window.prompt is unavailable", () => {
    const { palette } = createFixture();
    const originalPrompt = window.prompt;

    try {
      Object.defineProperty(window, "prompt", {
        value: undefined,
        configurable: true,
      });

      palette._logReferenceDimensionPromptMode();

      expect(console.warn).toHaveBeenCalledWith(
        "UploadablePalette: window.prompt is unavailable; using the built-in reference dimension modal.",
      );
    } finally {
      Object.defineProperty(window, "prompt", {
        value: originalPrompt,
        configurable: true,
      });
    }
  });

  test("uses board as the default target board id", () => {
    const container = document.createElement("div");
    container.innerHTML = "<uploadable-palette></uploadable-palette>";
    document.body.appendChild(container);

    const palette = container.querySelector("uploadable-palette");
    const controls = Array.from(
      palette.shadowRoot.querySelectorAll("piece-quantity-control"),
    );

    expect(palette.boardId).toBe("board");
    expect(controls.every((control) => control.getAttribute("board") === "board"))
      .toBe(true);
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
    expect(referenceControls(palette).modal.hidden).toBe(true);
  });

  test("converts an uploaded photo into an SVG piece quantity control", async () => {
    const { palette } = createFixture();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "front-bodice.jpg",
              filename: "saved-front-bodice.jpg",
              url: "/uploads/saved-front-bodice.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(svgResponse(SIMPLE_SVG));

    vi.stubGlobal("fetch", fetchMock);

    const uploads = waitForUploadEvents(palette, 1);
    dispatchFiles(palette, [createImageFile()]);
    const controls = await waitForReferenceModal(palette);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(controls.widthInput.value).toBe("215.9");
    expect(controls.heightInput.value).toBe("279.4");
    expect(controls.unitSelect.value).toBe("mm");
    expect(controls.preview.hidden).toBe(false);
    expect(controls.previewImage.src).toBe(
      new URL("/uploads/saved-front-bodice.jpg", document.baseURI).href,
    );
    expect(controls.previewImage.alt).toBe("Preview of front-bodice.jpg");

    controls.widthInput.value = "8.5";
    controls.heightInput.value = "11";
    controls.unitSelect.value = "in";
    controls.form.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );

    const [event] = await uploads;
    const control = event.detail.control;
    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0];

    expect(uploadUrl).toBe("../upload.php");
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.getAll("photos[]")).toHaveLength(1);
    expect(uploadOptions.body.getAll("photos[]")[0].name).toBe(
      "front-bodice.jpg",
    );
    const opencvUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(opencvUrl.origin).toBe(
      "https://shrouded-tor-52623-62e8e1beefb8.herokuapp.com",
    );
    expect(opencvUrl.searchParams.get("url")).toBe(
      new URL("/uploads/saved-front-bodice.jpg", document.baseURI).href,
    );
    expect(opencvUrl.searchParams.get("reference_width_mm")).toBe("215.9");
    expect(opencvUrl.searchParams.get("reference_height_mm")).toBe("279.4");
    expect(opencvUrl.searchParams.get("debug_image_urls")).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.info).toHaveBeenCalledWith(
      "UploadablePalette: using the built-in reference dimension modal instead of window.prompt for reference dimensions.",
    );
    expect(controls.modal.hidden).toBe(true);
    expect(controls.preview.hidden).toBe(true);
    expect(controls.previewImage.hasAttribute("src")).toBe(false);
    expect(control.id).toBe("uploaded-front-bodice-0-control");
    expect(control.getAttribute("piece-kind")).toBe("uploaded-front-bodice-0");
    expect(control.getAttribute("label")).toBe("Front Bodice");
    expect(control.querySelector("#front-path")).not.toBeNull();
  });

  test("uses the photo-upload-endpoint attribute for photo conversions", async () => {
    const { palette } = createFixture();
    palette.setAttribute("photo-upload-endpoint", "/custom-upload.php");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "front-bodice.jpg",
              filename: "saved-front-bodice.jpg",
              url: "/uploads/saved-front-bodice.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(svgResponse(SIMPLE_SVG));

    vi.stubGlobal("fetch", fetchMock);

    await uploadFilesWithReference(palette, [createImageFile()]);

    expect(fetchMock.mock.calls[0][0]).toBe("/custom-upload.php");
  });

  test("uses OpenCV endpoint and reference size attributes for photo conversions", async () => {
    const { palette } = createFixture();
    palette.setAttribute("opencv-endpoint", "/custom-opencv");
    palette.setAttribute("reference-width-mm", "100");
    palette.setAttribute("reference-height-mm", "200");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              original_name: "front-bodice.jpg",
              filename: "saved-front-bodice.jpg",
              url: "https://example.com/photo.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(svgResponse(SIMPLE_SVG));

    vi.stubGlobal("fetch", fetchMock);

    const uploads = waitForUploadEvents(palette, 1);
    dispatchFiles(palette, [createImageFile()]);
    const controls = await waitForReferenceModal(palette);

    expect(controls.widthInput.value).toBe("100");
    expect(controls.heightInput.value).toBe("200");
    expect(controls.unitSelect.value).toBe("mm");

    controls.widthInput.value = "10";
    controls.heightInput.value = "20";
    controls.unitSelect.value = "cm";
    controls.form.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );

    await uploads;

    const opencvUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(opencvUrl.pathname).toBe("/custom-opencv");
    expect(opencvUrl.searchParams.get("url")).toBe("https://example.com/photo.jpg");
    expect(opencvUrl.searchParams.get("reference_width_mm")).toBe("100");
    expect(opencvUrl.searchParams.get("reference_height_mm")).toBe("200");
    expect(opencvUrl.searchParams.get("debug_image_urls")).toBe("1");
  });

  test("prefills the reference dimension modal with the last submitted photo dimensions", async () => {
    const { palette } = createFixture();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "first-bodice.jpg",
              filename: "saved-first-bodice.jpg",
              url: "/uploads/saved-first-bodice.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(svgResponse(SIMPLE_SVG))
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "second-bodice.jpg",
              filename: "saved-second-bodice.jpg",
              url: "/uploads/saved-second-bodice.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(svgResponse(SIMPLE_SVG));

    vi.stubGlobal("fetch", fetchMock);

    const firstUploads = waitForUploadEvents(palette, 1);
    dispatchFiles(palette, [
      createImageFile("fake image contents", "first-bodice.jpg"),
    ]);
    let controls = await waitForReferenceModal(palette);

    controls.widthInput.value = "8.5";
    controls.heightInput.value = "11";
    controls.unitSelect.value = "in";
    controls.form.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );

    await firstUploads;

    const secondUploads = waitForUploadEvents(palette, 1);
    dispatchFiles(palette, [
      createImageFile("fake image contents", "second-bodice.jpg"),
    ]);
    controls = await waitForReferenceModal(palette);

    expect(controls.widthInput.value).toBe("8.5");
    expect(controls.heightInput.value).toBe("11");
    expect(controls.unitSelect.value).toBe("in");

    controls.form.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );

    await secondUploads;

    const secondOpencvUrl = new URL(fetchMock.mock.calls[3][0]);
    expect(secondOpencvUrl.searchParams.get("url")).toBe(
      new URL("/uploads/saved-second-bodice.jpg", document.baseURI).href,
    );
    expect(secondOpencvUrl.searchParams.get("reference_width_mm")).toBe("215.9");
    expect(secondOpencvUrl.searchParams.get("reference_height_mm")).toBe("279.4");
  });

  test("retargets existing and uploaded controls when the board attribute changes", async () => {
    const { palette } = createFixture();

    palette.setAttribute("board", "alternate-board");

    const defaultControls = Array.from(
      palette.shadowRoot.querySelectorAll("piece-quantity-control"),
    );

    expect(
      defaultControls.every(
        (control) => control.getAttribute("board") === "alternate-board",
      ),
    ).toBe(true);

    const [event] = await uploadFiles(palette, [createSvgFile()]);

    expect(event.detail.control.getAttribute("board")).toBe("alternate-board");
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

  test("removes text elements from uploaded previews and templates", async () => {
    const { palette } = createFixture();

    const [event] = await uploadFiles(palette, [
      createSvgFile(SPACED_SHAPES_WITH_TEXT_SVG, "spaced-shapes.svg"),
    ]);
    const preview = event.detail.control.querySelector('svg[slot="preview"]');
    const template = event.detail.control.querySelector('template[slot="shape"]');

    expect(preview.querySelector("text")).toBeNull();
    expect(template.content.querySelector("text")).toBeNull();
    expect(template.content.querySelector("#left-outline")).not.toBeNull();
    expect(template.content.querySelector("#right-outline")).not.toBeNull();
  });

  test("keeps separated uploaded shapes under one quantity control", async () => {
    const { palette, board } = createFixture();

    const [event] = await uploadFiles(palette, [
      createSvgFile(SPACED_SHAPES_WITH_TEXT_SVG, "spaced-shapes.svg"),
    ]);
    const control = event.detail.control;
    const template = control.querySelector('template[slot="shape"]');
    const wrappers = Array.from(
      template.content.querySelectorAll('g[role="garment"]'),
    );

    expect(event.detail.controlId).toBe("uploaded-spaced-shapes-0-control");
    expect(event.detail.label).toBe("Spaced Shapes");
    expect(wrappers).toHaveLength(2);
    expect(wrappers.map((wrapper) => wrapper.hasAttribute("transform"))).toEqual([
      false,
      false,
    ]);
    expect(wrappers.map((wrapper) => wrapper.querySelector("path").getAttribute("transform"))).toEqual([
      "translate(-10, -10)",
      "translate(-230, -10) translate(220,0)",
    ]);
    expect(template.content.querySelector("#left-outline")).not.toBeNull();
    expect(template.content.querySelector("#right-outline")).not.toBeNull();
    expect(template.content.querySelector("text")).toBeNull();

    await setQuantity(control, 1);

    const pieces = Array.from(
      board.querySelectorAll(
        '[data-owner-control="uploaded-spaced-shapes-0-control"]',
      ),
    );

    expect(pieces).toHaveLength(2);
    expect(pieces.map((piece) => piece.getAttribute("transform"))).toEqual([
      "translate(80, 80)",
      "translate(200, 80)",
    ]);
    expect(pieces.map((piece) => piece.querySelector("path").getAttribute("transform"))).toEqual([
      "translate(-10, -10)",
      "translate(-230, -10) translate(220,0)",
    ]);
    expect(pieces[0].querySelector("#left-outline")).not.toBeNull();
    expect(pieces[0].querySelector("#right-outline")).toBeNull();
    expect(pieces[1].querySelector("#right-outline")).not.toBeNull();
    expect(pieces[1].querySelector("#left-outline")).toBeNull();
    expect(pieces.every((piece) => piece.querySelector("text") === null)).toBe(
      true,
    );
  });

  test("supports namespaced uploaded controls in the two-palette demo", async () => {
    const container = document.createElement("div");

    container.innerHTML = `
      <svg id="board" xmlns="${SVG_NS}"></svg>
      <uploadable-palette id="palette-a" board="board"></uploadable-palette>
      <uploadable-palette id="palette-b" board="board"></uploadable-palette>
    `;

    document.body.appendChild(container);

    const board = container.querySelector("#board");
    const palette = container.querySelector("#palette-a");

    const namespaceControl = (control, prefix) => {
      if (control.dataset.namespacedBy === prefix) return;

      const currentId = control.id || control.getAttribute("piece-kind") || "piece";
      const currentKind = control.getAttribute("piece-kind") || currentId;

      control.id = `${prefix}-${currentId}`;
      control.setAttribute("piece-kind", `${prefix}-${currentKind}`);
      control.dataset.namespacedBy = prefix;
    };

    const addUploadedControlToBoard = (control) => {
      const quantity = Math.max(control.value, 1);
      control.qtyInput.value = String(quantity);
      control.qtyInput.dispatchEvent(
        new Event("input", {
          bubbles: true,
          composed: true,
        }),
      );
    };

    palette.addEventListener("svg-uploaded", (event) => {
      namespaceControl(event.detail.control, "palette-a");
      addUploadedControlToBoard(event.detail.control);
    });

    const [event] = await uploadFiles(palette, [
      createSvgFile(SPACED_SHAPES_WITH_TEXT_SVG, "spaced-shapes.svg"),
    ]);
    const control = event.detail.control;

    expect(control.id).toBe("palette-a-uploaded-spaced-shapes-0-control");
    expect(control.getAttribute("piece-kind")).toBe(
      "palette-a-uploaded-spaced-shapes-0",
    );
    expect(control.value).toBe(1);

    const pieces = Array.from(
      board.querySelectorAll(
        '[data-owner-control="palette-a-uploaded-spaced-shapes-0-control"]',
      ),
    );

    expect(pieces).toHaveLength(2);
    expect(
      pieces.every(
        (piece) =>
          piece.getAttribute("data-piece-kind") ===
          "palette-a-uploaded-spaced-shapes-0",
      ),
    ).toBe(true);
  });

  test("anchors uploaded SVGs by their visible bounds before adding them to the board", async () => {
    const { palette, board } = createFixture();

    const [event] = await uploadFiles(palette, [
      createSvgFile(OFFSET_LAYER_SVG, "offset-layer.svg"),
    ]);
    const control = event.detail.control;
    const template = control.querySelector('template[slot="shape"]');
    const wrapper = template.content.querySelector('g[role="garment"]');

    expect(wrapper.hasAttribute("transform")).toBe(false);
    expect(wrapper.querySelector("#exported-layer")).toBeNull();
    expect(wrapper.querySelector("#offset-path").getAttribute("transform")).toBe(
      "translate(-840, -760) translate(820,730)",
    );

    await setQuantity(control, 1);

    const piece = board.querySelector(
      '[data-owner-control="uploaded-offset-layer-0-control"]',
    );

    expect(piece).not.toBeNull();
    expect(piece.getAttribute("transform")).toBe("translate(80, 80)");
    expect(piece.querySelector("#offset-path").getAttribute("transform")).toBe(
      "translate(-840, -760) translate(820,730)",
    );
    expect(piece.querySelector("#offset-path")).not.toBeNull();
  });

  test("unwraps Inkscape layer groups inside uploaded draggable wrappers", async () => {
    const { palette, board } = createFixture();

    const [event] = await uploadFiles(palette, [
      createSvgFile(INKSCAPE_LAYER_SVG, "inkscape-layer.svg"),
    ]);
    const control = event.detail.control;
    const template = control.querySelector('template[slot="shape"]');
    const wrapper = template.content.querySelector('g[role="garment"]');
    const templatePath = wrapper.querySelector("#inkscape-path");

    expect(wrapper.getAttribute("data-draggable")).toBe("true");
    expect(wrapper.hasAttribute("transform")).toBe(false);
    expect(wrapper.querySelector("#layer1")).toBeNull();
    expect(templatePath).not.toBeNull();
    expect(templatePath.getAttribute("transform")).toBe(
      "translate(-310, -410) translate(300,400)",
    );

    await setQuantity(control, 1);

    const piece = board.querySelector(
      '[data-owner-control="uploaded-inkscape-layer-0-control"]',
    );

    expect(piece).not.toBeNull();
    expect(piece.getAttribute("transform")).toBe("translate(80, 80)");
    expect(piece.querySelector("#layer1")).toBeNull();
    expect(piece.querySelector("#inkscape-path").getAttribute("transform")).toBe(
      "translate(-310, -410) translate(300,400)",
    );
  });

  test("normalizes DXF SVG export scale metadata before adding pieces to the board", async () => {
    const { palette, board } = createFixture();

    const [event] = await uploadFiles(palette, [
      createSvgFile(DXF_SCALED_SVG, "scaled-dxf.svg"),
    ]);
    const control = event.detail.control;
    const template = control.querySelector('template[slot="shape"]');
    const wrapper = template.content.querySelector('g[role="garment"]');

    expect(wrapper.hasAttribute("transform")).toBe(false);
    expect(wrapper.querySelector("#scaled-path").getAttribute("transform")).toBe(
      "matrix(0.0394 0 0 0.0394 0 0)",
    );

    await setQuantity(control, 1);

    const piece = board.querySelector(
      '[data-owner-control="uploaded-scaled-dxf-0-control"]',
    );

    expect(piece).not.toBeNull();
    expect(piece.getAttribute("transform")).toBe("translate(80, 80)");
    expect(piece.querySelector("#scaled-path").getAttribute("transform")).toBe(
      "matrix(0.0394 0 0 0.0394 0 0)",
    );
    expect(piece.querySelector("#scaled-path")).not.toBeNull();
  });

  test("defaults uploaded board geometry to one pixel per millimeter", async () => {
    const { palette } = createFixture();

    const [event] = await uploadFiles(palette, [
      createSvgFile(DXF_SCALED_SVG, "scaled-dxf.svg"),
    ]);
    const template = event.detail.control.querySelector('template[slot="shape"]');
    const path = template.content.querySelector("#scaled-path");

    expect(palette.boardPixelsPerMm).toBe(1);
    expect(path.getAttribute("transform")).toBe(
      "matrix(0.0394 0 0 0.0394 0 0)",
    );
  });

  test("uses DXF pixels-per-millimeter metadata before the SVG fallback", async () => {
    const { palette } = createFixture();

    palette.uploadedSvgPixelsPerMm = 2;

    const [event] = await uploadFiles(palette, [
      createSvgFile(DXF_SCALED_SVG, "scaled-dxf.svg"),
    ]);
    const template = event.detail.control.querySelector('template[slot="shape"]');
    const path = template.content.querySelector("#scaled-path");

    expect(path.getAttribute("transform")).toBe(
      "matrix(0.0394 0 0 0.0394 0 0)",
    );
  });

  test("customizes uploaded SVG source and board pixels per millimeter", async () => {
    const { palette } = createFixture();

    palette.uploadedSvgPixelsPerMm = 2;
    palette.boardPixelsPerMm = 4;

    const [event] = await uploadFiles(palette, [createSvgFile()]);
    const template = event.detail.control.querySelector('template[slot="shape"]');
    const path = template.content.querySelector("#front-path");

    expect(palette.getAttribute("uploaded-svg-pixels-per-mm")).toBe("2");
    expect(palette.getAttribute("board-pixels-per-mm")).toBe("4");
    expect(path.getAttribute("transform")).toBe("matrix(2 0 0 2 -10 -10)");
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

  test("skips existing generated IDs when creating uploaded controls", () => {
    const { palette } = createFixture();
    const blocker = document.createElement("div");
    blocker.id = "uploaded-front-bodice-0-control";
    palette.shadowRoot.appendChild(blocker);

    const control = palette.addSvgControl(SIMPLE_SVG, "front-bodice.svg");

    expect(control.id).toBe("uploaded-front-bodice-1-control");
  });

  test("falls back to a generic label and slug for blank SVG filenames", () => {
    const { palette } = createFixture();

    const control = palette.addSvgControl(SIMPLE_SVG, ".svg");

    expect(control.getAttribute("label")).toBe("Uploaded SVG");
    expect(control.id).toBe("uploaded-uploaded-svg-0-0-control");
  });

  test("derives preview and template viewBox values from SVG width and height", () => {
    const { palette } = createFixture();

    const control = palette.addSvgControl(
      SIZED_SVG_WITHOUT_VIEWBOX,
      "sized-piece.svg",
    );

    const preview = control.querySelector('svg[slot="preview"]');
    const templateSvg = control.querySelector("template").content.querySelector("svg");

    expect(preview.getAttribute("viewBox")).toBe("0 0 72 36");
    expect(templateSvg.getAttribute("viewBox")).toBe("0 0 72 36");
  });

  test("uses a default viewBox when uploaded SVG dimensions are missing", () => {
    const { palette } = createFixture();

    const control = palette.addSvgControl(
      SIZELESS_SVG_WITHOUT_VIEWBOX,
      "sizeless-piece.svg",
    );

    const preview = control.querySelector('svg[slot="preview"]');
    const templateSvg = control.querySelector("template").content.querySelector("svg");

    expect(preview.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(templateSvg.getAttribute("viewBox")).toBe("0 0 100 100");
  });

  test("removes active SVG content from uploaded previews and templates", () => {
    const { palette } = createFixture();
    const unsafeSvg = `
      <svg xmlns="${SVG_NS}" viewBox="0 0 20 20" onclick="alert('root')">
        <script>alert("bad")</script>
        <foreignObject><div>html</div></foreignObject>
        <path id="safe-path" onclick="alert('path')" d="M0 0 L20 20"></path>
      </svg>
    `;

    const control = palette.addSvgControl(unsafeSvg, "unsafe-piece.svg");
    const preview = control.querySelector('svg[slot="preview"]');
    const templateSvg = control.querySelector("template").content.querySelector("svg");

    expect(preview.querySelector("script")).toBeNull();
    expect(preview.querySelector("foreignObject")).toBeNull();
    expect(preview.hasAttribute("onclick")).toBe(false);
    expect(preview.querySelector("#safe-path").hasAttribute("onclick")).toBe(false);
    expect(templateSvg.querySelector("script")).toBeNull();
    expect(templateSvg.querySelector("foreignObject")).toBeNull();
    expect(templateSvg.querySelector("#safe-path").hasAttribute("onclick")).toBe(
      false,
    );
  });

  test("does nothing when the file input has no selected files", async () => {
    const { palette } = createFixture();
    const addSvgControl = vi.spyOn(palette, "addSvgControl");
    let uploaded = false;

    palette.addEventListener("svg-uploaded", () => {
      uploaded = true;
    });

    dispatchFiles(palette, []);
    await nextFrame();

    expect(addSvgControl).not.toHaveBeenCalled();
    expect(uploaded).toBe(false);
    expect(palette.statusEl.textContent).toBe("");
  });

  test("reports invalid SVG uploads without adding a control", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");
    const initialControls = palette.shadowRoot.querySelectorAll(
      "piece-quantity-control",
    ).length;

    const input = dispatchFiles(palette, [
      createSvgFile("<not-svg></not-svg>", "bad.svg"),
    ]);
    const event = await errorEvent;

    expect(event.detail.failures).toHaveLength(1);
    expect(event.detail.failures[0].file.name).toBe("bad.svg");
    expect(palette.statusEl.textContent).toBe("1 SVG could not be uploaded.");
    expect(palette.statusEl.classList.contains("error")).toBe(true);
    expect(input.value).toBe("");
    expect(
      palette.shadowRoot.querySelectorAll("piece-quantity-control"),
    ).toHaveLength(initialControls);
  });

  test("reports photo upload conversion failures without adding a control", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");
    const initialControls = palette.shadowRoot.querySelectorAll(
      "piece-quantity-control",
    ).length;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: "Unsupported image format.",
          },
          {
            status: 400,
          },
        ),
      ),
    );

    dispatchFiles(palette, [createImageFile()]);
    const event = await errorEvent;

    expect(event.detail.failures).toHaveLength(1);
    expect(event.detail.failures[0].file.name).toBe("front-bodice.jpg");
    expect(event.detail.failures[0].error.message).toBe(
      "Unsupported image format.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
    expect(palette.statusEl.classList.contains("error")).toBe(true);
    expect(
      palette.shadowRoot.querySelectorAll("piece-quantity-control"),
    ).toHaveLength(initialControls);
  });

  test("reports malformed photo upload responses without adding a control", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not json", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
          },
        }),
      ),
    );

    dispatchFiles(palette, [createImageFile()]);
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe("Upload failed.");
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
  });

  test("reports explicit photo upload file failures", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          files: [
            {
              status: "error",
              original_name: "front-bodice.jpg",
              message: "Too large.",
            },
          ],
        }),
      ),
    );

    dispatchFiles(palette, [createImageFile()]);
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "Error uploading front-bodice.jpg: Too large.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
  });

  test("reports photo upload responses without file URLs", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "front-bodice.jpg",
            },
          ],
        }),
      ),
    );

    dispatchFiles(palette, [createImageFile()]);
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "Upload response did not include a file URL.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
  });

  test("accepts JSON-wrapped OpenCV SVG responses", async () => {
    const { palette } = createFixture();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "front-bodice.jpg",
              filename: "saved-front-bodice.jpg",
              url: "/uploads/saved-front-bodice.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          svg: [SIMPLE_SVG],
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const [event] = await uploadFilesWithReference(palette, [createImageFile()]);

    expect(event.detail.control.querySelector("#front-path")).not.toBeNull();
  });

  test("attaches OpenCV debug images to uploaded photo controls", async () => {
    const { palette } = createFixture();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "front-bodice.jpg",
              filename: "saved-front-bodice.jpg",
              url: "/uploads/saved-front-bodice.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          svg: [SIMPLE_SVG, 60, 40],
          debug_image_urls: DEBUG_IMAGE_URLS,
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const [event] = await uploadFilesWithReference(palette, [createImageFile()]);
    const control = event.detail.control;

    control.debugButton.click();

    const images = Array.from(
      control.shadowRoot.querySelectorAll(".debug-figure img"),
    );

    expect(event.detail.debugImages).toEqual([
      {
        name: "imgContours_page",
        filename: "0_imgContours_page.png",
        mimeType: "image/png",
        url: "https://example.com/debug-images/session/0_imgContours_page.png",
      },
      {
        name: "imgWarp",
        filename: "3_imgWarp.png",
        mimeType: "image/png",
        url: "https://example.com/debug-images/session/3_imgWarp.png",
      },
    ]);
    expect(control.debugButton.hidden).toBe(false);
    expect(control.debugButton.textContent).toBe("CV Debug (2)");
    expect(control.debugModalEl.hidden).toBe(false);
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.alt)).toEqual([
      "imgContours_page",
      "imgWarp",
    ]);
    expect(images[0].src).toBe(DEBUG_IMAGE_URLS[0].url);
  });

  test("reports OpenCV conversion failures without adding a control", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");
    const debugControls = failureDebugControls(palette);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            files: [
              {
                status: "success",
                original_name: "front-bodice.jpg",
                filename: "saved-front-bodice.jpg",
                url: "/uploads/saved-front-bodice.jpg",
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: "No contour could be detected.",
            },
            {
              status: 422,
            },
          ),
        ),
    );

    dispatchFiles(palette, [createImageFile()]);
    await submitReferenceDimensions(palette);
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "No contour could be detected.",
    );
    expect(event.detail.debugImages).toEqual([]);
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
    expect(debugControls.button.hidden).toBe(true);
  });

  test("shows OpenCV debug images for conversion failures when available", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");
    const initialControls = palette.shadowRoot.querySelectorAll(
      "piece-quantity-control",
    ).length;

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            files: [
              {
                status: "success",
                original_name: "front-bodice.jpg",
                filename: "saved-front-bodice.jpg",
                url: "/uploads/saved-front-bodice.jpg",
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: "No contour could be detected.",
              debug_image_urls: DEBUG_IMAGE_URLS,
            },
            {
              status: 422,
            },
          ),
        ),
    );

    dispatchFiles(palette, [createImageFile()]);
    await submitReferenceDimensions(palette);
    const event = await errorEvent;
    const debugControls = failureDebugControls(palette);

    expect(event.detail.failures[0].error.message).toBe(
      "No contour could be detected.",
    );
    expect(event.detail.debugImages).toEqual([
      {
        name: "imgContours_page",
        filename: "0_imgContours_page.png",
        mimeType: "image/png",
        url: "https://example.com/debug-images/session/0_imgContours_page.png",
      },
      {
        name: "imgWarp",
        filename: "3_imgWarp.png",
        mimeType: "image/png",
        url: "https://example.com/debug-images/session/3_imgWarp.png",
      },
    ]);
    expect(event.detail.failures[0].error.debugImages).toEqual(
      event.detail.debugImages,
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
    expect(debugControls.button.hidden).toBe(false);
    expect(debugControls.button.textContent).toBe("Show Debug Images (2)");
    expect(
      palette.shadowRoot.querySelectorAll("piece-quantity-control"),
    ).toHaveLength(initialControls);

    debugControls.button.click();

    const images = debugControls.images();

    expect(debugControls.modal.hidden).toBe(false);
    expect(debugControls.button.getAttribute("aria-expanded")).toBe("true");
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.alt)).toEqual([
      "imgContours_page",
      "imgWarp",
    ]);
    expect(images[0].src).toBe(DEBUG_IMAGE_URLS[0].url);

    debugControls.closeButton.click();

    expect(debugControls.modal.hidden).toBe(true);
    expect(debugControls.button.getAttribute("aria-expanded")).toBe("false");
  });

  test("reports empty OpenCV SVG responses without adding a control", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            files: [
              {
                status: "success",
                original_name: "front-bodice.jpg",
                filename: "saved-front-bodice.jpg",
                url: "/uploads/saved-front-bodice.jpg",
              },
            ],
          }),
        )
        .mockResolvedValueOnce(svgResponse("")),
    );

    dispatchFiles(palette, [createImageFile()]);
    await submitReferenceDimensions(palette);
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "OpenCV response did not include an SVG.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
  });

  test("keeps debug images from empty OpenCV SVG responses", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            files: [
              {
                status: "success",
                original_name: "front-bodice.jpg",
                filename: "saved-front-bodice.jpg",
                url: "/uploads/saved-front-bodice.jpg",
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            svg: "",
            debug_image_urls: {
              imgThreshold: "/debug-images/session/1_imgThreshold.png",
            },
          }),
        ),
    );

    dispatchFiles(palette, [createImageFile()]);
    await submitReferenceDimensions(palette);
    const event = await errorEvent;
    const debugControls = failureDebugControls(palette);

    expect(event.detail.failures[0].error.message).toBe(
      "OpenCV response did not include an SVG.",
    );
    expect(event.detail.debugImages).toEqual([
      {
        name: "imgThreshold",
        filename: "1_imgThreshold.png",
        mimeType: "",
        url: new URL(
          "/debug-images/session/1_imgThreshold.png",
          document.baseURI,
        ).href,
      },
    ]);
    expect(debugControls.button.hidden).toBe(false);
    expect(debugControls.button.textContent).toBe("Show Debug Image");
  });

  test("uses the fallback message for non-JSON OpenCV failures", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            files: [
              {
                status: "success",
                original_name: "front-bodice.jpg",
                filename: "saved-front-bodice.jpg",
                url: "/uploads/saved-front-bodice.jpg",
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          new Response("Server unavailable", {
            status: 503,
            headers: {
              "Content-Type": "text/plain",
            },
          }),
        ),
    );

    dispatchFiles(palette, [createImageFile()]);
    await submitReferenceDimensions(palette);
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "OpenCV conversion failed.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
  });

  test("reports cancelled reference dimension prompts without calling OpenCV", async () => {
    const { palette } = createFixture();
    const errorEvent = waitForEvent(palette, "svg-upload-error");

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        files: [
          {
            status: "success",
            original_name: "front-bodice.jpg",
            filename: "saved-front-bodice.jpg",
            url: "/uploads/saved-front-bodice.jpg",
          },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    dispatchFiles(palette, [createImageFile()]);
    const controls = await cancelReferenceDimensions(palette);
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "Reference dimensions are required.",
    );
    expect(controls.modal.hidden).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
  });

  test("keeps the reference dimension modal open after invalid input", async () => {
    const { palette } = createFixture();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              status: "success",
              original_name: "front-bodice.jpg",
              filename: "saved-front-bodice.jpg",
              url: "/uploads/saved-front-bodice.jpg",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(svgResponse(SIMPLE_SVG));

    vi.stubGlobal("fetch", fetchMock);

    const uploads = waitForUploadEvents(palette, 1);
    dispatchFiles(palette, [createImageFile()]);
    const controls = await submitReferenceDimensions(palette, {
      width: "wide",
      height: "11",
      unit: "in",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(controls.modal.hidden).toBe(false);
    expect(controls.error.hidden).toBe(false);
    expect(controls.error.textContent).toBe(
      "Reference width must be a positive number in mm, cm, or in.",
    );

    controls.widthInput.value = "8.5";
    controls.form.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );

    const [event] = await uploads;

    expect(event.detail.control.querySelector("#front-path")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(controls.modal.hidden).toBe(true);
  });

  test("throws for malformed SVG documents", () => {
    const { palette } = createFixture();

    expect(() => palette._parseSvg("<svg><path></svg>")).toThrow(
      "Uploaded file must contain a valid SVG root.",
    );
  });

  test("can read uploaded text through the FileReader fallback", async () => {
    const { palette } = createFixture();
    const blob = new Blob([SIMPLE_SVG], {
      type: "image/svg+xml",
    });

    Object.defineProperty(blob, "text", {
      value: undefined,
    });

    await expect(palette._readFileText(blob)).resolves.toBe(SIMPLE_SVG);
  });

  test("rejects when the FileReader fallback fails", async () => {
    const { palette } = createFixture();
    const OriginalFileReader = window.FileReader;
    const readError = new Error("reader failed");

    class FailingFileReader extends EventTarget {
      constructor() {
        super();
        this.error = readError;
      }

      readAsText() {
        this.dispatchEvent(new Event("error"));
      }
    }

    window.FileReader = FailingFileReader;

    try {
      await expect(palette._readFileText({})).rejects.toBe(readError);
    } finally {
      window.FileReader = OriginalFileReader;
    }
  });

  test("removes the upload listener when disconnected", async () => {
    const { palette } = createFixture();
    const input = palette.fileInput;
    const addSvgControl = vi.spyOn(palette, "addSvgControl");

    palette.remove();

    Object.defineProperty(input, "files", {
      value: [createSvgFile()],
      configurable: true,
    });

    input.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );

    await nextFrame();

    expect(addSvgControl).not.toHaveBeenCalled();
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
