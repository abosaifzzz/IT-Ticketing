import{useEffect,useState}from'react'
import{useAuth}from'../../auth/useAuth'
import{httpClient}from'../../../services/auth/authService'
import{createNotificationApi}from'../../../services/notifications/notificationApi'
import{createNotificationFeed}from'../../../services/notifications/notificationFeed'
import{notificationSoundService}from'../../../services/notifications/notificationSoundService'
import{requiresAccountSetup}from'../../../services/auth/roles'
import{NotificationsContext}from'./notificationsContext'
export function ApiNotificationsProvider({children}){
 const {user,retry}=useAuth()
 const [state,setState]=useState({accountId:null,items:[],revision:null,unreadCount:0,status:'loading',error:null})
 const [feed,setFeed]=useState(null)
 const accountId=user?.id
 const setupRequired=requiresAccountSetup(user)
 useEffect(()=>{
  if(!accountId||user?.role==='admin'||setupRequired)return
  const current=createNotificationFeed({streamUrl:(import.meta.env?.VITE_API_BASE_URL??'/api').replace(/\/$/,'')+'/notifications/stream',api:createNotificationApi(httpClient),onChange:snapshot=>setState({...snapshot,accountId}),onSound:(sound,id)=>{notificationSoundService.play(sound,{eventKey:`${accountId}:${id}`})},onSessionEnded:()=>retry({background:true}),onResume:()=>retry()})
  setFeed(current);current.start()
  return()=>current.stop()
 },[accountId,user?.role,setupRequired,retry])
 const visible=user && state.accountId===user.id?state:{items:[],revision:null,unreadCount:0,status:'loading',error:null}
 return <NotificationsContext.Provider value={{...visible,refresh:()=>feed?.refresh(),read:id=>feed?.read(id),readAll:()=>feed?.readAll()}}>{children}</NotificationsContext.Provider>
}
