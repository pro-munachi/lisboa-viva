#!/usr/bin/env python3
"""Bundle OSM actual geometry + Terrarium EU-DEM for Lisbon–Sintra.
Requires Python packages osmium and Pillow. See docs/geography.md.
Source downloads stay in a caller-selected cache; only derived JSON is published.
"""
import argparse, gzip, json, math, re, subprocess
from pathlib import Path
from datetime import datetime, timezone
import osmium
from PIL import Image

BOUNDS = [-9.435, 38.683, -9.085, 38.832]
ORIGIN = [-9.16, 38.72]
ACQUIRED = datetime.now(timezone.utc).date().isoformat()
ROAD_WIDTH = {"motorway":16,"motorway_link":7,"trunk":14,"trunk_link":7,"primary":12,"primary_link":7,"secondary":10,"secondary_link":7,"tertiary":8,"tertiary_link":6,"residential":6,"unclassified":6,"living_street":5,"service":4,"pedestrian":6,"footway":2,"path":2,"steps":2,"cycleway":2,"track":3,"tram":3,"rail":3}

def inside(p): return BOUNDS[0] <= p[0] <= BOUNDS[2] and BOUNDS[1] <= p[1] <= BOUNDS[3]
def rounded(p): return [round(p[0], 6), round(p[1], 6)]
def intersects(ps):
    return ps and min(p[0] for p in ps) <= BOUNDS[2] and max(p[0] for p in ps) >= BOUNDS[0] and min(p[1] for p in ps) <= BOUNDS[3] and max(p[1] for p in ps) >= BOUNDS[1]
def clip_polygon(ps):
    if ps and ps[0] == ps[-1]: ps = ps[:-1]
    for axis, value, greater in [(0,BOUNDS[0],True),(0,BOUNDS[2],False),(1,BOUNDS[1],True),(1,BOUNDS[3],False)]:
        if not ps: return []
        out=[]; prev=ps[-1]; prev_in = prev[axis] >= value if greater else prev[axis] <= value
        for cur in ps:
            cur_in = cur[axis] >= value if greater else cur[axis] <= value
            if cur_in != prev_in:
                t=(value-prev[axis])/(cur[axis]-prev[axis]); cross=[prev[0]+t*(cur[0]-prev[0]),prev[1]+t*(cur[1]-prev[1])]; cross[axis]=value; out.append(cross)
            if cur_in: out.append(cur)
            prev=cur; prev_in=cur_in
        ps=out
    ps=[rounded(p) for p in ps]
    if ps and ps[0] != ps[-1]: ps.append(ps[0])
    return ps

def simplify(ps, tolerance=0.000018):
    # Douglas–Peucker at approximately 1–2m; preserves actual curves/junction endpoints.
    if len(ps)<3:return ps
    a,b=ps[0],ps[-1]; dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
    max_d=-1;index=0
    for i,p in enumerate(ps[1:-1],1):
        t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
        d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
        if d>max_d:max_d=d;index=i
    if max_d>tolerance*tolerance:return simplify(ps[:index+1],tolerance)[:-1]+simplify(ps[index:],tolerance)
    return [a,b]

def number(s):
    if not s:return None
    try:return float(re.search(r"[0-9]+(?:\.[0-9]+)?",s).group())
    except (ValueError,AttributeError):return None

def height(tags):
    h=number(tags.get("height")); levels=number(tags.get("building:levels"))
    if h:return max(2,min(200,h)),"height"
    if levels:return max(3,min(200,levels*3.2)),"levels"
    return (5 if tags.get("building") in ("garage","garages","shed","service") else 8 if tags.get("building") in ("house","detached","semidetached_house") else 12),"estimated"

class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__();self.roads=[];self.surfaces=[];self.buildings={};self.landmarks=[];self.latest="";self.coastlines=[]
    def landmark(self, ident,tags,ps):
        name=tags.get("name","")
        search=name.lower()
        if any(k in search for k in ["comércio","sodré","ribeira","carvalho","graça","portas do sol","torre de belém","jerónimos","maat","benfica","fronteira","pena","regaleira","palácio nacional de sintra"]):
            self.landmarks.append({"id":ident,"name":name,"point":[sum(p[0] for p in ps)/len(ps),sum(p[1] for p in ps)/len(ps)],"tags":dict(tags)})
    def node(self,n):
        p=[n.location.lon,n.location.lat]
        if inside(p) and n.tags.get("name"): self.landmark(n.id,n.tags,[p])
    def way(self,w):
        tags=w.tags; kind=tags.get("highway") or (tags.get("railway") if tags.get("railway") in ("tram","rail") else None)
        want = kind or tags.get("building") or tags.get("natural") == "coastline" or tags.get("name")
        if not want:return
        try:ps=[[n.lon,n.lat] for n in w.nodes]
        except osmium.InvalidLocationError:return
        if not intersects(ps):return
        if tags.get("name"):self.landmark(w.id,tags,ps)
        if tags.get("natural")=="coastline":self.coastlines.append({"id":w.id,"points":[rounded(p) for p in simplify(ps)]})
        if kind in ROAD_WIDTH:
            width=number(tags.get("width")) or ROAD_WIDTH[kind]
            obj={"id":w.id,"kind":kind,"width":round(min(30,width),1),"points":[rounded(p) for p in simplify(ps)]}
            if tags.get("name"):obj["name"]=tags.get("name")
            if tags.get("oneway") in ("yes","1","-1"):obj["oneWay"]=True
            self.roads.append(obj)
    def area(self,a):
        tags=a.tags
        is_building=bool(tags.get("building"))
        kind="water" if tags.get("natural")=="water" or tags.get("waterway")=="riverbank" else "wood" if tags.get("natural")=="wood" or tags.get("landuse")=="forest" else "park" if tags.get("leisure") in ("park","garden","recreation_ground","golf_course") or tags.get("landuse") in ("grass","recreation_ground") else "sand" if tags.get("natural") in ("beach","sand") else None
        if not is_building and not kind:return
        for i,ring in enumerate(a.outer_rings()):
            ps=[[n.lon,n.lat] for n in ring]
            if not intersects(ps):continue
            ps=clip_polygon(ps)
            if len(ps)<4:continue
            obj={"id":a.orig_id(),"kind":tags.get("building") if is_building else kind,"ring":ps}
            if tags.get("name"):obj["name"]=tags.get("name")
            if is_building:
                h,source=height(tags);obj.update(height=h,heightSource=source)
                self.buildings[str(a.orig_id())+":"+str(i)]=obj
            else:self.surfaces.append(obj)


def fetch(url,path):
    if not path.exists() or path.stat().st_size == 0:
        path.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error", "--max-time", "120", url, "-o", str(path)], check=True)
    return path

def dump(path,data):
    payload=(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n").encode("utf-8")
    path.write_bytes(gzip.compress(payload,compresslevel=9,mtime=0) if path.suffix==".gz" else payload)

def build_osm(pbf,out,cache):
    source="https://download.bbbike.org/osm/bbbike/Lisbon/Lisbon.osm.pbf"
    if not pbf:pbf=fetch(source,cache/"Lisbon.osm.pbf")
    reader=osmium.io.Reader(str(pbf));header=reader.header();timestamp=header.get("osmosis_replication_timestamp");reader.close()
    handler=Extract();handler.apply_file(str(pbf),locations=True,idx="flex_mem")
    chunks={}
    # A geographic grid, not disconnected themed scenes. Every included building has its actual lon/lat.
    step=.025
    for b in handler.buildings.values():
        ring=b["ring"];lng=sum(p[0] for p in ring)/len(ring);lat=sum(p[1] for p in ring)/len(ring)
        col=max(0,math.floor((lng-BOUNDS[0])/step));row=max(0,math.floor((lat-BOUNDS[1])/step));key=f"{col}-{row}"
        chunks.setdefault(key,{"id":key,"bounds":[round(BOUNDS[0]+col*step,6),round(BOUNDS[1]+row*step,6),min(BOUNDS[2],round(BOUNDS[0]+(col+1)*step,6)),min(BOUNDS[3],round(BOUNDS[1]+(row+1)*step,6))],"buildings":[]})["buildings"].append(b)
    # Keep full detail in geographic chunks; the manifest carries a lightweight continuous overview.
    for road in handler.roads:
        ps=road["points"]; lng=sum(p[0] for p in ps)/len(ps);lat=sum(p[1] for p in ps)/len(ps)
        col=max(0,min(13,math.floor((lng-BOUNDS[0])/step)));row=max(0,min(5,math.floor((lat-BOUNDS[1])/step)));key=f"{col}-{row}"
        if key in chunks:chunks[key].setdefault("roads",[]).append(road)
    def ring_area(r):
        return abs(sum(r[i][0]*r[(i+1)%len(r)][1]-r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r))))*111320*111320*math.cos(math.radians(38.72))/2
    overview_surfaces=[]
    for surface in handler.surfaces:
        ps=surface["ring"];lng=sum(p[0] for p in ps)/len(ps);lat=sum(p[1] for p in ps)/len(ps)
        col=max(0,min(13,math.floor((lng-BOUNDS[0])/step)));row=max(0,min(5,math.floor((lat-BOUNDS[1])/step)));key=f"{col}-{row}"
        if key in chunks:chunks[key].setdefault("surfaces",[]).append(surface)
        if ring_area(ps) > {"water":10000,"wood":500000,"park":100000,"sand":10000}[surface["kind"]]:
            overview=dict(surface);overview["ring"]=simplify(ps,.00004);overview_surfaces.append(overview)
    metadata=[]
    for key,chunk in sorted(chunks.items()):
        dump(out/f"buildings-{key}.json.gz",chunk);metadata.append({"id":key,"bounds":chunk["bounds"],"url":f"/data/buildings-{key}.json.gz","buildingCount":len(chunk["buildings"]),"roadCount":len(chunk.get("roads",[])),"surfaceCount":len(chunk.get("surfaces",[]))})
    manifest={"version":1,"bounds":BOUNDS,"origin":ORIGIN,"source":{"name":"OpenStreetMap contributors via BBBike Lisbon extract","url":source,"license":"ODbL 1.0","acquiredAt":ACQUIRED,"osmTimestamp":timestamp},"roads":[r for r in handler.roads if r["kind"] in ("motorway","motorway_link","trunk","trunk_link","primary","primary_link","rail","tram")],"surfaces":overview_surfaces,"coastlines":handler.coastlines,"chunks":metadata,"counts":{"roads":len(handler.roads),"buildings":len(handler.buildings),"surfaces":len(handler.surfaces)},"limitations":["Footprints and street positions are actual OSM geography; facades, roof forms and materials are stylised.","Building heights use OSM height or levels when tagged; other heights are estimates, not surveyed measurements.","Only OSM mapped features inside the published bounds are included; mapping can be incomplete or outdated.","Road widths are estimated when not tagged. Traffic and pedestrians are simulated, not live.","Surface polygons use outer rings; holes and small islands are not preserved in this lightweight snapshot."]}
    dump(out/"lisbon-manifest.json.gz",manifest);dump(cache/"landmarks.json",handler.landmarks)
    lng_metres=111320*math.cos(math.radians(ORIGIN[1]));overview=[]
    for b in handler.buildings.values():
        r=b["ring"];west=min(p[0] for p in r);east=max(p[0] for p in r);south=min(p[1] for p in r);north=max(p[1] for p in r)
        overview.append([round(((west+east)/2-ORIGIN[0])*lng_metres),round((ORIGIN[1]-(south+north)/2)*111320),max(1,round((east-west)*lng_metres)),max(1,round((north-south)*111320)),round(b["height"])])
    dump(out/"lisbon-overview.json.gz",{"origin":ORIGIN,"bounds":BOUNDS,"buildings":overview,"limitations":["Distant overview boxes are axis-aligned bounding-box approximations of real OSM building footprints, rounded to metres.","Near views must use the exact footprint rings in geographic chunks. Heights follow the same OSM/estimated logic as chunks."]})
    print(json.dumps({"counts":manifest["counts"],"chunks":len(chunks),"bytes":sum(p.stat().st_size for p in out.glob("*.json.gz")),"osmTimestamp":timestamp}))

def tile(lng,lat,z):
    n=2**z; latr=math.radians(lat)
    return (lng+180)/360*n,(1-math.asinh(math.tan(latr))/math.pi)/2*n

def build_terrain(out,cache):
    z=12;w=h=193;images={};elevations=[];source_headers=[]
    for row in range(h):
        lat=BOUNDS[3]-(BOUNDS[3]-BOUNDS[1])*row/(h-1)
        for col in range(w):
            lng=BOUNDS[0]+(BOUNDS[2]-BOUNDS[0])*col/(w-1);x,y=tile(lng,lat,z);tx,ty=math.floor(x),math.floor(y)
            if (tx,ty) not in images:
                url=f"https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{tx}/{ty}.png";path=fetch(url,cache/f"terrain-{z}-{tx}-{ty}.png")
                images[(tx,ty)]=Image.open(path).convert("RGB")
            r,g,b=images[(tx,ty)].getpixel((min(255,int((x-tx)*256)),min(255,int((y-ty)*256))))
            elevations.append(round(r*256+g+b/256-32768,1))
    terrain={"bounds":BOUNDS,"width":w,"height":h,"elevations":elevations,"source":{"name":"Mapzen/Tilezen Terrain Tiles, EU-DEM (Copernicus)","url":"https://registry.opendata.aws/terrain-tiles/","license":"Copernicus EU-DEM reuse with attribution; see docs/geography.md","acquiredAt":ACQUIRED,"zoom":z,"attribution":"Produced using Copernicus data and information funded by the European Union — EU-DEM layers."},"limitations":["Sampled 193×193 DEM of the complete region; approximately 159×86m sample spacing, not street-level surveying.","Terrain source tiles were published in 2017; elevations include source measurement artefacts and interpolation."]}
    dump(out/"lisbon-terrain.json.gz",terrain);print(json.dumps({"terrainTiles":len(images),"grid":[w,h],"min":min(elevations),"max":max(elevations)}))

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--osm",type=Path);parser.add_argument("--cache",type=Path,default=Path("/tmp/roam-geography"));parser.add_argument("--output",type=Path,default=Path("apps/web/public/data"));parser.add_argument("--terrain-only",action="store_true");args=parser.parse_args();args.cache.mkdir(parents=True,exist_ok=True);args.output.mkdir(parents=True,exist_ok=True)
    if not args.terrain_only:build_osm(args.osm,args.output,args.cache)
    build_terrain(args.output,args.cache)
