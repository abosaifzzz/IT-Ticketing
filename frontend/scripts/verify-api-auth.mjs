import assert from 'node:assert/strict'
import { createHttpClient, HttpError } from '../src/services/http/client.js'
import { createApiAuthProvider } from '../src/services/auth/apiAuthProvider.js'
import { authenticationMode } from '../src/services/auth/mode.js'
import { requiresAccountSetup, ROLE_DESTINATIONS, routeAccess } from '../src/services/auth/roles.js'

assert.equal(authenticationMode(), 'api')
assert.equal(authenticationMode({ mode: 'mock', development: true }), 'mock')
assert.throws(() => authenticationMode({ mode: 'mock' }))
assert.throws(() => authenticationMode({ mode: 'unexpected', development: true }))
globalThis.window = { localStorage: { getItem() { throw Error('API auth touched storage') }, setItem() { throw Error('API auth touched storage') } } }
for (const role of ['employee', 'technician', 'manager']) {
  let responseUser = { id: 'fictional-' + role, username: role + '@demo.example', name: 'Fictional ' + role, role, roleLabel: 'دور خيالي', token: 'should-be-discarded', password: 'should-be-discarded' }
  const calls = []
  const provider = createApiAuthProvider(createHttpClient({ fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return url.endsWith('/logout') ? new Response(null, { status: 204 }) : Response.json({ user: responseUser, token: 'discard' })
  } }))
  const session = await provider.login({ username: ' ' + role + '@demo.example ', password: 'Fictional-only-password' })
  assert.equal(session.provider, 'api'); assert.equal(session.role, role)
  assert.equal(JSON.stringify(session).includes('discard'), false)
  assert.equal(calls[0].options.credentials, 'include')
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: role + '@demo.example', password: 'Fictional-only-password' })
  assert.equal(calls[0].options.cache, 'no-store')
  assert.equal((await provider.restoreSession()).user.id, responseUser.id)
  assert.equal(routeAccess({ status: 'loading', user: null }), 'loading')
  assert.equal(routeAccess({ status: 'ready', user: null }), 'login')
  assert.equal(routeAccess({ status: 'ready', user: session.user, allowedRoles: [role] }), 'allowed')
  assert.equal(routeAccess({ status: 'ready', user: session.user, allowedRoles: ['another-role'] }), 'unauthorized')
  assert.ok(ROLE_DESTINATIONS[role].startsWith('/'))
  await provider.logout(); assert.equal(calls.at(-1).options.method, 'POST')
  responseUser = { ...responseUser, role: 'admin' }
  assert.equal((await provider.restoreSession()).role, 'admin')
}
const usernameCalls = []
const usernameProvider = createApiAuthProvider(createHttpClient({ fetchImpl: async (_url, options) => { usernameCalls.push(options); return Response.json({ user: { id: 'id', username: 'first last', name: 'Fictional', role: 'employee', roleLabel: 'موظف', mustChangePassword: true, mustCompleteProfile: true } }) } }))
const setupSession = await usernameProvider.login({ username: ' first last ', password: 'fictional' })
assert.deepEqual(JSON.parse(usernameCalls[0].body), { username: 'first last', password: 'fictional' })
assert.equal(setupSession.user.mustChangePassword, true)
assert.equal((await usernameProvider.restoreSession()).user.mustCompleteProfile, true)
assert.equal(requiresAccountSetup(setupSession.user), true)
assert.equal(requiresAccountSetup({ mustChangePassword: false, mustCompleteProfile: false }), false)
let invalidated = 0
const denied = createHttpClient({ fetchImpl: async () => Response.json({ error: 'Do not echo arbitrary server errors' }, { status: 401 }), onUnauthorized: () => invalidated++ })
assert.equal(await createApiAuthProvider(denied).restoreSession(), null)
assert.equal(invalidated, 0)
await assert.rejects(denied.request('/tickets'), (e) => e.status === 401 && !e.message.includes('arbitrary'))
assert.equal(invalidated, 1)
for (const status of [403, 409, 429, 500]) await assert.rejects(createHttpClient({ fetchImpl: async () => new Response('<html>private</html>', { status }) }).request('/auth/me'), (e) => e instanceof HttpError && e.status === status && !e.message.includes('private'))
await assert.rejects(createHttpClient({ fetchImpl: async () => Response.json({ code: 'PROFILE_SETUP_REQUIRED', error: 'private' }, { status: 403 }) }).request('/tickets'), (e) => e.code === 'PROFILE_SETUP_REQUIRED' && !e.message.includes('private'))
await assert.rejects(createHttpClient({ fetchImpl: async () => { throw Error('private network detail') } }).request('/auth/me'), (e) => e.code === 'network' && !e.message.includes('private'))
await assert.rejects(createHttpClient({ fetchImpl: async () => new Response('HTML') }).request('/auth/me'), (e) => e.code === 'response')
await assert.rejects(createHttpClient({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('abort')))) }).request('/auth/me'), (e) => e.code === 'timeout')
const aborted = new AbortController(); aborted.abort()
await assert.rejects(createHttpClient({ fetchImpl: async (_url, { signal }) => { if (signal.aborted) throw Error('abort') } }).request('/auth/me', { signal: aborted.signal }), (e) => e.code === 'aborted')
assert.throws(() => createHttpClient({ baseUrl: 'https://another.example/api' }))
console.log('PASS API auth: all roles, login/me/logout, cookie settings, role policy, mode isolation, errors, timeout, cancellation, no storage')
