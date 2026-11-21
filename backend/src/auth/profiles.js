import {ApiError,fields,text,uuid} from '../management/validation.js'
import {recordAudit} from '../administration/audit.js'

export function profileInput(body) {
 fields(body,['phone','departmentIds'])
 const phone=phoneInput(body.phone)
 if(!Array.isArray(body.departmentIds)||!body.departmentIds.length||body.departmentIds.length>100||new Set(body.departmentIds).size!==body.departmentIds.length)throw new ApiError(400,'اختر قسماً واحداً أو أكثر دون تكرار.')
 return {phone,departmentIds:body.departmentIds.map(uuid).sort()}
}
export function phoneInput(value){
 const phone=text(value,32)
 if(!/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15)throw new ApiError(400,'أدخل رقم هاتف صحيحاً.')
 return phone
}
export async function activeDepartments(c,ids) {
 const [rows]=await c.query('SELECT id,name,is_active FROM departments WHERE id IN (?) ORDER BY id FOR SHARE',[ids])
 if(rows.length!==ids.length||rows.some(d=>!d.is_active))throw new ApiError(400,'اختر أقساماً نشطة وصحيحة.')
 return rows
}
export async function saveDepartments(c,id,ids) {
 await activeDepartments(c,ids)
 await c.execute('DELETE FROM user_departments WHERE user_id=?',[id])
 for(const departmentId of ids)await c.execute('INSERT INTO user_departments(user_id,department_id) VALUES(?,?)',[id,departmentId])
}
export async function readProfile(c,id) {
 const [[row]]=await c.execute('SELECT id,username,email,full_name,role,phone,is_active,must_change_password,must_complete_profile,profile_completed_at FROM users WHERE id=?',[id])
 if(!row)throw new ApiError(404,'الحساب غير موجود.')
 const [departments]=await c.execute('SELECT d.id,d.name,d.is_active AS isActive FROM user_departments ud JOIN departments d ON d.id=ud.department_id WHERE ud.user_id=? ORDER BY d.name,d.id',[id])
 return {id:row.id,username:row.username??row.email,fullName:row.full_name,role:row.role,phone:row.phone,isActive:Boolean(row.is_active),mustChangePassword:Boolean(row.must_change_password),departmentIds:departments.map(d=>d.id),departments:departments.map(d=>({...d,isActive:Boolean(d.isActive)})),mustCompleteProfile:Boolean(row.must_complete_profile),profileCompletedAt:row.profile_completed_at}
}
export function createProfileRepository(pool) {
 return {
  get:id=>readProfile(pool,id),
  async options(){const [items]=await pool.query('SELECT id,name FROM departments WHERE is_active=TRUE ORDER BY name,id');return {items}},
  async update(id,input){const c=await pool.getConnection();try{
   await c.beginTransaction();const [[user]]=await c.execute('SELECT role,is_active,must_complete_profile FROM users WHERE id=? FOR UPDATE',[id])
   if(!user?.is_active)throw new ApiError(401,'انتهت الجلسة.')
   if(user.must_complete_profile)throw new ApiError(403,'أكمل إعداد الحساب أولاً.')
   await saveDepartments(c,id,input.departmentIds)
   await c.execute('UPDATE users SET phone=?,profile_completed_at=NOW(3),updated_at=NOW(3) WHERE id=?',[input.phone,id])
   await recordAudit(c,{actor:{id,role:user.role},action:'users.profile.update',module:'users',entityId:id,after:{departmentIds:input.departmentIds,contactUpdated:true}})
   const item=await readProfile(c,id);await c.commit();return item
  }catch(error){await c.rollback();throw error}finally{c.release()}},
  async employeeOptions(query,actor){
   if(!['technician','manager'].includes(actor.role))throw new ApiError(403,'غير مسموح.')
   if(Object.keys(query).some(k=>!['search','page'].includes(k))||typeof(query.search??'')!=='string'||(query.search??'').length>200||query.page!==undefined&&!/^[1-9]\d{0,4}$/.test(query.page))throw new ApiError(400,'بحث غير صالح.')
   const term=query.search?.trim()??'',page=Number(query.page??1),pageSize=25
   const where="role='employee' AND (?='' OR LOCATE(?,full_name)>0 OR LOCATE(?,COALESCE(username,email))>0)"
   const values=[term,term,term]
   const c=await pool.getConnection();try{await c.beginTransaction()
    const [[count]]=await c.execute('SELECT COUNT(*) n FROM users WHERE '+where,values)
    const [rows]=await c.query('SELECT id FROM users WHERE '+where+' ORDER BY full_name,id LIMIT ? OFFSET ?',[...values,pageSize,(page-1)*pageSize])
    const items=[];for(const row of rows)items.push(await readProfile(c,row.id))
    await c.commit();return {items,total:Number(count.n),page,pageSize}
   }catch(error){await c.rollback();throw error}finally{c.release()}
  },
 }
}
