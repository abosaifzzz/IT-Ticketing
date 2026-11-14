import {createInterface} from 'node:readline/promises'
import {loadConfig} from '../src/config.js'
import {createPool} from '../src/db/pool.js'
import {approveAdministrativeRequest} from '../src/administration/operator.js'
import {hiddenPrompt} from './password-prompt.js'
import {uuid} from '../src/management/validation.js'

let pool
try{
 const [id,...extra]=process.argv.slice(2);uuid(id)
 if(extra.length||!process.stdin.isTTY)throw Error('Use a private interactive server terminal')
 pool=createPool(loadConfig().database)
 const [[request]]=await pool.execute('SELECT type,requested_role FROM admin_requests WHERE id=?',[id])
 if(!request)throw Error('Request not found')
 const terminal=createInterface({input:process.stdin,output:process.stdout})
 const confirmation=await terminal.question('Confirm this request with the intended account owner through a trusted channel. Type APPROVE to continue: ')
 terminal.close()
 if(confirmation!=='APPROVE')throw Error('Cancelled')
 let password
 if(request.type==='PASSWORD_RESET'||request.requested_role==='admin'){
  password=await hiddenPrompt('Enter the new password privately (Admin requires at least 16 characters): ')
  if(password!==await hiddenPrompt('Confirm password: '))throw Error('Mismatch')
 }
 await approveAdministrativeRequest(pool,id,{password})
 console.log('Protected request completed. Previous sessions revoked. Account activity was not changed.')
}catch{console.error('Request was not completed. Check its status, expiry, role, confirmation and private password policy.');process.exitCode=1}
finally{await pool?.end()}
