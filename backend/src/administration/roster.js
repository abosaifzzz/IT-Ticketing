import {randomUUID} from 'node:crypto'
import {accountCreate,bad} from './validation.js'
import {guard} from './repository.js'
import {hashPassword} from '../auth/passwords.js'
import {recordAudit} from './audit.js'
import {uuid} from '../management/validation.js'

export function rosterRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>10000)bad('A roster requires 1–10000 rows')
 const usernames=new Set()
 return rows.map(row=>{
  if(!row||Object.keys(row).some(k=>!['username','fullName'].includes(k)))bad('Only username and fullName columns are accepted')
  const item=accountCreate({...row,role:'employee'})
  if(!item.username||usernames.has(item.username))bad('Duplicate or missing normalized username')
  usernames.add(item.username);return item
 })
}
export async function importUserRoster(pool,{rows,sourceSha256,actorId,retireReceipt=null,apply=false}){
 const inputs=rosterRows(rows);uuid(actorId)
 if(!/^[a-f0-9]{64}$/.test(sourceSha256))bad('Invalid source checksum')
 let retireIds=[]
 if(retireReceipt){
  if(!retireReceipt.applied||retireReceipt.loginMappingApplied!==false||!Array.isArray(retireReceipt.mappings)||retireReceipt.mappings.length>10000)bad('Use the completed original directory-import receipt')
  uuid(retireReceipt.actorId)
  retireIds=retireReceipt.mappings.map(row=>uuid(row.id))
  if(new Set(retireIds).size!==retireIds.length)bad('Duplicate directory mapping')
 }
 const c=await pool.getConnection()
 try{
  await c.beginTransaction();await guard(c)
  const [[actor]]=await c.execute('SELECT id,role,is_active FROM users WHERE id=? FOR SHARE',[actorId])
  if(!actor?.is_active||actor.role!=='admin')bad('An active Admin operator is required',403)
  const [permissions]=await c.query("SELECT permission FROM admin_role_permissions WHERE enabled=TRUE AND role='admin' AND permission IN ('admin.users.create','admin.users.update') FOR SHARE")
  if(permissions.length!==2)bad('User creation and update permissions are required',403)
  const [[existingBatch]]=await c.execute('SELECT * FROM user_roster_imports WHERE source_sha256=?',[sourceSha256])
  const create=[];let unchanged=0
  for(const item of inputs){
   const [matches]=await c.execute('SELECT id,full_name,role,roster_source_sha256 FROM users WHERE username=? OR email=? FOR UPDATE',[item.username,item.username])
   if(matches.length>1)bad('Ambiguous existing login identity requires mapping',409)
   const existing=matches[0]
   if(existing){
    if(existing.roster_source_sha256!==sourceSha256||existing.full_name!==item.fullName||existing.role!=='employee')bad('An existing username needs deliberate mapping; no changes were made',409)
    unchanged++
   }else create.push({...item,id:randomUUID()})
  }
  if(existingBatch&&create.length)bad('An applied roster has missing accounts; review before repairing',409)
  let retireCount=0
  for(const id of retireIds){
   const [[row]]=await c.execute('SELECT created_by_account_id,is_active FROM employee_directory WHERE id=? FOR UPDATE',[id])
   if(!row||row.created_by_account_id!==retireReceipt.actorId)bad('Directory receipt identity does not match existing records',409)
   if(row.is_active)retireCount++
  }
  const plan={sourceSha256,sourceRows:inputs.length,created:create.length,unchanged,retiredDirectory:retireCount,departmentsDeleted:0,existingPasswordsChanged:0,applied:apply}
  if(apply){
   for(const item of create)await c.execute("INSERT INTO users(id,username,email,full_name,role,auth_provider,password_hash,is_active,must_change_password,must_complete_profile,roster_source_sha256,created_at,updated_at) VALUES(?,?,NULL,?,'employee','local',?,TRUE,TRUE,TRUE,?,NOW(3),NOW(3))",[item.id,item.username,item.fullName,await hashPassword('123'),sourceSha256])
   for(const id of retireIds)await c.execute('UPDATE employee_directory SET is_active=FALSE,updated_at=NOW(3) WHERE id=?',[id])
   if(!existingBatch)await c.execute('INSERT INTO user_roster_imports(source_sha256,actor_id,created_count,retired_directory_count,created_at) VALUES(?,?,?,?,NOW(3))',[sourceSha256,actorId,create.length,retireCount])
   await recordAudit(c,{actor,action:'users.roster.import',module:'users',entityId:sourceSha256,after:plan})
   await c.commit()
  }else await c.rollback()
  return plan
 }catch(error){await c.rollback();throw error}finally{c.release()}
}
