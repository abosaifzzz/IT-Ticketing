import {useEffect,useState} from 'react'
import {LogOut,Menu,Moon,Sun,X} from 'lucide-react'
import {NavLink,Outlet,useNavigate} from 'react-router-dom'
import {Footer} from '../components/navigation/Footer'
import {useAuth} from '../features/auth/useAuth'
import {portalRoutes} from '../app/routeConfig'
import {useApiQuery} from '../services/http/useApiQuery'
import {adminService} from '../services/administration/adminService'
import {themeService} from '../services/preferences/themeService'
import {AdminAccessContext} from '../features/admin/adminAccess'
import {appEvents,EVENT_NAMES} from '../services/events/eventBus'

const permissions={users:'admin.users.read',roles:'admin.roles.read',audit:'admin.audit.read',settings:'admin.settings.read',backups:'admin.backups.read',monitoring:'admin.monitoring.read'}

export function AdminLayout(){
 const {user,logout}=useAuth(),navigate=useNavigate(),[menuOpen,setMenuOpen]=useState(false),[theme,setTheme]=useState(()=>themeService.getActiveTheme()),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const roles=useApiQuery('admin-access',signal=>adminService.roles(signal))
 const refreshRoles=roles.refresh
 useEffect(()=>appEvents.subscribe(EVENT_NAMES.ADMIN_PERMISSIONS_CHANGED,()=>refreshRoles()),[refreshRoles])
 const granted=new Set(roles.data?.items.find(item=>item.role==='admin')?.permissions??[])
 const portal=portalRoutes.find(item=>item.role==='admin')
 const links=[{path:'/admin',label:'لوحة التحكم',permission:'admin.dashboard.read'},...portal.pages.map(page=>({path:`/admin/${page.path}`,label:page.label,permission:permissions[page.path]}))].filter(link=>granted.has(link.permission)).concat({path:'/profile',label:'ملفي الشخصي'})
 const signOut=async()=>{if(busy)return;setBusy(true);setError('');try{await logout();navigate('/login',{replace:true})}catch(failure){setError(failure.message)}finally{setBusy(false)}}
 if(roles.status==='loading')return <div className="min-h-screen bg-canvas p-8 text-ink" role="status">جارٍ التحقق من صلاحيات الإدارة...</div>
 if(roles.error)return <div className="min-h-screen bg-canvas p-8 text-ink" role="alert">{roles.error.status===403?'ليس لديك صلاحية لفتح وحدة الإدارة.':roles.error.message} <button className="text-primary-600" onClick={()=>roles.refresh()}>إعادة المحاولة</button></div>
 return <AdminAccessContext.Provider value={granted}><div className="flex min-h-screen flex-col bg-canvas"><header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8"><NavLink to="/admin" className="flex min-w-0 items-center gap-3"><img src="/brand/fayoum-oncology-center-logo.jpg" alt="شعار مركز أورام الفيوم" className="h-14 w-40 rounded-lg bg-white object-contain sm:h-16 sm:w-52"/><span className="hidden text-sm font-bold text-ink sm:inline">إدارة النظام</span></NavLink><div className="flex items-center gap-2"><span className="hidden text-sm text-muted md:inline">{user.name}</span><button className="icon-button" aria-label={theme==='dark'?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي'} onClick={()=>setTheme(themeService.toggle())}>{theme==='dark'?<Sun size={19}/>:<Moon size={19}/>}</button><button className="icon-button" aria-label="تسجيل الخروج" disabled={busy} onClick={signOut}><LogOut size={19}/></button><button className="icon-button lg:hidden" aria-label={menuOpen?'إغلاق القائمة':'فتح القائمة'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button></div></div><nav className="hidden border-t border-border/70 lg:block" aria-label="تنقل الإدارة"><div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 py-2">{links.map(link=><NavLink key={link.path} end to={link.path} className={({isActive})=>`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${isActive?'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200':'text-muted hover:text-ink'}`}>{link.label}</NavLink>)}</div></nav>{menuOpen&&<nav className="grid gap-1 border-t border-border p-3 lg:hidden" aria-label="تنقل الإدارة للهاتف">{links.map(link=><NavLink key={link.path} end to={link.path} onClick={()=>setMenuOpen(false)} className="rounded-lg px-3 py-2 text-sm font-bold text-ink">{link.label}</NavLink>)}</nav>}{error&&<p className="mx-auto max-w-[1600px] p-3 text-red-700 dark:text-red-300" role="alert">{error}</p>}</header><main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8"><Outlet/></main><Footer/></div></AdminAccessContext.Provider>
}
