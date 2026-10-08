/** Brief, original gestures for confirmed ROAM simulation events.
 * Route logic continues to own character positions. There is no damage model. */
export function resetSocialGesture(character) {
  const rig = character?.userData?.rig;
  if (!rig) return;
  rig.leftArm.rotation.z = 0.045;
  rig.rightArm.rotation.z = -0.045;
  rig.torso.rotation.z = 0;
  rig.torso.rotation.y = 0;
  rig.head.rotation.x = 0;
}

export function poseSocialGesture(
  character,
  kind,
  elapsed,
  reducedMotion = false,
) {
  const rig = character?.userData?.rig;
  if (!rig || !Number.isFinite(elapsed)) return false;
  resetSocialGesture(character);
  const t = reducedMotion ? 0.5 : elapsed;
  if (kind === "drink") {
    rig.rightArm.rotation.x = -0.75;
    rig.rightElbow.rotation.x = -1.35 + Math.sin(t * 2) * 0.12;
    rig.head.rotation.x = -0.06;
  } else if (kind === "dance") {
    rig.hips.rotation.z = Math.sin(t * 4) * 0.14;
    rig.torso.rotation.y = Math.sin(t * 2) * 0.16;
    rig.leftArm.rotation.x = -0.65 + Math.sin(t * 4) * 0.25;
    rig.rightArm.rotation.x = -0.65 - Math.sin(t * 4) * 0.25;
  } else if (kind === "accept-challenge") {
    // A cartoon shadowboxing pose: no contact, displacement or injury.
    rig.leftArm.rotation.x = -0.8 - Math.max(0, Math.sin(t * 5)) * 0.65;
    rig.rightArm.rotation.x =
      -0.8 - Math.max(0, Math.sin(t * 5 + Math.PI)) * 0.65;
    rig.leftElbow.rotation.x = -1.05 + Math.max(0, Math.sin(t * 5)) * 0.8;
    rig.rightElbow.rotation.x =
      -1.05 + Math.max(0, Math.sin(t * 5 + Math.PI)) * 0.8;
    rig.torso.rotation.y = Math.sin(t * 5) * 0.12;
  } else if (["wave", "compliment", "flirt"].includes(kind)) {
    rig.rightArm.rotation.z = 1.7;
    rig.rightElbow.rotation.x = -0.7 + Math.sin(t * 5) * 0.25;
    rig.head.rotation.x = kind === "compliment" ? 0.1 : 0;
  } else return false;
  return true;
}
