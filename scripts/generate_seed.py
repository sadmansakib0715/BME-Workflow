#!/usr/bin/env python3
"""Generate a git-ignored Supabase seed from the department CSV.

Usage:
  python scripts/generate_seed.py /path/to/source.csv

The generated file contains real faculty/course assignments and MUST NOT be committed
into a public repository. .gitignore already excludes it.
"""
from __future__ import annotations
import csv, datetime as dt, pathlib, re, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'supabase'/'seed.local.sql'

def q(s:str)->str:
    return "'" + s.replace("'","''") + "'"

def norm_code(code:str)->str:
    code=re.sub(r'\s+',' ',code.strip())
    return code

def suggest_course_type(code:str)->str:
    m=re.search(r'(\d{3})\b',norm_code(code))
    if not m:
        return 'theory'
    return 'sessional' if int(m.group(1)) % 2 == 0 else 'theory'

def norm_assessment_label(label:str)->str:
    label=re.sub(r'\s+',' ',label.strip())
    fixes={
        'Conitnuous Assessment':'Continuous Assessment',
        'Continous Assessment':'Continuous Assessment',
        'Marks Uploaded':'Marks Uploaded in Excel'
    }
    for old,new in fixes.items():
        label=label.replace(old,new)
    return label

def norm_date(value:str)->str|None:
    raw=value.strip()
    if not raw:
        return None
    if re.fullmatch(r'\d{5}',raw):
        # Excel's 1900 date system, including its historical leap-year offset.
        return (dt.date(1899,12,30)+dt.timedelta(days=int(raw))).isoformat()
    for fmt in ('%d/%m/%Y','%A, %B %d, %Y','%B %d,%Y','%B %d, %Y','%d-%b-%Y','%Y-%m-%d'):
        try:
            return dt.datetime.strptime(raw,fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f'Unrecognized date format: {raw}')

def main(path):
    rows=list(csv.reader(open(path,encoding='utf-8-sig',newline='')))
    data=[]
    for r in rows[2:]:
        if len(r)<22 or not r[1].strip(): continue
        data.append({
          'code':norm_code(r[1]),'title':r[2].strip(),
          'course_type':suggest_course_type(r[1]),
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
        out.append(f"insert into public.courses(course_code,title,term,course_type,status,active) values ({q(x['code'])},{q(x['title'])},'2026',{q(x['course_type'])},'draft',true) on conflict (course_code) do update set title=excluded.title, term=excluded.term, course_type=excluded.course_type, active=true;\n")
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
