// src/PatternPackBoard.js

import DraggableSvgBoard from "/node_modules/draggable-svg-html-element/src/DraggableSvgBoard.js";

const SVG_NS = "http://www.w3.org/2000/svg";
export const DEFAULT_PACKAIDE_ENDPOINT =
  "https://secure-refuge-29958-07dfc33a91ee.herokuapp.com/proxy/";
const DEFAULT_PACK_OPTIONS = {
  tolerance: 0.03,
  offset: 0,
  rotations: 1,
  persist: false,
};
const PACK_OPTION_ATTRIBUTES = {
  "include-stock": "include_stock",
  offset: "offset",
  "partial-solution": "partial_solution",
  persist: "persist",
  rotations: "rotations",
  "stock-inset": "stock_inset",
  tolerance: "tolerance",
};
const BOOLEAN_PACK_OPTIONS = new Set([
  "include_stock",
  "partial_solution",
  "persist",
]);

export class PatternPackBoard extends DraggableSvgBoard {
  static get observedAttributes() {
	return ["endpoint", "pack-options", ...Object.keys(PACK_OPTION_ATTRIBUTES)];
  }

  constructor() {
	super();

	this._observer = null;
	this._syncTimer = null;
	this._isConnected = false;
	
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
			return;
		}
		
		const polygons = node.querySelectorAll?.('polygon[role="stock"]');
		if (polygons && polygons.length > 0) {
			for (const polygon of polygons) {
				this._placePolygon(polygon);
			}
		}
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
		
		if (this._isConnected) return;
		this._isConnected = true;
		
		this._initializeRightmostX()
		
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

	  attributeChangedCallback(name, oldValue, newValue) {
	if (oldValue !== newValue && this.isConnected) {
	  this._scheduleSync();
	}
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
		
		const svgResult = this._svgResult(data);
		if (!svgResult) {
			throw new Error("Packaide response did not include an SVG.");
		}
		
		this._replaceBoardSvg(svgResult);
		
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
		"data-instance-id"
	]
	});
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
	const output = this._packOutput(data);

	if (typeof output?.svg === "string") {
	  return output.svg;
	}

	if (Array.isArray(output?.outputs)) {
	  const firstOutputWithSvg = output.outputs.find(
		(result) => typeof result?.svg === "string"
	  );
	  return firstOutputWithSvg?.svg || null;
	}

	if (typeof output?.garment_marker === "string") {
	  return output.garment_marker;
	}

	return null;
  }

  _replaceBoardSvg(svgResult) {
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
	
	const parsedSvg = doc.documentElement;

	// Import into the current HTML document
	const svgElement = document.importNode(parsedSvg, true);
	svgElement.setAttribute("id", "board")
	
	console.log('About to replace', this.querySelector("svg"), svgElement)
	const currentSvg = this.querySelector("svg");
	if (currentSvg) {
		currentSvg.replaceWith(svgElement);
	} else {
		this.appendChild(svgElement);
	}
  }
}

if (!customElements.get("pattern-pack-board")) {
  customElements.define("pattern-pack-board", PatternPackBoard);
}
