import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {parse} from 'dotenv'
import {createPool} from '../src/db/pool.js'
import {importUserRoster} from '../src/administration/roster.js'

const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1]
let pool
try{
 const allowed=['--file','--actor-id','--retire-directory-receipt','--expected-sha256','--apply']
 for(let i=0;i<args.length;i++){if(!allowed.includes(args[i]))throw Error('Unknown option');if(args[i]!=='--apply'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing option value');i++}}
 if(!args.includes('--file')||!args.includes('--actor-id'))throw Error('Use --file PATH --actor-id ADMIN_UUID for a dry run')
 const bytes=await readFile(value('--file'));if(bytes.length>10*1024*1024)throw Error('File exceeds 10 MiB')
 const sourceSha256=createHash('sha256').update(bytes).digest('hex'),apply=args.includes('--apply')
 if(apply&&(!args.includes('--expected-sha256')||value('--expected-sha256')!==sourceSha256))throw Error('Apply requires the reviewed source SHA-256')
 const rows=JSON.parse(execFileSync(process.env.HELPDESK_PYTHON??'python',['scripts/read-user-roster.py',value('--file')],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}))
 // Check again after parsing so a changed file cannot use an earlier review hash.
 if(createHash('sha256').update(await readFile(value('--file'))).digest('hex')!==sourceSha256)throw Error('Source changed while reading')
 const env=parse(await readFile(new URL('../.env',import.meta.url)))
 if(env.DB_HOST!=='127.0.0.1'||env.DB_NAME!=='hospital_it_helpdesk_dev'||env.DB_USER==='root')throw Error('Only the configured restricted local development database is supported')
 pool=createPool({host:env.DB_HOST,port:Number(env.DB_PORT),database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD})
 const retireReceipt=args.includes('--retire-directory-receipt')?JSON.parse(await readFile(value('--retire-directory-receipt'),'utf8')):null
 console.log(JSON.stringify(await importUserRoster(pool,{rows,sourceSha256,actorId:value('--actor-id'),retireReceipt,apply})))
}catch(error){console.error('User import stopped:',error.sql||error.stderr?'Review database access or file structure':error.code??error.message);process.exitCode=1}
finally{await pool?.end()}
