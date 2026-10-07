/** Authored day/night palette driven by Lisbon wall-clock or trip minutes.
 * These transitions are visual game direction, not calculated sunrise times. */
export function normalizeCityMinute(minute) {
  return Number.isFinite(minute) ? ((minute % 1440) + 1440) % 1440 : 660;
}
const NIGHT = {
  skyTop: "#101b31",
  horizon: "#2b4057",
  sunColor: "#a9bfe8",
  hemisphereSky: "#99b0d2",
  hemisphereGround: "#7d695c",
  waterDeep: "#193549",
  waterShallow: "#345769",
  waterReflection: "#546c86",
  sunIntensity: 0.26,
  hemisphereIntensity: 0.78,
  exposure: 1.08,
  night: 1,
};
const DAY = {
  skyTop: "#80b8d0",
  horizon: "#dae5e0",
  sunColor: "#fff0d8",
  hemisphereSky: "#e4f1ff",
  hemisphereGround: "#ae9c78",
  waterDeep: "#4b8292",
  waterShallow: "#76b0b9",
  waterReflection: "#96bfc4",
  sunIntensity: 3.1,
  hemisphereIntensity: 1.65,
  exposure: 1.04,
  night: 0,
};
const GOLDEN = {
  skyTop: "#7799bd",
  horizon: "#e9b895",
  sunColor: "#ffc580",
  hemisphereSky: "#e5d4d0",
  hemisphereGround: "#b49170",
  waterDeep: "#426d84",
  waterShallow: "#8baeb1",
  waterReflection: "#d8b4a0",
  sunIntensity: 2.1,
  hemisphereIntensity: 1.35,
  exposure: 1.04,
  night: 0.12,
};
const KEYS = [
  { minute: 0, ...NIGHT },
  { minute: 300, ...NIGHT },
  {
    minute: 390,
    ...GOLDEN,
    skyTop: "#6a7fa0",
    sunIntensity: 0.85,
    hemisphereIntensity: 1.05,
    night: 0.6,
  },
  {
    minute: 480,
    ...DAY,
    sunColor: "#ffe0b0",
    horizon: "#e3dbcf",
    sunIntensity: 2.5,
  },
  { minute: 660, ...DAY },
  { minute: 900, ...DAY },
  { minute: 1050, ...GOLDEN },
  {
    minute: 1140,
    ...GOLDEN,
    skyTop: "#3f557c",
    horizon: "#a6929e",
    sunIntensity: 0.72,
    hemisphereIntensity: 1.0,
    night: 0.65,
  },
  { minute: 1230, ...NIGHT },
  { minute: 1440, ...NIGHT },
];
const COLORS = [
  "skyTop",
  "horizon",
  "sunColor",
  "hemisphereSky",
  "hemisphereGround",
  "waterDeep",
  "waterShallow",
  "waterReflection",
];
const VALUES = ["sunIntensity", "hemisphereIntensity", "exposure", "night"];
function mixColor(a, b, t) {
  const rgb = [1, 3, 5].map((index) =>
    Math.round(
      parseInt(a.slice(index, index + 2), 16) * (1 - t) +
        parseInt(b.slice(index, index + 2), 16) * t,
    ),
  );
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
export function lightingForMinute(value) {
  const minute = normalizeCityMinute(value);
  const index = KEYS.findIndex((key) => key.minute > minute);
  const a = KEYS[index - 1],
    b = KEYS[index];
  const linear = (minute - a.minute) / (b.minute - a.minute);
  const t = linear * linear * (3 - 2 * linear);
  const state = { ...DAY, minute, sunOffset: { x: 0, y: 0, z: 280 } };
  for (const field of COLORS) state[field] = mixColor(a[field], b[field], t);
  for (const field of VALUES) state[field] = a[field] * (1 - t) + b[field] * t;
  const angle = ((minute - 360) / 1440) * Math.PI * 2;
  state.sunOffset.x = -Math.cos(angle) * 460;
  state.sunOffset.y = 120 + Math.max(0.2, Math.sin(angle)) * 360;
  return state;
}

/** A fixed light pool follows nearby lamps. Inputs remain owned by chunks. */
export function nearestLampAnchors(
  anchors,
  target,
  { limit = 6, maxDistance = 100 } = {},
) {
  if (
    !target ||
    ![target.x, target.z, limit, maxDistance].every(Number.isFinite) ||
    limit <= 0 ||
    maxDistance <= 0
  )
    return [];
  const unique = new Map();
  for (const point of anchors) {
    if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) continue;
    const distance = (point.x - target.x) ** 2 + (point.z - target.z) ** 2;
    if (distance > maxDistance ** 2) continue;
    const key = `${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}`;
    if (!unique.has(key)) unique.set(key, { point, distance });
  }
  return [...unique.values()]
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.point.x - b.point.x ||
        a.point.z - b.point.z ||
        a.point.y - b.point.y,
    )
    .slice(0, Math.min(6, Math.floor(limit)))
    .map((item) => item.point);
}
