const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

export const csvExportService = {
  serialize(headers, rows) {
    return [headers.map(({ label }) => escapeCell(label)).join(','), ...rows.map((row) => headers.map(({ key }) => escapeCell(row[key])).join(','))].join('\r\n')
  },
  download(filename, headers, rows) {
    const csv = `\uFEFF${this.serialize(headers, rows)}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = filename; link.click()
    URL.revokeObjectURL(url)
  },
}
