import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {testEnvironment} from '../support/database.js'
import {createPool} from '../../src/db/pool.js'
import {createMySqlUserRepository} from '../../src/repositories/mysqlUserRepository.js'
import {createMySqlSessionRepository} from '../../src/repositories/mysqlSessionRepository.js'
import {createLocalPasswordProvider} from '../../src/auth/localPasswordProvider.js'
import {createAuthService} from '../../src/auth/authService.js'
import {createLocalAccountService} from '../support/accounts.js'
import {createAdministrationRepository} from '../../src/administration/repository.js'
import {createApp} from '../../src/app.js'
import {verifyPassword} from '../../src/auth/passwords.js'
import {accountCreate} from '../../src/administration/validation.js'
import {createProfileRepository} from '../../src/auth/profiles.js'

const origin='http://localhost:5173',ids=[],adminPassword='Fictional-Admin-Only-Password-42'
let pool,repo,server,url,admin,adminCookie,username,id,departmentId
async function request(path,{method='GET',body,cookie}={}){
 const response=await fetch(url+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
}
before(async()=>{
 const e=await testEnvironment();pool=createPool({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD})
 const users=createMySqlUserRepository(pool),provider=await createLocalPasswordProvider(users)
 admin=await createLocalAccountService(users).create({email:`first-${randomUUID()}@demo.example`,fullName:'Fictional Admin',role:'admin',password:adminPassword});ids.push(admin.id)
 repo=createAdministrationRepository(pool)
 departmentId=randomUUID();await pool.execute('INSERT INTO departments(id,name,is_active,created_at,updated_at) VALUES(?,?,TRUE,NOW(3),NOW(3))',[departmentId,'First-login fixture '+departmentId])
 const authService=createAuthService({provider,sessions:createMySqlSessionRepository(pool)})
 server=createApp({authService,administrationRepository:repo,profileRepository:createProfileRepository(pool),config:{appOrigin:origin,nodeEnv:'test'}}).listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${server.address().port}`
 adminCookie=(await request('/api/auth/login',{method:'POST',body:{email:admin.email,password:adminPassword}})).cookie
})
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve))
 if(pool){for(const accountId of ids){await pool.execute('DELETE FROM admin_audit WHERE actor_id=? OR entity_id=?',[accountId,accountId]);await pool.execute('DELETE FROM users WHERE id=?',[accountId])}if(departmentId)await pool.execute('DELETE FROM departments WHERE id=?',[departmentId]);await pool.end()}
})
test('username provisioning hashes the initial password and exposes only password status',async()=>{
 username=`fixture first ${randomUUID()}`
 const created=await request('/api/admin/users',{method:'POST',cookie:adminCookie,body:{username,fullName:'Fictional Employee',role:'employee'}})
 assert.equal(created.status,201);id=created.body.item.id;ids.push(id)
 assert.equal(created.body.item.mustChangePassword,true);assert.equal(created.body.item.passwordStatus,'CHANGE_REQUIRED')
 assert.ok(!JSON.stringify(created.body).includes('password_hash'))
 const [[row]]=await pool.execute('SELECT * FROM users WHERE id=?',[id]);assert.notEqual(row.password_hash,'123');assert.match(row.password_hash,/^\$argon2id\$/);assert.equal(await verifyPassword(row.password_hash,'123'),true)
 assert.equal((await request('/api/admin/users',{method:'POST',cookie:adminCookie,body:{username,fullName:'Duplicate Fictional',role:'employee'}})).status,409)
 const list=await request(`/api/admin/users?search=${username}`,{cookie:adminCookie});assert.equal(list.body.total,1);assert.equal(list.body.items[0].username,username)
 assert.throws(()=>accountCreate({username:'not@an-email',fullName:'Fictional',role:'employee'}))
})
test('first-login session restores its flag, blocks all application APIs and cannot skip password change',async()=>{
 const login=await request('/api/auth/login',{method:'POST',body:{username,password:'123'}});assert.equal(login.status,200);assert.equal(login.body.user.mustChangePassword,true)
 assert.equal((await request('/api/auth/me',{cookie:login.cookie})).body.user.mustChangePassword,true)
 for(const path of ['/api/tickets','/api/assets','/api/admin/users','/api/notifications','/api/dashboard']){const r=await request(path,{cookie:login.cookie});assert.equal(r.status,403);assert.equal(r.body.code,'PASSWORD_CHANGE_REQUIRED')}
 assert.equal((await request('/api/auth/change-password',{method:'POST',cookie:login.cookie,body:{currentPassword:'wrong',newPassword:'new-fictional'}})).status,401)
 assert.equal((await request('/api/auth/change-password',{method:'POST',cookie:login.cookie,body:{currentPassword:'123',newPassword:'123'}})).status,400)
 assert.equal((await request('/api/auth/change-password',{method:'POST',cookie:login.cookie,body:{currentPassword:'123',newPassword:'new-fictional'}})).status,403)
 const changed=await request('/api/auth/complete-setup',{method:'POST',cookie:login.cookie,body:{currentPassword:'123',newPassword:'new-fictional',phone:'01000000000',departmentIds:[departmentId]}})
 assert.equal(changed.status,200);assert.equal(changed.body.loginRequired,true)
 assert.equal((await request('/api/auth/me',{cookie:login.cookie})).status,401)
 assert.equal((await request('/api/auth/login',{method:'POST',body:{username,password:'123'}})).status,401)
 const next=await request('/api/auth/login',{method:'POST',body:{username,password:'new-fictional'}});assert.equal(next.status,200);assert.equal(next.body.user.mustChangePassword,false)
 const reset=await request(`/api/admin/users/${id}/reset-temporary-password`,{method:'POST',cookie:adminCookie,body:{}});assert.equal(reset.status,200)
 assert.equal((await request('/api/auth/me',{cookie:next.cookie})).status,401)
 assert.equal((await request('/api/auth/login',{method:'POST',body:{username,password:'123'}})).body.user.mustChangePassword,true)
 assert.equal((await request(`/api/admin/users/${admin.id}/reset-temporary-password`,{method:'POST',cookie:adminCookie,body:{}})).status,403)
})
test('reset retains inactive status and denies non-admin actors',async()=>{
 await pool.execute('UPDATE users SET is_active=FALSE WHERE id=?',[id])
 await repo.resetTemporaryPassword(id,{id:admin.id,role:'admin'})
 assert.equal((await request('/api/auth/login',{method:'POST',body:{username,password:'123'}})).status,401)
 for(const role of ['employee','technician','manager'])await assert.rejects(repo.resetTemporaryPassword(id,{id,role}),{status:403})
})
