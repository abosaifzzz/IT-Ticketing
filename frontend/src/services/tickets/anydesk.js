// Optional AnyDesk ID captured on ticket creation. Mirrors the backend rule:
// a 9–12 digit address (spaces/dashes ignored) or an alias such as "name@ad".
// The server remains the source of truth and re-validates every value.
export const ANYDESK_ERROR = 'معرّف AnyDesk غير صالح. أدخل الرقم المكوّن من ٩ إلى ١٢ رقمًا أو اتركه فارغًا.'

export function normalizeAnydeskId(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return { value: '', valid: true }
  const digits = trimmed.replace(/[\s-]/g, '')
  if (/^[0-9]{9,12}$/.test(digits)) return { value: digits, valid: true }
  if (trimmed.length <= 64 && /^[A-Za-z0-9._-]{1,50}@[A-Za-z0-9._-]{1,13}$/.test(trimmed)) return { value: trimmed.toLowerCase(), valid: true }
  return { value: trimmed, valid: false }
}

// Displays digit IDs in AnyDesk's familiar grouped form, e.g. "123 456 789".
export function formatAnydeskId(value) {
  if (!value) return ''
  return /^[0-9]+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : value
}
