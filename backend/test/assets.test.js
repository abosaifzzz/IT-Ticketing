import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { assetInput, assetFilters, withdrawalInput, assetId } from '../src/assets/validation.js'
import { inventoryWorkbook, inventoryColumns } from '../src/assets/export.js'

const input = { assetId: 'ast-test-001', name: 'شاشة خيالية', quantity: 3, manufacturer: 'Fictional', model: 'Demo',
  holdingType: 'it_storage', location: 'رف خيالي', operationalStatus: 'working', conditionDescription: 'وصف خيالي' }
const invalid = (fn) => assert.throws(fn, (error) => error.status === 400)

test('asset validation requires positive integer quantities and preserves safe immutable IDs', () => {
  assert.equal(assetInput(input).assetId, 'AST-TEST-001')
  for (const quantity of [0, -1, 1.5, '2', 1000001, null]) invalid(() => assetInput({ ...input, quantity }))
  for (const assetId of ['../file', 'a/b', '<script>', 'x'.repeat(41)]) invalid(() => assetInput({ ...input, assetId }))
  for (const key of ['assetId', 'name', 'manufacturer', 'model', 'quantity', 'location', 'conditionDescription']) {
    const body = { ...input }; delete body[key]
    invalid(() => assetInput(body))
  }
  for (const key of ['category', 'conditionRating', 'rating', 'takenByEngineerId', 'withdrawnForTicketId', 'archivedAt']) invalid(() => assetInput({ ...input, [key]: 'forbidden' }))
  invalid(() => assetInput({ assetId: 'NEW-ID', expectedVersion: 0 }, true))
  invalid(() => assetInput({ ...input, operationalStatus: 'withdrawn' }))
  invalid(() => assetInput({ ...input, purchaseDate: '2026-02-29' }))
  invalid(() => assetInput({ ...input, serialNumber: 5 }))
  assert.equal(assetInput({ ...input, purchaseDate: '2028-02-29' }).purchaseDate, '2028-02-29')
  invalid(() => assetInput({ ...input, holdingType: 'department' }))
  invalid(() => assetInput({ ...input, departmentId: randomUUID() }))
})

test('asset patches and filters validate versions, exact dates, pagination and field allowlists', () => {
  assert.deepEqual(assetInput({ quantity: 2, expectedVersion: 0 }, true), { expectedVersion: 0, quantity: 2 })
  invalid(() => assetInput({ quantity: 2 }, true))
  invalid(() => assetInput({ expectedVersion: 0 }, true))
  invalid(() => assetInput({ expectedVersion: -1, quantity: 2 }, true))
  for (const query of [{ category: 'x' }, { rating: '5' }, { pageSize: '101' }, { includeArchived: 'yes' }, { departmentId: 'bad' }, { search: ['x'] }]) invalid(() => assetFilters(query))
  invalid(() => assetFilters({ includeArchived: 'true' }, true))
  invalid(() => assetFilters({ page: '2' }, true))
  assert.equal(assetId('ast-123'), 'AST-123')
  invalid(() => withdrawalInput({ ticketId: randomUUID(), quantity: 2 }))
  invalid(() => withdrawalInput({ ticketId: randomUUID(), engineerId: randomUUID() }))
})

test('XLSX export is a genuine ZIP workbook with Arabic RTL cells, numeric quantities and literal formula-like text', async () => {
  const buffer = await inventoryWorkbook([{ ...input, assetId: 'AST-001', name: '=HYPERLINK("https://fictional.example")',
    manufacturer: '+FORMULA', model: '@DEMO', department: 'مخزن تكنولوجيا المعلومات', quantity: 3,
    conditionDescription: 'نص <خيالي> & عربي', maintenanceNotes: '-1+2', operationalStatus: 'working' }])
  assert.equal(buffer.readUInt32LE(0), 0x04034b50)
  const files = unzipSync(buffer)
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(files[part])
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(sheet, /rightToLeft="1"/)
  assert.match(sheet, /رقم الأصل/)
  assert.match(sheet, /<c r="C2" s="0"><v>3<\/v><\/c>/)
  assert.match(sheet, /<c r="B2" s="0" t="inlineStr">/)
  assert.match(sheet, /=HYPERLINK\(&quot;/)
  assert.match(sheet, /نص &lt;خيالي&gt; &amp; عربي/)
  assert.doesNotMatch(sheet, /<f[ >]/)
  assert.match(strFromU8(files['xl/styles.xml']), /readingOrder="2"/)
  assert.equal(inventoryColumns.some(([key]) => /category|rating/i.test(key)), false)
  const empty = unzipSync(await inventoryWorkbook([]))
  assert.match(strFromU8(empty['xl/worksheets/sheet1.xml']), /<row r="1">/)
})
