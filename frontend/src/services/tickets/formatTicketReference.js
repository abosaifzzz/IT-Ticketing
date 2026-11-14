// The server allocates permanent IT references. Internal UUIDs stay in URLs/API calls.
export function formatTicketReference(ticket) {
  const reference = typeof ticket === 'object' && ticket ? ticket.reference : ticket
  if (reference && /^IT[0-9]+$/.test(reference)) return reference
  const legacy = typeof ticket === 'object' && ticket ? ticket.id : ticket
  return legacy && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(legacy) ? String(legacy) : '—'
}
