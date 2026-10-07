import * as T from "three";
// Original procedural ROAM artwork. Geometry is generated locally; no external models.
export function createWorld(host, place, shirt, onSelect) {
  const state = { accent: "#292942", place, bought: false, shirt };
  const selected =
    place === "home"
      ? "bed"
      : place === "exchange"
        ? "counter"
        : place === "cafe"
          ? "coffee"
          : place === "viewpoint"
            ? "view"
            : place === "riverside"
              ? "river"
              : "listen";
  const active = null;
  let world;
  const select = (id) => onSelect(id);
  const accentText = () => "#ffffff";
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  host.append(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-10, 10, 8, -8, 0.1, 100);
  camera.position.set(12, 13, 16);
  camera.lookAt(0, 0.3, 0);
  const dark = () => false;
  scene.background = new T.Color(dark() ? "#25293e" : "#c9d5d7");
  scene.add(new T.HemisphereLight("#fff4e3", "#626f67", 2.2));
  const light = new T.DirectionalLight("#fff0d3", 3);
  light.position.set(-4, 12, 7);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {
    left: -12,
    right: 12,
    top: 12,
    bottom: -12,
  });
  light.shadow.normalBias = 0.03;
  scene.add(light);
  let room = new T.Group();
  scene.add(room);
  let hits = [],
    targets = {},
    player = null,
    highlighted = [];
  let dest = new T.Vector3(0, 0, 2.5);
  let floorMesh = null;
  let last = 0;
  let destroyed = false;
  const clock = new T.Clock();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mat = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.83 });
  function box(w, h, d, c, x, y, z, parent = room) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(rt, rb, h, c, x, y, z, parent = room, n = 12) {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, n), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(r, c, x, y, z, parent = room) {
    const m = new T.Mesh(new T.SphereGeometry(r, 12, 8), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function label(text, color = "#292942") {
    const cvs = document.createElement("canvas");
    cvs.width = 256;
    cvs.height = 80;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(8, 5, 240, 65, 28);
    ctx.fill();
    ctx.fillStyle = accentText(color);
    ctx.font = "500 30px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 38);
    const tex = new T.CanvasTexture(cvs);
    const s = new T.Sprite(
      new T.SpriteMaterial({ map: tex, depthTest: false }),
    );
    s.scale.set(1.15, 0.36, 1);
    s.renderOrder = 3;
    return s;
  }
  function avatar(x, z, shirt, skin, name) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    room.add(g);
    box(0.19, 0.58, 0.22, "#34333c", -0.13, 0.4, 0, g);
    box(0.19, 0.58, 0.22, "#34333c", 0.13, 0.4, 0, g);
    box(0.22, 0.1, 0.38, "#f1eadc", -0.13, 0.12, 0.07, g);
    box(0.22, 0.1, 0.38, "#f1eadc", 0.13, 0.12, 0.07, g);
    const torso = box(0.49, 0.55, 0.3, shirt, 0, 0.96, 0, g);
    cyl(0.14, 0.14, 0.13, skin, 0, 1.3, 0, g);
    sphere(0.235, skin, 0, 1.52, 0, g);
    sphere(0.24, "#292329", 0, 1.62, -0.035, g);
    box(0.15, 0.37, 0.19, shirt, -0.33, 1.01, 0, g);
    box(0.15, 0.37, 0.19, shirt, 0.33, 1.01, 0, g);
    cyl(0.07, 0.07, 0.29, skin, -0.33, 0.71, 0, g);
    cyl(0.07, 0.07, 0.29, skin, 0.33, 0.71, 0, g);
    if (name) {
      const tag = label(name, name === "YOU" ? state.accent : "#526661");
      tag.position.set(0, 2.07, 0);
      g.add(tag);
      g.userData.tag = tag;
    }
    g.userData.torso = torso;
    return g;
  }
  function object(id, x, z, make) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    room.add(g);
    make(g);
    g.traverse((m) => {
      if (m.isMesh) {
        m.userData.objectId = id;
        hits.push(m);
      }
    });
    targets[id] = new T.Vector3(x, 0, z + 0.9);
    return g;
  }
  function plant(x, z) {
    cyl(0.26, 0.18, 0.5, "#b98b6b", x, 0.25, z);
    cyl(0.035, 0.04, 0.8, "#65704b", x, 0.8, z);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const leaf = sphere(
        0.27,
        i % 2 ? "#6c8d59" : "#4c7554",
        x + Math.sin(a) * 0.19,
        1.08 + i * 0.07,
        z + Math.cos(a) * 0.18,
      );
      leaf.scale.set(0.7, 1.9, 0.45);
      leaf.rotation.z = Math.sin(a) * 0.7;
    }
  }
  function table(x, z) {
    box(2, 0.13, 1.05, "#b78b60", x, 0.87, z);
    [-0.8, 0.8].forEach((a) =>
      [-0.35, 0.35].forEach((b) =>
        box(0.12, 0.82, 0.12, "#8c674a", x + a, 0.43, z + b),
      ),
    );
    box(2, 0.12, 0.28, "#b18b60", x, 0.46, z + 0.88);
    [-0.8, 0.8].forEach((a) =>
      box(0.12, 0.42, 0.14, "#8c674a", x + a, 0.23, z + 0.88),
    );
    cyl(0.18, 0.18, 0.05, "#efeadd", x - 0.4, 0.97, z);
  }
  function sign(text, x, y, z) {
    const cvs = document.createElement("canvas");
    cvs.width = 640;
    cvs.height = 160;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = "#574247";
    ctx.fillRect(0, 0, 640, 160);
    ctx.fillStyle = "#f9eddc";
    ctx.font = "500 59px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, 320, 98);
    const m = new T.Mesh(
      new T.PlaneGeometry(3.25, 0.81),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(cvs) }),
    );
    m.position.set(x, y, z);
    room.add(m);
  }
  const ground = box(
    200,
    0.12,
    200,
    dark() ? "#25293e" : "#c9d5d7",
    0,
    -0.36,
    0,
    scene,
  );
  ground.receiveShadow = true;
  const backdrop = new T.Group();
  scene.add(backdrop);
  for (let i = 0; i < 9; i++) {
    const x = -10 + i * 2.5,
      z = -9 - Math.abs(i - 4) * 0.23,
      h = 1.7 + (i % 3) * 0.65;
    box(
      1.7,
      h,
      1.65,
      ["#e6cfab", "#dba58c", "#d5d7bd"][i % 3],
      x,
      h / 2 - 0.32,
      z,
      backdrop,
    );
    const roof = new T.Mesh(new T.ConeGeometry(1.42, 0.78, 4), mat("#b36f54"));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, h + 0.07, z);
    roof.castShadow = true;
    backdrop.add(roof);
    for (let j = 0; j < 2; j++) {
      box(
        0.32,
        0.5,
        0.04,
        "#7b949a",
        x - 0.42 + j * 0.83,
        h * 0.64,
        z + 0.85,
        backdrop,
      );
      box(
        0.38,
        0.06,
        0.09,
        "#f3e4ce",
        x - 0.42 + j * 0.83,
        h * 0.64 - 0.27,
        z + 0.89,
        backdrop,
      );
    }
  }
  box(3.2, 0.82, 1, "#d9b34a", 7, 0.3, 1.4, backdrop);
  box(3.3, 0.11, 1.08, "#e4d9ba", 7, 0.77, 1.4, backdrop);
  for (let i = 0; i < 5; i++)
    box(0.4, 0.35, 0.02, "#73929b", 5.85 + i * 0.56, 0.45, 1.92, backdrop);
  [-1.05, 1.05].forEach((dx) => {
    const wheel = cyl(
      0.19,
      0.19,
      0.12,
      "#4d5657",
      7 + dx,
      -0.08,
      1.94,
      backdrop,
    );
    wheel.rotation.x = Math.PI / 2;
  });
  function build(place) {
    hits = [];
    targets = {};
    scene.remove(room);
    room.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      if (o.isSprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    room = new T.Group();
    scene.add(room);
    floorMesh = cyl(
      6,
      6,
      0.35,
      place === "home" ? "#d5c3b4" : "#c6becd",
      0,
      -0.175,
      0,
      room,
      8,
    );
    floorMesh.userData.floor = true;
    hits.push(floorMesh);
    box(
      10,
      2.8,
      0.18,
      dark() ? "#817586" : place === "home" ? "#e8d9d0" : "#deba8e",
      0,
      1.4,
      -4.25,
    );
    box(
      0.18,
      2.8,
      4.2,
      dark() ? "#736877" : place === "home" ? "#ded0c3" : "#b6b9ca",
      -5,
      1.4,
      -2.2,
    );
    box(10, 0.12, 0.08, "#f1e8da", 0, 0.07, -4.1);
    box(0.08, 0.12, 4.2, "#f1e8da", -4.9, 0.07, -2.2);
    for (let i = 0; i < 18; i++) {
      const a = (i * Math.PI) / 9;
      const mark = box(
        0.25,
        0.018,
        0.46,
        i % 2 ? "#807c77" : "#e8e1d5",
        Math.cos(a) * 5.35,
        0.025,
        Math.sin(a) * 5.35,
      );
      mark.rotation.y = -a;
    }
    for (let ix = 0; ix < 19; ix++)
      for (let iy = 0; iy < 2; iy++) {
        box(
          0.48,
          0.26,
          0.026,
          (ix + iy) % 2 ? "#6487a4" : "#f1ecdf",
          -4.55 + ix * 0.5,
          0.26 + iy * 0.29,
          -4.14,
        );
      }
    box(
      4.5,
      0.015,
      3.2,
      place === "home" ? "#e4d8c9" : "#d4c9d9",
      -2.1,
      0.014,
      1.1,
    );
    box(
      3.6,
      0.015,
      3.7,
      place === "home" ? "#c4b2a4" : "#bab1c6",
      2,
      0.014,
      -1.5,
    );
    for (let i = 0; i < 7; i++) {
      box(0.035, 0.02, 3.2, "#b7a796", -4.1 + i * 0.6, 0.027, 1.1);
    }
    box(0.09, 2, 1, "#8d7668", -4.87, 1.02, 2.4);
    box(0.02, 1.82, 0.8, "#ad927a", -4.81, 1.02, 2.4);
    sphere(0.05, "#e2c773", -4.75, 1, 2.72);
    box(1.8, 1.17, 0.03, "#9eac9c", 2.85, 1.7, -4.12);
    [-0.8, 0, 0.8].forEach((x) =>
      box(0.04, 1.3, 0.06, "#f3eadd", 2.85 + x, 1.7, -4.05),
    );
    box(1.95, 0.06, 0.06, "#f3eadd", 2.85, 2.34, -4.05);
    box(1.95, 0.06, 0.06, "#f3eadd", 2.85, 1.07, -4.05);
    plant(4.35, -3.1);
    plant(-4.3, -3.4);
    const special = !["home", "exchange"].includes(place);
    if (special) {
      const outdoor = place === "viewpoint" || place === "riverside";
      if (outdoor) {
        room.children
          .filter((m) => m.isMesh && m.position.y > 1)
          .forEach((m) => {
            m.visible = false;
          });
        for (let i = 0; i < 6; i++) {
          box(0.1, 0.76, 0.1, "#a79982", -4.5 + i * 1.7, 0.4, -3.55);
          if (i < 5)
            box(1.7, 0.08, 0.08, "#a79982", -3.65 + i * 1.7, 0.8, -3.55);
        }
        plant(-4, 1.6);
        plant(3.9, 2);
      }
      if (place === "cafe") {
        sign("CAFÉ / BAIXA", 0.8, 2.14, -4.13);
        object("coffee", 1.4, -2.8, (g) => {
          box(3, 0.96, 1, "#6f9088", 0, 0.5, 0, g);
          box(3.2, 0.1, 1.15, "#eee1c8", 0, 1.03, 0, g);
          box(0.8, 0.5, 0.5, "#737575", 0.75, 1.34, 0, g);
          cyl(0.13, 0.12, 0.18, "#efe5d3", -0.8, 1.19, 0.1, g);
          cyl(0.2, 0.2, 0.06, "#d4a862", -0.2, 1.1, 0.18, g);
        });
        table(-1.8, 0.8);
        table(1.2, 2.25);
      } else if (place === "viewpoint") {
        object("view", 0.4, -2.65, (g) => {
          box(2.4, 0.15, 0.6, "#c1a783", 0, 0.55, 0, g);
          box(2.4, 0.6, 0.12, "#ab9277", 0, 0.9, -0.32, g);
          [-0.9, 0.9].forEach((x) =>
            box(0.1, 0.52, 0.42, "#7b7369", x, 0.25, 0, g),
          );
        });
        cyl(0.4, 0.3, 0.9, "#b48f68", 3, 0.45, -1.5);
        plant(-2.8, -1.7);
      } else if (place === "riverside") {
        const water = box(12, 0.04, 6, "#76a4b2", 0, -0.22, -7.5);
        water.castShadow = false;
        object("river", 0.4, 1.1, (g) => {
          box(3, 0.15, 0.58, "#b29a77", 0, 0.52, 0, g);
          box(3, 0.54, 0.12, "#9f8969", 0, 0.88, -0.3, g);
          [-1.15, 1.15].forEach((x) =>
            box(0.12, 0.5, 0.4, "#74756b", x, 0.23, 0, g),
          );
        });
        object("view", -2.6, -2.6, (g) => {
          cyl(0.14, 0.14, 1, "#859496", 0, 0.5, 0, g);
          const viewer = box(0.48, 0.25, 0.22, "#68757d", 0, 1.11, 0, g);
          viewer.rotation.y = 0.4;
        });
      } else if (place === "music") {
        sign("THE LISTENING ROOM", 0.8, 2.14, -4.13);
        box(3.8, 0.26, 1.9, "#7a667f", 0.9, 0.13, -2.4);
        object("listen", 1, -2.35, (g) => {
          box(1.9, 0.6, 0.8, "#554558", 0, 0.58, 0, g);
          box(2, 0.08, 0.85, "#777791", 0, 0.92, 0, g);
          [-1.7, 1.7].forEach((x) => {
            box(0.55, 1.5, 0.5, "#48434d", x, 0.9, 0, g);
            cyl(0.16, 0.16, 0.03, "#76657d", x, 1.2, 0.27, g);
          });
        });
        table(-1.8, 1.4);
      }
      const neighbour = avatar(-1.7, -0.4, "#bd8d77", "#946347", "Inês");
      neighbour.traverse((m) => {
        if (m.isMesh) {
          m.userData.objectId = "mama";
          hits.push(m);
        }
      });
      targets.mama = new T.Vector3(-1.7, 0, 0.5);
      avatar(2.9, 1.5, "#839eaa", "#76503d", "Tomás");
      player = avatar(0.3, 2.2, state.shirt, "#966342", "YOU");
    } else if (place === "home") {
      object("bed", -2.65, -2.8, (g) => {
        box(1.8, 0.36, 2.55, "#a98162", 0, 0.3, 0, g);
        box(1.78, 0.22, 2.5, "#f7f0e5", 0, 0.59, 0, g);
        box(1.82, 0.06, 1.65, state.accent, 0, 0.73, 0.37, g);
        box(0.7, 0.14, 0.46, "#fff8ec", -0.42, 0.78, -0.88, g);
        box(0.7, 0.14, 0.46, "#fff8ec", 0.42, 0.78, -0.88, g);
        box(1.82, 1, 0.14, "#9a755a", 0, 0.66, -1.28, g);
      });
      object("stove", 1.1, -3.55, (g) => {
        box(1.2, 0.95, 0.7, "#d5c8b8", 0, 0.48, 0, g);
        box(1.2, 0.06, 0.74, "#494d46", 0, 0.98, 0, g);
        cyl(0.22, 0.22, 0.2, "#454b3d", 0, 1.12, 0, g);
        box(0.76, 0.36, 0.025, "#66675f", 0, 0.53, 0.36, g);
        box(0.1, 0.12, 0.03, "#9b968c", 0.45, 0.8, 0.37, g);
      });
      object("sink", 3.1, -3.3, (g) => {
        box(1.45, 0.92, 0.95, "#b19075", 0, 0.47, 0, g);
        box(1.5, 0.07, 1, "#eee9dc", 0, 0.98, 0, g);
        box(0.74, 0.02, 0.56, "#9baca6", 0, 1.03, 0, g);
        cyl(0.027, 0.027, 0.4, "#9ba6a1", 0, 1.2, -0.28, g);
        box(0.06, 0.05, 0.23, "#9ba6a1", 0, 1.38, -0.19, g);
      });
      object("sofa", -2.9, 1.9, (g) => {
        box(2.2, 0.38, 0.86, "#698573", 0, 0.4, 0, g);
        box(2.2, 0.76, 0.23, "#527260", 0, 0.85, -0.46, g);
        box(0.23, 0.64, 1, "#527260", -1.07, 0.6, 0, g);
        box(0.23, 0.64, 1, "#527260", 1.07, 0.6, 0, g);
        box(0.78, 0.14, 0.63, "#7c9a7f", -0.47, 0.66, 0.07, g);
        box(0.78, 0.14, 0.63, "#7c9a7f", 0.47, 0.66, 0.07, g);
      });
      table(0.2, 1.85);
      if (state.bought)
        object("guitar", 3, 1.4, (g) => {
          const a = sphere(0.29, "#c69b61", 0, 0.48, 0, g);
          a.scale.set(1, 1.2, 0.35);
          const b = sphere(0.22, "#c69b61", 0, 0.78, 0, g);
          b.scale.set(1, 1, 0.35);
          box(0.08, 0.68, 0.07, "#845d3d", 0, 1.22, 0, g);
          sphere(0.075, "#564536", 0, 0.66, 0.106, g);
        });
      player = avatar(0.2, 0.4, state.shirt, "#966342", "YOU");
    } else {
      sign("ATELIER ALFAMA", 0.8, 2.14, -4.13);
      object("counter", 1.35, -2.85, (g) => {
        box(3.7, 0.92, 1.04, "#a9634c", 0, 0.48, 0, g);
        box(3.86, 0.12, 1.18, "#eadfc8", 0, 0.99, 0, g);
        box(1.2, 0.025, 0.65, "#7c8da9", -0.75, 1.08, 0, g);
        box(0.66, 0.035, 0.44, "#f3e8d2", -0.55, 1.12, 0, g);
        cyl(0.18, 0.18, 0.34, "#ac82bd", 0.75, 1.23, -0.1, g);
        box(0.4, 0.36, 0.32, "#bd947c", 1.3, 1.26, 0.1, g);
      });
      object("bowl", 4.1, 0.5, (g) => {
        cyl(0.35, 0.24, 0.7, "#ad8d66", 0, 0.36, 0, g);
        cyl(0.4, 0.35, 0.16, "#76a4a5", 0, 0.79, 0, g);
      });
      const mama = avatar(0.9, -3.72, "#8580b5", "#835535", null);
      mama.scale.set(0.95, 0.95, 0.95);
      mama.traverse((m) => {
        if (m.isMesh) {
          m.userData.objectId = "mama";
          hits.push(m);
        }
      });
      targets.mama = new T.Vector3(1, -1, -1.9);
      targets.mama.y = 0;
      table(-1.6, 0.7);
      table(1.25, 2.2);
      avatar(-2.75, 0.65, "#6573a7", "#825139", "Inês");
      avatar(2.3, 1.7, "#c77962", "#684530", "Noor");
      avatar(-0.6, -1.15, "#799770", "#ad7750", "Tomás");
      player = avatar(-0.4, 2.2, state.shirt, "#966342", "YOU");
    }
    if (place === "home") targets.bed.set(-3.4, 0, -2.8);
    dest.copy(player.position);
    const ring = new T.Mesh(
      new T.RingGeometry(0.34, 0.4, 40),
      new T.MeshBasicMaterial({ color: state.accent, side: T.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    player.add(ring);
    player.userData.ring = ring;
    highlight(selected);
  }
  function highlight(id) {
    highlighted.forEach((m) => {
      m.material.emissive?.set("#000000");
    });
    highlighted = hits.filter((m) => m.userData.objectId === id);
    highlighted.forEach((m) => {
      m.material.emissive?.set(state.accent);
      if (m.material.emissive) m.material.emissiveIntensity = 0.055;
    });
  }
  function goTo(id) {
    if (targets[id]) dest.copy(targets[id]);
  }
  function accent() {
    player?.userData.ring?.material.color.set(state.accent);
    if (player?.userData.tag) {
      const tag = player.userData.tag;
      tag.material.map.dispose();
      tag.material.dispose();
      player.remove(tag);
      const newer = label("YOU", state.accent);
      newer.position.set(0, 2.07, 0);
      player.add(newer);
      player.userData.tag = newer;
    }
    highlight(selected);
  }
  world = {
    build,
    highlight,
    goTo,
    endAction: () => {
      if (player) {
        player.rotation.z = 0;
        player.position.y = 0;
        player.userData.ring.visible = true;
      }
    },
    accent,
    warmWalls: () => {
      room.children
        .filter((m) => m.isMesh && m.position.y === 1.4)
        .forEach((m) => m.material.color.set("#d3bcaa"));
    },
  };
  build(state.place);
  const ray = new T.Raycaster();
  const pointer = new T.Vector2();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const found = ray.intersectObjects(hits, false)[0];
    if (!found) return;
    if (found.object.userData.objectId) {
      select(found.object.userData.objectId);
      goTo(found.object.userData.objectId);
    } else if (!active && found.object.userData.floor) {
      dest.copy(found.point);
      dest.y = 0;
      dest.x = Math.max(-4.3, Math.min(4.3, dest.x));
      dest.z = Math.max(-3.5, Math.min(3.5, dest.z));
    }
  });
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const size = Math.max(5.8, 7 / aspect);
    camera.left = -size * aspect;
    camera.right = size * aspect;
    camera.top = size;
    camera.bottom = -size;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function animate() {
    if (destroyed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (player) {
      const distance = Math.hypot(
        player.position.x - dest.x,
        player.position.z - dest.z,
      );
      if (distance > 0.06) {
        player.rotation.z = 0;
        player.userData.ring.visible = true;
        if (reduced) player.position.copy(dest);
        else {
          const direction = dest.clone().sub(player.position);
          direction.y = 0;
          const step = Math.min(distance, dt * 2.5);
          player.position.add(direction.normalize().multiplyScalar(step));
          player.rotation.y = Math.atan2(direction.x, direction.z);
          player.position.y = Math.sin(performance.now() * 0.014) * 0.025;
        }
      } else if (active?.target === "bed") {
        player.rotation.set(0, 0, -Math.PI / 2);
        player.position.y = 0.8;
        player.userData.ring.visible = false;
      } else {
        player.position.y = 0;
        player.rotation.z = 0;
        player.userData.ring.visible = true;
      }
    }
    renderer.render(scene, camera);
    last = requestAnimationFrame(animate);
  }
  animate();
  return () => {
    destroyed = true;
    cancelAnimationFrame(last);
    observer.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
