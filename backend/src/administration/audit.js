import {randomUUID} from 'node:crypto'
import {isIP} from 'node:net'

export function sanitize(value,depth=0) {
 if(depth>8)return '[omitted]'
 if(value===null||value===undefined)return null
 if(typeof value==='string')return value.slice(0,2000)
 if(typeof value==='number'||typeof value==='boolean')return value
 if(value instanceof Date)return value.toISOString()
 if(Array.isArray(value))return value.slice(0,200).map(v=>sanitize(v,depth+1))
 if(typeof value!=='object')return null
 return Object.fromEntries(Object.entries(value).filter(([key])=>!/(password|token|secret|cookie|authorization|credential|external_subject)/i.test(key)).map(([key,v])=>[key,sanitize(v,depth+1)]))
}
export async function recordAudit(c,{actor,action,module='administration',entityId=null,before=null,after=null,ip=null,status='SUCCESS'}) {
 const id=randomUUID()
 await c.execute('INSERT INTO admin_audit(id,actor_id,actor_role,action,module,entity_id,previous_values,new_values,occurred_at,request_ip,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  [id,actor?.id??null,actor?.role??'system',action,module,entityId,JSON.stringify(sanitize(before)),JSON.stringify(sanitize(after)),new Date(),isIP(ip??'')?ip:null,status])
 return id
}
export const decode=value=>typeof value==='string'?JSON.parse(value):value
const operationalKeys=new Set(['id','assetId','asset_tag','quantity','condition','operationalStatus','technical_condition','operational_status','custodian_type','employee_id','department_id','location_id','is_active','name','status','visibility','isActive','role'])
export function operationalAudit(value){value=decode(value);return value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>operationalKeys.has(key))):null}
