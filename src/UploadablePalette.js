import "./PieceQuantityControl.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_MIME_TYPE = "image/svg+xml";
const DEFAULT_PHOTO_UPLOAD_ENDPOINT = "../upload.php";

const DEFAULT_CONTROLS = `
  <piece-quantity-control
    id="triangle-control"
    board="board"
    piece-kind="triangle"
    label="Triangle"
    value="0"
  >
    <svg slot="preview" viewBox="0 0 100 100" width="40" height="40">
      <polygon points="50,18 82,78 18,78" fill="none" data-draggable="true" role="garment"></polygon>
    </svg>

    <template slot="shape">
      <svg viewBox="0 0 20 20" xmlns="${SVG_NS}">
        <g data-draggable="true">
          <polygon
            points="0,0 10,20 -10,20"
            fill="transparent"
            stroke="red"
            data-draggable="true"
            data-role="garment"
            role="garment">
          </polygon>
        </g>
      </svg>
    </template>
  </piece-quantity-control>

  <piece-quantity-control
    id="rect-control"
    board="board"
    piece-kind="rectangle"
    label="Rectangle"
    value="0"
  >
    <svg slot="preview" viewBox="0 0 100 100" width="40" height="40">
      <rect x="20" y="20" width="60" height="60" fill="transparent"></rect>
    </svg>

    <template slot="shape">
      <svg viewBox="0 0 100 100" xmlns="${SVG_NS}">
        <g>
          <rect data-draggable="true" role="garment" x="0" y="0" width="90" height="60" fill="transparent"></rect>
        </g>
      </svg>
    </template>
  </piece-quantity-control>

  <piece-quantity-control
    id="sleeve-control"
    board="board"
    piece-kind="sleeve-front"
    label="Sleeve Front"
    value="0"
  >
    <svg slot="preview" viewBox="0 0 100 100" width="40" height="40">
      <path d="M20 35 Q35 15 60 22 L75 70 Q45 85 20 60 Z" fill="none"></path>
    </svg>

    <template slot="shape">
      <svg viewBox="0 0 100 100" xmlns="${SVG_NS}">
        <g data-draggable="true">
          <polygon
            points="128.00,0.00 7.00,172.00 0.00,199.00 123.00,286.50 152.50,263.00"
            data-draggable="true"
            role="garment"
            fill="transparent"
            stroke-width="3">
          </polygon>
        </g>
      </svg>
    </template>
  </piece-quantity-control>
`;

export class UploadablePalette extends HTMLElement {
  static get observedAttributes() {
    return ["board"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uploadCounter = 0;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: sans-serif;
        }

        .palette {
          display: grid;
          gap: 12px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        h1 {
          font-size: 1.25rem;
          line-height: 1.2;
          margin: 0;
        }

        .upload-form {
          margin: 0;
        }

        .upload-button {
          display: inline-block;
          padding: 0.6em 1em;
          background: #0078d4;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          user-select: none;
          font-size: 0.9rem;
          line-height: 1;
        }

        .upload-button:hover {
          background: #005ea6;
        }

        .controls {
          display: grid;
          gap: 12px;
        }

        .status {
          min-height: 1.2em;
          margin: 0;
          font-size: 0.85rem;
        }

        .status:empty {
          display: none;
        }

        .error {
          color: #b00020;
        }
      </style>

      <section class="palette">
        <div class="header">
          <h1>Patterns</h1>
          <form class="upload-form">
            <input type="file" id="svgPieceUpload" accept=".svg,image/svg+xml,image/*" multiple hidden>
            <label class="upload-button" for="svgPieceUpload">Add / Upload</label>
          </form>
        </div>
        <p class="status" role="status" aria-live="polite"></p>
        <div class="controls">${DEFAULT_CONTROLS}</div>
      </section>
    `;
  }

  connectedCallback() {
    this._syncBoardAttributes();
    this.fileInput.addEventListener("change", this._onFileInputChange);
  }

  disconnectedCallback() {
    this.fileInput.removeEventListener("change", this._onFileInputChange);
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this._syncBoardAttributes();
    }
  }

  get boardId() {
    return this.getAttribute("board") || "board";
  }

  get controlsEl() {
    return this.shadowRoot.querySelector(".controls");
  }

  get fileInput() {
    return this.shadowRoot.querySelector("#svgPieceUpload");
  }

  get statusEl() {
    return this.shadowRoot.querySelector(".status");
  }

  get photoUploadEndpoint() {
    return this.getAttribute("photo-upload-endpoint") || DEFAULT_PHOTO_UPLOAD_ENDPOINT;
  }

  _onFileInputChange = async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    const fileLabel = this._statusFileLabel(files);
    this._setStatus(`Uploading ${files.length} ${fileLabel}${files.length === 1 ? "" : "s"}...`);

    const failures = [];

    for (const file of files) {
      try {
        const svgText = await this._getSvgTextForFile(file);
        this.addSvgControl(svgText, file.name);
      } catch (error) {
        failures.push({ file, error });
      }
    }

    input.value = "";

    if (failures.length > 0) {
      this._setStatus(
        `${failures.length} ${fileLabel}${failures.length === 1 ? "" : "s"} could not be uploaded.`,
        true,
      );
      this.dispatchEvent(
        new CustomEvent("svg-upload-error", {
          detail: { failures },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }

    this._setStatus("");
  };

  addSvgControl(svgText, fileName = "uploaded.svg") {
    const uploadedSvg = this._parseSvg(svgText);
    const baseName = this._basename(fileName);
    const label = this._humanizeName(baseName);
    const pieceKind = this._uniquePieceKind(baseName);
    const controlId = `${pieceKind}-control`;

    const control = document.createElement("piece-quantity-control");
    control.id = controlId;
    control.setAttribute("board", this.boardId);
    control.setAttribute("piece-kind", pieceKind);
    control.setAttribute("label", label);
    control.setAttribute("value", "0");

    control.appendChild(this._createPreviewSvg(uploadedSvg));
    control.appendChild(this._createShapeTemplate(uploadedSvg));
    this.controlsEl.appendChild(control);

    this.dispatchEvent(
      new CustomEvent("svg-uploaded", {
        detail: {
          control,
          controlId,
          pieceKind,
          label,
          fileName,
        },
        bubbles: true,
        composed: true,
      }),
    );

    return control;
  }

  async _getSvgTextForFile(file) {
    if (this._isSvgFile(file)) {
      return this._readFileText(file);
    }

    return this._convertPhotoToContourSvg(file);
  }

  _readFileText(file) {
    if (typeof file.text === "function") {
      return file.text();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(file);
    });
  }

  async _convertPhotoToContourSvg(file) {
    const formData = new FormData();
    formData.append("photos[]", file);

    const uploadResult = await this._fetchJson(
      this.photoUploadEndpoint,
      {
        method: "POST",
        body: formData,
      },
      "Upload failed.",
    );

    if (!uploadResult.files || uploadResult.files.length === 0) {
      throw new Error("No files were returned.");
    }

    const uploadedFile = uploadResult.files[0];

    if (uploadedFile.status !== "success") {
      const originalName = uploadedFile.original_name || file.name || "file";
      throw new Error(
        `Error uploading ${originalName}: ${uploadedFile.message || "Upload failed."}`,
      );
    }

    if (!uploadedFile.measure_url) {
      throw new Error("Upload response did not include a measure URL.");
    }

    const measureResult = await this._fetchJson(
      uploadedFile.measure_url,
      undefined,
      "Measure request failed.",
    );

    const svgText = Array.isArray(measureResult.svg)
      ? measureResult.svg[0]
      : measureResult.svg;

    if (typeof svgText !== "string" || svgText.trim() === "") {
      throw new Error("Measure response did not include an SVG.");
    }

    return svgText;
  }

  async _fetchJson(url, options, fallbackMessage) {
    const response = await fetch(url, options);
    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      throw new Error(fallbackMessage);
    }

    if (!response.ok) {
      throw new Error(result?.error || fallbackMessage);
    }

    return result;
  }

  _isSvgFile(file) {
    return file.type === SVG_MIME_TYPE || /\.svg$/i.test(file.name || "");
  }

  _parseSvg(svgText) {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const parserError = doc.querySelector("parsererror");

    if (parserError || doc.documentElement?.localName !== "svg") {
      throw new Error("Uploaded file must contain a valid SVG root.");
    }

    const svg = document.importNode(doc.documentElement, true);
    this._stripActiveSvgContent(svg);
    svg.setAttribute("xmlns", SVG_NS);

    return svg;
  }

  _stripActiveSvgContent(svg) {
    svg.querySelectorAll("script, foreignObject").forEach((node) => node.remove());

    const allElements = [svg, ...Array.from(svg.querySelectorAll("*"))];
    for (const element of allElements) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.toLowerCase().startsWith("on")) {
          element.removeAttribute(attribute.name);
        }
      }
    }
  }

  _createPreviewSvg(uploadedSvg) {
    const previewSvg = uploadedSvg.cloneNode(true);
    previewSvg.setAttribute("slot", "preview");

    if (!previewSvg.hasAttribute("viewBox")) {
      previewSvg.setAttribute("viewBox", this._viewBoxFromSize(previewSvg));
    }

    previewSvg.setAttribute("width", "48");
    previewSvg.setAttribute("height", "48");
    previewSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    previewSvg.setAttribute("aria-hidden", "true");
    previewSvg.removeAttribute("id");

    return previewSvg;
  }

  _createShapeTemplate(uploadedSvg) {
    const template = document.createElement("template");
    template.setAttribute("slot", "shape");

    const shapeSvg = uploadedSvg.cloneNode(true);
    shapeSvg.removeAttribute("id");

    if (!shapeSvg.hasAttribute("viewBox")) {
      shapeSvg.setAttribute("viewBox", this._viewBoxFromSize(shapeSvg));
    }

    const wrapper = document.createElementNS(SVG_NS, "g");
    wrapper.setAttribute("data-draggable", "true");
    wrapper.setAttribute("role", "garment");
    wrapper.setAttribute("pointer-events", "all");

    while (shapeSvg.firstChild) {
      wrapper.appendChild(shapeSvg.firstChild);
    }

    shapeSvg.appendChild(wrapper);
    template.content.appendChild(shapeSvg);

    return template;
  }

  _viewBoxFromSize(svg) {
    const width = Number.parseFloat(svg.getAttribute("width")) || 100;
    const height = Number.parseFloat(svg.getAttribute("height")) || 100;
    return `0 0 ${width} ${height}`;
  }

  _basename(fileName) {
    return String(fileName)
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      .replace(/\.[^.]+$/i, "");
  }

  _humanizeName(name) {
    return (
      name
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()) || "Uploaded SVG"
    );
  }

  _uniquePieceKind(baseName) {
    const slugBase =
      this._slugify(baseName) || `uploaded-svg-${this._uploadCounter}`;
    let pieceKind;

    do {
      pieceKind = `uploaded-${slugBase}-${this._uploadCounter}`;
      this._uploadCounter += 1;
    } while (this.shadowRoot.getElementById(`${pieceKind}-control`));

    return pieceKind;
  }

  _slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/\.[^.]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  _syncBoardAttributes() {
    this.shadowRoot
      .querySelectorAll("piece-quantity-control")
      .forEach((control) => control.setAttribute("board", this.boardId));
  }

  _setStatus(message, isError = false) {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("error", isError);
  }

  _statusFileLabel(files) {
    return files.every((file) => this._isSvgFile(file)) ? "SVG" : "file";
  }
}

if (!customElements.get("uploadable-palette")) {
  customElements.define("uploadable-palette", UploadablePalette);
}
