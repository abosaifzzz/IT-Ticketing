import assert from 'node:assert/strict'
import {createAssetApi} from '../src/services/assets/assetApi.js'
import {createNotificationApi,notificationRoute} from '../src/services/notifications/notificationApi.js'
import {createNotificationFeed} from '../src/services/notifications/notificationFeed.js'
import {createHttpClient} from '../src/services/http/client.js'
const calls=[],client={async request(path,options={}){calls.push({path,options});return{item:{id:'saved'}}}}
const assets=createAssetApi(client)
const form={assetId:' UNIT-1 ',name:'Fictional',quantity:'3',manufacturer:'Fictional',model:'Demo',holdingType:'department',departmentId:'dept',location:'Room',operationalStatus:'working',conditionDescription:'Demo',category:'cancelled',rating:5,takenByEngineerId:'forged'}
await assets.save(form);assert.equal(calls.at(-1).options.body.quantity,3);assert.equal(calls.at(-1).options.body.assetId,'UNIT-1');assert.equal(calls.at(-1).options.body.departmentId,'dept');for(const field of ['category','rating','takenByEngineerId'])assert.equal(calls.at(-1).options.body[field],undefined)
await assets.save(form,{assetId:'OLD-1',departmentId:'dept',holdingType:'department',version:4})
assert.equal(calls.at(-1).options.method,'PATCH');assert.equal(calls.at(-1).options.body.expectedVersion,4);assert.equal(calls.at(-1).options.body.departmentId,undefined);assert.equal(calls.at(-1).options.body.assetId,undefined)
await assets.save({...form,holdingType:'it_storage'},{assetId:'OLD-1',version:4})
assert.equal(calls.at(-1).options.body.departmentId,null)
await assets.archive({assetId:'OLD-1',version:5});assert.deepEqual(calls.at(-1).options.body,{expectedVersion:5})
await assets.export({search:'Fictional',operationalStatus:'working',includeArchived:true,page:4,pageSize:20,accountId:'forged'})
assert.equal(calls.at(-1).options.responseType,'xlsx');assert.doesNotMatch(calls.at(-1).path,/page|Archived|accountId|forged/);assert.match(calls.at(-1).path,/search=Fictional/)
const api=createNotificationApi(client)
await api.history({before:'9007199254740999',limit:20,unreadOnly:true,recipientId:'forged'})
assert.doesNotMatch(calls.at(-1).path,/recipient|forged/);assert.match(calls.at(-1).path,/9007199254740999/)
await api.read('own-id');assert.deepEqual(calls.at(-1).options.body,{});assert.equal(calls.at(-1).options.method,'PATCH')
await api.readAll();assert.equal(calls.at(-1).options.method,'POST')
assert.equal(notificationRoute({ticketId:'ticket'},'employee'),'/employee/tickets/ticket');assert.equal(notificationRoute({ticketId:'ticket'},'invalid'),null)
const workbook=await createHttpClient({fetchImpl:async()=>new Response(new Uint8Array([80,75]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}})}).request('/assets/export.xlsx',{responseType:'xlsx'})
assert.equal(workbook.size,2)
await assert.rejects(()=>createHttpClient({fetchImpl:async()=>new Response('private html',{headers:{'Content-Type':'text/html'}})}).request('/assets/export.xlsx',{responseType:'xlsx'}),error=>error.code==='response')
let snapshot={items:[{id:'old',type:'new_ticket',createdRevision:'9007199254740993',readAt:null}],revision:'9007199254740993',unreadCount:1}
let emitted,sounds=[],poll,closed=false,cancelled=false,ended=false
const listeners={},target=new EventTarget(),source={addEventListener(name,fn){listeners[name]=fn},close(){closed=true}}
const feed=createNotificationFeed({api:{async history(){return structuredClone(snapshot)},async state(since){return{...snapshot,changed:since!==snapshot.revision}},async read(){snapshot={...snapshot,revision:'9007199254740996',unreadCount:0,items:snapshot.items.map(item=>({...item,readAt:'now'}))}},async readAll(){snapshot={...snapshot,revision:'9007199254740997',unreadCount:0}}},onChange:state=>emitted=state,onSound:sound=>sounds.push(sound),onSessionEnded:()=>{ended=true},eventSource:(url,options)=>{assert.equal(url,'/api/notifications/stream');assert.equal(options.withCredentials,true);return source},schedule:fn=>{poll=fn;return 1},cancel:()=>{cancelled=true},windowTarget:target})
const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0))}
feed.start();await settle();assert.equal(emitted.unreadCount,1);assert.equal(sounds.length,0)
listeners.ready();await settle();assert.equal(sounds.length,0)
snapshot={items:[{id:'new',type:'ticket_assignment',createdRevision:'9007199254740994',readAt:null},...snapshot.items],revision:'9007199254740994',unreadCount:2}
listeners.refresh();await settle();assert.equal(emitted.unreadCount,2);assert.deepEqual(sounds,['assignment'])
listeners.refresh();await settle();assert.equal(sounds.length,1)
listeners.error();assert.equal(emitted.transport,'polling')
snapshot={...snapshot,revision:'9007199254740995',unreadCount:3,items:[{id:'fallback',type:'new_ticket',createdRevision:'9007199254740995',readAt:null},...snapshot.items]}
await poll();await settle();assert.equal(emitted.unreadCount,3);assert.deepEqual(sounds,['assignment','new_ticket'])
await feed.read('new');assert.equal(emitted.unreadCount,0);assert.equal(sounds.length,2)
await feed.readAll();assert.equal(emitted.revision,'9007199254740997')
listeners.ready();await settle();assert.equal(sounds.length,2)
target.dispatchEvent(new Event('pagehide'));assert.equal(closed,true);target.dispatchEvent(new Event('pageshow'));await settle();assert.equal(sounds.length,2);listeners['session-ended']();assert.equal(ended,true);feed.stop();assert.equal(closed,true);assert.equal(cancelled,true)
const last=emitted;target.dispatchEvent(new Event('focus'));await settle();assert.equal(emitted,last)
let resumed=false;const cached=createNotificationFeed({api:{async history(){return snapshot}},onChange:()=>{},onResume:()=>{resumed=true},eventSource:()=>source,schedule:()=>1,cancel:()=>{},windowTarget:target});cached.start();await settle();target.dispatchEvent(new Event('pagehide'));target.dispatchEvent(new Event('pageshow'));assert.equal(resumed,true);cached.stop();
let fallbackState
const fallback=createNotificationFeed({api:{async history(){return snapshot}},onChange:state=>fallbackState=state,eventSource:()=>{throw Error('unsupported')},schedule:()=>1,cancel:()=>{},windowTarget:target})
fallback.start();await settle();assert.equal(fallbackState.transport,'polling');fallback.stop()
// Audio is opt-in and a suspended browser context must not be treated as playable.
let constructed=0,played=0
const audioTarget=new EventTarget()
class Audio {constructor(){constructed++;this.state='suspended';this.currentTime=0}async resume(){}createOscillator(){played++;throw Error('must not play while suspended')}}
const storage=new Map();audioTarget.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};audioTarget.AudioContext=Audio;globalThis.window=audioTarget
const{notificationSoundService:sound}=await import('../src/services/notifications/notificationSoundService.js')
assert.equal(sound.getSettings().enabled,false);sound.initialize()
audioTarget.dispatchEvent(new Event('pointerdown'));assert.equal(constructed,0)
assert.equal(await sound.play('assignment'),false)
sound.setEnabled(true);assert.equal(constructed,1)
assert.equal(await sound.play('assignment'),false);assert.equal(played,0)
sound.setMuted(true);assert.equal(await sound.play('assignment'),false)
delete globalThis.window
console.log('PASS asset/notification contracts: quantities, historical department preservation, version checks, XLSX content, recipient exclusion, BIGINT revisions, SSE/reconnect/polling, read actions, cleanup and opt-in autoplay-safe sound')
