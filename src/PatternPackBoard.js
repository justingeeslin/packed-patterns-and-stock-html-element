// src/PatternPackBoard.js

import DraggableSvgBoard from "/node_modules/draggable-svg-html-element/src/DraggableSvgBoard.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export class PatternPackBoard extends DraggableSvgBoard {
  static get observedAttributes() {
	return [];
  }

  constructor() {
	super();

	this._observer = null;
	this._syncTimer = null;
	this._isConnected = false;
	
	this.endpoint = "https://secure-refuge-29958-07dfc33a91ee.herokuapp.com/proxy/"
	
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

  attributeChangedCallback(name, oldValue, newValue) {
	if (name === "endpoint" && oldValue !== newValue && this.isConnected) {
	  this._scheduleSync();
	}
  }

  get board() {
	return this.shadowRoot.querySelector("draggable-svg-board");
  }

  getPayload() {
	const garmentSvgs = this._serializeAsStandaloneSvg(Array.from(
		this.querySelectorAll('[role="garment"]'))
	)
	
	const stockSvgs = this._serializeAsStandaloneSvg(Array.from(
		this.querySelectorAll('[role="stock"]')
	))
	
	console.log("Garment SVGS", garmentSvgs)
	console.log("Stock SVGS", stockSvgs)
	
	var payload = {
		"id":"packboard",
		"input": {}
	}

	if (stockSvgs[0] !== null) {
		payload.input.stock = stockSvgs
	}
	
	if (garmentSvgs[0] !== null) {
		payload.input.parts = garmentSvgs
	}
	
	console.log("Payload:", payload)
		
	return payload
	
  }

  async syncNow() {
	if (!this.endpoint) return null;

	this.progressEl.classList.remove("hidden");
	
	// Disable the mutation observer - to be reconnected upon calling connectedCalback
	this._observer.disconnect();
	this._observer = null;

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
	
	this.progressEl.classList.add("hidden");
	
	// Apply the bins and the parts
	// Parse JSON body
	const data = await response.json();
	
	if (data.status == "IN_QUEUE") {
		console.log('In Queue... check again later. TODO')
	}
	
	console.log("SVG Packing result:", data);
	
	// Debug
	window.pack_output = data.output
	
	var svgResult = data.output.garment_marker;
	
	if (!svgResult.includes('xmlns=')) {
	  svgResult = svgResult.replace(
		"<svg",
		'<svg xmlns="http://www.w3.org/2000/svg"'
	  );
	}
	
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgResult, "image/svg+xml");
	
	const parserError = doc.querySelector("parsererror");
	
	if (parserError) {
	
	  console.error("SVG parse error:", parserError.textContent);
	
	  console.log("Raw SVG result:", svgResult);
	
	  return;
	
	}
	else {
		console.log('No errors parsing the SVG..')
	}
	
	const parsedSvg = doc.documentElement;

	// Import into the current HTML document
	const svgElement = document.importNode(parsedSvg, true);
	svgElement.setAttribute("id", "board")
	
	const garment_pieces = svgElement.querySelectorAll("path, polygon");
	
	// garment_pieces.forEach(el => {
	// 	console.log('Setting draggable to true..', el, el.dataset)
	//   el.dataset.draggable = "true";
	//   el.setAttribute("pointer-events", "all");
	// });

	// console.log('About to replace: But first this', this)
	console.log('About to replace', this.querySelector("svg"), svgElement)
	// And the draggable wrapper to the packboard
	this.querySelector("svg").replaceWith(svgElement);
	
	// console.log("Appending SVG element to the body")
	// // console.log(svgElement instanceof SVGElement);
	// // console.log(svgElement instanceof HTMLElement);
	// 
	// console.log("SVGElement constructor name", svgElement.constructor.name);
	// 
	// console.log(svgElement instanceof SVGSVGElement);
	// 
	// console.log(svgElement.namespaceURI);
	// 
	// 
	// 
	// document.body.appendChild(svgElement);
	// this.appendChild(svgElement)
	
	super.connectedCallback?.();

	return response;
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

  _serializeAsStandaloneSvg(sourceNodes) {
	const svg = document.createElementNS(SVG_NS, "svg");
	
	const standard_width = 1000
	const standard_height = 800
	svg.setAttribute("width", standard_width);
	svg.setAttribute("height", standard_height);
	
	svg.setAttribute("xmlns", SVG_NS);
	svg.setAttribute(
	  "viewBox",
	  this.getAttribute("viewBox") || `0 0 ${standard_width} ${standard_height}`
	);
	
	for (var sourceNode of sourceNodes) {
		svg.appendChild(sourceNode.cloneNode(true));
	}
		
	return new XMLSerializer().serializeToString(svg);
  }
}

if (!customElements.get("pattern-pack-board")) {
  customElements.define("pattern-pack-board", PatternPackBoard);
}