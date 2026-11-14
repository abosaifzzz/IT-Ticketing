import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {input} from '../src/assetManagement/validation.js'
import {simpleHandlers,simpleCondition} from '../src/assetManagement/simple.js'
import {serialFor} from '../src/assetManagement/serial.js'
test('serial policies are data-driven with configurable normalization/uniqueness',()=>{
 assert.throws(()=>serialFor({serial_mode:'REQUIRED',unique_serial:true},''),{status:400})
 assert.deepEqual(serialFor({serial_mode:'OPTIONAL',unique_serial:true},' abc 123 '),{serial_number:'abc 123',serial_key:'ABC123'})
 assert.equal(serialFor({serial_mode:'OPTIONAL',unique_serial:false},'abc').serial_key,null)
 assert.throws(()=>serialFor({serial_mode:'DISABLED'},'abc'),{status:400})
})
test('simple API exposes only physical conditions and rejects technical specs/unsafe metadata fields',()=>{
 assert.equal(simpleCondition({technical_condition:'GOOD',operational_status:'AVAILABLE',usage_condition:'NEW'}),'NEW')
 assert.equal(simpleCondition({technical_condition:'FAULTY',operational_status:'IN_MAINTENANCE'}),'IN_MAINTENANCE')
 for(const field of ['cpu','ram','disk','hostname','operatingSystem','ip','quantity','supplier','operationalStatus'])assert.throws(()=>input({clientRequestId:'fixture',[field]:'forbidden'},simpleHandlers().simpleAssetCreate.spec),{status:400})
})

 test('shared asset policy permits both IT roles and rejects all other identities',async()=>{
 const {requireAssetAccess}=await import('../src/assets/permissions.js')
 for(const role of ['technician','manager'])assert.doesNotThrow(()=>requireAssetAccess({role}))
 for(const user of [null,undefined,{}, {role:'employee'},{role:'admin'},{role:'ENGINEER'}])assert.throws(()=>requireAssetAccess(user),{status:403})
 })

test('quantity allows nonserialized equipment but keeps serialized devices individual',()=>{
 const spec=simpleHandlers().simpleAssetCreate.spec
 const body={clientRequestId:'quantity-fixture',assetTypeId:randomUUID(),locationId:randomUUID()}
 assert.equal(input(body,spec).quantity,1)
 assert.equal(input({...body,quantity:10},spec).quantity,10)
 for(const quantity of [0,-1,1.5,'10',1000001,null])assert.throws(()=>input({...body,quantity},spec),{status:400})
 assert.throws(()=>serialFor({serial_mode:'REQUIRED',unique_serial:true},'PC-serial',10),{status:400})
 assert.throws(()=>serialFor({serial_mode:'OPTIONAL',unique_serial:false},'single-serial',10),{status:400})
 assert.equal(serialFor({serial_mode:'DISABLED',unique_serial:true},'',10).serial_number,null)
 assert.equal(serialFor({serial_mode:'OPTIONAL',unique_serial:true},'',10).serial_number,null)
})
