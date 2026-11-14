import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROLE_DESTINATIONS } from '../../services/auth/demoUsers'
import { useAuth } from '../auth/useAuth'
export function NotFoundPage() { const { user } = useAuth(); const destination = user ? ROLE_DESTINATIONS[user.role] ?? '/' : '/login'; return <main className="grid min-h-screen place-items-center p-6 text-center"><div><p className="text-7xl font-extrabold text-primary-200">404</p><h1 className="mt-4 text-2xl font-extrabold">الصفحة غير موجودة</h1><p className="mt-2 text-sm text-muted">تعذر العثور على الصفحة التي تبحث عنها.</p><Link to={destination} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white"><ArrowRight size={18} /> العودة للرئيسية</Link></div></main> }
