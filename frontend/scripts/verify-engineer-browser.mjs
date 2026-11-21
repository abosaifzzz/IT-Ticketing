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
import { createLocalAccountService } from '../../backend/test/support/accounts.js'
import { createLocalPasswordProvider } from '../../backend/src/auth/localPasswordProvider.js'
import { createAuthService } from '../../backend/src/auth/authService.js'
import { createMySqlTicketRepository } from '../../backend/src/repositories/mysqlTicketRepository.js'
import { createMySqlDashboardRepository } from '../../backend/src/repositories/mysqlDashboardRepository.js'
import { createMySqlReferenceRepository } from '../../backend/src/repositories/mysqlReferenceRepository.js'
import { createMySqlTicketWorkflowRepository } from '../../backend/src/repositories/mysqlTicketWorkflowRepository.js'
import { createNotificationService } from '../../backend/src/notifications/service.js'
import { ticketInput } from '../../backend/src/tickets/validation.js'
import { createMySqlItUserRepository } from '../../backend/src/repositories/mysqlItUserRepository.js'
import { createMySqlAssetRepository } from '../../backend/src/repositories/mysqlAssetRepository.js'
import { createMySqlEmployeeDirectoryRepository } from '../../backend/src/repositories/mysqlEmployeeDirectoryRepository.js'
import { assetInput } from '../../backend/src/assets/validation.js'
import { createApp } from '../../backend/src/app.js'
import { createProfileRepository } from '../../backend/src/auth/profiles.js'

const accounts = [], pending = new Map(), departments = [], categories = [], subcategories = [], stock = []
let ticketRepository, workflow, dropNext = false
const password = 'Fictional-' + randomBytes(24).toString('hex')
let pool, api, vite, chrome, profile, sequence = 0, buffer = ''
let apiFailure = false, failLogin = false, failLogout = false, meDelay = 0
try {
  const e = parse(await readFile(new URL('../../backend/.env.fresh.test', import.meta.url)))
  assert.match(e.DB_NAME, /^hospital_it_helpdesk_test_fresh_[a-f0-9]{12}$/); assert.notEqual(e.DB_USER, 'root')
  pool = createPool({ host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD })
  const users = createMySqlUserRepository(pool), provision = createLocalAccountService(users)
  for (const role of ['employee', 'technician', 'manager', 'engineerB']) accounts.push({ ...await provision.create({ email: 'frontend-' + role + '-' + randomUUID() + '@demo.example', fullName: 'Fictional ' + role, role: role === 'engineerB' ? 'technician' : role, password }), fixtureKey: role })
  const managementRepositories = { itUsers:createMySqlItUserRepository(pool), departments: createMySqlReferenceRepository(pool, 'departments'), categories: createMySqlReferenceRepository(pool, 'categories'), subcategories: createMySqlReferenceRepository(pool, 'subcategories'), employees:createMySqlEmployeeDirectoryRepository(pool) }
  for(let i=0;i<2;i++) { const suffix=randomUUID(); departments.push(await managementRepositories.departments.save({name:'قسم خيالي '+suffix,isActive:true})); categories.push(await managementRepositories.categories.save({name:'عطل خيالي '+suffix,isActive:true})); subcategories.push(await managementRepositories.subcategories.save({name:'فرعي خيالي '+suffix,categoryId:categories[i].id,isActive:true})) }
  const directoryEmployee=await managementRepositories.employees.create({fullName:'موظف يدوي خيالي '+randomUUID(),departmentId:departments[0].id},accounts.find(a=>a.fixtureKey==='manager'))
  const notifications=createNotificationService(); ticketRepository=createMySqlTicketRepository(pool,{notifications}); workflow=createMySqlTicketWorkflowRepository(pool,{notifications})
  const assetRepository=createMySqlAssetRepository(pool)
  const assetActor=accounts.find(a=>a.fixtureKey==='manager')
  for(const [kind,quantity]of [['BATCH',3],['SINGLE',1]])stock.push(await assetRepository.create(assetInput({assetId:'ENGINEER-'+randomUUID().slice(0,12)+'-'+kind,name:'أصل خيالي '+kind,quantity,manufacturer:'خيالي',model:'اختبار',holdingType:'it_storage',location:'مخزن خيالي',operationalStatus:'working',conditionDescription:'بيانات خيالية'}),assetActor))
  const auth = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  let origin
  const app = createApp({ profileRepository: createProfileRepository(pool),  notificationRepository:createMySqlNotificationRepository(pool), authService: {
    async login(input) { if (failLogin) { const error = Error('Private'); error.code = 'ER_LOCK_WAIT_TIMEOUT'; throw error } return auth.login(input) },
    async getUser(token, options) { if (meDelay) await new Promise((resolve) => setTimeout(resolve, meDelay)); if (apiFailure) throw Error('Private'); return auth.getUser(token, options) },
    async logout(token) { if (failLogout) throw Error('Private'); return auth.logout(token) },
  }, assetRepository, managementRepositories, ticketRepository: { ...ticketRepository, async create(...args) { const result=await ticketRepository.create(...args); if(dropNext){dropNext=false;throw Error('Fictional lost response')}return result } }, ticketWorkflowRepository: workflow, dashboardRepository: createMySqlDashboardRepository(pool), config: { nodeEnv: 'test', get appOrigin() { return origin } } })
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
    const state = await evaluate('({path:location.pathname, alerts:Array.from(document.querySelectorAll("[role=alert]")).map(node=>node.textContent), heading:document.querySelector("h1")?.textContent})')
    throw Error('Browser condition timed out: ' + expression + ' ' + JSON.stringify(state))
  }
  const navigate = async (path) => { await command('Page.navigate', { url: origin + path }, sessionId); await waitFor('!!document.querySelector("#root")') }
  const click = async (text) => evaluate('Array.from(document.querySelectorAll("button")).find(x => x.textContent.trim() === ' + JSON.stringify(text) + ')?.click()')
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)


  const employee=accounts.find(a=>a.fixtureKey==='employee'),engineer=accounts.find(a=>a.fixtureKey==='technician'),other=accounts.find(a=>a.fixtureKey==='engineerB'),manager=accounts.find(a=>a.fixtureKey==='manager')
  const fill=async(values)=>evaluate('(()=>{for(const[selector,value]of Object.entries('+JSON.stringify(values)+')){const el=document.querySelector(selector);if(!el)throw Error("Missing input");const proto=el.tagName==="SELECT"?HTMLSelectElement.prototype:el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}})()')
  const submit=async(selector)=>evaluate('document.querySelector('+JSON.stringify(selector)+').requestSubmit()')
  const login=async(account)=>{
    await navigate('/login');await waitFor('!!document.querySelector("input[name=username]")')
    await fill({'input[name=username]':account.email,'input[name=password]':password});await submit('form')
    await waitFor('location.pathname === "/'+account.role+'" && document.body.textContent.includes("تم تسجيل الدخول")')
  }
  const make=async(title,assignee)=>{
    const item=(await ticketRepository.create(ticketInput({reporterName:'طالب دعم خيالي',departmentId:departments[0].id,categoryId:categories[0].id,title,description:'تفاصيل خيالية محفوظة على الخادم'},employee),employee)).item
    if(assignee)await workflow.execute(item.id,'assign',{technicianId:assignee.id,expectedVersion:0},manager)
    return item
  }
  const main=await make('تذكرة مهندس خيالية أساسية',engineer),second=await make('تذكرة أخرى خيالية',engineer),privateTicket=await make('تذكرة مهندس آخر سرية',other),claimable=await make('تذكرة متاحة للتولي'),race=await make('تذكرة سباق إسناد')
  const [batch,single]=stock
  const employeeSession=await auth.login({email:employee.email,password})
  const engineerSession=await auth.login({email:engineer.email,password})
  const otherSession=await auth.login({email:other.email,password})
  const managerSession=await auth.login({email:manager.email,password})
  const raw=async(path,session,method='GET',body)=>fetch('http://127.0.0.1:'+api.address().port+'/api'+path,{method,headers:{Origin:origin,Cookie:'it-helpdesk-session='+session.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  for (const path of ['/tickets?page=1&pageSize=5', '/dashboard', '/dashboard/recurring-problems', '/it-users/'+engineer.id]) {
    const response = await raw(path,engineerSession)
    assert.equal(response.status,200,`Engineer dashboard request failed: ${path}`)
  }
  await login(engineer)
  await waitFor('document.body.textContent.includes("تذكرة مهندس خيالية أساسية") && document.body.textContent.includes("Fictional manager")')
  assert.equal(await evaluate('document.body.textContent.includes("تذكرة مهندس آخر سرية")'),false)
  assert.equal(await evaluate('!!document.querySelector("a[href*=engineers]") || !!document.querySelector("a[href*=fault-categories]")'),false)
  await evaluate('document.querySelector("section[aria-label] button[aria-pressed]").click()')
  await waitFor('document.querySelector("button[aria-pressed]")?.getAttribute("aria-pressed")==="true" && !document.querySelector("button[aria-pressed]").disabled')
  await navigate('/technician');await waitFor('document.querySelector("button[aria-pressed]")?.getAttribute("aria-pressed")==="true"')
  await navigate('/technician/tickets');await waitFor('!!document.querySelector("[aria-label*=إسناد]")')
  assert.equal(await evaluate('Array.from(document.querySelectorAll("button[aria-label*=إسناد]")).every(b=>b.disabled)'),true)
  const extra=await make('إسناد مدير أثناء عدم التوفر',engineer)
  await navigate('/technician/tickets/'+extra.id);await waitFor('document.body.textContent.includes("Fictional manager") && !!document.querySelector("textarea[name=pendingReason]")')
  await click('بدء العمل');await waitFor('!!document.querySelector("[data-ticket-status=in_progress]")')
  assert.equal((await raw('/tickets/'+main.id+'/assignment',engineerSession,'POST',{technicianId:other.id,expectedVersion:1})).status,403)
  assert.equal((await raw('/it-users',engineerSession,'POST',{username:'forged',fullName:'اسم خيالي',role:'manager'})).status,403)
  await navigate('/manager/engineers');await waitFor('location.pathname==="/unauthorized"')
  await navigate('/technician');await waitFor('!!document.querySelector("button[aria-pressed]") && !document.querySelector("button[aria-pressed]").disabled')
  await evaluate('document.querySelector("button[aria-pressed]").click()')
  await waitFor('document.querySelector("button[aria-pressed]")?.getAttribute("aria-pressed")==="false" && !document.querySelector("button[aria-pressed]").disabled')
  await navigate('/technician/tickets');await waitFor('Array.from(document.querySelectorAll("article")).some(x=>x.textContent.includes("تذكرة متاحة للتولي"))')
  await evaluate('Array.from(document.querySelectorAll("article")).find(x=>x.textContent.includes("تذكرة متاحة للتولي")).querySelector("button").click()')
  await waitFor('location.pathname==="/technician/tickets/'+claimable.id+'" && !!document.querySelector("textarea[name=pendingReason]")')
  let [[claimed]]=await pool.execute('SELECT assigned_by_manager_id,assigned_by_technician_id FROM tickets WHERE id=?',[claimable.id]);assert.equal(claimed.assigned_by_manager_id,null);assert.equal(claimed.assigned_by_technician_id,engineer.id)
  assert.equal(await evaluate('document.body.textContent.includes("إسناد ذاتي بواسطة")'),true)
  await navigate('/technician/tickets');await waitFor('Array.from(document.querySelectorAll("article")).some(x=>x.textContent.includes("تذكرة سباق إسناد"))')
  await workflow.execute(race.id,'claim',{},other)
  const stale=await evaluate('(()=>{const card=Array.from(document.querySelectorAll("article")).find(x=>x.textContent.includes("تذكرة سباق إسناد"));if(card){card.querySelector("button").click();return true}return false})()')
  if(stale)await waitFor('!!document.querySelector("[role=alert]")')
  console.log('PASS engineer availability, manager assignment, role restrictions and self-claim')
  const [[raceRow]]=await pool.execute('SELECT assigned_technician_id FROM tickets WHERE id=?',[race.id]);assert.equal(raceRow.assigned_technician_id,other.id)
  await navigate('/technician/tickets/'+privateTicket.id);await waitFor('document.body.textContent.includes("تذكرة مهندس آخر سرية") && document.body.textContent.includes("للعرض فقط")')
  assert.equal(await evaluate('!!document.querySelector("textarea[name=pendingReason]") || !!document.querySelector("textarea[name=noteText]")'),false)
  await navigate('/technician/tickets/'+main.id);await waitFor('!!document.querySelector("textarea[name=pendingReason]")')
  assert.equal(await evaluate('document.querySelector("textarea[name=pendingReason]").closest("form").querySelector("button").disabled'),true)
  assert.equal(await evaluate('document.querySelector("textarea[name=solutionDescription]").closest("form").querySelector("button").disabled'),true)
  await fill({'textarea[name=pendingReason]':'انتظار قطعة خيالية'})
  await submit('form:has(textarea[name=pendingReason])');await waitFor('!!document.querySelector("[data-ticket-status=pending]")')
  await navigate('/technician/tickets/'+main.id);await waitFor('document.body.textContent.includes("انتظار قطعة خيالية") && !!document.querySelector("textarea[name=noteText]")')
  await click('استئناف العمل');await waitFor('!!document.querySelector("[data-ticket-status=in_progress]")')
  await fill({'select[name=noteVisibility]':'public','textarea[name=noteText]':'ملاحظة عامة خيالية من المهندس'})
  await submit('form:has(textarea[name=noteText])');await waitFor('document.querySelector("textarea[name=noteText]").value==="" && document.body.textContent.includes("ملاحظة عامة خيالية من المهندس")')
  await fill({'select[name=noteVisibility]':'internal','textarea[name=noteText]':'ملاحظة داخلية خيالية لا تظهر للموظف'})
  await submit('form:has(textarea[name=noteText])');await waitFor('document.querySelector("textarea[name=noteText]").value==="" && document.body.textContent.includes("ملاحظة داخلية خيالية لا تظهر للموظف")')
  console.log('PASS engineer required pending/solution controls, resume and public/internal notes')
  const employeeView=await raw('/tickets/'+main.id,employeeSession).then(r=>r.json())
  assert.equal(JSON.stringify(employeeView).includes('ملاحظة داخلية خيالية لا تظهر للموظف'),false);assert.ok(JSON.stringify(employeeView).includes('ملاحظة عامة خيالية من المهندس'))
  await fill({'input[name=assetSearch]':batch.assetId})
  await waitFor('!!document.querySelector("select[name=assetId] option[value=\\"'+batch.assetId+'\\"]")')
  await fill({'select[name=assetId]':batch.assetId})
  await pool.execute('UPDATE assets SET version=version+1 WHERE asset_id=?',[batch.assetId])
  await submit('form:has(select[name=assetId])')
  await waitFor('!!document.querySelector("[role=alert]") && document.querySelector("select[name=assetId]").value===""')
  const [[unchanged]]=await pool.execute('SELECT quantity FROM assets WHERE asset_id=?',[batch.assetId]);assert.equal(unchanged.quantity,3)
  await fill({'select[name=assetId]':batch.assetId});await submit('form:has(select[name=assetId])')
  await waitFor('document.body.textContent.includes("سحبه المهندس: Fictional technician") && !document.querySelector("select[name=assetId]")')
  const [[withdrawn]]=await pool.execute('SELECT t.related_asset_id,a.quantity,a.operational_status,w.engineer_id FROM tickets t JOIN assets a ON a.asset_id=t.related_asset_id JOIN asset_withdrawals w ON w.ticket_id=t.id WHERE t.id=?',[main.id])
  assert.notEqual(withdrawn.related_asset_id,batch.assetId);assert.equal(withdrawn.quantity,1);assert.equal(withdrawn.operational_status,'withdrawn');assert.equal(withdrawn.engineer_id,engineer.id)
  const [[source]]=await pool.execute('SELECT quantity FROM assets WHERE asset_id=?',[batch.assetId]);assert.equal(source.quantity,2)
  assert.equal((await raw('/assets/'+batch.assetId+'/withdraw',engineerSession,'POST',{ticketId:main.id})).status,409)
  assert.equal((await raw('/assets/'+batch.assetId+'/withdraw',otherSession,'POST',{ticketId:main.id})).status,404)
  assert.equal((await raw('/assets/'+batch.assetId+'/withdraw',managerSession,'POST',{ticketId:main.id})).status,403)
  await navigate('/technician/tickets/'+main.id);await waitFor('document.body.textContent.includes("سحبه المهندس: Fictional technician")')
  await fill({'textarea[name=solutionDescription]':'حل خيالي نهائي موثق'})
  await submit('form:has(textarea[name=solutionDescription])');await waitFor('!!document.querySelector("[data-ticket-status=closed]")')
  assert.equal(await evaluate('!!document.querySelector("textarea[name=solutionDescription]")'),false)
  await navigate('/technician/tickets/'+main.id);await waitFor('document.body.textContent.includes("حل خيالي نهائي موثق") && document.body.textContent.includes("ملاحظة داخلية خيالية")')
  await mkdir('artifacts.local',{recursive:true})
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  await writeFile('artifacts.local/engineer-light-mobile.png',Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)).data,'base64'))
  await click('الوضع الليلي');assert.equal(await evaluate('document.documentElement.classList.contains("dark")'),true)
  await navigate('/technician/tickets/'+second.id);await waitFor('!!document.querySelector("input[name=assetSearch]")')
  await fill({'input[name=assetSearch]':single.assetId});await waitFor('!!document.querySelector("select[name=assetId] option[value=\\"'+single.assetId+'\\"]")')
  await fill({'select[name=assetId]':single.assetId});await submit('form:has(select[name=assetId])')
  await waitFor('document.body.textContent.includes("سحبه المهندس: Fictional technician")')
  const [[singleRow]]=await pool.execute('SELECT t.related_asset_id,a.quantity,a.operational_status FROM tickets t JOIN assets a ON a.asset_id=t.related_asset_id WHERE t.id=?',[second.id]);assert.equal(singleRow.related_asset_id,single.assetId);assert.equal(singleRow.quantity,1);assert.equal(singleRow.operational_status,'withdrawn')
  console.log('PASS engineer batch/single stock withdrawal, identity and persistence')
  await navigate('/technician/manual-ticket');await waitFor('!!document.querySelector("#manual-employee-search")')
  assert.equal(await evaluate('!!document.querySelector("select[name=assignedTechnicianId]")'),false)
  assert.equal(await evaluate('!!document.querySelector("input[name=title]")'),false)
  await fill({'#manual-employee-search':directoryEmployee.fullName});await waitFor('document.querySelector("[role=listbox] button")?.textContent.includes('+JSON.stringify(directoryEmployee.fullName)+')')
  await evaluate('document.querySelector("[role=listbox] button").click()')
  assert.equal(await evaluate('document.querySelector("input[readonly]").value'),departments[0].name)
  await fill({'select[name=category]':categories[0].id,'textarea[name=description]':'بلاغ وارد شفهيًا ببيانات خيالية'})
  dropNext=true;await submit('form');await waitFor('!!document.querySelector("[role=alert]") && !document.querySelector("button[type=submit]").disabled')
  await submit('form');await waitFor('document.body.textContent.includes("تم إنشاء البلاغ اليدوي بنجاح") && document.querySelector("#manual-employee-search").value===""')
  const [manual]=await pool.execute('SELECT * FROM tickets WHERE created_by_account_id=? AND title=?',[engineer.id,'بلاغ وارد شفهيًا ببيانات خيالية']);assert.equal(manual.length,1);assert.equal(manual[0].reporter_account_id,null);assert.equal(manual[0].created_by_account_id,engineer.id);assert.equal(manual[0].reporter_name,directoryEmployee.fullName)
  assert.equal((await raw('/tickets/'+manual[0].id,engineerSession)).status,200)
  await evaluate('document.querySelector("input[name=requesterType][value=top_management]").click()')
  assert.equal(await evaluate('!!document.querySelector("select[name=department]")'),false)
  await fill({'input[name=reporterName]':'عضو إدارة خيالي','input[name=managementPosition]':'مكتب خيالي','select[name=category]':categories[0].id,'textarea[name=description]':'تفاصيل خيالية للإدارة'})
  await submit('form');await waitFor('document.querySelector("input[name=reporterName]").value===""')
  const [[senior]]=await pool.execute('SELECT requester_type,department_id,reporter_account_id FROM tickets WHERE created_by_account_id=? AND title=?',[engineer.id,'تفاصيل خيالية للإدارة']);assert.equal(senior.requester_type,'top_management');assert.equal(senior.department_id,null);assert.equal(senior.reporter_account_id,null)
  await navigate('/technician/tickets');await waitFor('!!document.querySelector("input[name=search]")')
  await fill({'input[name=search]':'تذكرة مهندس خيالية أساسية','select[name=status]':'closed'})
  await waitFor('document.body.textContent.includes("تذكرة مهندس خيالية أساسية") && !document.querySelector("input[name=search]").disabled')
  assert.equal(await evaluate('document.body.textContent.includes("تذكرة مهندس آخر سرية")'),false)
  await navigate('/technician/tickets/'+main.id);await waitFor('document.body.textContent.includes("حل خيالي نهائي موثق")')
  const [[beforeReassign]]=await pool.execute('SELECT version FROM tickets WHERE id=?',[main.id])
  await pool.execute('UPDATE users SET full_name=? WHERE id=?',['مدير إعادة إسناد خيالي',manager.id])
  await workflow.execute(main.id,'assign',{technicianId:other.id,expectedVersion:beforeReassign.version},manager)
  await click('تحديث التذكرة');await waitFor('document.body.textContent.includes("للعرض فقط")')
  assert.equal(await evaluate('!!document.querySelector("textarea[name=noteText]")'),false)
  await click('تسجيل الخروج');await waitFor('location.pathname==="/login"')
  await login(other);await navigate('/technician/tickets/'+main.id)
  await waitFor('document.body.textContent.includes("مدير إعادة إسناد خيالي") && document.body.textContent.includes("سحبه المهندس: Fictional technician")')
  assert.equal(await evaluate('document.documentElement.classList.contains("dark")'),true)
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  await writeFile('artifacts.local/engineer-dark-mobile.png',Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)).data,'base64'))
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId)
  await navigate('/technician/tickets');await waitFor('!!document.querySelector("table")')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  console.log('PASS engineer browser: shared read-only ticket view and assignment-protected updates, manager identity, availability, self-claim race, notes, stock withdrawal and responsive themes')
  await command('Browser.close').catch(()=>{})
} finally {
  chrome?.kill()
  await vite?.close()
  if (api) await new Promise((resolve) => api.close(resolve))
  if (pool) { try { const assetIds=new Set();for(const account of accounts){const[rows]=await pool.execute('SELECT DISTINCT asset_id FROM asset_history WHERE actor_account_id=?',[account.id]);for(const row of rows)assetIds.add(row.asset_id);await pool.execute('DELETE FROM asset_withdrawals WHERE engineer_id=?',[account.id])}for(const account of accounts)await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?',[account.id]);for(const id of assetIds)await pool.execute('DELETE FROM assets WHERE asset_id=?',[id]);for(const[table,rows]of [['fault_subcategories',subcategories],['fault_categories',categories],['departments',departments],['users',accounts]])for(const row of rows)await pool.execute('DELETE FROM '+table+' WHERE id = ?',[row.id]); }finally{await pool.end()} }
  if (profile && profile.startsWith(join(tmpdir(), 'helpdesk-browser-'))) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}
