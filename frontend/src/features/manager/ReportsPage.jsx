import {authMode} from '../../services/auth/mode'
import {ReportsApi} from './api/ReportsApi'
import { CalendarRange, CircleCheck, CircleDashed, Download, RotateCcw, TicketCheck } from 'lucide-react'
import { useEffect, useReducer, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { appEvents, EVENT_NAMES } from '../../services/events/eventBus'
import { csvExportService } from '../../services/reports/csvExportService'
import { mockReportService } from '../../services/reports/mockReportService'

const initialFilters = { dateFrom: '', dateTo: '' }
const ticketEvents = [EVENT_NAMES.TICKET_CREATED, EVENT_NAMES.TICKET_UPDATED]

function MockReportsPage() {
  const [filters, setFilters] = useState(initialFilters)
  const [, refresh] = useReducer((value) => value + 1, 0)
  useEffect(() => {
    const unsubscribers = ticketEvents.map((eventName) => appEvents.subscribe(eventName, refresh))
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [])

  const invalidRange = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
  const report = invalidRange ? null : mockReportService.getDashboard(filters)
  const updateFilter = ({ target }) => setFilters((current) => ({ ...current, [target.name]: target.value }))
  const exportSummary = () => {
    if (!report) return
    const rows = [
      { label: 'إجمالي البلاغات', count: report.tickets.total },
      { label: 'البلاغات المحلولة', count: report.tickets.solved },
      { label: 'البلاغات غير المحلولة', count: report.tickets.unsolved },
      { label: 'البلاغات التي أُعيد فتحها', count: report.tickets.reopened },
    ]
    csvExportService.download('ملخص-البلاغات.csv', [
      { key: 'label', label: 'المؤشر' },
      { key: 'count', label: 'العدد' },
    ], rows)
  }

  return <div className="mx-auto max-w-6xl">
    <div className="page-heading"><div><p className="eyebrow">ملخص البلاغات</p><h1>التقارير</h1><p>أعداد البلاغات وحالة حلها، محسوبة من البيانات الحالية.</p></div><Button type="button" variant="secondary" onClick={exportSummary} disabled={!report}><Download size={18} />تصدير الملخص</Button></div>

    <section className="content-card" aria-label="نطاق التقرير"><div className="flex items-center gap-2"><CalendarRange size={20} className="text-primary-600" /><h2 className="text-lg font-extrabold text-ink">نطاق التقرير</h2></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
      <label><span className="field-label">من تاريخ الإنشاء</span><input type="date" name="dateFrom" value={filters.dateFrom} onChange={updateFilter} className="field-input" /></label>
      <label><span className="field-label">إلى تاريخ الإنشاء</span><input type="date" name="dateTo" value={filters.dateTo} onChange={updateFilter} className="field-input" /></label>
      <Button type="button" variant="secondary" className="self-end" onClick={() => setFilters(initialFilters)}><RotateCcw size={17} />إعادة ضبط</Button>
    </div>{invalidRange && <p role="alert" className="mt-3 text-sm font-bold text-red-600">يجب أن يكون تاريخ البداية قبل تاريخ النهاية.</p>}</section>

    {report && <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="أعداد البلاغات">
        <article className="metric-card"><TicketCheck size={22} className="mb-3 text-primary-600" /><strong>{report.tickets.total}</strong><span>إجمالي البلاغات</span></article>
        <article className="metric-card"><CircleCheck size={22} className="mb-3 text-emerald-600" /><strong>{report.tickets.solved}</strong><span>تم حلها</span></article>
        <article className="metric-card"><CircleDashed size={22} className="mb-3 text-amber-600" /><strong>{report.tickets.unsolved}</strong><span>لم تُحل بعد</span></article>
        <article className="metric-card"><RotateCcw size={22} className="mb-3 text-sky-600" /><strong>{report.tickets.reopened}</strong><span>أُعيد فتحها</span></article>
      </section>
      <p className="mt-4 text-sm leading-7 text-muted">المحلولة تشمل البلاغات بحالة «تم الحل» أو «مغلقة». غير المحلولة تشمل بقية الحالات. عدد البلاغات التي أُعيد فتحها يشمل سجل إعادة الفتح حتى لو حُلّت لاحقًا.</p>
      {report.tickets.total === 0 && <p className="content-card mt-6 text-center text-sm text-muted">لا توجد بلاغات في الفترة المحددة.</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="content-card" aria-labelledby="problems-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="problems-heading" className="text-lg font-extrabold text-ink">أكثر المشكلات تسجيلًا</h2><p className="mt-1 text-sm text-muted">بحسب التصنيف والتصنيف الفرعي.</p></div><Button type="button" variant="secondary" disabled={!report.mostReportedProblems.length} onClick={() => csvExportService.download('المشكلات-الأكثر-تسجيلًا.csv', [{ key: 'category', label: 'التصنيف' }, { key: 'subcategory', label: 'التصنيف الفرعي' }, { key: 'ticketCount', label: 'عدد البلاغات' }], report.mostReportedProblems)}><Download size={16} />تصدير</Button></div>
          {report.mostReportedProblems.length ? <ol className="mt-5 divide-y divide-border">{report.mostReportedProblems.map((problem, index) => <li key={problem.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-sm font-extrabold text-primary-700 dark:bg-primary-900/30 dark:text-primary-200">{index + 1}</span><div className="min-w-0 flex-1"><p className="font-extrabold text-ink">{problem.category}</p><p className="mt-0.5 text-sm text-muted">{problem.subcategory}</p></div><strong className="shrink-0 text-lg text-primary-600">{problem.ticketCount}</strong></li>)}</ol> : <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">لا توجد مشكلات مسجلة في الفترة المحددة.</p>}
        </section>

        <section className="content-card" aria-labelledby="employees-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="employees-heading" className="text-lg font-extrabold text-ink">الموظفون الأكثر تسجيلًا للبلاغات</h2><p className="mt-1 text-sm text-muted">لا تشمل بلاغات الإدارة العليا.</p></div><Button type="button" variant="secondary" disabled={!report.topEmployees.length} onClick={() => csvExportService.download('الموظفون-الأكثر-تسجيلًا.csv', [{ key: 'employeeName', label: 'الموظف' }, { key: 'department', label: 'القسم' }, { key: 'employeeNumber', label: 'رقم الموظف' }, { key: 'ticketCount', label: 'عدد البلاغات' }], report.topEmployees)}><Download size={16} />تصدير</Button></div>
          {report.topEmployees.length ? <ol className="mt-5 divide-y divide-border">{report.topEmployees.map((employee, index) => <li key={employee.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-sm font-extrabold text-primary-700 dark:bg-primary-900/30 dark:text-primary-200">{index + 1}</span><div className="min-w-0 flex-1"><p className="font-extrabold text-ink">{employee.employeeName}</p><p className="mt-0.5 text-sm text-muted">{employee.department}{employee.employeeNumber ? ` · ${employee.employeeNumber}` : ''}</p></div><strong className="shrink-0 text-lg text-primary-600">{employee.ticketCount}</strong></li>)}</ol> : <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">لا توجد بلاغات موظفين في الفترة المحددة.</p>}
        </section>
      </div>
    </>}
  </div>
}

export function ReportsPage(){return authMode === 'api' ? <ReportsApi/> : <MockReportsPage/>}
