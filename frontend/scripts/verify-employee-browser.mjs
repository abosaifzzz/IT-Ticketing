import { configureApiProxy } from './apiProxy.mjs'
import { createMySqlNotificationRepository } from '../../backend/src/repositories/mysqlNotificationRepository.js'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
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
import { createMySqlEmployeeDirectoryRepository } from '../../backend/src/repositories/mysqlEmployeeDirectoryRepository.js'
import { createMySqlTicketWorkflowRepository } from '../../backend/src/repositories/mysqlTicketWorkflowRepository.js'
import { createNotificationService } from '../../backend/src/notifications/service.js'
import { ticketInput } from '../../backend/src/tickets/validation.js'
import { createApp } from '../../backend/src/app.js'

const accounts = [], pending = new Map(), departments = [], categories = [], subcategories = [], directoryEmployees = []
let ticketRepository, workflow, dropNext = false
const password = 'Fictional-' + randomBytes(24).toString('hex')
let pool, api, vite, chrome, profile, sequence = 0, buffer = ''
let apiFailure = false, failLogin = false, failLogout = false, meDelay = 0
try {
  const e = parse(await readFile(new URL('../../backend/.env.fresh.test', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test_fresh_[a-f0-9]{12}$/); assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const role of ['employee', 'technician', 'manager', 'employeeB']) accounts.push({ ...await provision.create({ email: 'frontend-' + role + '-' + randomUUID() + '@demo.example', fullName: 'Fictional ' + role, role: role === 'employeeB' ? 'employee' : role, password }), fixtureKey: role })
  const managementRepositories = { departments: createMySqlReferenceRepository(pool, 'departments'), categories: createMySqlReferenceRepository(pool, 'categories'), subcategories: createMySqlReferenceRepository(pool, 'subcategories'), employees: createMySqlEmployeeDirectoryRepository(pool) }
  for(let i=0;i<2;i++) { const suffix=randomUUID(); departments.push(await managementRepositories.departments.save({name:'قسم خيالي '+suffix,isActive:true})); categories.push(await managementRepositories.categories.save({name:'عطل خيالي '+suffix,isActive:true})); subcategories.push(await managementRepositories.subcategories.save({name:'فرعي خيالي '+suffix,categoryId:categories[i].id,isActive:true})) }
  for (let i=0; i<27; i++) directoryEmployees.push(await managementRepositories.employees.create({ fullName: `موظف اختبار ${String(i).padStart(3, '0')} ${randomUUID()}`, departmentId: departments[i % 2].id }, accounts.find((account) => account.role === 'manager')))
  const notifications=createNotificationService(); ticketRepository=createMySqlTicketRepository(pool,{notifications}); workflow=createMySqlTicketWorkflowRepository(pool,{notifications})
  const auth = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  let origin
  const app = createApp({ notificationRepository:createMySqlNotificationRepository(pool), authService: {
    async login(input) { if (failLogin) { const error = Error('Private'); error.code = 'ER_LOCK_WAIT_TIMEOUT'; throw error } return auth.login(input) },
    async getUser(token) { if (meDelay) await new Promise((resolve) => setTimeout(resolve, meDelay)); if (apiFailure) throw Error('Private'); return auth.getUser(token) },
    async logout(token) { if (failLogout) throw Error('Private'); return auth.logout(token) },
  }, managementRepositories, ticketRepository: { ...ticketRepository, async create(...args) { const result=await ticketRepository.create(...args); if(dropNext){dropNext=false;throw Error('Fictional lost response')}return result } }, ticketWorkflowRepository: workflow, dashboardRepository: createMySqlDashboardRepository(pool), config: { nodeEnv: 'test', get appOrigin() { return origin } } })
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

  const a=accounts.find((account)=>account.fixtureKey==='employee'), b=accounts.find((account)=>account.fixtureKey==='employeeB'), manager=accounts.find((account)=>account.role==='manager'), engineer=accounts.find((account)=>account.role==='technician')
  const fixtureTitle='تفاصيل خيالية لا تتضمن بيانات حقيقية'
  const fill=async(values)=>evaluate('(()=>{for(const[selector,value]of Object.entries('+JSON.stringify(values)+')){const el=document.querySelector(selector);if(!el)throw Error("Missing input");const proto=el.tagName==="SELECT"?HTMLSelectElement.prototype:el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}})()')
  const submit=async(selector='form')=>evaluate('document.querySelector('+JSON.stringify(selector)+').requestSubmit()')
  const logIn=async(account)=>{
    await navigate('/login');await waitFor('!!document.querySelector("input[name=username]")')
    await fill({'input[name=username]':account.email,'input[name=password]':password});await submit()
    await waitFor('location.pathname === "/employee" && !!document.querySelector("a[href=\\"/employee/new-ticket\\"]")')
    await waitFor('!document.querySelector("[role=status]")')
  }
  await logIn(a)
  await evaluate('localStorage.setItem("hospital-helpdesk:tickets:v1",JSON.stringify([{id:"FORGED-MOCK-TICKET",title:"DO NOT SHOW MOCK DATA"}]))')
  await navigate('/employee/new-ticket');await waitFor('!!document.querySelector("[role=combobox]")')
  assert.equal(await evaluate('document.querySelector("[role=combobox]").value'),'')
  assert.equal(await evaluate('document.querySelector("input[readonly]").value'),'')
  assert.equal(await evaluate('document.querySelector("input[name=reportFor]:checked").value'),'self')
  assert.equal(await evaluate('document.querySelector("select[name=subcategory]").disabled'),true)
  await submit();await waitFor('!!document.querySelector("[role=alert]")')
  await evaluate('document.querySelector("input[name=reportFor][value=other]").click()')
  await fill({'[role=combobox]':'موظف اختبار'})
  await waitFor('document.querySelectorAll("[role=option]").length === 25')
  await click('التالي');await waitFor('document.body.textContent.includes("صفحة 2") && document.querySelectorAll("[role=option]").length === 2')
  await evaluate('document.querySelectorAll("[role=option]")[1].querySelector("button").click()')
  assert.equal(await evaluate('document.querySelector("input[readonly]").value'),directoryEmployees[26].departmentName)
  await fill({'select[name=category]':categories[0].id,'textarea[name=description]':fixtureTitle})
  await waitFor('!document.querySelector("select[name=subcategory]").disabled')
  await fill({'select[name=subcategory]':subcategories[0].id})
  await fill({'select[name=category]':categories[1].id})
  assert.equal(await evaluate('document.querySelector("select[name=subcategory]").value'),'')
  await fill({'select[name=category]':categories[0].id,'select[name=subcategory]':subcategories[0].id})
  dropNext=true
  await submit();await waitFor('!!document.querySelector("[role=alert]") && !document.querySelector("button[type=submit]").disabled')
  assert.equal(await evaluate('document.querySelector("[role=combobox]").value'),directoryEmployees[26].fullName)
  await submit();await waitFor('location.pathname === "/employee"')
  await waitFor('document.body.textContent.includes('+JSON.stringify(fixtureTitle)+')')
  let [created]=await pool.execute('SELECT * FROM tickets WHERE created_by_account_id = ? AND title = ?',[a.id,fixtureTitle])
  assert.equal(created.length,1,'Retry after a lost response must not create a second ticket')
  const ticket=created[0];assert.equal(ticket.reporter_account_id,a.id);assert.equal(ticket.created_for,'other');assert.equal(ticket.employee_number,null);assert.equal(ticket.reporter_name,directoryEmployees[26].fullName)
  assert.notEqual(ticket.reporter_name,a.fullName)
  const other=(await ticketRepository.create(ticketInput({reporterName:ticket.reporter_name,departmentId:departments[0].id,categoryId:categories[0].id,title:'بلاغ موظف آخر لا يظهر',description:'تفاصيل خيالية'},b),b)).item
  await navigate('/employee');await waitFor('document.body.textContent.includes('+JSON.stringify(fixtureTitle)+')')
  assert.equal(await evaluate('document.body.textContent.includes("DO NOT SHOW MOCK DATA")'),false)
  assert.equal(await evaluate('document.body.textContent.includes("بلاغ موظف آخر لا يظهر")'),false)
  assert.equal(await evaluate('Object.values(localStorage).some(value=>value.includes('+JSON.stringify(ticket.id)+'))'),false)
  await workflow.execute(ticket.id,'assign',{technicianId:engineer.id,expectedVersion:0},manager)
  await workflow.execute(ticket.id,'note',{text:'INTERNAL-NOTE-NEVER-VISIBLE',visibility:'internal'},engineer)
  await workflow.execute(ticket.id,'note',{text:'ملاحظة عامة خيالية',visibility:'public'},engineer)
  await workflow.execute(ticket.id,'status',{status:'resolved',text:'وصف الحل الخيالي الأول'},engineer)
  await evaluate('Array.from(document.querySelectorAll("article")).find(x=>x.textContent.includes('+JSON.stringify(fixtureTitle)+')).querySelector("button").click()')
  await waitFor('!!document.querySelector("[role=dialog]") && document.querySelector("[role=dialog]").textContent.includes("هل تم حل المشكلة")')
  assert.equal(await evaluate('document.body.textContent.includes("INTERNAL-NOTE-NEVER-VISIBLE")'),false)
  await fill({'[role=dialog] form textarea':'تعليق الموظف من نافذة المتابعة'})
  await submit('[role=dialog] form')
  await waitFor('document.querySelector("[role=dialog]").textContent.includes("تعليق الموظف من نافذة المتابعة") && document.querySelector("[role=dialog] form textarea").value === ""')
  await click('نعم، تم حل المشكلة')
  await waitFor('document.querySelector("[role=dialog]").textContent.includes("هل عادت المشكلة")')
  await click('إعادة فتح الطلب')
  await fill({'[role=dialog] textarea[placeholder="أضف توضيحًا يساعد المهندس على استكمال المعالجة"]':'سبب خيالي لإعادة الفتح بعد التأكيد'})
  await click('إعادة فتح الطلب')
  await waitFor('!!document.querySelector("[role=dialog] [data-ticket-status=reopened]")')
  await evaluate('document.querySelector("[aria-label=إغلاق]").click()')
  await navigate('/employee/tickets/'+ticket.id)
  await waitFor('document.body.textContent.includes("ملاحظة عامة خيالية") && !!document.querySelector("form textarea")')
  assert.equal(await evaluate('document.body.textContent.includes("INTERNAL-NOTE-NEVER-VISIBLE")'),false)
  // Concurrent server change: first submit must preserve the draft and refresh the version.
  await workflow.execute(ticket.id,'comment',{text:'تعليق متزامن خيالي'},a)
  await fill({'form textarea':'تعليق محفوظ بعد تعارض التحديث'})
  await submit()
  await waitFor('!!document.querySelector("[role=alert]") && !document.querySelector("button[type=submit]").disabled')
  assert.equal(await evaluate('document.querySelector("form textarea").value'),'تعليق محفوظ بعد تعارض التحديث')
  await submit();await waitFor('document.querySelector("form textarea").value === "" && document.body.textContent.includes("تعليق محفوظ بعد تعارض التحديث")')
  await workflow.execute(ticket.id,'status',{status:'resolved',text:'وصف الحل الخيالي الثاني'},engineer)
  await navigate('/employee/tickets/'+ticket.id);await waitFor('document.body.textContent.includes("وصف الحل الخيالي الثاني")')
  await click('لا، المشكلة ما زالت موجودة')
  await fill({'textarea[placeholder="أضف توضيحًا يساعد المهندس على استكمال المعالجة"]':'سبب آخر خيالي من صفحة التفاصيل'})
  await click('إعادة فتح الطلب')
  await waitFor('!!document.querySelector(".page-heading [data-ticket-status=reopened]")')
  const [[history]]=await pool.execute("SELECT COUNT(*) n FROM ticket_history WHERE ticket_id = ? AND type = 'reopened'",[ticket.id]);assert.equal(history.n,2)
  await navigate('/employee/tickets/'+other.id);await waitFor('document.body.textContent.includes("الطلب غير متاح")')
  assert.equal(await evaluate('document.body.textContent.includes("بلاغ موظف آخر لا يظهر")'),false)
  const forbiddenStatus=await evaluate('fetch("/api/tickets/'+other.id+'/comments",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"محاولة مرفوضة"})}).then(r=>r.status)')
  assert.equal(forbiddenStatus,404)
  await navigate('/employee/new-ticket');await waitFor('!!document.querySelector("[role=combobox]")')
  assert.equal(await evaluate('document.querySelector("input[name=reportFor]:checked").value'),'self')
  await fill({'[role=combobox]':directoryEmployees[1].fullName})
  await waitFor('document.querySelectorAll("[role=option]").length === 1')
  await evaluate('document.querySelector("[role=option] button").click()')
  assert.equal(await evaluate('document.querySelector("input[readonly]").value'),directoryEmployees[1].departmentName)
  await fill({'select[name=category]':categories[1].id,'textarea[name=description]':'تفاصيل شخصية خيالية'})
  await submit();await waitFor('location.pathname === "/employee" && document.body.textContent.includes("تفاصيل شخصية خيالية")')
  const [[personal]]=await pool.execute('SELECT created_for FROM tickets WHERE created_by_account_id = ? AND title = ?',[a.id,'تفاصيل شخصية خيالية']);assert.equal(personal.created_for,'self')
  for(let i=0;i<21;i++){
    const item=(await ticketRepository.create(ticketInput({reporterName:'اسم خيالي',departmentId:departments[0].id,categoryId:categories[0].id,title:'طلب قديم خيالي '+i,description:'تفاصيل خيالية'},a),a)).item
    await pool.execute('UPDATE tickets SET created_at = ? WHERE id = ?',[new Date('2010-01-01T00:00:00Z'),item.id])
  }
  await navigate('/employee/tickets');await waitFor('!!document.querySelector("input[name=search]") && !document.querySelector("[role=status]")')
  await evaluate('document.querySelector("input[name=search]").focus()')
  await fill({'input[name=search]':fixtureTitle})
  await waitFor('document.body.textContent.includes('+JSON.stringify(fixtureTitle)+') && !document.querySelector("[role=status]")')
  assert.equal(await evaluate('document.querySelector("input[name=search]") === document.activeElement'),true)
  await fill({'select[name=status]':'closed'})
  await waitFor('document.body.textContent.includes("لا توجد نتائج مطابقة")')
  await click('مسح التصفية')
  await waitFor('!document.querySelector("[role=status]")')
  await click('التالي')
  await waitFor('document.body.textContent.includes("الصفحة 2 من 2") && !document.querySelector("[role=status]")')
  await click('السابق')
  await waitFor('document.body.textContent.includes("الصفحة 1 من 2") && !document.querySelector("[role=status]")')
  await fill({'input[name=creationDate]':'2010-01-01','select[name=sort]':'oldest'})
  await waitFor('!document.querySelector("[role=status]") && document.body.textContent.includes("طلب قديم خيالي")')
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(fixtureTitle)+')'),false)
  await navigate('/employee/tickets/'+ticket.id);await waitFor('document.body.textContent.includes("سبب آخر خيالي من صفحة التفاصيل")')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await mkdir('artifacts.local',{recursive:true})
  await writeFile('artifacts.local/employee-light-mobile.png',Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)).data,'base64'))
  await click('الوضع الليلي')
  await navigate('/employee');await waitFor('document.body.textContent.includes("تفاصيل شخصية خيالية")')
  assert.equal(await evaluate('document.documentElement.classList.contains("dark")'),true)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await writeFile('artifacts.local/employee-dark-mobile.png',Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)).data,'base64'))
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId)
  await navigate('/employee/tickets');await waitFor('!!document.querySelector("table") && !document.querySelector("[role=status]")')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await click('تسجيل الخروج');await waitFor('location.pathname === "/login"')
  await logIn(b)
  await waitFor('document.body.textContent.includes("بلاغ موظف آخر لا يظهر")')
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(fixtureTitle)+')'),false)
  await navigate('/employee/tickets/'+ticket.id);await waitFor('document.body.textContent.includes("الطلب غير متاح")')
  console.log('PASS employee browser: manual personal/on-behalf creation, lost-response retry, refresh, ownership isolation, comments, conflicts, confirmation/repeated reopening, history privacy, search/status/date/sort/pagination, mobile/light/dark')
  await command('Browser.close').catch(()=>{})
} finally {
  chrome?.kill()
  await vite?.close()
  if (api) await new Promise((resolve) => api.close(resolve))
  if (pool) { try { for(const account of accounts)await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?',[account.id]);for(const[table,rows]of [['employee_directory',directoryEmployees],['fault_subcategories',subcategories],['fault_categories',categories],['departments',departments],['users',accounts]])for(const row of rows)await pool.execute('DELETE FROM '+table+' WHERE id = ?',[row.id]); }finally{await pool.end()} }
  if (profile && profile.startsWith(join(tmpdir(), 'helpdesk-browser-'))) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}
