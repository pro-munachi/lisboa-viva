import * as THREE from "three";

const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distanceToSegment = (p, a, b) => {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};
const inside = (p, ring) => {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      contained = !contained;
  }
  return contained;
};
const crosses = (a, b, c, d) => {
  const turn = (p, q, r) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return (
    turn(a, b, c) * turn(a, b, d) < -1e-7 &&
    turn(c, d, a) * turn(c, d, b) < -1e-7
  );
};

/** Read existing canopy instances; do not create duplicate tree geometry. */
export function locationTreeObstacles(groups, point) {
  const obstacles = [],
    instance = new THREE.Matrix4(),
    world = new THREE.Matrix4();
  for (const group of groups) {
    group.updateWorldMatrix(true, true);
    group.traverse((mesh) => {
      if (
        !mesh.isInstancedMesh ||
        ![
          "Olive and shade canopies",
          "Cypress silhouettes",
          "Riverside palm crowns",
        ].includes(mesh.name)
      )
        return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, instance);
        world.multiplyMatrices(mesh.matrixWorld, instance);
        const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(world);
        if (
          Math.hypot(sphere.center.x - point.x, sphere.center.z - point.z) > 90
        )
          continue;
        obstacles.push({
          x: sphere.center.x,
          y: sphere.center.y,
          z: sphere.center.z,
          radius: sphere.radius,
        });
      }
    });
  }
  return obstacles
    .sort(
      (a, b) =>
        Math.hypot(a.x - point.x, a.z - point.z) -
        Math.hypot(b.x - point.x, b.z - point.z),
    )
    .slice(0, 256);
}

/**
 * A close, land-side arrival shot keeps the visitor and the actual mapped
 * entrance together. Footprints, terrace furniture and driving lanes are
 * checked before placing anyone. Geographic sources are never modified.
 * @param {{point:{x:number,z:number,y?:number}, normal?:{x:number,z:number}, groundY?:number, footprints?:{x:number,z:number}[][], reservations?:{x:number,z:number,radius:number}[], obstacles?:{x:number,y:number,z:number,radius:number}[], waterAt?:(p:{x:number,z:number})=>boolean, elevationAt?:(p:{x:number,z:number})=>number, safeAt?:(p:{x:number,z:number})=>boolean, fallbackPlayer?:{x:number,z:number}, beachView?:{seaward:{x:number,z:number}}|null, aspect?:number}} options
 * @returns {{player:{x:number,y:number,z:number}, angle:number, camera:{x:number,y:number,z:number}, target:{x:number,y:number,z:number}}|null}
 */
export function locationCameraView({
  point,
  normal = { x: 0, z: 1 },
  groundY = 0,
  footprints = [],
  reservations = [],
  obstacles = [],
  waterAt = () => false,
  elevationAt = () => groundY,
  safeAt = () => true,
  fallbackPlayer,
  beachView,
  aspect = 1.5,
}) {
  if (!finite(point) || !Number.isFinite(groundY)) return null;
  let entrance = { x: point.x, z: point.z },
    direction = { ...normal };
  if (beachView?.seaward) {
    direction = { x: -beachView.seaward.x, z: -beachView.seaward.z };
  } else {
    // Generic map pins can lie inside a terminal, museum or residential block.
    // Use the nearest exterior edge rather than spawning inside its roof.
    const containing = footprints.find((ring) => inside(entrance, ring));
    if (containing) {
      const area = containing.reduce((sum, a, i) => {
        const b = containing[(i + 1) % containing.length];
        return sum + a.x * b.z - b.x * a.z;
      }, 0);
      const edges = containing.map((a, i) => {
        const b = containing[(i + 1) % containing.length],
          dx = b.x - a.x,
          dz = b.z - a.z,
          length = Math.hypot(dx, dz) || 1,
          t = Math.max(
            0,
            Math.min(
              1,
              ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length),
            ),
          );
        return {
          point: { x: a.x + dx * t, z: a.z + dz * t },
          normal: {
            x: (area > 0 ? dz : -dz) / length,
            z: (area > 0 ? -dx : dx) / length,
          },
          distance: distanceToSegment(point, a, b),
        };
      });
      const edge = edges.sort((a, b) => a.distance - b.distance)[0];
      entrance = edge.point;
      direction = edge.normal;
    }
  }
  const length = Math.hypot(direction.x, direction.z) || 1;
  direction = { x: direction.x / length, z: direction.z / length };
  const at = (out, along) => ({
    x: entrance.x + direction.x * out - direction.z * along,
    z: entrance.z + direction.z * out + direction.x * along,
  });
  const clear = (p, padding = 0.65, furniture = true) =>
    finite(p) &&
    !waterAt(p) &&
    Number.isFinite(elevationAt(p)) &&
    footprints.every(
      (ring) =>
        !inside(p, ring) &&
        ring.every(
          (a, i) =>
            distanceToSegment(p, a, ring[(i + 1) % ring.length]) >= padding,
        ),
    ) &&
    (!furniture ||
      reservations.every(
        (q) => Math.hypot(p.x - q.x, p.z - q.z) >= (q.radius || 0) + padding,
      ));
  const candidates = [0.9, 1.2, 1.6, 2, 2.6, 4.4, 6.5, 9, 14].flatMap((out) =>
    [0, 1.5, -1.5, 2.5, -2.5, 5, -5, 8, -8].map((along) => at(out, along)),
  );
  let visitor = candidates.find((p) => clear(p) && safeAt(p));
  // Open plazas, parks and free-standing custom pins may need a different
  // approach direction; the bounded fallback also accommodates narrow coves.
  if (!visitor)
    for (const radius of [10, 20, 36, 60]) {
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8,
          p = {
            x: entrance.x + Math.cos(angle) * radius,
            z: entrance.z + Math.sin(angle) * radius,
          };
        if (clear(p) && safeAt(p)) {
          visitor = p;
          break;
        }
      }
      if (visitor) break;
    }
  if (
    !visitor &&
    finite(fallbackPlayer) &&
    clear(fallbackPlayer) &&
    safeAt(fallbackPlayer)
  )
    visitor = { x: fallbackPlayer.x, z: fallbackPlayer.z };
  if (!visitor) return null;
  const ground = elevationAt(visitor),
    entranceWeight = Math.min(
      0.35,
      3 /
        Math.max(1, Math.hypot(visitor.x - entrance.x, visitor.z - entrance.z)),
    ),
    target = {
      x: visitor.x * (1 - entranceWeight) + entrance.x * entranceWeight,
      y: ground + 1.35,
      z: visitor.z * (1 - entranceWeight) + entrance.z * entranceWeight,
    },
    zoom = Math.max(1, Math.min(1.3, 0.85 / Math.max(0.45, aspect)));
  const canopyClear = (p) => {
    const cameraY = Math.max(ground, elevationAt(p)) + 6.5 * zoom;
    const subjects = [
      { ...visitor, y: ground + 0.3 },
      { ...visitor, y: ground + 1.9 },
      { ...entrance, y: elevationAt(entrance) + 2.3 },
    ];
    return obstacles.every((sphere) =>
      subjects.every((subject) => {
        const dx = subject.x - p.x,
          dy = subject.y - cameraY,
          dz = subject.z - p.z,
          t = Math.max(
            0,
            Math.min(
              1,
              ((sphere.x - p.x) * dx +
                (sphere.y - cameraY) * dy +
                (sphere.z - p.z) * dz) /
                (dx * dx + dy * dy + dz * dz || 1),
            ),
          );
        return (
          Math.hypot(
            sphere.x - p.x - dx * t,
            sphere.y - cameraY - dy * t,
            sphere.z - p.z - dz * t,
          ) >
          sphere.radius + 0.35
        );
      }),
    );
  };
  const sightClear = (p) =>
    footprints.every((ring) =>
      ring.every((a, i) => !crosses(p, target, a, ring[(i + 1) % ring.length])),
    );
  const cameraCandidates = [
    [10 * zoom, 7 * zoom],
    [10 * zoom, -7 * zoom],
    [12 * zoom, 0],
    [7 * zoom, 4 * zoom],
    [7 * zoom, -4 * zoom],
    [5 * zoom, 3 * zoom],
    [5 * zoom, -3 * zoom],
    [4 * zoom, 0],
  ].map(([out, along]) => ({
    x: visitor.x + direction.x * out - direction.z * along,
    z: visitor.z + direction.z * out + direction.x * along,
  }));
  let camera = cameraCandidates.find(
    (p) => clear(p, 0.2, false) && sightClear(p) && canopyClear(p),
  );
  if (!camera)
    for (const distance of [7 * zoom, 5 * zoom, 3 * zoom]) {
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8,
          at = {
            x: visitor.x + Math.cos(angle) * distance,
            z: visitor.z + Math.sin(angle) * distance,
          };
        if (clear(at, 0.2, false) && sightClear(at) && canopyClear(at)) {
          camera = at;
          break;
        }
      }
      if (camera) break;
    }
  // Keep a camera directly above the safe visitor as a final constrained-street
  // fallback. Its horizontal sightline cannot enter a neighboring facade.
  if (!camera) {
    camera = { x: visitor.x, z: visitor.z };
    target.x = visitor.x;
    target.z = visitor.z;
  }
  camera = { ...camera, y: Math.max(ground, elevationAt(camera)) + 6.5 * zoom };
  return {
    player: { ...visitor, y: ground + 0.2 },
    angle: Math.atan2(camera.x - visitor.x, camera.z - visitor.z),
    camera,
    target,
  };
}

/** One reusable ring and one camera tween; each selection promise settles once. */
export function createLocationFocus({
  scene,
  camera,
  controls,
  reducedMotion = false,
}) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.63, 0.79, 48),
    new THREE.MeshBasicMaterial({
      color: "#4877ff",
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  ring.name = "Your selected location arrival circle";
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let tween = null,
    anchor = null,
    elapsed = 0,
    disposed = false,
    framingAspect = null,
    framingOffset = null;
  // The portrait options sheet occupies the lower half of the screen. An
  // off-axis projection keeps the safe world camera and its clear sightlines,
  // while leaving the complete visitor above the sheet. Normal views use the
  // camera's original projection again, including after a viewport rotation.
  const framePortrait = (progress = 1) => {
    if (anchor && camera.aspect < 0.8) {
      const offset = 0.24 * progress;
      if (framingAspect === camera.aspect && framingOffset === offset) return;
      framingAspect = camera.aspect;
      framingOffset = offset;
      camera.setViewOffset(camera.aspect, 1, 0, offset, camera.aspect, 1);
    } else if (framingAspect !== null) {
      camera.clearViewOffset();
      framingAspect = framingOffset = null;
    }
  };
  const settle = (completed) => {
    if (!tween) return;
    const resolve = tween.resolve;
    tween = null;
    resolve(completed);
  };
  const interrupt = () => settle(false);
  const clear = () => {
    interrupt();
    anchor = null;
    ring.visible = false;
    framePortrait();
  };
  return {
    ring,
    get active() {
      return Boolean(tween);
    },
    start(view, player) {
      clear();
      if (disposed || !view || !player) return Promise.resolve(false);
      anchor = player.position.clone();
      elapsed = 0;
      ring.position.copy(player.position);
      ring.position.y += 0.025;
      ring.visible = true;
      const position = new THREE.Vector3(
          view.camera.x,
          view.camera.y,
          view.camera.z,
        ),
        target = new THREE.Vector3(view.target.x, view.target.y, view.target.z);
      if (reducedMotion) {
        framePortrait();
        camera.position.copy(position);
        controls.target.copy(target);
        controls.update();
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        tween = {
          fromPosition: camera.position.clone(),
          fromTarget: controls.target.clone(),
          position,
          target,
          elapsed: 0,
          resolve,
        };
      });
    },
    update(dt, player, motion = true, visible = true) {
      if (disposed) return;
      if (tween) {
        tween.elapsed += Math.max(0, dt);
        const progress =
            tween.elapsed >= 0.65 - 1e-9 ? 1 : tween.elapsed / 0.65,
          eased = progress * progress * (3 - 2 * progress);
        camera.position.lerpVectors(tween.fromPosition, tween.position, eased);
        controls.target.lerpVectors(tween.fromTarget, tween.target, eased);
        framePortrait(eased);
        if (progress === 1) {
          camera.position.copy(tween.position);
          controls.target.copy(tween.target);
        }
        controls.update();
        if (progress === 1) settle(true);
      }
      if (!anchor || !player || player.position.distanceTo(anchor) > 2.4) {
        clear();
        return;
      }
      ring.visible = visible;
      if (!tween) framePortrait();
      ring.position.copy(player.position);
      ring.position.y += 0.025;
      if (motion && !reducedMotion) elapsed += Math.max(0, dt);
      const pulse =
        motion && !reducedMotion
          ? (Math.sin(elapsed * Math.PI * 1.5) + 1) / 2
          : 0.5;
      ring.scale.setScalar(1 + pulse * 0.13);
      ring.material.opacity = 0.48 + pulse * 0.4;
    },
    interrupt,
    clear,
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      ring.removeFromParent();
      ring.geometry.dispose();
      ring.material.dispose();
    },
  };
}
