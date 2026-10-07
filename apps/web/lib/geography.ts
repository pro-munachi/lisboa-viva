/** WGS84 geometry from OpenStreetMap; x=east and z=south, measured in metres. */
export type GeoPoint = readonly [longitude: number, latitude: number];
export type GeographicBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];
export interface GeographicRoad {
  id: number;
  name?: string;
  kind: string;
  /** Tagged/estimated carriageway width in metres. */
  width: number;
  points: GeoPoint[];
  oneWay?: boolean;
}
export interface GeographicBuilding {
  id: number;
  name?: string;
  kind: string;
  ring: GeoPoint[];
  /** OSM height or building:levels where present; otherwise a clearly approximate default. */
  height: number;
  heightSource: "height" | "levels" | "estimated";
}
export interface GeographicSurface {
  id: number;
  name?: string;
  kind: "water" | "park" | "wood" | "sand";
  ring: GeoPoint[];
}
export interface GeographicChunk {
  id: string;
  bounds: GeographicBounds;
  buildings: GeographicBuilding[];
  roads?: GeographicRoad[];
  surfaces?: GeographicSurface[];
}
export interface GeographicManifest {
  version: 1;
  bounds: GeographicBounds;
  origin: GeoPoint;
  source: {
    name: string;
    url: string;
    license: string;
    acquiredAt: string;
    osmTimestamp?: string;
  };
  roads: GeographicRoad[];
  surfaces: GeographicSurface[];
  coastlines?: { id: number; points: GeoPoint[] }[];
  chunks: {
    id: string;
    bounds: GeographicBounds;
    url: string;
    buildingCount: number;
    roadCount?: number;
    surfaceCount?: number;
  }[];
  counts: { roads: number; buildings: number; surfaces: number };
  limitations: string[];
}
export interface GeographicTerrain {
  bounds: GeographicBounds;
  width: number;
  height: number;
  /** Rows run north-to-south, columns west-to-east, elevation in metres above sea level. */
  elevations: number[];
  source: {
    name: string;
    url: string;
    license: string;
    acquiredAt: string;
    zoom: number;
  };
}
export const GEO_ORIGIN: GeoPoint = [-9.16, 38.72];
export const GEO_BOUNDS: GeographicBounds = [-9.435, 38.683, -9.085, 38.832];
const LATITUDE_METRES = 111_320;
const LONGITUDE_METRES =
  LATITUDE_METRES * Math.cos((GEO_ORIGIN[1] * Math.PI) / 180);
export function projectGeo(point: GeoPoint): { x: number; z: number } {
  return {
    x: (point[0] - GEO_ORIGIN[0]) * LONGITUDE_METRES,
    z: (GEO_ORIGIN[1] - point[1]) * LATITUDE_METRES,
  };
}
export function unprojectGeo(x: number, z: number): GeoPoint {
  return [
    GEO_ORIGIN[0] + x / LONGITUDE_METRES,
    GEO_ORIGIN[1] - z / LATITUDE_METRES,
  ];
}
/** Bilinear interpolation of the bundled DEM; zero outside its coverage. */
export function elevationAt(
  point: GeoPoint,
  terrain?: GeographicTerrain | null,
): number {
  if (!terrain) return 0;
  const [west, south, east, north] = terrain.bounds;
  const [lng, lat] = point;
  if (lng < west || lng > east || lat < south || lat > north) return 0;
  const u = ((lng - west) / (east - west)) * (terrain.width - 1);
  const v = ((north - lat) / (north - south)) * (terrain.height - 1);
  const x = Math.min(terrain.width - 2, Math.floor(u));
  const y = Math.min(terrain.height - 2, Math.floor(v));
  const a = u - x,
    b = v - y;
  const get = (col: number, row: number) =>
    terrain.elevations[row * terrain.width + col] ?? 0;
  return (
    get(x, y) * (1 - a) * (1 - b) +
    get(x + 1, y) * a * (1 - b) +
    get(x, y + 1) * (1 - a) * b +
    get(x + 1, y + 1) * a * b
  );
}
/** Elevation of the rendered TL/BL/TR + TR/BL/BR triangular terrain surface.
 * Unlike bilinear DEM interpolation, this follows the mesh on saddle-shaped cells.
 */
export function surfaceElevationAt(
  point: GeoPoint,
  terrain?: GeographicTerrain | null,
): number {
  if (!terrain) return 0;
  const [west, south, east, north] = terrain.bounds;
  const [lng, lat] = point;
  if (lng < west || lng > east || lat < south || lat > north) return 0;
  const u = ((lng - west) / (east - west)) * (terrain.width - 1);
  const v = ((north - lat) / (north - south)) * (terrain.height - 1);
  const x = Math.min(terrain.width - 2, Math.floor(u));
  const y = Math.min(terrain.height - 2, Math.floor(v));
  const fx = u - x;
  const fy = v - y;
  const get = (col: number, row: number) =>
    terrain.elevations[row * terrain.width + col] ?? 0;
  const tl = get(x, y);
  const tr = get(x + 1, y);
  const bl = get(x, y + 1);
  const br = get(x + 1, y + 1);
  return fx + fy <= 1
    ? tl * (1 - fx - fy) + tr * fx + bl * fy
    : tr * (1 - fy) + bl * (1 - fx) + br * (fx + fy - 1);
}

export function containsGeo(
  bounds: GeographicBounds,
  point: GeoPoint,
): boolean {
  return (
    point[0] >= bounds[0] &&
    point[0] <= bounds[2] &&
    point[1] >= bounds[1] &&
    point[1] <= bounds[3]
  );
}

export type HotspotArea =
  | "Baixa"
  | "Cais do Sodré"
  | "Graça"
  | "Alfama"
  | "Belém"
  | "Benfica"
  | "São Domingos de Benfica"
  | "Sintra";
export interface GeographicHotspot {
  id: string;
  name: string;
  point: GeoPoint;
  area: HotspotArea;
  description: string;
  category:
    | "landmark"
    | "viewpoint"
    | "market"
    | "transport"
    | "street"
    | "museum";
  mapsUrl: string;
  culturalSource: string;
  coordinateSource: string;
  reviewedAt: string;
}

function hotspot(
  id: string,
  name: string,
  point: GeoPoint,
  area: HotspotArea,
  category: GeographicHotspot["category"],
  description: string,
  culturalSource: string,
  coordinateSource: string,
): GeographicHotspot {
  return {
    id,
    name,
    point,
    area,
    category,
    description,
    culturalSource,
    coordinateSource,
    // These URLs open Google Maps. Bundled coordinates/content come from OSM + official cultural sources.
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point[1]},${point[0]} (${name})`)}`,
    reviewedAt: "2026-10-07",
  };
}

export const GEOGRAPHIC_HOTSPOTS: readonly GeographicHotspot[] = [
  hotspot(
    "comercio",
    "Praça do Comércio",
    [-9.13691, 38.708188],
    "Baixa",
    "landmark",
    "The monumental riverside square at the southern end of Baixa, opening onto the Tagus.",
    "https://www.visitlisboa.com/pt-pt/locais/praca-do-comercio-terreiro-do-paco",
    "https://www.openstreetmap.org/way/47183897",
  ),
  hotspot(
    "cais-station",
    "Cais do Sodré station",
    [-9.144603, 38.705903],
    "Cais do Sodré",
    "transport",
    "A real interchange for the Cascais railway, metro and nearby ferries. Simulated vehicles do not show live departures.",
    "https://www.visitlisboa.com/pt-pt/locais/cais-do-sodre",
    "https://www.openstreetmap.org/way/285355889",
  ),
  hotspot(
    "pink-street",
    "Pink Street · Rua Nova do Carvalho",
    [-9.143802, 38.707231],
    "Cais do Sodré",
    "street",
    "The pedestrian stretch of Rua Nova do Carvalho, known for its pink surface and evening venues.",
    "https://www.visitlisboa.com/pt-pt/locais/cais-do-sodre",
    "https://www.openstreetmap.org/way/146283133",
  ),
  hotspot(
    "ribeira-market",
    "Mercado da Ribeira",
    [-9.145615, 38.706994],
    "Cais do Sodré",
    "market",
    "A municipal market and food-hall landmark on Avenida 24 de Julho.",
    "https://www.lisboa.pt/pontos-de-interesse/detalhe/mercado-da-ribeira",
    "https://www.openstreetmap.org/way/39729235",
  ),
  hotspot(
    "graca-lookout",
    "Miradouro da Graça",
    [-9.131543, 38.716523],
    "Graça",
    "viewpoint",
    "Also named for Sophia de Mello Breyner Andresen, this hillside terrace looks across the castle, rooftops and river.",
    "https://www.visitlisboa.com/pt-pt/locais/miradouro-da-graca",
    "https://www.openstreetmap.org/node/11576971746",
  ),
  hotspot(
    "senhora-monte",
    "Miradouro da Senhora do Monte",
    [-9.132743, 38.719108],
    "Graça",
    "viewpoint",
    "A broad panorama over central Lisbon from the hill above Graça.",
    "https://www.visitlisboa.com/en/places/miradouro-da-senhora-do-monte",
    "https://www.openstreetmap.org/way/526129020",
  ),
  hotspot(
    "alfama-luzia",
    "Miradouro de Santa Luzia",
    [-9.130216, 38.711741],
    "Alfama",
    "viewpoint",
    "A riverside-rooftop view from Alfama, beside the church and tile-lined terrace.",
    "https://www.visitlisboa.com/pt-pt/locais/alfama",
    "https://www.openstreetmap.org/node/5446794770",
  ),
  hotspot(
    "alfama-sol",
    "Miradouro das Portas do Sol",
    [-9.130367, 38.712346],
    "Alfama",
    "viewpoint",
    "An open terrace above Alfama's streets, looking toward the Tagus.",
    "https://www.visitlisboa.com/pt-pt/locais/alfama",
    "https://www.openstreetmap.org/node/5446794765",
  ),
  hotspot(
    "belem-tower",
    "Torre de Belém",
    [-9.215882, 38.691682],
    "Belém",
    "landmark",
    "The historic limestone river fort at Belém. Its game appearance uses an actual footprint with stylised architectural detail.",
    "https://www.visitlisboa.com/pt-pt/locais/torre-de-belem",
    "https://www.openstreetmap.org/way/24341353",
  ),
  hotspot(
    "jeronimos",
    "Mosteiro dos Jerónimos",
    [-9.205956, 38.697592],
    "Belém",
    "landmark",
    "The monastery's visitor entrance, north of the riverside gardens in Belém.",
    "https://www.visitlisboa.com/en/places/jeronimos-monastery",
    "https://www.openstreetmap.org/node/262949276",
  ),
  hotspot(
    "maat",
    "MAAT",
    [-9.193693, 38.695935],
    "Belém",
    "museum",
    "The Museum of Art, Architecture and Technology beside the Tagus promenade.",
    "https://www.maat.pt/pt/planear-visita",
    "https://www.openstreetmap.org/relation/11381632",
  ),
  hotspot(
    "benfica-market",
    "Mercado de Benfica",
    [-9.205978, 38.750675],
    "Benfica",
    "market",
    "A neighbourhood municipal market in Benfica, well away from the historic riverside centre.",
    "https://www.lisboa.pt/fileadmin/portal/temas/urbanismo/planos_pormenor/zona_envolvente_mercado_benfica/versao_Final/pecas_escritas/pp_zona_env_mercado_benfica_relatorio.pdf",
    "https://www.openstreetmap.org/way/146533532",
  ),
  hotspot(
    "fronteira",
    "Palácio Fronteira",
    [-9.180452, 38.740014],
    "São Domingos de Benfica",
    "landmark",
    "A palace and garden near Monsanto in São Domingos de Benfica, a separate parish from Benfica.",
    "https://www.visitlisboa.com/pt-pt/locais/palacio-fronteira",
    "https://www.openstreetmap.org/way/145116280",
  ),
  hotspot(
    "sintra-station",
    "Sintra station",
    [-9.385358, 38.799261],
    "Sintra",
    "transport",
    "The railway terminus east of Sintra's historic centre, connected geographically to Lisbon through the mapped corridor.",
    "https://www.cp.pt/pesquisa-estacao",
    "https://www.openstreetmap.org/node/13277700527",
  ),
  hotspot(
    "pena-palace",
    "Palácio da Pena",
    [-9.390524, 38.787462],
    "Sintra",
    "landmark",
    "The Romantic palace on the wooded Sintra hills. Entry and transport arrangements should be checked with Parques de Sintra.",
    "https://www.parquesdesintra.pt/pt/parques-monumentos/parque-e-palacio-nacional-da-pena",
    "https://www.openstreetmap.org/way/612095421",
  ),
  hotspot(
    "regaleira",
    "Quinta da Regaleira",
    [-9.396103, 38.796328],
    "Sintra",
    "landmark",
    "The historic house and gardens west of Sintra's centre, represented at their real mapped location.",
    "https://www.regaleira.pt/pt/",
    "https://www.openstreetmap.org/way/138591899",
  ),
  hotspot(
    "sintra-palace",
    "Palácio Nacional de Sintra",
    [-9.390556, 38.7975],
    "Sintra",
    "landmark",
    "The palace in Sintra's historic centre, famous for the two conical chimneys over its royal kitchen.",
    "https://www.parquesdesintra.pt/en/parks-monuments/national-palace-of-sintra/",
    "https://www.parquesdesintra.pt/media/2igfi41g/pena_en.pdf",
  ),
];

export interface GeographicOverview {
  origin: GeoPoint;
  bounds: GeographicBounds;
  /** Coarse distant LOD: x, z, width, depth, height, in whole metres. Use chunk rings nearby. */
  buildings: [
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
  ][];
  limitations: string[];
}
