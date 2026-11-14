// One account-bound feed per mounted API layout; no persisted records or account selectors.
export function createNotificationFeed({api,onChange,onSound=()=>{},onSessionEnded=()=>{},onResume=null,eventSource=(url,options)=>new EventSource(url,options),streamUrl='/api/notifications/stream',schedule=setInterval,cancel=clearInterval,windowTarget=globalThis.window}){
 let stopped=false,paused=false,source,timer,controller,pollController,loading=null,again=false,baseline=null
 let snapshot={items:[],revision:null,unreadCount:0,status:'loading',error:null,transport:'connecting'}
 const emit=patch=>{if(!stopped){snapshot={...snapshot,...patch};onChange(snapshot)}}
 const refresh=()=>{
  if(stopped||paused)return Promise.resolve()
  if(loading){again=true;return loading}
  controller=new AbortController()
  loading=(async()=>{
   try{
    const result=await api.history({limit:10},controller.signal)
    if(stopped)return
    if(!/^(0|[1-9]\d*)$/.test(result.revision))throw Error('استجابة إشعارات غير صالحة.')
    if(snapshot.revision!==null&&BigInt(result.revision)<BigInt(snapshot.revision))return
    const fresh=baseline===null?[]:result.items.filter(item=>!item.readAt&&BigInt(item.createdRevision)>BigInt(baseline))
    const maximum=result.items.reduce((max,item)=>BigInt(item.createdRevision)>BigInt(max)?item.createdRevision:max,baseline??'0')
    baseline=maximum
    emit({items:result.items,revision:result.revision,unreadCount:Number(result.unreadCount),status:'ready',error:null})
    const sound=fresh.some(item=>item.type==='ticket_assignment')?'assignment':fresh.some(item=>item.type==='new_ticket')?'new_ticket':null
    if(sound)onSound(sound)
   }catch(error){if(!stopped&&!controller.signal.aborted)emit({status:snapshot.revision===null?'error':'ready',error})}
   finally{loading=null;if(again&&!stopped){again=false;refresh()}}
  })()
  return loading
 }
 const poll=async()=>{
  if(stopped||paused||loading)return
  if(!source||source.readyState===2)connect()
  const request=new AbortController();pollController=request
  try{const state=await api.state(snapshot.revision,request.signal);if(!stopped&&(state.changed||state.revision!==snapshot.revision))await refresh()}
  catch(error){if(!stopped)emit({error})}
 }
 const connect=()=>{
  if(stopped||paused)return
   try{
    source=eventSource(streamUrl,{withCredentials:true})
    const receive=()=>{emit({transport:'live'});refresh()}
    source.addEventListener('ready',receive);source.addEventListener('refresh',receive)
    source.addEventListener('error',()=>emit({transport:'polling'}))
    source.addEventListener('refresh-error',()=>{emit({transport:'polling'});refresh()})
    source.addEventListener('session-ended',()=>{if(!stopped&&!paused){source.close();onSessionEnded()}})
   }catch{emit({transport:'polling'})}
 }
 const suspend=()=>{paused=true;source?.close();controller?.abort();pollController?.abort();cancel(timer)}
 const resume=()=>{if(paused&&!stopped){if(onResume){onResume();return}paused=false;refresh();connect();timer=schedule(poll,15000)}}
 const focus=()=>{refresh();if(!source||source.readyState===2)connect()}
 return{
  start(){
   refresh()
   timer=schedule(poll,15000)
   windowTarget?.addEventListener('focus',focus);windowTarget?.addEventListener('online',focus);windowTarget?.addEventListener('pagehide',suspend);windowTarget?.addEventListener('pageshow',resume)
   connect()
  },
  refresh,
  async read(id){await api.read(id);await refresh()},
  async readAll(){await api.readAll();await refresh()},
  stop(){stopped=true;controller?.abort();pollController?.abort();source?.close();cancel(timer);windowTarget?.removeEventListener('focus',focus);windowTarget?.removeEventListener('online',focus);windowTarget?.removeEventListener('pagehide',suspend);windowTarget?.removeEventListener('pageshow',resume)},
 }
}
