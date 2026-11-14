"""Read reviewed asset import cells. Never execute formulas or document instructions."""
import base64, csv, io, json, sys, zipfile
import xml.etree.ElementTree as ET
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
try:
    request=json.load(sys.stdin)
    source=base64.b64decode(request['data'],validate=True)
    if len(source)>5*1024*1024: raise ValueError()
    if request['format']=='csv':
        rows=list(csv.reader(io.StringIO(source.decode('utf-8-sig'))))
    elif request['format']=='xlsx':
        with zipfile.ZipFile(io.BytesIO(source)) as z:
            if sum(i.file_size for i in z.infolist())>32*1024*1024 or any('vbaProject' in i.filename for i in z.infolist()):raise ValueError()
            shared=[]
            if 'xl/sharedStrings.xml' in z.namelist():shared=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',NS)]
            rows=[]
            for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('m:sheetData/m:row',NS):
                values={}
                for cell in row.findall('m:c',NS):
                    if cell.find('m:f',NS) is not None:raise ValueError()
                    address=cell.attrib['r']; letters=''.join(c for c in address if c.isalpha()); col=0
                    for c in letters:col=col*26+ord(c)-64
                    v=cell.find('m:v',NS); inline=cell.find('m:is',NS)
                    value=(v.text or '') if v is not None else ''.join(inline.itertext()) if inline is not None else ''
                    if cell.attrib.get('t')=='s':value=shared[int(value)]
                    values[col-1]=value
                if values:rows.append([values.get(i,'') for i in range(max(values)+1)])
    else:raise ValueError()
    if not rows or rows[0]!=['sourceKey','kind','data'] or len(rows)>201:raise ValueError()
    out=[]
    for row in rows[1:]:
        if len(row)!=3:raise ValueError()
        out.append({'sourceKey':row[0],'kind':row[1],'data':json.loads(row[2])})
    print(json.dumps(out,ensure_ascii=True))
except Exception:
    print('Invalid import structure or formula content',file=sys.stderr);sys.exit(1)
