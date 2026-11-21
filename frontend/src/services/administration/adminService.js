import {httpClient} from '../auth/authService.js'

const root='/admin'
const query=params=>new URLSearchParams(Object.entries(params).filter(([,value])=>value!==''&&value!==null&&value!==undefined)).toString()
export function createAdminService(client){
 const get=(path,params={},signal)=>client.request(`${root}${path}${Object.keys(params).length?`?${query(params)}`:''}`,{signal})
 const write=(path,method,body)=>client.request(`${root}${path}`,{method,body})
 return {
 dashboard:signal=>get('/dashboard',{},signal),
 users:(params,signal)=>get('/users',params,signal),
 user:(id,signal)=>get(`/users/${encodeURIComponent(id)}`,{},signal),
 createUser:body=>write('/users','POST',body),
 updateUser:(id,body)=>write(`/users/${encodeURIComponent(id)}`,'PATCH',body),
 changeRole:(id,body)=>write(`/users/${encodeURIComponent(id)}/role-change`,'POST',body),
 requestPasswordReset:(id,body)=>write(`/users/${encodeURIComponent(id)}/password-reset`,'POST',body),
 resetTemporaryPassword:id=>write(`/users/${encodeURIComponent(id)}/reset-temporary-password`,'POST',{}),
 revokeSessions:id=>write(`/users/${encodeURIComponent(id)}/revoke-sessions`,'POST',{}),
 requests:(params,signal)=>get('/requests',params,signal),
 roles:signal=>get('/roles',{},signal),
 updatePermissions:permissions=>write('/roles/admin/permissions','PUT',{permissions}),
 audit:(params,signal)=>get('/audit',params,signal),
 settings:signal=>get('/settings',{},signal),
 updateSettings:(section,body)=>write(`/settings/${encodeURIComponent(section)}`,'PUT',body),
 monitoring:signal=>get('/monitoring',{},signal),
 errors:(params,signal)=>get('/errors',params,signal),
 backupStatus:signal=>get('/backups/status',{},signal),
 backups:(params,signal)=>get('/backups',params,signal),
 async latestSuccessfulBackup(signal){for(let page=1;page<=1000;page++){const data=await get('/backups',{page,pageSize:100},signal);const found=data.items.find(row=>row.status==='COMPLETED');if(found)return found;if(page*100>=data.total)return null}return null},
 createBackup:()=>write('/backups','POST',{}),
 reauthenticate:password=>client.request(`${root}/reauthenticate`,{method:'POST',body:{password},anonymous:true}),
}
}

export const adminService=createAdminService(httpClient)
