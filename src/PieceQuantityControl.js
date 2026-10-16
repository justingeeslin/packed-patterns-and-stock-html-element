// src/PieceQuantityControl.js
const SVG_NS = "http://www.w3.org/2000/svg";

export class PieceQuantityControl extends HTMLElement {
  static get observedAttributes() {
	return ["board", "piece-kind", "label", "value", "debug-images"];
  }

  constructor() {
	super();
	this.attachShadow({ mode: "open" });
	this._localCounter = 0;
	this._debugImages = [];
	
	this.boardSvgElement;

	this.shadowRoot.innerHTML = `
	  <style>
		:host {
		  font-family: sans-serif;
		}

		.control {
		  border: 3px solid white;
		  border-radius: 8px;
		  display: grid;
		  gap: 10px;
		  padding: 1em;
		}
		
				
		.preview {
			display:block;
		}

		.label {
		  min-width: 0;
		}

		input[type="number"] {
		  width: 80px;
		  padding: 6px;
		  box-sizing: border-box;
		}

		.quantity-row {
		  align-items: center;
		  display: flex;
		  flex-wrap: wrap;
		  gap: 8px;
		}

		button {
		  border: 1px solid #aeb7c2;
		  border-radius: 6px;
		  cursor: pointer;
		  font: inherit;
		  min-height: 34px;
		  padding: 6px 10px;
		}

		.debug-button {
		  background: #f7f8fa;
		  color: #1b1f24;
		}

		.debug-button:hover {
		  background: #e9edf3;
		}

		.debug-button[hidden] {
		  display: none;
		}

		.debug-modal[hidden] {
		  display: none;
		}

		.debug-modal {
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

		.debug-dialog {
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

		.debug-header {
		  align-items: center;
		  display: flex;
		  gap: 12px;
		  justify-content: space-between;
		}

		.debug-title {
		  font-size: 1rem;
		  line-height: 1.2;
		  margin: 0;
		}

		.debug-close {
		  background: transparent;
		  color: inherit;
		  min-width: 36px;
		  padding: 6px 10px;
		}

		.debug-list {
		  display: grid;
		  gap: 12px;
		  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		}

		.debug-figure {
		  background: #f7f8fa;
		  border: 1px solid #d8dee7;
		  border-radius: 8px;
		  display: grid;
		  margin: 0;
		  min-width: 0;
		  overflow: hidden;
		}

		.debug-image-link {
		  align-items: center;
		  aspect-ratio: 4 / 3;
		  background: white;
		  display: flex;
		  justify-content: center;
		}

		.debug-image-link img {
		  display: block;
		  height: 100%;
		  object-fit: contain;
		  width: 100%;
		}

		.debug-caption {
		  align-items: center;
		  color: #1b1f24;
		  display: flex;
		  font-size: 0.82rem;
		  gap: 8px;
		  justify-content: space-between;
		  min-width: 0;
		  padding: 8px;
		}

		.debug-caption span {
		  min-width: 0;
		  overflow-wrap: anywhere;
		}

		.debug-caption a {
		  color: #005ea6;
		  flex: 0 0 auto;
		}

		::slotted([slot="shape"]) {
		  display: none;
		}
	  </style>

	  <div class="control">
		<slot name="preview"></slot>
		<div class="label"></div>
		<div class="quantity-row">
		  <input class="qty" type="number" min="0" step="1" value="0">
		  <button
			class="debug-button"
			type="button"
			aria-haspopup="dialog"
			aria-expanded="false"
			hidden
		  >CV Debug</button>
		</div>
	  </div>

	  <div class="debug-modal" hidden>
		<section
		  class="debug-dialog"
		  role="dialog"
		  aria-modal="true"
		  aria-labelledby="debugTitle"
		>
		  <div class="debug-header">
			<h2 class="debug-title" id="debugTitle">CV Debug Images</h2>
			<button class="debug-close" type="button" aria-label="Close debug images">Close</button>
		  </div>
		  <div class="debug-list"></div>
		</section>
	  </div>

	  <slot name="shape"></slot>
	`;
  }

  connectedCallback() {
	this._render();
	console.log('Setting the board SVG element ', this.boardId)
	this.boardSvgElement = document.querySelector('#' + this.boardId)
	this.qtyInput.addEventListener("input", this._onInput);
	this.debugButton.addEventListener("click", this._onDebugButtonClick);
	this.debugCloseButton.addEventListener("click", this._onDebugClose);
	this.debugModalEl.addEventListener("click", this._onDebugModalClick);
	this.shadowRoot.addEventListener("keydown", this._onDebugKeydown);
	this._renderDebugImages();
  }

  disconnectedCallback() {
	this.qtyInput.removeEventListener("input", this._onInput);
	this.debugButton.removeEventListener("click", this._onDebugButtonClick);
	this.debugCloseButton.removeEventListener("click", this._onDebugClose);
	this.debugModalEl.removeEventListener("click", this._onDebugModalClick);
	this.shadowRoot.removeEventListener("keydown", this._onDebugKeydown);
  }

  attributeChangedCallback(name, oldValue, newValue) {
	if (oldValue === newValue) return;

	if (name === "debug-images") {
	  this.debugImages = this._parseDebugImagesAttribute(newValue);
	  return;
	}

	this._render();
  }

  get qtyInput() {
	return this.shadowRoot.querySelector(".qty");
  }

  get labelEl() {
	return this.shadowRoot.querySelector(".label");
  }

  get debugButton() {
	return this.shadowRoot.querySelector(".debug-button");
  }

  get debugModalEl() {
	return this.shadowRoot.querySelector(".debug-modal");
  }

  get debugCloseButton() {
	return this.shadowRoot.querySelector(".debug-close");
  }

  get debugListEl() {
	return this.shadowRoot.querySelector(".debug-list");
  }

  get boardId() {
	return this.getAttribute("board");
  }

  get pieceKind() {
	return this.getAttribute("piece-kind") || "unknown";
  }

  get label() {
	return this.getAttribute("label") || this.pieceKind;
  }

  get value() {
	return Math.max(0, Number.parseInt(this.getAttribute("value") || "0", 10) || 0);
  }

  set value(v) {
	this.setAttribute("value", String(Math.max(0, Number.parseInt(v, 10) || 0)));
  }

  get debugImages() {
	return this._debugImages.map((image) => ({ ...image }));
  }

  set debugImages(images) {
	this._debugImages = this._normalizeDebugImages(images);
	this._renderDebugImages();
  }

  get ownerId() {
	return this.id || this.getAttribute("name") || this.pieceKind;
  }

  get shapeTemplate() {
	return this.querySelector('template[slot="shape"]');
  }

  _onInput = () => {
	const desired = Math.max(0, Number.parseInt(this.qtyInput.value || "0", 10) || 0);
	this.value = desired;
	this._reconcileQuantity(desired);
  };

  _render() {
	this.labelEl.textContent = this.label;
	this.qtyInput.value = String(this.value);
  }

  _renderDebugImages() {
	if (!this.debugButton || !this.debugListEl) return;

	const images = this._debugImages;
	const hasImages = images.length > 0;

	this.debugButton.hidden = !hasImages;
	this.debugButton.disabled = !hasImages;
	this.debugButton.textContent =
	  images.length > 1 ? `CV Debug (${images.length})` : "CV Debug";
	this.debugButton.setAttribute(
	  "aria-label",
	  `${this.label} CV debug images`,
	);

	if (!hasImages) {
	  this._closeDebugModal({ restoreFocus: false });
	  this.debugListEl.replaceChildren();
	  return;
	}

	const fragment = document.createDocumentFragment();

	images.forEach((image) => {
	  const figure = document.createElement("figure");
	  figure.className = "debug-figure";

	  const link = document.createElement("a");
	  link.className = "debug-image-link";
	  link.href = image.url;
	  link.target = "_blank";
	  link.rel = "noopener noreferrer";

	  const img = document.createElement("img");
	  img.src = image.url;
	  img.alt = image.name;
	  img.loading = "lazy";

	  link.appendChild(img);

	  const caption = document.createElement("figcaption");
	  caption.className = "debug-caption";

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

	this.debugListEl.replaceChildren(fragment);
  }

  _onDebugButtonClick = () => {
	this._openDebugModal();
  };

  _onDebugClose = () => {
	this._closeDebugModal();
  };

  _onDebugModalClick = (event) => {
	if (event.target === this.debugModalEl) {
	  this._closeDebugModal();
	}
  };

  _onDebugKeydown = (event) => {
	if (event.key === "Escape" && !this.debugModalEl.hidden) {
	  event.stopPropagation();
	  this._closeDebugModal();
	}
  };

  _openDebugModal() {
	if (this._debugImages.length === 0) return;

	this.debugModalEl.hidden = false;
	this.debugButton.setAttribute("aria-expanded", "true");
	this.debugCloseButton.focus();
  }

  _closeDebugModal({ restoreFocus = true } = {}) {
	if (!this.debugModalEl || !this.debugButton) return;

	this.debugModalEl.hidden = true;
	this.debugButton.setAttribute("aria-expanded", "false");

	if (restoreFocus && document.contains(this)) {
	  this.debugButton.focus();
	}
  }

  _parseDebugImagesAttribute(value) {
	if (!value) return [];

	try {
	  const parsed = JSON.parse(value);
	  return Array.isArray(parsed) ? parsed : [];
	} catch {
	  return [];
	}
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

  _reconcileQuantity(desiredCount) {
	const currentNodes = this._getOwnedNodes(this.boardSvgElement);
	const currentUnits = this._getOwnedUnits(currentNodes);
	const currentCount = currentUnits.length;
	const delta = desiredCount - currentCount;

	if (delta > 0) {
	  let nextGridIndex = currentNodes.length;

	  for (let i = 0; i < delta; i += 1) {
		const nodes = this._createOwnedNodes(currentCount + i, nextGridIndex);

		for (const node of nodes) {
		  this.boardSvgElement.appendChild(node);
		}

		nextGridIndex += nodes.length;
	  }
	} else if (delta < 0) {
	  currentUnits
		.slice(delta)
		.flatMap((unit) => unit.nodes)
		.forEach((node) => node.remove());
	}
  }

  _getOwnedNodes(board = this.boardSvgElement) {
	if (!board) return [];

	return Array.from(board.querySelectorAll((
	  `[data-owner-control="${CSS.escape(this.ownerId)}"][data-piece-kind="${CSS.escape(this.pieceKind)}"]`
	)));
  }

  _getOwnedUnits(nodes) {
	const units = new Map();

	nodes.forEach((node, index) => {
	  const key =
		node.getAttribute("data-owner-unit") ||
		node.getAttribute("data-instance-id") ||
		`untracked-${index}`;

	  if (!units.has(key)) {
		units.set(key, {
		  key,
		  nodes: [],
		});
	  }

	  units.get(key).nodes.push(node);
	});

	return Array.from(units.values());
  }

  _createOwnedNode(index) {
	const [node] = this._createOwnedNodes(index, index);
	return node;
  }

  _createOwnedNodes(unitIndex, startGridIndex = unitIndex) {
	const template = this.shapeTemplate;
	if (!template) {
	  throw new Error(`Missing <template slot="shape"> in ${this.tagName.toLowerCase()}`);
	}
  
	const fragment = template.content.cloneNode(true);
  
	// Find the first SVG root in the template.
	const svgRoot = Array.from(fragment.children).find(
	  (node) => node instanceof SVGSVGElement
	);
  
	if (!svgRoot) {
	  throw new Error(
		'Shape template must contain an <svg> root inside <template slot="shape">'
	  );
	}

	const roots = this._templateShapeRoots(svgRoot);

	if (roots.length === 0) {
	  throw new Error(
		"Shape template SVG must contain one root SVG child element, usually a <g>"
	  );
	}

	const unitId = `${this.ownerId}-${unitIndex}`;

	return roots.map((sourceRoot, partIndex) => {
	  const root = sourceRoot.cloneNode(true);

	  root.setAttribute("data-owner-control", this.ownerId);
	  root.setAttribute("data-piece-kind", this.pieceKind);
	  root.setAttribute("data-owner-unit", unitId);
	  root.setAttribute("data-instance-id", `${this.ownerId}-${this._localCounter++}`);

	  this._positionNode(root, startGridIndex + partIndex);

	  return root;
	});
  }

  _templateShapeRoots(svgRoot) {
	const nonShapeTags = new Set([
	  "defs",
	  "desc",
	  "metadata",
	  "style",
	  "title",
	]);

	return Array.from(svgRoot.children).filter(
	  (node) => node instanceof SVGElement && !nonShapeTags.has(node.localName),
	);
  }

  _positionNode(node, index) {
	const colCount = 6;
	const cellW = 120;
	const cellH = 120;
	const startX = 80;
	const startY = 80;

	const col = index % colCount;
	const row = Math.floor(index / colCount);

	const x = startX + col * cellW;
	const y = startY + row * cellH;

	const existingTransform = node.getAttribute("transform") || "";
	const translate = `translate(${x}, ${y})`;

	node.setAttribute(
	  "transform",
	  existingTransform ? `${translate} ${existingTransform}` : translate
	);
  }
}

if (!customElements.get("piece-quantity-control")) {
  customElements.define("piece-quantity-control", PieceQuantityControl);
}
