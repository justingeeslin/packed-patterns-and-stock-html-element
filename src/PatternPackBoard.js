// src/PatternPackBoard.js

import DraggableSvgBoard from "/node_modules/draggable-svg-html-element/src/DraggableSvgBoard.js";

const SVG_NS = "http://www.w3.org/2000/svg";
export const DEFAULT_PACKAIDE_ENDPOINT =
  "https://secure-refuge-29958-07dfc33a91ee.herokuapp.com/proxy/";
const ROLE_STROKE_STYLE_ID = "pattern-pack-role-strokes";
const INCH_GRID_STYLE_ID = "pattern-pack-inch-grid-styles";
const MM_PER_INCH = 25.4;
export const DEFAULT_BOARD_PIXELS_PER_MM = 1;
export const DEFAULT_GRID_SUBDIVISIONS_PER_INCH = 4;
export const DEFAULT_GRID_MAJOR_INCHES = 1;
const DEFAULT_PACK_OPTIONS = {
  tolerance: 0.03,
  offset: 0,
  rotations: 1,
  persist: false,
};
const BOARD_BOUNDS_PADDING = 50;
const PACK_OPTION_ATTRIBUTES = {
  "include-stock": "include_stock",
  offset: "offset",
  "partial-solution": "partial_solution",
  persist: "persist",
  rotations: "rotations",
  "stock-inset": "stock_inset",
  tolerance: "tolerance",
};
const GRID_OPTION_ATTRIBUTES = [
  "board-pixels-per-mm",
  "grid-subdivisions-per-inch",
  "grid-major-inches",
];
const BOOLEAN_PACK_OPTIONS = new Set([
  "include_stock",
  "partial_solution",
  "persist",
]);
const SVG_ROOT_RESULT_ATTRIBUTES = [
  "viewBox",
  "width",
  "height",
  "preserveAspectRatio",
];
const SVG_GRAPHIC_TAGS = new Set([
  "circle",
  "ellipse",
  "image",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
  "use",
]);
const SVG_STROKE_GRAPHIC_TAGS = [
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
];
const SVG_NON_DRAWING_TAGS = new Set([
  "clipPath",
  "defs",
  "desc",
  "filter",
  "foreignObject",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "pattern",
  "radialGradient",
  "script",
  "style",
  "symbol",
  "title",
]);
const SVG_BLOCKED_IMPORT_TAGS = new Set(["foreignObject", "script"]);
const SVG_GRAPHIC_SELECTOR = Array.from(SVG_GRAPHIC_TAGS).join(",");
const ROLE_STROKE_CSS = `
[role="garment"],
${SVG_STROKE_GRAPHIC_TAGS.map((tag) => `[role="garment"] ${tag}`).join(",\n")} {
  stroke: var(--pattern-pack-garment-stroke, #005fcc) !important;
  stroke-width: var(--pattern-pack-garment-stroke-width, 2.5) !important;
  vector-effect: non-scaling-stroke;
}

[role="stock"],
${SVG_STROKE_GRAPHIC_TAGS.map((tag) => `[role="stock"] ${tag}`).join(",\n")} {
  stroke: var(--pattern-pack-stock-stroke, #007a3d) !important;
  stroke-width: var(--pattern-pack-stock-stroke-width, 3) !important;
  vector-effect: non-scaling-stroke;
}

@media (prefers-color-scheme: dark) {
  [role="garment"],
  ${SVG_STROKE_GRAPHIC_TAGS.map((tag) => `[role="garment"] ${tag}`).join(",\n  ")} {
    stroke: var(--pattern-pack-garment-stroke-dark, var(--pattern-pack-garment-stroke, #5aa2ff)) !important;
  }

  [role="stock"],
  ${SVG_STROKE_GRAPHIC_TAGS.map((tag) => `[role="stock"] ${tag}`).join(",\n  ")} {
    stroke: var(--pattern-pack-stock-stroke-dark, var(--pattern-pack-stock-stroke, #38d982)) !important;
  }
}
`;
const INCH_GRID_CSS = `
.grid-minor,
.grid-inch-minor {
  stroke: var(--pattern-pack-grid-minor, #dce4ee);
  stroke-width: var(--pattern-pack-grid-minor-stroke-width, 1);
  vector-effect: non-scaling-stroke;
}

.grid-major,
.grid-inch-major {
  stroke: var(--pattern-pack-grid-major, #b8c6d6);
  stroke-width: var(--pattern-pack-grid-major-stroke-width, 2);
  vector-effect: non-scaling-stroke;
}

@media (prefers-color-scheme: dark) {
  .grid-minor,
  .grid-inch-minor {
    stroke: var(--pattern-pack-grid-minor-dark, var(--pattern-pack-grid-minor, #242d39));
  }

  .grid-major,
  .grid-inch-major {
    stroke: var(--pattern-pack-grid-major-dark, var(--pattern-pack-grid-major, #3b4656));
  }
}
`;
let nextInchGridId = 0;

export class PatternPackBoard extends DraggableSvgBoard {
  static get observedAttributes() {
	return [
	  "endpoint",
	  "pack-options",
	  ...Object.keys(PACK_OPTION_ATTRIBUTES),
	  ...GRID_OPTION_ATTRIBUTES,
	];
  }

  constructor() {
	super();

		this._observer = null;
		this._syncTimer = null;
		this._isConnected = false;
		this._inchGridIdPrefix = `pattern-pack-inch-grid-${nextInchGridId++}`;
	
	// Grid-like layout options
	this.gap = 50;
	this.rightmostX = 0;
	
	
	this.shadowRoot.innerHTML = `
	  <style>
		.hidden {
		  display: none;
		}
	
		progress {
		  width: 100%;
		  margin: 0.5rem 0;
		}

		div {
		  overflow: auto;
		}
	  </style>
	
	  <div>
		<button id="syncBtn" type="button">Pack Garment Pattern Pieces</button>
		<progress class="loading hidden"></progress>
		<div class="content"></div>
		<p class="status"></p>
		<slot></slot>
	  </div>
	`;
	
	this.progressEl = this.shadowRoot.querySelector("progress");
	console.log("Progress bar element", this.progressEl)
	
	const syncBtn = this.shadowRoot.getElementById("syncBtn");
	
	syncBtn.addEventListener("click", async () => {
		try {
			const response = await this.syncNow();
			console.log("Sync complete", response);
		} catch (err) {
			console.error("Sync failed", err);
		}
	});
  }
  
	  /**
	* Measure all existing polygons and find the current rightmost occupied x.
	*/
	_initializeRightmostX() {
		const polygons = Array.from(this.svg.querySelectorAll('[role="stock"]'));
		console.log('These stock polygons', polygons)
		if (polygons.length === 0) {
			this.rightmostX = 0;
			return;
		}
		var rightmostX = 0;
		polygons.reduce((max, polygon) => {
			const box = polygon.getBBox();
			rightmostX += Math.max(max, box.x + box.width)
			console.log('Rightmost X is now', rightmostX)
			return rightmostX;
		}, 0);
		this.rightmostX += rightmostX
		
	}
	
	/**
	* Handle newly added nodes.
	* Supports direct polygon nodes and containers that may contain polygons.
	*
	* @param {Node} node
	*/
	_handleAddedNode(node) {
		if (!(node instanceof Element)) return;
		
		if (node.tagName?.toLowerCase() === "polygon" &&
		node.getAttribute("role") === "stock") {
			this._placePolygon(node);
			this._expandBoardBoundsToFitNode(node);
			return;
		}
		
		const polygons = node.querySelectorAll?.('polygon[role="stock"]');
		if (polygons && polygons.length > 0) {
			for (const polygon of polygons) {
				this._placePolygon(polygon);
			}
		}

		this._expandBoardBoundsToFitNode(node);
	}
	
	/**
	* Move a polygon so its left edge starts at the current rightmost x.
	* Then update rightmostX.
	*
	* @param {SVGPolygonElement} polygon
	*/
	_placePolygon(polygon) {
		console.log("Updating polygon..", polygon)
		console.log("Current rightmost x (starting point)", this.rightmostX)
		// Measure current box before translation.
		const box = polygon.getBBox();
		
		// Shift so the polygon's left edge lines up at rightmostX + gap.
		const targetX = this.rightmostX + this.gap;
		const dx = targetX - box.x;
		
		// Keep current y position unchanged.
		const dy = 0;
		
		// Replace any previous transform with this translate.
		polygon.setAttribute("transform", `translate(${dx}, ${dy})`);
		
		// Re-measure after moving so rightmostX is accurate.
		const newBox = polygon.getBBox();
		const shapeFurthestExtent = targetX + newBox.width
		console.log("Shape go this far", shapeFurthestExtent)
		const newRightmostX = Math.max(this.rightmostX, shapeFurthestExtent)
		console.log("Updating rightmostX", newRightmostX)
		this.rightmostX = newRightmostX;
	}
	
		connectedCallback() {
			console.log("PatternPackBoard Connected")
			super.connectedCallback?.();
			this._ensureRoleStrokeStyles();
			this._ensureInchGrid();
			
			if (this._isConnected) return;
		this._isConnected = true;
		
		this._initializeRightmostX()
		this._expandBoardBoundsToFitContent();
		
		this._startObserver();
	
		this._scheduleSync();
	}

  disconnectedCallback() {
	this._isConnected = false;

	if (this._observer) {
	  this._observer.disconnect();
	  this._observer = null;
	}

	if (this._syncTimer) {
	  clearTimeout(this._syncTimer);
	  this._syncTimer = null;
	}
	
	super.disconnectedCallback?.();
  }

  get endpoint() {
	const configuredEndpoint = this.getAttribute("endpoint");
	return configuredEndpoint === null
	  ? DEFAULT_PACKAIDE_ENDPOINT
	  : configuredEndpoint;
  }

	  set endpoint(value) {
		if (value === null || value === undefined) {
		  this.removeAttribute("endpoint");
		  return;
		}
	
		this.setAttribute("endpoint", String(value));
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

	  get gridSubdivisionsPerInch() {
		return Math.max(
		  1,
		  Math.round(
			this._positiveNumberAttribute(
			  "grid-subdivisions-per-inch",
			  DEFAULT_GRID_SUBDIVISIONS_PER_INCH,
			),
		  ),
		);
	  }

	  set gridSubdivisionsPerInch(value) {
		this._setOptionalNumberAttribute("grid-subdivisions-per-inch", value);
	  }

	  get gridMajorInches() {
		return this._positiveNumberAttribute(
		  "grid-major-inches",
		  DEFAULT_GRID_MAJOR_INCHES,
		);
	  }

	  set gridMajorInches(value) {
		this._setOptionalNumberAttribute("grid-major-inches", value);
	  }

		  attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue === newValue || !this.isConnected) return;

		if (GRID_OPTION_ATTRIBUTES.includes(name)) {
		  this._ensureInchGrid();
		  return;
		}

		this._scheduleSync();
	  }

  get board() {
	return this.shadowRoot.querySelector("draggable-svg-board");
  }

  getPayload() {
	const garmentNodes = this._roleNodes("garment");
	const stockNodes = this._roleNodes("stock");
	const stockSvgs = stockNodes
	  .map((node) => this._serializeAsStandaloneSvg([node]))
	  .filter(Boolean);
	const partsSvg = this._serializeAsStandaloneSvg(garmentNodes);
	
	console.log("Garment SVG", partsSvg)
	console.log("Stock SVGs", stockSvgs)
	
	const payload = {
		input: {
			...this._packOptions(),
		}
	};

	if (stockSvgs.length === 1) {
		payload.input.stock_svg = stockSvgs[0];
	} else if (stockSvgs.length > 1) {
		payload.input.stock_svgs = stockSvgs;
	}
	
	if (partsSvg) {
		payload.input.parts_svg = partsSvg;
	}
	
	console.log("Payload:", payload)
		
	return payload
	
  }

  async syncNow() {
	if (!this.endpoint) return null;

	this.progressEl.classList.remove("hidden");
	
	// Disable the mutation observer - to be reconnected upon calling connectedCalback
	const restoreObserver = Boolean(this._observer);
	if (this._observer) {
		this._observer.disconnect();
		this._observer = null;
	}

	try {
		const response = await fetch(this.endpoint, {
		  method: "POST",
		  headers: { 
			  "Content-Type": "application/json",
		  },
		  body: JSON.stringify(this.getPayload())
		});
	
		if (!response.ok) {
		  throw new Error(`Sync failed with status ${response.status}`);
		}
		
		// Apply the bins and the parts
		// Parse JSON body
		const data = await response.json();
		
		if (data.status == "IN_QUEUE") {
			console.log('In Queue... check again later. TODO')
			return response;
		}
		
		console.log("SVG Packing result:", data);
		
		const packOutput = this._packOutput(data);
		if (typeof window !== "undefined") {
			window.pack_output = packOutput;
		}
		
		const svgResults = this._svgResults(data);
		if (svgResults.length === 0) {
			throw new Error("Packaide response did not include an SVG.");
		}
		
		this._replaceBoardSvg(svgResults);
		
		super.connectedCallback?.();
	
		return response;
	} finally {
		this.progressEl.classList.add("hidden");
		if (restoreObserver && this.isConnected && !this._observer) {
			this._startObserver();
		}
	}
  }

  _shouldSync(records) {
	return records.some((record) =>
	  record.type === "childList" || record.type === "attributes"
	);
  }

  _scheduleSync() {
	return -1;
	if (!this.endpoint) return;

	if (this._syncTimer) {
	  clearTimeout(this._syncTimer);
	}

	this._syncTimer = setTimeout(() => {
	  this._syncTimer = null;
	  this.syncNow().catch((error) => {
		this.dispatchEvent(
		  new CustomEvent("sync-error", {
			detail: { error },
			bubbles: true,
			composed: true
		  })
		);
	  });
	}, 150);
	  }

  _startObserver() {
	if (this._observer) {
	  this._observer.disconnect();
	}

	this._observer = new MutationObserver((records) => {
		console.log("[PPB] Mutation seen!")
		for (const mutation of records) {
			for (const node of mutation.addedNodes) {
				this._handleAddedNode(node);
			}
		}
		
		// if (this._shouldSync(records)) {
		// 	this._scheduleSync();
		// }
	});

	this._observer.observe(this, {
	childList: true,
	subtree: true,
	attributes: true,
	attributeFilter: [
		"d",
		"points",
		"transform",
		"x",
		"y",
		"width",
		"height",
		"cx",
		"cy",
		"r",
		"role",
		"data-owner-control",
		"data-piece-kind",
		"data-owner-unit",
		"data-instance-id"
	]
	});
  }

	  _ensureRoleStrokeStyles() {
		if (!this.svg) return;
	
		const defs = this._ensureBoardDefs();
	let style = defs.querySelector(`style#${ROLE_STROKE_STYLE_ID}`);

	if (!style) {
	  style = document.createElementNS(SVG_NS, "style");
	  style.id = ROLE_STROKE_STYLE_ID;
	  style.setAttribute("data-pattern-pack-role-styles", "");
	  defs.insertBefore(style, defs.firstChild);
	}
	
		style.textContent = ROLE_STROKE_CSS;
	  }

	  _ensureInchGrid() {
		if (!this.svg) return;

		const defs = this._ensureBoardDefs();
		this._ensureInchGridStyles(defs);

		const minorId = `${this._inchGridIdPrefix}-minor`;
		const majorId = `${this._inchGridIdPrefix}-major`;
		const inchSize = MM_PER_INCH * this.boardPixelsPerMm;
		const minorSize = inchSize / this.gridSubdivisionsPerInch;
		const majorSize = inchSize * this.gridMajorInches;

		this._syncInchGridPattern({
		  defs,
		  id: minorId,
		  size: minorSize,
		  className: "grid-minor grid-inch-minor",
		  dataType: "minor",
		});
		this._syncInchGridPattern({
		  defs,
		  id: majorId,
		  size: majorSize,
		  className: "grid-major grid-inch-major",
		  dataType: "major",
		  fillPatternId: minorId,
		});

		const gridLayer = this._ensureInchGridLayer(majorId);
		const viewBox = this._currentBoardViewBox();

		if (viewBox) {
		  this._syncBoardLayerBounds(viewBox);
		}

		gridLayer.setAttribute(
		  "aria-label",
		  `One-inch grid, ${this._formatBoardNumber(inchSize)} board units per inch`,
		);
	  }

	  _ensureInchGridStyles(defs) {
		let style = defs.querySelector(`style#${INCH_GRID_STYLE_ID}`);

		if (!style) {
		  style = document.createElementNS(SVG_NS, "style");
		  style.id = INCH_GRID_STYLE_ID;
		  style.setAttribute("data-pattern-pack-inch-grid-styles", "");
		  defs.insertBefore(style, defs.firstChild);
		}

		style.textContent = INCH_GRID_CSS;
	  }

	  _syncInchGridPattern({
		defs,
		id,
		size,
		className,
		dataType,
		fillPatternId = "",
	  }) {
		let pattern = defs.querySelector(`pattern#${CSS.escape(id)}`);
		const formattedSize = this._formatBoardNumber(size);

		if (!pattern) {
		  pattern = document.createElementNS(SVG_NS, "pattern");
		  pattern.id = id;
		  defs.appendChild(pattern);
		}

		pattern.setAttribute("data-pattern-pack-inch-grid", dataType);
		pattern.setAttribute("width", formattedSize);
		pattern.setAttribute("height", formattedSize);
		pattern.setAttribute("patternUnits", "userSpaceOnUse");
		pattern.replaceChildren();

		if (fillPatternId) {
		  const fill = document.createElementNS(SVG_NS, "rect");
		  fill.setAttribute("width", formattedSize);
		  fill.setAttribute("height", formattedSize);
		  fill.setAttribute("fill", `url(#${fillPatternId})`);
		  pattern.appendChild(fill);
		}

		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("class", className);
		path.setAttribute("d", `M ${formattedSize} 0 H 0 V ${formattedSize}`);
		path.setAttribute("fill", "none");
		pattern.appendChild(path);
	  }

	  _ensureInchGridLayer(majorPatternId) {
		let gridLayer = this.svg.querySelector('rect[data-board-layer="grid"]');

		if (!gridLayer) {
		  gridLayer = document.createElementNS(SVG_NS, "rect");
		  gridLayer.setAttribute("data-board-layer", "grid");

		  const background = this.svg.querySelector("rect.board-background");
		  if (background?.nextSibling) {
			this.svg.insertBefore(gridLayer, background.nextSibling);
		  } else if (background) {
			this.svg.appendChild(gridLayer);
		  } else {
			const defs = this.svg.querySelector(":scope > defs");
			this.svg.insertBefore(gridLayer, defs ? defs.nextSibling : this.svg.firstChild);
		  }
		}

		gridLayer.setAttribute("data-pattern-pack-inch-grid-layer", "");
		gridLayer.setAttribute("fill", `url(#${majorPatternId})`);
		gridLayer.setAttribute("stroke", "none");
		gridLayer.setAttribute("pointer-events", "none");

		return gridLayer;
	  }
	
	  _ensureBoardDefs() {
		let defs = this.svg.querySelector(":scope > defs");

	if (!defs) {
	  defs = document.createElementNS(SVG_NS, "defs");
	  this.svg.insertBefore(defs, this.svg.firstChild);
	}

	return defs;
  }

  _expandBoardBoundsToFitContent() {
	const nodes = [
	  ...this._roleNodes("stock"),
	  ...this._roleNodes("garment"),
	];
	const bounds = nodes.reduce(
	  (combinedBounds, node) =>
		this._unionBounds(combinedBounds, this._svgElementBounds(node)),
	  null,
	);

	this._expandBoardViewBoxToBounds(bounds);
  }

  _expandBoardBoundsToFitNode(node) {
	if (!(node instanceof Element)) return;

	const nodes = this._boardBoundaryNodes(node);
	if (nodes.length === 0) return;

	const bounds = nodes.reduce(
	  (combinedBounds, boundaryNode) =>
		this._unionBounds(
		  combinedBounds,
		  this._svgElementBounds(boundaryNode),
		),
	  null,
	);

	this._expandBoardViewBoxToBounds(bounds);
  }

  _boardBoundaryNodes(node) {
	if (
	  node.matches?.('[role="stock"], [role="garment"]') ||
	  node.getAttribute?.("data-draggable") === "true"
	) {
	  return [node];
	}

	return Array.from(
	  node.querySelectorAll?.('[role="stock"], [role="garment"], [data-draggable="true"]') || [],
	).filter(
	  (boundaryNode) =>
		!boundaryNode.parentElement?.closest?.(
		  '[role="stock"], [role="garment"], [data-draggable="true"]',
		),
	);
  }

  _expandBoardViewBoxToBounds(bounds) {
	if (!bounds || !this.svg) return;

	const current = this._currentBoardViewBox();
	if (!current) return;

	const currentMaxX = current.x + current.width;
	const currentMaxY = current.y + current.height;
	const boundsMaxX = bounds.x + bounds.width;
	const boundsMaxY = bounds.y + bounds.height;
	const minX =
	  bounds.x < current.x ? bounds.x - BOARD_BOUNDS_PADDING : current.x;
	const minY =
	  bounds.y < current.y ? bounds.y - BOARD_BOUNDS_PADDING : current.y;
	const maxX =
	  boundsMaxX > currentMaxX ? boundsMaxX + BOARD_BOUNDS_PADDING : currentMaxX;
	const maxY =
	  boundsMaxY > currentMaxY ? boundsMaxY + BOARD_BOUNDS_PADDING : currentMaxY;
	const next = {
	  x: minX,
	  y: minY,
	  width: maxX - minX,
	  height: maxY - minY,
	};

	if (!this._viewBoxChanged(current, next)) return;

	this.svg.setAttribute("viewBox", this._formatViewBox(next));
	this.svg.setAttribute("width", this._formatBoardNumber(next.width));
	this.svg.setAttribute("height", this._formatBoardNumber(next.height));
	this.svg.style.width = `${this._formatBoardNumber(next.width)}px`;
	this.svg.style.height = `${this._formatBoardNumber(next.height)}px`;
	this._syncBoardLayerBounds(next);
  }

  _currentBoardViewBox() {
	const viewBox = this.svg.getAttribute("viewBox");
	const values = viewBox
	  ?.trim()
	  .split(/[\s,]+/)
	  .map((value) => Number.parseFloat(value));

	if (values?.length === 4 && values.every(Number.isFinite)) {
	  return {
		x: values[0],
		y: values[1],
		width: values[2],
		height: values[3],
	  };
	}

	const width = Number.parseFloat(this.svg.getAttribute("width")) || 1000;
	const height = Number.parseFloat(this.svg.getAttribute("height")) || 800;

	return {
	  x: 0,
	  y: 0,
	  width,
	  height,
	};
  }

  _viewBoxChanged(current, next) {
	return (
	  Math.abs(current.x - next.x) > 0.001 ||
	  Math.abs(current.y - next.y) > 0.001 ||
	  Math.abs(current.width - next.width) > 0.001 ||
	  Math.abs(current.height - next.height) > 0.001
	);
  }

  _syncBoardLayerBounds(viewBox) {
	this.svg
	  .querySelectorAll("rect.board-background, rect[data-board-layer]")
	  .forEach((rect) => {
		rect.setAttribute("x", this._formatBoardNumber(viewBox.x));
		rect.setAttribute("y", this._formatBoardNumber(viewBox.y));
		rect.setAttribute("width", this._formatBoardNumber(viewBox.width));
		rect.setAttribute("height", this._formatBoardNumber(viewBox.height));
	  });
  }

  _svgElementBounds(element) {
	if (typeof element.getBBox !== "function") return null;

	try {
	  const box = element.getBBox();
	  if (
		!Number.isFinite(box.x) ||
		!Number.isFinite(box.y) ||
		!Number.isFinite(box.width) ||
		!Number.isFinite(box.height)
	  ) {
		return null;
	  }

	  const matrix = this._combinedSvgTransform(element);
	  return this._transformedBounds(box, matrix);
	} catch {
	  return null;
	}
  }

  _combinedSvgTransform(element) {
	const chain = [];

	for (
	  let node = element;
	  node instanceof SVGElement;
	  node = node.parentElement
	) {
	  chain.unshift(node);

	  if (node === this.svg) {
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
	].map((point) => this._transformPoint(point, matrix));

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

  _transformPoint(point, matrix) {
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

  _formatViewBox(viewBox) {
	return [
	  viewBox.x,
	  viewBox.y,
	  viewBox.width,
	  viewBox.height,
	]
	  .map((value) => this._formatBoardNumber(value))
	  .join(" ");
  }

  _formatBoardNumber(value) {
	const rounded = Math.abs(value) < 0.0001 ? 0 : Number(value.toFixed(4));
	return String(rounded);
  }

  _serializeAsStandaloneSvg(sourceNodes) {
	if (sourceNodes.length === 0) {
	  return null;
	}

	const svg = document.createElementNS(SVG_NS, "svg");
	
	const standard_width = 1000
	const standard_height = 800
	const boardSvg = this.querySelector("svg");
	const viewBox = boardSvg?.getAttribute("viewBox");
	const width = boardSvg?.getAttribute("width") || this._viewBoxDimension(viewBox, 2) || standard_width;
	const height = boardSvg?.getAttribute("height") || this._viewBoxDimension(viewBox, 3) || standard_height;
	svg.setAttribute("width", width);
	svg.setAttribute("height", height);
	
	svg.setAttribute("xmlns", SVG_NS);
	svg.setAttribute(
	  "viewBox",
	  viewBox || this.getAttribute("viewBox") || `0 0 ${standard_width} ${standard_height}`
	);
	
	for (var sourceNode of sourceNodes) {
		svg.appendChild(sourceNode.cloneNode(true));
	}
		
	return new XMLSerializer().serializeToString(svg);
  }

  _roleNodes(role) {
	return Array.from(this.querySelectorAll(`[role="${role}"]`)).filter(
	  (node) => !node.parentElement?.closest(`[role="${role}"]`)
	);
  }

  _packOptions() {
	const options = { ...DEFAULT_PACK_OPTIONS };
	const packOptions = this.getAttribute("pack-options");

	if (packOptions) {
	  Object.assign(options, JSON.parse(packOptions));
	}

	for (const [attribute, optionName] of Object.entries(PACK_OPTION_ATTRIBUTES)) {
	  if (!this.hasAttribute(attribute)) continue;

	  const value = this.getAttribute(attribute);
	  options[optionName] = BOOLEAN_PACK_OPTIONS.has(optionName)
		? this._booleanAttributeValue(value)
		: Number(value);
	}

	return options;
  }

	  _booleanAttributeValue(value) {
		if (value === "" || value === null) {
		  return true;
		}
	
		return !["0", "false", "no"].includes(String(value).toLowerCase());
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
	
	  _viewBoxDimension(viewBox, index) {
		if (!viewBox) {
		  return null;
	}

	const value = Number(viewBox.trim().split(/[\s,]+/)[index]);
	return Number.isFinite(value) ? value : null;
  }

  _packOutput(data) {
	if (data?.output && (data.output.svg || data.output.outputs || data.output.garment_marker)) {
	  return data.output;
	}

	return data;
  }

  _svgResult(data) {
	const [firstSvgResult] = this._svgResults(data);
	return firstSvgResult || null;
  }

  _svgResults(data) {
	const output = this._packOutput(data);

	if (typeof output?.svg === "string") {
	  return [output.svg];
	}

	if (Array.isArray(output?.outputs)) {
	  return output.outputs
		.filter((result) => typeof result?.svg === "string")
		.map((result) => result.svg);
	}

	if (typeof output?.garment_marker === "string") {
	  return [output.garment_marker];
	}

	return [];
  }

  _replaceBoardSvg(svgResult) {
	const parsedSvgs = (Array.isArray(svgResult) ? svgResult : [svgResult])
	  .map((svgText) => this._parsePackedSvg(svgText));
	const parsedSvg = parsedSvgs[0];

	const currentSvg = this.querySelector("svg");
	if (currentSvg) {
		const preservedNodes = this._preservedBoardNodes(currentSvg);
		const garmentMetadata = this._pieceMetadataQueue("garment");
		const importedNodes = parsedSvgs.flatMap((resultSvg) =>
		  Array.from(resultSvg.childNodes)
			.map((node) => document.importNode(node, true))
			.filter((node) => !this._isBlockedImportedSvgNode(node))
		);

		this._copyPackedSvgRootAttributes(parsedSvg, currentSvg);
		this._normalizePackedGarments(importedNodes, garmentMetadata);
			currentSvg.replaceChildren(...preservedNodes, ...importedNodes);
			this.svg = currentSvg;
			this._ensureRoleStrokeStyles();
			this._ensureInchGrid();
		} else {
			const svgElement = document.importNode(parsedSvg, true);
			svgElement.setAttribute("id", svgElement.getAttribute("id") || "board");
			svgElement.setAttribute("xmlns", SVG_NS);
			this.appendChild(svgElement);
			this.svg = svgElement;
			this._ensureRoleStrokeStyles();
			this._ensureInchGrid();
		}
	  }

  _parsePackedSvg(svgResult) {
	let svgText = svgResult;
	if (!svgText.includes('xmlns=')) {
	  svgText = svgText.replace(
		"<svg",
		'<svg xmlns="http://www.w3.org/2000/svg"'
	  );
	}
	
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgText, "image/svg+xml");
	
	const parserError = doc.querySelector("parsererror");
	
	if (parserError || doc.documentElement?.localName !== "svg") {
	  console.error("SVG parse error:", parserError?.textContent);
	  console.log("Raw SVG result:", svgText);
	  throw new Error("Packaide response did not include a valid SVG.");
	}
	else {
		console.log('No errors parsing the SVG..')
	}
	
	return doc.documentElement;
  }

  _copyPackedSvgRootAttributes(sourceSvg, targetSvg) {
	const id = targetSvg.getAttribute("id") || sourceSvg.getAttribute("id") || "board";

	for (const attribute of SVG_ROOT_RESULT_ATTRIBUTES) {
	  if (sourceSvg.hasAttribute(attribute)) {
		targetSvg.setAttribute(attribute, sourceSvg.getAttribute(attribute));
	  }
	}

	targetSvg.setAttribute("id", id);
	targetSvg.setAttribute("xmlns", SVG_NS);
  }

  _preservedBoardNodes(svg) {
	return Array.from(svg.childNodes).filter((node) =>
	  node instanceof Element && this._isPersistentBoardNode(node)
	);
  }

  _isPersistentBoardNode(node) {
	if (node.localName === "defs") {
	  return true;
	}

	if (
	  node.matches?.("[data-board-layer], .board-background, .grid-minor, .grid-major")
	) {
	  return true;
	}

	if (
	  node.matches?.("[role], [data-draggable], [data-owner-control], [data-piece-kind]")
	) {
	  return false;
	}

	return !node.querySelector?.(
	  "[role], [data-draggable], [data-owner-control], [data-piece-kind]"
	);
  }

  _pieceMetadataQueue(role) {
	const seen = new Set();

	return this._roleNodes(role)
	  .map((roleNode) => {
		const ownerNode = roleNode.closest?.("[data-owner-control][data-piece-kind]");
		const sourceNode = ownerNode || roleNode;

		if (!sourceNode || seen.has(sourceNode)) {
		  return null;
		}

		seen.add(sourceNode);

		return {
		  ownerControl: sourceNode.getAttribute("data-owner-control"),
		  pieceKind: sourceNode.getAttribute("data-piece-kind"),
		  ownerUnit: sourceNode.getAttribute("data-owner-unit"),
		  instanceId: sourceNode.getAttribute("data-instance-id"),
		};
	  })
	  .filter((metadata) =>
		metadata?.ownerControl ||
		metadata?.pieceKind ||
		metadata?.ownerUnit ||
		metadata?.instanceId
	  );
  }

  _normalizePackedGarments(nodes, metadataQueue) {
	let metadataIndex = 0;

	for (const node of nodes) {
	  if (!(node instanceof Element)) continue;

	  const candidates = this._packedGarmentCandidates(node);

	  for (const candidate of candidates) {
		const metadata = metadataQueue[metadataIndex++] || {};
		this._markPackedGarment(candidate, metadata);
	  }
	}
  }

  _packedGarmentCandidates(node) {
	if (this._isBlockedSvgNode(node) || node.closest?.('[role="stock"]')) {
	  return [];
	}

	if (node.getAttribute("role") === "stock") {
	  return [];
	}

	if (
	  node.getAttribute("role") === "garment" ||
	  node.getAttribute("data-draggable") === "true" ||
	  this._isSvgGraphicElement(node)
	) {
	  return [node];
	}

	if (
	  node.localName === "g" &&
	  !node.querySelector('[role="stock"]') &&
	  node.querySelector(SVG_GRAPHIC_SELECTOR)
	) {
	  return [node];
	}

	return Array.from(node.children || []).flatMap((child) =>
	  this._packedGarmentCandidates(child)
	);
  }

  _markPackedGarment(node, metadata) {
	node.setAttribute("role", "garment");
	node.setAttribute("data-draggable", "true");
	node.setAttribute("pointer-events", "all");

	if (metadata.ownerControl) {
	  node.setAttribute("data-owner-control", metadata.ownerControl);
	}

	if (metadata.pieceKind) {
	  node.setAttribute("data-piece-kind", metadata.pieceKind);
	}

	if (metadata.ownerUnit) {
	  node.setAttribute("data-owner-unit", metadata.ownerUnit);
	}

	if (metadata.instanceId) {
	  node.setAttribute("data-instance-id", metadata.instanceId);
	}
  }

  _isSvgGraphicElement(node) {
	return SVG_GRAPHIC_TAGS.has(node.localName);
  }

  _isBlockedSvgNode(node) {
	return node instanceof Element && SVG_NON_DRAWING_TAGS.has(node.localName);
  }

  _isBlockedImportedSvgNode(node) {
	return node instanceof Element && SVG_BLOCKED_IMPORT_TAGS.has(node.localName);
  }
}

if (!customElements.get("pattern-pack-board")) {
  customElements.define("pattern-pack-board", PatternPackBoard);
}
