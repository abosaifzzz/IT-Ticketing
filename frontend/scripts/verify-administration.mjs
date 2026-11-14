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
 await service.updatePermissions(['admin.users.read'])
 assert.equal(calls[3].path,'/admin/roles/admin/permissions')
 assert.equal((await service.latestSuccessfulBackup()).status,'COMPLETED')
})

test('backend failures are not converted into success',async()=>{
 const service=createAdminService({request:async()=>{throw new Error('not authorized')}})
 await assert.rejects(service.createBackup(),/not authorized/)
})
