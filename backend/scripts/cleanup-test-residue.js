import {readFile,writeFile} from 'node:fs/promises'
import {parse} from 'dotenv'
import {createPool} from '../src/db/pool.js'

// Intentionally specific: this is not a generic database reset command.
const testEnv=parse(await readFile(new URL('../.env.test',import.meta.url)))
const devEnv=parse(await readFile(new URL('../.env',import.meta.url)))
for(const [env,name] of [[testEnv,'hospital_it_helpdesk_test'],[devEnv,'hospital_it_helpdesk_dev']])if(env.DB_NAME!==name||env.DB_HOST!=='127.0.0.1'||env.DB_USER==='root')throw Error('Unexpected local configuration')
const connect=env=>createPool({host:env.DB_HOST,port:Number(env.DB_PORT),database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD})
const test=connect(testEnv),dev=connect(devEnv)
let c
try{
 c=await test.getConnection();await c.beginTransaction()
 const [users]=await c.query('SELECT id,email,full_name,last_login_at FROM users FOR UPDATE')
 if(users.some(u=>u.email!=='invalid-role@demo.example'||u.full_name!=='Fictional'||u.last_login_at!==null)||users.length>1)throw Error('Test accounts need review; no test data removed')
 for(const table of ['tickets','assets','am_assets','employee_directory','notifications','admin_requests','admin_backups','user_departments','user_roster_imports','am_custody','am_workstations']){
  const [[count]]=await c.query('SELECT COUNT(*) n FROM `'+table+'`')
  if(Number(count.n)!==0)throw Error('Test database contains operational records; cleanup stopped')
 }
 const [audit]=await c.query('DELETE FROM admin_audit')
 let removedUsers=0
 for(const user of users){const [removed]=await c.execute('DELETE FROM users WHERE id=?',[user.id]);removedUsers+=removed.affectedRows}
 await c.commit()
 const [expired]=await dev.query('DELETE FROM auth_sessions WHERE expires_at<=UTC_TIMESTAMP(3)')
 const summary={removedFictionalTestUsers:removedUsers,removedTestAuditRows:audit.affectedRows,removedExpiredDevelopmentSessions:expired.affectedRows,developmentUsersTicketsAssetsChanged:false,checkedAt:new Date().toISOString()}
 await writeFile(new URL('../artifacts.local/database-residue-cleanup.local',import.meta.url),JSON.stringify(summary,null,2),{mode:0o600})
 console.log(JSON.stringify(summary))
}catch(error){await c?.rollback();console.error('Cleanup stopped:',error.sql?'DATABASE_ERROR':error.code??error.message);process.exitCode=1}
finally{c?.release();await test.end();await dev.end()}
