import { mockTicketService } from '../mock/mockTicketService.js'

const SOLVED_STATUSES = new Set(['resolved', 'closed'])

function withinRange(createdAt, dateFrom, dateTo) {
  if (!createdAt) return false
  const date = createdAt.slice(0, 10)
  return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)
}

function mostReportedProblems(tickets, limit = 10) {
  const groups = new Map()
  tickets.forEach((ticket) => {
    const category = ticket.category?.trim() || 'غير مصنف'
    const subcategory = ticket.subcategory?.trim() || 'عام'
    const key = `${category.toLocaleLowerCase('ar')}::${subcategory.toLocaleLowerCase('ar')}`
    const group = groups.get(key) ?? { key, category, subcategory, ticketCount: 0 }
    group.ticketCount += 1
    groups.set(key, group)
  })
  return [...groups.values()]
    .sort((first, second) => second.ticketCount - first.ticketCount || first.category.localeCompare(second.category, 'ar') || first.subcategory.localeCompare(second.subcategory, 'ar'))
    .slice(0, limit)
}

export const mockReportService = {
  getDashboard({ dateFrom = '', dateTo = '' } = {}) {
    const tickets = mockTicketService.getAll().filter((ticket) => withinRange(ticket.createdAt, dateFrom, dateTo))
    const solved = tickets.filter((ticket) => SOLVED_STATUSES.has(ticket.status)).length
    return {
      filters: { dateFrom, dateTo },
      tickets: {
        total: tickets.length,
        solved,
        unsolved: tickets.length - solved,
        reopened: tickets.filter((ticket) => ticket.status === 'reopened' || ticket.history?.some((entry) => entry.type === 'reopened' || entry.status === 'reopened')).length,
      },
      mostReportedProblems: mostReportedProblems(tickets),
      topEmployees: mockTicketService.getTopEmployeeRequesters({ tickets }),
    }
  },
}
