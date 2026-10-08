import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { clearParentSession } from '../lib/parentSession'
import type { ReactNode } from 'react'

interface OrtuLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  parentName?: string
}

const NAV = [
  {
    path: '/ortu',
    label: 'Beranda',
    match: (p: string) => p === '/ortu' || p === '/ortu/',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
      />
    ),
  },
  {
    path: '/ortu/riwayat',
    label: 'Riwayat',
    match: (p: string) => p.startsWith('/ortu/riwayat'),
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    path: '/ortu/nilai',
    label: 'Nilai',
    match: (p: string) => p.startsWith('/ortu/nilai'),
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
  },
  {
    path: '/ortu/peringkat',
    label: 'Peringkat',
    match: (p: string) => p.startsWith('/ortu/peringkat'),
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    ),
  },
]

export default function OrtuLayout({ children, title, subtitle, parentName }: OrtuLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = async () => {
    clearParentSession()
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    navigate('/login?tab=ortu', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] pb-20">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/ortu"
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0"
            >
              RK
            </Link>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {title || 'Ruang Kuis · Orang Tua'}
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {subtitle || parentName || 'Portal orang tua'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-600 px-2 py-1.5 shrink-0"
          >
            Keluar
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto flex">
          {NAV.map((item) => {
            const active = item.match(location.pathname)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                  active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
