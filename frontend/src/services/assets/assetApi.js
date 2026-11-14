const fields=['name','quantity','manufacturer','model','serialNumber','holdingType','location','purchaseDate','operationalStatus','conditionDescription','maintenanceNotes','lastMaintenanceDate']
const filters=(input,exporting=false)=>new URLSearchParams(Object.entries(input).filter(([key,value])=>['search','departmentId','operationalStatus','holdingType',...(exporting?[]:['includeArchived','page','pageSize'])].includes(key)&&value!==''&&value!==undefined)).toString()
export const assetStatusLabels=Object.freeze({working:'يعمل',needs_maintenance:'يحتاج إلى صيانة',out_of_service:'خارج الخدمة',under_repair:'قيد الإصلاح',retired:'مستبعد',withdrawn:'تم السحب'})
export function createAssetApi(client){
 const item=async(path,options)=>(await client.request(path,options)).item
 return{
  list(input={},signal){return client.request('/assets?'+filters(input),{signal})},
  statistics(signal){return client.request('/assets/statistics',{signal})},
  details(id,signal){return item('/assets/'+encodeURIComponent(id),{signal})},
  departments(signal){return client.request('/departments',{signal})},
  relatedTickets(id,page=1,signal){return client.request('/tickets?'+new URLSearchParams({relatedAssetId:id,page,pageSize:10}),{signal})},
  save(form,existing=null){
   const body=Object.fromEntries(fields.filter(key=>form[key]!==undefined).map(key=>[key,key==='quantity'?Number(form[key]):form[key]]))
   // Preserve an existing historical department unless the user explicitly changes it.
   if(form.holdingType==='it_storage')body.departmentId=null
   else if(!existing||form.departmentId!==existing.departmentId||existing.holdingType!=='department')body.departmentId=form.departmentId
   if(existing)body.expectedVersion=existing.version
   else body.assetId=form.assetId.trim()
   return item('/assets'+(existing?'/'+encodeURIComponent(existing.assetId):''),{method:existing?'PATCH':'POST',body})
  },
  archive(asset){return item('/assets/'+encodeURIComponent(asset.assetId)+'/archive',{method:'POST',body:{expectedVersion:asset.version}})},
  export(input){return client.request('/assets/export.xlsx?'+filters(input,true),{responseType:'xlsx'})},
 }
}
