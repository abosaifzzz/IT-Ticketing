const encoder = new TextEncoder()
const encode = (value) => encoder.encode(value)
const stripInvalidXmlCharacters = (value) => [...value].filter((character) => {
  const code = character.charCodeAt(0)
  return code > 31 || code === 9 || code === 10 || code === 13
}).join('')

const escapeXml = (value) => stripInvalidXmlCharacters(String(value ?? ''))
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

function columnName(index) {
  let value = index + 1
  let name = ''
  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + value % 26) + name
    value = Math.floor(value / 26)
  }
  return name
}

function worksheet(headers, rows) {
  const values = [headers.map(({ label }) => label), ...rows.map((row) => headers.map(({ key }) => row[key]))]
  const body = values.map((cells, rowIndex) => `<row r="${rowIndex + 1}">${cells.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`
    return rowIndex > 0 && typeof value === 'number' && Number.isFinite(value)
      ? `<c r="${reference}"><v>${value}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  }).join('')}</row>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>${body}</sheetData></worksheet>`
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(bytes) {
  let value = 0xFFFFFFFF
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xFF] ^ (value >>> 8)
  return (value ^ 0xFFFFFFFF) >>> 0
}

function writeUint16(view, offset, value) { view.setUint16(offset, value, true) }
function writeUint32(view, offset, value) { view.setUint32(offset, value, true) }

function zip(files) {
  const chunks = []
  const directory = []
  let offset = 0
  for (const [path, content] of files) {
    const name = encode(path)
    const bytes = encode(content)
    const checksum = crc32(bytes)
    const local = new Uint8Array(30 + name.length + bytes.length)
    const view = new DataView(local.buffer)
    writeUint32(view, 0, 0x04034B50)
    writeUint16(view, 4, 20)
    writeUint16(view, 6, 0x0800)
    writeUint16(view, 8, 0)
    writeUint32(view, 14, checksum)
    writeUint32(view, 18, bytes.length)
    writeUint32(view, 22, bytes.length)
    writeUint16(view, 26, name.length)
    local.set(name, 30)
    local.set(bytes, 30 + name.length)
    chunks.push(local)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    writeUint32(centralView, 0, 0x02014B50)
    writeUint16(centralView, 4, 20)
    writeUint16(centralView, 6, 20)
    writeUint16(centralView, 8, 0x0800)
    writeUint32(centralView, 16, checksum)
    writeUint32(centralView, 20, bytes.length)
    writeUint32(centralView, 24, bytes.length)
    writeUint16(centralView, 28, name.length)
    writeUint32(centralView, 42, offset)
    central.set(name, 46)
    directory.push(central)
    offset += local.length
  }
  const directorySize = directory.reduce((total, entry) => total + entry.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  writeUint32(endView, 0, 0x06054B50)
  writeUint16(endView, 8, files.length)
  writeUint16(endView, 10, files.length)
  writeUint32(endView, 12, directorySize)
  writeUint32(endView, 16, offset)
  const result = new Uint8Array(offset + directorySize + end.length)
  let position = 0
  for (const chunk of [...chunks, ...directory, end]) { result.set(chunk, position); position += chunk.length }
  return result
}

export const excelExportService = {
  serialize(headers, rows, sheetName = 'الأصول التقنية') {
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
      ['xl/worksheets/sheet1.xml', worksheet(headers, rows)],
    ]
    return zip(files)
  },
  download(filename, headers, rows) {
    const bytes = this.serialize(headers, rows)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
