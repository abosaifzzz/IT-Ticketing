import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createSimpleAssetService} from '../src/services/assets/simpleAssetService.js'
import {isQuantityLocked,updateAssetFormField,validateAssetQuantity} from '../src/services/assets/assetQuantityRules.js'

test('simple asset requests use the existing API path and backend envelopes', async()=>{
  const calls=[]
  const service=createSimpleAssetService({request:async(path,options)=>{calls.push({path,options});return path.includes('/dashboard')?{total:2}:path.includes('/assets?')?{items:[],total:0,page:1,pageSize:25}:{item:{id:'asset-id'}}}})
  assert.equal((await service.dashboard()).total,2)
  assert.equal((await service.list('assets',{assetTypeId:'type id',condition:'FAULTY'})).total,0)
  assert.equal((await service.detail('assets','asset/id')).id,'asset-id')
  assert.equal(calls[1].path,'/asset-management/simple/assets?assetTypeId=type+id&condition=FAULTY')
  assert.equal(calls[2].path,'/asset-management/simple/assets/asset%2Fid')
})

test('writes retain caller idempotency keys and never create a fake item', async()=>{
  const calls=[]
  const service=createSimpleAssetService({request:async(path,options)=>{calls.push({path,options});return {item:{id:'saved'}}}})
  await service.create('types',{name:'شاشة',serialMode:'OPTIONAL'},'same-key')
  await service.action('groups','group-id','replace-member',{oldAssetId:'old',replacementAssetId:'new'},'same-key')
  await service.remove('types','type-id',{},'same-key')
  assert.equal(calls[0].options.body.clientRequestId,'same-key')
  assert.equal(calls[0].options.body.serialMode,'OPTIONAL')
  assert.equal(calls[1].path,'/asset-management/simple/groups/group-id/replace-member')
  assert.equal(calls[1].options.body.clientRequestId,'same-key')
  assert.equal(calls[2].options.method,'DELETE')
})

test('API errors remain visible to callers',async()=>{
  const service=createSimpleAssetService({request:async()=>{throw new Error('backend unavailable')}})
  await assert.rejects(service.create('assets',{assetTypeId:'type'},'retry-key'),/backend unavailable/)
})

test('quantity and serial policy follow selected type configuration',()=>{
  const types=[{id:'case',serialMode:'REQUIRED'},{id:'mouse',serialMode:'DISABLED'},{id:'other',serialMode:'OPTIONAL'}]
  const blank={assetTypeId:'mouse',serialNumber:'',quantity:15}
  assert.equal(updateAssetFormField(blank,'assetTypeId','case',types).quantity,1)
  assert.equal(updateAssetFormField(blank,'assetTypeId','other',types).quantity,15)
  assert.equal(updateAssetFormField(blank,'serialNumber','SERIAL-1',types).quantity,1)
  assert.equal(validateAssetQuantity('1000000','DISABLED',''),1000000)
  assert.equal(validateAssetQuantity('12','OPTIONAL',''),12)
  assert.throws(()=>validateAssetQuantity('2','REQUIRED','SERIAL-1'),/رقم مسلسل/)
  assert.throws(()=>validateAssetQuantity('2','OPTIONAL','SERIAL-1'),/رقم مسلسل/)
  for(const invalid of ['0','1.5','1000001',''])assert.throws(()=>validateAssetQuantity(invalid,'DISABLED',''),/كمية صحيحة/)
  for(const property of [{custodianType:'employee'},{custodianType:'none',groupId:'group'},{custodianType:'none',condition:'IN_MAINTENANCE'}]){
    const existing={quantity:3,custodianType:'none',...property}
    assert.equal(isQuantityLocked(existing),true)
    assert.throws(()=>validateAssetQuantity('4','DISABLED','',existing),/قبل تغيير الكمية/)
  }
})

test('simple asset service forwards numeric quantity, version and the same retry key',async()=>{
  const calls=[]
  const service=createSimpleAssetService({request:async(path,options)=>{
    calls.push({path,options})
    return path.includes('/dashboard?')?{total:15,byType:[],byCondition:[],byAssignment:[],byLocation:[]}:{item:{id:'asset-id',quantity:15}}
  }})
  const body={assetTypeId:'mouse',quantity:15,expectedVersion:4}
  assert.equal((await service.update('assets','asset-id',body,'stable-key')).quantity,15)
  assert.equal((await service.update('assets','asset-id',body,'stable-key')).quantity,15)
  assert.equal((await service.dashboard()).total,15)
  assert.equal(calls[0].options.body.quantity,15)
  assert.equal(calls[0].options.body.expectedVersion,4)
  assert.deepEqual(calls[0].options.body,calls[1].options.body)
  assert.equal(calls[0].options.body.clientRequestId,'stable-key')
})

test('single-page filters and group return payload use server contracts',async()=>{
  const calls=[]
  const service=createSimpleAssetService({request:async(path,options)=>{
    calls.push({path,options})
    if(path.includes('/dashboard?'))return {totalUnits:8,employeeCustody:2,departmentCustody:1,unassigned:5,faulty:1,inMaintenance:1}
    if(path.includes('/assets?'))return {items:[{id:'unit-1',quantity:3,custodianName:'موظف تجريبي'}],total:1,page:1,pageSize:25}
    return {item:{id:'group-1'}}
  }})
  const filters={search:'شاشة',custodianType:'employee',employeeId:'employee-1'}
  const dashboard=await service.dashboard(filters)
  const list=await service.list('assets',{...filters,page:1,pageSize:25})
  assert.deepEqual([dashboard.totalUnits,dashboard.employeeCustody,dashboard.departmentCustody,dashboard.unassigned,dashboard.faulty,dashboard.inMaintenance],[8,2,1,5,1,1])
  assert.equal(list.items[0].custodianName,'موظف تجريبي')
  assert.match(calls[0].path,/employeeId=employee-1/)
  assert.match(calls[1].path,/search=%D8%B4%D8%A7%D8%B4%D8%A9/)
  const body={action:'RETURN',custodianType:'none',returnCondition:'USED',returnConditions:[{assetId:'allocated-1',condition:'OUT_OF_SERVICE'}],expectedVersion:3}
  await service.action('groups','group-1','custody',body,'return-retry-key')
  assert.equal(calls[2].options.body.clientRequestId,'return-retry-key')
  assert.deepEqual(calls[2].options.body.returnConditions,body.returnConditions)
  assert.equal(calls[2].options.body.expectedVersion,3)
  assert.equal('locationId' in calls[2].options.body,false)
})
