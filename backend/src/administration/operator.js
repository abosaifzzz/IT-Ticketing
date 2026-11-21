// Trusted server-operator boundary. This module is never mounted as an HTTP API.
import {hashPassword} from '../auth/passwords.js'
import {roles,requireStrongAdminPassword} from './policy.js'
import {guard,lastAdmin} from './repository.js'
import {recordAudit} from './audit.js'
import {bad,uuid} from './validation.js'

export async function approveAdministrativeRequest(pool,id,{password}={}) {
 uuid(id)
 const c=await pool.getConnection()
 try{
  await c.beginTransaction();await guard(c)
  const [[request]]=await c.execute('SELECT * FROM admin_requests WHERE id=? FOR UPDATE',[id])
  if(!request||request.status!=='PENDING'||new Date(request.expires_at).getTime()<=Date.now())bad('Request is missing, expired or already completed',409)
  const [[user]]=await c.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[request.target_id])
  if(!user||user.role!==request.expected_role)bad('Account role changed after the request; submit a new request',409)
  if(user.auth_provider!=='local'&&request.type==='PASSWORD_RESET')bad('Use the external identity provider',409)
  let nextRole=user.role
  if(request.type==='ROLE_CHANGE'){
   if(request.target_id===request.requested_by||!roles.includes(request.requested_role))bad('Invalid protected role change',403)
   nextRole=request.requested_role
   await lastAdmin(c,user,nextRole,Boolean(user.is_active))
  }
  const needsPassword=request.type==='PASSWORD_RESET'||nextRole==='admin'&&nextRole!==user.role
  let passwordHash=user.password_hash,verified=nextRole==='admin'&&Boolean(user.admin_password_verified)
  if(needsPassword){if(nextRole==='admin')requireStrongAdminPassword(password);passwordHash=await hashPassword(password);verified=nextRole==='admin'}
  await c.execute('UPDATE users SET role=?,password_hash=?,admin_password_verified=?,must_change_password=?,updated_at=? WHERE id=?',[nextRole,passwordHash,verified,needsPassword?false:Boolean(user.must_change_password),new Date(),user.id])
  await c.execute('DELETE FROM auth_sessions WHERE user_id=?',[user.id])
  await c.execute("UPDATE admin_requests SET status='COMPLETED',completed_at=? WHERE id=?",[new Date(),id])
  await recordAudit(c,{action:request.type==='ROLE_CHANGE'?'users.role_change.approved':'users.password_reset.completed',module:'users',entityId:user.id,
   before:{role:user.role},after:{role:nextRole,requestId:id,operator:'local-server-console',sessionsRevoked:true}})
  await c.commit()
  return {id,status:'COMPLETED',targetId:user.id,role:nextRole}
 }catch(error){await c.rollback();throw error}finally{c.release()}
}
