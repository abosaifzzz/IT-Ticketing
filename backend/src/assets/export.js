import { zipSync, strToU8 } from 'fflate'
import { operationalStatusLabels } from './validation.js'

export const inventoryColumns = [
  ['assetId', 'رقم الأصل'], ['name', 'اسم الأصل'], ['quantity', 'الكمية'], ['manufacturer', 'الشركة المصنعة'],
  ['model', 'الموديل'], ['serialNumber', 'الرقم المسلسل'], ['department', 'القسم'], ['location', 'الموقع الفعلي'],
  ['purchaseDate', 'تاريخ الشراء'], ['statusLabel', 'الحالة التشغيلية'], ['conditionDescription', 'وصف الحالة'],
  ['maintenanceNotes', 'ملاحظات الصيانة'], ['lastMaintenanceDate', 'تاريخ آخر صيانة'],
  ['takenByEngineerName', 'المهندس الذي سحب الأصل'], ['withdrawnForTicketId', 'رقم البلاغ المرتبط بالسحب'],
]

function xml(value) {
  return [...String(value ?? '')].filter((char) => {
    const code = char.codePointAt(0)
    return [9, 10, 13].includes(code) || (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff)
  }).join('').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export async function inventoryWorkbook(items) {
  const rows = [inventoryColumns.map(([, label]) => label), ...items.map((item) => {
    const row = { ...item, statusLabel: operationalStatusLabels[item.operationalStatus] }
    return inventoryColumns.map(([key]) => key === 'quantity' ? item.quantity : String(row[key] ?? ''))
  })]
  const cells = rows.map((values, index) => `<row r="${index + 1}">${values.map((value, column) => {
    const address = `${String.fromCharCode(65 + column)}${index + 1}`
    // Spreadsheet text is always an inline string, including '=...', never a formula.
    return typeof value === 'number'
      ? `<c r="${address}" s="0"><v>${value}</v></c>`
      : `<c r="${address}" s="${index === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
  }).join('')}</row>`).join('')
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="الأصول التقنية" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="15" width="28" customWidth="1"/></cols><sheetData>${cells}</sheetData><autoFilter ref="A1:O1"/></worksheet>`,
  }
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`)]))))
}
