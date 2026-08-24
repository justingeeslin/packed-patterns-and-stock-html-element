import "./PieceQuantityControl.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_MIME_TYPE = "image/svg+xml";
const DEFAULT_PHOTO_UPLOAD_ENDPOINT = "../upload.php";
const DEFAULT_OPENCV_ENDPOINT =
  "https://shrouded-tor-52623-62e8e1beefb8.herokuapp.com";
const DEFAULT_REFERENCE_WIDTH_MM = 215.9;
const DEFAULT_REFERENCE_HEIGHT_MM = 279.4;
export const DEFAULT_BOARD_PIXELS_PER_MM = 1;
export const DEFAULT_UPLOADED_SVG_PIXELS_PER_MM = 1;
const SVG_NUMBER_PATTERN = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?";
const SVG_DXF_DESCRIPTION_PATTERN = /\.dxf\b/i;
const SVG_DXF_SCALE_PATTERN = new RegExp(
  `\\bscale\\s*=\\s*(${SVG_NUMBER_PATTERN})`,
  "i",
);
const SVG_GRAPHIC_TAGS = [
  "circle",
  "ellipse",
  "image",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "use",
];
const SVG_GRAPHIC_SELECTOR = SVG_GRAPHIC_TAGS.join(",");
const SVG_BOUNDARY_IGNORE_SELECTOR =
  "clipPath,defs,filter,linearGradient,marker,mask,metadata,pattern,radialGradient,symbol";
const SVG_TRANSFORMABLE_TAGS = new Set([
  ...SVG_GRAPHIC_TAGS,
  "a",
  "g",
  "switch",
]);
const SVG_UNWRAPPABLE_GROUP_ATTRIBUTES = new Set([
  "id",
  "transform",
]);
const SVG_UNWRAPPABLE_GROUP_ATTRIBUTE_PREFIXES = [
  "inkscape:",
  "sodipodi:",
];

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
    this._referenceDialogRequest = null;
    this._lastReferenceDimensionInputs = null;
    this._failureDebugImages = [];
    this._lastFocusedElement = null;
    this._lastFailureDebugFocusedElement = null;
    this._promptAvailabilityLogged = false;

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

        .status-row {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          min-height: 1.2em;
        }

        .failure-debug-button {
          background: #f7f8fa;
          border: 1px solid #aeb7c2;
          border-radius: 6px;
          color: #1b1f24;
          cursor: pointer;
          font: inherit;
          font-size: 0.82rem;
          min-height: 32px;
          padding: 6px 10px;
        }

        .failure-debug-button:hover {
          background: #e9edf3;
        }

        .failure-debug-button[hidden] {
          display: none;
        }

        .failure-debug-modal[hidden] {
          display: none;
        }

        .failure-debug-modal {
          align-items: center;
          background: rgba(0, 0, 0, 0.48);
          bottom: 0;
          display: flex;
          justify-content: center;
          left: 0;
          padding: 20px;
          position: fixed;
          right: 0;
          top: 0;
          z-index: 1001;
        }

        .failure-debug-dialog {
          background: Canvas;
          border: 1px solid #cfd8e3;
          border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
          color: CanvasText;
          display: grid;
          gap: 12px;
          max-height: min(760px, calc(100vh - 32px));
          max-width: min(920px, calc(100vw - 32px));
          overflow: auto;
          padding: 16px;
          width: 100%;
        }

        .failure-debug-header {
          align-items: center;
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }

        .failure-debug-title {
          font-size: 1rem;
          line-height: 1.2;
          margin: 0;
        }

        .failure-debug-close {
          background: transparent;
          border: 1px solid #aeb7c2;
          border-radius: 6px;
          color: inherit;
          cursor: pointer;
          font: inherit;
          min-height: 34px;
          min-width: 36px;
          padding: 6px 10px;
        }

        .failure-debug-list {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }

        .failure-debug-figure {
          background: #f7f8fa;
          border: 1px solid #d8dee7;
          border-radius: 8px;
          display: grid;
          margin: 0;
          min-width: 0;
          overflow: hidden;
        }

        .failure-debug-image-link {
          align-items: center;
          aspect-ratio: 4 / 3;
          background: white;
          display: flex;
          justify-content: center;
        }

        .failure-debug-image-link img {
          display: block;
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .failure-debug-caption {
          align-items: center;
          color: #1b1f24;
          display: flex;
          font-size: 0.82rem;
          gap: 8px;
          justify-content: space-between;
          min-width: 0;
          padding: 8px;
        }

        .failure-debug-caption span {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .failure-debug-caption a {
          color: #005ea6;
          flex: 0 0 auto;
        }

        .reference-modal[hidden] {
          display: none;
        }

        .reference-modal {
          align-items: center;
          background: rgba(0, 0, 0, 0.42);
          bottom: 0;
          display: flex;
          justify-content: center;
          left: 0;
          padding: 24px;
          position: fixed;
          right: 0;
          top: 0;
          z-index: 1000;
        }

        .reference-dialog {
          background: white;
          border: 1px solid #d7dce2;
          border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
          color: #1b1f24;
          display: grid;
          gap: 16px;
          max-width: min(420px, 100%);
          padding: 20px;
          width: 100%;
        }

        .reference-dialog h2 {
          font-size: 1.1rem;
          line-height: 1.2;
          margin: 0;
        }

        .reference-preview {
          align-items: center;
          background: #f6f8fa;
          border: 1px solid #d7dce2;
          border-radius: 6px;
          display: flex;
          justify-content: center;
          min-height: 160px;
          overflow: hidden;
          padding: 8px;
        }

        .reference-preview[hidden] {
          display: none;
        }

        .reference-preview img {
          display: block;
          max-height: 240px;
          max-width: 100%;
          object-fit: contain;
        }

        .reference-fields {
          display: grid;
          gap: 12px;
        }

        .reference-field {
          display: grid;
          gap: 6px;
          font-size: 0.88rem;
        }

        .reference-field input,
        .reference-field select {
          border: 1px solid #b8c0cc;
          border-radius: 6px;
          box-sizing: border-box;
          font: inherit;
          min-height: 38px;
          padding: 8px 10px;
          width: 100%;
        }

        .reference-error {
          color: #b00020;
          font-size: 0.85rem;
          margin: 0;
        }

        .reference-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .reference-actions button {
          border: 1px solid #aeb7c2;
          border-radius: 6px;
          cursor: pointer;
          font: inherit;
          min-height: 36px;
          padding: 8px 12px;
        }

        .reference-actions button[type="submit"] {
          background: #0078d4;
          border-color: #0078d4;
          color: white;
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
        <div class="status-row">
          <p class="status" role="status" aria-live="polite"></p>
          <button
            class="failure-debug-button"
            type="button"
            aria-haspopup="dialog"
            aria-expanded="false"
            hidden
          >Show Debug Images</button>
        </div>
        <div class="controls">${DEFAULT_CONTROLS}</div>
        <div class="failure-debug-modal" id="failureDebugModal" hidden>
          <section
            class="failure-debug-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="failureDebugTitle"
          >
            <div class="failure-debug-header">
              <h2 class="failure-debug-title" id="failureDebugTitle">OpenCV Debug Images</h2>
              <button class="failure-debug-close" type="button" aria-label="Close debug images">Close</button>
            </div>
            <div class="failure-debug-list"></div>
          </section>
        </div>
        <div class="reference-modal" id="referenceDimensionModal" hidden>
          <form
            class="reference-dialog"
            id="referenceDimensionForm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="referenceDimensionTitle"
          >
            <h2 id="referenceDimensionTitle">Reference Dimensions</h2>
            <div class="reference-preview" id="referenceImagePreview" hidden>
              <img id="referenceImagePreviewImg" alt="">
            </div>
            <div class="reference-fields">
              <label class="reference-field">
                Width
                <input id="referenceWidthInput" inputmode="decimal" required>
              </label>
              <label class="reference-field">
                Height
                <input id="referenceHeightInput" inputmode="decimal" required>
              </label>
              <label class="reference-field">
                Unit
                <select id="referenceUnitSelect">
                  <option value="mm">Millimeters</option>
                  <option value="cm">Centimeters</option>
                  <option value="in">Inches</option>
                </select>
              </label>
            </div>
            <p class="reference-error" id="referenceDimensionError" role="alert" hidden></p>
            <div class="reference-actions">
              <button type="button" id="referenceCancelButton">Cancel</button>
              <button type="submit">Continue</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  connectedCallback() {
    this._syncBoardAttributes();
    this.fileInput.addEventListener("change", this._onFileInputChange);
    this.referenceForm.addEventListener("submit", this._onReferenceFormSubmit);
    this.referenceCancelButton.addEventListener("click", this._onReferenceCancel);
    this.failureDebugButton.addEventListener(
      "click",
      this._onFailureDebugButtonClick,
    );
    this.failureDebugCloseButton.addEventListener(
      "click",
      this._onFailureDebugClose,
    );
    this.failureDebugModalEl.addEventListener(
      "click",
      this._onFailureDebugModalClick,
    );
    this.shadowRoot.addEventListener("keydown", this._onFailureDebugKeydown);
    this._renderFailureDebugImages();
  }

  disconnectedCallback() {
    this.fileInput.removeEventListener("change", this._onFileInputChange);
    this.referenceForm.removeEventListener("submit", this._onReferenceFormSubmit);
    this.referenceCancelButton.removeEventListener(
      "click",
      this._onReferenceCancel,
    );
    this.failureDebugButton.removeEventListener(
      "click",
      this._onFailureDebugButtonClick,
    );
    this.failureDebugCloseButton.removeEventListener(
      "click",
      this._onFailureDebugClose,
    );
    this.failureDebugModalEl.removeEventListener(
      "click",
      this._onFailureDebugModalClick,
    );
    this.shadowRoot.removeEventListener("keydown", this._onFailureDebugKeydown);
    this._rejectReferenceDialog(new Error("Reference dimensions are required."));
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

  get failureDebugButton() {
    return this.shadowRoot.querySelector(".failure-debug-button");
  }

  get failureDebugModalEl() {
    return this.shadowRoot.querySelector("#failureDebugModal");
  }

  get failureDebugCloseButton() {
    return this.shadowRoot.querySelector(".failure-debug-close");
  }

  get failureDebugListEl() {
    return this.shadowRoot.querySelector(".failure-debug-list");
  }

  get referenceModalEl() {
    return this.shadowRoot.querySelector("#referenceDimensionModal");
  }

  get referenceForm() {
    return this.shadowRoot.querySelector("#referenceDimensionForm");
  }

  get referenceWidthInput() {
    return this.shadowRoot.querySelector("#referenceWidthInput");
  }

  get referenceHeightInput() {
    return this.shadowRoot.querySelector("#referenceHeightInput");
  }

  get referenceUnitSelect() {
    return this.shadowRoot.querySelector("#referenceUnitSelect");
  }

  get referenceErrorEl() {
    return this.shadowRoot.querySelector("#referenceDimensionError");
  }

  get referencePreviewEl() {
    return this.shadowRoot.querySelector("#referenceImagePreview");
  }

  get referencePreviewImage() {
    return this.shadowRoot.querySelector("#referenceImagePreviewImg");
  }

  get referenceCancelButton() {
    return this.shadowRoot.querySelector("#referenceCancelButton");
  }

  get photoUploadEndpoint() {
    return this.getAttribute("photo-upload-endpoint") || DEFAULT_PHOTO_UPLOAD_ENDPOINT;
  }

  get opencvEndpoint() {
    return this.getAttribute("opencv-endpoint") || DEFAULT_OPENCV_ENDPOINT;
  }

  get referenceWidthMm() {
    return this._numberAttribute("reference-width-mm", DEFAULT_REFERENCE_WIDTH_MM);
  }

  get referenceHeightMm() {
    return this._numberAttribute("reference-height-mm", DEFAULT_REFERENCE_HEIGHT_MM);
  }

  get boardPixelsPerMm() {
    return this._positiveNumberAttribute(
      "board-pixels-per-mm",
      DEFAULT_BOARD_PIXELS_PER_MM,
    );
  }

  set boardPixelsPerMm(value) {
    this._setOptionalNumberAttribute("board-pixels-per-mm", value);
  }

  get uploadedSvgPixelsPerMm() {
    return this._positiveNumberAttribute(
      "uploaded-svg-pixels-per-mm",
      DEFAULT_UPLOADED_SVG_PIXELS_PER_MM,
    );
  }

  set uploadedSvgPixelsPerMm(value) {
    this._setOptionalNumberAttribute("uploaded-svg-pixels-per-mm", value);
  }

  _onFileInputChange = async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    const fileLabel = this._statusFileLabel(files);
    this._setFailureDebugImages([]);
    this._setStatus(`Uploading ${files.length} ${fileLabel}${files.length === 1 ? "" : "s"}...`);

    const failures = [];

    for (const file of files) {
      try {
        const svgResult = this._normalizeSvgResult(
          await this._getSvgTextForFile(file),
        );
        this.addSvgControl(svgResult.svgText, file.name, {
          debugImages: svgResult.debugImages,
        });
      } catch (error) {
        failures.push({ file, error });
      }
    }

    input.value = "";

    if (failures.length > 0) {
      const debugImages = this._debugImagesFromFailures(failures);

      this._setFailureDebugImages(debugImages);
      this._setStatus(
        `${failures.length} ${fileLabel}${failures.length === 1 ? "" : "s"} could not be uploaded.`,
        true,
      );
      this.dispatchEvent(
        new CustomEvent("svg-upload-error", {
          detail: { failures, debugImages },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }

    this._setFailureDebugImages([]);
    this._setStatus("");
  };

  addSvgControl(svgText, fileName = "uploaded.svg", options = {}) {
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
    control.debugImages = options.debugImages || [];
    this.controlsEl.appendChild(control);

    const debugImages = control.debugImages;

    this.dispatchEvent(
      new CustomEvent("svg-uploaded", {
        detail: {
          control,
          controlId,
          pieceKind,
          label,
          fileName,
          debugImages,
        },
        bubbles: true,
        composed: true,
      }),
    );

    return control;
  }

  async _getSvgTextForFile(file) {
    if (this._isSvgFile(file)) {
      return {
        svgText: await this._readFileText(file),
        debugImages: [],
      };
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

    if (uploadedFile.status && uploadedFile.status !== "success") {
      const originalName = uploadedFile.original_name || file.name || "file";
      throw new Error(
        `Error uploading ${originalName}: ${uploadedFile.message || "Upload failed."}`,
      );
    }

    const uploadedUrl = this._uploadedFileUrl(uploadedFile);

    if (!uploadedUrl) {
      throw new Error("Upload response did not include a file URL.");
    }

    this._setStatus("Enter reference dimensions to continue.");
    const referenceDimensions = await this._requestReferenceDimensions({
      imageUrl: uploadedUrl,
      imageName: uploadedFile.original_name || file.name || "uploaded image",
    });
    this._setStatus("Converting uploaded image...");

    const svgResult = await this._fetchOpenCvResult(
      this._opencvSvgUrl(uploadedUrl, referenceDimensions),
      "OpenCV conversion failed.",
    );

    if (typeof svgResult.svgText !== "string" || svgResult.svgText.trim() === "") {
      throw this._errorWithDebugImages(
        "OpenCV response did not include an SVG.",
        svgResult.debugImages,
      );
    }

    return svgResult;
  }

  _uploadedFileUrl(uploadedFile) {
    const url = uploadedFile.url || uploadedFile.file_url || uploadedFile.location;

    if (!url) return "";

    return new URL(url, document.baseURI).href;
  }

  _opencvSvgUrl(
    uploadedUrl,
    referenceDimensions = {
      widthMm: this.referenceWidthMm,
      heightMm: this.referenceHeightMm,
    },
  ) {
    const url = new URL(this.opencvEndpoint, document.baseURI);
    url.searchParams.set("url", uploadedUrl);
    url.searchParams.set(
      "reference_width_mm",
      this._formatMillimeters(referenceDimensions.widthMm),
    );
    url.searchParams.set(
      "reference_height_mm",
      this._formatMillimeters(referenceDimensions.heightMm),
    );
    url.searchParams.set("debug_image_urls", "1");

    return url.href;
  }

  _requestReferenceDimensions(options = {}) {
    if (this._referenceDialogRequest) {
      throw new Error("Reference dimensions are already being requested.");
    }

    this._logReferenceDimensionPromptMode();
    this._openReferenceDialog(options);

    return new Promise((resolve, reject) => {
      this._referenceDialogRequest = { resolve, reject };
    });
  }

  _openReferenceDialog({ imageUrl = "", imageName = "uploaded image" } = {}) {
    const values = this._referenceDimensionInputValues();

    this.referenceWidthInput.value = values.width;
    this.referenceHeightInput.value = values.height;
    this.referenceUnitSelect.value = values.unit;
    this._setReferencePreview(imageUrl, imageName);
    this._setReferenceDialogError("");
    this._lastFocusedElement = this.shadowRoot.activeElement || document.activeElement;
    this.referenceModalEl.hidden = false;
    this.referenceWidthInput.focus();
  }

  _onReferenceFormSubmit = (event) => {
    event.preventDefault();

    try {
      this._resolveReferenceDialog(this._readReferenceDimensions());
    } catch (error) {
      this._setReferenceDialogError(error.message);
    }
  };

  _onReferenceCancel = () => {
    this._rejectReferenceDialog(new Error("Reference dimensions are required."));
  };

  _onFailureDebugButtonClick = () => {
    this._openFailureDebugModal();
  };

  _onFailureDebugClose = () => {
    this._closeFailureDebugModal();
  };

  _onFailureDebugModalClick = (event) => {
    if (event.target === this.failureDebugModalEl) {
      this._closeFailureDebugModal();
    }
  };

  _onFailureDebugKeydown = (event) => {
    if (event.key === "Escape" && !this.failureDebugModalEl.hidden) {
      event.stopPropagation();
      this._closeFailureDebugModal();
    }
  };

  _readReferenceDimensions() {
    const unit = this.referenceUnitSelect.value;
    const width = this.referenceWidthInput.value;
    const height = this.referenceHeightInput.value;

    return {
      widthMm: this._measurementToMillimeters(
        `${width} ${unit}`,
        "width",
      ),
      heightMm: this._measurementToMillimeters(
        `${height} ${unit}`,
        "height",
      ),
      inputs: { width, height, unit },
    };
  }

  _resolveReferenceDialog(referenceDimensions) {
    const request = this._referenceDialogRequest;
    if (!request) return;

    this._lastReferenceDimensionInputs = referenceDimensions.inputs;
    this._closeReferenceDialog();
    request.resolve(referenceDimensions);
  }

  _rejectReferenceDialog(error) {
    const request = this._referenceDialogRequest;
    if (!request) return;

    this._closeReferenceDialog();
    request.reject(error);
  }

  _closeReferenceDialog() {
    this.referenceModalEl.hidden = true;
    this._setReferencePreview("", "");
    this._setReferenceDialogError("");
    this._referenceDialogRequest = null;
    this._lastFocusedElement?.focus?.();
    this._lastFocusedElement = null;
  }

  _setReferencePreview(imageUrl, imageName) {
    if (imageUrl) {
      this.referencePreviewImage.src = imageUrl;
      this.referencePreviewImage.alt = `Preview of ${imageName || "uploaded image"}`;
    } else {
      this.referencePreviewImage.removeAttribute("src");
      this.referencePreviewImage.alt = "";
    }
    this.referencePreviewEl.hidden = imageUrl === "";
  }

  _setReferenceDialogError(message) {
    this.referenceErrorEl.textContent = message;
    this.referenceErrorEl.hidden = message === "";
  }

  _referenceDimensionInputValues() {
    if (this._lastReferenceDimensionInputs) {
      return this._lastReferenceDimensionInputs;
    }

    return {
      width: this._formatMillimeters(this.referenceWidthMm),
      height: this._formatMillimeters(this.referenceHeightMm),
      unit: "mm",
    };
  }

  _setFailureDebugImages(images) {
    this._failureDebugImages = this._normalizeDebugImages(images);
    this._renderFailureDebugImages();
  }

  _renderFailureDebugImages() {
    if (!this.failureDebugButton || !this.failureDebugListEl) return;

    const images = this._failureDebugImages;
    const hasImages = images.length > 0;

    this.failureDebugButton.hidden = !hasImages;
    this.failureDebugButton.disabled = !hasImages;
    this.failureDebugButton.textContent =
      images.length > 1
        ? `Show Debug Images (${images.length})`
        : "Show Debug Image";
    this.failureDebugButton.setAttribute(
      "aria-label",
      "Show OpenCV debug images for the failed upload",
    );

    if (!hasImages) {
      this._closeFailureDebugModal({ restoreFocus: false });
      this.failureDebugListEl.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();

    images.forEach((image) => {
      const figure = document.createElement("figure");
      figure.className = "failure-debug-figure";

      const link = document.createElement("a");
      link.className = "failure-debug-image-link";
      link.href = image.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.name;
      img.loading = "lazy";

      link.appendChild(img);

      const caption = document.createElement("figcaption");
      caption.className = "failure-debug-caption";

      const name = document.createElement("span");
      name.textContent = image.name;

      const openLink = document.createElement("a");
      openLink.href = image.url;
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
      openLink.textContent = "Open";

      caption.append(name, openLink);
      figure.append(link, caption);
      fragment.appendChild(figure);
    });

    this.failureDebugListEl.replaceChildren(fragment);
  }

  _openFailureDebugModal() {
    if (this._failureDebugImages.length === 0) return;

    this._lastFailureDebugFocusedElement =
      this.shadowRoot.activeElement || document.activeElement;
    this.failureDebugModalEl.hidden = false;
    this.failureDebugButton.setAttribute("aria-expanded", "true");
    this.failureDebugCloseButton.focus();
  }

  _closeFailureDebugModal({ restoreFocus = true } = {}) {
    if (!this.failureDebugModalEl || !this.failureDebugButton) return;

    this.failureDebugModalEl.hidden = true;
    this.failureDebugButton.setAttribute("aria-expanded", "false");

    if (
      restoreFocus &&
      this._lastFailureDebugFocusedElement &&
      document.contains(this)
    ) {
      this._lastFailureDebugFocusedElement.focus?.();
    }

    this._lastFailureDebugFocusedElement = null;
  }

  _logReferenceDimensionPromptMode() {
    if (this._promptAvailabilityLogged) return;

    this._promptAvailabilityLogged = true;

    if (typeof window.prompt !== "function") {
      console.warn(
        "UploadablePalette: window.prompt is unavailable; using the built-in reference dimension modal.",
      );
      return;
    }

    console.info(
      "UploadablePalette: using the built-in reference dimension modal instead of window.prompt for reference dimensions.",
    );
  }

  _measurementToMillimeters(input, label) {
    const match = String(input).match(
      /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(mm|millimeters?|cm|centimeters?|in|inch|inches|")?\s*$/i,
    );

    if (!match) {
      throw new Error(
        `Reference ${label} must be a positive number in mm, cm, or in.`,
      );
    }

    const value = Number.parseFloat(match[1]);
    const unit = (match[2] || "mm").toLowerCase();
    let millimeters = value;

    if (unit === "cm" || unit.startsWith("centimeter")) {
      millimeters = value * 10;
    } else if (
      unit === "in" ||
      unit === '"' ||
      unit === "inch" ||
      unit === "inches"
    ) {
      millimeters = value * 25.4;
    }

    if (!Number.isFinite(millimeters) || millimeters <= 0) {
      throw new Error(
        `Reference ${label} must be a positive number in mm, cm, or in.`,
      );
    }

    return millimeters;
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

  async _fetchSvgText(url, fallbackMessage) {
    const result = await this._fetchOpenCvResult(url, fallbackMessage);

    return result.svgText;
  }

  async _fetchOpenCvResult(url, fallbackMessage) {
    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      throw this._openCvErrorFromResponseBody(text, fallbackMessage);
    }

    return this._opencvResultFromResponseBody(text);
  }

  _svgTextFromResponseBody(text) {
    return this._opencvResultFromResponseBody(text).svgText;
  }

  _opencvResultFromResponseBody(text) {
    try {
      const result = JSON.parse(text);

      return {
        svgText: this._svgTextFromJson(result),
        debugImages: this._debugImagesFromResponse(result),
      };
    } catch {
      return {
        svgText: text,
        debugImages: [],
      };
    }
  }

  _svgTextFromJson(result) {
    const svgText = Array.isArray(result?.svg) ? result.svg[0] : result?.svg;

    return typeof svgText === "string" ? svgText : "";
  }

  _debugImagesFromResponse(result) {
    const debugImages =
      result?.debug_image_urls ||
      result?.debug_images ||
      result?.debugImages ||
      [];

    if (Array.isArray(debugImages)) {
      return this._normalizeDebugImages(debugImages);
    }

    if (debugImages && typeof debugImages === "object") {
      return this._normalizeDebugImages(
        Object.entries(debugImages).map(([name, image]) => {
          if (typeof image === "string") {
            return { name, url: image };
          }

          return {
            ...image,
            name: image?.name || name,
          };
        }),
      );
    }

    return [];
  }

  _debugImagesFromFailures(failures) {
    return this._normalizeDebugImages(
      failures.flatMap(({ error }) =>
        Array.isArray(error?.debugImages) ? error.debugImages : [],
      ),
    );
  }

  _normalizeSvgResult(result) {
    if (typeof result === "string") {
      return {
        svgText: result,
        debugImages: [],
      };
    }

    return {
      svgText: result?.svgText || "",
      debugImages: this._normalizeDebugImages(result?.debugImages),
    };
  }

  _openCvErrorFromResponseBody(text, fallbackMessage) {
    try {
      const result = JSON.parse(text);

      return this._errorWithDebugImages(
        result?.error || result?.message || fallbackMessage,
        this._debugImagesFromResponse(result),
      );
    } catch {
      return this._errorWithDebugImages(fallbackMessage);
    }
  }

  _errorWithDebugImages(message, debugImages = []) {
    const error = new Error(message);
    error.debugImages = this._normalizeDebugImages(debugImages);

    return error;
  }

  _normalizeDebugImages(images) {
    if (!Array.isArray(images)) return [];

    return images
      .map((image, index) => this._normalizeDebugImage(image, index))
      .filter(Boolean);
  }

  _normalizeDebugImage(image, index) {
    const source =
      typeof image === "string"
        ? { url: image }
        : image && typeof image === "object"
          ? image
          : null;

    if (!source) return null;

    const url = this._safeImageUrl(source.url || source.href || source.src);
    if (!url) return null;

    const filename = source.filename || this._filenameFromUrl(url);
    const name =
      source.name ||
      source.label ||
      filename ||
      `Debug image ${index + 1}`;

    return {
      name: String(name),
      filename: filename ? String(filename) : "",
      mimeType: String(source.mimeType || source.mime_type || ""),
      url,
    };
  }

  _safeImageUrl(value) {
    if (!value) return "";

    try {
      const url = new URL(String(value), document.baseURI);
      const allowedProtocols = ["http:", "https:", "data:", "blob:"];

      return allowedProtocols.includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  _filenameFromUrl(value) {
    try {
      const url = new URL(value, document.baseURI);
      const filename = url.pathname.split("/").filter(Boolean).pop();

      return filename ? decodeURIComponent(filename) : "";
    } catch {
      return "";
    }
  }

  _responseErrorMessage(text) {
    try {
      const result = JSON.parse(text);

      return result?.error || result?.message || "";
    } catch {
      return "";
    }
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
    svg.querySelectorAll("script, foreignObject, text").forEach((node) =>
      node.remove(),
    );

    const allElements = [svg, ...Array.from(svg.querySelectorAll("*"))];
    for (const element of allElements) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.toLowerCase().startsWith("on")) {
          element.removeAttribute(attribute.name);
        }
      }
    }
  }

  _shapePieceSvgs(svg) {
    const clusters = this._svgGraphicClusters(svg);

    if (clusters.length <= 1) {
      return [svg.cloneNode(true)];
    }

    return clusters.map((cluster) =>
      this._cloneSvgGraphicCluster(cluster.sourceSvg, cluster),
    );
  }

  _svgGraphicClusters(svg) {
    if (!document.body || typeof svg.cloneNode !== "function") {
      return [];
    }

    const measuringSvg = svg.cloneNode(true);
    measuringSvg.removeAttribute("id");
    measuringSvg.style.position = "absolute";
    measuringSvg.style.left = "-100000px";
    measuringSvg.style.top = "-100000px";
    measuringSvg.style.visibility = "hidden";
    measuringSvg.style.pointerEvents = "none";
    measuringSvg.style.overflow = "visible";

    document.body.appendChild(measuringSvg);

    try {
      const descriptors = this._svgGraphicDescriptors(measuringSvg);
      const padding = this._svgClusterPadding(measuringSvg);
      const clusters = [];

      for (const descriptor of descriptors) {
        const matchingClusters = clusters.filter((cluster) =>
          this._boundsOverlap(cluster.bounds, descriptor.bounds, padding),
        );

        if (matchingClusters.length === 0) {
          clusters.push({
            bounds: descriptor.bounds,
            graphics: [descriptor.graphic],
          });
          continue;
        }

        const [targetCluster] = matchingClusters;
        targetCluster.graphics.push(descriptor.graphic);
        targetCluster.bounds = this._unionBounds(
          targetCluster.bounds,
          descriptor.bounds,
        );

        for (const cluster of matchingClusters.slice(1)) {
          targetCluster.graphics.push(...cluster.graphics);
          targetCluster.bounds = this._unionBounds(
            targetCluster.bounds,
            cluster.bounds,
          );
          clusters.splice(clusters.indexOf(cluster), 1);
        }
      }

      return clusters
        .filter((cluster) => this._isSubstantiveSvgCluster(cluster, measuringSvg))
        .map((cluster) => ({
          bounds: cluster.bounds,
          sourceSvg: measuringSvg,
          graphics: cluster.graphics,
        }));
    } catch {
      return [];
    } finally {
      measuringSvg.remove();
    }
  }

  _svgGraphicDescriptors(svg) {
    return Array.from(svg.querySelectorAll(SVG_GRAPHIC_SELECTOR))
      .filter((node) => !node.closest?.(SVG_BOUNDARY_IGNORE_SELECTOR))
      .map((graphic) => ({
        graphic,
        bounds: this._measureSvgGraphicBounds(graphic, svg),
      }))
      .filter((descriptor) => descriptor.bounds);
  }

  _svgClusterPadding(svg) {
    return Math.max(1, this._svgSourcePixelsPerMm(svg) * 4);
  }

  _isSubstantiveSvgCluster(cluster, svg) {
    const sourcePixelsPerMm = this._svgSourcePixelsPerMm(svg);
    const width = cluster.bounds.width / sourcePixelsPerMm;
    const height = cluster.bounds.height / sourcePixelsPerMm;

    return width >= 1 || height >= 1;
  }

  _boundsOverlap(a, b, padding = 0) {
    return (
      a.x <= b.x + b.width + padding &&
      a.x + a.width + padding >= b.x &&
      a.y <= b.y + b.height + padding &&
      a.y + a.height + padding >= b.y
    );
  }

  _cloneSvgGraphicCluster(svg, cluster) {
    const clone = svg.cloneNode(true);
    const sourceElements = Array.from(svg.querySelectorAll("*"));
    const clonedElements = Array.from(clone.querySelectorAll("*"));
    const cloneBySource = new Map(
      sourceElements.map((element, index) => [element, clonedElements[index]]),
    );
    const keep = new Set([clone]);

    for (const graphic of cluster.graphics) {
      for (
        let node = graphic;
        node instanceof SVGElement && node !== svg;
        node = node.parentElement
      ) {
        const clonedNode = cloneBySource.get(node);
        if (clonedNode) {
          keep.add(clonedNode);
        }
      }
    }

    Array.from(clone.querySelectorAll("*"))
      .reverse()
      .forEach((node) => {
        if (keep.has(node) || this._isPreservedSvgContextNode(node)) {
          return;
        }

        node.remove();
      });

    return clone;
  }

  _isPreservedSvgContextNode(node) {
    return (
      ["defs", "desc", "style", "title"].includes(node.localName) ||
      Boolean(node.closest?.("defs,style"))
    );
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

    const templateSvg = shapeSvg.cloneNode(false);
    const pieceSvgs = this._shapePieceSvgs(shapeSvg);

    for (const pieceSvg of pieceSvgs) {
      templateSvg.appendChild(this._createShapeRoot(pieceSvg));
    }

    template.content.appendChild(templateSvg);

    return template;
  }

  _createShapeRoot(pieceSvg) {
    const visibleBounds = this._measureSvgVisibleBounds(pieceSvg);
    const sourcePixelsPerMm = this._svgSourcePixelsPerMm(pieceSvg);
    const wrapper = document.createElementNS(SVG_NS, "g");
    wrapper.setAttribute("data-draggable", "true");
    wrapper.setAttribute("role", "garment");
    wrapper.setAttribute("pointer-events", "all");

    const normalizingTransform = this._svgNormalizingTransform(
      visibleBounds,
      sourcePixelsPerMm,
    );

    this._appendShapeChildren(wrapper, pieceSvg, normalizingTransform);

    return wrapper;
  }

  _appendShapeChildren(target, sourceParent, inheritedTransform = "") {
    for (const child of Array.from(sourceParent.childNodes)) {
      if (this._isUnwrappableShapeGroup(child)) {
        this._appendShapeChildren(
          target,
          child,
          this._svgTransformList(
            inheritedTransform,
            child.getAttribute("transform"),
          ),
        );
        continue;
      }

      const clone = child.cloneNode(true);

      if (
        clone instanceof SVGElement &&
        inheritedTransform &&
        this._canReceiveStaticTransform(clone)
      ) {
        clone.setAttribute(
          "transform",
          this._svgTransformList(
            inheritedTransform,
            clone.getAttribute("transform"),
          ),
        );
      }

      target.appendChild(clone);
    }
  }

  _isUnwrappableShapeGroup(node) {
    return (
      node instanceof SVGElement &&
      node.localName === "g" &&
      Array.from(node.attributes).every((attribute) =>
        this._isUnwrappableGroupAttribute(attribute.name),
      )
    );
  }

  _isUnwrappableGroupAttribute(name) {
    const normalizedName = name.toLowerCase();

    return (
      SVG_UNWRAPPABLE_GROUP_ATTRIBUTES.has(normalizedName) ||
      SVG_UNWRAPPABLE_GROUP_ATTRIBUTE_PREFIXES.some((prefix) =>
        normalizedName.startsWith(prefix),
      )
    );
  }

  _canReceiveStaticTransform(node) {
    return SVG_TRANSFORMABLE_TAGS.has(node.localName);
  }

  _svgTransformList(...transforms) {
    return transforms
      .map((transform) => transform?.trim())
      .filter(Boolean)
      .join(" ");
  }

  _svgSourcePixelsPerMm(svg) {
    return this._svgDxfPixelsPerMm(svg) || this.uploadedSvgPixelsPerMm;
  }

  _svgDxfPixelsPerMm(svg) {
    const descriptionText = Array.from(svg.querySelectorAll("desc"))
      .map((desc) => desc.textContent || "")
      .join(" ");

    if (!SVG_DXF_DESCRIPTION_PATTERN.test(descriptionText)) {
      return null;
    }

    const scaleMatch = descriptionText.match(SVG_DXF_SCALE_PATTERN);
    const pixelsPerMm = scaleMatch ? Number.parseFloat(scaleMatch[1]) : NaN;

    return Number.isFinite(pixelsPerMm) && pixelsPerMm > 0
      ? pixelsPerMm
      : null;
  }

  _svgNormalizingTransform(
    bounds,
    sourcePixelsPerMm = this.uploadedSvgPixelsPerMm,
  ) {
    const normalizedSourcePixelsPerMm = this._positiveNumber(
      sourcePixelsPerMm,
      this.uploadedSvgPixelsPerMm,
    );
    const scale = this.boardPixelsPerMm / normalizedSourcePixelsPerMm;
    const x = bounds ? -bounds.x * scale : 0;
    const y = bounds ? -bounds.y * scale : 0;
    const hasScale = Math.abs(scale - 1) > 0.0001;
    const hasTranslation = x !== 0 || y !== 0;

    if (hasScale) {
      return `matrix(${this._formatSvgNumber(scale)} 0 0 ${this._formatSvgNumber(scale)} ${this._formatSvgNumber(x)} ${this._formatSvgNumber(y)})`;
    }

    if (hasTranslation) {
      return `translate(${this._formatSvgNumber(x)}, ${this._formatSvgNumber(y)})`;
    }

    return "";
  }

  _measureSvgVisibleBounds(svg) {
    if (!document.body || typeof svg.cloneNode !== "function") {
      return null;
    }

    const measuringSvg = svg.cloneNode(true);
    measuringSvg.removeAttribute("id");
    measuringSvg.style.position = "absolute";
    measuringSvg.style.left = "-100000px";
    measuringSvg.style.top = "-100000px";
    measuringSvg.style.visibility = "hidden";
    measuringSvg.style.pointerEvents = "none";
    measuringSvg.style.overflow = "visible";

    document.body.appendChild(measuringSvg);

    try {
      const graphics = Array.from(
        measuringSvg.querySelectorAll(SVG_GRAPHIC_SELECTOR),
      ).filter(
        (node) => !node.closest?.(SVG_BOUNDARY_IGNORE_SELECTOR),
      );

      return graphics.reduce((bounds, graphic) => {
        const graphicBounds = this._measureSvgGraphicBounds(
          graphic,
          measuringSvg,
        );

        return this._unionBounds(bounds, graphicBounds);
      }, null);
    } catch {
      return null;
    } finally {
      measuringSvg.remove();
    }
  }

  _measureSvgGraphicBounds(graphic, rootSvg) {
    if (typeof graphic.getBBox !== "function") {
      return null;
    }

    const box = graphic.getBBox();

    if (
      !Number.isFinite(box.x) ||
      !Number.isFinite(box.y) ||
      !Number.isFinite(box.width) ||
      !Number.isFinite(box.height) ||
      (box.width === 0 && box.height === 0)
    ) {
      return null;
    }

    const matrix = this._combinedSvgTransform(graphic, rootSvg);

    return this._transformedBounds(box, matrix);
  }

  _combinedSvgTransform(element, rootSvg) {
    const chain = [];

    for (
      let node = element;
      node instanceof SVGElement;
      node = node.parentElement
    ) {
      chain.unshift(node);

      if (node === rootSvg) {
        break;
      }
    }

    return chain.reduce(
      (matrix, node) =>
        this._multiplySvgMatrices(
          matrix,
          this._svgTransformMatrix(node.getAttribute("transform")),
        ),
      this._identitySvgMatrix(),
    );
  }

  _svgTransformMatrix(transform) {
    let matrix = this._identitySvgMatrix();
    const pattern = /([a-zA-Z]+)\(([^)]*)\)/g;
    let match;

    while ((match = pattern.exec(transform || ""))) {
      const command = match[1].toLowerCase();
      const values = match[2]
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((value) => Number.parseFloat(value));

      matrix = this._multiplySvgMatrices(
        matrix,
        this._svgTransformCommandMatrix(command, values),
      );
    }

    return matrix;
  }

  _svgTransformCommandMatrix(command, values) {
    switch (command) {
      case "matrix":
        if (values.length >= 6) {
          return {
            a: values[0],
            b: values[1],
            c: values[2],
            d: values[3],
            e: values[4],
            f: values[5],
          };
        }
        break;
      case "translate":
        return this._svgTranslateMatrix(values[0] || 0, values[1] || 0);
      case "scale":
        return this._svgScaleMatrix(
          values[0] ?? 1,
          values.length > 1 ? values[1] : values[0],
        );
      case "rotate":
        return this._svgRotateMatrix(
          values[0] || 0,
          values[1],
          values[2],
        );
      case "skewx":
        return this._svgSkewXMatrix(values[0] || 0);
      case "skewy":
        return this._svgSkewYMatrix(values[0] || 0);
    }

    return this._identitySvgMatrix();
  }

  _identitySvgMatrix() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  _svgTranslateMatrix(x, y = 0) {
    return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
  }

  _svgScaleMatrix(x, y = x) {
    return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
  }

  _svgRotateMatrix(angle, cx, cy) {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotate = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };

    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      return rotate;
    }

    return this._multiplySvgMatrices(
      this._multiplySvgMatrices(
        this._svgTranslateMatrix(cx, cy),
        rotate,
      ),
      this._svgTranslateMatrix(-cx, -cy),
    );
  }

  _svgSkewXMatrix(angle) {
    return {
      a: 1,
      b: 0,
      c: Math.tan((angle * Math.PI) / 180),
      d: 1,
      e: 0,
      f: 0,
    };
  }

  _svgSkewYMatrix(angle) {
    return {
      a: 1,
      b: Math.tan((angle * Math.PI) / 180),
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    };
  }

  _multiplySvgMatrices(a, b) {
    return {
      a: a.a * b.a + a.c * b.b,
      b: a.b * b.a + a.d * b.b,
      c: a.a * b.c + a.c * b.d,
      d: a.b * b.c + a.d * b.d,
      e: a.a * b.e + a.c * b.f + a.e,
      f: a.b * b.e + a.d * b.f + a.f,
    };
  }

  _transformedBounds(box, matrix) {
    const points = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x, y: box.y + box.height },
      { x: box.x + box.width, y: box.y + box.height },
    ].map((point) => this._transformSvgPoint(point, matrix));

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  _transformSvgPoint(point, matrix) {
    if (!matrix) return point;

    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
  }

  _unionBounds(a, b) {
    if (!b) return a;
    if (!a) return b;

    const minX = Math.min(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x + a.width, b.x + b.width);
    const maxY = Math.max(a.y + a.height, b.y + b.height);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  _viewBoxFromSize(svg) {
    const width = Number.parseFloat(svg.getAttribute("width")) || 100;
    const height = Number.parseFloat(svg.getAttribute("height")) || 100;
    return `0 0 ${width} ${height}`;
  }

  _formatSvgNumber(value) {
    const rounded = Math.abs(value) < 0.0001 ? 0 : Number(value.toFixed(4));
    return String(rounded);
  }

  _numberAttribute(name, fallback) {
    const value = Number.parseFloat(this.getAttribute(name));

    return Number.isFinite(value) ? value : fallback;
  }

  _positiveNumberAttribute(name, fallback) {
    return this._positiveNumber(this.getAttribute(name), fallback);
  }

  _positiveNumber(value, fallback) {
    const number = Number.parseFloat(value);

    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  _setOptionalNumberAttribute(name, value) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute(name);
      return;
    }

    this.setAttribute(name, String(value));
  }

  _formatMillimeters(value) {
    return String(Number(value.toFixed(4)));
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
