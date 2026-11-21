import {randomUUID} from 'node:crypto'
import {ApiError} from '../management/validation.js'
import {requireAdminIdentity,adminPermissions,operationalPermissions,requireStrongAdminPassword} from './policy.js'
import {recordAudit,decode,operationalAudit} from './audit.js'
import {filters,bad,uuid,permissionInput} from './validation.js'
import {hashPassword} from '../auth/passwords.js'
import {readProfile,saveDepartments} from '../auth/profiles.js'

const account=row=>({id:row.id,email:row.email,username:row.username??row.email,phone:row.phone??null,mustCompleteProfile:Boolean(row.must_complete_profile),mustChangePassword:Boolean(row.must_change_password),passwordStatus:!row.password_hash?'NOT_PROVISIONED':row.must_change_password?'CHANGE_REQUIRED':'SET',fullName:row.full_name,role:row.role,isActive:Boolean(row.is_active),authProvider:row.auth_provider,
 lastLoginAt:row.last_login_at,createdAt:row.created_at,updatedAt:row.updated_at,provisioningRequired:row.auth_provider==='local'&&!row.password_hash})
const columns='id,email,username,must_change_password,must_complete_profile,phone,full_name,role,is_active,auth_provider,last_login_at,created_at,updated_at,password_hash,password_changed_at,admin_password_verified'
const publicRequest=row=>({id:row.id,type:row.type,targetId:row.target_id,requestedBy:row.requested_by,requestedRole:row.requested_role,status:row.status,reason:row.reason,createdAt:row.created_at,expiresAt:row.expires_at})
export async function guard(c){await c.execute('SELECT id FROM admin_guard WHERE id=1 FOR UPDATE')}
export async function lastAdmin(c,target,nextRole,nextActive) {
 if(target.role!=='admin'||!target.is_active||nextRole==='admin'&&nextActive)return
 const [rows]=await c.query("SELECT id FROM users WHERE role='admin' AND is_active=TRUE ORDER BY id FOR UPDATE")
 if(rows.length<=1)bad('The last active administrator must remain active',409)
}
export function createAdministrationRepository(pool) {
 async function permission(c,actor,name) {
  requireAdminIdentity(actor)
  if(!adminPermissions.includes(name))bad('Unknown administrative permission',403)
  const [[current]]=await c.execute('SELECT role,is_active FROM users WHERE id=? FOR SHARE',[actor.id])
  if(!current?.is_active||current.role!=='admin')bad('Administrative access required',403)
  const [[grant]]=await c.execute("SELECT enabled FROM admin_role_permissions WHERE role='admin' AND permission=? FOR SHARE",[name])
  if(!grant?.enabled)bad('Administrative permission denied',403)
 }
 async function mutate(actor,name,action,entityId,ip,run) {
  for(let attempt=0;attempt<3;attempt++){
   const c=await pool.getConnection()
   try{
    await c.beginTransaction();await guard(c);await permission(c,actor,name)
    const change=await run(c)
    await recordAudit(c,{actor,action,module:action.split('.')[0],entityId,before:change.before,after:change.after,ip})
    await c.commit();return change.result
   }catch(error){
    await c.rollback()
    if(error.code==='ER_LOCK_DEADLOCK'&&attempt<2)continue
    await recordAudit(pool,{actor,action,module:action.split('.')[0],entityId,status:'FAILURE',after:{status:error.status??500},ip}).catch(()=>{})
    if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code))throw new ApiError(409,'Concurrent administration change; retry')
    throw error
   }finally{c.release()}
  }
 }
 async function target(c,id){const [[row]]=await c.execute('SELECT '+columns+' FROM users WHERE id=? FOR UPDATE',[id]);if(!row)bad('Account not found',404);return row}
 async function applyRoleChange(c,id,old,input,actor){
  if(id===actor.id)bad('Administrators cannot change their own role',403)
  if(old.role===input.role)bad('Role is unchanged',409)
  await lastAdmin(c,old,input.role,Boolean(old.is_active))
  if(input.role==='admin'&&old.auth_provider!=='local')bad('Admin promotion requires a local account',409)
  if(input.role==='admin')requireStrongAdminPassword(input.adminPassword)
  const promoting=input.role==='admin'
  const passwordHash=promoting?await hashPassword(input.adminPassword):old.password_hash
  const mustCompleteProfile=promoting?false:old.role==='admin'?true:Boolean(old.must_complete_profile)
  const mustChangePassword=promoting?false:old.role==='admin'?true:Boolean(old.must_change_password)
  await c.execute('UPDATE users SET role=?,password_hash=?,admin_password_verified=?,must_change_password=?,must_complete_profile=?,password_changed_at=?,updated_at=? WHERE id=?',[
   input.role,passwordHash,promoting,mustChangePassword,mustCompleteProfile,promoting?new Date():old.password_changed_at,new Date(),id,
  ])
  await c.execute('DELETE FROM auth_sessions WHERE user_id=?',[id])
  await c.execute("UPDATE admin_requests SET status='CANCELLED',completed_at=? WHERE target_id=? AND status='PENDING'",[new Date(),id])
 }
 async function paginated(table,where,values,f,projection='*',order='created_at DESC,id DESC'){
  const clause=where.length?' WHERE '+where.join(' AND '):''
  const [[count]]=await pool.execute('SELECT COUNT(*) n FROM '+table+clause,values)
  const [items]=await pool.query('SELECT '+projection+' FROM '+table+clause+' ORDER BY '+order+' LIMIT ? OFFSET ?',[...values,f.pageSize,(f.page-1)*f.pageSize])
  return {items,total:Number(count.n),page:f.page,pageSize:f.pageSize}
 }
 return {
  pool,permission:(actor,name)=>permission(pool,actor,name),
  audit:entry=>recordAudit(pool,entry),
  async runtimePolicy(){const [rows]=await pool.query("SELECT section,settings_data FROM admin_settings WHERE section IN ('authentication','maintenance')");return Object.fromEntries(rows.map(r=>[r.section,decode(r.settings_data)]))},
  async listUsers(query,actor){
   await permission(pool,actor,'admin.users.read');const f=filters(query,['role','isActive']),where=[],values=[]
   if(f.role){if(f.role==='engineer')f.role='technician';if(!['employee','technician','manager','admin'].includes(f.role))bad();where.push('role=?');values.push(f.role)}
   if(f.isActive!==undefined){if(!['true','false'].includes(f.isActive))bad();where.push('is_active=?');values.push(f.isActive==='true')}
   if(f.search){where.push('(LOCATE(?,email)>0 OR LOCATE(?,full_name)>0 OR LOCATE(?,username)>0)');values.push(f.search,f.search,f.search)}
   if(f.from){where.push('created_at>=?');values.push(f.from)}if(f.to){where.push('created_at<DATE_ADD(?,INTERVAL 1 DAY)');values.push(f.to)}
   const result=await paginated('users',where,values,f,columns);result.items=await Promise.all(result.items.map(async row=>({...account(row),...await readProfile(pool,row.id)})));return result
  },
  async getUser(id,actor){await permission(pool,actor,'admin.users.read');const [[row]]=await pool.execute('SELECT '+columns+' FROM users WHERE id=?',[id]);if(!row)bad('Account not found',404);return {...account(row),...await readProfile(pool,id)}},
  async createUser(input,actor,ip){const id=randomUUID();return mutate(actor,'admin.users.create','users.create',id,ip,async c=>{
   const now=new Date()
   const temporary=Boolean(input.username)&&input.role!=='admin'
   if(input.username){const [[collision]]=await c.execute('SELECT id FROM users WHERE email=? OR username=? LIMIT 1',[input.username,input.username]);if(collision)bad('Username already exists',409)}
   await c.execute("INSERT INTO users(id,email,username,full_name,role,auth_provider,password_hash,is_active,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,'local',?,?,?,?,?)",[id,input.email,input.username??null,input.fullName,input.role,temporary?await hashPassword('123'):null,temporary,temporary,now,now])
   await c.execute('UPDATE users SET must_complete_profile=? WHERE id=?',[input.role!=='admin',id])
   const after=account(await target(c,id));return {before:null,after,result:after}
  })},
  async resetTemporaryPassword(id,actor,ip){
   const hash=await hashPassword('123')
   return mutate(actor,'admin.users.reset_password','users.temporary_reset',id,ip,async c=>{
    const old=await target(c,id)
    if(old.role==='admin')bad('Use protected administrator recovery',403)
    if(old.auth_provider!=='local')bad('Use the external identity provider',409)
    await c.execute('UPDATE users SET password_hash=?,must_change_password=TRUE,password_changed_at=NULL,updated_at=? WHERE id=?',[hash,new Date(),id])
    await c.execute('DELETE FROM auth_sessions WHERE user_id=?',[id])
    return {before:{role:old.role},after:{requiresChange:true,sessionsRevoked:true},result:{id,mustChangePassword:true,sessionsRevoked:true}}
   })
  },
  async updateUser(id,input,actor,ip){return mutate(actor,'admin.users.update','users.update',id,ip,async c=>{
   const old=await target(c,id),active=input.isActive??Boolean(old.is_active)
   if(old.is_active&&!active)await permission(c,actor,'admin.users.disable')
   await lastAdmin(c,old,input.roleChange?.role??old.role,active)
   if(active&&(input.roleChange?.role??old.role)==='admin'&&!input.roleChange&&(!old.password_hash||!old.admin_password_verified))bad('Provision a strong administrator password privately before activation',409)
   if(input.roleChange)await applyRoleChange(c,id,old,input.roleChange,actor)
   await c.execute('UPDATE users SET full_name=?,is_active=?,updated_at=? WHERE id=?',[input.fullName??old.full_name,active,new Date(),id])
   if(input.username!==undefined){
    const [[collision]]=await c.execute('SELECT id FROM users WHERE id<>? AND (email=? OR username=?) LIMIT 1',[id,input.username,input.username])
    if(collision)bad('Username already exists',409)
    await c.execute('UPDATE users SET username=? WHERE id=?',[input.username,id])
   }
   if(input.profile){await saveDepartments(c,id,input.profile.departmentIds);await c.execute('UPDATE users SET phone=?,profile_completed_at=NOW(3),must_complete_profile=FALSE WHERE id=?',[input.profile.phone,id])}
   if(input.isActive!==undefined||input.username!==undefined||input.profile)await c.execute('DELETE FROM auth_sessions WHERE user_id=?',[id])
   const after={...account(await target(c,id)),...await readProfile(c,id)};return {before:account(old),after:{...after,...(input.roleChange?{roleChangeReason:input.roleChange.reason}: {})},result:after}
  })},
  async changeRole(id,input,actor,ip){return mutate(actor,'admin.users.update','users.role_change',id,ip,async c=>{
   const old=await target(c,id)
   await applyRoleChange(c,id,old,input,actor)
   const after={...account(await target(c,id)),...await readProfile(c,id)}
   return {before:{role:old.role},after:{role:after.role,reason:input.reason,sessionsRevoked:true},result:after}
  })},
  async request(id,type,input,actor,ip){return mutate(actor,type==='ROLE_CHANGE'?'admin.users.update':'admin.users.reset_password',type==='ROLE_CHANGE'?'users.role_change.request':'users.password_reset.request',id,ip,async c=>{
   const old=await target(c,id)
   if(type==='ROLE_CHANGE'){
    if(id===actor.id)bad('Administrators cannot change their own role',403)
    if(old.role===input.role)bad('Role is unchanged',409)
    await lastAdmin(c,old,input.role,Boolean(old.is_active))
   }else if(old.auth_provider!=='local')bad('External identity credentials must be reset by their provider',409)
   const [[pending]]=await c.execute("SELECT id FROM admin_requests WHERE target_id=? AND type=? AND status='PENDING' AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",[id,type])
   if(pending)bad('A live request already exists',409)
   const row={id:randomUUID(),type,target_id:id,requested_by:actor.id,expected_role:old.role,requested_role:input.role??null,reason:input.reason,status:'PENDING',created_at:new Date(),expires_at:new Date(Date.now()+(type==='ROLE_CHANGE'?86400000:3600000))}
   await c.execute('INSERT INTO admin_requests(id,type,target_id,requested_by,expected_role,requested_role,reason,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',Object.values(row))
   const after=publicRequest(row);return {before:{role:old.role},after,result:after}
  })},
  async revokeSessions(id,actor,ip){return mutate(actor,'admin.sessions.revoke','users.sessions.revoke',id,ip,async c=>{
   await target(c,id);const [result]=await c.execute('DELETE FROM auth_sessions WHERE user_id=?',[id]);return {before:null,after:{revoked:result.affectedRows},result:{revoked:result.affectedRows}}
  })},
  async requests(query,actor){await permission(pool,actor,'admin.users.read');const f=filters(query,['status']),where=[],values=[];if(f.status){if(!['PENDING','COMPLETED','CANCELLED'].includes(f.status))bad();where.push('status=?');values.push(f.status)}const result=await paginated('admin_requests',where,values,f);result.items=result.items.map(publicRequest);return result},
  async roles(actor){
   await permission(pool,actor,'admin.roles.read');const [grants]=await pool.query("SELECT permission FROM admin_role_permissions WHERE role='admin' AND enabled=TRUE ORDER BY permission")
   return {items:[...Object.entries(operationalPermissions).map(([role,permissions])=>({role,permissions,editable:false})),{role:'admin',permissions:grants.map(row=>row.permission),editable:true}],singleRoleOnly:true,availableAdministrativePermissions:adminPermissions}
  },
  async permissions(next,actor,ip){next=permissionInput({permissions:next},'admin');return mutate(actor,'admin.permissions.manage','roles.permissions.update','admin',ip,async c=>{
   const [old]=await c.query("SELECT permission,enabled FROM admin_role_permissions WHERE role='admin' ORDER BY permission")
   for(const name of adminPermissions)await c.execute("UPDATE admin_role_permissions SET enabled=? WHERE role='admin' AND permission=?",[next.includes(name),name])
   return {before:old,after:{permissions:next},result:{role:'admin',permissions:next}}
  })},
  async settings(actor){await permission(pool,actor,'admin.settings.read');const [rows]=await pool.query('SELECT * FROM admin_settings ORDER BY section');return {items:rows.map(row=>({section:row.section,values:decode(row.settings_data),version:row.version,updatedAt:row.updated_at}))}},
  async setting(section,input,actor,ip){return mutate(actor,'admin.settings.update','settings.update',section,ip,async c=>{
   const [[old]]=await c.execute('SELECT * FROM admin_settings WHERE section=? FOR UPDATE',[section]);if(!old)bad('Setting not found',404)
   if(old.version!==input.expectedVersion)bad('Setting changed; refresh and retry',409)
   await c.execute('UPDATE admin_settings SET settings_data=?,version=version+1,updated_at=? WHERE section=?',[JSON.stringify(input.values),new Date(),section])
   const after={section,values:input.values,version:old.version+1};return {before:{values:decode(old.settings_data),version:old.version},after,result:after}
  })},
  async dashboard(actor){await permission(pool,actor,'admin.dashboard.read');const [[counts]]=await pool.query("SELECT COUNT(*) accounts,SUM(is_active=TRUE) activeAccounts,SUM(role='admin' AND is_active=TRUE) activeAdmins FROM users");const [[sessions]]=await pool.query('SELECT COUNT(*) activeSessions FROM auth_sessions WHERE expires_at>UTC_TIMESTAMP(3)');return {...Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Number(v)])),activeSessions:Number(sessions.activeSessions)}},
  async auditHistory(query,actor){
   await permission(pool,actor,'admin.audit.read');const f=filters(query,['module','actorId','actorRole','status','action']),where=[],values=[]
   if(f.search){where.push('(LOCATE(?,action)>0 OR LOCATE(?,entity_id)>0)');values.push(f.search,f.search)}
   for(const [key,column]of [['module','module'],['status','status'],['action','action']])if(f[key]){if(f[key].length>100)bad();if(key==='status'&&!['SUCCESS','FAILURE'].includes(f[key]))bad();where.push(column+'=?');values.push(f[key])}
   if(f.actorId){where.push('actor_id=?');values.push(uuid(f.actorId))}if(f.actorRole){if(!['employee','technician','manager','admin','system','unknown'].includes(f.actorRole))bad();where.push('actor_role=?');values.push(f.actorRole)}if(f.from){where.push('occurred_at>=?');values.push(f.from)}if(f.to){where.push('occurred_at<DATE_ADD(?,INTERVAL 1 DAY)');values.push(f.to)}
   const str=col=>'CONVERT('+col+' USING utf8mb4) COLLATE utf8mb4_unicode_ci'
   const union=`(SELECT ${str('id')} id,${str('actor_id')} actor_id,${str('actor_role')} actor_role,${str('action')} action,${str('module')} module,${str('entity_id')} entity_id,previous_values,new_values,occurred_at,request_ip,${str('status')} status FROM admin_audit
    UNION ALL SELECT ${str('id')},${str('actor_account_id')},${str('actor_role')},${str('type')},'tickets',${str('ticket_id')},NULL,JSON_OBJECT('status',status,'visibility',visibility),occurred_at,NULL,'SUCCESS' FROM ticket_history
    UNION ALL SELECT ${str('id')},${str('actor_account_id')},${str('actor_role')},${str('type')},'assets',${str('asset_id')},JSON_EXTRACT(event_data,'$.before'),JSON_EXTRACT(event_data,'$.after'),occurred_at,NULL,'SUCCESS' FROM asset_history
    UNION ALL SELECT ${str('id')},${str('actor_id')},COALESCE(${str('actor_role')},'unknown'),${str('action')},'asset-management',${str('entity_id')},before_data,after_data,created_at,NULL,'SUCCESS' FROM am_audit) audit_events`
   const result=await paginated(union,where,values,f,'*','occurred_at DESC,id DESC')
   result.items=result.items.map(row=>({id:row.id,actorId:row.actor_id,actorRole:row.actor_role,action:row.action,module:row.module,entityId:row.entity_id,
    previousValues:row.module==='assets'||row.module==='asset-management'?operationalAudit(row.previous_values):decode(row.previous_values),
    newValues:row.module==='assets'||row.module==='asset-management'?operationalAudit(row.new_values):decode(row.new_values),timestamp:row.occurred_at,requestIp:row.request_ip,status:row.status}))
   return result
  },
  async backupHistory(query,actor){await permission(pool,actor,'admin.backups.read');return paginated('admin_backups',[],[],filters(query))},
  async queueBackup(actor,ip){const id=randomUUID();return mutate(actor,'admin.backups.create','backups.create',id,ip,async c=>{
   await c.query("UPDATE admin_backups SET status='FAILED',finished_at=UTC_TIMESTAMP(3),failure_code='INTERRUPTED' WHERE status IN ('QUEUED','RUNNING') AND created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR)")
   const [[running]]=await c.query("SELECT id FROM admin_backups WHERE status IN ('QUEUED','RUNNING') LIMIT 1 FOR UPDATE");if(running)bad('A backup is already in progress',409)
   await c.execute("INSERT INTO admin_backups(id,requested_by,status,created_at) VALUES(?,?,'QUEUED',?)",[id,actor.id,new Date()]);return {before:null,after:{id,status:'QUEUED'},result:{id,status:'QUEUED'}}
  })},
 }
}
