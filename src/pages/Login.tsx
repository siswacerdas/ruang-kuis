import { useEffect, useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { ensureStudentSession, setStudentSession } from '../lib/studentSession'
import { ensureParentSession, setParentSession } from '../lib/parentSession'
import { STAFF_ACCOUNTS, roleLabel, type NamedAccount } from '../lib/loginAccounts'
import { isDummyStudent, type Student } from '../types/student'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'

type TabKey = 'siswa' | 'guru' | 'ortu' | 'tes'

const TABS: {
  key: TabKey
  label: string
  short: string
  accent: string
  active: string
  ring: string
}[] = [
  {
    key: 'siswa',
    label: 'Siswa',
    short: 'Siswa',
    accent: 'text-indigo-600',
    active: 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100',
    ring: 'focus:ring-indigo-500/30',
  },
  {
    key: 'ortu',
    label: 'Orang Tua',
    short: 'Ortu',
    accent: 'text-violet-600',
    active: 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-100',
    ring: 'focus:ring-violet-500/30',
  },
  {
    key: 'guru',
    label: 'Guru',
    short: 'Guru',
    accent: 'text-sky-600',
    active: 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100',
    ring: 'focus:ring-sky-500/30',
  },
  {
    key: 'tes',
    label: 'Tes',
    short: 'Tes',
    accent: 'text-amber-600',
    active: 'bg-white text-amber-800 shadow-sm ring-1 ring-amber-100',
    ring: 'focus:ring-amber-500/30',
  },
]

const TAB_COPY: Record<
  TabKey,
  { title: string; subtitle: string; cta: string; tip?: string }
> = {
  siswa: {
    title: 'Hai, pejuang ilmu!',
    subtitle: 'Pilih namamu, masukkan NISN, dan mulai latihan hari ini.',
    cta: 'Masuk & mulai belajar',
    tip: 'Password = NISN kamu. Lupa? Tanya guru kelas.',
  },
  ortu: {
    title: 'Selamat datang, Ayah/Bunda',
    subtitle: 'Pantau progres anak, lihat nilai, dan dukung belajar di rumah.',
    cta: 'Masuk portal orang tua',
    tip: 'Belum punya akun? Ajukan sekali, admin akan menyetujui.',
  },
  guru: {
    title: 'Portal guru & admin',
    subtitle: 'Kelola soal, kuis, dan pantau capaian kelas dengan mudah.',
    cta: 'Masuk sebagai guru',
  },
  tes: {
    title: 'Mode uji sistem',
    subtitle: 'Khusus akun dummy untuk memeriksa alur tanpa data siswa nyata.',
    cta: 'Masuk (akun dummy)',
    tip: 'Hanya muncul di lingkungan internal. Password = NISN.',
  },
}

/** Ilustrasi SVG — belajar, tumbuh, bersama */
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 420 320"
      className="w-full max-w-md mx-auto drop-shadow-lg"
      aria-hidden
    >
      <defs>
        <linearGradient id="rk-book" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="rk-book2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="rk-leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <ellipse cx="210" cy="280" rx="160" ry="22" fill="white" opacity="0.18" />
      <circle cx="48" cy="42" r="3" fill="#fde68a" opacity="0.9" />
      <circle cx="380" cy="58" r="2.5" fill="#fbcfe8" opacity="0.9" />
      <circle cx="360" cy="120" r="2" fill="#c4b5fd" opacity="0.8" />
      <path d="M72 88l2.2 6.8h7.2l-5.8 4.2 2.2 6.8-5.8-4.2-5.8 4.2 2.2-6.8-5.8-4.2h7.2z" fill="#fde68a" opacity="0.85" />
      <path d="M340 36l1.6 5h5.2l-4.2 3 1.6 5-4.2-3-4.2 3 1.6-5-4.2-3h5.2z" fill="#f9a8d4" opacity="0.9" />
      <path d="M88 260c0-40 18-72 18-72s18 32 18 72" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <ellipse cx="92" cy="198" rx="14" ry="8" fill="url(#rk-leaf)" transform="rotate(-35 92 198)" />
      <ellipse cx="120" cy="210" rx="12" ry="7" fill="url(#rk-leaf)" transform="rotate(30 120 210)" />
      <ellipse cx="106" cy="230" rx="10" ry="6" fill="#6ee7b7" transform="rotate(-10 106 230)" />
      <path d="M150 210c40-28 80-28 120 0v48c-40-22-80-22-120 0v-48z" fill="url(#rk-book)" opacity="0.95" />
      <path d="M270 210c40-28 80-28 120 0v48c-40-22-80-22-120 0v-48z" fill="url(#rk-book2)" opacity="0.95" />
      <path d="M270 210v48" stroke="white" strokeWidth="2" opacity="0.5" />
      <path d="M170 228h60M175 240h50M180 252h40" stroke="white" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      <path d="M290 228h60M295 240h50M300 252h40" stroke="white" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      <g transform="translate(300 140) rotate(25)">
        <rect x="0" y="0" width="72" height="12" rx="2" fill="#fbbf24" />
        <rect x="0" y="0" width="12" height="12" rx="2" fill="#f472b6" />
        <path d="M72 0l14 6-14 6z" fill="#fcd34d" />
        <path d="M72 3l8 3-8 3z" fill="#1f2937" opacity="0.7" />
      </g>
      <g transform="translate(200 95)">
        <circle cx="0" cy="0" r="22" fill="#fde68a" />
        <circle cx="-7" cy="-2" r="2.5" fill="#1f2937" />
        <circle cx="7" cy="-2" r="2.5" fill="#1f2937" />
        <path d="M-6 8c3 5 9 5 12 0" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
        <path d="M0 22v38" stroke="#6366f1" strokeWidth="8" strokeLinecap="round" />
        <path d="M0 32l-28-18" stroke="#6366f1" strokeWidth="7" strokeLinecap="round" />
        <path d="M0 32l28-18" stroke="#6366f1" strokeWidth="7" strokeLinecap="round" />
        <path d="M0 60l-16 28" stroke="#4f46e5" strokeWidth="8" strokeLinecap="round" />
        <path d="M0 60l16 28" stroke="#4f46e5" strokeWidth="8" strokeLinecap="round" />
      </g>
      <circle cx="168" cy="100" r="4" fill="#fde68a" opacity="0.9" />
      <circle cx="252" cy="92" r="3" fill="#f9a8d4" opacity="0.9" />
      <circle cx="248" cy="130" r="2.5" fill="#a5b4fc" opacity="0.9" />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as TabKey | null
  const [tab, setTab] = useState<TabKey>(
    tabParam === 'guru' || tabParam === 'tes' || tabParam === 'siswa' || tabParam === 'ortu'
      ? tabParam
      : 'siswa'
  )

  const [students, setStudents] = useState<Student[]>([])
  const [dummyStudents, setDummyStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentPassword, setStudentPassword] = useState('')

  const [staffList, setStaffList] = useState<NamedAccount[]>(STAFF_ACCOUNTS)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [staffPassword, setStaffPassword] = useState('')

  const [parentEmail, setParentEmail] = useState('')
  const [parentPassword, setParentPassword] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', tab)
        return next
      },
      { replace: true }
    )
  }, [tab, setSearchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureStudentSession()
      if (!cancelled && s) {
        navigate('/siswa', { replace: true })
        return
      }
      const p = await ensureParentSession()
      if (!cancelled && p) {
        navigate('/ortu', { replace: true })
        return
      }
      if (!cancelled) setCheckingSession(false)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  useEffect(() => {
    if ((tab !== 'siswa' && tab !== 'tes') || checkingSession) return
    let cancelled = false
    ;(async () => {
      setLoadingStudents(true)
      setError('')
      try {
        let snap
        try {
          snap = await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')))
        } catch {
          snap = await getDocs(collection(db, 'students'))
        }
        if (cancelled) return
        const all = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Student))
          .filter((s) => s.active !== false)

        setStudents(
          all.filter((s) => !isDummyStudent(s)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
        )
        setDummyStudents(
          all.filter((s) => isDummyStudent(s)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
        )

        if (tab === 'siswa' && all.filter((s) => !isDummyStudent(s)).length === 0) {
          setError('Daftar siswa masih kosong. Minta guru mengimpor data di Daftar Siswa.')
        }
        if (tab === 'tes' && all.filter((s) => isDummyStudent(s)).length === 0) {
          setError(
            'Belum ada akun dummy. Tandai siswa uji dengan isDummy: true di Firestore, atau nama/email mengandung "dummy".'
          )
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('Gagal memuat daftar. Coba refresh halaman.')
      } finally {
        if (!cancelled) setLoadingStudents(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, checkingSession])

  useEffect(() => {
    if (tab !== 'guru' || checkingSession) return
    let cancelled = false
    ;(async () => {
      setLoadingStaff(true)
      try {
        const snap = await getDocs(query(collection(db, 'staff'), where('active', '==', true))).catch(
          () => null
        )
        if (cancelled) return
        const fromDb: NamedAccount[] = (snap?.docs || [])
          .map((d) => {
            const data = d.data()
            return {
              id: d.id,
              displayName: String(data.displayName || data.name || d.id),
              email: String(data.email || '').toLowerCase(),
              role: (data.role === 'guru' ? 'guru' : 'admin') as NamedAccount['role'],
              hint: data.hint ? String(data.hint) : undefined,
            }
          })
          .filter((a) => a.email.includes('@'))

        const byEmail = new Map<string, NamedAccount>()
        ;[...STAFF_ACCOUNTS, ...fromDb].forEach((a) => {
          byEmail.set(a.email.toLowerCase(), a)
        })
        setStaffList(
          [...byEmail.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'id'))
        )
      } catch {
        if (!cancelled) setStaffList(STAFF_ACCOUNTS)
      } finally {
        if (!cancelled) setLoadingStaff(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, checkingSession])

  useEffect(() => {
    setError('')
    setSelectedStudentId('')
    setStudentPassword('')
    setSelectedAccountId('')
    setStaffPassword('')
    setParentEmail('')
    setParentPassword('')
    setShowPassword(false)
  }, [tab])

  const listForStudentForm = tab === 'tes' ? dummyStudents : students
  const selectedStudent = listForStudentForm.find((s) => s.id === selectedStudentId)
  const selectedAccount = staffList.find((a) => a.id === selectedAccountId)
  const copy = TAB_COPY[tab]
  const tabMeta = TABS.find((t) => t.key === tab)!

  const handleStudentOrDummySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selectedStudent) {
      setError(tab === 'tes' ? 'Pilih akun dummy dari daftar' : 'Pilih nama kamu dari daftar')
      return
    }
    if (!studentPassword.trim()) {
      setError('Masukkan NISN sebagai password')
      return
    }

    setLoading(true)
    try {
      const em = selectedStudent.email.trim().toLowerCase()
      const cred = await signInWithEmailAndPassword(auth, em, studentPassword.trim())

      setStudentSession({
        studentId: selectedStudent.id!,
        fullName: selectedStudent.fullName,
        nickname: selectedStudent.nickname || '',
        email: selectedStudent.email,
        nisn: selectedStudent.nisn,
        className: selectedStudent.className || '5A',
        authUid: cred.user.uid,
      })

      navigate('/siswa', { replace: true })
    } catch (err: any) {
      console.error(err)
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setError('NISN salah, atau akun login belum dibuat. Coba lagi / hubungi guru.')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Terlalu banyak percobaan. Coba lagi nanti.')
      } else {
        setError('Gagal masuk. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const em = parentEmail.trim().toLowerCase()
    if (!em || !em.includes('@')) {
      setError('Masukkan email yang terdaftar')
      return
    }
    if (!parentPassword.trim()) {
      setError('Masukkan password')
      return
    }

    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, em, parentPassword)
      const session = await ensureParentSession()
      if (!session) {
        setError(
          'Email ini belum terdaftar sebagai orang tua, atau pengajuan belum disetujui admin.'
        )
        try {
          await auth.signOut()
        } catch {
          /* ignore */
        }
        return
      }
      setParentSession(session)
      navigate('/ortu', { replace: true })
    } catch (err: any) {
      console.error(err)
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setError('Email atau password salah, atau akun belum disetujui admin.')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Terlalu banyak percobaan. Coba lagi nanti.')
      } else {
        setError('Gagal masuk. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selectedAccount) {
      setError('Pilih nama dari daftar')
      return
    }
    if (!staffPassword.trim()) {
      setError('Masukkan password')
      return
    }

    setLoading(true)
    try {
      await signInWithEmailAndPassword(
        auth,
        selectedAccount.email.trim().toLowerCase(),
        staffPassword
      )
    } catch (err: any) {
      console.error(err)
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setError('Password salah, atau akun belum terdaftar di sistem.')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Terlalu banyak percobaan. Coba lagi nanti.')
      } else {
        setError('Gagal masuk. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 border border-gray-200 rounded-xl bg-white/80 focus:bg-white focus:ring-2 outline-none text-sm transition shadow-sm'

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-500 text-sm">Menyiapkan Ruang Kuis…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex flex-col lg:flex-row">
      <aside className="relative lg:w-[48%] xl:w-[46%] overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="absolute top-1/3 right-8 w-40 h-40 rounded-full bg-indigo-300/20 blur-2xl" />

        <div className="relative z-10 flex flex-col min-h-[280px] lg:min-h-screen px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center font-bold text-sm shadow-lg">
              RK
            </div>
            <div>
              <p className="font-bold text-lg tracking-tight">Ruang Kuis</p>
              <p className="text-indigo-100 text-xs">Belajar, latihan, tumbuh bersama</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center py-6 lg:py-10">
            <p className="text-indigo-100 text-sm font-medium mb-2 tracking-wide">
              Untuk kelas 5 · Kurikulum Merdeka
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.6rem] font-bold leading-tight max-w-md">
              Setiap soal adalah langkah kecil menuju percaya diri.
            </h1>
            <p className="mt-4 text-indigo-100/95 text-sm sm:text-base leading-relaxed max-w-md">
              Di sini siswa berlatih, orang tua mendampingi, dan guru memantau progres — dengan
              semangat yang hangat dan optimis.
            </p>

            <div className="mt-6 lg:mt-8">
              <HeroIllustration />
            </div>

            <ul className="mt-4 lg:mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 max-w-lg">
              {[
                { t: 'Latihan mandiri', d: 'Kapan saja, sesuai tempo anak' },
                { t: 'Pantauan ortu', d: 'Nilai & riwayat transparan' },
                { t: 'Bank soal guru', d: 'Siap pakai, mudah dikelola' },
              ].map((item) => (
                <li
                  key={item.t}
                  className="rounded-xl bg-white/10 border border-white/15 px-3 py-2.5 backdrop-blur-sm"
                >
                  <p className="text-xs font-semibold text-white">{item.t}</p>
                  <p className="text-[11px] text-indigo-100/90 mt-0.5 leading-snug">{item.d}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-indigo-200/80 hidden lg:block">
            Ruang Kuis · Kelas 5 · Tempat aman untuk mencoba dan berkembang
          </p>
        </div>
      </aside>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-6 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
              RK
            </div>
            <div>
              <p className="font-semibold text-gray-900">Ruang Kuis</p>
              <p className="text-[11px] text-gray-500">Masuk untuk melanjutkan</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/40 border border-gray-100/80 p-6 sm:p-8">
            <div className="mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                {copy.title}
              </h2>
              <p className="text-gray-500 mt-1.5 text-sm leading-relaxed">{copy.subtitle}</p>
            </div>

            <div className="flex rounded-2xl bg-gray-100/90 p-1 mb-6 gap-0.5">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex-1 text-[11px] sm:text-xs font-semibold py-2.5 rounded-xl transition ${
                    tab === t.key ? t.active : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="sm:hidden">{t.short}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {(tab === 'siswa' || tab === 'tes') && (
              <form onSubmit={handleStudentOrDummySubmit} className="space-y-4">
                {tab === 'tes' && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
                    Mode internal: hanya akun <strong>dummy / uji</strong>. Password = NISN.
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {tab === 'tes' ? 'Akun dummy' : 'Nama kamu'}
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    disabled={loadingStudents || listForStudentForm.length === 0}
                    className={`${inputClass} ${tabMeta.ring}`}
                    required
                  >
                    <option value="">
                      {loadingStudents ? 'Memuat daftar...' : '— Pilih nama —'}
                    </option>
                    {listForStudentForm.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                        {s.nickname ? ` (${s.nickname})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password (NISN)
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    className={`${inputClass} font-mono ${tabMeta.ring}`}
                    placeholder="NISN"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className={`text-xs font-medium ${tabMeta.accent} hover:underline`}
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
                </button>
                {copy.tip && <p className="text-[11px] text-gray-400 leading-relaxed">{copy.tip}</p>}
                <button
                  type="submit"
                  disabled={loading || loadingStudents || !selectedStudentId}
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-indigo-400 disabled:to-violet-400 text-white font-semibold py-3.5 rounded-xl transition shadow-md shadow-indigo-200/50"
                >
                  {loading ? 'Memeriksa…' : copy.cta}
                </button>
              </form>
            )}

            {tab === 'ortu' && (
              <form onSubmit={handleParentSubmit} className="space-y-4">
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-xs text-violet-900 leading-relaxed">
                  Masuk dengan email pengajuan. Belum punya akun?{' '}
                  <Link to="/ortu/daftar" className="font-semibold underline underline-offset-2">
                    Ajukan di sini
                  </Link>
                  — admin akan menyetujui.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className={`${inputClass} focus:ring-violet-500/30`}
                    placeholder="email@anda.com"
                    required
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={parentPassword}
                    onChange={(e) => setParentPassword(e.target.value)}
                    className={`${inputClass} focus:ring-violet-500/30`}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-xs font-medium text-violet-600 hover:underline"
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
                </button>
                {copy.tip && <p className="text-[11px] text-gray-400 leading-relaxed">{copy.tip}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 disabled:from-violet-400 disabled:to-fuchsia-400 text-white font-semibold py-3.5 rounded-xl transition shadow-md shadow-violet-200/50"
                >
                  {loading ? 'Memeriksa…' : copy.cta}
                </button>
                <p className="text-center text-xs text-gray-500">
                  <Link
                    to="/ortu/daftar"
                    className="text-violet-600 hover:underline font-semibold"
                  >
                    Belum punya akun? Ajukan portal orang tua
                  </Link>
                </p>
              </form>
            )}

            {tab === 'guru' && (
              <form onSubmit={handleStaffSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nama guru / admin
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    disabled={loadingStaff}
                    className={`${inputClass} focus:ring-sky-500/30`}
                    required
                  >
                    <option value="">{loadingStaff ? 'Memuat...' : '— Pilih nama —'}</option>
                    {staffList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName} · {roleLabel(a.role)}
                      </option>
                    ))}
                  </select>
                  {selectedAccount?.hint && (
                    <p className="text-[11px] text-gray-400 mt-1.5">{selectedAccount.hint}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={`${inputClass} focus:ring-sky-500/30`}
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-xs font-medium text-sky-600 hover:underline"
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedAccountId}
                  className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 disabled:from-sky-400 disabled:to-indigo-400 text-white font-semibold py-3.5 rounded-xl transition shadow-md shadow-sky-200/50"
                >
                  {loading ? 'Memeriksa…' : copy.cta}
                </button>
              </form>
            )}

            <div className="mt-8 pt-5 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 leading-relaxed">
                Sudah siap mencoba tanpa login guru?{' '}
                <Link to="/kerjakan" className="text-indigo-600 hover:underline font-medium">
                  Mulai dari portal siswa
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] text-gray-400 mt-6">
            Belajar itu perjalanan — hari ini cukup selangkah lebih maju ✨
          </p>
        </div>
      </main>
    </div>
  )
}
