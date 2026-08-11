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

    expect(input).not.toBeNull();
    expect(input.accept).toContain(".svg");
    expect(input.accept).toContain("image/*");
    expect(input.multiple).toBe(true);
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

    const [event] = await uploadFiles(palette, [createImageFile()]);
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

    await uploadFiles(palette, [createImageFile()]);

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

    await uploadFiles(palette, [createImageFile()]);

    const opencvUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(opencvUrl.pathname).toBe("/custom-opencv");
    expect(opencvUrl.searchParams.get("url")).toBe("https://example.com/photo.jpg");
    expect(opencvUrl.searchParams.get("reference_width_mm")).toBe("100");
    expect(opencvUrl.searchParams.get("reference_height_mm")).toBe("200");
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

    const [event] = await uploadFiles(palette, [createImageFile()]);

    expect(event.detail.control.querySelector("#front-path")).not.toBeNull();
  });

  test("reports OpenCV conversion failures without adding a control", async () => {
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
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "No contour could be detected.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
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
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "OpenCV response did not include an SVG.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
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
    const event = await errorEvent;

    expect(event.detail.failures[0].error.message).toBe(
      "OpenCV conversion failed.",
    );
    expect(palette.statusEl.textContent).toBe("1 file could not be uploaded.");
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
