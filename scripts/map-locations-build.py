#!/usr/bin/env python3
"""Build an offline OSM street/place name index using the geography source PBF.

Requires osmium. Adjacent same-name street ways are joined by shared OSM nodes.
The street focus is an actual point along a mapped way near the route centroid,
not a surveyed address or entrance. No network geocoding requests are made.
"""
import argparse
from collections import defaultdict, deque
from datetime import datetime, timezone
import json
import math
from pathlib import Path

import osmium

BOUNDS = [-9.435, 38.683, -9.085, 38.832]
CELL = 0.0125
LX = math.cos(math.radians(38.72))
STREETS = {"primary", "secondary", "tertiary", "residential", "living_street", "unclassified", "pedestrian", "footway", "path", "steps", "cycleway"}
PLACE_KINDS = {"city", "town", "village", "hamlet", "suburb", "quarter", "neighbourhood", "locality"}
CORE_PLACES = {"lisboa", "sintra", "alfama", "baixa", "graça", "belém", "benfica", "cais do sodré", "santos", "santos-o-velho", "bairro alto", "chiado", "mouraria"}
CORE_STREETS = {"rua augusta", "avenida da liberdade", "avenida da índia", "rua nova do carvalho", "rua garrett", "rua da prata", "rua do ouro"}


def inside(p):
    return BOUNDS[0] <= p[0] <= BOUNDS[2] and BOUNDS[1] <= p[1] <= BOUNDS[3]


def clip_segment(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    low, high = 0, 1
    for p, q in zip((-dx, dx, -dy, dy), (a[0] - BOUNDS[0], BOUNDS[2] - a[0], a[1] - BOUNDS[1], BOUNDS[3] - a[1])):
        if abs(p) < 1e-12:
            if q < 0:
                return None
        elif p < 0:
            low = max(low, q / p)
        else:
            high = min(high, q / p)
        if low > high:
            return None
    if high - low < 1e-12:
        return None
    return [(a[0] + low * dx, a[1] + low * dy), (a[0] + high * dx, a[1] + high * dy)]


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.places = []
        self.streets = []

    def node(self, node):
        name, kind = node.tags.get("name"), node.tags.get("place")
        if name and kind in PLACE_KINDS:
            point = [node.location.lon, node.location.lat]
            if inside(point):
                self.places.append({"name": name, "kind": "place", "osmType": "node", "osmId": node.id, "point": point, "placeKind": kind, "positionSource": "osm-node"})

    def way(self, way):
        name, highway, place = way.tags.get("name"), way.tags.get("highway"), way.tags.get("place")
        if not name or (highway not in STREETS and place not in PLACE_KINDS):
            return
        try:
            points = [[node.lon, node.lat] for node in way.nodes]
        except osmium.InvalidLocationError:
            return
        segments = [clipped for a, b in zip(points, points[1:]) if (clipped := clip_segment(a, b))]
        if not segments:
            return
        if place in PLACE_KINDS:
            usable = [p for p in points if inside(p)]
            if usable:
                point = [sum(p[0] for p in usable) / len(usable), sum(p[1] for p in usable) / len(usable)]
                self.places.append({"name": name, "kind": "place", "osmType": "way", "osmId": way.id, "point": point, "placeKind": place, "positionSource": "way-centroid"})
        elif highway in STREETS:
            self.streets.append({"name": name, "osmId": way.id, "highway": highway, "nodes": [node.ref for node in way.nodes], "segments": segments, "city": way.tags.get("addr:city")})


def street_groups(ways):
    by_name = defaultdict(list)
    for way in ways:
        by_name[way["name"].casefold()].append(way)
    result = []
    for named in by_name.values():
        parent = {way["osmId"]: way["osmId"] for way in named}

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        seen = {}
        for way in named:
            ident = way["osmId"]
            for node in way["nodes"]:
                if node in seen:
                    a, b = find(ident), find(seen[node])
                    parent[max(a, b)] = min(a, b)
                else:
                    seen[node] = ident
        groups = defaultdict(list)
        for way in named:
            groups[find(way["osmId"])].append(way)
        result.extend(groups.values())
    return result


def street_record(ways):
    # Length-weighted segment midpoint defines the centre of the visible route.
    parts = []
    total = cx = cy = 0
    for way in ways:
        for a, b in way["segments"]:
            length = math.hypot((b[0] - a[0]) * LX, b[1] - a[1])
            total += length
            cx += (a[0] + b[0]) / 2 * length
            cy += (a[1] + b[1]) / 2 * length
            parts.append((way, a, b))
    if total == 0:
        return None
    centre = (cx / total, cy / total)
    candidates = []
    for way, a, b in parts:
        dx, dy = (b[0] - a[0]) * LX, b[1] - a[1]
        t = max(0, min(1, (((centre[0] - a[0]) * LX) * dx + (centre[1] - a[1]) * dy) / (dx * dx + dy * dy or 1)))
        p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        distance = math.hypot((p[0] - centre[0]) * LX, p[1] - centre[1])
        candidates.append((distance, way["osmId"], p, way))
    _, _, point, representative = min(candidates, key=lambda c: (c[0], c[1]))
    record = {"name": representative["name"], "kind": "street", "osmType": "way", "osmId": representative["osmId"], "point": point, "positionSource": "mapped-route-focus", "highway": representative["highway"], "wayCount": len(ways)}
    if representative.get("city"):
        record["area"] = representative["city"]
    return record


def sample_streets(streets, limit):
    cells = defaultdict(list)
    for street in streets:
        p = street["point"]
        cells[(math.floor((p[0] - BOUNDS[0]) / CELL), math.floor((p[1] - BOUNDS[1]) / CELL))].append(street)
    # Preserve well-known pedestrian streets and major routes before long-tail
    # residential names in each geographic cell, using actual OSM tags.
    priority = {"pedestrian": 0, "primary": 1, "secondary": 2, "tertiary": 3, "living_street": 4, "residential": 5}
    queues = [deque(sorted(cells[key], key=lambda s: (s["name"].casefold() not in CORE_STREETS, priority.get(s["highway"], 6), -s["wayCount"], s["name"].casefold(), s["osmId"]))) for key in sorted(cells)]
    selected = []
    while queues and len(selected) < limit:
        for queue in queues:
            if len(selected) < limit:
                selected.append(queue.popleft())
        queues = [queue for queue in queues if queue]
    return selected


def sample_places(places, limit):
    # Keep named towns/suburbs and the trip's core districts first, then spread
    # the many smaller OSM neighbourhood/locality labels geographically.
    priority = {"city": 0, "town": 1, "suburb": 2, "quarter": 3, "village": 4, "neighbourhood": 5, "hamlet": 6, "locality": 7}
    essential = [p for p in places if p["placeKind"] in {"city", "town", "suburb", "quarter", "village"} or p["name"].casefold() in CORE_PLACES]
    essential.sort(key=lambda p: (p["name"].casefold() not in CORE_PLACES, priority[p["placeKind"]], p["name"].casefold(), p["osmId"]))
    selected = essential[:limit]
    used = {(p["osmType"], p["osmId"]) for p in selected}
    cells = defaultdict(list)
    for place in places:
        if (place["osmType"], place["osmId"]) in used:
            continue
        p = place["point"]
        cells[(math.floor((p[0] - BOUNDS[0]) / CELL), math.floor((p[1] - BOUNDS[1]) / CELL))].append(place)
    queues = [deque(sorted(cells[key], key=lambda p: (priority[p["placeKind"]], p["name"].casefold(), p["osmId"]))) for key in sorted(cells)]
    while queues and len(selected) < limit:
        for queue in queues:
            if len(selected) < limit:
                selected.append(queue.popleft())
        queues = [queue for queue in queues if queue]
    return selected


def publish_record(record):
    record = dict(record)
    point = record.pop("point")
    record["lng"], record["lat"] = round(point[0], 6), round(point[1], 6)
    record["id"] = f"location:{record['osmType']}:{record['osmId']}"
    record["sourceUrl"] = f"https://www.openstreetmap.org/{record['osmType']}/{record['osmId']}"
    if record["kind"] == "street":
        record["description"] = "An actual named OSM street or path. The map focus is an approximate point along its mapped route, not a specific address or entrance."
    else:
        record["description"] = f"An OSM-mapped {record['placeKind']}. This is a locality map focus, not a street address or venue entrance."
        record["area"] = record["name"]
    return record


def build(pbf, output, limit):
    reader = osmium.io.Reader(str(pbf))
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    extractor = Extract()
    extractor.apply_file(str(pbf), locations=True, idx="flex_mem")
    places = []
    seen_places = defaultdict(list)
    for place in sorted(extractor.places, key=lambda p: (p["osmType"] != "node", p["osmId"])):
        key = place["name"].casefold()
        point = place["point"]
        if any(math.hypot((point[0] - p[0]) * LX, point[1] - p[1]) < .002 for p in seen_places[key]):
            continue
        places.append(place)
        seen_places[key].append(point)
    streets = [street for ways in street_groups(extractor.streets) if (street := street_record(ways))]
    selected_places = sample_places(places, min(400, round(limit * .27)))
    selected_streets = sample_streets(streets, max(0, limit - len(selected_places)))
    selected = sorted([publish_record(r) for r in [*selected_places, *selected_streets]], key=lambda r: (r["name"].casefold(), r["id"]))
    data = {
        "version": 1, "bounds": BOUNDS,
        "source": {"name": "OpenStreetMap contributors via BBBike Lisbon extract", "url": "https://download.bbbike.org/osm/bbbike/Lisbon/Lisbon.osm.pbf", "license": "ODbL 1.0", "osmTimestamp": timestamp, "acquiredAt": datetime.now(timezone.utc).date().isoformat()},
        "counts": {"streetWays": len(extractor.streets), "availableStreets": len(streets), "availablePlaces": len(places), "selectedPlaces": len(selected_places), "selectedStreets": len(selected_streets), "selected": len(selected)},
        "selection": {"limit": limit, "cellDegrees": CELL, "method": "Mapped locality/street sample using geographic-cell round-robin, prioritising towns/suburbs, core tourist district/street names, pedestrian streets and major roads; same-name connected ways merged by shared OSM nodes."},
        "limitations": ["An offline sample of mapped names, not an exhaustive address geocoder.", "Street focus positions lie along mapped routes near their centroids; place ways use approximate centroids. Neither establishes a surveyed entrance or address.", "Names and mappings can be incomplete or outdated. Google is not the source of this index."],
        "locations": selected,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"counts": data["counts"], "bytes": output.stat().st_size, "osmTimestamp": timestamp}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("apps/web/public/data/lisbon-locations.json"))
    parser.add_argument("--limit", type=int, default=1500)
    args = parser.parse_args()
    if args.limit < 500 or args.limit > 10000:
        parser.error("--limit must be between 500 and 10000")
    build(args.osm, args.output, args.limit)
