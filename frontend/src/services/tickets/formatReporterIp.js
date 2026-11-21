// The IP is a ticket-time snapshot of the submitting device (DHCP, shared PCs).
// Loopback means the ticket was sent from the server machine itself, e.g. during local testing.
export function formatReporterIp(ip) {
  if (!ip) return ''
  const loopback = ip === '::1' || /^127\./.test(ip)
  return loopback ? `${ip} (نفس جهاز الخادم)` : ip
}
