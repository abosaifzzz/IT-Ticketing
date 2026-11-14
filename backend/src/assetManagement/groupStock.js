import {randomUUID} from 'node:crypto'
import {bad,choice,reqId} from './validation.js'
import {one,insert,update,audit,historyLink,defaultWarehouse} from './database.js'
import {createAsset} from './assets.js'
import {simpleAsset,simpleCondition,saveAsset,state} from './simple.js'

export const returnCondition = value => value === undefined ? undefined : choice(['NEW','USED','OUT_OF_SERVICE'])(value)
export function returnConditions(value) {
  if(value===undefined)return []
  if(!Array.isArray(value)||value.length>200)bad('Invalid return conditions')
  const ids=new Set()
  return value.map(row=>{
    if(!row||typeof row!=='object'||Object.keys(row).some(k=>!['assetId','condition'].includes(k)))bad('Invalid return condition')
    const assetId=reqId(row.assetId),condition=choice(['NEW','USED','OUT_OF_SERVICE'])(row.condition)
    if(ids.has(assetId))bad('Duplicate return condition');ids.add(assetId)
    return {assetId,condition}
  })
}
export async function components(c,groupId) {
  const [rows]=await c.execute('SELECT * FROM am_group_components WHERE group_id=? AND removed_at IS NULL ORDER BY source_asset_id,id FOR UPDATE',[groupId])
  return rows
}
export async function trackComponent(c,actor,groupId,sourceId,allocatedId=null) {
  const [[count]]=await c.execute('SELECT COUNT(*) n FROM am_group_components WHERE group_id=? AND removed_at IS NULL',[groupId])
  if(Number(count.n)>=200)bad('A group supports at most 200 components',409)
  const row={id:randomUUID(),group_id:groupId,source_asset_id:sourceId,allocated_asset_id:allocatedId,added_by:actor.id,added_at:new Date()}
  await insert(c,'am_group_components',row)
  await audit(c,actor,'workstation',groupId,'COMPONENT_ADD',null,row)
  return row
}
export async function endComponent(c,actor,row) {
  const change={allocated_asset_id:null,removed_at:new Date(),removed_by:actor.id}
  await update(c,'am_group_components',row.id,change)
  await audit(c,actor,'workstation',row.group_id,'COMPONENT_REMOVE',row,{...row,...change})
}
const available=asset=>!asset.archived_at&&asset.operational_status==='AVAILABLE'&&asset.custodian_type==='none'&&!asset.workstation_id&&asset.quantity>0&&['NEW','USED'].includes(simpleCondition(asset))
export async function allocate(c,actor,parent,component,own,locationId,notes='',attach=true) {
  if(component.allocated_asset_id)return one(c,'am_assets',component.allocated_asset_id)
  const source=await one(c,'am_assets',component.source_asset_id)
  if(!available(source))bad('A group component has insufficient working warehouse stock',409)
  let unit=source
  if(source.is_stock) {
    if(source.serial_number)bad('Serialized stock cannot be split',409)
    await saveAsset(c,actor,source,{quantity:source.quantity-1},'GROUP_STOCK_ISSUE',notes)
    unit=await createAsset(c,actor,{categoryId:source.category_id,brand:source.brand,model:source.model,serialNumber:'',quantity:1,
      isStock:false,sourceAssetId:source.id,usageCondition:source.usage_condition,technicalCondition:'GOOD',operationalStatus:'AVAILABLE',
      locationId:source.location_id,custodianType:'none',employeeId:null,departmentId:null,receivedDate:null,supplier:'',notes:source.notes},{simple:true})
  }
  if(!attach){await update(c,'am_group_components',component.id,{allocated_asset_id:unit.id});return unit}
  const after=await saveAsset(c,actor,unit,{...own,workstation_id:parent.id,location_id:locationId,
    ...state(simpleCondition(unit),own.custodian_type!=='none')},'GROUP_ADD',notes)
  await historyLink(c,actor,parent.id,unit.id,'ATTACH',{componentId:component.id})
  await update(c,'am_group_components',component.id,{allocated_asset_id:unit.id})
  await audit(c,actor,'workstation',parent.id,'COMPONENT_ALLOCATE',component,{...component,allocated_asset_id:unit.id})
  return after
}
export async function addStock(c,actor,parent,source,own,notes) {
  if(source.archived_at||source.custodian_type!=='none'||source.workstation_id||!source.is_stock)bad('Choose unassigned warehouse stock',409)
  const row=await trackComponent(c,actor,parent.id,source.id)
  if(own.custodian_type!=='none')return simpleAsset(await allocate(c,actor,parent,row,own,parent.location_id,notes))
  return {...simpleAsset(source),quantity:1,componentId:row.id,stockAssetId:source.id,availableQuantity:source.quantity,pending:true,groupId:parent.id}
}
async function returnedStock(c,actor,unit,condition,locationId,notes) {
  const source=await one(c,'am_assets',unit.source_asset_id)
  // Never combine different conditions or silently change a warehouse record's condition.
  const matches=source.is_stock&&!source.archived_at&&source.operational_status!=='RETIRED'&&source.custodian_type==='none'&&!source.workstation_id&&
    source.category_id===unit.category_id&&source.brand===unit.brand&&source.model===unit.model&&simpleCondition(source)===condition&&source.location_id===locationId
  if(matches) {
    if(source.quantity>=1000000)bad('Warehouse quantity limit reached',409)
    return saveAsset(c,actor,source,{quantity:source.quantity+1},'GROUP_STOCK_RETURN',notes)
  }
  return createAsset(c,actor,{categoryId:unit.category_id,brand:unit.brand,model:unit.model,serialNumber:'',quantity:1,
    isStock:true,sourceAssetId:source.id,usageCondition:condition==='NEW'?'NEW':'USED',...{
      technicalCondition:condition==='OUT_OF_SERVICE'?'UNREPAIRABLE':'GOOD',operationalStatus:condition==='OUT_OF_SERVICE'?'RESERVED':'AVAILABLE'},
    locationId,custodianType:'none',employeeId:null,departmentId:null,receivedDate:null,supplier:'',notes:unit.notes},{simple:true})
}
export async function returnGroup(c,actor,parent,rows,{returnCondition:condition='USED',returnConditions:overrides=[],locationId,notes,repairConfirmed}) {
  const warehouse=await defaultWarehouse(c,locationId)
  const known=new Set(rows.flatMap(row=>[row.source_asset_id,row.allocated_asset_id]).filter(Boolean))
  for(const row of overrides)if(!known.has(row.assetId))bad('Return condition does not belong to this group')
  for(const row of rows)if(overrides.filter(item=>item.assetId===row.source_asset_id||item.assetId===row.allocated_asset_id).length>1)bad('Choose one return condition per component')
  for(const component of rows) {
    if(!component.allocated_asset_id)continue
    const unit=await one(c,'am_assets',component.allocated_asset_id)
    if(unit.workstation_id!==parent.id)bad('Group allocation changed; refresh and retry',409)
    const [[job]]=await c.execute("SELECT id FROM am_maintenance WHERE asset_id=? AND status='OPEN' FOR SHARE",[unit.id])
    if(job||simpleCondition(unit)==='IN_MAINTENANCE')bad('Finish component maintenance before returning it',409)
    const selected=overrides.find(row=>row.assetId===unit.id||row.assetId===component.source_asset_id)?.condition??condition
    if(['NEW','USED'].includes(selected)&&!['NEW','USED'].includes(simpleCondition(unit))&&(!repairConfirmed||!notes))bad('Confirm repair/inspection before returning a faulty unit as working')
    const after=await saveAsset(c,actor,unit,{workstation_id:null,custodian_type:'none',employee_id:null,department_id:null,
      location_id:warehouse.id,...state(selected,false)},'RETURN',notes)
    await historyLink(c,actor,parent.id,unit.id,'DETACH',{preserveComponent:true})
    let sourceId=component.source_asset_id
    if(unit.source_asset_id&&!unit.is_stock) {
      const stock=await returnedStock(c,actor,after,selected,warehouse.id,notes)
      sourceId=stock.id
      await saveAsset(c,actor,after,{archived_at:new Date()},'MERGE_TO_WAREHOUSE',notes)
    }
    await update(c,'am_group_components',component.id,{allocated_asset_id:null,source_asset_id:sourceId})
    await audit(c,actor,'workstation',parent.id,'COMPONENT_RETURN',component,{...component,allocated_asset_id:null,source_asset_id:sourceId,condition:selected})
  }
  return warehouse.id
}
export async function replacePending(c,actor,parent,oldComponent,replacement,notes) {
  if(replacement.archived_at||replacement.custodian_type!=='none'||replacement.workstation_id)bad('Choose an unassigned replacement',409)
  const before=await one(c,'am_assets',oldComponent.source_asset_id)
  await endComponent(c,actor,oldComponent)
  const next=await trackComponent(c,actor,parent.id,replacement.id)
  const record={id:randomUUID(),old_asset_id:before.id,new_asset_id:replacement.id,reason:notes||'Group component replacement',ticket_id:null,actor_id:actor.id,created_at:new Date()}
  await insert(c,'am_replacements',record)
  await audit(c,actor,'workstation',parent.id,'REPLACE_PENDING',oldComponent,{...next,replacementId:record.id})
  await update(c,'am_workstations',parent.id,{version:parent.version+1})
  return {replacementId:record.id,oldAsset:simpleAsset(before),replacementAsset:{...simpleAsset(replacement),quantity:1,pending:true,componentId:next.id,stockAssetId:replacement.id,availableQuantity:replacement.quantity}}
}
