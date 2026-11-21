import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {adminPermissions,operationalPermissions,requiredPermissions,requireAdminIdentity,strongAdminPassword} from '../src/administration/policy.js'
import {permissionInput,accountCreate,accountUpdate,settingInput,roleChangeInput} from '../src/administration/validation.js'
import {sanitize} from '../src/administration/audit.js'
import {createMonitoring} from '../src/administration/monitoring.js'
import {createBackupService} from '../src/administration/backups.js'
import {createAuthService,hashSessionToken} from '../src/auth/authService.js'

test('administration is independent from every operational role and denies permission escalation',()=>{
 assert.doesNotThrow(()=>requireAdminIdentity({role:'admin'}))
 for(const role of ['employee','technician','manager',undefined,'ADMIN'])assert.throws(()=>requireAdminIdentity({role}),{status:403})
 assert.ok(adminPermissions.every(p=>p.startsWith('admin.')))
 assert.ok(Object.values(operationalPermissions).flat().every(p=>!adminPermissions.includes(p)))
 const allowed=adminPermissions.filter(p=>p!=='admin.backups.restore')
 assert.equal(permissionInput({permissions:allowed},'admin').length,allowed.length)
 for(const added of ['assets.full','*','tickets.assign','admin.backups.restore'])assert.throws(()=>permissionInput({permissions:[...allowed,added]},'admin'),{status:403})
 assert.throws(()=>permissionInput({permissions:allowed},'manager'),{status:403})
 assert.throws(()=>permissionInput({permissions:allowed.filter(p=>p!==requiredPermissions[0])},'admin'),{status:409})
 assert.throws(()=>accountCreate({email:'fictional@demo.example',fullName:'Fictional account',role:['admin','manager']}),{status:400})
})
test('admin password policy is strong without changing ordinary account password rules',()=>{
 assert.equal(strongAdminPassword('Long-fictional-passphrase-01'),true)
 for(const password of ['', 'short',' leading-password-123456', 'password-123456789\n', 'x'.repeat(1025)])assert.equal(strongAdminPassword(password),false)
})
test('direct role change input validates the target role and a private Admin promotion password',()=>{
 assert.deepEqual(roleChangeInput({role:'engineer',reason:'Fictional appointment'}),{role:'technician',reason:'Fictional appointment'})
 assert.deepEqual(roleChangeInput({role:'admin',reason:'Fictional promotion',adminPassword:'Long-fictional-passphrase-01'}),{role:'admin',reason:'Fictional promotion',adminPassword:'Long-fictional-passphrase-01'})
 assert.throws(()=>roleChangeInput({role:'admin',reason:'Fictional promotion'}),{status:400})
 assert.throws(()=>roleChangeInput({role:'admin',reason:'Fictional promotion',adminPassword:'123'}),{status:400})
 assert.throws(()=>roleChangeInput({role:'manager',reason:'Fictional appointment',adminPassword:'not-allowed'}),{status:400})
})
test('one account update validates combined profile, state and role changes',()=>{
 const departmentId=randomUUID()
 assert.deepEqual(accountUpdate({fullName:'Fictional User',isActive:false,phone:'01000000000',departmentIds:[departmentId],role:'engineer',reason:'Fictional reassignment'}),{
  fullName:'Fictional User',isActive:false,profile:{phone:'01000000000',departmentIds:[departmentId]},roleChange:{role:'technician',reason:'Fictional reassignment'},
 })
 assert.throws(()=>accountUpdate({role:'manager'}),{status:400})
 assert.throws(()=>accountUpdate({reason:'No role'}),{status:400})
})
test('settings reject secrets, unknown keys and weakening administrative session boundaries',()=>{
 assert.throws(()=>settingInput('authentication',{expectedVersion:0,values:{adminSessionMinutes:1440,recentAuthenticationMinutes:30}}),{status:400})
 assert.throws(()=>settingInput('application',{expectedVersion:0,values:{supportEmail:'',defaultPageSize:25,dbPassword:'never-accepted'}}),{status:400})
 assert.equal(settingInput('authentication',{expectedVersion:0,values:{adminSessionMinutes:15,recentAuthenticationMinutes:2}}).values.adminSessionMinutes,15)
})
test('audit and monitoring never retain credential fields, raw errors or stack traces',()=>{
 const result=sanitize({role:'admin',password:'do-not-log',password_hash:'do-not-log',nested:{sessionToken:'do-not-log',secret:'do-not-log',enabled:true}})
 assert.deepEqual(result,{role:'admin',nested:{enabled:true}})
 const monitor=createMonitoring();monitor.error({message:'do-not-log',stack:'do-not-log',sql:'do-not-log',code:'UNKNOWN_SENSITIVE_ERROR'},{method:'POST'})
 const body=JSON.stringify(monitor.errors());assert.ok(!body.includes('do-not-log'));assert.ok(!body.includes('UNKNOWN_SENSITIVE_ERROR'))
 for(let i=0;i<220;i++)monitor.error({}, {method:'GET'})
 assert.equal(monitor.errors().total,200)
 assert.equal(createBackupService({pool:{}}).capabilities().restore,false)
})
test('administrative sessions have short TTL and explicit recent-auth context; logout revokes tokens',async()=>{
 const records=new Map(),user={id:randomUUID(),email:'admin@demo.example',full_name:'Fictional Admin',role:'admin',is_active:true,admin_password_verified:true}
 const sessions={async create(row){records.set(row.tokenHash,{...row,session_created_at:new Date()});return true},async findUserByTokenHash(hash){const r=records.get(hash);return r?{...user,expires_at:r.expiresAt,session_created_at:r.session_created_at}:null},async delete(hash){records.delete(hash)}}
 const auth=createAuthService({provider:{async authenticate(){return user}},sessions})
 const session=await auth.login({});assert.ok(session.expiresAt.getTime()-Date.now()<=30*60000)
 assert.equal((await auth.getSessionInfo(session.token)).user.role,'admin')
 records.get(hashSessionToken(session.token)).session_created_at=new Date(Date.now()-31*60000)
 assert.equal(await auth.getUser(session.token),null)
 assert.equal(records.size,0)
})
