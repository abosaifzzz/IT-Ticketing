import { DEMO_USERS, ROLE_DESTINATIONS } from '../src/services/auth/demoUsers.js'

const storage = new Map()
globalThis.window = {
  setTimeout,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
}

const { mockAuthProvider: authService } = await import('../src/services/auth/mockAuthProvider.js')
const { mockTechnicianService } = await import('../src/services/mock/mockTechnicianService.js')

const roleCounts = DEMO_USERS.reduce((counts, user) => ({ ...counts, [user.role]: (counts[user.role] ?? 0) + 1 }), {})
if (DEMO_USERS.length !== 8 || roleCounts.employee !== 2 || roleCounts.technician !== 3 || roleCounts.manager !== 3) throw new Error('Named demo roster is incomplete')
if (new Set(DEMO_USERS.map((user) => user.username)).size !== DEMO_USERS.length || DEMO_USERS.some((user) => !user.username.endsWith('@demo.example'))) throw new Error('Demo email addresses are invalid or duplicated')

storage.set('hospital-helpdesk:technicians:v1', JSON.stringify([
  { id: 'demo-engineer-03', name: 'قديم', username: 'old.demo', role: 'technician', active: false },
  { id: 'demo-it-user-custom', name: 'مستخدم إضافي', username: 'custom@demo.example', role: 'technician', active: true },
]))
const migratedStaff = mockTechnicianService.getAll()
if (!migratedStaff.some((person) => person.id === 'demo-it-user-custom') || migratedStaff.find((person) => person.id === 'demo-engineer-03')?.active !== true) throw new Error('Legacy staff migration lost data or left a named engineer inactive')
for (const demoUser of DEMO_USERS.filter((user) => user.role !== 'employee')) {
  const staff = migratedStaff.find((person) => person.id === demoUser.id)
  if (staff?.username !== demoUser.username || staff?.name !== demoUser.name) throw new Error(`IT staff identity does not match login: ${demoUser.username}`)
}

for (const demoUser of DEMO_USERS) {
  const session = await authService.login({ username: demoUser.username, password: demoUser.password })
  if (session.role !== demoUser.role) throw new Error(`Unexpected role for ${demoUser.username}`)
  if (ROLE_DESTINATIONS[session.role] !== demoUser.destination) throw new Error(`Unexpected destination for ${demoUser.username}`)
  if ('password' in session || 'password' in session.user) throw new Error(`Password leaked into session for ${demoUser.username}`)
  if (authService.restoreSession()?.user?.id !== demoUser.id) throw new Error(`Session restoration failed for ${demoUser.username}`)
  await authService.logout()
  if (authService.restoreSession() !== null) throw new Error(`Logout failed for ${demoUser.username}`)
  console.log(`PASS ${demoUser.role} -> ${demoUser.destination}`)
}
