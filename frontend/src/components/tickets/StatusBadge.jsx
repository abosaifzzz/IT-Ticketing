import { statusLabels } from '../../services/mock/statuses'

const statusStyles = {
  new: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200',
  assigned: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200',
  in_progress: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200',
  pending: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-200',
  resolved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
  closed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  reopened: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200',
}

export function StatusBadge({ status }) {
  return <span data-ticket-status={status} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[status] ?? statusStyles.new}`}>{statusLabels[status] ?? status}</span>
}
