import {ApiError,fields,text,uuid,boolean} from '../management/validation.js'
import {roles,adminPermissions,requiredPermissions,requireStrongAdminPassword} from './policy.js'
import {profileInput} from '../auth/profiles.js'
export const canonicalRole=value=>value==='engineer'?'technician':value
export const bad=(message='Invalid administrative input',status=400)=>{throw new ApiError(status,message)}
export const noBody=body=>{if(body!==undefined&&(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length))bad()}
export function filters(query,extra=[]) {
 if(Object.keys(query).some(k=>!['search','page','pageSize','from','to',...extra].includes(k))||Object.values(query).some(v=>typeof v!=='string'))bad()
 const number=(v,d,max)=>{if(v===undefined)return d;if(!/^[1-9]\d*$/.test(v)||Number(v)>max)bad();return Number(v)}
 const day=v=>{if(v===undefined)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)bad();return v}
 const from=day(query.from),to=day(query.to),search=query.search?.trim()??''
 if(search.length>200||from&&to&&from>to)bad()
 return {...query,search,from,to,page:number(query.page,1,100000),pageSize:number(query.pageSize,25,100)}
}
export function accountCreate(body) {
 fields(body,['email','username','fullName','role'])
 const email=body.email===undefined?null:text(body.email,254).toLowerCase(),fullName=text(body.fullName)
 const username=body.username===undefined?null:text(body.username,100).toLowerCase()
 const role=canonicalRole(body.role)
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||username&&!/^[a-z0-9][a-z0-9._ -]{0,99}$/.test(username)||!email&&!username||fullName.length<2||!roles.includes(role))bad()
 return {email,username,fullName,role}
}
export function accountUpdate(body) {
 fields(body,['fullName','isActive','username','phone','departmentIds','role','reason','adminPassword'])
 const result={}
 if(body.fullName!==undefined){result.fullName=text(body.fullName);if(result.fullName.length<2)bad()}
 if(body.isActive!==undefined)result.isActive=boolean(body.isActive)
 if(body.username!==undefined){result.username=text(body.username,100).toLowerCase();if(!/^[a-z0-9][a-z0-9._ -]{0,99}$/.test(result.username))bad()}
 if(body.phone!==undefined||body.departmentIds!==undefined)result.profile=profileInput({phone:body.phone,departmentIds:body.departmentIds})
 if(body.role!==undefined)result.roleChange=roleChangeInput({role:body.role,reason:body.reason,adminPassword:body.adminPassword})
 else if(body.reason!==undefined||body.adminPassword!==undefined)bad('A role is required for a role change')
 if(!Object.keys(result).length)bad()
 return result
}
export function requestInput(body,role=false) {
 fields(body,role?['role','reason']:['reason'])
 const nextRole=canonicalRole(body.role)
 if(role&&!roles.includes(nextRole))bad()
 return {reason:text(body.reason,300),...(role?{role:nextRole}:{})}
}
export function roleChangeInput(body) {
 fields(body,['role','reason','adminPassword'])
 const role=canonicalRole(body.role)
 if(!roles.includes(role))bad()
 const reason=text(body.reason,300)
 if(role==='admin')requireStrongAdminPassword(body.adminPassword)
 else if(body.adminPassword!==undefined)bad('An administrator password is only accepted for Admin promotion')
 return {role,reason,...(role==='admin'?{adminPassword:body.adminPassword}:{})}
}
export function permissionInput(body,role) {
 fields(body,['permissions'])
 if(role!=='admin')bad('Operational role policy is not editable in Administration',403)
 const p=body.permissions
 if(!Array.isArray(p)||new Set(p).size!==p.length||p.some(value=>!adminPermissions.includes(value)))bad('Only explicit administrative permissions are configurable',403)
 if(p.includes('admin.backups.restore'))bad('Restore permission requires a separate protected operator policy',403)
 if(requiredPermissions.some(value=>!p.includes(value)))bad('Essential administration recovery permissions cannot be removed',409)
 return [...p].sort()
}
export function settingInput(section,body) {
 fields(body,['values','expectedVersion'])
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)bad()
 const specs={identity:['hospitalName','systemName','timezone'],application:['supportEmail','defaultPageSize'],authentication:['adminSessionMinutes','recentAuthenticationMinutes'],notifications:['pollSeconds','realtimeEnabled'],maintenance:['enabled','message']}
 if(!specs[section])bad('Setting section not found',404)
 fields(body.values,specs[section])
 if(specs[section].some(k=>!Object.hasOwn(body.values,k)))bad('Supply the complete section')
 const v={...body.values},integer=(key,min,max)=>{if(!Number.isSafeInteger(v[key])||v[key]<min||v[key]>max)bad()}
 if(section==='identity'){v.hospitalName=text(v.hospitalName);v.systemName=text(v.systemName);v.timezone=text(v.timezone,80);try{new Intl.DateTimeFormat('en',{timeZone:v.timezone})}catch{bad('Invalid timezone')}}
 if(section==='application'){v.supportEmail=v.supportEmail===''?'':text(v.supportEmail,254).toLowerCase();if(v.supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.supportEmail))bad();integer('defaultPageSize',5,100)}
 if(section==='authentication'){integer('adminSessionMinutes',5,60);integer('recentAuthenticationMinutes',1,5)}
 if(section==='notifications'){integer('pollSeconds',15,120);v.realtimeEnabled=boolean(v.realtimeEnabled)}
 if(section==='maintenance'){v.enabled=boolean(v.enabled);v.message=text(v.message,300)}
 return {values:v,expectedVersion:body.expectedVersion}
}
export {uuid}
