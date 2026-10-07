import * as THREE from "three";

/** Original gentle fixtures for an imagined ROAM bar/club. No timed flashes. */
export function createClubLighting({
  enabled = true,
  reducedMotion = false,
} = {}) {
  const group = new THREE.Group();
  group.name = "ROAM original club fixtures";
  group.userData.clubLighting = true;
  const metal = new THREE.MeshStandardMaterial({
    color: "#5f6866",
    metalness: 0.58,
    roughness: 0.46,
  });
  const mirror = new THREE.MeshStandardMaterial({
    color: "#d9d4c4",
    metalness: 0.78,
    roughness: 0.31,
    flatShading: true,
  });
  const fixtureColors = ["#d893b7", "#88bfd1", "#b6be7c"];
  const lamps = [],
    patches = [];
  const axis = new THREE.Vector3(0, 1, 0);
  const fixtures = [
    { x: -6.4, z: -3.6, targetX: -3.9, targetZ: -0.5 },
    { x: 5.8, z: -3.4, targetX: 3.5, targetZ: 1.5 },
    { x: 0.2, z: -5.3, targetX: -0.5, targetZ: 3.2 },
  ];
  for (const [i, fixture] of fixtures.entries()) {
    const color = fixtureColors[i];
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 0.35, 12),
      metal,
    );
    housing.position.set(fixture.x, 3.38, fixture.z);
    group.add(housing);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    glow.position.set(fixture.x, 3.19, fixture.z);
    group.add(glow);
    const target = new THREE.Object3D();
    target.position.set(fixture.targetX, 0.05, fixture.targetZ);
    group.add(target);
    const light = new THREE.SpotLight(color, 7, 15, Math.PI / 7, 0.85, 2);
    light.position.set(fixture.x, 3.17, fixture.z);
    light.target = target;
    light.castShadow = false;
    group.add(light);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.025,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    group.add(beam);
    lamps.push({ light, target, beam, fixture });
  }
  const wire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.55, 6),
    metal,
  );
  wire.position.set(0.2, 3.45, -0.8);
  group.add(wire);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 2), mirror);
  ball.position.set(0.2, 3.0, -0.8);
  ball.castShadow = false;
  group.add(ball);
  const reflection = new THREE.MeshBasicMaterial({
    color: "#ede5c9",
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
  });
  const patchGeometry = new THREE.CircleGeometry(0.2, 16);
  for (let i = 0; i < 6; i++) {
    const patch = new THREE.Mesh(patchGeometry, reflection);
    patch.rotation.x = -Math.PI / 2;
    group.add(patch);
    patches.push(patch);
  }
  let phase = 0,
    active = enabled,
    steady = reducedMotion,
    disposed = false;
  /** @param {number} clock
   * @param {{enabled?:boolean, paused?:boolean, reducedMotion?:boolean}} options
   */
  function update(
    clock,
    {
      enabled: nextEnabled = active,
      paused = false,
      reducedMotion: nextSteady = steady,
    } = {},
  ) {
    if (disposed) return;
    active = Boolean(nextEnabled);
    steady = Boolean(nextSteady);
    group.visible = active;
    if (!active) return;
    if (steady) phase = 0;
    else if (!paused && Number.isFinite(clock)) phase = Math.max(0, clock);
    ball.rotation.y = steady ? 0 : phase * 0.13;
    ball.rotation.z = steady ? 0 : Math.sin(phase * 0.11) * 0.025;
    for (const [i, item] of lamps.entries()) {
      item.light.intensity = steady
        ? 6.5
        : 6.5 + Math.sin(phase * 0.37 + i * 1.2) * 0.75;
      item.target.position.set(
        item.fixture.targetX + (steady ? 0 : Math.sin(phase * 0.22 + i) * 0.65),
        0.05,
        item.fixture.targetZ + (steady ? 0 : Math.cos(phase * 0.19 + i) * 0.45),
      );
      const direction = item.light.position.clone().sub(item.target.position);
      const distance = direction.length();
      item.beam.position
        .copy(item.light.position)
        .add(item.target.position)
        .multiplyScalar(0.5);
      item.beam.scale.set(distance * 0.31, distance, distance * 0.31);
      item.beam.quaternion.setFromUnitVectors(axis, direction.normalize());
    }
    patches.forEach((patch, i) => {
      const angle = (i * Math.PI) / 3 + (steady ? 0 : phase * 0.07);
      const radius = 1.65 + (i % 2) * 0.72;
      patch.position.set(
        0.2 + Math.cos(angle) * radius,
        0.025,
        -0.8 + Math.sin(angle) * radius,
      );
      patch.scale.set(1.4, 0.65 + i * 0.07, 1);
    });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(),
      materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material)
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      if (object.isLight) object.shadow?.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    group.removeFromParent();
    group.clear();
  }
  update(0, { enabled, reducedMotion });
  return { group, update, dispose };
}
