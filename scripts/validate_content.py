#!/usr/bin/env python3
import json,pathlib,re
root=pathlib.Path(__file__).resolve().parents[1]
w=json.loads((root/'content/world.json').read_text())
hubs={x['id'] for x in w['hubs']};venues={x['id']:x for x in w['venues']};activities={x['id'] for x in w['activities']}
assert len(hubs)==10 and len(venues)>=20
assert len(venues)==len(w['venues']) and len(activities)==len(w['activities'])
for v in venues.values():
 assert v['hub'] in hubs and v['name'] and v['description'] and v['capacity']>0
 assert 0<=v['opens']<24 and 0<=v['closes']<=24
 assert v['type']=='bank' or any(a['venue']==v['id'] for a in w['activities'])
for a in w['activities']:
 assert a['venue'] in venues and a['seconds']>0 and a['cost']>=0 and a['reward']>=0
 assert not a['answer'] or a['answer'] in a['options']
 assert a['name'] and (not a['options'] or a['question'])
seen={'arroios'}
while True:
 before=len(seen)
 for r in w['routes']:
  assert r['fromHub'] in hubs and r['toHub'] in hubs and r['seconds']>0
  if r['fromHub'] in seen or r['toHub'] in seen:seen.update([r['fromHub'],r['toHub']])
 if len(seen)==before:break
assert seen==hubs
assert {'walk','bus','tram','metro','train','ferry'} <= {r['mode'] for r in w['routes']}
errors=set()
for p in (root/'services/game').glob('*.go'):
 if not p.name.endswith('_test.go'): errors.update(re.findall(r'fail\("([a-z_]+)"\)',p.read_text()))
copy=(root/'apps/web/app/i18n.ts').read_text()
for key in errors:assert re.search(r'\b'+key+r'\s*:',copy),f'Missing pt-PT error key: {key}'
print(f'PASS: {len(hubs)} connected hubs; {len(venues)} usable venues; {len(activities)} activities; six transport modes; every API error has pt-PT copy.')
