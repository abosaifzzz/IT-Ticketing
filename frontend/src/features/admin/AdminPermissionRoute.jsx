import {useAdminAccess} from './adminAccess'

export function AdminPermissionRoute({permission,children}){
 const granted=useAdminAccess()
 if(!granted?.has(permission))return <section className="content-card mx-auto max-w-xl py-12 text-center" role="alert"><h1 className="text-xl font-bold text-ink">الوصول غير مسموح</h1><p className="mt-3 text-muted">لا تملك الصلاحية الإدارية اللازمة لهذه الصفحة.</p></section>
 return children
}
