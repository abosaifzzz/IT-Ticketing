import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer as createViteServer } from 'vite'

const account = { id: '11111111-1111-4111-8111-111111111111', username: 'browser-employee', name: 'Browser Employee', role: 'employee', roleLabel: 'موظف' }
const department = { id: '22222222-2222-4222-8222-222222222222', name: 'قسم تجريبي' }
const requests = []
let session = false
let completed = false
let rejectFirstSetup = true
let phone = null
let browser, profileDirectory, vite, api
const pending = new Map()
let sequence = 0
let buffer = ''

try {
  api = createHttpServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
    const path = new URL(request.url, 'http://localhost').pathname
    requests.push({ path, method: request.method, body })
    const send = (status, value, cookie) => {
      response.writeHead(status, { 'Content-Type': 'application/json', ...(cookie ? { 'Set-Cookie': cookie } : {}) })
      response.end(JSON.stringify(value))
    }
    const authenticated = session && request.headers.cookie?.includes('browser-session=1')
    if (path === '/api/auth/login' && request.method === 'POST') {
      if (body.username !== account.username || body.password !== (completed ? 'New-browser-password-123' : '123')) return send(401, { error: 'Invalid credentials' })
      session = true
      return send(200, { user: { ...account, mustChangePassword: !completed, mustCompleteProfile: !completed } }, 'browser-session=1; Path=/; HttpOnly; SameSite=Strict')
    }
    if (path === '/api/auth/me') return authenticated ? send(200, { user: { ...account, mustChangePassword: !completed, mustCompleteProfile: !completed } }) : send(401, { error: 'Not logged in' })
    if (!authenticated) return send(401, { error: 'Not logged in' })
    if (path === '/api/auth/setup-options') return send(200, { items: [department] })
    if (path === '/api/auth/profile' && request.method === 'GET') return send(200, { item: { ...account, fullName: account.name, phone, departmentIds: completed ? [department.id] : [], departments: completed ? [{ ...department, isActive: true }] : [] } })
    if (path === '/api/auth/profile' && request.method === 'PATCH') { phone = body.phone; return send(200, { item: { ...account, fullName: account.name, phone, departmentIds: body.departmentIds, departments: [{ ...department, isActive: true }] } }) }
    if (path === '/api/auth/complete-setup') {
      // First call simulates an account whose initial password is not the standard temporary one,
      // proving the fallback field appears; the retry then succeeds with the standard temporary password.
      if (rejectFirstSetup) { rejectFirstSetup = false; return send(401, { error: 'Wrong current password' }) }
      if (body.currentPassword !== '123') return send(401, { error: 'Wrong current password' })
      if (body.newPassword !== 'New-browser-password-123' || body.phone !== '01000000000' || JSON.stringify(body.departmentIds) !== JSON.stringify([department.id])) return send(400, { error: 'Invalid setup input' })
      completed = true
      phone = body.phone
      session = false
      return send(200, { changed: true, setupCompleted: true, loginRequired: true }, 'browser-session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict')
    }
    if (path === '/api/auth/logout') { session = false; return send(200, { changed: true }, 'browser-session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict') }
    return send(200, { items: [], total: 0, page: 1, pageSize: 20 })
  })
  api.listen(0, '127.0.0.1')
  await once(api, 'listening')
  vite = await createViteServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${api.address().port}`, changeOrigin: false } } } })
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  profileDirectory = await mkdtemp(join(tmpdir(), 'helpdesk-profile-browser-'))
  browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profileDirectory}`], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  browser.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString()
    let index
    while ((index = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1)
      const callback = pending.get(message.id)
      if (callback) { pending.delete(message.id); message.error ? callback.reject(Error(message.error.message)) : callback.resolve(message.result) }
    }
  })
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`Browser command timed out: ${method}`)) }, 15000)
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value) }, reject: (error) => { clearTimeout(timeout); reject(error) } })
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (result.exceptionDetails) throw Error(`Browser expression failed: ${expression}`)
    return result.result.value
  }
  const waitFor = async (expression) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return
      await new Promise((resolve) => setTimeout(resolve, 70))
    }
    throw Error(`Browser condition timed out: ${expression}; current=${await evaluate('location.pathname')}; alerts=${JSON.stringify(await evaluate('Array.from(document.querySelectorAll("[role=alert]")).map(x=>x.textContent)'))}; form=${JSON.stringify(await evaluate('Array.from(document.querySelectorAll("form input")).map(x=>({type:x.type,value:x.type==="password"?"[redacted]":x.value,checked:x.checked}))'))}; requests=${JSON.stringify(requests.map(x=>({path:x.path,method:x.method})))}`)
  }
  const navigate = async (path) => { await command('Page.navigate', { url: origin + path }, sessionId); await waitFor('!!document.querySelector("#root")') }
  const setInput = async (selector, value) => evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)
  await navigate('/employee/new-ticket')
  await waitFor('location.pathname === "/login" && !!document.querySelector("input[name=username]")')
  await setInput('input[name=username]', account.username)
  await setInput('input[name=password]', '123')
  await evaluate('document.querySelector("form").requestSubmit()')
  await waitFor('location.pathname === "/setup" && !!document.querySelector("input[type=tel]")')
  assert.equal(requests.some((item) => item.path === '/api/tickets'), false, 'Feature requests must wait for setup')
  await navigate('/employee/new-ticket')
  await waitFor('location.pathname === "/setup"')
  await waitFor('!!document.querySelector("input[type=tel]")')
  assert.equal(await evaluate('document.documentElement.dir'), 'rtl')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await evaluate('Array.from(document.querySelectorAll("button")).find(x=>x.textContent.includes("تبديل المظهر"))?.click()')
  assert.equal(await evaluate('document.documentElement.classList.contains("dark")'), true)
  assert.equal(await evaluate('!!document.querySelector("input[autocomplete=current-password]")'), false, 'First-login setup must not ask for the current password')
  await setInput('input[autocomplete=new-password]', 'New-browser-password-123')
  await setInput('input[type=tel]', '01000000000')
  await evaluate('(() => { const input=document.querySelectorAll("input[autocomplete=new-password]")[1];const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(input,"New-browser-password-123");input.dispatchEvent(new Event("input",{bubbles:true})); })()')
  await evaluate('document.querySelector("input[type=checkbox]").click()')
  await evaluate('document.querySelector("form").requestSubmit()')
  await waitFor('!!document.querySelector("[data-toast=error]") && !!document.querySelector("input[autocomplete=current-password]")')
  assert.equal(await evaluate('location.pathname'), '/setup', 'Rejected temporary password must not log out')
  assert.equal(requests.find((item) => item.path === '/api/auth/complete-setup')?.body.currentPassword, '123')
  await setInput('input[autocomplete=current-password]', '123')
  await evaluate('document.querySelector("form").requestSubmit()')
  await waitFor('location.pathname === "/login" && !!document.querySelector("input[name=username]")')
  assert.equal(await evaluate('!!document.querySelector("[role=status]")'), true, 'Completed setup should explain that a new login is required')
  assert.equal(requests.filter((item) => item.path === '/api/auth/complete-setup').length, 2)
  await setInput('input[name=username]', account.username)
  await setInput('input[name=password]', 'New-browser-password-123')
  await evaluate('document.querySelector("form").requestSubmit()')
  await waitFor('location.pathname === "/employee"')
  await navigate('/profile')
  await waitFor('!!document.querySelector("input[type=tel]")')
  assert.equal(await evaluate('document.querySelector("input[type=tel]").value'), phone)
  assert.equal(await evaluate('document.querySelector("input[type=checkbox]").checked'), true)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
  await setInput('input[type=tel]', '01000000001')
  await evaluate('document.querySelector("form").requestSubmit()')
  await waitFor('!!document.querySelector("[role=status]")')
  assert.deepEqual(requests.findLast((item) => item.path === '/api/auth/profile' && item.method === 'PATCH')?.body, { phone: '01000000001', departmentIds: [department.id] })
  await navigate('/profile')
  await waitFor('!!document.querySelector("input[type=tel]")')
  assert.equal(await evaluate('document.querySelector("input[type=tel]").value'), '01000000001')
  assert.equal(await evaluate('document.documentElement.classList.contains("dark")'), true)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  assert.equal(await evaluate('Object.values(localStorage).some(value => value.includes("Old-browser-password-123") || value.includes("New-browser-password-123"))'), false)
  console.log('PASS browser account setup: protected routes, refresh, wrong password, completion, re-login, profile update, mobile/desktop RTL and dark mode')
} finally {
  browser?.kill()
  await vite?.close()
  if (api) await new Promise((resolve) => api.close(resolve))
  if (profileDirectory?.startsWith(join(tmpdir(), 'helpdesk-profile-browser-'))) await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}
