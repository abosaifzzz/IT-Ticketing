import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createAdminService} from '../src/services/administration/adminService.js'
import {ROLE_DESTINATIONS,routeAccess} from '../src/services/auth/roles.js'

test('admin role is a separate destination with no manager or engineer route access',()=>{
 assert.equal(ROLE_DESTINATIONS.admin,'/admin')
 assert.equal(routeAccess({status:'ready',user:{role:'admin'},allowedRoles:['manager']}),'unauthorized')
 assert.equal(routeAccess({status:'ready',user:{role:'admin'},allowedRoles:['technician']}),'unauthorized')
 assert.equal(routeAccess({status:'ready',user:{role:'manager'},allowedRoles:['admin']}),'unauthorized')
})

test('administration service uses only the admin API and preserves server results',async()=>{
 const calls=[],client={request:async(path,options)=>{calls.push({path,options});return path.includes('/users?')?{items:[],total:0,page:1,pageSize:25}:path.includes('/backups?')?{items:[{id:'b1',status:'COMPLETED'}],total:1,page:1,pageSize:100}:{item:{id:'saved'}}}}
 const service=createAdminService(client)
 const list=await service.users({search:'موظف',page:1,pageSize:25})
 assert.equal(list.total,0)
 assert.match(calls[0].path,/^\/admin\/users\?search=/)
 await service.reauthenticate('private-example')
 assert.deepEqual(calls[1].options,{method:'POST',body:{password:'private-example'},anonymous:true})
 await service.createUser({email:'fictional@example.test',fullName:'اختبار',role:'admin'})
 assert.equal(calls[2].path,'/admin/users')
 assert.equal(calls[2].options.body.password,undefined)
 await service.createUser({username:'fictional employee',fullName:'اسم خيالي',role:'employee'})
 assert.deepEqual(calls[3].options.body,{username:'fictional employee',fullName:'اسم خيالي',role:'employee'})
 await service.updateUser('fictional-id',{username:'new name',fullName:'اسم آخر',phone:'01000000000',departmentIds:['dept-id']})
 assert.deepEqual(calls[4].options.body,{username:'new name',fullName:'اسم آخر',phone:'01000000000',departmentIds:['dept-id']})
 await service.changeRole('fictional-id',{role:'engineer',reason:'سبب خيالي'})
 assert.deepEqual(calls[5].options.body,{role:'engineer',reason:'سبب خيالي'})
 await service.changeRole('fictional-id',{role:'admin',reason:'ترقية خيالية',adminPassword:'Fictional-long-admin-password-01'})
 assert.deepEqual(calls[6].options.body,{role:'admin',reason:'ترقية خيالية',adminPassword:'Fictional-long-admin-password-01'})
 await service.resetTemporaryPassword('fictional-id')
 assert.equal(calls[7].path,'/admin/users/fictional-id/reset-temporary-password')
 assert.deepEqual(calls[7].options.body,{})
 await service.updatePermissions(['admin.users.read'])
 assert.equal(calls[8].path,'/admin/roles/admin/permissions')
 assert.equal((await service.latestSuccessfulBackup()).status,'COMPLETED')
 await service.updateUser('fictional-id',{fullName:'اسم محدث',role:'manager',reason:'سبب خيالي',isActive:false})
 assert.equal(calls.at(-1).path,'/admin/users/fictional-id')
 assert.deepEqual(calls.at(-1).options.body,{fullName:'اسم محدث',role:'manager',reason:'سبب خيالي',isActive:false})
 for(let i=0;i<6;i++)await service.reauthenticate('fictional-private-password')
 assert.equal(calls.slice(-6).filter(call=>call.path==='/admin/reauthenticate').length,6)
 await service.resetTemporaryPassword('fictional-employee')
 assert.deepEqual(calls.at(-1),{path:'/admin/users/fictional-employee/reset-temporary-password',options:{method:'POST',body:{}}})
})

test('backend failures are not converted into success',async()=>{
 const service=createAdminService({request:async()=>{throw new Error('not authorized')}})
 await assert.rejects(service.createBackup(),/not authorized/)
})
