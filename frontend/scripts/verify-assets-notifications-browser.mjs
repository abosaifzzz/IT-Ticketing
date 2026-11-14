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
import { createMySqlTicketWorkflowRepository } from '../../backend/src/repositories/mysqlTicketWorkflowRepository.js'
import { createNotificationService } from '../../backend/src/notifications/service.js'
import { ticketInput } from '../../backend/src/tickets/validation.js'
import { createMySqlItUserRepository } from '../../backend/src/repositories/mysqlItUserRepository.js'
import { createMySqlAssetRepository } from '../../backend/src/repositories/mysqlAssetRepository.js'
import { assetInput } from '../../backend/src/assets/validation.js'
import { createMySqlReportRepository } from '../../backend/src/repositories/mysqlReportRepository.js'
import { createApp } from '../../backend/src/app.js'

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
  const managementRepositories = { itUsers:createMySqlItUserRepository(pool), departments: createMySqlReferenceRepository(pool, 'departments'), categories: createMySqlReferenceRepository(pool, 'categories'), subcategories: createMySqlReferenceRepository(pool, 'subcategories') }
  for(let i=0;i<2;i++) { const suffix=randomUUID(); departments.push(await managementRepositories.departments.save({name:'قسم خيالي '+suffix,isActive:true})); categories.push(await managementRepositories.categories.save({name:'عطل خيالي '+suffix,isActive:true})); subcategories.push(await managementRepositories.subcategories.save({name:'فرعي خيالي '+suffix,categoryId:categories[i].id,isActive:true})) }
  const notifications=createNotificationService(); ticketRepository=createMySqlTicketRepository(pool,{notifications}); workflow=createMySqlTicketWorkflowRepository(pool,{notifications})
  const assetRepository=createMySqlAssetRepository(pool)
  const assetActor=accounts.find(a=>a.fixtureKey==='manager')
  for(const [kind,quantity]of [['BATCH',3],['SINGLE',1]])stock.push(await assetRepository.create(assetInput({assetId:'ENGINEER-'+randomUUID().slice(0,12)+'-'+kind,name:'أصل خيالي '+kind,quantity,manufacturer:'خيالي',model:'اختبار',holdingType:'it_storage',location:'مخزن خيالي',operationalStatus:'working',conditionDescription:'بيانات خيالية'}),assetActor))
  const auth = createAuthService({ provider: await createLocalPasswordProvider(users), sessions: createMySqlSessionRepository(pool) })
  let origin
  const app = createApp({ notificationRepository:createMySqlNotificationRepository(pool), authService: {
    async login(input) { if (failLogin) { const error = Error('Private'); error.code = 'ER_LOCK_WAIT_TIMEOUT'; throw error } return auth.login(input) },
    async getUser(token) { if (meDelay) await new Promise((resolve) => setTimeout(resolve, meDelay)); if (apiFailure) throw Error('Private'); return auth.getUser(token) },
    async logout(token) { if (failLogout) throw Error('Private'); return auth.logout(token) },
  }, reportRepository:createMySqlReportRepository(pool), assetRepository, managementRepositories, ticketRepository: { ...ticketRepository, async create(...args) { const result=await ticketRepository.create(...args); if(dropNext){dropNext=false;throw Error('Fictional lost response')}return result } }, ticketWorkflowRepository: workflow, dashboardRepository: createMySqlDashboardRepository(pool), config: { nodeEnv: 'test', get appOrigin() { return origin } } })
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


  const employee=accounts.find(a=>a.fixtureKey==='employee'),engineer=accounts.find(a=>a.fixtureKey==='technician'),manager=accounts.find(a=>a.fixtureKey==='manager')
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


  const otherEmployee={...await provision.create({email:'fictional-recipient-'+randomUUID()+'@demo.example',fullName:'Fictional other employee',role:'employee',password}),fixtureKey:'employeeB'};accounts.push(otherEmployee)
  const main=await make('بلاغ خيالي للأصول والإشعارات',engineer)
  const employeeSession=await auth.login({email:employee.email,password}),engineerSession=await auth.login({email:engineer.email,password}),managerSession=await auth.login({email:manager.email,password}),otherEmployeeSession=await auth.login({email:otherEmployee.email,password})
  const raw=async(path,session,method='GET',body)=>fetch('http://127.0.0.1:'+api.address().port+'/api'+path,{method,headers:{Origin:origin,Cookie:'it-helpdesk-session='+session.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const unread=()=>evaluate('Number(document.querySelector("[data-unread-count]")?.dataset.unreadCount)')
  const notificationRepository=createMySqlNotificationRepository(pool)
  await command('Page.enable',{},sessionId)
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.setItem('hospital-helpdesk:assets:v2',JSON.stringify([{assetId:'FAKE-LOCAL',name:'بيانات أصول محلية مزيفة',quantity:999999}]));
    localStorage.setItem('hospital-helpdesk:notifications:v1',JSON.stringify([{id:'FAKE',recipientId:'forged',title:'إشعار محلي مزيف'}]));
    window.__streamConnections=[];const NativeEventSource=window.EventSource;window.EventSource=class extends NativeEventSource{constructor(...args){super(...args);window.__streamConnections.push(this);this.addEventListener('ready',()=>{window.__lastReady=true})}};
    window.__audioConstructed=0;const NativeAudio=window.AudioContext;if(NativeAudio)window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);window.__audioConstructed++}};
  `},sessionId)
  for(const path of ['/assets','/assets/statistics','/assets/'+stock[0].assetId,'/assets/export.xlsx'])assert.equal((await raw(path,employeeSession)).status,403)
  await login(employee);await navigate('/it/assets');await waitFor('location.pathname==="/unauthorized"')
  assert.equal(await evaluate('!!document.querySelector("a[href=\\"/it/assets\\"]")'),false)
  await click('تسجيل الخروج');await waitFor('location.pathname==="/login"')
  await login(manager)
  await waitFor('Number(document.querySelector("[data-unread-count]")?.dataset.unreadCount)>0')
  assert.equal(await evaluate('window.__audioConstructed'),0)
  await waitFor('window.__lastReady===true')
  await navigate('/it/assets');await waitFor('document.querySelectorAll(".metric-card").length===4')
  assert.equal(await evaluate('document.body.textContent.includes("بيانات أصول محلية مزيفة")'),false)
  const stats=await assetRepository.statistics(manager)
  assert.equal(await evaluate('Number(document.querySelector(".metric-card strong").textContent)'),stats.total)
  await navigate('/it/assets/new');await waitFor('!!document.querySelector("input[name=assetId]")')
  const assetId='UI-'+randomUUID().slice(0,18).toUpperCase()
  await fill({'input[name=assetId]':assetId,'input[name=name]':'أصل واجهة خيالي','input[name=quantity]':'4','input[name=manufacturer]':'شركة خيالية','input[name=model]':'موديل خيالي','input[name=location]':'غرفة خيالية','textarea[name=conditionDescription]':'حالة خيالية','select[name=holdingType]':'it_storage'})
  assert.equal(await evaluate('document.querySelector("select[name=departmentId]").disabled'),true)
  await click('حفظ الأصل');await waitFor('location.pathname==="/it/assets/'+assetId+'" && document.body.textContent.includes("سجل التغييرات")')
  let asset=await assetRepository.getById(assetId,manager);assert.equal(asset.quantity,4);assert.equal(asset.holdingType,'it_storage')
  await navigate('/it/assets/'+assetId+'/edit');await waitFor('!!document.querySelector("input[name=quantity]")')
  assert.equal(await evaluate('document.querySelector("input[name=assetId]").disabled'),true)
  await fill({'input[name=quantity]':'0'});await click('حفظ الأصل')
  assert.equal((await assetRepository.getById(assetId,manager)).quantity,4)
  await fill({'input[name=quantity]':'7'});await click('حفظ الأصل');await waitFor('location.pathname==="/it/assets/'+assetId+'" && document.body.textContent.includes("تعديل الأصل")')
  asset=await assetRepository.getById(assetId,manager);assert.equal(asset.quantity,7);assert.ok(asset.history.some(event=>event.data.changes.some(change=>change.field==='quantity'&&change.previousValue===4&&change.nextValue===7)))
  // A stale form must not overwrite another stock update.
  await navigate('/it/assets/'+assetId+'/edit');await waitFor('document.querySelector("input[name=quantity]")?.value==="7"')
  await pool.execute('UPDATE assets SET quantity=quantity+1,version=version+1 WHERE asset_id=?',[assetId])
  await fill({'input[name=name]':'مسودة متعارضة'});await click('حفظ الأصل');await waitFor('document.body.textContent.includes("إعادة تحميل الأصل")')
  assert.equal((await assetRepository.getById(assetId,manager)).name,'أصل واجهة خيالي')
  await click('إعادة تحميل الأصل');await waitFor('document.querySelector("input[name=quantity]")?.value==="8"')
  await navigate('/it/assets');await waitFor('!!document.querySelector("input[name=search]")')
  await fill({'input[name=search]':assetId});await waitFor('document.querySelectorAll("article.content-card").length===1')
  assert.equal(await evaluate('document.body.textContent.includes("الكمية: 8")'),true)
  await fill({'select[name=operationalStatus]':'out_of_service'});await waitFor('document.body.textContent.includes("لا توجد أصول مطابقة.")')
  await fill({'select[name=operationalStatus]':'working'});await waitFor('document.querySelectorAll("article.content-card").length===1')
  await evaluate('window.__exports=[];const originalFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes("/assets/export.xlsx"))window.__exports.push(String(args[0]));return originalFetch(...args)}')
  await click('تصدير Excel');await waitFor('window.__exports.length===1')
  assert.match(await evaluate('window.__exports[0]'),new RegExp('search='+assetId))
  const exported=await raw('/assets/export.xlsx?search='+assetId+'&operationalStatus=working',managerSession)
  assert.match(exported.headers.get('Content-Type'),/spreadsheetml/)
  const zip=createRequire(new URL('../../backend/package.json',import.meta.url))('fflate').unzipSync(new Uint8Array(await exported.arrayBuffer()))
  const xml=new TextDecoder().decode(zip['xl/worksheets/sheet1.xml'])
  assert.match(xml,/rightToLeft="1"/);assert.match(xml,new RegExp(assetId));assert.match(xml,/>8<|>8<\/v>/)
  assert.doesNotMatch(xml,/FAKE-LOCAL/)
  // Real withdrawal changes the batch and creates one separately auditable unit.
  const withdrawal=await assetRepository.withdraw(stock[0].assetId,{ticketId:main.id,expectedVersion:stock[0].version},engineer)
  assert.equal(withdrawal.asset.quantity,1);assert.equal((await assetRepository.getById(stock[0].assetId,manager)).quantity,2)
  await navigate('/it/assets/'+withdrawal.asset.assetId);await waitFor('document.body.textContent.includes("سحبه المهندس: Fictional technician")')
  assert.equal(await evaluate('document.body.textContent.includes("سحب وحدة") && document.body.textContent.includes("بلاغ خيالي للأصول والإشعارات")'),true)
  await navigate('/it/assets/'+withdrawal.asset.assetId+'/edit');await waitFor('!!document.querySelector("input[name=quantity]")')
  assert.equal(await evaluate('document.querySelector("input[name=quantity]").disabled && document.querySelector("select[name=operationalStatus]").disabled'),true)
  await navigate('/it/assets/'+stock[0].assetId);await waitFor('document.body.textContent.includes("سجل التغييرات") && document.body.textContent.includes("الوحدة المسحوبة")')
  await navigate('/it/assets/'+assetId);await waitFor('document.body.textContent.includes("سجل التغييرات")')
  await evaluate('window.confirm=()=>true');await click('أرشفة الأصل');await waitFor('document.body.textContent.includes("هذا الأصل مؤرشف")')
  assert.ok((await assetRepository.getById(assetId,manager)).archivedAt)
  await navigate('/it/assets');await waitFor('!!document.querySelector("input[name=search]")');await fill({'input[name=search]':assetId})
  await waitFor('document.body.textContent.includes("لا توجد أصول مطابقة.")')
  await evaluate('document.querySelector("input[name=includeArchived]").click()');await waitFor('document.querySelectorAll("article.content-card").length===1')
  console.log('PASS shared inventory: server quantities, create/edit/conflict, filtered RTL XLSX, batch withdrawal history and shared IT archive')

  await navigate('/manager/notifications');await waitFor('document.querySelectorAll("[data-notification-id]").length>0')
  assert.equal(await evaluate('document.body.textContent.includes("إشعار محلي مزيف")'),false)
  assert.equal(await evaluate('document.body.textContent.includes("تفعيل الأصوات")'),true)
  const initialUnread=await unread()
  await evaluate('document.querySelector("button[aria-controls=api-notification-bell]").click()')
  await waitFor('document.body.textContent.includes("التحديث المباشر متصل")')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))')
  const liveTicket=await make('إشعار مباشر خيالي')
  await waitFor('Number(document.querySelector("[data-unread-count]").dataset.unreadCount)>'+initialUnread)
  await waitFor('document.body.textContent.includes("إشعار مباشر خيالي")')
  assert.equal(await evaluate('window.__audioConstructed'),0)
  await click('تحديد كمقروء')
  await waitFor('Number(document.querySelector("[data-unread-count]").dataset.unreadCount)==='+initialUnread)
  const history=await notificationRepository.history(manager.id,{before:null,limit:100,unreadOnly:false}),engineerHistory=await notificationRepository.history(engineer.id,{before:null,limit:100,unreadOnly:false})
  assert.equal((await raw('/notifications/'+engineerHistory.items[0].id+'/read',managerSession,'PATCH',{})).status,404)
  const own=history.items[0];assert.ok((await raw('/notifications/'+own.id+'/read',managerSession,'PATCH',{})).ok)
  await click('تحديد الكل كمقروء');await waitFor('Number(document.querySelector("[data-unread-count]").dataset.unreadCount)===0')
  await navigate('/manager/notifications');await waitFor('document.querySelectorAll("[data-notification-id]").length>0 && Number(document.querySelector("[data-unread-count]").dataset.unreadCount)===0')
  await click('غير المقروءة');await waitFor('document.body.textContent.includes("لا توجد إشعارات مطابقة.")')
  // Allow sound only by an explicit user action, never by initial feed/reconnect.
  await click('تفعيل الأصوات');await waitFor('document.body.textContent.includes("إيقاف الأصوات")')
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("hospital-helpdesk:notification-sound-settings:v1")).enabled'),true)
  await click('كتم الأصوات');await waitFor('document.body.textContent.includes("إلغاء الكتم")')
  await click('تجربة الصوت')
  await click('الوضع الليلي');await waitFor('document.documentElement.classList.contains("dark")')
  await mkdir('artifacts.local',{recursive:true})
  await new Promise(resolve=>setTimeout(resolve,250))
  await writeFile('artifacts.local/notifications-dark-mobile.png',Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)).data,'base64'))
  console.log('PASS account-scoped SSE bell/history, read-one/all persistence, recipient isolation and user sound settings')

  // Block SSE at page startup and shorten only the normal polling interval for this test.
  const fallbackScript=await command('Page.addScriptToEvaluateOnNewDocument',{source:'window.EventSource=class{constructor(){throw Error("Fictional unavailable stream")}};const originalInterval=window.setInterval;window.setInterval=(fn,ms,...args)=>originalInterval(fn,ms===15000?500:ms,...args)'},sessionId)
  await navigate('/manager/notifications');await waitFor('!!document.querySelector("[data-unread-count]")')
  await make('إشعار احتياطي خيالي')
  await waitFor('Number(document.querySelector("[data-unread-count]").dataset.unreadCount)>0 && document.body.textContent.includes("إشعار احتياطي خيالي")')
  await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:fallbackScript.identifier},sessionId)
  await navigate('/manager/notifications');await waitFor('document.body.textContent.includes("إشعار احتياطي خيالي")')
  await evaluate('document.querySelector("button[aria-controls=api-notification-bell]").click()');await waitFor('document.body.textContent.includes("التحديث المباشر متصل")')
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))')
  assert.equal((await raw('/notifications?recipientId='+engineer.id,managerSession)).status,400)
  console.log('PASS notification polling fallback and reconnect refresh')

  await workflow.execute(main.id,'status',{status:'resolved',text:'حل خيالي',expectedVersion:(await ticketRepository.getById(main.id,engineer)).version},engineer)
  await click('تسجيل الخروج');await waitFor('location.pathname==="/login"')
  await login(employee);await navigate('/employee/notifications')
  await waitFor('document.querySelectorAll("[data-notification-id]").length===1')
  assert.equal(await evaluate('document.body.textContent.includes("إشعار مباشر خيالي") || document.body.textContent.includes("إشعار احتياطي خيالي")'),false)
  const employeeHistory=await notificationRepository.history(employee.id,{before:null,limit:100,unreadOnly:false})
  assert.equal(employeeHistory.items.length,1);assert.equal(employeeHistory.items[0].type,'ticket_resolved')
  assert.equal((await raw('/notifications/'+employeeHistory.items[0].id+'/read',otherEmployeeSession,'PATCH',{})).status,404)
  assert.equal((await(await raw('/notifications',otherEmployeeSession)).json()).items.length,0)
  await click('فتح التذكرة');await waitFor('location.pathname==="/employee/tickets/'+main.id+'"')
  await waitFor('Number(document.querySelector("[data-unread-count]").dataset.unreadCount)===0')
  await click('تسجيل الخروج');await waitFor('location.pathname==="/login"')
  await login(otherEmployee);await navigate('/employee/notifications');await waitFor('document.body.textContent.includes("لا توجد إشعارات مطابقة.")')
  assert.equal(await unread(),0);assert.equal(await evaluate('document.body.textContent.includes("بلاغ خيالي للأصول والإشعارات")'),false)
  await click('تسجيل الخروج');await waitFor('location.pathname==="/login"')
  await login(engineer);await navigate('/it/assets/'+withdrawal.asset.assetId)
  await waitFor('document.body.textContent.includes("سحبه المهندس: Fictional technician")')
  assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).some(x=>x.textContent==="أرشفة الأصل")'),true)
  const engineerArchiveTarget=await assetRepository.getById(stock[0].assetId,engineer)
  assert.equal((await raw('/assets/'+stock[0].assetId+'/archive',engineerSession,'POST',{expectedVersion:engineerArchiveTarget.version})).status,200)
  await command('Emulation.setDeviceMetricsOverride',{width:768,height:900,deviceScaleFactor:1,mobile:false},sessionId)
  await navigate('/it/assets');await waitFor('document.querySelectorAll(".metric-card").length===4')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  await click('الوضع النهاري');await waitFor('!document.documentElement.classList.contains("dark")')
  await new Promise(resolve=>setTimeout(resolve,250))
  await writeFile('artifacts.local/assets-light-tablet.png',Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)).data,'base64'))
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId)
  await navigate('/technician/notifications');await waitFor('document.querySelectorAll("[data-notification-id]").length>0')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("hospital-helpdesk:assets:v2"))[0].assetId'),'FAKE-LOCAL')
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("hospital-helpdesk:notifications:v1"))[0].id'),'FAKE')
  assert.ok(liveTicket.id)
  console.log('PASS notification account switch isolation, employee asset denial, engineer withdrawal history, refresh persistence and responsive themes')
  await pool.execute('DELETE FROM auth_sessions WHERE user_id=?',[engineer.id])
  await waitFor('location.pathname==="/login"')
  console.log('PASS revoked session ends the real-time feed and clears authenticated UI')
  await command('Browser.close').catch(()=>{})
} finally {
  chrome?.kill()
  await vite?.close()
  if (api) await new Promise((resolve) => api.close(resolve))
  if (pool) { try { const assetIds=new Set();for(const account of accounts){const[rows]=await pool.execute('SELECT DISTINCT asset_id FROM asset_history WHERE actor_account_id=?',[account.id]);for(const row of rows)assetIds.add(row.asset_id);await pool.execute('DELETE FROM asset_withdrawals WHERE engineer_id=?',[account.id])}for(const account of accounts)await pool.execute('DELETE FROM tickets WHERE created_by_account_id = ?',[account.id]);for(const id of assetIds)await pool.execute('DELETE FROM assets WHERE asset_id=?',[id]);for(const[table,rows]of [['fault_subcategories',subcategories],['fault_categories',categories],['departments',departments],['users',accounts]])for(const row of rows)await pool.execute('DELETE FROM '+table+' WHERE id = ?',[row.id]); }finally{await pool.end()} }
  if (profile && profile.startsWith(join(tmpdir(), 'helpdesk-browser-'))) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}
