#!/usr/bin/env python3
"""Create two explicit LOCAL development accounts; never use against a hosted service."""
import json, urllib.request, urllib.error, os
if os.environ.get('ALLOW_DEMO_SEED') != 'true':
    raise SystemExit('Set ALLOW_DEMO_SEED=true to create documented development-only accounts.')
for handle, name, color in [('ines_demo','Inês Martins','terra'),('tomas_demo','Tomás Costa','blue')]:
    data=json.dumps(dict(mode='register',handle=handle,password='LisboaDemo2026!',name=name,story='newcomer',color=color,pronouns='',bio='A descobrir a minha nova vida em Lisboa.',interests='Música, cozinha e passeios')).encode()
    req=urllib.request.Request('http://127.0.0.1:8080/v1/auth',data=data,headers={'Content-Type':'application/json','Origin':'http://localhost:3000'})
    try:
        with urllib.request.urlopen(req) as res: print(handle, res.status)
    except urllib.error.HTTPError as e:
        if json.load(e).get('error')!='handle_taken': raise
        print(handle, 'already exists (unchanged)')
