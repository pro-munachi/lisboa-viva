import * as THREE from "three";
import { createCharacter, animateCharacter } from "./characters";
import { createInteriorScene } from "./city-interiors";
import { findRoomRoute } from "./city-room-navigation";
import { createHotspotBadgeLayer } from "./city-hotspot-badges";

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
    badges?.dispose();
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
  }
  function pick(ray, mode) {
    if (!room) return false;
    const hits = ray.intersectObject(room.group, true);
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
    perform,
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
