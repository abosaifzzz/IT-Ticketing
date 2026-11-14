import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createAssetManagementApi} from '../src/services/assets/assetManagementApi.js'
import {notificationRoute} from '../src/services/notifications/notificationApi.js'

const calls=[]
const client={async request(path,options={}){calls.push({path,options});return path.includes('/dashboard')?{assets:[],stock:[],lowStock:[]}:options.responseType?new Blob(['ok']):path.includes('/reports/')?{items:[],total:0,page:1,pageSize:25}:path.includes('/assets/')?{item:{id:'a'}}:{items:[],total:0,page:1,pageSize:25}}}
const api=createAssetManagementApi(client)

test('tracked asset queries remain separate from the legacy asset API',async()=>{
 await api.list('assets',{search:'MON-1',page:2,pageSize:25})
 assert.equal(calls.at(-1).path,'/asset-management/assets?search=MON-1&page=2&pageSize=25')
 await api.dashboard()
 assert.equal(calls.at(-1).path,'/asset-management/dashboard')
})

test('asset mutations send a stable caller-provided idempotency key',async()=>{
 await api.moveAsset('a',{type:'RETURN',reason:'فحص',locationId:'l'},'retry-key')
 assert.equal(calls.at(-1).options.body.clientRequestId,'retry-key')
 assert.equal(calls.at(-1).options.body.type,'RETURN')
 await api.inventoryAction('i','review',{},'review-key')
 assert.equal(calls.at(-1).path,'/asset-management/inventory-sessions/i/review')
 assert.equal(calls.at(-1).options.body.clientRequestId,'review-key')
})

test('downloads and asset notifications use authenticated routes',async()=>{
 await api.export('spares','xlsx',{categoryId:'c'})
 assert.equal(calls.at(-1).options.responseType,'xlsx')
 assert.equal(notificationRoute({type:'asset_event',resourceType:'asset',resourceId:'a'},'technician'),'/it/assets/registry/a')
 assert.equal(notificationRoute({type:'asset_event',resourceType:'asset',resourceId:'a'},'employee'),null)
 assert.equal(notificationRoute({type:'ticket_assignment',ticketId:'t'},'manager'),'/manager/tickets/t')
})
