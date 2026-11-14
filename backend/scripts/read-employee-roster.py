"""Read data cells only from the expected employee XLSX sheet. Never execute cell content."""
import json
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
def read_roster(path):
    with zipfile.ZipFile(path) as archive:
        if sum(item.file_size for item in archive.infolist()) > 32 * 1024 * 1024:
            raise ValueError("Workbook is too large")
        if any("vbaProject" in item.filename for item in archive.infolist()):
            raise ValueError("Macro content is not accepted")
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        result = []
        for row in root.findall("m:sheetData/m:row", NS):
            cells = {}
            for cell in row.findall("m:c", NS):
                if cell.find("m:f", NS) is not None:
                    raise ValueError("Formula cells are not accepted in employee data")
                column = re.sub(r"\d", "", cell.attrib["r"])
                value = cell.find("m:v", NS)
                inline = cell.find("m:is", NS)
                text = value.text if value is not None else "".join(inline.itertext()) if inline is not None else ""
                if cell.attrib.get("t") == "s":
                    text = shared[int(text)]
                cells[column] = unicodedata.normalize("NFC", (text or "").strip())
            if row.attrib["r"] == "1":
                if cells != {"A": "م", "B": "اسم الموظف", "C": "القسم"}:
                    raise ValueError("Unexpected employee-sheet headers")
                continue
            if not any(cells.values()):
                continue
            if set(cells) != {"A", "B", "C"} or not all(cells.values()):
                raise ValueError("Employee data must contain exactly sequence, name and department")
            if not re.fullmatch(r"[0-9]{1,6}", cells["A"]):
                raise ValueError("Invalid source row sequence")
            result.append({"sourceRow": int(row.attrib["r"]), "sequence": int(cells["A"]), "fullName": cells["B"], "department": cells["C"]})
        if not result or len({row["sequence"] for row in result}) != len(result):
            raise ValueError("Empty roster or duplicate row sequences")
        return result

if __name__ == "__main__":
    try:
        print(json.dumps(read_roster(sys.argv[1]), ensure_ascii=True))
    except Exception:
        print("Roster parsing stopped: workbook structure/data needs review", file=sys.stderr)
        sys.exit(1)
