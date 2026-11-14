import { configureApiProxy } from './apiProxy.mjs'
import { createMySqlNotificationRepository } from '../../backend/src/repositories/mysqlNotificationRepository.js'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID, randomBytes } from 'node:crypto'
import { createServer } from 'vite'
import { createRequire } from 'node:module'
const { parse } = createRequire(new URL('../../backend/package.json', import.meta.url))('dotenv')
import { createPool } from '../../backend/src/db/pool.js'
import { createMySqlUserRepository } from '../../backend/src/repositories/mysqlUserRepository.js'
import { createMySqlSessionRepository } from '../../backend/src/repositories/mysqlSessionRepository.js'
import { createLocalAccountService } from '../../backend/src/auth/localAccountService.js'
import { createLocalPasswordProvider } from '../../backend/src/auth/localPasswordProvider.js'
import { createAuthService } from '../../backend/src/auth/authService.js'
import { createMySqlTicketRepository } from '../../backend/src/repositories/mysqlTicketRepository.js'
import { createMySqlDashboardRepository } from '../../backend/src/repositories/mysqlDashboardRepository.js'
import { createMySqlReferenceRepository } from '../../backend/src/repositories/mysqlReferenceRepository.js'
import { createMySqlItUserRepository } from '../../backend/src/repositories/mysqlItUserRepository.js'
import { createApp } from '../../backend/src/app.js'

const accounts = [], pending = new Map()
const password = 'Fictional-' + randomBytes(24).toString('hex')
let pool, api, vite, chrome, profile, sequence = 0, buffer = ''
let apiFailure = false, failLogin = false, failLogout = false, meDelay = 0
try {
  const e = parse(await readFile(new URL('../../backend/.env.fresh.test', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test_fresh_[a-f0-9]{12}$/); assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const role of ['employee', 'technician', 'manager']) accounts.push(await provision.create({ email: 'frontend-' + role + '-' + randomUUID() + '@demo.example', fullName: 'Fictional ' + role, role, password }))
  const auth = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  let origin
  const app = createApp({ notificationRepository:createMySqlNotificationRepository(pool), authService: {
    async login(input) { if (failLogin) { const error = Error('Private'); error.code = 'ER_LOCK_WAIT_TIMEOUT'; throw error } return auth.login(input) },
    async getUser(token) { if (meDelay) await new Promise((resolve) => setTimeout(resolve, meDelay)); if (apiFailure) throw Error('Private'); return auth.getUser(token) },
    async logout(token) { if (failLogout) throw Error('Private'); return auth.logout(token) },
  }, managementRepositories:{departments:createMySqlReferenceRepository(pool,'departments'),categories:createMySqlReferenceRepository(pool,'categories'),subcategories:createMySqlReferenceRepository(pool,'subcategories'),itUsers:createMySqlItUserRepository(pool)}, ticketRepository: createMySqlTicketRepository(pool), dashboardRepository: createMySqlDashboardRepository(pool), config: { nodeEnv: 'test', get appOrigin() { return origin } } })
  api = app.listen(0, '127.0.0.1'); await once(api, 'listening')
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: 'http://127.0.0.1:' + api.address().port, changeOrigin: false, configure: configureApiProxy } } } })
  await vite.listen()
  origin = 'http://127.0.0.1:' + vite.httpServer.address().port
  profile = await mkdtemp(join(tmpdir(), 'helpdesk-browser-'))
  chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', '--user-data-dir=' + profile], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  chrome.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString()
    let index
    while ((index = buffer.indexOf('\0')) !== -1) {
      const value = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1)
      const callback = pending.get(value.id)
      if (callback) { pending.delete(value.id); value.error ? callback.reject(Error(value.error.message)) : callback.resolve(value.result) }
    }
  })
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => { pending.delete(id); reject(Error('Browser command timed out: ' + method)) }, 15000)
    pending.set(id, { resolve: (v) => { clearTimeout(timeout); resolve(v) }, reject: (e) => { clearTimeout(timeout); reject(e) } })
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (response.exceptionDetails) throw Error('Browser expression failed')
    return response.result.value
  }
  const waitFor = async (expression) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 60)) }
    throw Error('Browser condition timed out: ' + expression)
  }
  const navigate = async (path) => { await command('Page.navigate', { url: origin + path }, sessionId); await waitFor('!!document.querySelector("#root")') }
  const click = async (text) => evaluate('Array.from(document.querySelectorAll("button")).find(x => x.textContent.trim() === ' + JSON.stringify(text) + ')?.click()')
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)
  await navigate('/login'); await waitFor('!!document.querySelector("input[name=username]")')
  // A forged legacy demo session must not restore a real API identity.
  await evaluate('localStorage.setItem("hospital-helpdesk:demo-session", JSON.stringify({provider:"demo",role:"manager",user:{id:"forged"}}))')
  for (const account of accounts) {
    await navigate('/' + account.role + '/tickets')
    await waitFor('location.pathname === "/login" && !!document.querySelector("input[name=username]")')
    await evaluate('(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; for(const [name,value] of Object.entries(' + JSON.stringify({ username: account.email, password }) + ')){ const input=document.querySelector("input[name="+name+"]");set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));} })()')
    await evaluate('document.querySelector("form").requestSubmit()')
    await waitFor('location.pathname === "/' + account.role + '" && !!document.querySelector("header nav[aria-label=\\"التنقل الرئيسي\\"]")')
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
    assert.equal(await evaluate('document.body.textContent.includes(' + JSON.stringify(account.fullName) + ')'), true)
    assert.equal(await evaluate('Object.values(localStorage).some(x => x.includes(' + JSON.stringify(password) + ') || x.includes(' + JSON.stringify(account.id) + '))'), false)
    const cookies = await command('Network.getCookies', { urls: [origin] }, sessionId)
    const session = cookies.cookies.find((c) => c.name === 'it-helpdesk-session')
    assert.equal(session.httpOnly, true); assert.equal(session.sameSite, 'Strict')
    assert.equal(await evaluate('document.cookie.includes("it-helpdesk-session")'), false)
    if (account.role === 'manager') {
      await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
      await evaluate('document.querySelector("button[aria-label=\\"تفعيل الوضع الليلي\\"]").click()')
      assert.equal(await evaluate('document.documentElement.classList.contains("dark")'), true)
    }
    meDelay = 300
    await navigate('/' + account.role + '/tickets')
    await waitFor('document.body.textContent.includes("جارٍ التحقق من الجلسة")')
    await waitFor('!!document.querySelector("header nav[aria-label=\\"التنقل الرئيسي\\"]")')
    meDelay = 0
    if (account.role === 'manager') assert.equal(await evaluate('document.documentElement.classList.contains("dark")'), true)
    const forbidden = account.role === 'employee' ? '/manager' : '/employee'
    await navigate(forbidden); await waitFor('location.pathname === "/unauthorized" && document.body.textContent.includes("لا يمكنك الوصول")')
    await navigate('/' + account.role); await waitFor('!!document.querySelector("header nav[aria-label=\\"التنقل الرئيسي\\"]")')
    if (account.role === 'employee') {
      apiFailure = true
      await navigate('/employee'); await waitFor('!!document.querySelector("[role=alert]")')
      assert.equal(await evaluate('document.body.textContent.includes("Private")'), false)
      apiFailure = false; await click('إعادة المحاولة'); await waitFor('!!document.querySelector("header nav[aria-label=\\"التنقل الرئيسي\\"]")')
      await evaluate('document.querySelector("button[aria-label=\\"فتح القائمة\\"]").click()')
      failLogout = true; await click('تسجيل الخروج'); await waitFor('!!document.querySelector("[role=alert]")')
      assert.equal(await evaluate('location.pathname'), '/employee')
      failLogout = false
    }
    if (account.role === 'manager') await evaluate('document.querySelector("button[aria-label=\\"تسجيل الخروج\\"]").click()')
    else { if (account.role !== 'employee') await evaluate('document.querySelector("button[aria-label=\\"فتح القائمة\\"]").click()'); await click('تسجيل الخروج') }
    await waitFor('location.pathname === "/login" && !!document.querySelector("form")')
    await navigate('/' + account.role); await waitFor('location.pathname === "/login"')
    console.log('PASS browser ' + account.role + ': login, cookie, refresh, role denial, isolation, logout')
  }
  // Invalid login shows an error and clears the busy button without navigation.
  await evaluate('(() => { const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; for(const [name,value] of Object.entries({username:"unknown@demo.example",password:"Fictional-wrong"})){const input=document.querySelector("input[name="+name+"]");set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));} })()')
  await evaluate('document.querySelector("form").requestSubmit()')
  await waitFor('!!document.querySelector("[role=alert]") && !document.querySelector("button[type=submit]").disabled')
  assert.equal(await evaluate('location.pathname'), '/login')
  assert.equal(await evaluate('document.documentElement.dir'), 'rtl')
  await command('Browser.close').catch(() => {})
  console.log('PASS real API browser integration and Arabic RTL login/error states')
} finally {
  chrome?.kill()
  await vite?.close()
  if (api) await new Promise((resolve) => api.close(resolve))
  if (pool) { for (const account of accounts) await pool.execute('DELETE FROM users WHERE id = ?', [account.id]); await pool.end() }
  if (profile && profile.startsWith(join(tmpdir(), 'helpdesk-browser-'))) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}
