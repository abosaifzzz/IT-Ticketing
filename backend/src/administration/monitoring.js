import {performance} from 'node:perf_hooks'
import {randomUUID} from 'node:crypto'

export function createMonitoring() {
 const startedAt=new Date(),counts={requests:0,clientErrors:0,serverErrors:0,totalMilliseconds:0},recent=[]
 return {
  middleware(req,res,next){const start=performance.now();res.on('finish',()=>{counts.requests++;counts.totalMilliseconds+=performance.now()-start;if(res.statusCode>=500)counts.serverErrors++;else if(res.statusCode>=400)counts.clientErrors++});next()},
  error(error,req){
   // Never capture URL/query/body, driver messages, headers or stack traces.
   const code=['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ECONNREFUSED','PROTOCOL_CONNECTION_LOST'].includes(error?.code)?error.code:'REQUEST_ERROR'
   recent.unshift({id:randomUUID(),timestamp:new Date().toISOString(),method:req.method,status:error?.status??500,code})
   recent.splice(200)
  },
  async snapshot(pool){let database='available';try{await pool.query('SELECT 1')}catch{database='unavailable'}return {api:'available',database,startedAt,uptimeSeconds:Math.floor(process.uptime()),requests:counts.requests,clientErrors:counts.clientErrors,serverErrors:counts.serverErrors,averageMilliseconds:counts.requests?Math.round(counts.totalMilliseconds/counts.requests):0,memoryBytes:process.memoryUsage().rss}},
  errors({page=1,pageSize=25,search='',from=null,to=null}={}){const rows=recent.filter(row=>(!search||row.code.includes(search))&&(!from||row.timestamp.slice(0,10)>=from)&&(!to||row.timestamp.slice(0,10)<=to));return {items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize}},
 }
}
