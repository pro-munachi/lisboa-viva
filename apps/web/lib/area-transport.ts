export type Point = { lat: number; lng: number };

export const WALKABLE_METRES = 2000;

export function distanceMetres(from: Point, to: Point): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(to.lat - from.lat);
  const longitude = radians(to.lng - from.lng);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const areaTransport = [
  { mode: "bus", label: "Bus", costCents: 300 },
  { mode: "tram", label: "Tram", costCents: 400 },
  { mode: "taxi", label: "Taxi", costCents: 1200 },
] as const;
