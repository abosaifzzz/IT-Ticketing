import { Outlet } from 'react-router-dom'
import { Footer } from '../components/navigation/Footer'
import { authMode } from '../services/auth/mode'
import { ApiHeader } from '../components/navigation/ApiHeader'
import { Header } from '../components/navigation/Header'

export function AppLayout({ portal }) {
  return <div className="flex min-h-screen flex-col bg-canvas">
    {authMode === 'api' ? <ApiHeader portal={portal} /> : <Header portal={portal} />}
    <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8"><Outlet /></main>
    <Footer />
  </div>
}
