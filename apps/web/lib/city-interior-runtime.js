import * as THREE from "three";
import {
  createCharacter,
  animateCharacter,
  replaceCharacterAppearance,
} from "./characters";
import { createInteriorScene } from "./city-interiors";
import { findRoomRoute } from "./city-room-navigation";
import { createHotspotBadgeLayer } from "./city-hotspot-badges";
import { poseSocialGesture, resetSocialGesture } from "./city-social-gestures";
import { chatPlaceFor } from "./chat-rooms";
import { validHandle } from "./handle";

const peerUUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const peerAppearanceFields = [
  "bodyType",
  "outfitStyle",
  "topColor",
  "bottomColor",
  "hairStyle",
  "hairColor",
  "skinTone",
  "shoeColor",
];

function publicInteriorPeers(peers) {
  const seen = new Set();
  return (Array.isArray(peers) ? peers.slice(0, 40) : []).flatMap((peer) => {
    const appearance = peer?.appearance;
    if (
      !peer ||
      typeof peer.id !== "string" ||
      !peerUUID.test(peer.id) ||
      peer.id === "00000000-0000-0000-0000-000000000000" ||
      typeof peer.handle !== "string" ||
      !validHandle(peer.handle) ||
      !["tourist", "local"].includes(peer.userType) ||
      !Number.isFinite(peer.latitude) ||
      !Number.isFinite(peer.longitude) ||
      !chatPlaceFor(peer.placeId) ||
      !appearance ||
      (appearance.bodyType !== undefined &&
        !["male", "female"].includes(appearance.bodyType)) ||
      !["casual", "jacket", "dress", "tourist"].includes(
        appearance.outfitStyle,
      ) ||
      !["short", "curly", "bob", "bun"].includes(appearance.hairStyle) ||
      peerAppearanceFields
        .filter((key) => key.endsWith("Color") || key === "skinTone")
        .some(
          (key) =>
            typeof appearance[key] !== "string" ||
            !/^#[0-9a-f]{6}$/i.test(appearance[key]),
        )
    )
      return [];
    const id = peer.id.toLowerCase();
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        ...peer,
        id,
        appearance: { ...appearance, bodyType: appearance.bodyType || "male" },
      },
    ];
  });
}

function peerSeed(id) {
  let seed = 2166136261;
  for (const character of id)
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function peerNameLabel(handle) {
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  )
    return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext?.("2d");
  if (!context) return null;
  canvas.width = 512;
  canvas.height = 112;
  context.fillStyle = "#2c716d";
  context.beginPath();
  if (context.roundRect) context.roundRect(4, 4, 504, 100, 26);
  else context.rect(4, 4, 504, 100);
  context.fill();
  context.fillStyle = "#fffdf8";
  context.font = "600 31px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`@${handle}`, 256, 54);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false }),
  );
  sprite.name = `@${handle}`;
  sprite.position.y = 2.35;
  sprite.scale.set(1.8, 0.39, 1);
  sprite.renderOrder = 6;
  return sprite;
}

/** Local, original room exploration. It does not issue trip purchases or bookings. */
export function createInteriorRuntime({
  scene,
  camera,
  controls,
  disposeGroup,
  shirt,
  appearance = null,
  onZone,
  onActivity,
  onPeer = (_peer) => {},
  badgeHost,
  reducedMotion = false,
  night = 0,
}) {
  let room = null,
    actor = null,
    visit = null,
    action = null,
    selected = null,
    clock = 0,
    disposed = false,
    lightingNight = Number.isFinite(night)
      ? THREE.MathUtils.clamp(night, 0, 1)
      : 0;
  const origin = new THREE.Vector3();
  let latestPeers = [],
    peerGroup = null;
  const peersById = new Map();
  const socialGestures = new Map();
  const socialEvents = new Set();
  const badges = badgeHost
    ? createHotspotBadgeLayer(badgeHost, { onSelect: selectZone })
    : null;
  const boundsOf = () => {
    const b = room.group.userData.room?.bounds;
    return Array.isArray(b)
      ? b
      : b
        ? [b.minX, b.minZ, b.maxX, b.maxZ]
        : [-8.5, -6.5, 8.5, 6.5];
  };
  function clear() {
    badges?.clear();
    socialGestures.clear();
    socialEvents.clear();
    clearPeers();
    if (room) {
      room.dispose?.();
      disposeGroup(room.group);
    }
    room = actor = visit = action = selected = null;
  }
  function dispose() {
    if (disposed) return;
    clear();
    disposed = true;
    latestPeers = [];
    badges?.dispose();
  }

  function removePeer(record) {
    socialGestures.delete(record.actor);
    record.actor.removeFromParent();
    disposeGroup(record.actor);
    peersById.delete(record.peer.id);
  }
  function clearPeers() {
    for (const record of [...peersById.values()]) removePeer(record);
    peerGroup?.removeFromParent();
    peerGroup = null;
  }
  function freePeerPosition(id) {
    const [left, bottom, right, top] = boundsOf(),
      radius = 0.38;
    const obstacles = room.group.userData.room?.obstacles || [];
    const candidates = [];
    const columns = Math.min(40, Math.floor((right - left - radius * 2) / 1.3));
    const rows = Math.min(40, Math.floor((top - bottom - radius * 2) / 1.3));
    for (let row = 0; row <= rows; row++)
      for (let col = 0; col <= columns; col++) {
        const point = {
          x:
            left +
            radius +
            ((right - left - radius * 2) * col) / Math.max(1, columns),
          z:
            bottom +
            radius +
            ((top - bottom - radius * 2) * row) / Math.max(1, rows),
        };
        if (
          obstacles.some(
            (o) =>
              point.x >= o.minX - radius &&
              point.x <= o.maxX + radius &&
              point.z >= o.minZ - radius &&
              point.z <= o.maxZ + radius,
          ) ||
          Math.hypot(point.x - room.spawn.x, point.z - room.spawn.z) < 1.5 ||
          Math.hypot(point.x - actor.position.x, point.z - actor.position.z) <
            1.2 ||
          room.zones.some(
            (zone) =>
              Math.hypot(
                point.x - (zone.target || zone.point).x,
                point.z - (zone.target || zone.point).z,
              ) < 1,
          ) ||
          [...peersById.values()].some(
            (peer) =>
              Math.hypot(
                point.x - peer.actor.position.x,
                point.z - peer.actor.position.z,
              ) < 1.3,
          )
        )
          continue;
        candidates.push(point);
      }
    if (!candidates.length) return null;
    const offset = peerSeed(id) % candidates.length;
    for (let i = 0; i < candidates.length; i++) {
      const point = candidates[(offset + i) % candidates.length];
      if (
        findRoomRoute(room.spawn, point, {
          bounds: boundsOf(),
          obstacles,
          clearance: radius,
          cellSize: 0.4,
        }).length
      )
        return point;
    }
    return null;
  }
  function tagPeer(record, peer) {
    record.peer = peer;
    record.actor.traverse((node) => {
      node.userData.peer = peer;
    });
  }
  function refreshPeers() {
    if (!room) return;
    const allowed = visit?.kind !== "home" && chatPlaceFor(visit?.id);
    const visible = allowed
      ? latestPeers
          .filter((peer) => peer.placeId === visit.id)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, 12)
      : [];
    const next = new Set(visible.map((peer) => peer.id));
    for (const record of [...peersById.values()])
      if (!next.has(record.peer.id)) removePeer(record);
    for (const peer of visible) {
      const signature = JSON.stringify([
        peer.handle,
        peer.userType,
        ...peerAppearanceFields.map((key) => peer.appearance[key]),
      ]);
      const existing = peersById.get(peer.id);
      if (existing?.signature === signature) {
        tagPeer(existing, peer);
        continue;
      }
      const previous = existing?.actor.position.clone();
      if (existing) removePeer(existing);
      const point = previous || freePeerPosition(peer.id);
      if (!point) continue;
      if (!peerGroup) {
        peerGroup = new THREE.Group();
        peerGroup.name = "Nearby ROAM players";
        room.group.add(peerGroup);
      }
      const a = peer.appearance;
      const character = createCharacter({
        bodyType: a.bodyType,
        shirt: a.topColor,
        trousers: a.bottomColor,
        hair: a.hairColor,
        skin: a.skinTone,
        shoes: a.shoeColor,
        style: a.outfitStyle,
        hairStyle: a.hairStyle,
      });
      character.name = `ROAM player @${peer.handle}`;
      character.position.set(point.x, 0.02, point.z);
      character.rotation.y = ((peerSeed(peer.id) % 8) * Math.PI) / 4;
      const label = peerNameLabel(peer.handle);
      if (label) character.add(label);
      const record = {
        actor: character,
        peer,
        signature,
        phase: (peerSeed(peer.id) % 100) / 17,
      };
      tagPeer(record, peer);
      peersById.set(peer.id, record);
      peerGroup.add(character);
    }
    if (!peersById.size) {
      peerGroup?.removeFromParent();
      peerGroup = null;
    }
  }
  function setPeers(peers) {
    if (disposed) return;
    latestPeers = publicInteriorPeers(peers);
    refreshPeers();
  }
  function setAppearance(next) {
    if (disposed || !next) return;
    appearance = { ...next };
    shirt = next.topColor;
    if (actor) {
      socialGestures.delete(actor);
      actor = replaceCharacterAppearance(actor, next);
    }
  }
  function social(event) {
    if (
      !room ||
      disposed ||
      event?.venueId !== visit?.id ||
      !event.id ||
      socialEvents.has(event.id) ||
      ![
        "drink",
        "dance",
        "wave",
        "compliment",
        "flirt",
        "accept-challenge",
      ].includes(event.kind)
    )
      return false;
    const people = [event.actorId];
    if (event.kind === "accept-challenge" && visit.kind === "bar")
      people.push(event.targetId);
    if (event.kind === "accept-challenge" && visit.kind !== "bar") return false;
    let applied = false;
    for (const id of people) {
      const person = id === event.viewerId ? actor : peersById.get(id)?.actor;
      if (!person || !id) continue;
      socialGestures.set(person, {
        kind: event.kind,
        startedAt: clock,
        duration: reducedMotion ? 1.2 : 5,
      });
      applied = true;
    }
    if (applied) {
      socialEvents.add(event.id);
      if (socialEvents.size > 128)
        socialEvents.delete(socialEvents.values().next().value);
    }
    return applied;
  }
  function updateBadges() {
    if (!badges || disposed) return;
    badges.update(camera, {
      width: badgeHost.clientWidth,
      height: badgeHost.clientHeight,
      visible: !!room,
      selectedId: selected,
      disabled: !!action,
    });
  }
  function frameRoom() {
    if (!room) return;
    const distance = Math.max(
      31,
      24 / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect),
    );
    const centre = origin
      .clone()
      .add(
        new THREE.Vector3(
          camera.aspect > 1.25 ? 3 : 0,
          camera.aspect > 1.25 ? 0.8 : -2,
          0,
        ),
      );
    controls.target.copy(centre);
    camera.position
      .copy(centre)
      .add(
        new THREE.Vector3(distance * 0.48, distance * 0.66, distance * 0.73),
      );
    controls.update();
    updateBadges();
  }
  function enter(next, at) {
    if (disposed) return;
    clear();
    if (!next) return;
    visit = next;
    clock = 0;
    origin.copy(at);
    room = createInteriorScene(next.kind, { shirt, reducedMotion });
    room.setNight?.(lightingNight);
    room.group.position.copy(origin);
    actor = createCharacter({
      bodyType: appearance?.bodyType,
      shirt: appearance?.topColor || shirt || "#c58e59",
      trousers: appearance?.bottomColor,
      hair: appearance?.hairColor,
      skin: appearance?.skinTone || "#a87955",
      shoes: appearance?.shoeColor,
      style: appearance?.outfitStyle || "tourist",
      hairStyle: appearance?.hairStyle || "short",
    });
    actor.position.set(room.spawn.x, 0.02, room.spawn.z);
    actor.rotation.y = Math.PI;
    room.group.add(actor);
    scene.add(room.group);
    refreshPeers();
    selected = room.zones[0]?.id || null;
    badges?.setItems(
      room.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        category: zone.id,
        value: zone.id,
        position: origin
          .clone()
          .add(new THREE.Vector3(zone.point.x, 2.4, zone.point.z)),
      })),
    );
    if (selected) onZone?.(selected);
    onActivity?.({ state: "idle", zoneId: selected });
    frameRoom();
  }
  function selectZone(id) {
    if (!room?.zones.some((z) => z.id === id) || action) return;
    selected = id;
    onZone?.(id);
    updateBadges();
  }
  function setLighting(value) {
    if (disposed) return;
    lightingNight = Number.isFinite(value)
      ? THREE.MathUtils.clamp(value, 0, 1)
      : 0;
    room?.setNight?.(lightingNight);
  }
  function walkTo(target, zoneId = null, duration = 4.5) {
    if (!room || action) return false;
    const route = findRoomRoute(
      { x: actor.position.x, z: actor.position.z },
      target,
      {
        bounds: boundsOf(),
        obstacles: room.group.userData.room?.obstacles || [],
        clearance: 0.28,
        cellSize: 0.4,
      },
    );
    if (!route.length) {
      onActivity?.({
        state: "idle",
        zoneId,
        error: "That spot is blocked. Try another activity.",
      });
      return false;
    }
    action = {
      zoneId,
      route,
      index: 0,
      state: "walking",
      elapsed: 0,
      duration,
    };
    if (zoneId) selected = zoneId;
    updateBadges();
    onActivity?.({ state: "walking", zoneId });
    return true;
  }
  function perform(id, durationMs = 4500) {
    const zone = room?.zones.find((z) => z.id === id);
    if (!zone) return;
    walkTo(
      zone.target || zone.point,
      id,
      Math.max(2, Math.min(12, durationMs / 1000)),
    );
  }
  function poseActivity(id, t) {
    const rig = actor.userData.rig;
    if (!rig) return;
    if (id === "weights") {
      rig.leftArm.rotation.z = 0.15;
      rig.rightArm.rotation.z = -0.15;
      rig.leftElbow.rotation.x = rig.rightElbow.rotation.x =
        -1.15 + Math.sin(t * 3) * 0.45;
    } else if (id === "stretch") {
      rig.leftArm.rotation.z = -1.8;
      rig.rightArm.rotation.z = 1.8;
      rig.torso.rotation.z = Math.sin(t * 1.4) * 0.13;
    } else if (["table", "rest", "bench", "lounge"].includes(id)) {
      rig.hips.position.y = actor.userData.restHipY - 0.42;
      rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -1.05;
      rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = 1.25;
      rig.leftArm.rotation.x = rig.rightArm.rotation.x = -0.5;
    } else if (["espresso", "pastry", "counter", "kitchen"].includes(id)) {
      rig.rightArm.rotation.x = -0.7;
      rig.rightElbow.rotation.x = -1.2 + Math.sin(t * 1.8) * 0.14;
    } else if (id === "plan") {
      rig.head.rotation.x = 0.2;
      rig.rightArm.rotation.x = -0.75;
    } else if (id === "try-on") {
      rig.leftArm.rotation.z = -0.45;
      rig.rightArm.rotation.z = 0.45;
      rig.torso.rotation.y = Math.sin(t * 1.8) * 0.18;
    } else if (id === "listen") {
      rig.hips.rotation.z = Math.sin(t * 3) * 0.09;
      rig.leftArm.rotation.x = Math.sin(t * 3) * 0.25;
    }
  }
  function resetPose() {
    const rig = actor.userData.rig;
    if (!rig) return;
    rig.leftArm.rotation.z =
      rig.rightArm.rotation.z =
      rig.torso.rotation.y =
      rig.torso.rotation.z =
      rig.head.rotation.x =
        0;
  }
  function update(dt, motion) {
    updateBadges();
    if (!room) return;
    const step = motion ? dt : 0;
    clock += step;
    room.update?.(clock, step, motion, selected);
    if (!motion) return;
    for (const record of peersById.values())
      animateCharacter(record.actor, clock + record.phase, false);
    resetPose();
    let walking = false;
    if (action?.state === "walking") {
      let distance = step * 2.2;
      while (distance > 0 && action.index < action.route.length) {
        const target = action.route[action.index],
          dx = target.x - actor.position.x,
          dz = target.z - actor.position.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.03) {
          action.index++;
          continue;
        }
        const move = Math.min(distance, length);
        actor.position.x += (dx / length) * move;
        actor.position.z += (dz / length) * move;
        actor.rotation.y = Math.atan2(dx, dz);
        distance -= move;
        walking = true;
        if (move >= length) action.index++;
      }
      if (action.index >= action.route.length) {
        if (action.zoneId) {
          action.state = "active";
          const zone = room.zones.find((z) => z.id === action.zoneId);
          action.standing = actor.position.clone();
          actor.rotation.y = Math.atan2(
            zone.point.x - actor.position.x,
            zone.point.z - actor.position.z,
          );
          if (zone.seat) {
            actor.position.set(
              zone.seat.x,
              zone.seat.height +
                0.04 -
                (actor.userData.restHipY - 0.42) * actor.scale.y,
              zone.seat.z,
            );
            actor.rotation.y = zone.seat.angle;
          }
          onActivity?.({ state: "active", zoneId: action.zoneId });
        } else {
          action = null;
          updateBadges();
          onActivity?.({ state: "idle", zoneId: null });
        }
      }
    }
    animateCharacter(
      actor,
      clock,
      walking || (action?.state === "active" && action.zoneId === "treadmill"),
    );
    if (action?.state === "active") {
      action.elapsed += step;
      poseActivity(action.zoneId, clock);
      if (action.elapsed >= action.duration) {
        const zoneId = action.zoneId;
        if (action.standing) actor.position.copy(action.standing);
        action = null;
        updateBadges();
        onActivity?.({ state: "complete", zoneId });
      }
    }
    for (const [person, gesture] of socialGestures) {
      const elapsed = clock - gesture.startedAt;
      if (elapsed >= gesture.duration) {
        resetSocialGesture(person);
        socialGestures.delete(person);
      } else {
        poseSocialGesture(person, gesture.kind, elapsed, reducedMotion);
      }
    }
  }
  function pick(ray, mode) {
    if (!room) return false;
    const hits = ray.intersectObject(room.group, true);
    const peerHit = hits.find((h) => h.object.userData.peer);
    if (peerHit) {
      onPeer?.(peerHit.object.userData.peer);
      return true;
    }
    const hit = hits.find(
      (h) => h.object.userData.zone || h.object.userData.roomGround,
    );
    if (hit?.object.userData.zone) selectZone(hit.object.userData.zone);
    else if (hit && mode === "walk")
      walkTo({ x: hit.point.x - origin.x, z: hit.point.z - origin.z });
    return true;
  }
  return {
    enter,
    clear,
    dispose,
    frameRoom,
    selectZone,
    setLighting,
    setPeers,
    setAppearance,
    perform,
    social,
    pick,
    update,
    get active() {
      return !!room;
    },
    get kind() {
      return visit?.kind;
    },
  };
}
