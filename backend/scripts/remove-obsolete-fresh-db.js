import {readFile,writeFile,unlink} from 'node:fs/promises'
import mysql from 'mysql2/promise'
import {parse} from 'dotenv'

const target='hospital_it_helpdesk_test_fresh_b72262d27768'
const password=process.env.HELPDESK_CLEANUP_ADMIN_PASSWORD
delete process.env.HELPDESK_CLEANUP_ADMIN_PASSWORD
let c
try{
 if(password===undefined)throw Error('Use the private PowerShell cleanup workflow')
 const env=parse(await readFile(new URL('../.env.fresh.test',import.meta.url)))
 const dev=parse(await readFile(new URL('../.env',import.meta.url)))
 const test=parse(await readFile(new URL('../.env.test',import.meta.url)))
 if(env.DB_HOST!=='127.0.0.1'||env.DB_NAME!==target||dev.DB_NAME!=='hospital_it_helpdesk_dev'||test.DB_NAME!=='hospital_it_helpdesk_test'||[dev,test].some(e=>e.DB_HOST!==env.DB_HOST||Number(e.DB_PORT)!==Number(env.DB_PORT)))throw Error('Unexpected database configuration')
 c=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT),user:'root',password})
 const [[server]]=await c.query('SELECT VERSION() version,@@port port')
 if(!/^8\.(0|4)\./.test(server.version)||Number(server.port)!==Number(env.DB_PORT))throw Error('Unexpected MySQL server')
 const [tables]=await c.execute('SELECT TABLE_NAME name,TABLE_TYPE type FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[target])
 if(!tables.length)throw Error('Target is missing; review local fresh-test configuration')
 for(const table of tables){
  if(!/^[a-z_]+$/.test(table.name)||table.type!=='BASE TABLE')throw Error('Unexpected database objects')
  if(table.name==='schema_migrations')continue
  const [[count]]=await c.query('SELECT COUNT(*) n FROM `'+target+'`.`'+table.name+'`')
  if(Number(count.n)!==0)throw Error('Target contains data; nothing removed')
 }
 const [[references]]=await c.execute('SELECT COUNT(*) n FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=? AND TABLE_SCHEMA<>?',[target,target])
 if(Number(references.n))throw Error('Other databases reference this target')
 const [[objects]]=await c.execute('SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=?)+(SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?)+(SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?) n',[target,target,target])
 if(Number(objects.n))throw Error('Unexpected routines/events/triggers; review before removing')
 const [[connections]]=await c.execute('SELECT COUNT(*) n FROM information_schema.PROCESSLIST WHERE DB=? AND ID<>CONNECTION_ID()',[target])
 if(Number(connections.n))throw Error('Close connections to the obsolete fresh-test database before removal')
 // All identifiers are fixed/validated. Never disable foreign key checks.
 await c.query('DROP DATABASE `'+target+'`')
 const summary={removedDatabase:target,removedEmptyTables:tables.length,retainedDatabases:['hospital_it_helpdesk_dev','hospital_it_helpdesk_test','sys'],checkedAt:new Date().toISOString()}
 await writeFile(new URL('../artifacts.local/obsolete-fresh-db-removal.local',import.meta.url),JSON.stringify(summary,null,2),{mode:0o600})
 for(const file of ['.env.fresh.test','.env.fresh.runtime','fresh-db-status.local']){
  try{
   if(file.startsWith('.env.')){
    const settings=parse(await readFile(new URL('../'+file,import.meta.url)))
    if(settings.DB_NAME!==target)continue
   }
   await unlink(new URL('../'+file,import.meta.url))
  }catch(error){if(error.code!=='ENOENT')throw error}
 }
 console.log(JSON.stringify(summary))
}catch(error){console.error('Fresh database cleanup stopped:',error.sql?'DATABASE_ERROR':error.code??error.message);process.exitCode=1}
finally{await c?.end()}
