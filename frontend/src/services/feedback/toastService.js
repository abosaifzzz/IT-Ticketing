import { appEvents, EVENT_NAMES } from '../events/eventBus.js'

// Centralized transient feedback. Pages call toast.success/error; the single <Toaster /> renders them.
let sequence = 0
const show = (type, message, { duration } = {}) => {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return null
  const id = ++sequence
  appEvents.publish(EVENT_NAMES.TOAST_SHOWN, { id, type, message: text, duration: duration ?? (type === 'error' ? 8000 : 5000) })
  return id
}

export const toast = {
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, options),
  info: (message, options) => show('info', message, options),
}
