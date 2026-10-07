import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createBuildingOverview } from "../lib/city-overview";

const source = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("../public/data/lisbon-overview.json.gz", import.meta.url),
    ),
  ).toString(),
).buildings as number[][];
const projection = {
  unprojectGeo: (x: number, z: number) => [x, z],
  geoY: () => 0,
};
const sample = Array.from({ length: 40 }, (_, i) => [
  i * 17 - 210,
  i * 11 - 90,
  i % 3 === 0 ? 30 : 9,
  i % 3 === 1 ? 30 : 9,
  i === 0 ? 45 : 12,
]);

function boxKey(box: number[]) {
  return box.join(",");
}

function appearance(group: ReturnType<typeof createBuildingOverview>) {
  const result = new Map<string, { family: string; color: number[] }>();
  for (const mesh of group.children) {
    const matrices = mesh.instanceMatrix.array,
      colors = mesh.instanceColor.array;
    for (let i = 0; i < mesh.count; i++) {
      const m = i * 16;
      result.set(
        boxKey([
          matrices[m + 12],
          matrices[m + 14],
          matrices[m],
          matrices[m + 10],
          matrices[m + 5],
        ]),
        {
          family: mesh.userData.family,
          color: Array.from(colors.slice(i * 3, i * 3 + 3)),
        },
      );
    }
  }
  return result;
}

function dispose(group: ReturnType<typeof createBuildingOverview>) {
  for (const mesh of group.children) {
    mesh.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
}

test("the full bundled overview keeps every source box exactly once with its footprint and height", () => {
  const group = createBuildingOverview(source, projection);
  assert.equal(group.userData.buildingCount, 273347);
  assert.ok(group.children.length <= 4);
  const remaining = new Map<string, number>();
  for (const box of source)
    remaining.set(boxKey(box), (remaining.get(boxKey(box)) || 0) + 1);
  let instances = 0,
    instanceBytes = 0,
    geometryBytes = 0;
  for (const mesh of group.children) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.equal(Array.isArray(mesh.material), false);
    assert.deepEqual(mesh.geometry.boundingBox.min.toArray(), [-0.5, 0, -0.5]);
    assert.deepEqual(mesh.geometry.boundingBox.max.toArray(), [0.5, 1, 0.5]);
    for (const attribute of Object.values(mesh.geometry.attributes) as {
      array: Float32Array;
    }[])
      geometryBytes += attribute.array.byteLength;
    const matrices = mesh.instanceMatrix.array;
    instanceBytes += matrices.byteLength + mesh.instanceColor.array.byteLength;
    for (let i = 0; i < mesh.count; i++) {
      const m = i * 16;
      const box = [
        matrices[m + 12],
        matrices[m + 14],
        matrices[m],
        matrices[m + 10],
        matrices[m + 5],
      ];
      assert.ok(box.every(Number.isFinite));
      assert.equal(matrices[m + 13], 0);
      assert.equal(matrices[m + 15], 1);
      for (const offset of [1, 2, 3, 4, 6, 7, 8, 9, 11])
        assert.equal(matrices[m + offset], 0);
      const key = boxKey(box),
        count = remaining.get(key);
      assert.ok(
        count && count > 0,
        `${key} is an unexpected or duplicated source box`,
      );
      if (count === 1) remaining.delete(key);
      else remaining.set(key, count! - 1);
      instances++;
    }
  }
  assert.equal(instances, source.length);
  assert.equal(remaining.size, 0);
  // Same 16-float matrix + 3-float colour per instance as the former one-box mesh.
  assert.equal(
    instanceBytes,
    source.length * 19 * Float32Array.BYTES_PER_ELEMENT,
  );
  assert.ok(
    geometryBytes < 64 * 1024,
    "all four shared prototypes should remain tiny",
  );
  dispose(group);
});

test("wall colours and roof silhouettes survive reordered and expanded source arrays", () => {
  const a = createBuildingOverview(sample, projection);
  const b = createBuildingOverview(
    [[3000, 4000, 6, 8, 9], ...sample.toReversed()],
    projection,
  );
  const originals = appearance(a),
    reordered = appearance(b);
  for (const [key, value] of originals)
    assert.deepEqual(reordered.get(key), value);
  assert.equal(
    new Set(a.children.map((mesh: any) => mesh.userData.family)).size,
    4,
  );
  assert.ok(
    new Set([...originals.values()].map((value) => value.color.join(",")))
      .size >= 6,
  );
  dispose(a);
  dispose(b);
});

test("body and roof triangles have consistent outward normals and peak/base bounds", () => {
  const group = createBuildingOverview(sample, {
    ...projection,
    geoY: (point: number[]) => 10 + point[0] / 1000,
  });
  const expectedBases = new Map(
    sample.map((box) => [boxKey(box), 10 + box[0] / 1000]),
  );
  for (const mesh of group.children) {
    const p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal;
    const roof = mesh.geometry.attributes.roamRoofFace;
    assert.equal(roof.count, p.count);
    assert.equal(n.count, p.count);
    for (let i = 0; i < p.count; i += 3) {
      const roofFace = roof.getX(i);
      assert.equal(roof.getX(i + 1), roofFace);
      assert.equal(roof.getX(i + 2), roofFace);
      for (let j = i; j < i + 3; j++) {
        const normal = [n.getX(j), n.getY(j), n.getZ(j)];
        assert.ok(normal.every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
        if (roofFace) assert.ok(normal[1] > 0, "a roof face must point upward");
        else
          assert.ok(
            normal[1] <= 1e-6,
            "gable ends and body faces must not become roof tint",
          );
      }
      const ax = p.getX(i + 1) - p.getX(i),
        ay = p.getY(i + 1) - p.getY(i),
        az = p.getZ(i + 1) - p.getZ(i);
      const bx = p.getX(i + 2) - p.getX(i),
        by = p.getY(i + 2) - p.getY(i),
        bz = p.getZ(i + 2) - p.getZ(i);
      const dot =
        (ay * bz - az * by) * n.getX(i) +
        (az * bx - ax * bz) * n.getY(i) +
        (ax * by - ay * bx) * n.getZ(i);
      assert.ok(dot > 0, "vertex normal must agree with the triangle winding");
    }
    const matrices = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i++) {
      const m = i * 16;
      const box = [
        matrices[m + 12],
        matrices[m + 14],
        matrices[m],
        matrices[m + 10],
        matrices[m + 5],
      ];
      assert.ok(
        Math.abs(matrices[m + 13] - expectedBases.get(boxKey(box))!) < 1e-5,
      );
    }
  }
  dispose(group);
});

test("the Three r160 shader overrides roof tint after wall instance colouring", () => {
  const physical = readFileSync(
    new URL(
      "../node_modules/three/src/renderers/shaders/ShaderLib/meshphysical.glsl.js",
      import.meta.url,
    ),
    "utf8",
  );
  const vertex = physical.match(
    /export const vertex = \/\* glsl \*\/`([\s\S]*?)`;/,
  )?.[1];
  assert.ok(vertex);
  const group = createBuildingOverview(sample, projection);
  const roofs = new Set<string>();
  for (const mesh of group.children) {
    const shader = {
      vertexShader: vertex!,
      uniforms: {} as Record<string, { value: any }>,
    };
    mesh.material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes("attribute float roamRoofFace;"));
    const wallColour = shader.vertexShader.indexOf("#include <color_vertex>");
    const roofOverride = shader.vertexShader.indexOf(
      "vColor.xyz = mix(vColor.xyz, roamOverviewRoof, roamRoofFace);",
    );
    assert.ok(roofOverride > wallColour);
    roofs.add(shader.uniforms.roamOverviewRoof.value.getHexString());
    assert.equal(mesh.material.color.getHexString(), "ffffff");
  }
  assert.equal(roofs.size, 4);
  dispose(group);
});

test("empty overviews allocate nothing and shared resources dispose exactly once", () => {
  const empty = createBuildingOverview([], projection);
  assert.equal(empty.children.length, 0);
  const group = createBuildingOverview(sample, projection);
  assert.equal(
    new Set(group.children.map((mesh: any) => mesh.geometry)).size,
    4,
  );
  assert.equal(
    new Set(group.children.map((mesh: any) => mesh.material)).size,
    4,
  );
  let disposedMeshes = 0,
    disposedGeometries = 0,
    disposedMaterials = 0;
  for (const mesh of group.children) {
    mesh.addEventListener("dispose", () => disposedMeshes++);
    mesh.geometry.addEventListener("dispose", () => disposedGeometries++);
    mesh.material.addEventListener("dispose", () => disposedMaterials++);
  }
  dispose(group);
  assert.equal(disposedMeshes, 4);
  assert.equal(disposedGeometries, 4);
  assert.equal(disposedMaterials, 4);
  assert.throws(
    () => createBuildingOverview([[NaN, 0, 10, 10, 12]], projection),
    /finite/,
  );
  assert.throws(
    () => createBuildingOverview([[0, 0, 0, 10, 12]], projection),
    /positive/,
  );
  assert.throws(
    () => createBuildingOverview(sample, { ...projection, geoY: () => NaN }),
    /elevation/,
  );
});
