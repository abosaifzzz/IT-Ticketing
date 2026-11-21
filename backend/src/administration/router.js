import {Router} from 'express'
import {rateLimit} from 'express-rate-limit'
import {fields} from '../management/validation.js'
import {requireAdminIdentity} from './policy.js'
import {accountCreate,accountUpdate,requestInput,roleChangeInput,permissionInput,settingInput,filters,noBody,bad,uuid} from './validation.js'

export function createAdministrationRouter({authService,cookieName,cookieOptions,repository,monitoring,backups}) {
 const router=Router(),jobs=new Set()
 router.closeJobs=()=>Promise.allSettled([...jobs])
 router.use(rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,validate:{xForwardedForHeader:false},message:{error:'Too many administrative requests'}}))
 router.use(async(req,res,next)=>{
  res.set('Cache-Control','no-store')
  const context=await authService.getSessionInfo(req.cookies[cookieName])
  if(!context)bad('Authentication required',401)
  req.user=context.user;req.adminSession=context
  requireAdminIdentity(req.user)
  next()
 })
 const writeLimit=rateLimit({windowMs:15*60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Too many sensitive administrative requests'}})
 const reauthLimit=rateLimit({windowMs:15*60000,limit:5,skipSuccessfulRequests:true,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Too many authentication attempts'}})
 router.use((req,res,next)=>['GET','HEAD'].includes(req.method)?next():writeLimit(req,res,next))
 const allow=(permission,recent=false)=>async(req,_res,next)=>{
  await repository.permission(req.user,permission)
  if(recent&&(!Number.isFinite(req.adminSession.authenticatedAt)||req.adminSession.authenticatedAt+req.adminSession.recentAuthenticationMinutes*60000<=Date.now()))bad('Reauthenticate before this sensitive action',401)
  next()
 }
 router.post('/reauthenticate',reauthLimit,async(req,res)=>{
  fields(req.body,['password'])
  if(typeof req.body.password!=='string'||Buffer.byteLength(req.body.password)>1024)bad()
  const session=await authService.reauthenticate(req.cookies[cookieName],req.body.password)
  if(!session)bad('Authentication failed',401)
  await repository.audit({actor:req.user,action:'authentication.reauthenticate',module:'authentication',entityId:req.user.id,ip:req.ip})
  res.cookie(cookieName,session.token,{...cookieOptions,expires:session.expiresAt})
  res.json({user:session.user})
 })
 router.get('/dashboard',allow('admin.dashboard.read'),async(req,res)=>{if(Object.keys(req.query).length)bad();res.json(await repository.dashboard(req.user))})
 router.get('/users',allow('admin.users.read'),async(req,res)=>res.json(await repository.listUsers(req.query,req.user)))
 router.get('/users/:id',allow('admin.users.read'),async(req,res)=>res.json({item:await repository.getUser(uuid(req.params.id),req.user)}))
 router.post('/users',allow('admin.users.create',true),async(req,res)=>res.status(201).json({item:await repository.createUser(accountCreate(req.body),req.user,req.ip)}))
 router.patch('/users/:id',allow('admin.users.update',true),async(req,res)=>res.json({item:await repository.updateUser(uuid(req.params.id),accountUpdate(req.body),req.user,req.ip)}))
 router.post('/users/:id/role-change',allow('admin.users.update',true),async(req,res)=>res.json({item:await repository.changeRole(uuid(req.params.id),roleChangeInput(req.body),req.user,req.ip)}))
 router.post('/users/:id/password-reset',allow('admin.users.reset_password',true),async(req,res)=>res.status(202).json({item:await repository.request(uuid(req.params.id),'PASSWORD_RESET',requestInput(req.body),req.user,req.ip),privateOperatorCompletionRequired:true}))
 router.post('/users/:id/reset-temporary-password',allow('admin.users.reset_password',true),async(req,res)=>{noBody(req.body);res.json({item:await repository.resetTemporaryPassword(uuid(req.params.id),req.user,req.ip)})})
 router.post('/users/:id/revoke-sessions',allow('admin.sessions.revoke',true),async(req,res)=>{noBody(req.body);res.json(await repository.revokeSessions(uuid(req.params.id),req.user,req.ip))})
 router.get('/requests',allow('admin.users.read'),async(req,res)=>res.json(await repository.requests(req.query,req.user)))
 router.get('/roles',allow('admin.roles.read'),async(req,res)=>{if(Object.keys(req.query).length)bad();res.json(await repository.roles(req.user))})
 router.put('/roles/:role/permissions',allow('admin.permissions.manage',true),async(req,res)=>res.json({item:await repository.permissions(permissionInput(req.body,req.params.role),req.user,req.ip)}))
 router.get('/audit',allow('admin.audit.read'),async(req,res)=>res.json(await repository.auditHistory(req.query,req.user)))
 router.all('/audit/:id',allow('admin.audit.read'),()=>bad('Audit records are immutable',405))
 router.get('/settings',allow('admin.settings.read'),async(req,res)=>{if(Object.keys(req.query).length)bad();res.json(await repository.settings(req.user))})
 router.put('/settings/:section',allow('admin.settings.update',true),async(req,res)=>res.json({item:await repository.setting(req.params.section,settingInput(req.params.section,req.body),req.user,req.ip)}))
 router.get('/monitoring',allow('admin.monitoring.read'),async(req,res)=>{if(Object.keys(req.query).length)bad();res.json({...await monitoring.snapshot(repository.pool),backup:backups.capabilities()})})
 router.get('/errors',allow('admin.errors.read'),(req,res)=>res.json(monitoring.errors(filters(req.query))))
 router.get('/backups/status',allow('admin.backups.read'),async(req,res)=>{if(Object.keys(req.query).length)bad();const history=await repository.backupHistory({pageSize:'1'},req.user);res.json({...backups.capabilities(),latest:history.items[0]??null})})
 router.get('/backups',allow('admin.backups.read'),async(req,res)=>res.json(await repository.backupHistory(req.query,req.user)))
 router.post('/backups',allow('admin.backups.create',true),async(req,res)=>{
  noBody(req.body);const item=await repository.queueBackup(req.user,req.ip)
  const task=backups.run(item.id);jobs.add(task);void task.finally(()=>jobs.delete(task)).catch(()=>{})
  res.status(202).json({item})
 })
 router.post('/backups/:id/restore',allow('admin.backups.restore',true),async(req,_res)=>{
  const id=uuid(req.params.id);fields(req.body,['confirmation'])
  if(req.body.confirmation!=='RESTORE_BACKUP '+id)bad('Explicit restore confirmation is required')
  bad('No protected offline recovery adapter is configured; HTTP restoration is unavailable',501)
 })
 router.use((_req,_res)=>bad('Administration endpoint not found',404))
 router.use(async(error,req,_res,next)=>{
  await repository.audit({actor:req.user,action:'administration.request.failed',module:'security',ip:req.ip,status:'FAILURE',after:{status:error.status??500,method:req.method}}).catch(()=>{})
  next(error)
 })
 return router
}
