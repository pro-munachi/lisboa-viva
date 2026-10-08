import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const THREE = require("three");
const sceneSource = readFileSync(
  new URL("../lib/city-scene.js", import.meta.url),
  "utf8",
);
// Run the actual scene lifecycle methods without a browser/WebGL context. The
// Three groups remain real, so replacing and disposing a roster is observable.
const method = (name: string, next: string) =>
  sceneSource.slice(
    sceneSource.indexOf(`  function ${name}(`),
    sceneSource.indexOf(`  function ${next}(`),
  );
function harness() {
  const scene = new THREE.Scene(),
    peerPopulation = new THREE.Group();
  scene.add(peerPopulation);
  const env: any = {
    options: { peers: [] },
    destroyed: false,
    travelPhase: null,
    travel: {
      active: false,
      cancel() {
        this.active = false;
      },
    },
    indoor: {
      active: false,
      roster: [] as unknown[],
      updates: 0,
      setPeers(peers: unknown[]) {
        this.roster = peers;
        this.updates++;
      },
      clear() {
        this.active = false;
      },
    },
    characterGallery: null,
    manifest: { bounds: [-10, -10, 10, 10] },
    peerPopulation,
    peerMeshes: [],
    peerActors: [],
    scene,
    city: new THREE.Group(),
    population: new THREE.Group(),
    atmosphere: { sky: { visible: true } },
    exteriorLighting: { horizon: "#ffffff" },
    camera: new THREE.PerspectiveCamera(43),
    controls: {
      target: new THREE.Vector3(),
      updates: 0,
      update() {
        this.updates++;
      },
    },
    focus: { peerId: "chosen", range: 18 },
    disposed: 0,
    appearances: [],
    containsGeo: (bounds: number[], p: number[]) =>
      p[0] >= bounds[0] &&
      p[0] <= bounds[2] &&
      p[1] >= bounds[1] &&
      p[1] <= bounds[3],
    point3: ([x, z]: number[]) => new THREE.Vector3(x, 0, z),
    nearestPath: () => null,
    geoY: () => 0,
    unprojectGeo: (x: number, z: number) => [x, z],
    canvasLabel: () => new THREE.Sprite(),
  };
  env.camera.position.set(15, 25, 35);
  env.createCharacter = (appearance: any) => {
    env.appearances.push(appearance);
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    );
    return group;
  };
  env.disposeGroup = (group: any) => {
    env.disposed++;
    group.traverse((node: any) => {
      node.geometry?.dispose();
      node.material?.dispose();
    });
    group.removeFromParent();
    group.clear();
  };
  const api = new Function(
    "THREE",
    "env",
    `with (env) {
    ${method("setPeers", "refreshMarkers")}
    ${method("restoreCity", "setFocus")}
    ${method("cancelTravel", "startTravel")}
    return {setPeers, restoreCity, cancelTravel};
  }`,
  )(THREE, env);
  return { env, api };
}
const peer = (id = "chosen", topColor = "#fa876e") => ({
  id,
  handle: id,
  longitude: 1,
  latitude: 2,
  appearance: { topColor, bottomColor: "#21314e", hairColor: "#1c243b" },
});

test("presence polling preserves the selected camera and defers roster resources throughout travel", () => {
  const { env, api } = harness();
  const position = env.camera.position.toArray(),
    target = env.controls.target.toArray();
  api.setPeers([peer()]);
  assert.deepEqual(env.camera.position.toArray(), position);
  assert.deepEqual(env.controls.target.toArray(), target);
  assert.equal(env.controls.updates, 0);
  const population = env.peerPopulation,
    disposed = env.disposed,
    indoorUpdates = env.indoor.updates;
  env.travel.active = true;
  env.travelPhase = "travelling";
  api.setPeers([peer("old")]);
  const latest = [peer("latest", "#e5a742")];
  api.setPeers(latest, true);
  assert.equal(env.options.peers, latest);
  assert.equal(env.peerPopulation, population);
  assert.equal(env.disposed, disposed);
  assert.equal(
    env.indoor.updates,
    indoorUpdates,
    "travel must also defer the room roster update",
  );
  assert.deepEqual(env.camera.position.toArray(), position);
  api.cancelTravel();
  assert.equal(env.travel.active, false);
  assert.equal(env.travelPhase, null);
  assert.notEqual(env.peerPopulation, population);
  assert.equal(population.parent, null);
  assert.equal(env.peerActors.length, 1);
  assert.equal(env.peerActors[0].children[0].userData.peer.id, "latest");
  assert.equal(env.appearances.at(-1).shirt, "#e5a742");
  assert.equal(
    env.indoor.roster,
    latest,
    "returning to the city must forward the latest complete roster to public interiors",
  );
  assert.deepEqual(env.camera.position.toArray(), position);
});

test("room presence receives every latest roster while polling leaves an interior camera untouched", () => {
  const { env, api } = harness();
  const position = env.camera.position.toArray(),
    target = env.controls.target.toArray();
  api.setPeers([peer("outside")]);
  const outsideGroup = env.peerPopulation;
  env.indoor.active = true;
  const first = [
    peer("chosen"),
    { ...peer("cafe-visitor"), placeId: "cafe-123" },
  ];
  api.setPeers(first, true);
  assert.equal(env.options.peers, first);
  assert.equal(env.indoor.roster, first);
  assert.equal(env.indoor.active, true);
  assert.equal(
    outsideGroup.parent,
    null,
    "entering an interior must release old outdoor peer resources",
  );
  assert.equal(env.peerActors.length, 0);
  assert.equal(env.peerPopulation.visible, false);
  const latest = [{ ...peer("gym-visitor", "#4488ff"), placeId: "gym-456" }];
  api.setPeers(latest);
  assert.equal(env.indoor.roster, latest);
  assert.equal(env.indoor.updates, 3);
  assert.deepEqual(env.camera.position.toArray(), position);
  assert.deepEqual(env.controls.target.toArray(), target);
  assert.equal(
    env.controls.updates,
    0,
    "even explicit outdoor framing cannot override the active interior camera",
  );
});

test("public-room players never create duplicate outdoor avatars, but still reach the interior roster", () => {
  const { env, api } = harness();
  const roster = [
    { ...peer("at-cafe"), placeId: "cafe-123" },
    peer("walking"),
    { ...peer("at-gym"), placeId: "gym-456" },
    peer("outside"),
  ];
  api.setPeers(roster);
  assert.equal(env.indoor.roster, roster);
  assert.deepEqual(
    env.peerActors.map((actor: any) => actor.children[0].userData.peer.id),
    ["walking", "outside"],
  );
  assert.ok(env.peerMeshes.every((mesh: any) => !mesh.userData.peer.placeId));
  assert.equal(env.appearances.length, 2);
  const position = env.camera.position.toArray();
  api.setPeers([{ ...peer("chosen"), placeId: "cafe-123" }], true);
  assert.equal(env.peerActors.length, 0);
  assert.equal(env.peerMeshes.length, 0);
  assert.deepEqual(env.camera.position.toArray(), position);
  assert.equal(env.controls.updates, 0);
});

test("only explicit peer framing changes the camera, and invalid positions cannot create actors", () => {
  const { env, api } = harness();
  api.setPeers([peer()], true);
  assert.equal(env.controls.updates, 1);
  const framed = env.camera.position.toArray();
  api.setPeers([peer("chosen", "#4488ff")]);
  assert.deepEqual(env.camera.position.toArray(), framed);
  assert.equal(env.controls.updates, 1);
  api.setPeers([
    null,
    {},
    { ...peer(), longitude: NaN },
    { ...peer(), latitude: Infinity },
    { ...peer(), handle: 4 },
    { ...peer(), longitude: 11 },
    peer("valid"),
  ]);
  assert.equal(env.peerActors.length, 1);
  api.setPeers(Array.from({ length: 100 }, (_, i) => peer(`peer-${i}`)));
  assert.equal(env.peerActors.length, 40);
  api.setPeers([]);
  assert.equal(env.peerActors.length, 0);
  assert.equal(env.peerMeshes.length, 0);
  assert.equal(
    env.scene.children.filter((node: any) => node === env.peerPopulation)
      .length,
    1,
  );
});
