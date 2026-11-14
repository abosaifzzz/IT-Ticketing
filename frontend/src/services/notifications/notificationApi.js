export const apiNotificationLabels=Object.freeze({new_ticket:'بلاغ جديد',ticket_assignment:'إسناد بلاغ',ticket_resolved:'تم حل البلاغ',ticket_reopened:'إعادة فتح البلاغ',asset_event:'تحديث الأصول التقنية'})
export function notificationRoute(item,role){
 if(!['employee','technician','manager'].includes(role))return null
 if(item.type==='asset_event'&&role!=='employee'){
  const paths={asset:'registry',custody:'custody',workstation:'workstations',maintenance:'maintenance',inventory:'inventory',item:'stock',replacement:'replacement'}
  const section=paths[item.resourceType]
  if(!section)return '/it/assets'
  if(item.resourceType==='asset'&&item.resourceId)return `/it/assets/registry/${encodeURIComponent(item.resourceId)}`
  return `/it/assets/${section}${item.resourceId?'?id='+encodeURIComponent(item.resourceId):''}`
 }
 return typeof item.ticketId==='string'?'/'+role+'/tickets/'+encodeURIComponent(item.ticketId):null
}
export function createNotificationApi(client){
 const query=(input,allowed)=>new URLSearchParams(Object.entries(input).filter(([key,value])=>allowed.includes(key)&&value!==null&&value!==undefined)).toString()
 return{
  history(filters={},signal){return client.request('/notifications?'+query(filters,['before','limit','unreadOnly']),{signal})},
  state(since,signal){return client.request('/notifications/state'+(since===null?'':'?'+query({since},['since'])),{signal})},
  read(id){return client.request('/notifications/'+encodeURIComponent(id)+'/read',{method:'PATCH',body:{}})},
  readAll(){return client.request('/notifications/read-all',{method:'POST',body:{}})},
 }
}
