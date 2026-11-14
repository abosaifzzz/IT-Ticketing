import assert from 'node:assert/strict'
import { createEngineerTicketApi, assignmentSource } from '../src/services/tickets/engineerTicketApi.js'
const calls = []
const service = createEngineerTicketApi({ async request(path, options = {}) { calls.push({path,options}); return {item:{id:'ticket'},items:[],total:0} } })
const ticket = {id:'ticket',version:7}, asset={assetId:'STOCK-1',version:3}
await service.allTickets({page:1,pageSize:20,search:'بلاغ'},undefined);assert.match(calls.at(-1).path,/scope=all/)
await service.availability(false);assert.deepEqual(calls.at(-1),{path:'/it-users/me/availability',options:{method:'PATCH',body:{isAvailable:false}}})
await service.claim('ticket');assert.deepEqual(calls.at(-1).options.body,{})
await service.pending(ticket,'سبب');assert.deepEqual(calls.at(-1).options.body,{status:'pending',pendingReason:'سبب',expectedVersion:7})
await service.resolve(ticket,'حل');assert.deepEqual(calls.at(-1).options.body,{status:'resolved',solutionDescription:'حل',expectedVersion:7})
await service.note(ticket,'نص','internal');assert.deepEqual(calls.at(-1).options.body,{text:'نص',visibility:'internal',expectedVersion:7})
await service.withdraw(ticket,asset);assert.deepEqual(calls.at(-1).options.body,{ticketId:'ticket',expectedVersion:3})
await service.manual({requesterType:'top_management',reporterName:' اسم يدوي ',department:'dept',employeeNumber:'forbidden',managementPosition:' مكتب ',title:' عنوان ',category:'cat',subcategory:'sub',description:' وصف ',reporterAccountId:'forged',assignedTechnicianId:'forged',createdByAccountId:'forged'},'retry-id')
const body=calls.at(-1).options.body
assert.equal(body.reporterName,'اسم يدوي');assert.equal(body.departmentId,undefined);assert.equal(body.employeeNumber,undefined);assert.equal(body.managementPosition,'مكتب');assert.equal(body.title,'وصف')
await service.manual({requesterType:'employee',reporterEmployeeId:'employee-id',reporterName:'forged',department:'forged',employeeNumber:'forged',category:'cat',description:' تفاصيل الموظف '},'employee-retry')
const employeeBody=calls.at(-1).options.body
assert.equal(employeeBody.reporterEmployeeId,'employee-id');assert.equal(employeeBody.reporterName,undefined);assert.equal(employeeBody.departmentId,undefined);assert.equal(employeeBody.employeeNumber,undefined);assert.equal(employeeBody.title,'تفاصيل الموظف')
for(const key of ['reporterAccountId','assignedTechnicianId','createdByAccountId','createdByName','createdByRole','source','status'])assert.equal(Object.hasOwn(body,key),false)
assert.equal(assignmentSource({assignedByManagerName:'المدير'}),'المدير')
assert.match(assignmentSource({assignedByTechnicianId:'engineer',assignedByTechnicianName:'المهندس'}),/إسناد ذاتي/)
assert.equal(Object.hasOwn(service,'assign'),false)
console.log('PASS engineer API: server identity, availability, claim, mandatory field mapping, public/internal visibility, manual-ticket allowlist and stock-version checks')
