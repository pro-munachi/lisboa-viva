import * as THREE from "three";
import { lightingForMinute } from "./city-lighting";

function textureCanvas(size, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createCityAtmosphere(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  const horizon = "#dae5e0";
  scene.background = new THREE.Color(horizon);
  scene.fog = new THREE.Fog(horizon, 1800, 13000);

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color("#80b8d0") },
      horizon: { value: new THREE.Color(horizon) },
      sunDirection: { value: new THREE.Vector3(-0.32, 0.66, 0.5).normalize() },
      night: { value: 0 },
      sunGlow: { value: new THREE.Color("#24190b") },
    },
    vertexShader: `varying vec3 direction;
      void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 top;uniform vec3 horizon;uniform vec3 sunDirection;uniform vec3 sunGlow;uniform float night;varying vec3 direction;
      void main(){vec3 d=normalize(direction);float gradient=pow(max(d.y,0.),.48);
        vec3 color=mix(horizon,top,gradient);float glow=pow(max(dot(d,sunDirection),0.),18.);
        color+=sunGlow*glow;
        vec2 starUV=vec2(atan(d.z,d.x),asin(clamp(d.y,-1.,1.)))*220.;
        float seed=fract(sin(dot(floor(starUV),vec2(127.1,311.7)))*43758.5453);
        float star=(1.-smoothstep(.025,.095,length(fract(starUV)-.5)))*step(.999,seed)*smoothstep(.1,.4,d.y);
        color+=vec3(.64,.72,.9)*star*night;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60000, 24, 12),
    skyMaterial,
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const pavingTexture = textureCanvas(256, (ctx, size) => {
    ctx.fillStyle = "#d8d4c4";
    ctx.fillRect(0, 0, size, size);
    const step = 16;
    for (let y = 0; y < size; y += step)
      for (let x = 0; x < size; x += step) {
        const band = Math.cos(
          (y / size) * Math.PI * 4 + Math.sin((x / size) * Math.PI * 2) * 1.9,
        );
        const shade = (x * 17 + y * 31) % 7;
        ctx.fillStyle =
          band > 0.73
            ? ["#827d70", "#777367", "#8c877b"][shade % 3]
            : ["#e5dfce", "#d6d1c0", "#e0daca", "#ccc8b9"][shade % 4];
        ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
      }
  });
  const asphaltTexture = textureCanvas(128, (ctx, size) => {
    ctx.fillStyle = "#9caaa9";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = i % 2 ? "rgba(45,58,59,.10)" : "rgba(255,255,240,.10)";
      ctx.fillRect(
        (i * 73) % size,
        (i * 37 + Math.floor(i / size)) % size,
        1,
        1,
      );
    }
  });
  const paving = new THREE.MeshStandardMaterial({
    color: "#f4edda",
    map: pavingTexture,
    roughness: 0.98,
  });
  const asphalt = new THREE.MeshStandardMaterial({
    color: "#9aabae",
    map: asphaltTexture,
    roughness: 0.93,
  });
  const rail = new THREE.MeshStandardMaterial({
    color: "#7b817c",
    roughness: 0.95,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: "#b3b9b5",
    metalness: 0.55,
    roughness: 0.45,
  });
  const lane = new THREE.MeshStandardMaterial({
    color: "#e1dac4",
    roughness: 1,
  });
  const path = new THREE.MeshStandardMaterial({
    color: "#cfc6ad",
    roughness: 1,
  });
  const water = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deep: { value: new THREE.Color("#4b8292") },
        shallow: { value: new THREE.Color("#76b0b9") },
        reflection: { value: new THREE.Color("#96bfc4") },
        night: { value: 0 },
      },
    ]),
    vertexShader: `varying vec3 worldPosition;
      #include <fog_pars_vertex>
      void main(){worldPosition=(modelMatrix*vec4(position,1.)).xyz;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time;uniform vec3 deep;uniform vec3 shallow;uniform vec3 reflection;uniform float night;varying vec3 worldPosition;
      #include <fog_pars_fragment>
      void main(){vec2 p=worldPosition.xz;
        float broad=sin(p.x*.024+p.y*.047+time*.34)*.5+.5;
        float wave=sin(p.x*.71+p.y*1.23+sin(p.y*.23+time*.7)*.58+time*1.1);
        float ripple=pow(max(wave,0.),22.);
        vec3 direction=normalize(cameraPosition-worldPosition);
        float fresnel=pow(1.-max(direction.y,0.),3.);
        vec3 color=mix(deep,shallow,.28+broad*.28);
        color=mix(color,reflection,fresnel*.4);
        color+=vec3(.19,.21,.16)*ripple*(.12+broad*.26)*(1.-night*.65);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const materials = [
    skyMaterial,
    paving,
    asphalt,
    rail,
    steel,
    lane,
    path,
    water,
  ];
  let elapsed = 0;
  function setLighting(state, exterior = true) {
    renderer.toneMappingExposure = state.exposure;
    if (!exterior) return;
    skyMaterial.uniforms.top.value.set(state.skyTop);
    skyMaterial.uniforms.horizon.value.set(state.horizon);
    skyMaterial.uniforms.night.value = state.night;
    skyMaterial.uniforms.sunDirection.value.copy(state.sunOffset).normalize();
    skyMaterial.uniforms.sunGlow.value
      .set(state.sunColor)
      .multiplyScalar(0.16 * (1 - state.night) + 0.035 * state.night);
    water.uniforms.deep.value.set(state.waterDeep);
    water.uniforms.shallow.value.set(state.waterShallow);
    water.uniforms.reflection.value.set(state.waterReflection);
    water.uniforms.night.value = state.night;
    scene.background?.set(state.horizon);
    scene.fog?.color.set(state.horizon);
  }
  setLighting(lightingForMinute(660));
  return {
    materials,
    horizon,
    sky,
    water,
    paving,
    asphalt,
    rail,
    steel,
    lane,
    path,
    setLighting,
    roadMaterial(kind) {
      return ["rail", "tram"].includes(kind)
        ? rail
        : ["footway", "pedestrian", "steps"].includes(kind)
          ? paving
          : kind === "path"
            ? path
            : asphalt;
    },
    update(camera, delta, motion) {
      sky.position.copy(camera.position);
      if (motion) elapsed += delta;
      water.uniforms.time.value = elapsed;
    },
    dispose() {
      pavingTexture.dispose();
      asphaltTexture.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}
