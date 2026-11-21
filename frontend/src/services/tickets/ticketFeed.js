// One chronological list of everything written on a ticket: engineer comments
// (public/internal), pending reasons, solutions, employee comments and reopening reasons.
// Built from the server-scoped history, so each audience only sees what the API returned.
const kinds = {
  technician_note: (event) => event.visibility === 'internal' ? { label: 'تعليق داخلي', tone: 'internal' } : { label: 'تعليق المهندس', tone: 'engineer' },
  comment: () => ({ label: 'تعليق الموظف', tone: 'employee' }),
  resolution: () => ({ label: 'تم الحل — وصف الحل', tone: 'resolved' }),
  reopened: () => ({ label: 'سبب إعادة الفتح', tone: 'employee' }),
}

export function buildTicketFeed(ticket) {
  return (ticket?.history ?? [])
    .filter((event) => event.note && (kinds[event.type] || (event.type === 'status' && event.status === 'pending')))
    .map((event) => ({
      id: event.id,
      text: event.note,
      authorName: event.actorName,
      createdAt: event.timestamp,
      ...(kinds[event.type]?.(event) ?? { label: 'معلّقة — سبب التعليق', tone: 'pending' }),
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export const feedToneClass = {
  engineer: 'border-primary-500',
  internal: 'border-amber-500',
  employee: 'border-sky-500',
  pending: 'border-orange-500',
  resolved: 'border-emerald-500',
}
