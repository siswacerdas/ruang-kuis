import { Link, useLocation } from 'react-router-dom'

const items = [
  {
    path: '/siswa',
    label: 'Beranda',
    match: (p: string) => p === '/siswa',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
        />
      </svg>
    ),
  },
  {
    path: '/siswa/latihan-mandiri',
    label: 'Mandiri',
    match: (p: string) => p.startsWith('/siswa/latihan-mandiri'),
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  {
    path: '/kerjakan/riwayat',
    label: 'Riwayat',
    match: (p: string) => p.startsWith('/kerjakan/riwayat'),
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    path: '/siswa/peringkat',
    label: 'Peringkat',
    match: (p: string) => p.startsWith('/siswa/peringkat'),
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
  },
] as const

/** Navigasi bawah tetap untuk area siswa */
export default function StudentNav() {
  const { pathname } = useLocation()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-100 safe-area-pb"
      aria-label="Menu siswa"
    >
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        <ul className="grid grid-cols-4 gap-0.5 py-1.5">
          {items.map((item) => {
            const active = item.match(pathname)
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-medium transition ${
                    active
                      ? 'text-indigo-600 bg-indigo-50'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <span className={active ? 'text-indigo-600' : 'text-gray-400'}>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

/** Kartu pintasan di beranda */
export function StudentQuickLinks() {
  const cards = [
    {
      to: '/siswa/latihan-mandiri',
      title: 'Latihan mandiri',
      desc: 'Pilih materi, 15–20 soal, latihan kapan saja',
      tone: 'from-teal-500 to-emerald-600',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
    },
    {
      to: '/siswa/materi',
      title: 'Materi pelajaran',
      desc: 'Baca presentasi PDF per mapel',
      tone: 'from-sky-500 to-blue-600',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
    },
    {
      to: '/kerjakan/riwayat',
      title: 'Riwayat kuis',
      desc: 'Resmi & mandiri · skor dan TP',
      tone: 'from-indigo-500 to-violet-600',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  ]

  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Menu cepat">
      {cards.map((c) => (
        <Link
          key={c.to}
          to={c.to}
          className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm hover:border-indigo-200 hover:shadow-md transition"
        >
          <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${c.tone}`} />
          <div className="pl-4 pr-4 py-4 flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.tone} text-white flex items-center justify-center shrink-0 shadow-sm`}
            >
              {c.icon}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition">
                {c.title}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{c.desc}</p>
            </div>
            <svg
              className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 shrink-0 mt-1 transition"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      ))}
    </section>
  )
}
