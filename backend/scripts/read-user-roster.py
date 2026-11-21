"""Read username/fullName cells as data only; never execute workbook content."""
import csv
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

def read_users(path):
    ext = Path(path).suffix.lower()
    if ext == '.json':
        with open(path, encoding='utf-8-sig') as source:
            return json.load(source)
    if ext == '.csv':
        with open(path, encoding='utf-8-sig', newline='') as source:
            reader = csv.DictReader(source)
            if reader.fieldnames != ['username', 'fullName']:
                raise ValueError('Expected username,fullName headers')
            return list(reader)
    if ext != '.xlsx':
        raise ValueError('Only CSV, XLSX and JSON are accepted')
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as archive:
        if sum(item.file_size for item in archive.infolist()) > 32 * 1024 * 1024 or len(archive.infolist()) > 2000:
            raise ValueError('Workbook is too large')
        if any('vbaProject' in item.filename for item in archive.infolist()):
            raise ValueError('Macros are not accepted')
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        root = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        result, header = [], False
        for row in root.findall('m:sheetData/m:row', ns):
            cells = {}
            for cell in row.findall('m:c', ns):
                if cell.find('m:f', ns) is not None:
                    raise ValueError('Formula cells are not accepted')
                value, inline = cell.find('m:v', ns), cell.find('m:is', ns)
                content = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else ''
                if cell.attrib.get('t') == 's':
                    content = shared[int(content)]
                if content:
                    cells[re.sub(r'\d', '', cell.attrib['r'])] = content.strip()
            if not cells:
                continue
            if not header:
                accepted = [
                    {'A': 'username', 'B': 'fullName'},
                    {'A': '\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645', 'B': 'Full Name'},
                ]
                if cells not in accepted:
                    raise ValueError('Expected username/fullName in columns A/B')
                header = True
            else:
                if set(cells) != {'A', 'B'}:
                    raise ValueError('Expected exactly two non-empty cells')
                result.append({'username': cells['A'], 'fullName': cells['B']})
        return result

if __name__ == '__main__':
    try:
        print(json.dumps(read_users(sys.argv[1]), ensure_ascii=True))
    except Exception:
        print('Invalid user roster structure', file=sys.stderr)
        sys.exit(1)
