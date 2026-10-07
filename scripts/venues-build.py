#!/usr/bin/env python3
"""Bundle a geographically distributed, named OSM venue directory.

Requires pyosmium (osmium). Uses the same cached BBBike PBF as geography-build.py;
no network requests. Node locations are mapped points; way positions are
approximate polygon centroids. Run from the repository root:
  python3 scripts/venues-build.py --osm /path/to/Lisbon.osm.pbf
"""
import argparse
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
import ipaddress
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

import osmium

BOUNDS = [-9.435, 38.683, -9.085, 38.832]
CATEGORIES = ("cafe", "gym", "restaurant", "bar", "shop", "culture")
QUOTAS = {"cafe": 160, "gym": 80, "restaurant": 160, "bar": 90, "shop": 70, "culture": 40}
BEACH_LIMIT = 64
CELL = 0.0125


def inside(point):
    return BOUNDS[0] <= point[0] <= BOUNDS[2] and BOUNDS[1] <= point[1] <= BOUNDS[3]


def category(tags):
    amenity, leisure = tags.get("amenity"), tags.get("leisure")
    if tags.get("natural") == "beach":
        return "beach"
    if amenity == "cafe":
        return "cafe"
    if leisure in ("fitness_centre", "dance") or amenity == "gym" or (
        leisure == "sports_centre" and tags.get("sport") in ("fitness", "bodybuilding", "dance", "yoga")
    ) or (tags.get("club") == "dance"):
        return "gym"
    if amenity in ("restaurant", "food_court", "fast_food"):
        return "restaurant"
    if amenity in ("bar", "pub", "biergarten", "nightclub"):
        return "bar"
    if tags.get("shop") in ("books", "bakery", "supermarket", "convenience", "deli", "pastry", "cheese", "wine"):
        return "shop"
    if tags.get("tourism") in ("museum", "gallery") or amenity in ("arts_centre", "theatre", "cinema"):
        return "culture"
    return None


def safe_website(value):
    """Keep only a single HTTPS web address actually tagged on the OSM feature."""
    if not value or any(char.isspace() for char in value) or ";" in value or "\\" in value:
        return None
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        if parsed.scheme != "https" or not host or "." not in host or parsed.username or parsed.password or parsed.port not in (None, 443):
            return None
        if host.endswith((".local", ".localhost", ".internal")) or host == "localhost":
            return None
        try:
            ipaddress.ip_address(host)
            return None
        except ValueError:
            pass
        return value
    except ValueError:
        return None


def way_centroid(points):
    """Area centroid for closed ways; mean of mapped vertices for open ways."""
    if len(points) >= 4 and points[0] == points[-1]:
        area = xsum = ysum = 0
        # Subtract an origin first to retain precision for small buildings.
        ox, oy = points[0]
        local = [(x - ox, y - oy) for x, y in points]
        for a, b in zip(local, local[1:]):
            cross = a[0] * b[1] - b[0] * a[1]
            area += cross
            xsum += (a[0] + b[0]) * cross
            ysum += (a[1] + b[1]) * cross
        if abs(area) > 1e-16:
            return [ox + xsum / (3 * area), oy + ysum / (3 * area)]
        points = points[:-1]
    return [sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)]


class VenueExtract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.venues = []

    def add(self, osm_type, ident, tags, point, position_source):
        name = tags.get("name", "").strip()
        kind = category(tags)
        if not name or not kind or not inside(point):
            return
        venue = {
            "id": f"{osm_type}:{ident}", "osmType": osm_type, "osmId": ident,
            "name": name, "category": kind,
            "point": [round(point[0], 6), round(point[1], 6)],
            "positionSource": position_source,
            "sourceUrl": f"https://www.openstreetmap.org/{osm_type}/{ident}",
        }
        for field, tag in (("street", "addr:street"), ("city", "addr:city")):
            if tags.get(tag):
                venue[field] = tags.get(tag)
        website = safe_website(tags.get("website") or tags.get("contact:website"))
        if website:
            venue["website"] = website
        # Preserve the mapped subcategory for UI labels and provenance.
        venue["osmCategory"] = tags.get("natural") if kind == "beach" else tags.get("amenity") or tags.get("leisure") or tags.get("shop") or tags.get("tourism") or tags.get("sport")
        self.venues.append(venue)

    def node(self, node):
        if node.tags.get("name") and category(node.tags):
            self.add("node", node.id, node.tags, [node.location.lon, node.location.lat], "osm-node")

    def way(self, way):
        if not way.tags.get("name") or not category(way.tags):
            return
        try:
            points = [[node.lon, node.lat] for node in way.nodes]
        except osmium.InvalidLocationError:
            return
        if points:
            self.add("way", way.id, way.tags, way_centroid(points), "way-centroid")


def venue_priority(venue):
    return (-int("website" in venue) - int("street" in venue), venue["name"].casefold(), venue["id"])


def distributed(candidates):
    """Round-robin geographic cells so central Lisbon cannot consume the list."""
    cells = defaultdict(list)
    for venue in candidates:
        lng, lat = venue["point"]
        cells[(math.floor((lng - BOUNDS[0]) / CELL), math.floor((lat - BOUNDS[1]) / CELL))].append(venue)
    queues = [deque(sorted(cells[key], key=venue_priority)) for key in sorted(cells)]
    ordered = []
    while queues:
        for queue in queues:
            ordered.append(queue.popleft())
        queues = [queue for queue in queues if queue]
    return ordered


def select(venues, limit):
    # Nodes and ways can map the same establishment: retain one mapped feature
    # when name/category match within ~20m, preferring the precise node point.
    unique = []
    lookup = defaultdict(list)
    for venue in sorted(venues, key=lambda v: (v["osmType"] != "node", v["id"])):
        key = (venue["name"].casefold(), venue["category"])
        lng, lat = venue["point"]
        duplicate = any(
            math.hypot((lng - p[0]) * 111320 * math.cos(math.radians(lat)), (lat - p[1]) * 111320) < 500
            if venue["category"] == "beach"
            else abs(lng - p[0]) < 0.0002 and abs(lat - p[1]) < 0.00018
            for p in lookup[key]
        )
        if duplicate:
            continue
        lookup[key].append(venue["point"])
        unique.append(venue)
    by_category = {kind: distributed([v for v in unique if v["category"] == kind]) for kind in CATEGORIES}
    selected = []
    remaining = {}
    for kind in CATEGORIES:
        take = min(len(by_category[kind]), round(QUOTAS[kind] * limit / 600))
        selected.extend(by_category[kind][:take])
        remaining[kind] = deque(by_category[kind][take:])
    while len(selected) < limit and any(remaining.values()):
        for kind in CATEGORIES:
            if remaining[kind] and len(selected) < limit:
                selected.append(remaining[kind].popleft())
    # Beach polygons can have several adjacent parts with the same name. Keep
    # one sourced polygon focus per beach; append the named coastal directory
    # without displacing any of the existing sampled business identities.
    beaches = distributed([v for v in unique if v["category"] == "beach"])[:BEACH_LIMIT]
    return sorted(selected[:limit] + beaches, key=lambda v: (v["category"], v["name"].casefold(), v["id"])), unique


def build(pbf, output, limit):
    reader = osmium.io.Reader(str(pbf))
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    extractor = VenueExtract()
    extractor.apply_file(str(pbf), locations=True, idx="flex_mem")
    venues, available = select(extractor.venues, limit)
    data = {
        "version": 1, "bounds": BOUNDS,
        "source": {
            "name": "OpenStreetMap contributors via BBBike Lisbon extract",
            "url": "https://download.bbbike.org/osm/bbbike/Lisbon/Lisbon.osm.pbf",
            "license": "ODbL 1.0", "acquiredAt": datetime.now(timezone.utc).date().isoformat(),
            "osmTimestamp": timestamp,
        },
        "counts": {"available": len(available), "selected": len(venues),
            "availableByCategory": dict(sorted(Counter(v["category"] for v in available).items())),
            "selectedByCategory": dict(sorted(Counter(v["category"] for v in venues).items()))},
        "selection": {
            "limit": limit, "additionalBeachLimit": BEACH_LIMIT, "cellDegrees": CELL,
            "method": "Business category quotas followed by geographic-cell round-robin; up to 64 named beaches added without displacing businesses. Duplicate same-name/category businesses within approximately 20m and beach polygon parts within 500m omitted.",
        },
        "limitations": [
            "Named venues and coordinates are from the OSM snapshot; mapping can be incomplete or outdated.",
            "Way coordinates are approximate polygon centroids, not surveyed entrances; node coordinates retain mapped point locations.",
            "The directory is a geographically distributed sample, not a complete listing or recommendation.",
            "Website URLs retain HTTPS addresses tagged in OSM; current ownership and opening hours are not verified.",
            "Beach entries are named natural=beach map features inside the world bounds, not bathing-water recommendations or evidence of current safe swimming conditions. Beach focuses are approximate polygon centroids, not surveyed beach entrances.",
        ],
        "venues": venues,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"counts": data["counts"], "bytes": output.stat().st_size, "osmTimestamp": timestamp}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("apps/web/public/data/lisbon-venues.json"))
    parser.add_argument("--limit", type=int, default=600)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 2500:
        parser.error("--limit must be between 1 and 2500")
    build(args.osm, args.output, args.limit)
