import * as T from "three";
import { createCharacter, disposeCharacter } from "./characters.js";

const fields = [
  "bodyType",
  "outfitStyle",
  "topColor",
  "bottomColor",
  "hairStyle",
  "hairColor",
  "skinTone",
  "shoeColor",
];

/**
 * A small, demand-rendered studio. It uses the same person as the city.
 * @param {{ canvas: HTMLCanvasElement|null, appearance: import('./appearance').CharacterAppearance, renderer?: any }} options
 */
export function createCharacterPreview({
  canvas,
  appearance,
  renderer = null,
}) {
  const output =
    renderer || new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
  output.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  output.outputColorSpace = T.SRGBColorSpace;
  output.toneMapping = T.ACESFilmicToneMapping;
  output.toneMappingExposure = 1.06;
  output.shadowMap.enabled = true;
  output.shadowMap.type = T.PCFSoftShadowMap;
  output.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1.02, -1.02, 0.1, 20);
  camera.position.set(0, 0.92, 5);
  camera.lookAt(0, 0.92, 0);
  scene.add(new T.HemisphereLight(0xf0f3ff, 0xb6a7a0, 0.95));
  const key = new T.DirectionalLight(0xfff2e7, 2.55);
  key.position.set(-3.5, 4.5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, {
    left: -1.5,
    right: 1.5,
    top: 2.5,
    bottom: -1.5,
    near: 0.5,
    far: 12,
  });
  key.shadow.bias = -0.001;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const fill = new T.DirectionalLight(0xdce6ff, 0.75);
  fill.position.set(3, 1.7, 2);
  scene.add(fill);
  const rim = new T.DirectionalLight(0xe5d5ff, 1.4);
  rim.position.set(1, 3, -2);
  scene.add(rim);

  const pedestal = new T.Mesh(
    new T.CylinderGeometry(0.56, 0.61, 0.065, 48),
    new T.MeshStandardMaterial({ color: 0xfaf7ff, roughness: 0.82 }),
  );
  pedestal.name = "studio pedestal";
  pedestal.position.y = -0.034;
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const base = new T.Mesh(
    new T.CylinderGeometry(0.61, 0.64, 0.045, 48),
    new T.MeshStandardMaterial({ color: 0xc1c8e5, roughness: 0.7 }),
  );
  base.name = "studio base";
  base.position.y = -0.084;
  base.receiveShadow = true;
  scene.add(base);
  const ground = new T.Mesh(
    new T.CircleGeometry(0.88, 48),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 shadowUv;
        void main() {
          shadowUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 shadowUv;
        void main() {
          float distanceFromCentre = length(shadowUv - 0.5) * 2.0;
          float softness = 1.0 - smoothstep(0.35, 1.0, distanceFromCentre);
          gl_FragColor = vec4(0.28, 0.31, 0.44, softness * 0.19);
        }
      `,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.108;
  scene.add(ground);

  let actor = null,
    signature = "",
    disposed = false,
    yaw = 0.22,
    aspect = 1,
    view = "full";
  const render = () => {
    if (!disposed) output.render(scene, camera);
  };
  function frame() {
    // Preserve enough horizontal room for turned shoulders and hair even in
    // the narrow signup column. The vertical envelope keeps outfit changes
    // from jumping the camera while the player compares their choices.
    const half = Math.max(
      view === "face" ? 0.36 : 1.02,
      (view === "face" ? 0.28 : 0.68) / aspect,
    );
    const centre = view === "face" ? 1.51 : 0.84;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.position.set(0, centre + (view === "face" ? 0.075 : 0.52), 5);
    camera.lookAt(0, centre, 0);
    camera.updateProjectionMatrix();
    pedestal.visible = base.visible = ground.visible = view === "full";
  }
  function setAppearance(next) {
    if (disposed) return;
    const key = fields.map((field) => next[field]).join("/");
    if (key === signature) return;
    const replacement = createCharacter({
      bodyType: next.bodyType,
      style: next.outfitStyle,
      shirt: next.topColor,
      trousers: next.bottomColor,
      hairStyle: next.hairStyle,
      hair: next.hairColor,
      skin: next.skinTone,
      shoes: next.shoeColor,
    });
    replacement.rotation.y = yaw;
    if (actor) disposeCharacter(actor);
    actor = replacement;
    scene.add(actor);
    signature = key;
    render();
  }
  function rotate(delta) {
    if (disposed || !Number.isFinite(delta)) return;
    yaw =
      ((((yaw + delta + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2)) -
      Math.PI;
    if (actor) actor.rotation.y = yaw;
    render();
  }
  function front() {
    if (disposed) return;
    yaw = 0;
    if (actor) actor.rotation.y = yaw;
    render();
  }
  function setView(next) {
    if (disposed || !["full", "face"].includes(next)) return;
    view = next;
    frame();
    render();
  }
  function resize(width, height) {
    if (
      disposed ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      return;
    aspect = width / height;
    output.setSize(width, height, false);
    frame();
    render();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (actor) disposeCharacter(actor);
    pedestal.geometry.dispose();
    pedestal.material.dispose();
    base.geometry.dispose();
    base.material.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    key.shadow.dispose();
    scene.clear();
    output.dispose();
    output.forceContextLoss?.();
  }
  frame();
  setAppearance(appearance);
  return { setAppearance, rotate, front, setView, resize, dispose };
}
