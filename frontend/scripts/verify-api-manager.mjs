import assert from 'node:assert/strict'
import {createManagerApi,engineerLabel} from '../src/services/manager/managerApi.js'
import {createHttpClient} from '../src/services/http/client.js'
const calls=[]
const service=createManagerApi({async request(path,options={}){calls.push({path,options});if(path.startsWith('/tickets?'))return{items:[],total:0};if(path.includes('export.csv'))return new Blob(['server CSV'],{type:'text/csv'});if(path==='/tickets')return{item:{id:'created'}};return{items:[],item:{id:'updated'}}}})
await service.list({status:'assigned',assignment:'unassigned',departmentId:'d',categoryId:'c',reporterAccountId:'forged',technicianId:'forged',role:'manager'})
assert.match(calls.at(-1).path,/status=assigned/);assert.doesNotMatch(calls.at(-1).path,/forged|reporterAccountId|technicianId|role=/)
await service.assign({id:'ticket',version:7},'engineer')
assert.deepEqual(calls.at(-1).options.body,{technicianId:'engineer',expectedVersion:7})
await service.save('it-users',{username:'fictional',fullName:'Fictional Name',role:'technician',isActive:true,password:'must-not-send',phone:'ignored',extension:'ignored',isAvailable:false})
assert.deepEqual(calls.at(-1).options.body,{username:'fictional',fullName:'Fictional Name',role:'technician',isActive:true})
await service.save('fault-subcategories',{id:'sub',name:'Sub',categoryId:'parent',isActive:false,ticketCount:5})
assert.equal(calls.at(-1).options.method,'PATCH');assert.deepEqual(calls.at(-1).options.body,{name:'Sub',categoryId:'parent',isActive:false})
assert.throws(()=>service.records('invalid'))
const form={requesterType:'employee',reporterEmployeeId:'employee-id',reporterName:' Fictional Reporter ',department:'dept',category:'cat',subcategory:'sub',employeeNumber:' E ',managementPosition:'',title:' Ticket ',description:' Details ',owner:'forged',assignedTechnicianId:''}
await service.manual(form,'retry-id')
assert.equal(calls.at(-1).options.body.assignedTechnicianId,undefined);assert.equal(calls.at(-1).options.body.owner,undefined)
assert.equal(calls.at(-1).options.body.reporterEmployeeId,'employee-id');assert.equal(calls.at(-1).options.body.reporterName,undefined);assert.equal(calls.at(-1).options.body.title,'Details')
await service.manual({...form,assignedTechnicianId:'active-unavailable'},'retry-id-2')
assert.equal(calls.at(-1).options.body.assignedTechnicianId,'active-unavailable')
assert.equal(calls.at(-1).options.body.clientRequestId,'retry-id-2')
await service.report({dateFrom:'2026-01-01',dateTo:'2026-01-31',limit:10,engineer:'forged'})
assert.doesNotMatch(calls.at(-1).path,/engineer|forged/)
await service.exportReport({dateFrom:'2026-01-01',dateTo:'2026-01-31',limit:10})
assert.equal(calls.at(-1).options.responseType,'csv');assert.match(calls.at(-1).path,/export\.csv\?dateFrom=2026-01-01&dateTo=2026-01-31&limit=10/)
assert.match(engineerLabel({fullName:'Fictional',activeTicketCount:3,isAvailable:false}),/3/)
let options
const client=createHttpClient({fetchImpl:async(_url,input)=>{options=input;return new Response('server CSV',{headers:{'Content-Type':'text/csv; charset=utf-8'}})}})
assert.equal(await(await client.request('/reports/export.csv',{responseType:'csv'})).text(),'server CSV')
assert.equal(options.credentials,'include');assert.equal(options.headers.Accept,'text/csv')
let invalidations=0
await assert.rejects(()=>createHttpClient({onUnauthorized:()=>invalidations++,fetchImpl:async()=>new Response('',{status:401})}).request('/reports/export.csv',{responseType:'csv'}),error=>error.status===401)
assert.equal(invalidations,1)
await assert.rejects(()=>createHttpClient({fetchImpl:async()=>new Response('<html>private</html>',{headers:{'Content-Type':'text/html'}})}).request('/reports/export.csv',{responseType:'csv'}),error=>error.code==='response'&&!error.message.includes('private'))
console.log('PASS manager API: payload allowlists, versioned assignment, optional manual assignment, server report filters/CSV and authenticated download errors')
