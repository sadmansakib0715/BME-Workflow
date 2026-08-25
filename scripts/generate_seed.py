#!/usr/bin/env python3
"""Generate a git-ignored Supabase seed from the department CSV.

Usage:
  python scripts/generate_seed.py /path/to/source.csv

The generated file contains real faculty/course assignments and MUST NOT be committed
into a public repository. .gitignore already excludes it.
"""
from __future__ import annotations
import csv, pathlib, re, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'supabase'/'seed.local.sql'

def q(s:str)->str:
    return "'" + s.replace("'","''") + "'"

def norm_code(code:str)->str:
    code=re.sub(r'\s+',' ',code.strip())
    return code

def main(path):
    rows=list(csv.reader(open(path,encoding='utf-8-sig',newline='')))
    data=[]
    for r in rows[2:]:
        if len(r)<22 or not r[1].strip(): continue
        data.append({
          'code':norm_code(r[1]),'title':r[2].strip(),
          'preparer_a':r[3].strip(),'preparer_b':r[5].strip(),
          'moderator_1':r[8].strip(),'moderator_2':r[10].strip(),
          'scrutinizer':r[16].strip()
        })
    names=sorted({x[k] for x in data for k in ['preparer_a','preparer_b','moderator_1','moderator_2','scrutinizer'] if x[k]})
    out=[]
    out.append('-- GENERATED FROM PRIVATE SOURCE CSV. DO NOT COMMIT THIS FILE.\n')
    out.append('begin;\n')
    for n in names:
        out.append(f"insert into public.faculty(full_name) values ({q(n)}) on conflict (full_name) do nothing;\n")
    out.append('\n')
    for x in data:
        out.append(f"insert into public.courses(course_code,title,term,status,active) values ({q(x['code'])},{q(x['title'])},'2026','draft',true) on conflict (course_code) do update set title=excluded.title, term=excluded.term, active=true;\n")
    out.append('\n')
    for x in data:
        vals={k:f"(select id from public.faculty where full_name={q(x[k])})" for k in ['preparer_a','preparer_b','moderator_1','moderator_2','scrutinizer']}
        out.append(f"""insert into public.primary_assignments(course_id,preparer_a,preparer_b,moderator_1,moderator_2,scrutinizer)
select c.id,{vals['preparer_a']},{vals['preparer_b']},{vals['moderator_1']},{vals['moderator_2']},{vals['scrutinizer']} from public.courses c where c.course_code={q(x['code'])}
on conflict (course_id) do update set preparer_a=excluded.preparer_a,preparer_b=excluded.preparer_b,moderator_1=excluded.moderator_1,moderator_2=excluded.moderator_2,scrutinizer=excluded.scrutinizer;\n""")
    out.append('\n-- Add faculty emails separately in supabase/allowlist.local.sql before inviting users.\ncommit;\n')
    OUT.write_text(''.join(out),encoding='utf-8')
    print(f'Wrote {OUT} with {len(data)} courses and {len(names)} faculty.')

if __name__=='__main__':
    if len(sys.argv)!=2: raise SystemExit('Usage: generate_seed.py SOURCE.csv')
    main(sys.argv[1])
