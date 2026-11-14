import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {once} from 'node:events'
import {randomUUID,randomBytes,createDecipheriv} from 'node:crypto'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {gunzipSync} from 'node:zlib'
import {parse} from 'dotenv'
import {testEnvironment} from '../support/database.js'
import {createPool} from '../../src/db/pool.js'
import {createApp} from '../../src/app.js'
import {createMySqlUserRepository} from '../../src/repositories/mysqlUserRepository.js'
import {createMySqlSessionRepository} from '../../src/repositories/mysqlSessionRepository.js'
import {createLocalAccountService} from '../../src/auth/localAccountService.js'
import {createLocalPasswordProvider} from '../../src/auth/localPasswordProvider.js'
import {createAuthService,hashSessionToken} from '../../src/auth/authService.js'
import {hashPassword} from '../../src/auth/passwords.js'
import {createAdministrationRepository} from '../../src/administration/repository.js'
import {createBackupService} from '../../src/administration/backups.js'
import {approveAdministrativeRequest} from '../../src/administration/operator.js'
import {adminPermissions} from '../../src/administration/policy.js'
import {createMySqlReferenceRepository} from '../../src/repositories/mysqlReferenceRepository.js'
import {createMySqlItUserRepository} from '../../src/repositories/mysqlItUserRepository.js'
import {createMySqlEmployeeDirectoryRepository} from '../../src/repositories/mysqlEmployeeDirectoryRepository.js'
import {createMySqlTicketRepository} from '../../src/repositories/mysqlTicketRepository.js'
import {createMySqlTicketWorkflowRepository} from '../../src/repositories/mysqlTicketWorkflowRepository.js'
import {createMySqlAssetRepository} from '../../src/repositories/mysqlAssetRepository.js'
import {createAssetManagementRepository} from '../../src/assetManagement/repository.js'
import {createMySqlReportRepository} from '../../src/repositories/mysqlReportRepository.js'
import {createMySqlDashboardRepository} from '../../src/repositories/mysqlDashboardRepository.js'
import {createMySqlNotificationRepository} from '../../src/repositories/mysqlNotificationRepository.js'

const suffix=randomUUID(),password=randomBytes(24).toString('hex'),origin='http://localhost:5173',accounts={},cookies={},ids=new Set(),key=randomBytes(32)
const began=new Date()
let pool,repo,provision,server,url,app,backupDirectory,backups,originalSettings,originalPermissions,created,resetTarget,roleTarget
const request=(path,{role='admin',method='GET',body,requestOrigin=origin}={})=>fetch(url+path,{method,headers:{...(cookies[role]?{Cookie:cookies[role]}:{}),...(requestOrigin?{Origin:requestOrigin}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
const api=(path,options)=>request('/api/admin'+path,options)
async function login(name,account=accounts[name],secret=password){const response=await request('/api/auth/login',{role:'anonymous',method:'POST',body:{email:account.email,password:secret}});assert.equal(response.status,200);cookies[name]=response.headers.get('set-cookie').split(';')[0];return response}
async function fixture(name,role='employee'){const user=await provision.create({email:name+'-'+suffix+'@demo.example',fullName:'Fictional '+name+' '+suffix,role,password});ids.add(user.id);return user}
before(async()=>{
 const e=await testEnvironment();pool=createPool({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD})
 await pool.query('SELECT admin_password_verified,last_login_at FROM users LIMIT 0');await pool.query('SELECT id FROM admin_audit LIMIT 0')
 const [settings]=await pool.query('SELECT * FROM admin_settings');originalSettings=settings
 const [permissions]=await pool.query('SELECT * FROM admin_role_permissions');originalPermissions=permissions
 repo=createAdministrationRepository(pool);const users=createMySqlUserRepository(pool);provision=createLocalAccountService(users)
 for(const name of ['admin','secondAdmin','manager','technician','employee'])accounts[name]=await fixture(name,name==='secondAdmin'?'admin':name)
 const auth=createAuthService({provider:await createLocalPasswordProvider(users),sessions:createMySqlSessionRepository(pool),administrationPolicy:()=>repo.runtimePolicy()})
 backupDirectory=await mkdtemp(join(tmpdir(),'hospital-admin-test-'))
 backups=createBackupService({pool,key:key.toString('base64'),directory:backupDirectory})
 app=createApp({authService:auth,administrationRepository:repo,backupService:backups,config:{nodeEnv:'test',appOrigin:origin},
  managementRepositories:{departments:createMySqlReferenceRepository(pool,'departments'),categories:createMySqlReferenceRepository(pool,'categories'),subcategories:createMySqlReferenceRepository(pool,'subcategories'),itUsers:createMySqlItUserRepository(pool),employees:createMySqlEmployeeDirectoryRepository(pool)},
  ticketRepository:createMySqlTicketRepository(pool),ticketWorkflowRepository:createMySqlTicketWorkflowRepository(pool),assetRepository:createMySqlAssetRepository(pool),assetManagementRepository:createAssetManagementRepository(pool),reportRepository:createMySqlReportRepository(pool),dashboardRepository:createMySqlDashboardRepository(pool),notificationRepository:createMySqlNotificationRepository(pool)})
 server=app.listen(0,'127.0.0.1');await once(server,'listening');url='http://127.0.0.1:'+server.address().port
 for(const name of Object.keys(accounts))await login(name)
})
after(async()=>{
 if(app)await app.locals.closeAdministrationJobs?.()
 if(server)await new Promise(resolve=>server.close(resolve))
 if(pool){try{
  for(const row of originalSettings??[])await pool.execute('UPDATE admin_settings SET settings_data=?,version=?,updated_at=? WHERE section=?',[JSON.stringify(typeof row.settings_data==='string'?JSON.parse(row.settings_data):row.settings_data),row.version,row.updated_at,row.section])
  for(const row of originalPermissions??[])await pool.execute('UPDATE admin_role_permissions SET enabled=? WHERE role=? AND permission=?',[row.enabled,row.role,row.permission])
  const all=[...ids];if(all.length){const marks=all.map(()=>'?').join(',');await pool.query(`DELETE FROM admin_requests WHERE target_id IN (${marks}) OR requested_by IN (${marks})`,[...all,...all]);await pool.query(`DELETE FROM admin_backups WHERE requested_by IN (${marks})`,all);await pool.query(`DELETE FROM admin_audit WHERE actor_id IN (${marks}) OR entity_id IN (${marks}) OR (actor_id IS NULL AND occurred_at>=?)`,[...all,...all,began]);for(const id of all)await pool.execute('DELETE FROM users WHERE id=?',[id])}
 }finally{await pool.end()}}
 if(backupDirectory)await rm(backupDirectory,{recursive:true,force:true})
})

test('admin authenticates with a short protected cookie session and no role inheritance or token JSON',async()=>{
 const response=await api('/dashboard');assert.equal(response.status,200)
 const me=await request('/api/auth/me');const data=await me.json();assert.equal(data.user.role,'admin');assert.ok(!JSON.stringify(data).includes(password));assert.ok(!JSON.stringify(data).includes('token'))
 const token=cookies.admin.split('=')[1],[[session]]=await pool.execute('SELECT expires_at,created_at FROM auth_sessions WHERE token_hash=?',[hashSessionToken(token)])
 assert.ok(new Date(session.expires_at)-new Date(session.created_at)<=30*60000)
 const info=await api('/users/'+accounts.admin.id);assert.ok((await info.json()).item.lastLoginAt)
 const short=await fixture('weak-admin-candidate')
 await pool.execute("UPDATE users SET role='admin',admin_password_verified=TRUE,password_hash=? WHERE id=?",[await hashPassword('x'),short.id])
 assert.equal((await request('/api/auth/login',{role:'anonymous',method:'POST',body:{email:short.email,password:'x'}})).status,401)
 await pool.execute("UPDATE users SET role='employee',is_active=FALSE WHERE id=?",[short.id])
})
test('operational roles and anonymous callers are denied every Administration endpoint',async()=>{
 for(const role of ['manager','technician','employee','anonymous'])for(const path of ['/dashboard','/users','/roles','/settings','/audit','/monitoring','/errors','/backups','/backups/status'])assert.equal((await api(path,{role})).status,role==='anonymous'?401:403)
 for(const role of ['manager','technician','employee'])assert.equal((await api('/users',{role,method:'POST',body:{email:'blocked-'+suffix+'@demo.example',fullName:'Fictional blocked',role:'admin'}})).status,403)
})
test('admin is denied operational tickets, assets, groups, custody, reports and management writes',async()=>{
 const id=randomUUID()
 for(const path of ['/api/tickets','/api/assets','/api/asset-management/simple/assets','/api/asset-management/simple/groups','/api/asset-management/custody','/api/reports/summary','/api/dashboard','/api/it-users','/api/departments','/api/notifications'])assert.equal((await request(path)).status,403,path)
 for(const path of ['/api/tickets','/api/tickets/'+id+'/assignment','/api/assets','/api/asset-management/simple/assets','/api/asset-management/simple/groups','/api/asset-management/simple/groups/'+id+'/custody','/api/it-users','/api/departments'])assert.equal((await request(path,{method:'POST',body:{}})).status,403,path)
 for(const role of ['manager','technician']){
  assert.equal((await request('/api/assets',{role})).status,200)
  assert.equal((await request('/api/asset-management/simple/assets',{role})).status,200)
  assert.equal((await request('/api/tickets',{role})).status,200)
 }
 await assert.rejects(createMySqlAssetRepository(pool).statistics(accounts.admin),{status:403})
 await assert.rejects(createMySqlTicketRepository(pool).getById(id,accounts.admin),{status:403})
})
test('account creation/search/pagination/status are secured and never set credentials through the Admin API',async()=>{
 const response=await api('/users',{method:'POST',body:{email:'created-'+suffix+'@demo.example',fullName:'Fictional created '+suffix,role:'employee'}})
 assert.equal(response.status,201);created=(await response.json()).item;ids.add(created.id)
 assert.equal(created.isActive,false);assert.equal(created.provisioningRequired,true)
 assert.equal((await api('/users',{method:'POST',body:{email:'injected-'+suffix+'@demo.example',fullName:'Fictional injected',role:'manager',password}})).status,400)
 const result=await api('/users?search='+suffix+'&pageSize=2');const list=await result.json();assert.equal(list.items.length,2);assert.ok(list.total>=6);assert.deepEqual(Object.keys(list).sort(),['items','page','pageSize','total'])
 assert.ok(!JSON.stringify(list).includes('password_hash'));assert.ok(!JSON.stringify(list).includes(password))
 assert.equal((await api('/users/'+created.id,{method:'PATCH',body:{fullName:'Fictional renamed '+suffix,isActive:true}})).status,200)
 assert.equal((await request('/api/auth/login',{role:'anonymous',method:'POST',body:{email:created.email,password}})).status,401)
 assert.equal((await api('/users/'+created.id,{method:'PATCH',body:{role:'manager'}})).status,400)
 assert.equal((await api('/users/'+created.id,{method:'DELETE'})).status,404)
})
test('role configurations cannot self-grant operations, grant Admin to other roles or unlock restore',async()=>{
 const response=await api('/roles');assert.equal(response.status,200);const matrix=await response.json()
 assert.equal(matrix.singleRoleOnly,true);assert.ok(matrix.items.find(r=>r.role==='admin').permissions.every(p=>p.startsWith('admin.')))
 const baseline=adminPermissions.filter(p=>p!=='admin.backups.restore')
 for(const permission of ['tickets.assign','assets.full','admin.backups.restore','*'])assert.equal((await api('/roles/admin/permissions',{method:'PUT',body:{permissions:[...baseline,permission]}})).status,403)
 assert.equal((await api('/roles/manager/permissions',{method:'PUT',body:{permissions:baseline}})).status,403)
 assert.equal((await api('/roles/admin/permissions',{method:'PUT',body:{permissions:baseline.filter(p=>p!=='admin.permissions.manage')}})).status,409)
 assert.equal((await api('/users/'+accounts.admin.id+'/role-change',{method:'POST',body:{role:'manager',reason:'Fictional forbidden self promotion'}})).status,403)
 const reduced=baseline.filter(p=>p!=='admin.errors.read')
 assert.equal((await api('/roles/admin/permissions',{method:'PUT',body:{permissions:reduced}})).status,200)
 assert.equal((await api('/errors')).status,403)
 assert.equal((await api('/roles/admin/permissions',{method:'PUT',body:{permissions:baseline}})).status,200)
})
test('role changes remain pending until protected approval, revoke sessions and cannot reuse requests',async()=>{
 roleTarget=await fixture('role-target');await login('roleTarget',roleTarget)
 const response=await api('/users/'+roleTarget.id+'/role-change',{method:'POST',body:{role:'manager',reason:'Fictional approved operational appointment'}})
 assert.equal(response.status,202);const pending=(await response.json()).item
 assert.equal((await pool.execute('SELECT role FROM users WHERE id=?',[roleTarget.id]))[0][0].role,'employee')
 assert.equal((await request('/api/reports/summary',{role:'roleTarget'})).status,403)
 await approveAdministrativeRequest(pool,pending.id)
 assert.equal((await request('/api/auth/me',{role:'roleTarget'})).status,401)
 await login('roleTarget',roleTarget);assert.equal((await request('/api/reports/summary',{role:'roleTarget'})).status,200)
 await assert.rejects(approveAdministrativeRequest(pool,pending.id),{status:409})
 const promote=await api('/users/'+roleTarget.id+'/role-change',{method:'POST',body:{role:'admin',reason:'Fictional separate administration appointment'}})
 const requestId=(await promote.json()).item.id
 await assert.rejects(approveAdministrativeRequest(pool,requestId,{password:'x'}),{status:400})
 await approveAdministrativeRequest(pool,requestId,{password})
 await login('roleTarget',roleTarget);assert.equal((await api('/users',{role:'roleTarget'})).status,200)
 assert.equal((await request('/api/tickets',{role:'roleTarget'})).status,403)
})
test('password reset is private, expires, completes once and revokes old sessions without returning secrets',async()=>{
 resetTarget=await fixture('reset-target');await login('resetTarget',resetTarget)
 const response=await api('/users/'+resetTarget.id+'/password-reset',{method:'POST',body:{reason:'Fictional identity verified by operator'}})
 assert.equal(response.status,202);const body=await response.json(),pending=body.item
 assert.equal(body.privateOperatorCompletionRequired,true);assert.ok(!JSON.stringify(body).includes('token'));assert.ok(!JSON.stringify(body).includes(password))
 assert.equal((await api('/users/'+resetTarget.id+'/password-reset',{method:'POST',body:{reason:'Duplicate'}})).status,409)
 const next=randomBytes(24).toString('hex');await approveAdministrativeRequest(pool,pending.id,{password:next})
 assert.equal((await request('/api/auth/me',{role:'resetTarget'})).status,401)
 await login('resetTarget',resetTarget,next)
 await assert.rejects(approveAdministrativeRequest(pool,pending.id,{password:next}),{status:409})
 const another=await api('/users/'+resetTarget.id+'/password-reset',{method:'POST',body:{reason:'Fictional expired request'}}),requestId=(await another.json()).item.id
 await pool.execute('UPDATE admin_requests SET expires_at=? WHERE id=?',[new Date(Date.now()-1000),requestId])
 await assert.rejects(approveAdministrativeRequest(pool,requestId,{password:next}),{status:409})
})
test('disable and explicit revocation immediately invalidate sessions; expired Admin sessions cannot restore',async()=>{
 await provision.replacePassword(created.email,password);await login('created',created)
 assert.equal((await api('/users/'+created.id+'/revoke-sessions',{method:'POST',body:{}})).status,200)
 assert.equal((await request('/api/auth/me',{role:'created'})).status,401)
 await login('created',created)
 assert.equal((await api('/users/'+created.id,{method:'PATCH',body:{isActive:false}})).status,200)
 assert.equal((await request('/api/auth/me',{role:'created'})).status,401)
 const token=cookies.secondAdmin.split('=')[1];await pool.execute('UPDATE auth_sessions SET expires_at=? WHERE token_hash=?',[new Date(Date.now()-1000),hashSessionToken(token)])
 assert.equal((await api('/users',{role:'secondAdmin'})).status,401);await login('secondAdmin')
})
test('sensitive writes require recent authentication, enforce Origin and rotate cookies on reauthentication',async()=>{
 const token=cookies.admin.split('=')[1];await pool.execute('UPDATE auth_sessions SET created_at=? WHERE token_hash=?',[new Date(Date.now()-6*60000),hashSessionToken(token)])
 assert.equal((await api('/users')).status,200)
 assert.equal((await api('/users/'+created.id,{method:'PATCH',body:{fullName:'Fictional blocked'}})).status,401)
 assert.equal((await api('/reauthenticate',{method:'POST',body:{password},requestOrigin:null})).status,403)
 const response=await api('/reauthenticate',{method:'POST',body:{password}});assert.equal(response.status,200)
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Strict/i)
 cookies.admin=cookie.split(';')[0];assert.notEqual(cookies.admin.split('=')[1],token)
 assert.equal((await pool.execute('SELECT token_hash FROM auth_sessions WHERE token_hash=?',[hashSessionToken(token)]))[0].length,0)
 assert.equal((await api('/users/'+created.id,{method:'PATCH',body:{fullName:'Fictional fresh '+suffix}})).status,200)
})
test('settings are validated, versioned, operationally separate and administrative maintenance remains recoverable',async()=>{
 const response=await api('/settings');assert.equal(response.status,200);const rows=(await response.json()).items
 const identity=rows.find(r=>r.section==='identity'),values={...identity.values,hospitalName:'Fictional hospital '+suffix}
 assert.equal((await api('/settings/identity',{method:'PUT',body:{values,expectedVersion:identity.version}})).status,200)
 assert.equal((await api('/settings/identity',{method:'PUT',body:{values,expectedVersion:identity.version}})).status,409)
 assert.equal((await api('/settings/application',{method:'PUT',body:{values:{dbPassword:'forbidden'},expectedVersion:0}})).status,400)
 const maintenance=rows.find(r=>r.section==='maintenance')
 assert.equal((await api('/settings/maintenance',{method:'PUT',body:{values:{enabled:true,message:'Fictional maintenance'},expectedVersion:maintenance.version}})).status,200)
 assert.equal((await request('/api/tickets',{role:'manager'})).status,503)
 assert.equal((await api('/settings')).status,200)
 assert.equal((await api('/settings/maintenance',{method:'PUT',body:{values:{enabled:false,message:'Fictional maintenance'},expectedVersion:maintenance.version+1}})).status,200)
})
test('audit is filterable, immutable and sanitized; runtime DB grants deny audit modification',async()=>{
 const response=await api('/audit?pageSize=2');assert.equal(response.status,200);const result=await response.json()
 assert.equal(result.items.length,2);assert.ok(result.total>2);assert.ok(result.items.every(row=>['SUCCESS','FAILURE'].includes(row.status)))
 assert.equal((await api('/audit/'+result.items[0].id,{method:'PATCH',body:{action:'tamper'}})).status,405)
 assert.equal((await api('/audit/'+result.items[0].id,{method:'DELETE'})).status,405)
 const own=await api('/audit?actorId='+accounts.admin.id+'&module=users');const body=await own.json();assert.ok(body.total>0);assert.ok(body.items.every(row=>row.actorId===accounts.admin.id&&row.actorRole==='admin'))
 const byRole=await api('/audit?actorRole=admin&pageSize=10');assert.equal(byRole.status,200);assert.ok((await byRole.json()).items.every(row=>row.actorRole==='admin'))
 assert.equal((await api('/audit?actorRole=manager%20OR%201%3D1')).status,400)
 assert.ok(!JSON.stringify(body).includes('password_hash'));assert.ok(!JSON.stringify(body).includes(password))
 const e=parse(await readFile('.env')),runtime=createPool({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD})
 try{
  await assert.rejects(runtime.execute('UPDATE admin_audit SET action=action WHERE id=?',[randomUUID()]),{code:'ER_TABLEACCESS_DENIED_ERROR'})
  await assert.rejects(runtime.execute('DELETE FROM admin_audit WHERE id=?',[randomUUID()]),{code:'ER_TABLEACCESS_DENIED_ERROR'})
 }finally{await runtime.end()}
})
test('monitoring is authenticated and exposes sanitized recent errors and basic performance counters',async()=>{
 const previous=repo.dashboard;repo.dashboard=async()=>{throw Error('do-not-expose-sensitive-error')}
 try{assert.equal((await api('/dashboard')).status,500)}finally{repo.dashboard=previous}
 const response=await api('/monitoring');assert.equal(response.status,200);const snapshot=await response.json();assert.equal(snapshot.database,'available');assert.ok(snapshot.requests>0)
 const errors=await(await api('/errors')).json();assert.ok(errors.total>0);assert.ok(!JSON.stringify(errors).includes('do-not-expose-sensitive-error'));assert.ok(!JSON.stringify(errors).includes('stack'))
})
test('backup trigger creates an encrypted snapshot, reports failures and never accepts arbitrary restore files',async()=>{
 const status=await(await api('/backups/status')).json();assert.equal(status.configured,true);assert.equal(status.restore,false)
 const response=await api('/backups',{method:'POST',body:{}});assert.equal(response.status,202);const id=(await response.json()).item.id
 await app.locals.closeAdministrationJobs()
 const [[saved]]=await pool.execute('SELECT * FROM admin_backups WHERE id=?',[id]);assert.equal(saved.status,'COMPLETED');assert.ok(Number(saved.byte_length)>0)
 const bytes=await readFile(join(backupDirectory,id+'.bak.enc'));assert.equal(bytes.subarray(0,8).toString(),'HITBAK01')
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(8,20));decipher.setAuthTag(bytes.subarray(-16))
 const clear=gunzipSync(Buffer.concat([decipher.update(bytes.subarray(20,-16)),decipher.final()])).toString('utf8'),snapshot=JSON.parse(clear)
 assert.ok(snapshot.tables.users.some(u=>u.id===accounts.admin.id));assert.equal(snapshot.tables.auth_sessions,undefined);assert.ok(!clear.includes(password))
 const failed=await repo.queueBackup(accounts.admin,'127.0.0.1');await createBackupService({pool,key:'invalid',directory:backupDirectory}).run(failed.id)
 assert.equal((await pool.execute('SELECT failure_code FROM admin_backups WHERE id=?',[failed.id]))[0][0].failure_code,'NOT_CONFIGURED')
 assert.equal((await api('/backups/'+id+'/restore',{method:'POST',body:{confirmation:'RESTORE_BACKUP '+id}})).status,403)
 await pool.execute("UPDATE admin_role_permissions SET enabled=TRUE WHERE permission='admin.backups.restore'")
 try{
  assert.equal((await api('/backups/'+id+'/restore',{method:'POST',body:{file:'arbitrary-upload'}})).status,400)
  assert.equal((await api('/backups/'+id+'/restore',{method:'POST',body:{confirmation:'RESTORE_BACKUP '+id}})).status,501)
 }finally{await pool.execute("UPDATE admin_role_permissions SET enabled=FALSE WHERE permission='admin.backups.restore'")}
})
test('concurrent Admin disabling and role removal cannot eliminate the last active administrator',async()=>{
 const one=await fixture('race-admin-one','admin'),two=await fixture('race-admin-two','admin');await login('raceOne',one);await login('raceTwo',two)
 const [state]=await pool.query("SELECT id,is_active FROM users WHERE role='admin'")
 try{
  for(const row of state)if(![one.id,two.id].includes(row.id))await pool.execute('UPDATE users SET is_active=FALSE WHERE id=?',[row.id])
  const replies=await Promise.all([api('/users/'+two.id,{role:'raceOne',method:'PATCH',body:{isActive:false}}),api('/users/'+one.id,{role:'raceTwo',method:'PATCH',body:{isActive:false}})])
  assert.equal(replies.filter(r=>r.status===200).length,1)
  const [[remaining]]=await pool.query("SELECT id FROM users WHERE role='admin' AND is_active=TRUE");assert.ok(remaining)
  const role=remaining.id===one.id?'raceOne':'raceTwo'
  assert.equal((await api('/users/'+remaining.id,{role,method:'PATCH',body:{isActive:false}})).status,409)
  const loser=remaining.id===one.id?two:one
  await pool.execute('UPDATE users SET is_active=TRUE WHERE id=?',[loser.id]);await login('lastOther',loser)
  const change=await api('/users/'+remaining.id+'/role-change',{role:'lastOther',method:'POST',body:{role:'employee',reason:'Fictional protected demotion'}});assert.equal(change.status,202)
  const id=(await change.json()).item.id;await pool.execute('UPDATE users SET is_active=FALSE WHERE id=?',[loser.id])
  await assert.rejects(approveAdministrativeRequest(pool,id),{status:409})
 }finally{for(const row of state)await pool.execute('UPDATE users SET is_active=? WHERE id=?',[row.is_active,row.id])}
})
