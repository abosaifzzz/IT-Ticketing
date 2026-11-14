const storage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
}

const { mockReportService } = await import('../src/services/reports/mockReportService.js')
const { mockTicketService } = await import('../src/services/mock/mockTicketService.js')
const { csvExportService } = await import('../src/services/reports/csvExportService.js')

const baseline = mockReportService.getDashboard()
if (baseline.tickets.solved + baseline.tickets.unsolved !== baseline.tickets.total ||
    'technicianPerformance' in baseline || 'assets' in baseline || 'overall' in baseline ||
    'averageResolutionHours' in baseline.tickets)
  throw new Error('Report includes removed breakdowns or inconsistent ticket totals')

const ticket = mockTicketService.create({
  reporterAccountId: 'demo-employee-01',
  reporterName: 'موظف تقرير تجريبي',
  employeeNumber: 'EMP-RPT-01',
  department: 'الحسابات',
  title: 'اختبار عداد البلاغات',
  category: 'أجهزة الكمبيوتر',
  subcategory: 'محطة عمل',
  description: 'بيانات تجريبية لاختبار التقرير.',
})
let current = mockReportService.getDashboard().tickets
if (current.total !== baseline.tickets.total + 1 || current.unsolved !== baseline.tickets.unsolved + 1)
  throw new Error('New ticket did not update the unsolved count')

const assigned = mockTicketService.assign(ticket.id, 'demo-engineer-01', { id: 'demo-manager-01', name: 'مدير تجريبي' })
const resolved = assigned && mockTicketService.resolve(ticket.id, 'demo-engineer-01', 'تم حل المشكلة التجريبية')
current = mockReportService.getDashboard().tickets
if (!resolved || current.solved !== baseline.tickets.solved + 1 || current.unsolved !== baseline.tickets.unsolved)
  throw new Error('Resolved ticket did not update the solved count')

const reopened = mockTicketService.reopen(ticket.id, 'demo-employee-01', 'المشكلة مستمرة')
current = mockReportService.getDashboard().tickets
if (!reopened || current.reopened !== baseline.tickets.reopened + 1 || current.unsolved !== baseline.tickets.unsolved + 1)
  throw new Error('Reopened ticket did not update the unsolved and reopened counts')

mockTicketService.resolve(ticket.id, 'demo-engineer-01', 'تم حل المشكلة مرة أخرى')
mockTicketService.confirmResolution(ticket.id, 'demo-employee-01')
current = mockReportService.getDashboard().tickets
if (current.reopened !== baseline.tickets.reopened + 1 || current.solved !== baseline.tickets.solved + 1 ||
    current.solved + current.unsolved !== current.total)
  throw new Error('Historical reopening was lost after the ticket was closed')

const secondTicket = mockTicketService.create({
  reporterAccountId: 'demo-employee-02',
  reporterName: 'اسم مختلف لنفس الرقم',
  employeeNumber: 'EMP-RPT-01',
  department: 'قسم آخر',
  title: 'اختبار تكرار نوع العطل',
  category: 'تصنيف اختبار التقرير',
  subcategory: 'تصنيف فرعي تجريبي',
  description: 'بلاغ ثانٍ لاختبار تجميع الموظف.',
})
const thirdTicket = mockTicketService.create({
  reporterAccountId: null,
  reporterName: 'عضو إدارة عليا تجريبي',
  department: 'الإدارة العليا',
  requesterType: 'top_management',
  source: 'manual',
  createdByAccountId: 'demo-manager-01',
  createdByName: 'مدير تجريبي',
  title: 'اختبار استبعاد الإدارة العليا',
  category: 'تصنيف اختبار التقرير',
  subcategory: 'تصنيف فرعي تجريبي',
  description: 'بلاغ يدوي للإدارة العليا.',
})
const ranked = mockReportService.getDashboard()
const employeeGroup = ranked.topEmployees.find((employee) => employee.employeeNumber === 'EMP-RPT-01')
const problemGroup = ranked.mostReportedProblems.find((problem) => problem.category === 'تصنيف اختبار التقرير' && problem.subcategory === 'تصنيف فرعي تجريبي')
if (!secondTicket || !thirdTicket || employeeGroup?.ticketCount !== 2 ||
    ranked.topEmployees.some((employee) => employee.employeeName === 'عضو إدارة عليا تجريبي') ||
    problemGroup?.ticketCount !== 2 ||
    ranked.mostReportedProblems.some((problem, index, groups) => index > 0 && problem.ticketCount > groups[index - 1].ticketCount))
  throw new Error('Problem or employee ranking grouped tickets incorrectly')

const emptyRange = mockReportService.getDashboard({ dateFrom: '2099-01-01', dateTo: '2099-12-31' })
if (Object.values(emptyRange.tickets).some(Boolean) || emptyRange.mostReportedProblems.length || emptyRange.topEmployees.length)
  throw new Error('Date-range filter failed for counts or rankings')

const csv = csvExportService.serialize([{ key: 'label', label: 'المؤشر' }, { key: 'count', label: 'العدد' }], [{ label: 'بلاغات "معادة"', count: current.reopened }])
if (!csv.includes('""معادة""') || !csv.includes(String(current.reopened)))
  throw new Error('Summary CSV export failed')

console.log('PASS ticket counts, fault and employee rankings, senior-management exclusion, date filters, and CSV export')
