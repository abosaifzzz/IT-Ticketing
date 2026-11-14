import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID,randomBytes} from 'node:crypto'
import {once} from 'node:events'
import {testEnvironment} from '../support/database.js'
import {createPool} from '../../src/db/pool.js'
import {createMySqlUserRepository} from '../../src/repositories/mysqlUserRepository.js'
import {createMySqlSessionRepository} from '../../src/repositories/mysqlSessionRepository.js'
import {createMySqlEmployeeDirectoryRepository} from '../../src/repositories/mysqlEmployeeDirectoryRepository.js'
import {createMySqlReferenceRepository} from '../../src/repositories/mysqlReferenceRepository.js'
import {createLocalAccountService} from '../../src/auth/localAccountService.js'
import {createLocalPasswordProvider} from '../../src/auth/localPasswordProvider.js'
import {createAuthService} from '../../src/auth/authService.js'
import {createApp} from '../../src/app.js'

const suffix=randomUUID(),password='Fictional-'+randomBytes(24).toString('hex'),origin='http://localhost:5173'
const accounts={},cookies={},departments=[],created=[]
let pool,server,url,repository,auth
before(async()=>{
 const e=await testEnvironment()
 pool=createPool({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD})
 await pool.query('SELECT id FROM employee_directory LIMIT 0')
 const users=createMySqlUserRepository(pool),provision=createLocalAccountService(users)
 for(const role of ['employee','technician','manager'])accounts[role]=await provision.create({email:'directory-'+role+'-'+suffix+'@demo.example',fullName:'Fictional '+role,role,password})
 const references=createMySqlReferenceRepository(pool,'departments')
 departments.push(await references.save({name:'Fictional active '+suffix,isActive:true}))
 departments.push(await references.save({name:'Fictional inactive '+suffix,isActive:false}))
 repository=createMySqlEmployeeDirectoryRepository(pool)
 auth=createAuthService({provider:await createLocalPasswordProvider(users),sessions:createMySqlSessionRepository(pool)})
 const managementRepositories={departments:references,categories:createMySqlReferenceRepository(pool,'categories'),subcategories:createMySqlReferenceRepository(pool,'subcategories'),employees:repository}
 server=createApp({authService:auth,managementRepositories,config:{nodeEnv:'test',appOrigin:origin}}).listen(0,'127.0.0.1');await once(server,'listening');url='http://127.0.0.1:'+server.address().port
 for(const role of Object.keys(accounts)){
  const response=await fetch(url+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:accounts[role].email,password})})
  assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie').split(';')[0]
 }
})
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve))
 if(pool)try{
  for(const account of Object.values(accounts))await pool.execute('DELETE FROM employee_directory WHERE created_by_account_id=?',[account.id])
  for(const department of departments)await pool.execute('DELETE FROM departments WHERE id=?',[department.id])
  for(const account of Object.values(accounts))await pool.execute('DELETE FROM users WHERE id=?',[account.id])
 }finally{await pool.end()}
})
const request=(path='',{role='manager',method='GET',body,requestOrigin=origin}={})=>fetch(url+'/api/employees'+path,{method,headers:{...(cookies[role]?{Cookie:cookies[role]}:{}),...(requestOrigin?{Origin:requestOrigin}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
const input=(number='ONE')=>({fullName:'Fictional directory '+suffix+' '+number,departmentId:departments[0].id})
test('employee directory denies unauthenticated and employee-role reads/writes',async()=>{
 for(const role of ['anonymous','employee'])for(const method of ['GET','POST'])assert.equal((await request('',{role,method,...(method==='POST'?{body:input()}:{})})).status,role==='anonymous'?401:403)
})
test('both IT roles create directory records without creating login accounts; response shape persists',async()=>{
 const [[before]]=await pool.query('SELECT COUNT(*) n FROM users')
 for(const role of ['manager','technician']){
  const response=await request('',{role,method:'POST',body:input(role)});assert.equal(response.status,201)
  const {item}=await response.json();created.push(item);assert.equal(item.employeeNumber,undefined);assert.equal(item.departmentId,departments[0].id);assert.equal(item.createdByAccountId,accounts[role].id)
  assert.ok(item.departmentName);assert.equal(item.isActive,true);for(const field of ['password','passwordHash','username','email'])assert.equal(item[field],undefined)
 }
 const [[after]]=await pool.query('SELECT COUNT(*) n FROM users');assert.equal(after.n,before.n)
 const fresh=createMySqlEmployeeDirectoryRepository(pool),saved=await fresh.list(suffix,1)
 assert.equal(saved.total,2);assert.deepEqual(Object.keys(saved).sort(),['items','page','pageSize','total']);assert.equal(saved.pageSize,25)
})
test('directory lists, name searches, literal wildcards, deterministic pagination and out-of-range pages',async()=>{
 for(let i=0;i<27;i++)created.push(await repository.create(input('PAGE-'+String(i).padStart(2,'0')),accounts.manager))
 created.push(await repository.create({...input('LITERAL'),fullName:'Fictional 100%_ literal '+suffix},accounts.manager))
 for(const role of ['manager','technician']){
  const first=await(await request('?search='+suffix+'&page=1',{role})).json(),second=await(await request('?search='+suffix+'&page=2',{role})).json()
  assert.equal(first.total,30);assert.equal(first.items.length,25);assert.equal(second.items.length,5);assert.equal(first.page,1);assert.equal(second.page,2)
  assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,30)
  const repeated=await(await request('?search='+suffix+'&page=1',{role})).json();assert.deepEqual(first.items.map(item=>item.id),repeated.items.map(item=>item.id))
 }
 const name=await repository.list('100%_ literal '+suffix);assert.equal(name.total,1)
 const number=await repository.list(input('PAGE-01').fullName);assert.equal(number.total,1)
 assert.equal((await repository.list('missing-'+suffix)).total,0)
 const out=await repository.list(suffix,99999);assert.equal(out.total,30);assert.equal(out.items.length,0)
})
test('authenticated employee options expose minimal fields, search and all pages without administration access',async()=>{
 const response=await fetch(url+'/api/employee-options?search='+suffix,{headers:{Cookie:cookies.employee}})
 assert.equal(response.status,200)
 const first=await response.json();assert.equal(first.total,30);assert.equal(first.items.length,25)
 assert.deepEqual(Object.keys(first.items[0]).sort(),['departmentId','departmentName','fullName','id'])
 const second=await(await fetch(url+'/api/employee-options?search='+suffix+'&page=2',{headers:{Cookie:cookies.employee}})).json();assert.equal(second.items.length,5)
 assert.equal((await fetch(url+'/api/employee-options')).status,401)
 assert.equal((await fetch(url+'/api/employee-options?page=0',{headers:{Cookie:cookies.employee}})).status,400)
 await pool.execute('UPDATE departments SET is_active=FALSE WHERE id=?',[departments[0].id])
 try {assert.equal((await(await fetch(url+'/api/employee-options?search='+suffix,{headers:{Cookie:cookies.employee}})).json()).total,0)}
 finally {await pool.execute('UPDATE departments SET is_active=TRUE WHERE id=?',[departments[0].id])}
})

test('same names remain separate directory identities and cancelled codes are rejected',async()=>{
 const replies=await Promise.all([request('',{method:'POST',body:input('RACE')}),request('',{role:'technician',method:'POST',body:input('RACE')})])
 assert.deepEqual(replies.map(response=>response.status),[201,201])
 const items=await Promise.all(replies.map(response=>response.json()));assert.notEqual(items[0].item.id,items[1].item.id)
 assert.equal((await repository.list(input('RACE').fullName)).total,2)
 assert.equal((await request('',{method:'POST',body:{...input(),employeeNumber:'CANCELLED'}})).status,400)
})

test('inactive/missing departments and unsupported fields are rejected; existing department history remains readable',async()=>{
 for(const body of [{...input('BAD'),departmentId:departments[1].id},{...input('BAD'),departmentId:randomUUID()},{...input('BAD'),employeeNumber:''},{...input('BAD'),fullName:'x'},{...input('BAD'),password:'forbidden'},{...input('BAD'),role:'employee'}])assert.equal((await request('',{method:'POST',body})).status,400)
 await pool.execute('UPDATE departments SET is_active=FALSE WHERE id=?',[departments[0].id])
 assert.equal((await request('',{method:'POST',body:input('INACTIVE')})).status,400)
 assert.equal((await repository.list(input('manager').fullName)).items[0].departmentId,departments[0].id)
 await pool.execute('UPDATE departments SET is_active=TRUE WHERE id=?',[departments[0].id])
})
test('query validation, origin checks and deactivation are enforced by the live API',async()=>{
 for(const query of ['?page=0','?page=-1','?page=1.5','?page=100000','?page=1&page=2','?search=a&search=b','?accountId='+accounts.employee.id,'?search='+('a'.repeat(201))])assert.equal((await request(query)).status,400)
 for(const requestOrigin of [null,'https://untrusted.example'])assert.equal((await request('',{method:'POST',body:input('CSRF'),requestOrigin})).status,403)
 await pool.execute('UPDATE users SET is_active=FALSE WHERE id=?',[accounts.technician.id])
 assert.equal((await request('',{role:'technician'})).status,401)
 assert.equal((await request('',{role:'technician',method:'POST',body:input('BLOCKED')})).status,401)
 assert.equal(await auth.getUser('forged'),null)
})
