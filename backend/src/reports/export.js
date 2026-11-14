export function safeCsvCell(value) {
  let text = String(value ?? '').replaceAll('\0', '')
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function reportCsv(report) {
  const rows = [['التقرير', 'التصنيف', 'التصنيف الفرعي', 'الرقم الوظيفي', 'الموظف', 'القسم', 'عدد البلاغات']]
  for (const [key, label] of [['total', 'إجمالي البلاغات'], ['solved', 'تم الحل'], ['unsolved', 'لم يتم الحل'], ['reopened', 'أعيد فتحها سابقًا']]) rows.push([label, '', '', '', '', '', report.tickets[key]])
  for (const item of report.mostReportedProblems) rows.push(['أنواع الأعطال', item.category, item.subcategory, '', '', '', item.ticketCount])
  for (const item of report.topEmployees) rows.push(['الموظفون', '', '', item.employeeNumber, item.employeeName, item.department, item.ticketCount])
  return '\uFEFF' + rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n') + '\r\n'
}
