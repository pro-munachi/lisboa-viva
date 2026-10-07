import { Vector3 } from "three";

// Original 24px drawings, shared by street places and room activities.
const ICONS = {
  cafe: [
    "M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z",
    "M16 9h2a3 3 0 0 1 0 6h-2M3 21h16M8 5V2m5 3V2",
  ],
  restaurant: [
    "M10 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0M3 3v6m3-6v6M3 7h3m-1.5 2v12M21 3v5",
  ],
  gym: ["M7 12h10M4 7v10m3-12v14m10-14v14m3-12v10M3 9h4m10 0h4M3 15h4m10 0h4"],
  shop: ["M4 8h16l-1 13H5ZM8 8V6a4 4 0 0 1 8 0v2"],
  bar: ["M4 4h16l-8 9Zm8 9v8m-4 0h8M15 4l3-2"],
  museum: ["M3 8 12 3l9 5ZM5 11v8m7-8v8m7-8v8M3 21h18M3 9h18"],
  culture: ["M4 4h16v16H4ZM7 15l4-5 3 3 3-4M16 7h.01"],
  landmark: ["M4 21V9l8-6 8 6v12M9 21v-7a3 3 0 0 1 6 0v7M4 10h16M8 7h8"],
  viewpoint: [
    "M2 19 8 11l4 5 3-4 7 7M2 21h20M15 6a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  ],
  transport: [
    "M6 3h12a2 2 0 0 1 2 2v13H4V5a2 2 0 0 1 2-2ZM4 11h16M12 3v8M7 15h.01m10 0h.01M7 18l-2 3m12-3 2 3",
  ],
  custom: ["M18 9c0 5-6 12-6 12S6 14 6 9a6 6 0 1 1 12 0ZM10 9h4m-2-2v4"],
  market: ["M3 9h18l-2 12H5ZM7 9l5-7 5 7M8 13v4m4-4v4m4-4v4"],
  street: ["M5 3v18m14-18v18M12 3v3m0 4v4m0 4v3M3 8h4m10 8h4"],
  rest: ["M6 10V5h12v5M4 10h4v5h8v-5h4v9H4ZM6 19v2m12-2v2"],
  kitchen: [
    "M5 9h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3ZM3 9h18M8 6h8M12 6V4M2 13h3m14 0h3",
  ],
  plan: ["M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16M11 10l2 3m-2 0 2-3"],
  pastry: ["M4 15c0-4 3-9 8-9s8 5 8 9l-4 3-4-2-4 2ZM8 8l2 7m6-7-2 7M3 21h18"],
  table: ["M4 9h16M7 9v12m10-12v12M9 6h6M2 15h3v6m17-6h-3v6"],
  treadmill: [
    "M4 18h15l2 3H2Zm13-1V6h4M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4M11 9l-3 3 4 2-1 3m0-8 4 3h3",
  ],
  stretch: [
    "M10 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0M12 8v7M5 5l7 5 7-5M12 15l-5 6m5-6 5 6",
  ],
  browse: ["M4 21V3h16v18M4 5h16M8 6v3l-3 3h14l-3-3V6M9 12v6h6v-6"],
  "try-on": [
    "M5 3h14v18H5ZM9 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0M8 18v-3a4 4 0 0 1 8 0v3M3 21h18",
  ],
  counter: ["M3 10h18M5 10v11h14V10M8 6h3V3H8ZM15 10V6h4v4M5 15h14"],
  gallery: ["M3 3h18v18H3ZM6 17l5-6 4 4 3-4M16 7h.01"],
  tiles: [
    "M12 2l5 5-5 5-5-5Zm-5 5-5 5 5 5 5-5Zm5 5 5 5-5 5-5-5Zm5-5 5 5-5 5-5-5Z",
  ],
  bench: ["M4 6h16v7H4ZM3 16h18M6 16v5m12-5v5M7 6v7m5-7v7m5-7v7"],
  listen: [
    "M9 17V5l11-2v12M9 17a3 3 0 1 1-3-3c2 0 3 1 3 3Zm11-2a3 3 0 1 1-3-3c2 0 3 1 3 3ZM9 8l11-2",
  ],
  lounge: ["M5 11V5h14v6M3 11h5v5h8v-5h5v9H3ZM6 20v2m12-2v2"],
  card: ["M3 5h18v14H3ZM3 9h18M6 14h4m5 1h3"],
  "check-in": [
    "M8 5h8v16H8ZM10 5V2h4v3M2 12h5m-2-2 2 2-2 2M17 12h5m-2-2 2 2-2 2M10 17h4",
  ],
  gate: ["M4 21V3h16v18M7 21h10M8 10l4-3 4 3M12 7v8m-2-2 2 2 2-2"],
  tickets: [
    "M3 5h18v4a3 3 0 0 0 0 6v4H3v-4a3 3 0 0 0 0-6ZM15 6v2m0 3v2m0 3v2M7 9h4m-4 5h4",
  ],
  timetable: ["M4 3h16v18H4ZM7 7h6m-6 4h4m-4 4h6M16 8v5l2 1"],
  board: ["M3 12h11m-4-4 4 4-4 4M17 3h4v18h-4M17 6h4m-4 12h4"],
};
ICONS.espresso = ICONS.cafe;
ICONS.weights = ICONS.gym;
ICONS.platform = [...ICONS.transport, "M2 23h20"];

const TONES = {
  cafe: "ochre",
  restaurant: "ochre",
  espresso: "ochre",
  pastry: "ochre",
  kitchen: "ochre",
  rest: "ochre",
  table: "ochre",
  lounge: "ochre",
  gym: "sage",
  treadmill: "sage",
  weights: "sage",
  stretch: "sage",
  custom: "sage",
  shop: "rose",
  browse: "rose",
  "try-on": "rose",
  bar: "rose",
  listen: "rose",
  counter: "rose",
  market: "ochre",
  street: "rose",
  card: "ochre",
  "check-in": "ochre",
  board: "sage",
};

/** Project a world anchor into CSS pixels. Call after camera matrices update. */
export function projectBadgePosition(
  position,
  camera,
  { width, height, padding = 22 },
) {
  if (
    !position ||
    !camera ||
    ![position.x, position.y, position.z, width, height, padding].every(
      Number.isFinite,
    ) ||
    padding < 0 ||
    width < padding * 2 ||
    height < padding * 2
  )
    return null;
  const view = new Vector3()
    .copy(position)
    .applyMatrix4(camera.matrixWorldInverse);
  const depth = -view.z;
  if (depth <= 0 || depth < camera.near || depth > camera.far) return null;
  const clip = new Vector3().copy(position).project(camera);
  if (
    ![clip.x, clip.y, clip.z].every(Number.isFinite) ||
    clip.z < -1 ||
    clip.z > 1
  )
    return null;
  const x = ((clip.x + 1) / 2) * width;
  const y = ((1 - clip.y) / 2) * height;
  if (x < padding || x > width - padding || y < padding || y > height - padding)
    return null;
  return { x, y, depth };
}

/** Fixed-size targets keep their spacing regardless of city zoom.
 * @param {{id:string, x:number, y:number, depth?:number}[]} candidates
 * @param {{width:number, height:number, size?:number, gap?:number, selectedId?:string|null, focusedId?:string|null}} options
 */
export function declutterBadgePositions(
  candidates,
  { width, height, size = 44, gap = 8, selectedId = null, focusedId = null },
) {
  if (
    ![width, height, size, gap].every(Number.isFinite) ||
    size <= 0 ||
    gap < 0
  )
    return [];
  const half = size / 2;
  const priority = (item) =>
    item.id === focusedId ? 0 : item.id === selectedId ? 1 : 2;
  const depth = (item) => (Number.isFinite(item.depth) ? item.depth : Infinity);
  const sorted = candidates
    .filter(
      (item) =>
        typeof item.id === "string" &&
        item.id &&
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        item.x >= half &&
        item.x <= width - half &&
        item.y >= half &&
        item.y <= height - half,
    )
    .slice()
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        (depth(a) !== depth(b) ? depth(a) - depth(b) : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
        a.x - b.x ||
        a.y - b.y,
    );
  const kept = [];
  const ids = new Set();
  for (const item of sorted) {
    if (ids.has(item.id)) continue;
    if (
      kept.some(
        (other) =>
          Math.abs(item.x - other.x) < size + gap &&
          Math.abs(item.y - other.y) < size + gap,
      )
    )
      continue;
    ids.add(item.id);
    kept.push(item);
  }
  return kept;
}

function createGlyph(doc, category) {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "roam-badge-glyph");
  for (const d of ICONS[category] || ICONS.custom) {
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** A non-React overlay; callers own world positions and selection behavior. */
export function createHotspotBadgeLayer(host, { onSelect } = {}) {
  const doc = host.ownerDocument;
  const element = doc.createElement("div");
  element.className = "roam-badge-layer";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "Interactive places");
  host.appendChild(element);
  const records = new Map();
  const heldActivationKeys = new Set();
  let disposed = false;

  function consumeActivationRelease(event) {
    if (!heldActivationKeys.delete(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function consumeActivationRepeat(event) {
    if (!heldActivationKeys.has(event.key)) return;
    if (!event.repeat) {
      heldActivationKeys.delete(event.key);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  // A selection can move focus into a dialog before the key is released.
  // Consume that release at the document, before the new target receives it.
  doc.addEventListener?.("keyup", consumeActivationRelease, true);
  doc.addEventListener?.("keydown", consumeActivationRepeat, true);

  function createRecord(item) {
    const anchor = doc.createElement("div");
    anchor.className = "roam-badge-anchor";
    anchor.hidden = true;
    const button = doc.createElement("button");
    button.className = "roam-badge-button";
    button.type = "button";
    button.setAttribute("data-hotspot-id", item.id);
    button.setAttribute("aria-pressed", "false");
    const tile = doc.createElement("span");
    tile.className = "roam-badge-tile";
    const label = doc.createElement("span");
    label.className = "roam-badge-label";
    button.appendChild(tile);
    button.appendChild(label);
    anchor.appendChild(button);
    element.appendChild(anchor);
    const record = {
      anchor,
      button,
      tile,
      label,
      item,
      category: null,
      selected: false,
      transform: "",
    };
    let down = null,
      dragged = false;
    const stop = (event) => event.stopPropagation();
    const moved = (event) => {
      stop(event);
      if (
        down &&
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7
      )
        dragged = true;
    };
    button.addEventListener("pointerdown", (event) => {
      stop(event);
      down = { x: event.clientX, y: event.clientY };
      dragged = false;
      if (Number.isFinite(event.pointerId))
        button.setPointerCapture?.(event.pointerId);
    });
    button.addEventListener("pointermove", moved);
    button.addEventListener("pointerup", (event) => {
      moved(event);
      down = null;
    });
    button.addEventListener("pointercancel", (event) => {
      stop(event);
      down = null;
      dragged = true;
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        stop(event);
        if (event.repeat || button.disabled) return;
        down = null;
        dragged = false;
        heldActivationKeys.add(event.key);
        button.click();
      }
    });
    button.addEventListener("keyup", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      stop(event);
      heldActivationKeys.delete(event.key);
    });
    button.addEventListener("click", (event) => {
      stop(event);
      event.preventDefault();
      if (
        disposed ||
        records.get(record.item.id) !== record ||
        button.disabled ||
        (dragged && event.detail !== 0)
      )
        return;
      onSelect?.(record.item.value);
    });
    return record;
  }

  function setItems(items) {
    if (disposed) return;
    const valid = new Map();
    for (const item of items || []) {
      if (
        typeof item?.id !== "string" ||
        !item.id ||
        valid.has(item.id) ||
        !item.position ||
        ![item.position.x, item.position.y, item.position.z].every(
          Number.isFinite,
        )
      )
        continue;
      valid.set(item.id, item);
    }
    for (const [id, record] of records) {
      if (valid.has(id)) continue;
      record.anchor.remove();
      records.delete(id);
    }
    for (const [id, item] of valid) {
      let record = records.get(id);
      if (!record) {
        record = createRecord(item);
        records.set(id, record);
      }
      record.item = item;
      const category =
        typeof item.category === "string" && Object.hasOwn(ICONS, item.category)
          ? item.category
          : "custom";
      if (category !== record.category) {
        record.tile.replaceChildren(createGlyph(doc, category));
        record.category = category;
        record.button.setAttribute("data-tone", TONES[category] || "blue");
      }
      const name =
        typeof item.name === "string" ? item.name.trim().slice(0, 140) : "";
      const accessibleName = name || "Explore this place";
      if (record.label.textContent !== accessibleName)
        record.label.textContent = accessibleName;
      if (record.button.getAttribute("aria-label") !== accessibleName)
        record.button.setAttribute("aria-label", accessibleName);
    }
  }

  /** @param {any} camera
   * @param {{width:number, height:number, visible?:boolean, selectedId?:string|null, disabled?:boolean}} options
   */
  function update(
    camera,
    { width, height, visible = true, selectedId = null, disabled = false },
  ) {
    if (disposed) return;
    if (element.hidden === visible) element.hidden = !visible;
    if (!visible) return;
    camera.updateMatrixWorld();
    let focusedId = null;
    const candidates = [];
    for (const [id, record] of records) {
      if (record.button.disabled !== disabled)
        record.button.disabled = disabled;
      if (doc.activeElement === record.button) focusedId = id;
      const projected = projectBadgePosition(record.item.position, camera, {
        width,
        height,
      });
      if (projected) candidates.push({ id, ...projected });
      const selected = id === selectedId;
      if (selected !== record.selected) {
        record.selected = selected;
        record.button.setAttribute("aria-pressed", String(selected));
      }
    }
    const kept = declutterBadgePositions(candidates, {
      width,
      height,
      selectedId,
      focusedId,
    });
    const keptIds = new Set(kept.map((item) => item.id));
    for (const [id, record] of records) {
      const hidden = !keptIds.has(id);
      if (record.anchor.hidden !== hidden) record.anchor.hidden = hidden;
    }
    for (const item of kept) {
      const record = records.get(item.id);
      const transform = `translate3d(${(item.x - 22).toFixed(2)}px, ${(item.y - 22).toFixed(2)}px, 0)`;
      if (transform !== record.transform) {
        record.anchor.style.transform = transform;
        record.transform = transform;
      }
      const zIndex =
        item.id === focusedId ? "3" : item.id === selectedId ? "2" : "1";
      if (record.anchor.style.zIndex !== zIndex)
        record.anchor.style.zIndex = zIndex;
      // Name tags stay within the viewport even when their badge is near an edge.
      const halfLabel = Math.min(95, (width - 16) / 2);
      const labelShift =
        Math.max(8 + halfLabel, Math.min(width - 8 - halfLabel, item.x)) -
        item.x;
      const labelTransform = `translateX(calc(-50% + ${labelShift.toFixed(2)}px))`;
      if (record.label.style.transform !== labelTransform)
        record.label.style.transform = labelTransform;
      const maxWidth = `${Math.min(190, width - 16)}px`;
      if (record.label.style.maxWidth !== maxWidth)
        record.label.style.maxWidth = maxWidth;
      const labelSide = item.y < 72 ? "below" : "above";
      if (record.button.getAttribute("data-label-side") !== labelSide)
        record.button.setAttribute("data-label-side", labelSide);
    }
  }

  function clear() {
    for (const record of records.values()) record.anchor.remove();
    records.clear();
  }
  function dispose() {
    if (disposed) return;
    clear();
    element.remove();
    doc.removeEventListener?.("keyup", consumeActivationRelease, true);
    doc.removeEventListener?.("keydown", consumeActivationRepeat, true);
    heldActivationKeys.clear();
    disposed = true;
  }
  return { setItems, update, clear, dispose };
}
