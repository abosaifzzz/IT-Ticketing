import { appEvents, EVENT_NAMES } from '../events/eventBus.js'
import { localStorageAdapter } from '../storage/localStorageAdapter.js'
import { DEMO_USERS } from './demoUsers.js'

const SESSION_KEY = 'hospital-helpdesk:demo-session'
const DEMO_DELAY_MS = 650

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration))

function toSession(user) {
  return {
    user: { id: user.id, username: user.username, name: user.name, role: user.role, roleLabel: user.roleLabel },
    role: user.role,
    createdAt: new Date().toISOString(),
    provider: 'demo',
  }
}

export const mockAuthProvider = {
  async login({ username, password }) {
    await wait(DEMO_DELAY_MS)
    const normalizedUsername = username.trim().toLowerCase()
    const user = DEMO_USERS.find((candidate) => candidate.username === normalizedUsername && candidate.password === password)
    if (!user) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.')

    const session = toSession(user)
    localStorageAdapter.set(SESSION_KEY, session)
    appEvents.publish(EVENT_NAMES.SESSION_CHANGED, session)
    return session
  },

  restoreSession() {
    const session = localStorageAdapter.get(SESSION_KEY)
    const demoUser = DEMO_USERS.find((user) => user.id === session?.user?.id)
    if (!demoUser || session.provider !== 'demo' || session.role !== demoUser.role || session.user?.username !== demoUser.username) {
      localStorageAdapter.remove(SESSION_KEY)
      return null
    }
    return { ...toSession(demoUser), createdAt: session.createdAt || new Date().toISOString() }
  },

  async logout() {
    localStorageAdapter.remove(SESSION_KEY)
    appEvents.publish(EVENT_NAMES.SESSION_CHANGED, null)
  },
}
