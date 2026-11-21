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
await service.manual({requesterType:'employee',reporterUserId:'user-id',departmentId:'dept-1',reporterName:'forged',department:'forged',employeeNumber:'forged',category:'cat',description:' تفاصيل الموظف '},'employee-retry')
const employeeBody=calls.at(-1).options.body
assert.equal(employeeBody.reporterUserId,'user-id');assert.equal(employeeBody.reporterName,undefined);assert.equal(employeeBody.departmentId,'dept-1');assert.equal(employeeBody.employeeNumber,undefined);assert.equal(employeeBody.title,'تفاصيل الموظف')
await service.manual({requesterType:'employee',reporterUserId:'uncompleted-user',departmentId:'fallback-dept',reporterPhone:'01000000000',category:'cat',description:' بلاغ قبل إكمال الإعداد '},'uncompleted-retry')
assert.deepEqual(Object.fromEntries(['reporterUserId','departmentId','reporterPhone','clientRequestId'].map(key=>[key,calls.at(-1).options.body[key]])),{reporterUserId:'uncompleted-user',departmentId:'fallback-dept',reporterPhone:'01000000000',clientRequestId:'uncompleted-retry'})
await service.manual({requesterType:'employee',reporterUserId:'user-id',departmentId:'dept-1',category:'cat',description:'anydesk',anydeskId:'987654321'},'anydesk-retry');assert.equal(calls.at(-1).options.body.anydeskId,'987654321')
await service.userOptions('اسم مشترك', 6);assert.match(calls.at(-1).path,/\/user-options\?/);assert.match(calls.at(-1).path,/page=6/)
const roster = Array.from({length: 342}, (_, index) => ({id: `account-${index + 1}`, username: `fictional-${index + 1}`, fullName: index < 2 ? 'اسم مشترك' : `موظف تجريبي ${index + 1}`, phone: index === 1 ? null : '01000000000', isActive: index !== 1, mustChangePassword: index === 0, mustCompleteProfile: index === 0, departments: index === 0 ? [] : [{id: 'department', name: 'قسم تجريبي', isActive: true}]}))
const paged = createEngineerTicketApi({async request(path) { const query = new URLSearchParams(path.split('?')[1]); const filtered = roster.filter((item) => item.fullName.includes(query.get('search') ?? '') || item.username.includes(query.get('search') ?? '')); const page = Number(query.get('page')); return {items: filtered.slice((page - 1) * 25, page * 25), total: filtered.length, page, pageSize: 25} }})
assert.equal((await paged.userOptions('', 14)).items.at(-1).id, 'account-342')
assert.deepEqual((await paged.userOptions('اسم مشترك', 1)).items.map((item) => item.id), ['account-1', 'account-2'])
assert.equal((await paged.userOptions('اسم مشترك', 1)).items[0].mustCompleteProfile,true)
assert.equal((await paged.userOptions('اسم مشترك', 1)).items[1].isActive,false)
for(const key of ['reporterAccountId','assignedTechnicianId','createdByAccountId','createdByName','createdByRole','source','status'])assert.equal(Object.hasOwn(body,key),false)
assert.equal(assignmentSource({assignedByManagerName:'المدير'}),'المدير')
assert.match(assignmentSource({assignedByTechnicianId:'engineer',assignedByTechnicianName:'المهندس'}),/إسناد ذاتي/)
assert.equal(Object.hasOwn(service,'assign'),false)
console.log('PASS engineer API: server identity, availability, claim, mandatory field mapping, public/internal visibility, manual-ticket allowlist and stock-version checks')
