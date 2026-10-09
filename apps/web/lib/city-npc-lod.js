import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Original scenic NPCs retain their articulated body nearby. At a distance the
// same authored pose is one local mesh; route movement and identity stay on the
// character root. This helper never changes a player's or live peer's renderer.
export function createScenicNpcLod(character) {
  if (!character?.isObject3D) return null;
  if (character.userData.scenicNpcLod)
    return character.userData.scenicNpcLod.proxy;
  const originalChildren = character.children.slice();
  const originalVisibility = originalChildren.map((child) => child.visible);
  const parts = [],
    transform = new THREE.Matrix4();
  character.updateWorldMatrix(true, true);
  const inverseRoot = character.matrixWorld.clone().invert();
  character.traverse((node) => {
    if (!node.isMesh || Array.isArray(node.material)) return;
    for (
      let ancestor = node;
      ancestor && ancestor !== character;
      ancestor = ancestor.parent
    )
      if (!ancestor.visible) return;
    let geometry = node.geometry.clone();
    if (geometry.index) {
      const indexed = geometry;
      geometry = indexed.toNonIndexed();
      indexed.dispose();
    }
    geometry.deleteAttribute("uv");
    transform.multiplyMatrices(inverseRoot, node.matrixWorld);
    geometry.applyMatrix4(transform);
    const materialColor = node.material.color || new THREE.Color("#ffffff");
    const sourceColor = node.material.vertexColors
      ? geometry.attributes.color
      : null;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      colors[i * 3] = materialColor.r * (sourceColor ? sourceColor.getX(i) : 1);
      colors[i * 3 + 1] =
        materialColor.g * (sourceColor ? sourceColor.getY(i) : 1);
      colors[i * 3 + 2] =
        materialColor.b * (sourceColor ? sourceColor.getZ(i) : 1);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(geometry);
  });
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) return null;
  const proxy = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
  );
  proxy.name = "Distant scenic NPC";
  proxy.visible = false;
  proxy.castShadow = false;
  proxy.receiveShadow = true;
  const state = {
    proxy,
    originalChildren,
    originalVisibility,
    near: true,
    worldPoint: new THREE.Vector3(),
    cameraPoint: new THREE.Vector3(),
  };
  character.userData.scenicNpcLod = state;
  character.add(proxy);
  return proxy;
}

/** Return true while the articulated rig is visible. No per-frame allocations. */
export function updateScenicNpcLod(character, camera) {
  const state = character?.userData?.scenicNpcLod;
  if (!state || !camera?.position) return true;
  character.getWorldPosition(state.worldPoint);
  if (camera.getWorldPosition) camera.getWorldPosition(state.cameraPoint);
  else state.cameraPoint.copy(camera.position);
  const distanceSquared = state.worldPoint.distanceToSquared(state.cameraPoint);
  if (!Number.isFinite(distanceSquared)) return state.near;
  const near = state.near
    ? distanceSquared <= 55 * 55
    : distanceSquared < 45 * 45;
  if (near !== state.near) {
    state.near = near;
    for (let i = 0; i < state.originalChildren.length; i++)
      state.originalChildren[i].visible = near && state.originalVisibility[i];
    state.proxy.visible = !near;
  }
  return state.near;
}
