#!/usr/bin/env python3
"""Validate the offline geographic bundle without network or third-party packages."""
import collections, gzip, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/"apps/web/public/data"
def read(path):
    payload=path.read_bytes()
    assert payload[:3]==b"\x1f\x8b\x08" and payload[4:8]==b"\0\0\0\0", "Gzip must have deterministic mtime=0"
    return json.loads(gzip.decompress(payload))
m=read(ROOT/"lisbon-manifest.json.gz");t=read(ROOT/"lisbon-terrain.json.gz");o=read(ROOT/"lisbon-overview.json.gz")
assert m["version"]==1 and m["origin"]==[-9.16,38.72]
assert m["source"]["license"]=="ODbL 1.0" and m["source"]["osmTimestamp"]
west,south,east,north=m["bounds"]
counts=collections.Counter();heights=collections.Counter();ids=set()
def point(p):
 assert len(p)==2 and all(math.isfinite(n) for n in p)
 assert -180<=p[0]<=180 and -90<=p[1]<=90
for c in m["chunks"]:
 assert c["url"].startswith('/data/buildings-') and c["url"].endswith('.json.gz') and '..' not in c["url"]
 d=read(ROOT/Path(c["url"]).name)
 assert d["id"]==c["id"] and len(d["buildings"])==c["buildingCount"]
 assert len(d.get("roads",[]))==c["roadCount"]
 assert len(d.get("surfaces",[]))==c["surfaceCount"]
 assert d["bounds"][0]<d["bounds"][2] and d["bounds"][1]<d["bounds"][3]
 for b in d["buildings"]:
  assert len(b["ring"])>=4 and b["ring"][0]==b["ring"][-1]
  assert math.isfinite(b["height"]) and 2<=b["height"]<=200
  assert b["heightSource"] in ("height","levels","estimated")
  for p in b["ring"]:
   point(p);assert west-1e-6<=p[0]<=east+1e-6 and south-1e-6<=p[1]<=north+1e-6
  heights[b["heightSource"]]+=1
 for r in d.get("roads",[]):
  assert len(r["points"])>=2 and 0<r["width"]<=30
  for p in r["points"]:point(p)
 counts['buildings']+=len(d["buildings"]);counts['roads']+=len(d.get("roads",[]));counts['surfaces']+=len(d.get("surfaces",[]))
assert counts==collections.Counter(m['counts']), (counts,m['counts'])
assert len(t["elevations"])==t["width"]*t["height"] and t["bounds"]==m["bounds"]
assert t["width"]>=128 and t["height"]>=128 and all(math.isfinite(x) and -10<x<1000 for x in t["elevations"])
assert max(t["elevations"])>400, "Sintra hill elevations must be included"
assert o["origin"]==m["origin"] and o["bounds"]==m["bounds"] and len(o["buildings"])==counts["buildings"]
assert all(len(b)==5 and all(isinstance(v,int) for v in b) and b[2]>0 and b[3]>0 and 2<=b[4]<=200 for b in o["buildings"])
assert len(gzip.decompress((ROOT/'lisbon-manifest.json.gz').read_bytes()))<2_000_000, "Decoded startup manifest exceeds data budget"
assert not list(ROOT.glob("*.json")), "Generated public JSON should be compressed"
print(json.dumps({"status":"passed","chunks":len(m["chunks"]),"counts":counts,"heightSources":heights,"terrainSamples":len(t["elevations"]),"manifestBytes":(ROOT/'lisbon-manifest.json.gz').stat().st_size,"compressedTotalBytes":sum(p.stat().st_size for p in ROOT.glob("*.json.gz"))}))
