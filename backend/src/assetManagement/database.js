import {requireAssetAccess as requireIT} from '../assets/permissions.js'
export {requireIT}
import {appendOnlyTables} from './tables.js'
import {randomUUID,createHash} from 'node:crypto'
import {ApiError} from '../management/validation.js'
import {lockNotificationAccount,advanceNotificationRevision} from '../notifications/service.js'
import {bad} from './validation.js'
export const json=value=>typeof value==='string'?JSON.parse(value):value
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function one(c,table,id,lock=true){const [[row]]=await c.execute(`SELECT * FROM ${table} WHERE id=?${lock?(appendOnlyTables.includes(table)?' FOR SHARE':' FOR UPDATE'):''}`,[id]);if(!row)bad('Record not found',404);if(lock&&table==='am_assets'&&row.archived_at)bad('Asset is deleted',409);return row}
export async function insert(c,table,data){const keys=Object.keys(data);await c.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(data));return data}
export async function update(c,table,id,data){await c.execute(`UPDATE ${table} SET ${Object.keys(data).map(k=>k+'=?').join(',')} WHERE id=?`,[...Object.values(data),id])}
export async function active(c,table,id){const [[r]]=await c.execute(`SELECT * FROM ${table} WHERE id=? FOR SHARE`,[id]);if(!r?.is_active)bad('Choose an active reference');return r}
export async function destination(c,locationId){return active(c,'am_locations',locationId)}
export async function defaultWarehouse(c, locationId) {
  if (locationId) return destination(c, locationId)
  const [rows] = await c.query("SELECT * FROM am_locations WHERE is_active=TRUE AND kind='WAREHOUSE' ORDER BY id FOR SHARE")
  if (rows.length !== 1) bad('Configure one active main warehouse or supply an explicit location', 409)
  return rows[0]
}
export async function owner(c,{custodianType='none',employeeId=null,departmentId=null}){if(custodianType==='employee'){const e=await active(c,'employee_directory',employeeId);if(departmentId&&departmentId!==e.department_id)bad('Employee and department do not match');departmentId=e.department_id}else if(employeeId)bad();if(custodianType==='none'){if(departmentId)bad('Unassigned custody cannot name a department');return {custodian_type:'none',employee_id:null,department_id:null}}await active(c,'departments',departmentId);return {custodian_type:custodianType,employee_id:employeeId,department_id:departmentId}}
export async function ticket(c,id,_actor){if(!id)return;const [[t]]=await c.execute('SELECT assigned_technician_id FROM tickets WHERE id=? FOR SHARE',[id]);if(!t)bad('Ticket not found',404)}
const assetNotificationLabels={ISSUE:'تسليم أصل بانتظار تأكيد الاستلام',RETURN:'إرجاع أصل',TRANSFER:'نقل عهدة',REPLACE:'استبدال أصل',LOW_STOCK:'تنبيه انخفاض المخزون',MAINTENANCE_REQUEST:'طلب صيانة أصل',MAINTENANCE_UPDATE:'تحديث صيانة أصل',REVIEW:'جرد بانتظار المراجعة',FINALIZE:'اعتماد نتائج الجرد',WORKSTATION_ATTACH:'تسليم مكون محطة عمل بانتظار تأكيد الاستلام',RESERVE:'حجز أصل',RELEASE_RESERVATION:'إلغاء حجز أصل',RECEIVE:'إضافة مخزون',RETIRE:'استبعاد أصل',INVENTORY_ADJUSTMENT:'تسوية مخزون معتمدة'}
export async function notify(c,eventId,entityType,entityId,action,now){await insert(c,'notification_events',{id:eventId,ticket_id:null,type:'asset_event',title:'إدارة الأصول',message:(assetNotificationLabels[action]??'تحديث سجل الأصول')+' '+entityId,created_at:now,resource_type:entityType,resource_id:entityId});const [recipients]=await c.query("SELECT id FROM users WHERE is_active=TRUE AND role IN ('technician','manager') ORDER BY id FOR SHARE");for(const r of recipients){await lockNotificationAccount(c,r.id);await insert(c,'notifications',{id:randomUUID(),event_id:eventId,recipient_id:r.id,created_revision:await advanceNotificationRevision(c,r.id),created_at:now})}}
export async function audit(c,actor,entityType,entityId,action,before,after,{notification=false}={}){const id=randomUUID(),now=new Date();await insert(c,'am_audit',{id,entity_type:entityType,entity_id:entityId,action,actor_id:actor.id,actor_role:actor.role,before_data:before?JSON.stringify(before):null,after_data:JSON.stringify(after),created_at:now});if(notification)await notify(c,id,entityType,entityId,action,now)}
export async function movement(c,actor,{type,asset=null,item=null,quantity=1,source=null,destination=null,before={},after={},reason,ticketId=null,replacementId=null}){const id=randomUUID();await insert(c,'am_movements',{id,type,asset_id:asset,item_id:item,quantity,source_id:source,destination_id:destination,previous_state:JSON.stringify(before),new_state:JSON.stringify(after),actor_id:actor.id,reason,ticket_id:ticketId,replacement_id:replacementId,created_at:new Date()});return id}
export async function closeCustody(c,asset){await c.execute('UPDATE am_custody SET ended_at=? WHERE asset_id=? AND ended_at IS NULL',[new Date(),asset.id])}
export async function custody(c,actor,asset,movementId,notes=''){if(asset.custodian_type==='none')return;await insert(c,'am_custody',{id:randomUUID(),asset_id:asset.id,type:asset.custodian_type,employee_id:asset.employee_id,department_id:asset.department_id,location_id:asset.location_id,issued_by:actor.id,issued_at:new Date(),movement_id:movementId,notes})}
export async function historyLink(c,actor,workstationId,assetId,action,options={}) {
 if(!workstationId)return
 const now=new Date()
 await insert(c,'am_workstation_history',{id:randomUUID(),workstation_id:workstationId,asset_id:assetId,action,actor_id:actor.id,created_at:now})
 if(action==='ATTACH') {
  await insert(c,'am_group_memberships',{id:randomUUID(),group_id:workstationId,asset_id:assetId,joined_at:now,added_by:actor.id})
  if(options.componentId)await update(c,'am_group_components',options.componentId,{allocated_asset_id:assetId})
  else {
   const [[component]]=await c.execute('SELECT id FROM am_group_components WHERE group_id=? AND removed_at IS NULL AND (source_asset_id=? OR allocated_asset_id=?) LIMIT 1 FOR UPDATE',[workstationId,assetId,assetId])
   if(component)await update(c,'am_group_components',component.id,{allocated_asset_id:assetId})
   else await insert(c,'am_group_components',{id:randomUUID(),group_id:workstationId,source_asset_id:assetId,allocated_asset_id:assetId,added_by:actor.id,added_at:now})
  }
 } else if(['DETACH','REPLACE'].includes(action)) {
  await c.execute('UPDATE am_group_memberships SET ended_at=?,ended_by=?,end_reason=? WHERE group_id=? AND asset_id=? AND ended_at IS NULL',[now,actor.id,action,workstationId,assetId])
  if(!options.preserveComponent)await c.execute('UPDATE am_group_components SET removed_at=?,removed_by=?,allocated_asset_id=NULL WHERE group_id=? AND allocated_asset_id=? AND removed_at IS NULL',[now,actor.id,workstationId,assetId])
 }
}

export function transaction(pool){return async(user,operation,body,run)=>{requireIT(user);for(let attempt=0;attempt<3;attempt++){const c=await pool.getConnection();try{await c.beginTransaction();const actor=await active(c,'users',user.id);if(actor.role!==user.role)bad('Role changed',403);const fingerprint=digest([operation,body]);await c.execute('INSERT INTO am_operations(id,actor_id,request_key,fingerprint,created_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE actor_id=actor_id',[randomUUID(),actor.id,body.clientRequestId,fingerprint,new Date()]);const [[op]]=await c.execute('SELECT * FROM am_operations WHERE actor_id=? AND request_key=? FOR UPDATE',[actor.id,body.clientRequestId]);if(op.fingerprint!==fingerprint)bad('Idempotency key already used for another request',409);if(op.response){await c.commit();return json(op.response)}const result=await run(c,actor);await update(c,'am_operations',op.id,{response:JSON.stringify(result)});await c.commit();return result}catch(error){await c.rollback();if(error.code==='ER_LOCK_DEADLOCK'&&attempt<2)continue;if(['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code))throw new ApiError(409,'Conflicting asset operation');throw error}finally{c.release()}}}}
