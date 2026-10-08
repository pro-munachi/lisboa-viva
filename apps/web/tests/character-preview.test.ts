import { test } from "node:test";
import assert from "node:assert/strict";
import { createCharacterPreview } from "../lib/character-preview.js";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
const { Box3, Vector3 } = require("three");

function harness() {
  const output = {
    shadowMap: {},
    scene: null as any,
    camera: null as any,
    renders: 0,
    disposed: 0,
    contextLosses: 0,
    sizes: [] as number[][],
    setPixelRatio() {},
    setClearColor() {},
    setSize(width: number, height: number) {
      this.sizes.push([width, height]);
    },
    render(scene: any, camera: any) {
      this.scene = scene;
      this.camera = camera;
      this.renders++;
    },
    dispose() {
      this.disposed++;
    },
    forceContextLoss() {
      this.contextLosses++;
    },
  };
  const preview = createCharacterPreview({
    canvas: null,
    appearance: DEFAULT_APPEARANCE,
    renderer: output,
  });
  const actor = () =>
    output.scene.children.find((node: any) => node.userData.rig);
  return { output, preview, actor };
}

test("studio appearance changes preserve the selected turn and close-up while releasing the old actor", () => {
  const h = harness();
  try {
    h.preview.resize(230, 300);
    h.preview.rotate(1.5);
    h.preview.setView("face");
    const first = h.actor();
    const camera = h.output.camera;
    const framing = [
      camera.left,
      camera.right,
      camera.top,
      ...camera.position.toArray(),
    ];
    const geometries = new Set<any>();
    let released = 0;
    first.traverse((node: any) => {
      if (node.geometry) geometries.add(node.geometry);
    });
    for (const geometry of geometries)
      geometry.addEventListener("dispose", () => released++);
    h.preview.setAppearance({
      ...DEFAULT_APPEARANCE,
      bodyType: "female",
      outfitStyle: "dress",
      hairStyle: "bob",
    });
    assert.notEqual(h.actor(), first);
    assert.equal(h.actor().userData.bodyType, "female");
    assert.equal(h.actor().userData.style, "dress");
    assert.equal(h.actor().userData.hairStyle, "bob");
    assert.equal(h.actor().rotation.y, first.rotation.y);
    assert.equal(first.parent, null);
    assert.equal(released, geometries.size);
    assert.equal(h.output.camera, camera);
    assert.deepEqual(
      [camera.left, camera.right, camera.top, ...camera.position.toArray()],
      framing,
    );
    const renders = h.output.renders;
    h.preview.setAppearance({
      ...DEFAULT_APPEARANCE,
      bodyType: "female",
      outfitStyle: "dress",
      hairStyle: "bob",
    });
    assert.equal(
      h.output.renders,
      renders,
      "unchanged props do not rebuild or redraw",
    );
  } finally {
    h.preview.dispose();
  }
});

test("studio resize fits a portrait and wide viewport and cleanup is idempotent", () => {
  const h = harness();
  h.preview.resize(230, 300);
  assert.ok(
    h.output.camera.right > 0.7,
    "the full person fits a narrow studio",
  );
  h.preview.resize(600, 300);
  assert.equal(h.output.camera.right, 2.04);
  h.preview.resize(0, 0);
  h.preview.resize(Number.NaN, 20);
  assert.deepEqual(h.output.sizes, [
    [230, 300],
    [600, 300],
  ]);
  h.preview.front();
  assert.equal(h.actor().rotation.y, 0);
  h.preview.dispose();
  const renders = h.output.renders;
  h.preview.dispose();
  h.preview.rotate(1);
  h.preview.setView("face");
  h.preview.resize(400, 400);
  h.preview.setAppearance(DEFAULT_APPEARANCE);
  assert.equal(h.output.renders, renders);
  assert.equal(h.output.scene.children.length, 0);
  assert.equal(h.output.disposed, 1);
  assert.equal(h.output.contextLosses, 1);
});

test("narrow studio framing keeps turned outfits and tall hairstyles within view", () => {
  const h = harness();
  try {
    for (const look of [
      { ...DEFAULT_APPEARANCE, outfitStyle: "jacket" as const },
      {
        ...DEFAULT_APPEARANCE,
        bodyType: "female" as const,
        outfitStyle: "dress" as const,
        hairStyle: "bun" as const,
      },
    ]) {
      h.preview.setAppearance(look);
      for (const [width, height] of [
        [160, 420],
        [230, 300],
        [350, 180],
      ]) {
        h.preview.resize(width, height);
        for (const view of ["full", "face"] as const) {
          h.preview.setView(view);
          h.preview.front();
          h.preview.rotate(Math.PI / 2);
          const actor = h.actor();
          actor.updateMatrixWorld(true);
          h.output.camera.updateMatrixWorld(true);
          const bounds = new Box3().setFromObject(
            view === "face" ? actor.getObjectByName("head") : actor,
          );
          if (view === "full") {
            for (const name of ["studio pedestal", "studio base"])
              bounds.expandByObject(h.output.scene.getObjectByName(name));
          }
          for (const x of [bounds.min.x, bounds.max.x])
            for (const y of [bounds.min.y, bounds.max.y])
              for (const z of [bounds.min.z, bounds.max.z]) {
                const projected = new Vector3(x, y, z).project(h.output.camera);
                assert.ok(
                  Math.abs(projected.x) < 1,
                  `${look.bodyType}/${view}: sideways silhouette fits ${width}×${height}`,
                );
                assert.ok(
                  Math.abs(projected.y) < 1,
                  `${look.bodyType}/${view}: feet, platform or tall hair fit ${width}×${height}`,
                );
              }
        }
      }
    }
  } finally {
    h.preview.dispose();
  }
});
