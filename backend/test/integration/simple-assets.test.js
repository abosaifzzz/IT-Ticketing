import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID,randomBytes} from 'node:crypto'
import {once} from 'node:events'
import {testEnvironment} from '../support/database.js'
import {createPool} from '../../src/db/pool.js'
import {createMySqlUserRepository} from '../../src/repositories/mysqlUserRepository.js'
import {createMySqlSessionRepository} from '../../src/repositories/mysqlSessionRepository.js'
import {createLocalAccountService} from '../support/accounts.js'
import {createLocalPasswordProvider} from '../../src/auth/localPasswordProvider.js'
import {createAuthService} from '../../src/auth/authService.js'
import {createMySqlReferenceRepository} from '../../src/repositories/mysqlReferenceRepository.js'
import {createMySqlEmployeeDirectoryRepository} from '../../src/repositories/mysqlEmployeeDirectoryRepository.js'
import {createAssetManagementRepository} from '../../src/assetManagement/repository.js'
import {createApp} from '../../src/app.js'

const suffix=randomUUID(),password=randomBytes(20).toString('hex'),origin='http://localhost:5173'
const accounts={},cookies={}
let pool,repo,server,url,department,employee,location,otherLocation,requiredType,optionalType,disabledType,first,second,parent
const run=(op,body={},role='manager')=>repo.execute(op,{clientRequestId:randomUUID(),...body},accounts[role])
const makeAsset=(extra={})=>run('simpleAssetCreate',{assetTypeId:optionalType.id,locationId:location.id,brand:suffix,...extra})
before(async()=>{
 const e=await testEnvironment()
 pool=createPool({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD})
 await pool.query('SELECT serial_mode FROM am_categories LIMIT 0')
 await pool.query('SELECT quantity,is_stock FROM am_assets LIMIT 0')
 await pool.query('SELECT id FROM am_group_components LIMIT 0')
 repo=createAssetManagementRepository(pool)
 const users=createMySqlUserRepository(pool),provision=createLocalAccountService(users)
 for(const role of ['manager','technician','employee'])accounts[role]=await provision.create({email:'simple-'+role+'-'+suffix+'@demo.example',fullName:'Fictional '+role,role,password})
 department=await createMySqlReferenceRepository(pool,'departments').save({name:'Simple test '+suffix,isActive:true})
 employee=await createMySqlEmployeeDirectoryRepository(pool).create({fullName:'Fictional group custodian '+suffix,departmentId:department.id},accounts.manager)
 location=await run('locations',{name:'Simple room '+suffix})
 await run('locations',{name:'Main warehouse '+suffix,kind:'WAREHOUSE'})
 otherLocation=await run('locations',{name:'Simple destination '+suffix})
 const authService=createAuthService({provider:await createLocalPasswordProvider(users),sessions:createMySqlSessionRepository(pool)})
 server=createApp({authService,assetManagementRepository:repo,config:{nodeEnv:'test',appOrigin:origin}}).listen(0,'127.0.0.1')
 await once(server,'listening');url='http://127.0.0.1:'+server.address().port
 for(const role of Object.keys(accounts)){
  const response=await fetch(url+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:accounts[role].email,password})})
  assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie').split(';')[0]
 }
})
after(async()=>{
 if(server)await new Promise(r=>server.close(r))
 if(!pool)return
 try{
  const actors=Object.values(accounts).map(a=>a.id);if(!actors.length)return
  const marks=actors.map(()=>'?').join(',')
  const [assets]=await pool.query(`SELECT DISTINCT entity_id id FROM am_audit WHERE entity_type='asset' AND actor_id IN (${marks})`,actors)
  const [locations]=await pool.execute('SELECT id FROM am_locations WHERE name LIKE ?',['%'+suffix])
  const [groups]=await pool.execute('SELECT id FROM am_workstations WHERE name LIKE ?',['%'+suffix])
  const [types]=await pool.execute('SELECT id FROM am_categories WHERE name LIKE ?',['%'+suffix])
  await pool.query(`DELETE FROM notifications WHERE event_id IN (SELECT id FROM am_audit WHERE actor_id IN (${marks}))`,actors)
  await pool.query(`DELETE FROM notification_events WHERE id IN (SELECT id FROM am_audit WHERE actor_id IN (${marks}))`,actors)
  await pool.query(`DELETE FROM am_group_components WHERE added_by IN (${marks}) OR removed_by IN (${marks})`,[...actors,...actors]);await pool.query(`DELETE FROM am_group_memberships WHERE added_by IN (${marks}) OR ended_by IN (${marks})`,[...actors,...actors])
  for(const table of ['am_ticket_links','am_workstation_history'])await pool.query(`DELETE FROM ${table} WHERE actor_id IN (${marks})`,actors)
  await pool.query(`DELETE FROM am_custody WHERE issued_by IN (${marks})`,actors)
  await pool.query(`DELETE FROM am_maintenance WHERE engineer_id IN (${marks})`,actors)
  await pool.query(`DELETE FROM am_movements WHERE actor_id IN (${marks})`,actors)
  await pool.query(`DELETE FROM am_replacements WHERE actor_id IN (${marks})`,actors)
  await pool.query(`DELETE FROM am_audit WHERE actor_id IN (${marks})`,actors)
  await pool.query(`DELETE FROM am_operations WHERE actor_id IN (${marks})`,actors)
  for(const asset of assets)await pool.execute('UPDATE am_assets SET source_asset_id=NULL WHERE id=?',[asset.id])
  for(const asset of assets)await pool.execute('DELETE FROM am_assets WHERE id=?',[asset.id])
  for(const group of groups)await pool.execute('DELETE FROM am_workstations WHERE id=?',[group.id])
  for(const type of types){await pool.execute('DELETE FROM am_sequences WHERE category_id=?',[type.id]);await pool.execute('DELETE FROM am_categories WHERE id=?',[type.id])}
  for(const l of locations)await pool.execute('DELETE FROM am_locations WHERE id=?',[l.id])
  for(const a of actors)await pool.execute('DELETE FROM employee_directory WHERE created_by_account_id=?',[a])
  if(department)await pool.execute('DELETE FROM departments WHERE id=?',[department.id])
  for(const a of actors)await pool.execute('DELETE FROM users WHERE id=?',[a])
 }finally{await pool.end()}
})
const http=(path,{role='manager',method='GET',body,requestOrigin=origin}={})=>fetch(url+'/api/asset-management/simple'+path,{method,headers:{...(cookies[role]?{Cookie:cookies[role]}:{}),...(requestOrigin?{Origin:requestOrigin}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})

test('simple API preserves role and Origin protection, including DELETE',async()=>{
 for(const role of ['employee','anonymous'])assert.equal((await http('/assets',{role})).status,role==='employee'?403:401)
 assert.equal((await http('/types',{role:'employee',method:'POST',body:{name:'Forbidden',clientRequestId:randomUUID()}})).status,403)
 assert.equal((await http('/assets/'+randomUUID(),{method:'DELETE',body:{clientRequestId:randomUUID()},requestOrigin:null})).status,403)
})
test('serial policy is configured per type, supports optional/disabled/duplicates, and never hardcodes PC',async()=>{
 requiredType=await run('simpleTypeCreate',{name:'Required printer '+suffix,serialMode:'REQUIRED',prefix:'Z'+suffix.replaceAll('-','').slice(0,8).toUpperCase()})
 optionalType=await run('simpleTypeCreate',{name:'Optional monitor '+suffix,serialMode:'OPTIONAL'})
 disabledType=await run('simpleTypeCreate',{name:'Disabled sensor '+suffix,serialMode:'DISABLED'})
 await assert.rejects(makeAsset({assetTypeId:requiredType.id}),{status:400})
 const created=await makeAsset({assetTypeId:requiredType.id,serialNumber:' SN '+suffix+' '})
 assert.equal(created.assetTypeId,requiredType.id)
 await assert.rejects(makeAsset({assetTypeId:requiredType.id,serialNumber:('sn'+suffix).toUpperCase()}),{status:409})
 await assert.rejects(makeAsset({assetTypeId:disabledType.id,serialNumber:'not-allowed'}),{status:400})
 const plain=await makeAsset();assert.equal(plain.serialNumber,null)
 await run('simpleTypeUpdate',{id:optionalType.id,uniqueSerial:false})
 await makeAsset({serialNumber:'shared-'+suffix});await makeAsset({serialNumber:'shared-'+suffix})
 await assert.rejects(run('simpleTypeUpdate',{id:optionalType.id,uniqueSerial:true}),{status:409})
 await assert.rejects(run('simpleTypeUpdate',{id:optionalType.id,serialMode:'REQUIRED'}),{status:400})
})
test('individual CRUD produces immutable IDs and safe updates/soft deletion',async()=>{
 const assets=await Promise.all(Array.from({length:6},()=>makeAsset({condition:'NEW'})))
 assert.equal(new Set(assets.map(a=>a.internalAssetId)).size,6)
 const current=assets[0]
 assert.equal(current.condition,'NEW');const createdDetail=await repo.simpleDetail('assets',current.id,accounts.manager);assert.equal(createdDetail.history.find(h=>h.action==='RECEIVE').newValues.condition,'NEW')
 const updated=await run('simpleAssetUpdate',{id:current.id,brand:'Updated '+suffix,notes:'Fictional note'})
 assert.equal(updated.internalAssetId,current.internalAssetId)
 await assert.rejects(run('simpleAssetUpdate',{id:current.id,internalAssetId:'forged'}),{status:400})
 await assert.rejects(run('simpleAssetUpdate',{id:current.id,cpu:'forbidden'}),{status:400})
 await assert.rejects(run('simpleAssetDelete',{id:current.id},'employee'),{status:403})
 await run('simpleAssetDelete',{id:current.id})
 await assert.rejects(repo.simpleDetail('assets',current.id,accounts.manager),{status:404})
 const [[stored]]=await pool.execute('SELECT archived_at FROM am_assets WHERE id=?',[current.id]);assert.ok(stored.archived_at)
})
test('groups accept any types and synchronize employee custody/location atomically',async()=>{
 first=await makeAsset({assetTypeId:requiredType.id,serialNumber:'group-'+suffix,condition:'NEW'})
 second=await makeAsset({assetTypeId:disabledType.id,condition:'FAULTY'})
 parent=await run('simpleGroupCreate',{name:'Desktop '+suffix,description:'Flexible mixed group'})
 await run('simpleGroupAdd',{id:parent.id,assetId:first.id})
 await run('simpleGroupAdd',{id:parent.id,assetId:second.id})
 await run('simpleGroupCustody',{id:parent.id,action:'ASSIGN',locationId:otherLocation.id,custodianType:'employee',custodianId:employee.id})
 const saved=await repo.simpleDetail('groups',parent.id,accounts.manager)
 assert.equal(saved.members.length,2)
 for(const member of saved.members){assert.equal(member.custodianType,'employee');assert.equal(member.custodianId,employee.id);assert.equal(member.locationId,otherLocation.id)}
 assert.equal(saved.members.find(m=>m.id===second.id).condition,'FAULTY')
 await assert.rejects(run('simpleAssetDelete',{id:first.id}),{status:409})
 await assert.rejects(run('simpleAssetCustody',{id:first.id,action:'RETURN',locationId:location.id,custodianType:'none'}),{status:409})
})
test('removing a member keeps its individual custody and replacement history stays complete',async()=>{
 await run('simpleGroupRemove',{id:parent.id,assetId:second.id})
 const detached=await repo.simpleDetail('assets',second.id,accounts.manager)
 assert.equal(detached.groupId,null);assert.equal(detached.custodianId,employee.id)
 assert.ok(detached.memberships[0].ended_at)
 const replacement=await makeAsset({assetTypeId:disabledType.id,condition:'USED'})
 const body={id:parent.id,oldAssetId:first.id,replacementAssetId:replacement.id,oldLocationId:location.id,clientRequestId:randomUUID(),notes:'Component upgrade'}
 const changed=await run('simpleGroupReplace',body)
 assert.equal((await run('simpleGroupReplace',body)).replacementId,changed.replacementId)
 assert.equal(changed.oldAsset.custodianType,'none');assert.equal(changed.replacementAsset.custodianId,employee.id)
 const saved=await repo.simpleDetail('groups',parent.id,accounts.manager)
 assert.equal(saved.members.length,1);assert.equal(saved.members[0].id,replacement.id)
 assert.ok(saved.membershipHistory.some(m=>m.asset_id===first.id&&m.replaced_by_asset_id===replacement.id))
})
test('group replacement rolls back completely on a mid-operation failure',async()=>{
 const group=await run('simpleGroupCreate',{name:'Rollback '+suffix})
 const old=await makeAsset(),next=await makeAsset()
 await run('simpleGroupAdd',{id:group.id,assetId:old.id})
 const failing=createAssetManagementRepository({async getConnection(){const c=await pool.getConnection();return new Proxy(c,{get(target,property){if(property==='execute')return async(sql,values)=>{if(sql.startsWith('INSERT INTO am_group_memberships'))throw Error('Injected membership failure');return target.execute(sql,values)};const value=target[property];return typeof value==='function'?value.bind(target):value}})}})
 await assert.rejects(failing.execute('simpleGroupReplace',{id:group.id,oldAssetId:old.id,replacementAssetId:next.id,clientRequestId:randomUUID()},accounts.manager))
 assert.equal((await repo.simpleDetail('assets',old.id,accounts.manager)).groupId,group.id)
 assert.equal((await repo.simpleDetail('assets',next.id,accounts.manager)).groupId,null)
})
test('concurrent membership changes cannot put one physical asset in two active groups',async()=>{
 const asset=await makeAsset(),a=await run('simpleGroupCreate',{name:'Race A '+suffix}),b=await run('simpleGroupCreate',{name:'Race B '+suffix})
 const results=await Promise.allSettled([run('simpleGroupAdd',{id:a.id,assetId:asset.id}),run('simpleGroupAdd',{id:b.id,assetId:asset.id})])
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 const [[count]]=await pool.execute('SELECT COUNT(*) n FROM am_group_memberships WHERE asset_id=? AND ended_at IS NULL',[asset.id]);assert.equal(count.n,1)
})
test('maintenance is a simple condition change with repair confirmation and permanent history',async()=>{
 const asset=await makeAsset({condition:'NEW'})
 await run('simpleAssetCondition',{id:asset.id,condition:'FAULTY',notes:'Fictional fault'})
 await run('simpleAssetCondition',{id:asset.id,condition:'IN_MAINTENANCE',notes:'Repair started'})
 await assert.rejects(run('simpleAssetCondition',{id:asset.id,condition:'USED'}),{status:400})
 await run('simpleAssetCondition',{id:asset.id,condition:'USED',repairConfirmed:true,notes:'Repaired and inspected'})
 const saved=await repo.simpleDetail('assets',asset.id,accounts.manager)
 assert.equal(saved.condition,'USED');assert.ok(saved.history.some(h=>h.action==='MAINTENANCE_ENTRY'));assert.ok(saved.history.some(h=>h.action==='MAINTENANCE_RETURN'))
})
test('dashboard counts physical assets once and lists/search/pagination persist',async()=>{
 const result=await repo.simpleList('assets',{search:suffix,page:'1',pageSize:'2'},accounts.manager)
 assert.equal(result.items.length,2);assert.ok(result.total>2)
 const page2=await repo.simpleList('assets',{search:suffix,page:'2',pageSize:'2'},accounts.manager)
 assert.ok(page2.items.every(item=>!result.items.some(first=>first.id===item.id)))
 const stats=await repo.simpleDashboard({},accounts.manager)
 const [[count]]=await pool.query("SELECT COUNT(*) n FROM am_assets WHERE archived_at IS NULL AND operational_status<>'RETIRED'")
 assert.equal(stats.total,count.n);assert.equal(stats.byCondition.reduce((n,r)=>n+Number(r.count),0),stats.total)
 const response=await http('/assets?search='+suffix);assert.equal(response.status,200)
 assert.deepEqual(Object.keys(await response.json()).sort(),['items','page','pageSize','total'])
})

test('group transfer and return synchronize members while detached assets keep their own custody',async()=>{
 await run('simpleGroupCustody',{id:parent.id,action:'TRANSFER',locationId:location.id,custodianType:'department',custodianId:department.id})
 let saved=await repo.simpleDetail('groups',parent.id,accounts.manager)
 for(const member of saved.members){assert.equal(member.custodianType,'department');assert.equal(member.custodianId,department.id);assert.equal(member.locationId,location.id)}
 assert.equal((await repo.simpleDetail('assets',second.id,accounts.manager)).custodianId,employee.id)
 await run('simpleGroupCustody',{id:parent.id,action:'RETURN',locationId:location.id,custodianType:'none'})
 saved=await repo.simpleDetail('groups',parent.id,accounts.manager)
 assert.ok(saved.members.every(m=>m.custodianType==='none'))
 await assert.rejects(run('simpleGroupDelete',{id:parent.id}),{status:409})
 for(const member of saved.members)await run('simpleGroupRemove',{id:parent.id,assetId:member.id})
 const response=await http('/groups/'+parent.id,{method:'DELETE',body:{clientRequestId:randomUUID()}})
 assert.equal(response.status,200);assert.ok((await response.json()).item.deletedAt)
})
test('type soft-deletion preserves its historical record and existing workstation clients share membership history',async()=>{
 const unused=await run('simpleTypeCreate',{name:'Unused '+suffix,serialMode:'OPTIONAL'})
 const response=await http('/types/'+unused.id,{method:'DELETE',body:{clientRequestId:randomUUID()}})
 assert.equal(response.status,200);assert.equal((await response.json()).item.isActive,false)
 assert.equal((await repo.simpleDetail('types',unused.id,accounts.manager)).isActive,false)
 await assert.rejects(makeAsset({assetTypeId:unused.id}),{status:400})
 const legacy=await run('workstations',{name:'Legacy group '+suffix,locationId:location.id,custodianType:'department',departmentId:department.id})
 const asset=await makeAsset()
 await run('workstationAttach',{id:legacy.id,assetId:asset.id,reason:'Compatibility attachment'})
 const detail=await repo.simpleDetail('groups',legacy.id,accounts.manager)
 assert.equal(detail.members[0].id,asset.id);assert.equal(detail.membershipHistory.filter(m=>!m.ended_at).length,1)
 await run('workstationDetach',{id:legacy.id,assetId:asset.id,reason:'Compatibility detach'})
 assert.ok((await repo.simpleDetail('assets',asset.id,accounts.manager)).memberships[0].ended_at)
})

for (const role of ['technician','manager']) test(role+' has complete simple asset access with real audit identity and integrity guards',async()=>{
 const write=async(method,path,body={})=>{
  const response=await http(path,{role,method,body:{clientRequestId:randomUUID(),...body}})
  const data=await response.json()
  assert.equal(response.status,method==='POST'?201:200,JSON.stringify(data))
  return data.item
 }
 const type=await write('POST','/types',{name:'Parity '+role+' '+suffix,serialMode:'OPTIONAL'})
 await write('PATCH','/types/'+type.id,{serialMode:'REQUIRED',uniqueSerial:true})
 const create=serial=>write('POST','/assets',{assetTypeId:type.id,locationId:location.id,brand:suffix,serialNumber:role+serial+suffix})
 const asset=await create('first'),replacement=await create('second')
 await write('PATCH','/assets/'+asset.id,{notes:'Actual actor '+role})
 for(const condition of ['FAULTY','IN_MAINTENANCE','USED'])await write('POST','/assets/'+asset.id+'/condition',{condition,repairConfirmed:condition==='USED',notes:'Fictional repair and inspection'})
 for(const action of ['ASSIGN','TRANSFER','RETURN'])await write('POST','/assets/'+asset.id+'/custody',{action,locationId:location.id,custodianType:action==='RETURN'?'none':'employee',...(action==='RETURN'?{}:{custodianId:employee.id})})
 const group=await write('POST','/groups',{name:'Parity group '+role+' '+suffix})
 await write('PATCH','/groups/'+group.id,{description:'Updated group'})
 await write('POST','/groups/'+group.id+'/members',{assetId:asset.id})
 assert.equal((await http('/assets/'+asset.id,{role,method:'DELETE',body:{clientRequestId:randomUUID()}})).status,409)
 for(const action of ['ASSIGN','TRANSFER'])await write('POST','/groups/'+group.id+'/custody',{action,locationId:location.id,custodianType:'employee',custodianId:employee.id})
 await write('POST','/groups/'+group.id+'/replace-member',{oldAssetId:asset.id,replacementAssetId:replacement.id})
 await write('POST','/groups/'+group.id+'/custody',{action:'RETURN',locationId:location.id,custodianType:'none'})
 await write('POST','/groups/'+group.id+'/remove-member',{assetId:replacement.id})
 await write('DELETE','/groups/'+group.id)
 for(const a of [asset,replacement])await write('DELETE','/assets/'+a.id)
 await write('DELETE','/types/'+type.id)
 for(const path of ['/assets','/types','/groups','/dashboard'])assert.equal((await http(path,{role})).status,200)
 const [audit]=await pool.execute('SELECT actor_id FROM am_audit WHERE entity_id IN (?,?,?,?)',[type.id,asset.id,replacement.id,group.id])
 assert.ok(audit.length>15);assert.ok(audit.every(row=>row.actor_id===accounts[role].id))
 const [moves]=await pool.execute('SELECT actor_id FROM am_movements WHERE asset_id IN (?,?)',[asset.id,replacement.id])
 assert.ok(moves.length>5);assert.ok(moves.every(row=>row.actor_id===accounts[role].id))
 for(const path of ['/assets/'+asset.id,'/groups/'+group.id,'/types/'+type.id])assert.equal((await http(path,{role:'employee',method:'DELETE',body:{clientRequestId:randomUUID()}})).status,403)
})

test('both IT roles manage maintenance owned by another engineer without substituting actor identity',async()=>{
 accounts.otherEngineer=await createLocalAccountService(createMySqlUserRepository(pool)).create({email:'other-engineer-'+suffix+'@demo.example',fullName:'Fictional other engineer',role:'technician',password})
 for(const role of ['technician','manager']){
  const asset=await makeAsset({condition:'FAULTY'})
  const job=await run('maintenance',{assetId:asset.id,engineerId:accounts.otherEngineer.id,locationId:location.id,issue:'Fictional fault'},role)
  await run('maintenanceComplete',{id:job.id,outcome:'REPAIRED',inspectionConfirmed:true,actionTaken:'Inspected and repaired',locationId:location.id},role)
  const [audit]=await pool.execute("SELECT actor_id FROM am_audit WHERE entity_type='maintenance' AND entity_id=?",[job.id])
  assert.ok(audit.length>=2);assert.ok(audit.every(row=>row.actor_id===accounts[role].id))
  await run('simpleAssetCondition',{id:asset.id,condition:'FAULTY',notes:'Another fault'},role)
  const next=await run('maintenance',{assetId:asset.id,engineerId:accounts.otherEngineer.id,locationId:location.id,issue:'Second fault'},role)
  await run('simpleAssetCondition',{id:asset.id,condition:'USED',repairConfirmed:true,notes:'Repair and inspection confirmed'},role)
  const [[stored]]=await pool.execute('SELECT status FROM am_maintenance WHERE id=?',[next.id]);assert.equal(stored.status,'CLOSED')
 }
})

for(const role of ['technician','manager'])test(role+' creates one quantity record, restores it on refresh and retries without duplication',async()=>{
 const body={clientRequestId:randomUUID(),assetTypeId:disabledType.id,locationId:location.id,brand:'Quantity '+role+' '+suffix,quantity:10,condition:'NEW'}
 const response=await http('/assets',{role,method:'POST',body});assert.equal(response.status,201)
 const created=(await response.json()).item
 assert.equal(created.quantity,10);assert.equal(created.serialNumber,null);assert.ok(created.id);assert.ok(created.internalAssetId)
 const replay=await http('/assets',{role,method:'POST',body});assert.equal(replay.status,201)
 assert.equal((await replay.json()).item.id,created.id)
 const read=await http('/assets/'+created.id,{role});assert.equal(read.status,200)
 const detail=(await read.json()).item
 assert.equal(detail.quantity,10);assert.equal(detail.history.find(h=>h.action==='RECEIVE').newValues.quantity,10)
 const list=await repo.simpleList('assets',{search:body.brand},accounts[role]);assert.equal(list.total,1);assert.equal(list.items[0].quantity,10)
 const [[stored]]=await pool.execute('SELECT quantity FROM am_assets WHERE id=?',[created.id]);assert.equal(stored.quantity,10)
 const [[movement]]=await pool.execute("SELECT actor_id,quantity FROM am_movements WHERE asset_id=? AND type='RECEIVE'",[created.id])
 assert.equal(movement.quantity,10);assert.equal(movement.actor_id,accounts[role].id)
 const changed=await http('/assets/'+created.id,{role,method:'PATCH',body:{clientRequestId:randomUUID(),expectedVersion:created.version,quantity:12}})
 assert.equal(changed.status,200);assert.equal((await changed.json()).item.quantity,12)
 const current=await repo.simpleDetail('assets',created.id,accounts[role]);assert.ok(current.history.some(h=>h.oldValues?.quantity===10&&h.newValues?.quantity===12))
 assert.equal((await http('/assets/'+created.id,{role,method:'PATCH',body:{clientRequestId:randomUUID(),expectedVersion:created.version,quantity:99}})).status,409)
 assert.equal((await http('/assets',{role,method:'POST',body:{...body,quantity:9}})).status,409)
})

test('configured serialized types require separate devices and reject duplicate serials and quantity changes',async()=>{
 const body={clientRequestId:randomUUID(),assetTypeId:requiredType.id,locationId:location.id,serialNumber:'Quantity-serial-'+suffix,brand:suffix,quantity:1}
 const created=await run('simpleAssetCreate',body,'technician')
 for(const quantity of [2,10])await assert.rejects(run('simpleAssetCreate',{...body,clientRequestId:randomUUID(),quantity}),{status:400})
 await assert.rejects(run('simpleAssetCreate',{...body,clientRequestId:randomUUID(),serialNumber:''}),{status:400})
 await assert.rejects(run('simpleAssetCreate',{...body,clientRequestId:randomUUID(),serialNumber:body.serialNumber.toLowerCase()}),{status:409})
 await assert.rejects(run('simpleAssetUpdate',{id:created.id,quantity:10}),{status:400})
 const batch=await makeAsset({quantity:4})
 await assert.rejects(run('simpleAssetUpdate',{id:batch.id,serialNumber:'One serial for four'}),{status:400})
 await assert.rejects(run('simpleAssetUpdate',{id:batch.id,assetTypeId:requiredType.id,serialNumber:'Four devices'}),{status:400})
 const optional=await run('simpleTypeCreate',{name:'Quantity policy '+suffix,serialMode:'OPTIONAL'})
 await makeAsset({assetTypeId:optional.id,quantity:5})
 await assert.rejects(run('simpleTypeUpdate',{id:optional.id,serialMode:'REQUIRED'}),{status:400})
 const type=await repo.simpleDetail('types',optional.id,accounts.manager);assert.equal(type.serialMode,'OPTIONAL')
})

test('quantity edits validate boundaries and cannot bypass custody, groups or maintenance',async()=>{
 const batch=await makeAsset({assetTypeId:disabledType.id,quantity:6})
 for(const quantity of [0,-1,1.5,'10',1000001,null]){
  assert.equal((await http('/assets',{method:'POST',body:{clientRequestId:randomUUID(),assetTypeId:disabledType.id,locationId:location.id,quantity}})).status,400)
  assert.equal((await http('/assets/'+batch.id,{method:'PATCH',body:{clientRequestId:randomUUID(),quantity}})).status,400)
 }
 // Assigning warehouse stock issues only the chosen units; the rest stay in stock.
 const issued=await run('simpleAssetCustody',{id:batch.id,action:'ASSIGN',locationId:location.id,custodianType:'employee',custodianId:employee.id,quantity:2})
 assert.equal(issued.quantity,2);assert.equal(issued.issuedFromStockId,batch.id);assert.equal(issued.custodianType,'employee')
 assert.equal((await repo.simpleDetail('assets',batch.id,accounts.manager)).quantity,4)
 await assert.rejects(run('simpleAssetCustody',{id:batch.id,action:'ASSIGN',locationId:location.id,custodianType:'employee',custodianId:employee.id,quantity:5}),{status:409})
 await assert.rejects(run('simpleAssetUpdate',{id:issued.id,quantity:3}),{status:409})
 await assert.rejects(run('simpleAssetDelete',{id:issued.id}),{status:409})
 await assert.rejects(run('simpleAssetDelete',{id:batch.id}),{status:409})
 await run('simpleAssetCustody',{id:issued.id,action:'TRANSFER',locationId:otherLocation.id,custodianType:'department',custodianId:department.id})
 const assigned=await repo.simpleDetail('assets',issued.id,accounts.manager);assert.equal(assigned.quantity,2);assert.equal(assigned.assignments.filter(a=>!a.ended_at).length,1)
 // Returning merges the units back into the warehouse record.
 const merged=await run('simpleAssetCustody',{id:issued.id,action:'RETURN',locationId:location.id,custodianType:'none'})
 assert.equal(merged.id,batch.id);assert.equal(merged.quantity,6);assert.equal(merged.mergedFromAssetId,issued.id)
 await assert.rejects(repo.simpleDetail('assets',issued.id,accounts.manager),{status:404})
 // Receiving more units adds to the warehouse record.
 assert.equal((await run('simpleAssetReceive',{id:batch.id,quantity:4,notes:'New box'})).quantity,10)
 assert.equal((await run('simpleAssetUpdate',{id:batch.id,quantity:6})).quantity,6)
 const serialized=await makeAsset({assetTypeId:requiredType.id,serialNumber:'Receive '+suffix})
 await assert.rejects(run('simpleAssetReceive',{id:serialized.id,quantity:1}),{status:400})
 const group=await run('simpleGroupCreate',{name:'Quantity group '+suffix})
 assert.equal((await run('simpleGroupAdd',{id:group.id,assetId:batch.id})).pending,true)
 const member=await makeAsset();await run('simpleGroupAdd',{id:group.id,assetId:member.id})
 await assert.rejects(run('simpleAssetUpdate',{id:member.id,quantity:2}),{status:409})
 await assert.rejects(run('simpleGroupReplace',{id:group.id,oldAssetId:member.id,replacementAssetId:batch.id}),{status:409})
 await run('simpleAssetCondition',{id:batch.id,condition:'IN_MAINTENANCE',notes:'Whole batch maintenance'})
 await assert.rejects(run('simpleAssetUpdate',{id:batch.id,quantity:2}),{status:409})
 await run('simpleAssetCondition',{id:batch.id,condition:'USED',repairConfirmed:true,notes:'Batch inspected'})
 assert.equal((await run('simpleAssetUpdate',{id:batch.id,quantity:8})).quantity,8)
 assert.equal((await http('/assets',{role:'employee',method:'POST',body:{clientRequestId:randomUUID(),assetTypeId:disabledType.id,locationId:location.id,quantity:10}})).status,403)
})

test('quantity-aware dashboards count units while pagination counts records and deletion preserves history',async()=>{
 const brand='Quantity totals '+suffix
 const asset=await makeAsset({brand,quantity:10})
 await makeAsset({brand,quantity:3})
 const list=await repo.simpleList('assets',{search:brand,pageSize:'1'},accounts.manager)
 assert.equal(list.total,2);assert.equal(list.items.length,1)
 const dashboard=await repo.simpleDashboard({search:brand},accounts.manager)
 assert.equal(dashboard.total,13)
 for(const key of ['byType','byCondition','byAssignment','byLocation'])assert.equal(dashboard[key].reduce((sum,row)=>sum+row.count,0),13)
 const all=await repo.simpleDashboard({},accounts.manager),[[expected]]=await pool.query("SELECT COALESCE(SUM(quantity),0) n FROM am_assets WHERE archived_at IS NULL AND operational_status<>'RETIRED'")
 assert.equal(all.total,Number(expected.n))
 await run('simpleAssetDelete',{id:asset.id})
 assert.equal((await repo.simpleDashboard({search:brand},accounts.manager)).total,3)
 const [[saved]]=await pool.execute('SELECT quantity,archived_at FROM am_assets WHERE id=?',[asset.id]);assert.equal(saved.quantity,10);assert.ok(saved.archived_at)
 const [audit]=await pool.execute("SELECT actor_id FROM am_audit WHERE entity_type='asset' AND entity_id=?",[asset.id]);assert.ok(audit.length>=3)
 const response=await fetch(url+'/api/asset-management/reports/assets?format=csv',{headers:{Cookie:cookies.technician,Origin:origin}})
 assert.equal(response.status,200);assert.ok((await response.text()).includes('quantity'))
})

test('concurrent quantity edits commit one version and database constraints reject contradictory batches',async()=>{
 const batch=await makeAsset({quantity:10})
 const edits=await Promise.allSettled([run('simpleAssetUpdate',{id:batch.id,quantity:8,expectedVersion:batch.version}),run('simpleAssetUpdate',{id:batch.id,quantity:12,expectedVersion:batch.version})])
 assert.equal(edits.filter(result=>result.status==='fulfilled').length,1)
 assert.equal(edits.find(result=>result.status==='rejected').reason.status,409)
 const saved=await repo.simpleDetail('assets',batch.id,accounts.manager)
 assert.ok([8,12].includes(saved.quantity));assert.equal(saved.version,batch.version+1)
 const legacy=await run('workstations',{name:'Quantity compatibility '+suffix,locationId:location.id,custodianType:'department',departmentId:department.id})
 await assert.rejects(run('workstationAttach',{id:legacy.id,assetId:batch.id,reason:'Cannot group a batch'}),{status:409})
 const member=await makeAsset();await run('workstationAttach',{id:legacy.id,assetId:member.id,reason:'Install one unit'})
 await assert.rejects(run('replacement',{oldAssetId:member.id,replacementAssetId:batch.id,oldDestinationId:location.id,failureReason:'Cannot replace with a batch'}),{status:409})
 await assert.rejects(pool.execute('UPDATE am_assets SET quantity=1000001 WHERE id=?',[batch.id]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'})
 await assert.rejects(pool.execute('UPDATE am_assets SET quantity=2 WHERE id=?',[member.id]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'})
 await assert.rejects(pool.execute('UPDATE am_assets SET quantity=0 WHERE id=?',[member.id]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'})
 const serialized=await makeAsset({assetTypeId:requiredType.id,serialNumber:'DB-quantity-'+suffix})
 await assert.rejects(pool.execute('UPDATE am_assets SET quantity=2 WHERE id=?',[serialized.id]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'})
})

const groupRead=id=>repo.simpleDetail('groups',id,accounts.manager)
const unitsFor=brand=>repo.simpleDashboard({search:brand},accounts.manager)
const groupCreate=name=>run('simpleGroupCreate',{name:name+' '+suffix})

test('groups select quantity stock without reserving it and assignment consumes exactly one unit per component',async()=>{
 const brand='Composition '+suffix
 const keyboard=await makeAsset({brand,quantity:3,condition:'NEW'}),mouse=await makeAsset({brand,quantity:2,condition:'NEW'})
 const pc=await makeAsset({brand,assetTypeId:requiredType.id,serialNumber:'Composition-PC-'+suffix,condition:'NEW'})
 const g=await groupCreate('Composition')
 for(const asset of [keyboard,mouse,pc])await run('simpleGroupAdd',{id:g.id,assetId:asset.id})
 let detail=await groupRead(g.id);assert.equal(detail.members.length,3);assert.equal(detail.members.filter(m=>m.pending).length,2)
 assert.equal((await repo.simpleDetail('assets',keyboard.id,accounts.manager)).quantity,3)
 assert.equal((await unitsFor(brand)).totalUnits,6)
 const body={id:g.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id,clientRequestId:randomUUID()}
 await run('simpleGroupCustody',body,'technician');await run('simpleGroupCustody',body,'technician')
 assert.equal((await repo.simpleDetail('assets',keyboard.id,accounts.manager)).quantity,2)
 assert.equal((await repo.simpleDetail('assets',mouse.id,accounts.manager)).quantity,1)
 detail=await groupRead(g.id);assert.equal(detail.members.length,3);assert.ok(detail.members.every(m=>m.quantity===1&&m.custodianId===employee.id))
 const stats=await unitsFor(brand);assert.equal(stats.totalUnits,6);assert.equal(stats.employeeCustody,3);assert.equal(stats.unassigned,3)
 const listed=await repo.simpleList('assets',{search:brand,employeeId:employee.id},accounts.technician)
 assert.equal(listed.total,3);assert.ok(listed.items.every(row=>row.custodianName===employee.fullName))
 const named=await repo.simpleList('assets',{search:employee.fullName},accounts.manager);assert.ok(named.items.some(row=>row.id===pc.id))
 const filter=await repo.simpleList('assets',{search:brand,custodianSearch:employee.fullName},accounts.manager);assert.equal(filter.total,3)
 await run('simpleGroupCustody',{id:g.id,action:'TRANSFER',custodianType:'department',custodianId:department.id})
 assert.equal((await repo.simpleDetail('assets',keyboard.id,accounts.manager)).quantity,2)
 const departmentRows=await repo.simpleList('assets',{search:brand,departmentId:department.id},accounts.manager)
 assert.equal(departmentRows.total,3);assert.ok(departmentRows.items.every(row=>row.custodianName===department.name))
 const returned={id:g.id,action:'RETURN',custodianType:'none',returnCondition:'NEW',clientRequestId:randomUUID()}
 await run('simpleGroupCustody',returned);await run('simpleGroupCustody',returned)
 // The warehouse differs from this fixture's original room: no cross-location merging occurs.
 const after=await unitsFor(brand);assert.equal(after.totalUnits,6);assert.equal(after.employeeCustody,0);assert.equal(after.departmentCustody,0);assert.equal(after.unassigned,6)
 detail=await groupRead(g.id);assert.equal(detail.members.length,3);assert.ok(detail.members.every(m=>m.pending))
 assert.ok(detail.membershipHistory.filter(row=>row.ended_at).length>=3)
 await run('simpleGroupCustody',{id:g.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id})
 assert.equal((await unitsFor(brand)).employeeCustody,3)
})

test('group returns keep NEW, USED and OUT_OF_SERVICE stock separate and never issue broken units',async()=>{
 const brand='Return options '+suffix
 const stock=await run('simpleAssetCreate',{assetTypeId:disabledType.id,quantity:3,condition:'NEW',brand})
 const g=await groupCreate('Return options');await run('simpleGroupAdd',{id:g.id,assetId:stock.id})
 await run('simpleGroupCustody',{id:g.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id})
 const member=(await groupRead(g.id)).members[0]
 await assert.rejects(run('simpleGroupCustody',{id:g.id,action:'RETURN',custodianType:'none',returnConditions:[{assetId:randomUUID(),condition:'USED'}]}),{status:400})
 assert.equal((await repo.simpleDetail('assets',stock.id,accounts.manager)).quantity,2)
 await run('simpleGroupCustody',{id:g.id,action:'RETURN',custodianType:'none',returnCondition:'NEW'})
 assert.equal((await repo.simpleDetail('assets',stock.id,accounts.manager)).quantity,3)
 await run('simpleGroupCustody',{id:g.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id})
 const next=(await groupRead(g.id)).members[0]
 assert.notEqual(member.id,next.id)
 await run('simpleGroupCustody',{id:g.id,action:'RETURN',custodianType:'none',returnConditions:[{assetId:next.id,condition:'USED'}]})
 const used=(await groupRead(g.id)).members[0]
 assert.equal(used.condition,'USED');assert.equal(used.availableQuantity,1)
 assert.equal((await repo.simpleDetail('assets',stock.id,accounts.manager)).condition,'NEW')
 await run('simpleGroupCustody',{id:g.id,action:'ASSIGN',custodianType:'department',custodianId:department.id})
 await run('simpleGroupCustody',{id:g.id,action:'RETURN',custodianType:'none',returnCondition:'OUT_OF_SERVICE'})
 const broken=(await groupRead(g.id)).members[0]
 assert.equal(broken.condition,'OUT_OF_SERVICE')
 const stats=await unitsFor(brand);assert.equal(stats.totalUnits,3);assert.equal(stats.faulty,1);assert.equal(stats.unassigned,3)
 const out=await repo.simpleList('assets',{search:brand,condition:'OUT_OF_SERVICE'},accounts.manager);assert.equal(out.total,1)
 await assert.rejects(run('simpleGroupCustody',{id:g.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id}),{status:409})
 await run('simpleGroupRemove',{id:g.id,assetId:broken.stockAssetId})
 assert.equal((await groupRead(g.id)).members.length,0)
})

test('competing group assignments cannot consume the same last unit and shortages roll back every component',async()=>{
 const brand='Group race '+suffix
 let stock=await makeAsset({brand,quantity:2});stock=await run('simpleAssetUpdate',{id:stock.id,quantity:1})
 const a=await groupCreate('Stock race A'),b=await groupCreate('Stock race B')
 for(const g of [a,b])await run('simpleGroupAdd',{id:g.id,assetId:stock.id})
 const results=await Promise.allSettled([run('simpleGroupCustody',{id:a.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id},'technician'),run('simpleGroupCustody',{id:b.id,action:'ASSIGN',custodianType:'department',custodianId:department.id})])
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409)
 assert.equal((await repo.simpleDetail('assets',stock.id,accounts.manager)).quantity,0)
 assert.equal((await unitsFor(brand)).totalUnits,1)
 const rollback=await groupCreate('Shortage rollback')
 const available=await makeAsset({brand:'Rollback stock '+suffix,quantity:2})
 for(const asset of [available,stock])await run('simpleGroupAdd',{id:rollback.id,assetId:asset.id})
 await assert.rejects(run('simpleGroupCustody',{id:rollback.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id}),{status:409})
 assert.equal((await repo.simpleDetail('assets',available.id,accounts.manager)).quantity,2)
 assert.ok((await groupRead(rollback.id)).members.every(m=>m.pending))
})

test('allocation failures roll back stock, generated unit and component state; replacement accepts warehouse quantities',async()=>{
 const stock=await makeAsset({quantity:3}),replacement=await makeAsset({quantity:2})
 const g=await groupCreate('Allocation rollback');await run('simpleGroupAdd',{id:g.id,assetId:stock.id})
 const failing=createAssetManagementRepository({async getConnection(){const c=await pool.getConnection();return new Proxy(c,{get(target,property){if(property==='execute')return async(sql,values)=>{if(sql.startsWith('INSERT INTO am_assets'))throw Error('Injected allocation failure');return target.execute(sql,values)};const value=target[property];return typeof value==='function'?value.bind(target):value}})}})
 await assert.rejects(failing.execute('simpleGroupCustody',{id:g.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id,clientRequestId:randomUUID()},accounts.manager))
 assert.equal((await repo.simpleDetail('assets',stock.id,accounts.manager)).quantity,3)
 assert.ok((await groupRead(g.id)).members.every(m=>m.pending))
 await run('simpleGroupCustody',{id:g.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id})
 const old=(await groupRead(g.id)).members[0]
 const changed=await run('simpleGroupReplace',{id:g.id,oldAssetId:old.id,replacementAssetId:replacement.id})
 assert.equal(changed.replacementAsset.quantity,1);assert.equal(changed.replacementAsset.custodianId,employee.id)
 assert.equal((await repo.simpleDetail('assets',replacement.id,accounts.manager)).quantity,1)
 const pending=await groupCreate('Pending replacement');await run('simpleGroupAdd',{id:pending.id,assetId:stock.id})
 await run('simpleGroupReplace',{id:pending.id,oldAssetId:stock.id,replacementAssetId:replacement.id})
 assert.equal((await groupRead(pending.id)).members[0].stockAssetId,replacement.id)
})

test('individual return conditions and main warehouse defaults preserve ownership protections',async()=>{
 const asset=await run('simpleAssetCreate',{assetTypeId:optionalType.id,brand:'Default warehouse '+suffix})
 assert.ok(asset.locationId)
 await run('simpleAssetCustody',{id:asset.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id})
 const returned=await run('simpleAssetCustody',{id:asset.id,action:'RETURN',custodianType:'none',returnCondition:'OUT_OF_SERVICE'})
 assert.equal(returned.condition,'OUT_OF_SERVICE');assert.equal(returned.custodianType,'none')
 assert.equal((await http('/dashboard',{role:'employee'})).status,403)
 await assert.rejects(run('simpleAssetCustody',{id:asset.id,action:'RETURN',custodianType:'none',returnCondition:'NEW'}),{status:400})
})

test('reserved or retired source stock cannot be allocated and returns never refill retired records',async()=>{
 const stock=await run('simpleAssetCreate',{assetTypeId:optionalType.id,brand:'Retired source '+suffix,quantity:2,condition:'NEW'})
 const assigned=await groupCreate('Retired source assigned'),pending=await groupCreate('Retired source pending')
 for(const group of [assigned,pending])await run('simpleGroupAdd',{id:group.id,assetId:stock.id})
 await run('simpleGroupCustody',{id:assigned.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id})
 await run('assetMove',{id:stock.id,type:'RETIRE',reason:'Fictional retired remaining stock'})
 await assert.rejects(run('simpleGroupCustody',{id:pending.id,action:'ASSIGN',custodianType:'employee',custodianId:employee.id}),{status:409})
 await run('simpleGroupCustody',{id:assigned.id,action:'RETURN',custodianType:'none',returnCondition:'NEW'})
 const returned=(await groupRead(assigned.id)).members[0]
 assert.notEqual(returned.stockAssetId,stock.id);assert.equal(returned.availableQuantity,1)
 assert.equal((await repo.detail('assets',stock.id,accounts.manager)).quantity,1)
 await run('simpleGroupCustody',{id:assigned.id,action:'ASSIGN',custodianType:'department',custodianId:department.id})
 assert.equal((await groupRead(assigned.id)).members[0].quantity,1)
})
