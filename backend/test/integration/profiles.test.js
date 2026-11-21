import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {once} from 'node:events'
import {testEnvironment} from '../support/database.js'
import {createPool} from '../../src/db/pool.js'
import {createMySqlUserRepository} from '../../src/repositories/mysqlUserRepository.js'
import {createMySqlSessionRepository} from '../../src/repositories/mysqlSessionRepository.js'
import {createLocalAccountService} from '../support/accounts.js'
import {createLocalPasswordProvider} from '../../src/auth/localPasswordProvider.js'
import {createAuthService} from '../../src/auth/authService.js'
import {createProfileRepository} from '../../src/auth/profiles.js'
import {createAdministrationRepository} from '../../src/administration/repository.js'
import {createMySqlTicketRepository} from '../../src/repositories/mysqlTicketRepository.js'
import {createMySqlTicketWorkflowRepository} from '../../src/repositories/mysqlTicketWorkflowRepository.js'
import {createNotificationService} from '../../src/notifications/service.js'
import {createMySqlItUserRepository} from '../../src/repositories/mysqlItUserRepository.js'
import {createApp} from '../../src/app.js'
import {importUserRoster,rosterRows} from '../../src/administration/roster.js'
import {verifyPassword} from '../../src/auth/passwords.js'

const origin='http://localhost:5173',suffix=randomUUID(),accounts=[],departments=[],batches=[],directoryIds=[]
const password='Fictional-profile-test-password-42'
let pool,repo,profiles,server,url,admin,adminCookie,employee,employeeCookie,manager,managerCookie,engineer,engineerCookie,other,categoryId,ticket
async function http(path,{cookie,method='GET',body,requestOrigin=origin}={}){
 const response=await fetch(url+path,{method,headers:{Origin:requestOrigin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,data:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
}
async function login(username,p=password){return http('/api/auth/login',{method:'POST',body:{username,password:p}})}
const setupBody=(extra={})=>({currentPassword:'123',newPassword:password,phone:'01000000000',departmentIds:[departments[0]],...extra})
const ticketBody=(extra={})=>({categoryId,title:'Fictional profile ticket',description:'Fictional description',...extra})
before(async()=>{
 const e=await testEnvironment();pool=createPool({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD})
 const users=createMySqlUserRepository(pool)
 admin=await createLocalAccountService(users).create({email:`profile-admin-${suffix}@demo.example`,fullName:'Fictional Admin',role:'admin',password});accounts.push(admin.id)
 repo=createAdministrationRepository(pool);profiles=createProfileRepository(pool)
 for(let i=0;i<3;i++){const id=randomUUID();departments.push(id);await pool.execute('INSERT INTO departments(id,name,is_active,created_at,updated_at) VALUES(?,?,?,NOW(3),NOW(3))',[id,`Profile department ${i} ${suffix}`,i!==2])}
 categoryId=randomUUID();await pool.execute('INSERT INTO fault_categories(id,name,is_active,created_at,updated_at) VALUES(?,?,TRUE,NOW(3),NOW(3))',[categoryId,'Profile category '+suffix])
 const authService=createAuthService({provider:await createLocalPasswordProvider(users),sessions:createMySqlSessionRepository(pool)})
 const notifications=createNotificationService()
 server=createApp({authService,profileRepository:profiles,administrationRepository:repo,ticketRepository:createMySqlTicketRepository(pool,{notifications}),ticketWorkflowRepository:createMySqlTicketWorkflowRepository(pool,{notifications}),config:{appOrigin:origin,nodeEnv:'test'}}).listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${server.address().port}`
 adminCookie=(await login(admin.email)).cookie
 for(const role of ['employee','manager','engineer','employee']){
  const response=await http('/api/admin/users',{cookie:adminCookie,method:'POST',body:{username:`p-${accounts.length}-${suffix}`,fullName:`Fictional ${role} ${accounts.length}`,role}})
  assert.equal(response.status,201);const item=response.data.item;accounts.push(item.id)
  if(role==='manager')manager=item;else if(role==='engineer')engineer=item;else if(!employee)employee=item;else other=item
 }
})
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve))
 if(pool){try{
  for(const id of accounts){await pool.execute('DELETE FROM tickets WHERE created_by_account_id=?',[id]);await pool.execute('DELETE FROM admin_requests WHERE target_id=? OR requested_by=?',[id,id]);await pool.execute('DELETE FROM admin_audit WHERE actor_id=? OR entity_id=?',[id,id])}
  for(const hash of batches){await pool.execute('DELETE FROM user_roster_imports WHERE source_sha256=?',[hash]);await pool.execute('DELETE FROM admin_audit WHERE entity_id=?',[hash])}
  for(const id of directoryIds)await pool.execute('DELETE FROM employee_directory WHERE id=?',[id])
  for(const id of accounts)await pool.execute('DELETE FROM users WHERE id=?',[id])
  for(const id of departments)await pool.execute('DELETE FROM departments WHERE id=?',[id])
  if(categoryId)await pool.execute('DELETE FROM fault_categories WHERE id=?',[categoryId])
 }finally{await pool.end()}}
})
test('first login requires atomic password, phone and active unique department setup',async()=>{
 const logged=await login(employee.username,'123');employeeCookie=logged.cookie
 assert.equal(logged.data.user.mustCompleteProfile,true)
 const options=await http('/api/auth/setup-options',{cookie:employeeCookie});assert.equal(options.status,200);assert.ok(options.data.items.some(d=>d.id===departments[0]));assert.ok(!options.data.items.some(d=>d.id===departments[2]))
 const [[before]]=await pool.execute('SELECT password_hash FROM users WHERE id=?',[employee.id])
 for(const body of [setupBody({phone:'bad'}),setupBody({departmentIds:[]}),setupBody({departmentIds:[departments[0],departments[0]]}),setupBody({departmentIds:[departments[2]]}),setupBody({departmentIds:[randomUUID()]})])assert.equal((await http('/api/auth/complete-setup',{cookie:employeeCookie,method:'POST',body})).status,400)
 const [[unchanged]]=await pool.execute('SELECT password_hash,phone,must_complete_profile FROM users WHERE id=?',[employee.id]);assert.equal(unchanged.password_hash,before.password_hash);assert.equal(unchanged.phone,null);assert.equal(unchanged.must_complete_profile,1)
 assert.equal((await http('/api/auth/profile',{cookie:employeeCookie,method:'PATCH',body:{phone:'01000000000',departmentIds:[departments[0]]}})).status,403)
 assert.equal((await http('/api/auth/change-password',{cookie:employeeCookie,method:'POST',body:{currentPassword:'123',newPassword:password}})).status,403)
 assert.equal((await http('/api/auth/complete-setup',{cookie:employeeCookie,method:'POST',requestOrigin:'https://untrusted.example',body:setupBody()})).status,403)
 assert.equal((await http('/api/auth/complete-setup',{cookie:employeeCookie,method:'POST',body:setupBody()})).status,200)
 assert.equal((await http('/api/auth/me',{cookie:employeeCookie})).status,401)
 employeeCookie=(await login(employee.username)).cookie
 const profile=(await http('/api/auth/profile',{cookie:employeeCookie})).data.item;assert.equal(profile.phone,'01000000000');assert.deepEqual(profile.departmentIds,[departments[0]]);assert.equal(profile.mustCompleteProfile,false)
 const [[saved]]=await pool.execute('SELECT password_hash FROM users WHERE id=?',[employee.id]);assert.match(saved.password_hash,/^\$argon2id\$/);assert.equal(await verifyPassword(saved.password_hash,password),true)
})
test('one department is automatic; submitted descriptive identity cannot change ownership or contact',async()=>{
 const response=await http('/api/tickets',{cookie:employeeCookie,method:'POST',body:ticketBody({reporterName:'Forged descriptive name',reporterEmployeeId:randomUUID(),employeeNumber:'forged',clientRequestId:'profile-'+suffix})})
 assert.equal(response.status,201);ticket=response.data.item
 assert.equal(ticket.reporterName,employee.fullName);assert.equal(ticket.reporterAccountId,employee.id);assert.equal(ticket.reporterUserId,employee.id);assert.equal(ticket.reporterUsername,employee.username);assert.equal(ticket.reporterPhone,'01000000000');assert.equal(ticket.departmentId,departments[0]);assert.equal(ticket.employeeNumber,'')
 assert.equal((await http('/api/tickets',{cookie:employeeCookie,method:'POST',body:ticketBody({reporterUserId:other.id})})).status,400)
 const retry=await http('/api/tickets',{cookie:employeeCookie,method:'POST',body:ticketBody({reporterName:'Different ignored name',reporterEmployeeId:randomUUID(),employeeNumber:'ignored',clientRequestId:'profile-'+suffix})});assert.equal(retry.status,200);assert.equal(retry.data.item.id,ticket.id)
})
test('multiple departments require an allowed selection; profile edits do not rewrite ticket snapshots',async()=>{
 assert.equal((await http('/api/auth/profile',{cookie:employeeCookie,method:'PATCH',body:{phone:'01111111111',departmentIds:[departments[0],departments[1]]}})).status,200)
 assert.equal((await http('/api/tickets',{cookie:employeeCookie,method:'POST',body:ticketBody()})).status,400)
 for(const id of [departments[2],randomUUID()])assert.equal((await http('/api/tickets',{cookie:employeeCookie,method:'POST',body:ticketBody({departmentId:id})})).status,400)
 const created=await http('/api/tickets',{cookie:employeeCookie,method:'POST',body:ticketBody({departmentId:departments[1]})});assert.equal(created.status,201);assert.equal(created.data.item.departmentId,departments[1]);assert.equal(created.data.item.reporterPhone,'01111111111')
 assert.equal((await http('/api/tickets/'+ticket.id,{cookie:employeeCookie})).data.item.reporterPhone,'01000000000')
 await pool.execute('UPDATE departments SET is_active=FALSE WHERE id=?',[departments[1]])
 try{assert.equal((await http('/api/tickets',{cookie:employeeCookie,method:'POST',body:ticketBody({departmentId:departments[1]})})).status,400)}finally{await pool.execute('UPDATE departments SET is_active=TRUE WHERE id=?',[departments[1]])}
})
test('engineers and managers select employee accounts; Admin and other employees remain isolated',async()=>{
 for(const user of [manager,engineer,other]){
  const cookie=(await login(user.username,'123')).cookie
  assert.equal((await http('/api/auth/complete-setup',{cookie,method:'POST',body:setupBody()})).status,200)
  const activeCookie=(await login(user.username)).cookie
  if(user===manager)managerCookie=activeCookie;else if(user===engineer)engineerCookie=activeCookie
  else assert.equal((await http('/api/tickets/'+ticket.id,{cookie:activeCookie})).status,404)
 }
 for(const cookie of [employeeCookie,adminCookie])assert.equal((await http('/api/user-options',{cookie})).status,403)
 for(const cookie of [managerCookie,engineerCookie]){
  const options=await http('/api/user-options?search='+employee.username,{cookie});assert.equal(options.status,200);assert.equal(options.data.total,1);assert.equal(options.data.items[0].phone,'01111111111');assert.equal(options.data.items[0].departments.length,2)
  assert.equal((await http('/api/tickets',{cookie,method:'POST',body:ticketBody({reporterUserId:employee.id})})).status,400)
  const created=await http('/api/tickets',{cookie,method:'POST',body:ticketBody({reporterUserId:employee.id,departmentId:departments[0]})});assert.equal(created.status,201);assert.equal(created.data.item.reporterUserId,employee.id);assert.equal(created.data.item.reporterAccountId,employee.id);assert.equal(created.data.item.source,'manual')
  assert.equal((await http('/api/tickets',{cookie:employeeCookie})).data.items.some(t=>t.id===created.data.item.id),true)
  assert.equal((await http('/api/tickets/'+ticket.id,{cookie})).data.item.reporterUsername,employee.username)
  assert.equal((await http('/api/tickets?search='+employee.username+(cookie===engineerCookie?'&scope=all':''),{cookie})).data.items.some(t=>t.id===ticket.id),true)
 }
 assert.equal((await http('/api/tickets',{cookie:adminCookie,method:'POST',body:ticketBody({reporterUserId:employee.id})})).status,403)
 await pool.execute('UPDATE users SET is_active=FALSE WHERE id=?',[employee.id])
 try{
  const options=await http('/api/user-options?search='+employee.username,{cookie:managerCookie});assert.equal(options.data.total,1);assert.equal(options.data.items[0].isActive,false)
  assert.equal((await http('/api/tickets',{cookie:managerCookie,method:'POST',body:ticketBody({reporterUserId:employee.id,departmentId:departments[0]})})).status,400)
 }finally{await pool.execute('UPDATE users SET is_active=TRUE WHERE id=?',[employee.id])}
})
test('IT can create owned tickets before employee onboarding without changing the employee profile',async()=>{
 const added=await http('/api/admin/users',{cookie:adminCookie,method:'POST',body:{username:'pending-'+suffix,fullName:'Fictional pending employee',role:'employee'}})
 assert.equal(added.status,201);const user=added.data.item;accounts.push(user.id)
 const options=await http('/api/user-options?search='+user.username,{cookie:engineerCookie})
 assert.equal(options.data.total,1);assert.equal(options.data.items[0].mustCompleteProfile,true)
 const body=ticketBody({reporterUserId:user.id,departmentId:departments[0],reporterPhone:'01555555555',clientRequestId:'pending-'+suffix})
 const created=await http('/api/tickets',{cookie:engineerCookie,method:'POST',body});assert.equal(created.status,201)
 const item=created.data.item;assert.equal(item.reporterAccountId,user.id);assert.equal(item.createdByAccountId,engineer.id)
 const retry=await http('/api/tickets',{cookie:engineerCookie,method:'POST',body});assert.equal(retry.status,200);assert.equal(retry.data.item.id,item.id)
 const [[saved]]=await pool.execute('SELECT phone,must_complete_profile,must_change_password FROM users WHERE id=?',[user.id])
 assert.equal(saved.phone,null);assert.equal(saved.must_complete_profile,1);assert.equal(saved.must_change_password,1)
 const bootstrap=(await login(user.username,'123')).cookie
 assert.equal((await http('/api/auth/complete-setup',{cookie:bootstrap,method:'POST',body:setupBody()})).status,200)
 const cookie=(await login(user.username)).cookie
 assert.ok((await http('/api/tickets',{cookie})).data.items.some(t=>t.id===item.id))
 assert.equal((await http('/api/tickets/'+item.id,{cookie})).data.item.reporterPhone,'01555555555')
 assert.equal((await http('/api/tickets/'+item.id,{cookie:employeeCookie})).status,404)
})

test('concurrent first-login submissions commit one complete profile and revoke the bootstrap session',async()=>{
 const created=await http('/api/admin/users',{cookie:adminCookie,method:'POST',body:{username:'race-'+suffix,fullName:'Fictional setup race',role:'employee'}})
 assert.equal(created.status,201);accounts.push(created.data.item.id)
 const cookie=(await login(created.data.item.username,'123')).cookie
 const bodies=[setupBody({newPassword:'Fictional-race-password-one',phone:'01333333333',departmentIds:[departments[0]]}),setupBody({newPassword:'Fictional-race-password-two',phone:'01444444444',departmentIds:[departments[1]]})]
 const responses=await Promise.all(bodies.map(body=>http('/api/auth/complete-setup',{cookie,method:'POST',body})))
 assert.equal(responses.filter(r=>r.status===200).length,1);assert.ok(responses.every(r=>[200,401,409].includes(r.status)))
 const winner=responses.findIndex(r=>r.status===200),active=(await login(created.data.item.username,bodies[winner].newPassword)).cookie
 const saved=(await http('/api/auth/profile',{cookie:active})).data.item
 assert.equal(saved.phone,bodies[winner].phone);assert.deepEqual(saved.departmentIds,bodies[winner].departmentIds)
 assert.equal((await http('/api/auth/me',{cookie})).status,401)
})
test('Admin edits contact/name/username and applies engineer role aliases without exposing credentials',async()=>{
 const updated=await http('/api/admin/users/'+other.id,{cookie:adminCookie,method:'PATCH',body:{fullName:'Updated Fictional Name',username:'updated-'+suffix,phone:'01222222222',departmentIds:[departments[1]]}})
 assert.equal(updated.status,200);assert.equal(updated.data.item.phone,'01222222222');assert.deepEqual(updated.data.item.departmentIds,[departments[1]]);assert.ok(!JSON.stringify(updated.data).includes('password_hash'))
 assert.equal((await http('/api/admin/users/'+other.id,{cookie:managerCookie,method:'PATCH',body:{fullName:'Unauthorized'}})).status,403)
 const role=await http('/api/admin/users/'+other.id+'/role-change',{cookie:adminCookie,method:'POST',body:{role:'engineer',reason:'Fictional requested change'}});assert.equal(role.status,200);assert.equal(role.data.item.role,'technician')
 const self=await http('/api/admin/users/'+admin.id+'/role-change',{cookie:adminCookie,method:'POST',body:{role:'manager',reason:'Forbidden self escalation'}});assert.equal(self.status,403)
 assert.equal((await http('/api/tickets/'+ticket.id,{cookie:managerCookie})).data.item.reporterName,employee.fullName)
})
test('new usernames cannot collide with legacy staff login identifiers across administration paths',async()=>{
 const legacyId=randomUUID(),legacyUsername='legacy-'+suffix;accounts.push(legacyId)
 await pool.execute("INSERT INTO users(id,email,full_name,role,is_active,created_at,updated_at) VALUES(?,?,?,'technician',FALSE,NOW(3),NOW(3))",[legacyId,legacyUsername,'Fictional legacy staff'])
 assert.equal((await http('/api/admin/users',{cookie:adminCookie,method:'POST',body:{username:legacyUsername,fullName:'Duplicate identity',role:'employee'}})).status,409)
 assert.equal((await http('/api/admin/users/'+other.id,{cookie:adminCookie,method:'PATCH',body:{username:legacyUsername}})).status,409)
 const staff=createMySqlItUserRepository(pool)
 await assert.rejects(staff.create({email:employee.username,fullName:'Duplicate staff identity',role:'technician',isActive:true},{id:manager.id,role:'manager'}),{status:409})
 const created=await staff.create({email:'new-staff-'+suffix,fullName:'Fictional new staff',role:'technician',isActive:true},{id:manager.id,role:'manager'});accounts.push(created.id)
 assert.equal(created.username,'new-staff-'+suffix)
 assert.equal((await http('/api/admin/users',{cookie:adminCookie,method:'POST',body:{username:created.username,fullName:'Duplicate identity',role:'employee'}})).status,409)
})
test('roster replacement is reviewed, duplicate-safe, atomic and retires only receipt-mapped directory rows',async()=>{
 const old=randomUUID(),unrelated=randomUUID();directoryIds.push(old,unrelated)
 for(const id of directoryIds)await pool.execute('INSERT INTO employee_directory(id,full_name,department_id,is_active,created_by_account_id,created_at,updated_at) VALUES(?,?,?,TRUE,?,NOW(3),NOW(3))',[id,'Fictional old directory '+id,departments[0],admin.id])
 const rows=[{username:'roster-a-'+suffix,fullName:'Fictional Imported A'},{username:'roster-b-'+suffix,fullName:'Fictional Imported B'}]
 const sourceSha256=createHash('sha256').update(JSON.stringify(rows)).digest('hex');batches.push(sourceSha256)
 const request={rows,sourceSha256,actorId:admin.id,retireReceipt:{applied:true,loginMappingApplied:false,actorId:admin.id,mappings:[{id:old}]}}
 assert.throws(()=>rosterRows([rows[0],{...rows[0],username:rows[0].username.toUpperCase()}]))
 assert.throws(()=>rosterRows([{...rows[0],department:'unexpected'}]))
 const dry=await importUserRoster(pool,request);assert.equal(dry.created,2);assert.equal(dry.retiredDirectory,1)
 const [[before]]=await pool.execute('SELECT COUNT(*) n FROM users WHERE roster_source_sha256=?',[sourceSha256]);assert.equal(before.n,0)
 const results=await Promise.all([importUserRoster(pool,{...request,apply:true}),importUserRoster(pool,{...request,apply:true})]);assert.deepEqual(results.map(r=>r.created).sort(),[0,2])
 const [saved]=await pool.execute('SELECT * FROM users WHERE roster_source_sha256=?',[sourceSha256]);for(const row of saved){accounts.push(row.id);assert.equal(row.must_change_password,1);assert.equal(row.must_complete_profile,1);assert.equal(await verifyPassword(row.password_hash,'123'),true)}assert.notEqual(saved[0].password_hash,saved[1].password_hash)
 assert.equal((await importUserRoster(pool,{...request,apply:true})).unchanged,2)
 const [[retired]]=await pool.execute('SELECT is_active FROM employee_directory WHERE id=?',[old]);assert.equal(retired.is_active,0)
 const [[kept]]=await pool.execute('SELECT is_active FROM employee_directory WHERE id=?',[unrelated]);assert.equal(kept.is_active,1)
 await assert.rejects(importUserRoster(pool,{...request,rows:[{username:employee.username,fullName:'Conflict'}],sourceSha256:'a'.repeat(64),apply:true}),{status:409})
 await assert.rejects(importUserRoster(pool,{...request,actorId:manager.id,apply:true}),{status:403})
 const [[profile]]=await pool.execute('SELECT phone FROM users WHERE id=?',[employee.id]);assert.equal(profile.phone,'01111111111')
})
