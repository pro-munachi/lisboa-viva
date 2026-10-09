// Decorative traffic stays on mapped carriageways near the active street view.
const EXCLUDED = new Set([
  "footway",
  "pedestrian",
  "path",
  "steps",
  "cycleway",
  "rail",
  "tram",
]);

export function chooseLocalTraffic(
  paths,
  target,
  { max = 26, radius = 220 } = {},
) {
  if (!Number.isFinite(target?.x) || !Number.isFinite(target?.z)) return [];
  const cap = Math.max(0, Math.min(32, Math.floor(Number(max) || 0)));
  const reach = Math.max(60, Math.min(300, Number(radius) || 220));
  const unique = new Map();
  for (const line of paths || []) {
    if (
      EXCLUDED.has(line.kind) ||
      !Number.isFinite(line.width) ||
      !Number.isFinite(line.length) ||
      line.width < 3.6 ||
      line.length < 20 ||
      !Array.isArray(line.ps) ||
      line.ps.length < 2 ||
      !Array.isArray(line.lengths) ||
      line.lengths.length !== line.ps.length ||
      line.ps.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z)) ||
      line.lengths.some(
        (d, i) => !Number.isFinite(d) || (i > 0 && d <= line.lengths[i - 1]),
      )
    )
      continue;
    const key =
      line.id ??
      `${line.ps[0].x}:${line.ps[0].z}:${line.ps.at(-1).x}:${line.ps.at(-1).z}`;
    const previous = unique.get(key);
    if (
      !previous ||
      (previous.owner === "overview" && line.owner !== "overview")
    )
      unique.set(key, line);
  }
  const nearby = [];
  for (const line of unique.values()) {
    let nearest = null;
    for (let i = 1; i < line.ps.length; i++) {
      const a = line.ps[i - 1],
        b = line.ps[i];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        squared = dx * dx + dz * dz;
      if (squared < 0.01) continue;
      const t = Math.max(
        0,
        Math.min(1, ((target.x - a.x) * dx + (target.z - a.z) * dz) / squared),
      );
      const distance = Math.hypot(
        target.x - a.x - dx * t,
        target.z - a.z - dz * t,
      );
      if (!nearest || distance < nearest.distance)
        nearest = {
          distance,
          d: line.lengths[i - 1] + t * (line.lengths[i] - line.lengths[i - 1]),
        };
    }
    if (nearest && nearest.distance <= reach) nearby.push({ line, ...nearest });
  }
  nearby.sort(
    (a, b) =>
      a.distance - b.distance ||
      String(a.line.id).localeCompare(String(b.line.id)),
  );
  const result = [],
    positions = [];
  for (const offset of [0, 18, -24, 42, -48, 72, -78]) {
    for (const entry of nearby.slice(0, 16)) {
      if (result.length >= cap) return result;
      const { line } = entry;
      const at = Math.max(3, Math.min(line.length - 3, entry.d + offset));
      const opposite = result.length % 2 === 1;
      const side = ((opposite ? -1 : 1) * line.width) / 4;
      if (
        positions.some(
          (p) => p.line === line && p.side === side && Math.abs(p.at - at) < 14,
        )
      )
        continue;
      positions.push({ line, side, at });
      result.push({
        line,
        d: opposite ? line.length * 2 - at : at,
        side,
        speed: 4.5 + (result.length % 4),
      });
    }
  }
  return result;
}
