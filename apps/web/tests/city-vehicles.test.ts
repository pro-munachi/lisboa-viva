import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCityVehicle,
  CITY_VEHICLE_DIMENSIONS,
} from "../lib/city-vehicles.js";
const THREE = require("three");

for (const kind of Object.keys(CITY_VEHICLE_DIMENSIONS)) {
  test(`${kind} has a metre-scaled recognisable silhouette with economical material batches`, () => {
    const vehicle = createCityVehicle({ kind });
    const bounds = new THREE.Box3().setFromObject(vehicle);
    const dimensions = vehicle.userData.vehicle;
    assert.ok(bounds.max.z - bounds.min.z >= dimensions.length * 0.98);
    assert.ok(bounds.max.z - bounds.min.z < dimensions.length * 1.09);
    assert.ok(
      bounds.max.y > (kind === "bus" ? 3 : kind === "tram" ? 3.5 : 1.4),
    );
    assert.ok(vehicle.children.length <= 8);
    assert.ok(dimensions.triangles < 7000);
    assert.ok(
      vehicle.children.every(
        (mesh: any) =>
          mesh.isMesh && mesh.geometry.getAttribute("position").count > 0,
      ),
    );
    const parts = new Set(
      vehicle.children.map((mesh: any) => mesh.userData.vehiclePart),
    );
    for (const part of ["body", "glass", "rubber", "trim", "white"])
      assert.ok(parts.has(part));
    const body: any = vehicle.children.find(
      (mesh: any) => mesh.userData.vehiclePart === "body",
    );
    const normals = body.geometry.getAttribute("normal");
    assert.ok(
      Array.from({ length: normals.count }, (_, i) => i).some(
        (i) =>
          Math.abs(normals.getY(i)) > 0.05 && Math.abs(normals.getZ(i)) > 0.05,
      ),
      "bonnet/cab has sloped faces rather than a stack of boxes",
    );
    vehicle.traverse((mesh: any) => {
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    });
  });
}
test("regional bus is a longer visual variant with destination panel; taxi has a roof sign", () => {
  const city = createCityVehicle({ kind: "bus" });
  const regional = createCityVehicle({
    kind: "bus",
    operator: "metropolitana",
  });
  assert.equal(city.userData.vehicle.length, 10.5);
  assert.equal(regional.userData.vehicle.length, 12);
  assert.ok(
    regional.children.some(
      (mesh: any) => mesh.userData.vehiclePart === "amber",
    ),
  );
  const taxi = createCityVehicle({ kind: "taxi" });
  assert.ok(
    taxi.children.some((mesh: any) => mesh.userData.vehiclePart === "amber"),
  );
});
