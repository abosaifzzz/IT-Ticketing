import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {parse} from 'dotenv'
import {createPool} from '../src/db/pool.js'
import {employeeDirectoryInput,text} from '../src/management/validation.js'

const args=process.argv.slice(2)
const value=flag=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1]}
const file=value('--file'),apply=args.includes('--apply'),expected=value('--expected-sha256')
let pool,connection,locked=false,committed=false
try{
 if(!file)throw Error('Use --file PATH for a dry run; add --apply --expected-sha256 HASH only after review')
 const source=await readFile(file)
 if(source.length>10*1024*1024)throw Error('Workbook is too large')
 const hash=createHash('sha256').update(source).digest('hex')
 if(apply&&expected!==hash)throw Error('Apply requires the exact reviewed workbook SHA-256')
 const rows=JSON.parse(execFileSync(process.env.HELPDESK_PYTHON??'python',['scripts/read-employee-roster.py',file],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}))
 const env=parse(await readFile(new URL('../.env',import.meta.url)))
 if(env.DB_NAME!=='hospital_it_helpdesk_dev'||env.DB_HOST!=='127.0.0.1'||env.DB_USER==='root')throw Error('Import is restricted to the configured local development database')
 pool=createPool({host:env.DB_HOST,port:Number(env.DB_PORT),database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD})
 connection=await pool.getConnection()
 const [[lock]]=await connection.execute('SELECT GET_LOCK(?,10) acquired',['helpdesk:employee-roster:'+env.DB_NAME])
 if(lock.acquired!==1)throw Error('Another roster import is running');locked=true
 await connection.beginTransaction()
 const [managers]=await connection.query("SELECT id FROM users WHERE is_active=TRUE AND role='manager' FOR SHARE")
 const actorId=value('--actor-id')??(managers.length===1?managers[0].id:null)
 if(!actorId||!managers.some(manager=>manager.id===actorId))throw Error('Select an existing active manager with --actor-id; no login account will be created')
 const nameSet=new Set(),departments=new Map(),operations=[],mappings=[]
 for(const row of rows){
  const departmentName=text(row.department)
  const hex=createHash('sha256').update(hash+':sheet1:'+row.sourceRow).digest('hex');const id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32)
  const input=employeeDirectoryInput({fullName:row.fullName,departmentId:randomUUID()})
  if(nameSet.has(input.fullName))throw Error('Duplicate source name needs deliberate review')
  nameSet.add(input.fullName)
  if(!departments.has(departmentName)){
   const [matches]=await connection.execute('SELECT id,name,is_active FROM departments WHERE name=? FOR SHARE',[departmentName])
   if(matches.length>1||matches.some(item=>!item.is_active))throw Error('A department needs deliberate mapping/activation')
   departments.set(departmentName,{id:matches[0]?.id??randomUUID(),name:departmentName,create:matches.length===0})
  }
  const department=departments.get(departmentName)
  const [existing]=await connection.execute('SELECT id,full_name,department_id,is_active FROM employee_directory WHERE id=?',[id])
  if(existing.length){
   if(existing[0].full_name!==input.fullName||existing[0].department_id!==department.id||!existing[0].is_active)throw Error('An existing import identity conflicts; no records were changed')
   mappings.push({sourceRow:row.sourceRow,id:existing[0].id,action:'unchanged'})
  }else{
   const [sameName]=await connection.execute('SELECT id FROM employee_directory WHERE full_name=? AND department_id=?',[input.fullName,department.id])
   if(sameName.length)throw Error('An existing directory name/department needs deliberate mapping; no records changed')
   operations.push({id,...input,departmentId:department.id})
   mappings.push({sourceRow:row.sourceRow,id,action:'created'})
  }
 }
 const [loginRows]=await connection.query("SELECT id,full_name FROM users WHERE role='employee'")
 const loginNameMatches=loginRows.filter(account=>nameSet.has(account.full_name)).length
 const plan={sourceSha256:hash,sourceRows:rows.length,numberPolicy:'Employee codes cancelled; source row sequence is not an employee identifier',newEmployees:operations.length,unchangedEmployees:rows.length-operations.length,newDepartments:[...departments.values()].filter(item=>item.create).length,departments:[...departments.values()].map(item=>({name:item.name,create:item.create})),employeeLoginAccounts:loginRows.length,loginNameMatches,loginMappingApplied:false}
 if(apply){
  const now=new Date()
  for(const department of departments.values())if(department.create)await connection.execute('INSERT INTO departments(id,name,is_active,created_at,updated_at) VALUES(?,?,TRUE,?,?)',[department.id,department.name,now,now])
  for(const item of operations)await connection.execute('INSERT INTO employee_directory(id,full_name,department_id,is_active,created_by_account_id,created_at,updated_at) VALUES(?,?,?,TRUE,?,?,?)',[item.id,item.fullName,item.departmentId,actorId,now,now])
  await connection.commit();committed=true
 }else await connection.rollback()
 await mkdir(new URL('../artifacts.local/',import.meta.url),{recursive:true})
 await writeFile(new URL('../artifacts.local/employee-roster-'+(apply?'import':'plan')+'.local',import.meta.url),JSON.stringify({...plan,applied:apply,actorId,mappings},null,2),{mode:0o600})
 console.log(JSON.stringify({sourceSha256:hash,sourceRows:plan.sourceRows,newEmployees:plan.newEmployees,unchangedEmployees:plan.unchangedEmployees,newDepartments:plan.newDepartments,employeeLoginAccounts:plan.employeeLoginAccounts,loginNameMatches,applied:apply,loginMappingApplied:false}))
}catch(error){
 try{await connection?.rollback()}catch{/* preserve safe error */}
 console.error(committed?'Import committed; local receipt writing failed. Re-run a dry run to verify:':'Roster import stopped:',error.sql||error.stderr?'Review database access or workbook structure':error.code??error.message)
 process.exitCode=1
}finally{
 if(locked)await connection?.execute('SELECT RELEASE_LOCK(?)',['helpdesk:employee-roster:hospital_it_helpdesk_dev'])
 connection?.release();await pool?.end()
}
