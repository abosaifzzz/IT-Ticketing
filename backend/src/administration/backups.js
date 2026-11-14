import {randomBytes,createCipheriv,createHash} from 'node:crypto'
import {createReadStream,createWriteStream} from 'node:fs'
import {mkdir,unlink,stat,readFile,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {createGzip} from 'node:zlib'
import {recordAudit} from './audit.js'

const identifier=name=>{if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name))throw Error('Unsupported identifier');return '`'+name+'`'}
export function createBackupService({pool,key=process.env.ADMIN_BACKUP_KEY,directory=process.env.ADMIN_BACKUP_DIRECTORY,maxBytes=64*1024*1024}) {
 const configured=typeof key==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(key)&&Buffer.from(key,'base64').length===32&&typeof directory==='string'&&directory.trim().length>0
 return {
  capabilities(){return {configured,create:configured,restore:false,format:'encrypted-application-snapshot-v1',sessionsIncluded:false}},
  async run(id){
   let c,path,ownsFile=false
   try{
    if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid backup identifier')
    await pool.execute("UPDATE admin_backups SET status='RUNNING' WHERE id=? AND status='QUEUED'",[id])
    if(!configured)throw Error('NOT_CONFIGURED')
    const folder=resolve(directory);await mkdir(folder,{recursive:true,mode:0o700})
    path=join(folder,id+'.bak.enc')
    c=await pool.getConnection();await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT')
    const [all]=await c.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'")
    const tables=all.map(row=>Object.values(row)[0]).filter(table=>!['schema_migrations','auth_sessions'].includes(table)).sort()
    const migrationDir=new URL('../../db/migrations/',import.meta.url),migrations=[]
    for(const name of (await readdir(migrationDir)).filter(n=>n.endsWith('.sql')).sort())migrations.push({name,checksum:createHash('sha256').update(await readFile(new URL(name,migrationDir))).digest('hex')})
    let bytes=0
    const encode=value=>{
     const json=JSON.stringify(value,(_key,v)=>v?.type==='Buffer'&&Array.isArray(v.data)?{$binary:Buffer.from(v.data).toString('base64')}:v)
     bytes+=Buffer.byteLength(json);if(bytes>maxBytes)throw Error('SIZE_LIMIT');return json
    }
    async function* data(){
     yield '{"format":"hospital-application-snapshot-v1","migrations":'+encode(migrations)+',"tables":{'
     for(let index=0;index<tables.length;index++){
      const table=tables[index],name=identifier(table)
      const [keys]=await c.query('SHOW INDEX FROM '+name+" WHERE Key_name='PRIMARY'")
      if(!keys.length)throw Error('MISSING_PRIMARY_KEY')
      const order=keys.sort((a,b)=>a.Seq_in_index-b.Seq_in_index).map(k=>identifier(k.Column_name)).join(',')
      yield (index?',':'')+encode(table)+':['
      let first=true,offset=0
      const size=table==='am_attachments'?1:100
      for(;;){const [rows]=await c.query('SELECT * FROM '+name+' ORDER BY '+order+' LIMIT ? OFFSET ?',[size,offset]);for(const row of rows){yield (first?'':',')+encode(row);first=false}if(rows.length<size)break;offset+=size}
      yield ']'
     }
     yield '}}'
    }
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv),output=createWriteStream(path,{flags:'wx',mode:0o600})
    output.once('open',()=>{ownsFile=true})
    await new Promise((done,fail)=>{output.once('error',fail);output.write(Buffer.concat([Buffer.from('HITBAK01'),iv]),error=>error?fail(error):done())})
    await pipeline(Readable.from(data()),createGzip(),cipher,output)
    const {appendFile}=await import('node:fs/promises');await appendFile(path,cipher.getAuthTag())
    await c.commit();c.release();c=null
    const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk)
    const info=await stat(path)
    await pool.execute("UPDATE admin_backups SET status='COMPLETED',finished_at=?,byte_length=?,sha256=? WHERE id=?",[new Date(),info.size,digest.digest('hex'),id])
    await recordAudit(pool,{action:'backups.completed',module:'backups',entityId:id,after:{bytes:info.size,encrypted:true}})
   }catch(error){
    if(c){await c.rollback().catch(()=>{});c.release()}
    if(path&&ownsFile)await unlink(path).catch(()=>{})
    const code=['NOT_CONFIGURED','SIZE_LIMIT','MISSING_PRIMARY_KEY'].includes(error.message)?error.message:'BACKUP_FAILED'
    await pool.execute("UPDATE admin_backups SET status='FAILED',finished_at=?,failure_code=? WHERE id=?",[new Date(),code,id]).catch(()=>{})
    await recordAudit(pool,{action:'backups.failed',module:'backups',entityId:id,status:'FAILURE',after:{code}}).catch(()=>{})
   }
  },
 }
}
