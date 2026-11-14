import assert from 'node:assert/strict'
import {readdir,readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {DEMO_PASSWORDS} from '../src/services/auth/demoCredentials.js'
import {authenticationMode} from '../src/services/auth/mode.js'
import {productionGuard} from './productionGuard.mjs'
assert.equal(authenticationMode(),'api')
assert.throws(()=>authenticationMode({mode:'mock',development:false}))
const credentials=Object.values(DEMO_PASSWORDS)
assert.equal(credentials.length,8)
let scripts=0
const inspect=async directory=>{
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=directory+'/'+entry.name
  if(entry.isDirectory())await inspect(path)
  else if(/\.(js|html|map|json|css)$/.test(entry.name)){
   if(entry.name.endsWith('.js'))scripts++
   const contents=await readFile(path,'utf8')
   assert.ok(credentials.every(value=>!contents.includes(value)),'Development credentials must be absent from every production artifact')
  }
 }
}
await inspect(fileURLToPath(new URL('../dist',import.meta.url)))
assert.ok(scripts>0,'Production build must contain JavaScript artifacts')
await readFile(new URL('../dist/index.html',import.meta.url),'utf8')
const guard=productionGuard(),context={error(message){throw Error(message)}}
assert.throws(()=>guard.generateBundle.call(context,{}, {bad:{type:'chunk',modules:{'/src/services/auth/demoCredentials.js':{}},code:''}}),/Development authentication module/)
assert.throws(()=>guard.generateBundle.call(context,{}, {bad:{type:'chunk',modules:{},code:credentials[0]}}),/Development credential included/)
guard.generateBundle.call(context,{}, {safe:{type:'chunk',modules:{'/src/app/App.jsx':{}},code:'API-only production'}})
console.log('PASS production artifact scan: API default, mock rejection, no demo passwords, and negative build-guard checks')
