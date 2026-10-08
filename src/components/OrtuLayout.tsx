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
  /** Beranda memakai hero sendiri — header atas tetap ada di layout */
  hideHeader?: boolean
  actions?: ReactNode
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
  {
    path: '/ortu/buat-kuis',
    label: 'Buat kuis',
    match: (p: string) => p.startsWith('/ortu/buat-kuis'),
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
    ),
  },
]

export default function OrtuLayout({
  children,
  title,
  subtitle,
  parentName,
  hideHeader,
  actions,
}: OrtuLayoutProps) {
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

  const initial = ((parentName || title || 'O').trim()[0] || 'O').toUpperCase()
  const pageTitle = title || 'Ruang Kuis'
  const pageSub = subtitle || parentName || 'Portal orang tua'

  const navLinkClass = (active: boolean, desktop?: boolean) =>
    desktop
      ? `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
          active
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`
      : `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
          active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
        }`

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex">
      {/* Sidebar desktop — pola admin */}
      <aside className="hidden md:flex md:w-60 lg:w-64 md:flex-col bg-white border-r border-gray-100 fixed inset-y-0 left-0 z-30">
        <div className="h-16 flex items-center px-5 border-b border-gray-100">
          <Link to="/ortu" className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
              RK
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">Ruang Kuis</p>
              <p className="text-[11px] text-gray-400 truncate">Portal orang tua</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.map((item) => {
            const active = item.match(location.pathname)
            return (
              <Link key={item.path} to={item.path} className={navLinkClass(active, true)}>
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{parentName || 'Orang tua'}</p>
              <p className="text-[11px] text-gray-400">Akun orang tua</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left text-sm font-medium text-gray-500 hover:text-red-600 px-3 py-2 rounded-xl hover:bg-red-50 transition"
          >
            Keluar
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-60 lg:pl-64">
        {/* Top header — selalu (mobile + desktop), kecuali hideHeader di mobile hero-only pages */}
        <header
          className={`bg-white border-b border-gray-100 sticky top-0 z-20 ${
            hideHeader ? 'hidden md:block' : ''
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Logo mobile */}
              <Link
                to="/ortu"
                className="md:hidden w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0"
              >
                RK
              </Link>
              <div className="min-w-0">
                <p className="text-sm md:text-base font-bold text-gray-900 truncate">{pageTitle}</p>
                <p className="text-[11px] text-gray-400 truncate hidden sm:block">{pageSub}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              <button
                type="button"
                onClick={handleLogout}
                className="md:hidden text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1.5"
              >
                Keluar
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 md:py-6 pb-24 md:pb-8">
          {children}
        </main>

        {/* Bottom nav mobile — pola siswa */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-100"
          aria-label="Menu orang tua"
        >
          <div className="max-w-6xl mx-auto px-1">
            <ul className="grid grid-cols-5 gap-0.5 py-1.5">
              {NAV.map((item) => {
                const active = item.match(location.pathname)
                return (
                  <li key={item.path}>
                    <Link to={item.path} className={navLinkClass(active)}>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        {item.icon}
                      </svg>
                      <span className="truncate max-w-full px-0.5">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>
      </div>
    </div>
  )
}
