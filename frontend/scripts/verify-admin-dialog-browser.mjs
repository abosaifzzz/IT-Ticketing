import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer as createViteServer } from 'vite'

const admin = { id: '11111111-1111-4111-8111-111111111111', username: 'fictional-admin', name: 'مسؤول تجريبي', role: 'admin', roleLabel: 'مسؤول النظام' }
const department = { id: '22222222-2222-4222-8222-222222222222', name: 'قسم تجريبي', isActive: true }
let target = { id: '33333333-3333-4333-8333-333333333333', username: 'fictional-employee', fullName: 'موظف تجريبي', role: 'employee', isActive: true, authProvider: 'local', phone: '01000000000', departments: [department], departmentIds: [department.id], passwordStatus: 'SET', mustCompleteProfile: false }
const grants = ['admin.dashboard.read','admin.users.read','admin.users.create','admin.users.update','admin.users.disable','admin.users.reset_password','admin.sessions.revoke','admin.roles.read','admin.permissions.manage','admin.settings.read','admin.settings.update','admin.backups.read','admin.backups.create','admin.monitoring.read','admin.audit.read']
const requests = []
const pending = new Map()
const pageErrors = []
let api, vite, browser, profileDirectory, sequence = 0, buffer = ''

try {
  api = createHttpServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
    const path = new URL(request.url, 'http://localhost').pathname
    requests.push({ path, method: request.method, body })
    const send = (status, value, cookie) => { response.writeHead(status, { 'Content-Type': 'application/json', ...(cookie ? { 'Set-Cookie': cookie } : {}) }); response.end(JSON.stringify(value)) }
    if (path === '/api/auth/me') return send(200, { user: admin })
    if (path === '/api/admin/roles' && request.method === 'GET') return send(200, { items: [{ role: 'admin', permissions: grants, editable: true }], availableAdministrativePermissions: grants, singleRoleOnly: true })
    if (path === '/api/admin/dashboard') return send(200, { accounts: 2, activeAccounts: 2, activeAdmins: 1, activeSessions: 1 })
    if (path === '/api/admin/users' && request.method === 'GET') return send(200, { items: [target], total: 1, page: 1, pageSize: 25 })
    if (path === `/api/admin/users/${target.id}` && request.method === 'GET') return send(200, { item: target })
    if (path === '/api/admin/requests') return send(200, { items: [], total: 0, page: 1, pageSize: 10 })
    if (path === '/api/auth/setup-options') return send(200, { items: [department] })
    if (path === '/api/admin/reauthenticate') return body?.password === 'fictional-browser-admin-password' ? send(200, { user: admin }, 'admin-browser=rotated; Path=/; HttpOnly; SameSite=Strict') : send(401, { error: 'Authentication failed' })
    if (path === `/api/admin/users/${target.id}` && request.method === 'PATCH') { target = { ...target, ...body }; delete target.reason; delete target.adminPassword; return send(200, { item: target }) }
    if (path === `/api/admin/users/${target.id}/reset-temporary-password` && request.method === 'POST') return send(200, { item: { id: target.id, mustChangePassword: true, sessionsRevoked: true } })
    if (path === '/api/admin/settings' && request.method === 'GET') return send(200, { items: [{ section: 'identity', version: 1, values: { hospitalName: 'مركز تجريبي', systemName: 'نظام تجريبي', timezone: 'Africa/Cairo' } }] })
    if (path === '/api/admin/backups/status') return send(200, { configured: true, create: true, restore: false, latest: null })
    if (path === '/api/admin/backups') return send(200, { items: [], total: 0, page: 1, pageSize: 25 })
    return send(200, { items: [], total: 0, page: 1, pageSize: 25 })
  })
  api.listen(0, '127.0.0.1'); await once(api, 'listening')
  vite = await createViteServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${api.address().port}`, changeOrigin: false } } } }); await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  profileDirectory = await mkdtemp(join(tmpdir(), 'helpdesk-admin-dialog-'))
  browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profileDirectory}`], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  browser.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString(); let index
    while ((index = buffer.indexOf('\0')) !== -1) { const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text); if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') pageErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' ')); const callback = pending.get(message.id); if (callback) { pending.delete(message.id); message.error ? callback.reject(Error(message.error.message)) : callback.resolve(message.result) } }
  })
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timeout = setTimeout(() => { pending.delete(id); reject(Error(`Browser command timed out: ${method}`)) }, 15000)
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value) }, reject: (error) => { clearTimeout(timeout); reject(error) } })
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
  await command('Runtime.enable', {}, sessionId)
  const evaluate = async (expression) => { const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(`Browser expression failed: ${expression}`); return result.result.value }
  const waitFor = async (expression) => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 70)) } const page = await evaluate('location.pathname + " | " + document.body.innerText.slice(0, 300)').catch(() => '?'); throw Error(`Browser condition timed out: ${expression}; page=${page}; errors=${JSON.stringify(pageErrors.slice(-5))}; requests=${JSON.stringify(requests.map(x => x.path))}`) }
  const navigate = async (path) => { await command('Page.navigate', { url: origin + path }, sessionId); await waitFor('!!document.querySelector("#root")') }
  const clickText = async (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes(${JSON.stringify(text)}))?.click()`)
  const setInput = async (selector, value) => evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input)throw Error('Missing input'); const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`)
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)
  await navigate('/admin/users')
  await waitFor('document.querySelectorAll("table tbody tr").length===1')
  assert.equal(await evaluate('document.documentElement.dir'), 'rtl')
  await clickText('إدارة'); await waitFor(`!!document.querySelector('[aria-label="إدارة الحساب المحدد"]')`)
  await clickText('إعادة تعيين كلمة مرور مؤقتة'); await waitFor('!!document.querySelector("[role=dialog]")')
  assert.equal(await evaluate('document.activeElement.matches("[role=dialog] input[type=password]")'), true)
  await evaluate('document.querySelector("[role=dialog] input[type=checkbox]").click()')
  await setInput('[role=dialog] input[type=password]', 'fictional-browser-admin-password')
  await clickText('تحقق ونفّذ'); await waitFor('!document.querySelector("[role=dialog]")')
  assert.deepEqual(requests.findLast(x => x.path.endsWith('/reset-temporary-password'))?.body, {})
  const editor = '[aria-label="إدارة الحساب المحدد"]'
  await setInput(`${editor} input.field-input`, 'اسم بعد التعديل')
  await setInput(`${editor} select`, 'manager')
  assert.equal(await evaluate(`!!document.querySelector('${editor} input[maxlength="300"]')`), false, 'Role-change reason field must not be shown')
  assert.equal(await evaluate('document.body.textContent.includes("طلبات الحماية المعلقة")'), false)
  await clickText('حفظ تعديلات الحساب'); await waitFor('!!document.querySelector("[role=dialog]")')
  assert.equal(requests.filter(x => x.method === 'PATCH' && x.path.endsWith(target.id)).length, 0)
  await evaluate('document.querySelector("[role=dialog] input[type=checkbox]").click()')
  await setInput('[role=dialog] input[type=password]', 'wrong-password')
  await clickText('تحقق ونفّذ'); await waitFor('!!document.querySelector("[data-toast=error]") && !!document.querySelector("[role=dialog]")')
  assert.equal(requests.filter(x => x.method === 'PATCH' && x.path.endsWith(target.id)).length, 0)
  await setInput('[role=dialog] input[type=password]', 'fictional-browser-admin-password')
  await clickText('تحقق ونفّذ'); await waitFor('!document.querySelector("[role=dialog]")')
  const saved = requests.findLast(x => x.method === 'PATCH' && x.path.endsWith(target.id))?.body
  assert.equal(saved.role, 'manager'); assert.equal(saved.fullName, 'اسم بعد التعديل'); assert.match(saved.reason, /تغيير الدور/); assert.equal(saved.adminPassword, undefined)
  await waitFor(`Array.from(document.querySelectorAll('[data-toast=success]')).some(x=>x.textContent.includes('حُفظت جميع تعديلات الحساب'))`)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await evaluate(`document.querySelector('button[aria-label="تفعيل الوضع الليلي"]')?.click()`)
  assert.equal(await evaluate('document.documentElement.classList.contains("dark")'), true)
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
  await navigate('/admin/users'); await waitFor('document.querySelectorAll("table tbody tr").length===1')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await clickText('إدارة'); await waitFor(`!!document.querySelector('[aria-label="إدارة الحساب المحدد"]')`)
  // Repeated successful confirmations (beyond five) must each reauthenticate and complete without the dialog getting stuck.
  const reauthBefore = requests.filter(x => x.path === '/api/admin/reauthenticate').length
  for (let round = 1; round <= 6; round++) {
    await waitFor(`!!Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('إلغاء الجلسات')&&!x.disabled)`)
    await clickText('إلغاء الجلسات'); await waitFor('!!document.querySelector("[role=dialog]")')
    await evaluate('document.querySelector("[role=dialog] input[type=checkbox]").click()')
    await setInput('[role=dialog] input[type=password]', 'fictional-browser-admin-password')
    await clickText('تحقق ونفّذ'); await waitFor('!document.querySelector("[role=dialog]")')
    await waitFor(`Array.from(document.querySelectorAll('[data-toast=success]')).some(x=>x.textContent.includes('أُلغيت جلسات الحساب'))`)
  }
  assert.equal(requests.filter(x => x.path === '/api/admin/reauthenticate').length - reauthBefore, 6)
  assert.equal(requests.filter(x => x.path.endsWith('/revoke-sessions')).length, 6)
  await clickText('إلغاء الجلسات'); await waitFor('!!document.querySelector("[role=dialog]")')
  assert.equal(await evaluate('document.documentElement.classList.contains("dark")'), true)
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))'); await waitFor('!document.querySelector("[role=dialog]")')
  assert.equal(await evaluate('document.activeElement.textContent.includes("إلغاء الجلسات")'), true)
  assert.equal(await evaluate('Object.values(localStorage).some(value=>value.includes("fictional-browser-admin-password"))'), false)
  console.log('PASS Admin browser: employee temporary reset, password modal, failed reauth retains draft, one atomic role/identity save, six consecutive verified actions, focus restoration, RTL, mobile/desktop, dark mode')
} finally {
  browser?.kill(); await vite?.close(); if (api) await new Promise((resolve) => api.close(resolve))
  if (profileDirectory?.startsWith(join(tmpdir(), 'helpdesk-admin-dialog-'))) await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}
