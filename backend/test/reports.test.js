import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportFilters } from '../src/reports/validation.js'
import { reportCsv, safeCsvCell } from '../src/reports/export.js'

test('report date filters validate calendar days and use an exclusive next-day boundary', () => {
  const filters = reportFilters({ dateFrom: '2024-02-29', dateTo: '2024-02-29' })
  assert.equal(filters.until.toISOString(), '2024-03-01T00:00:00.000Z')
  assert.equal(filters.limit, 10)
  for (const query of [{ dateFrom: '2025-02-29' }, { dateTo: '9999-01-01' }, { dateFrom: '2025-02-02', dateTo: '2025-02-01' }, { dateTo: ['2024-01-01'] }, { accountId: 'other' }, { limit: '0' }, { limit: '101' }, { limit: '1.0' }]) assert.throws(() => reportFilters(query))
  assert.equal(reportFilters({ dateFrom: '', dateTo: '', limit: '100' }).limit, 100)
})

test('CSV preserves Arabic, quotes delimiters/newlines and neutralizes spreadsheet formulas', () => {
  for (const text of ['=SUM(1,2)', '+cmd', '-1', '@SUM(1)', '  =x', '\t=x', '\rtext', '\ntext']) assert.ok(safeCsvCell(text).startsWith('"\''))
  assert.equal(safeCsvCell('قول "نعم",\nالتالي'), '"قول ""نعم"",\nالتالي"')
  assert.equal(safeCsvCell('safe\0text'), '"safetext"')
  const csv = reportCsv({ tickets: { total: 1, solved: 0, unsolved: 1, reopened: 0 }, mostReportedProblems: [{ category: '=1+1', subcategory: 'طابعة', ticketCount: 1 }], topEmployees: [{ employeeNumber: '@x', employeeName: '+x', department: '-x', ticketCount: 1 }] })
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"\'=1+1"'))
  assert.ok(csv.includes('"\'@x","\'+x","\'-x"'))
  assert.ok(csv.endsWith('\r\n'))
})
