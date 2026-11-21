const listeners = new Map()
export const appEvents = {
  subscribe(eventName, callback) { const eventListeners = listeners.get(eventName) ?? new Set(); eventListeners.add(callback); listeners.set(eventName, eventListeners); return () => eventListeners.delete(callback) },
  publish(eventName, payload) { listeners.get(eventName)?.forEach((callback) => callback(payload)) },
}
export const EVENT_NAMES = Object.freeze({
  TICKET_CREATED: 'ticket:created',
  TICKET_UPDATED: 'ticket:updated',
  TICKET_COMMENT_ADDED: 'ticket:comment-added',
  TICKET_ASSIGNED: 'ticket:assigned',
  TICKET_RESOLVED: 'ticket:resolved',
  TICKET_REOPENED: 'ticket:reopened',
  TICKET_FEEDBACK: 'ticket:feedback',
  FAULT_CATEGORIES_CHANGED: 'reference:fault-categories-changed',
  DEPARTMENTS_CHANGED: 'reference:departments-changed',
  TECHNICIANS_CHANGED: 'reference:technicians-changed',
  NOTIFICATION_CREATED: 'notification:created',
  NOTIFICATIONS_CHANGED: 'notification:changed',
  NOTIFICATION_SOUND_SETTINGS_CHANGED: 'notification:sound-settings-changed',
  ASSET_CREATED: 'asset:created',
  ASSET_UPDATED: 'asset:updated',
  ASSET_WITHDRAWN: 'asset:withdrawn',
  ASSET_ARCHIVED: 'asset:archived',
  ASSETS_CHANGED: 'asset:changed',
  SESSION_CHANGED: 'session:changed',
  ADMIN_PERMISSIONS_CHANGED: 'admin:permissions-changed',
  TOAST_SHOWN: 'ui:toast-shown',
})
