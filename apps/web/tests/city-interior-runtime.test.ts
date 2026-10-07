import { test } from "node:test";
import assert from "node:assert/strict";
import { createInteriorRuntime } from "../lib/city-interior-runtime.js";
import { INTERIOR_ACTIVITIES, type InteriorKind } from "../lib/interiors";
import { createHotspotBadgeLayer } from "../lib/city-hotspot-badges.js";

const THREE = require("three");
type ActivityEvent = { state: string; zoneId: string | null; error?: string };
const kinds: InteriorKind[] = ["home", "cafe", "gym", "shop", "museum", "bar"];

function harness(badgeHost?: any) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(43, 1.6, 0.3, 90000),
    controls = {
      target: new THREE.Vector3(),
      update() {
        camera.lookAt(this.target);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();
      },
    },
    events: ActivityEvent[] = [],
    zones: string[] = [],
    disposed: {
      group: any;
      geometries: number;
      materials: number;
      textures: number;
    }[] = [];
  const exterior = new THREE.Group();
  exterior.position.set(30, 8, -12);
  scene.add(exterior);
  function disposeGroup(group: any) {
    const geometries = new Set<any>(),
      materials = new Set<any>(),
      textures = new Set<any>();
    group.traverse((node: any) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : []) {
        materials.add(material);
        if (material.map) textures.add(material.map);
      }
    });
    const counts = { group, geometries: 0, materials: 0, textures: 0 };
    for (const [resources, key] of [
      [geometries, "geometries"],
      [materials, "materials"],
      [textures, "textures"],
    ] as const)
      for (const resource of resources) {
        resource.addEventListener("dispose", () => counts[key]++);
        resource.dispose();
      }
    assert.equal(counts.geometries, geometries.size);
    assert.equal(counts.materials, materials.size);
    assert.equal(counts.textures, textures.size);
    disposed.push(counts);
    group.removeFromParent();
    group.clear();
  }
  const runtime = createInteriorRuntime({
    scene,
    camera,
    controls,
    disposeGroup,
    shirt: "#c58e59",
    onZone: (id: string) => zones.push(id),
    onActivity: (event: ActivityEvent) => events.push({ ...event }),
    badgeHost,
  });
  const group = () => {
    const result = scene.children.find((node: any) => node.userData.room);
    assert.ok(result, "the current room is attached to the scene");
    return result;
  };
  const actor = () => {
    const result = group().children.find(
      (node: any) => node.userData.rig && !node.userData.npc,
    );
    assert.ok(
      result,
      "the visitor uses the actual articulated character model",
    );
    return result;
  };
  const enter = (
    kind: InteriorKind,
    origin = new THREE.Vector3(1200, 17, -3400),
  ) => {
    runtime.enter({ id: `test-${kind}`, name: `Test ${kind}`, kind }, origin);
    return origin;
  };
  return {
    runtime,
    scene,
    camera,
    controls,
    events,
    zones,
    disposed,
    exterior,
    group,
    actor,
    enter,
  };
}

function assertClearFloor(actor: any, group: any) {
  const room = group.userData.room,
    radius = 0.28,
    p = actor.position;
  assert.ok(
    p.x >= room.bounds.minX + radius && p.x <= room.bounds.maxX - radius,
  );
  assert.ok(
    p.z >= room.bounds.minZ + radius && p.z <= room.bounds.maxZ - radius,
  );
  for (const obstacle of room.obstacles) {
    assert.ok(
      !(
        p.x >= obstacle.minX - radius &&
        p.x <= obstacle.maxX + radius &&
        p.z >= obstacle.minZ - radius &&
        p.z <= obstacle.maxZ + radius
      ),
      `visitor cleared furniture at ${p.x}, ${p.z}`,
    );
  }
  assert.equal(p.y, 0.02);
}

function reach(
  h: ReturnType<typeof harness>,
  state: string,
  zoneId: string,
  limit = 1500,
) {
  for (let i = 0; i < limit; i++) {
    if (h.events.at(-1)?.state === state && h.events.at(-1)?.zoneId === zoneId)
      return;
    h.runtime.update(1 / 60, true);
  }
  assert.fail(
    `${zoneId} did not reach ${state}: ${JSON.stringify(h.events.at(-1))}`,
  );
}

test("all eighteen real room activities walk around furniture, become active and complete at a stable world origin", () => {
  let completed = 0;
  for (const kind of kinds) {
    const h = harness();
    try {
      const origin = h.enter(kind),
        roomGroup = h.group(),
        actor = h.actor();
      const worldOrigin = roomGroup.position.toArray(),
        exteriorOrigin = h.exterior.position.toArray();
      assert.equal(h.runtime.kind, kind);
      for (const activity of INTERIOR_ACTIVITIES[kind]) {
        const firstEvent = h.events.length;
        h.runtime.perform(activity.id, activity.durationMs);
        assert.equal(
          h.events.at(-1)?.state,
          "walking",
          `${kind}/${activity.id} begins walking`,
        );
        for (
          let frame = 0;
          frame < 1500 && h.events.at(-1)?.state === "walking";
          frame++
        ) {
          h.runtime.update(1 / 60, true);
          if (h.events.at(-1)?.state === "walking")
            assertClearFloor(actor, roomGroup);
          assert.deepEqual(roomGroup.position.toArray(), worldOrigin);
        }
        assert.equal(
          h.events.at(-1)?.state,
          "active",
          `${kind}/${activity.id} reaches its prop`,
        );
        assert.equal(h.events.at(-1)?.zoneId, activity.id);
        reach(h, "complete", activity.id);
        const sequence = h.events.slice(firstEvent);
        assert.deepEqual(
          sequence.map((event) => event.state),
          ["walking", "active", "complete"],
        );
        assertClearFloor(actor, roomGroup);
        assert.deepEqual(roomGroup.position.toArray(), worldOrigin);
        assert.deepEqual(origin.toArray(), worldOrigin);
        assert.deepEqual(h.exterior.position.toArray(), exteriorOrigin);
        assert.ok(actor.userData.rig.leftKnee && actor.userData.rig.rightElbow);
        completed++;
      }
    } finally {
      h.runtime.clear();
    }
  }
  assert.equal(completed, 18);
});

test("paused and zero-time updates freeze walking and activity completion until motion resumes", () => {
  const h = harness();
  try {
    h.enter("gym");
    h.runtime.perform("weights", 3000);
    h.runtime.update(0.05, true);
    const actor = h.actor(),
      position = actor.position.toArray(),
      angle = actor.rotation.y,
      joint = actor.userData.rig.leftLeg.rotation.x,
      count = h.events.length;
    for (let i = 0; i < 200; i++) h.runtime.update(1, false);
    assert.deepEqual(actor.position.toArray(), position);
    assert.equal(actor.rotation.y, angle);
    assert.equal(actor.userData.rig.leftLeg.rotation.x, joint);
    assert.equal(h.events.length, count);
    for (let i = 0; i < 200; i++) h.runtime.update(0, true);
    assert.deepEqual(actor.position.toArray(), position);
    assert.equal(h.events.length, count);
    reach(h, "active", "weights");
    const activeCount = h.events.length,
      activePosition = actor.position.toArray();
    for (let i = 0; i < 200; i++) {
      h.runtime.update(1, false);
      h.runtime.update(0, true);
    }
    assert.deepEqual(actor.position.toArray(), activePosition);
    assert.equal(h.events.length, activeCount);
    assert.equal(h.events.at(-1)?.state, "active");
    reach(h, "complete", "weights");
    assert.equal(
      h.events.filter((event) => event.state === "complete").length,
      1,
    );
  } finally {
    h.runtime.clear();
  }
});

test("repeated activity clicks and zone selection while busy cannot replace or duplicate the current action", () => {
  const h = harness();
  try {
    h.enter("gym");
    h.runtime.perform("weights", 3000);
    const walkingCount = h.events.length,
      selections = h.zones.length;
    for (let i = 0; i < 20; i++) {
      h.runtime.perform("weights", 12000);
      h.runtime.perform("stretch", 2000);
      h.runtime.selectZone("stretch");
    }
    assert.equal(h.events.length, walkingCount);
    assert.equal(h.zones.length, selections);
    reach(h, "active", "weights");
    const activeCount = h.events.length;
    for (let i = 0; i < 20; i++) h.runtime.perform("weights", 12000);
    assert.equal(h.events.length, activeCount);
    reach(h, "complete", "weights", 210);
    assert.deepEqual(
      h.events
        .filter((event) => event.state === "complete")
        .map((event) => event.zoneId),
      ["weights"],
    );
    h.runtime.perform("stretch", 2000);
    reach(h, "complete", "stretch");
  } finally {
    h.runtime.clear();
  }
});

test("seated activities place the articulated visitor on the actual seat and restore a clear floor target", () => {
  for (const [kind, id] of [
    ["home", "rest"],
    ["cafe", "table"],
    ["museum", "bench"],
    ["bar", "lounge"],
  ] as const) {
    const h = harness();
    try {
      h.enter(kind);
      const actor = h.actor(),
        zone = h.group().userData.zones.find((item: any) => item.id === id);
      assert.ok(zone.seat);
      h.runtime.perform(id, 2000);
      reach(h, "active", id);
      assert.equal(actor.position.x, zone.seat.x);
      assert.equal(actor.position.z, zone.seat.z);
      assert.equal(actor.rotation.y, zone.seat.angle);
      assert.ok(Math.abs(actor.userData.rig.leftLeg.rotation.x + 1.05) < 1e-8);
      const seatedHipHeight =
        actor.position.y + actor.userData.rig.hips.position.y * actor.scale.y;
      assert.ok(Math.abs(seatedHipHeight - (zone.seat.height + 0.04)) < 1e-8);
      reach(h, "complete", id);
      assert.ok(
        Math.hypot(
          actor.position.x - zone.target.x,
          actor.position.z - zone.target.z,
        ) < 0.03,
      );
      assertClearFloor(actor, h.group());
      h.runtime.update(0.1, true);
      assert.ok(
        Math.abs(actor.userData.rig.hips.position.y - actor.userData.restHipY) <
          0.015,
      );
    } finally {
      h.runtime.clear();
    }
  }
});

test("switching rooms or exiting cancels previous completion and releases the removed room exactly once", () => {
  for (const phase of ["walking", "active"]) {
    const h = harness();
    try {
      h.enter("gym");
      h.runtime.perform("weights", 12000);
      if (phase === "active") reach(h, "active", "weights");
      const oldRoom = h.group();
      const nextOrigin = new THREE.Vector3(-500, 40, 900);
      h.enter("home", nextOrigin);
      assert.equal(oldRoom.parent, null);
      assert.equal(oldRoom.children.length, 0);
      assert.equal(h.disposed.length, 1);
      assert.ok(h.disposed[0].geometries > 0 && h.disposed[0].materials > 0);
      assert.equal(h.disposed[0].group, oldRoom);
      assert.equal(h.runtime.kind, "home");
      assert.deepEqual(h.group().position.toArray(), nextOrigin.toArray());
      for (let i = 0; i < 300; i++) h.runtime.update(0.1, true);
      assert.equal(
        h.events.filter(
          (event) => event.state === "complete" && event.zoneId === "weights",
        ).length,
        0,
      );
      h.runtime.perform("kitchen", 2000);
      reach(h, "active", "kitchen");
      const currentRoom = h.group(),
        beforeClear = h.events.length;
      h.runtime.clear();
      assert.equal(h.runtime.active, false);
      assert.equal(h.runtime.kind, undefined);
      assert.equal(currentRoom.parent, null);
      assert.equal(currentRoom.children.length, 0);
      assert.equal(h.disposed.length, 2);
      for (let i = 0; i < 300; i++) h.runtime.update(0.1, true);
      assert.equal(h.events.length, beforeClear);
      h.runtime.clear();
      assert.equal(h.disposed.length, 2);
      assert.deepEqual(h.scene.children, [h.exterior]);
    } finally {
      h.runtime.clear();
    }
  }
});

type FakeDocument = {
  activeElement: FakeElement | null;
  listeners: Map<string, Set<(event: any) => void>>;
  createElement(tag: string): FakeElement;
  createElementNS(namespace: string, tag: string): FakeElement;
  addEventListener(
    type: string,
    listener: (event: any) => void,
    capture?: boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: any) => void,
    capture?: boolean,
  ): void;
  dispatch(type: string, details?: Record<string, unknown>): any;
};

function fakeEvent(
  type: string,
  target: any,
  details: Record<string, unknown> = {},
) {
  return {
    type,
    target,
    currentTarget: target,
    defaultPrevented: false,
    propagationStopped: false,
    ...details,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}

/** The badge layer uses this host's document; room textures keep their no-DOM path. */
class FakeElement {
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  style: any = {};
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<(event: any) => void>>();
  className = "";
  textContent = "";
  hidden = false;
  disabled = false;
  clientWidth = 960;
  clientHeight = 600;
  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}
  appendChild(child: FakeElement) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...children: FakeElement[]) {
    children.forEach((child) => this.appendChild(child));
  }
  replaceChildren(...children: FakeElement[]) {
    [...this.children].forEach((child) => child.remove());
    this.append(...children);
  }
  remove() {
    if (!this.parentElement) return;
    const children = this.parentElement.children;
    children.splice(children.indexOf(this), 1);
    this.parentElement = null;
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, String(value));
    if (key.startsWith("data-"))
      this.dataset[
        key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      ] = String(value);
  }
  getAttribute(key: string) {
    return this.attributes.get(key) ?? null;
  }
  removeAttribute(key: string) {
    this.attributes.delete(key);
  }
  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, details: Record<string, unknown> = {}) {
    const event = fakeEvent(type, this, details);
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  click() {
    if (!this.disabled) this.dispatch("click", { detail: 0 });
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
}

function badgeHost() {
  const ownerDocument: FakeDocument = {
    activeElement: null,
    listeners: new Map(),
    createElement: (tag) => new FakeElement(tag.toUpperCase(), ownerDocument),
    createElementNS: (_, tag) =>
      new FakeElement(tag.toUpperCase(), ownerDocument),
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(listener);
    },
    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    },
    dispatch(type, details = {}) {
      const event = fakeEvent(type, this.activeElement, details);
      event.currentTarget = this;
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    },
  };
  return ownerDocument.createElement("div");
}

function badgeButtons(host: FakeElement): FakeElement[] {
  return host.children.flatMap((child) => [
    ...(child.tagName === "BUTTON" ? [child] : []),
    ...badgeButtons(child),
  ]);
}

function badgeWithId(host: FakeElement, id: string) {
  const button = badgeButtons(host).find(
    (item) => item.dataset.hotspotId === id,
  );
  assert.ok(button, `the room exposes its ${id} activity badge`);
  return button;
}

test("all eighteen room badges select their actual activity without starting it, and stay selected while busy", () => {
  const host = badgeHost(),
    h = harness(host);
  try {
    for (const kind of kinds) {
      h.enter(kind);
      h.runtime.update(0, false);
      const expectedIds = INTERIOR_ACTIVITIES[kind].map(
        (activity) => activity.id,
      );
      assert.deepEqual(
        badgeButtons(host)
          .map((button) => button.dataset.hotspotId)
          .sort(),
        [...expectedIds].sort(),
      );
      const firstZone = h
          .group()
          .userData.zones.find((zone: any) => zone.id === expectedIds[0]),
        worldPoint = h
          .group()
          .position.clone()
          .add(new THREE.Vector3(firstZone.point.x, 2.4, firstZone.point.z)),
        projected = worldPoint.project(h.camera),
        anchor = badgeWithId(host, expectedIds[0]).parentElement!;
      assert.equal(anchor.hidden, false);
      assert.equal(
        anchor.style.transform,
        `translate3d(${(((projected.x + 1) / 2) * host.clientWidth - 22).toFixed(2)}px, ${(((1 - projected.y) / 2) * host.clientHeight - 22).toFixed(2)}px, 0)`,
        "the selected badge is anchored to the actual prop, its room origin and its 2.4-metre height",
      );
      const actor = h.actor(),
        position = actor.position.toArray(),
        count = h.events.length;
      for (const id of expectedIds) {
        badgeWithId(host, id).dispatch("click");
        assert.equal(h.zones.at(-1), id);
        assert.equal(
          badgeWithId(host, id).getAttribute("aria-pressed"),
          "true",
        );
        assert.equal(
          h.events.length,
          count,
          "selection keeps the explicit Begin CTA",
        );
        assert.deepEqual(actor.position.toArray(), position);
      }
      h.runtime.perform(expectedIds[0], 3000);
      const selections = h.zones.length,
        actionCount = h.events.length;
      assert.ok(badgeButtons(host).every((button) => button.disabled));
      badgeWithId(host, expectedIds[1]).dispatch("click");
      assert.equal(h.zones.length, selections);
      assert.equal(h.events.length, actionCount);
      assert.equal(
        badgeWithId(host, expectedIds[0]).getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        badgeWithId(host, expectedIds[1]).getAttribute("aria-pressed"),
        "false",
      );
    }
  } finally {
    h.runtime.dispose();
  }
});

test("paused rooms keep badges projected when the camera or viewport moves without advancing the activity", () => {
  const host = badgeHost(),
    h = harness(host);
  try {
    h.enter("cafe", new THREE.Vector3(-500, 45, 900));
    h.runtime.perform("espresso", 3000);
    h.runtime.update(0, false);
    const button = badgeWithId(host, "espresso"),
      anchor = button.parentElement!,
      transform = anchor.style.transform,
      position = h.actor().position.toArray(),
      count = h.events.length;
    assert.ok(transform && !transform.includes("NaN"));
    h.camera.position.x += 5;
    h.controls.update();
    h.runtime.update(1, false);
    assert.notEqual(anchor.style.transform, transform);
    const moved = anchor.style.transform;
    host.clientWidth = 700;
    host.clientHeight = 450;
    h.runtime.update(1, false);
    assert.notEqual(anchor.style.transform, moved);
    assert.deepEqual(h.actor().position.toArray(), position);
    assert.equal(h.events.length, count);
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(button.disabled, true);
    reach(h, "complete", "espresso");
    assert.ok(badgeButtons(host).every((item) => !item.disabled));
  } finally {
    h.runtime.dispose();
  }
});

test("exit clears old room badges, re-entry is reusable, and final disposal removes the layer and prevents stale callbacks", () => {
  const host = badgeHost(),
    h = harness(host);
  h.enter("bar");
  const oldBadge = badgeWithId(host, "counter"),
    oldSelections = h.zones.length;
  h.runtime.clear();
  assert.equal(badgeButtons(host).length, 0);
  oldBadge.dispatch("click");
  assert.equal(h.zones.length, oldSelections);
  h.enter("shop");
  assert.equal(badgeButtons(host).length, 3);
  const nextBadge = badgeWithId(host, "counter"),
    selections = h.zones.length;
  oldBadge.dispatch("click");
  assert.equal(
    h.zones.length,
    selections,
    "a detached badge cannot select the same activity ID in a different room",
  );
  h.runtime.dispose();
  assert.equal(host.children.length, 0);
  assert.equal(h.runtime.active, false);
  assert.equal(h.disposed.length, 2);
  nextBadge.dispatch("click");
  assert.equal(h.zones.length, selections);
  h.runtime.dispose();
  h.runtime.clear();
  h.enter("cafe");
  h.runtime.update(1, true);
  assert.equal(host.children.length, 0);
  assert.equal(h.disposed.length, 2);
  assert.deepEqual(h.scene.children, [h.exterior]);
});

test("keyboard badge activation selects once and consumes repeat/release after focus moves to a dialog close button", () => {
  for (const key of ["Enter", " "]) {
    const host = badgeHost(),
      doc = host.ownerDocument,
      close = doc.createElement("button"),
      selections: string[] = [];
    let closeClicks = 0;
    close.addEventListener("click", () => closeClicks++);
    const layer = createHotspotBadgeLayer(host, {
      onSelect(value: string) {
        selections.push(value);
        close.focus();
      },
    });
    try {
      layer.setItems([
        {
          id: "cafe",
          name: "Mapped café",
          category: "cafe",
          position: new THREE.Vector3(0, 2.4, -8),
          value: "open-cafe",
        },
      ]);
      const button = badgeWithId(host, "cafe");
      button.focus();
      const activation = button.dispatch("keydown", { key, repeat: false });
      assert.equal(activation.defaultPrevented, true);
      assert.equal(activation.propagationStopped, true);
      assert.deepEqual(selections, ["open-cafe"]);
      assert.equal(doc.activeElement, close);

      for (const [type, repeat] of [
        ["keydown", true],
        ["keyup", false],
      ] as const) {
        const event = doc.dispatch(type, { key, repeat });
        // A native key's default can activate the newly focused dialog target.
        // This proxy makes a missed document capture guard observable.
        if (!event.propagationStopped) close.dispatch(type, { key, repeat });
        if (!event.defaultPrevented) close.click();
        assert.equal(
          event.defaultPrevented,
          true,
          `${key} ${type} is consumed`,
        );
        assert.equal(event.propagationStopped, true);
        assert.equal(closeClicks, 0);
        assert.deepEqual(selections, ["open-cafe"]);
      }
      const freshPress = doc.dispatch("keydown", { key, repeat: false });
      assert.equal(
        freshPress.defaultPrevented,
        false,
        "a new intentional dialog keypress remains usable",
      );
      assert.equal(freshPress.propagationStopped, false);
    } finally {
      layer.dispose();
    }
    assert.equal(doc.listeners.get("keydown")?.size, 0);
    assert.equal(doc.listeners.get("keyup")?.size, 0);
    assert.equal(host.children.length, 0);
  }
});
