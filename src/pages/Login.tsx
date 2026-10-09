import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { clearStudentSession, setStudentSession } from '../lib/studentSession'
import { clearParentSession, ensureParentSession, setParentSession } from '../lib/parentSession'
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
    accent: 'text-emerald-700',
    active: 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-100',
    ring: 'focus:ring-emerald-500/30',
  },
  {
    key: 'ortu',
    label: 'Orang Tua',
    short: 'Ortu',
    accent: 'text-amber-700',
    active: 'bg-white text-amber-800 shadow-sm ring-1 ring-amber-100',
    ring: 'focus:ring-amber-500/30',
  },
  {
    key: 'guru',
    label: 'Guru',
    short: 'Guru',
    accent: 'text-sky-700',
    active: 'bg-white text-sky-800 shadow-sm ring-1 ring-sky-100',
    ring: 'focus:ring-sky-500/30',
  },
  {
    key: 'tes',
    label: 'Tes',
    short: 'Tes',
    accent: 'text-violet-700',
    active: 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-100',
    ring: 'focus:ring-violet-500/30',
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return
      // JANGAN auto-redirect ke /siswa atau /ortu dari halaman login.
      // Itu yang mengunci user di akun dummy: Auth persistence masih dummy →
      // ensureStudentSession sukses → navigate /siswa sebelum user sempat ganti akun.
      // Form login harus selalu bisa dipakai untuk ganti peran/akun.
      if (!user) {
        clearStudentSession()
        clearParentSession()
      } else {
        const email = (user.email || '').toLowerCase()
        try {
          const raw = localStorage.getItem('rk_student')
          if (raw) {
            const s = JSON.parse(raw)
            if ((s.email || '').toLowerCase() !== email) {
              clearStudentSession()
            }
          }
        } catch {
          clearStudentSession()
        }
        try {
          const raw = localStorage.getItem('rk_parent')
          if (raw) {
            const s = JSON.parse(raw)
            if ((s.email || '').toLowerCase() !== email) {
              clearParentSession()
            }
          }
        } catch {
          clearParentSession()
        }
      }
      if (!cancelled) setCheckingSession(false)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

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
      try {
        await signOut(auth)
      } catch {
        /* ignore */
      }
      clearStudentSession()
      clearParentSession()

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
      try {
        await signOut(auth)
      } catch {
        /* ignore */
      }
      clearStudentSession()
      clearParentSession()

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
      clearStudentSession()
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
      try {
        await signOut(auth)
      } catch {
        /* ignore */
      }
      clearStudentSession()
      clearParentSession()

      await signInWithEmailAndPassword(
        auth,
        selectedAccount.email.trim().toLowerCase(),
        staffPassword
      )
      navigate('/dashboard', { replace: true })
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
    'w-full px-4 py-3 border border-gray-200 rounded-xl bg-white/90 focus:bg-white focus:ring-2 outline-none text-sm transition shadow-sm'

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F4EF]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-500 text-sm">Menyiapkan Ruang Kuis…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F4EF] flex flex-col lg:flex-row">
      <aside className="relative lg:w-[52%] xl:w-[50%] overflow-hidden text-white min-h-[320px] lg:min-h-screen">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/login-hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/75 via-teal-800/65 to-amber-900/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />

        <div className="relative z-10 flex flex-col min-h-[320px] lg:min-h-screen px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/25 border border-white/30 flex items-center justify-center font-bold text-sm shadow-lg">
              RK
            </div>
            <div>
              <p className="font-bold text-lg tracking-tight">Ruang Kuis</p>
              <p className="text-emerald-100/90 text-xs">Belajar, latihan, tumbuh bersama</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center py-8 lg:py-12">
            <p className="text-emerald-100/95 text-sm font-medium mb-3 tracking-wide">
              Untuk kelas 5A · SD Muhammadiyah 01 Kukusan
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.55rem] font-bold leading-tight max-w-lg drop-shadow-sm">
              Setiap soal adalah langkah kecil menuju percaya diri.
            </h1>

            <blockquote className="mt-6 max-w-md">
              <p className="text-white/95 text-sm sm:text-base leading-relaxed italic">
                “Bukan tentang selalu benar, melainkan tentang terus tumbuh lewat setiap usaha.
              </p>
              <p className="text-emerald-50/95 text-sm sm:text-base leading-relaxed mt-1.5">
                Tumbuhlah dengan tenang. Ilmu yang dipelajari dengan hati akan menyala lebih lama.”
              </p>
            </blockquote>

            <ul className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-lg">
              {[
                { t: 'Latihan mandiri', d: 'Sesuai tempo anak' },
                { t: 'Pantauan ortu', d: 'Nilai & riwayat jelas' },
                { t: 'Bank soal guru', d: 'Siap pakai & mudah' },
              ].map((item) => (
                <li
                  key={item.t}
                  className="rounded-xl bg-white/15 border border-white/20 px-3 py-2.5"
                >
                  <p className="text-xs font-semibold text-white">{item.t}</p>
                  <p className="text-[11px] text-emerald-100/85 mt-0.5">{item.d}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto pt-4 pb-2">
            <div className="rounded-2xl bg-black/45 border border-white/15 px-4 py-3.5 max-w-lg">
              <p className="text-[13px] sm:text-sm leading-relaxed text-white/95">
                “Barangsiapa menempuh jalan untuk mencari ilmu, maka Allah akan mudahkan baginya jalan menuju surga.”
              </p>
              <p className="text-[11px] text-emerald-200/90 mt-1.5 font-medium">— HR. Muslim</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col justify-center px-5 py-8 sm:px-10 lg:px-14 xl:px-16">
        <div className="w-full max-w-md mx-auto">
          <div className="flex gap-1 p-1 rounded-2xl bg-white/80 border border-gray-100 shadow-sm mb-7">
            {TABS.filter((t) => t.key !== 'tes' || import.meta.env.DEV || tab === 'tes').map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 px-2 rounded-xl text-sm font-semibold transition ${
                  tab === t.key ? t.active : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-emerald-900/5 border border-gray-100/80 p-6 sm:p-8">
            <div className="mb-6">
              <h2 className={`text-xl font-bold ${tabMeta.accent}`}>{copy.title}</h2>
              <p className="text-gray-500 text-sm mt-1.5 leading-relaxed">{copy.subtitle}</p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
                {error}
              </div>
            )}

            {(tab === 'siswa' || tab === 'tes') && (
              <form onSubmit={handleStudentOrDummySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {tab === 'tes' ? 'Akun dummy' : 'Nama siswa'}
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    disabled={loadingStudents}
                    className={`${inputClass} ${tabMeta.ring}`}
                    required
                  >
                    <option value="">
                      {loadingStudents ? 'Memuat...' : '— Pilih nama —'}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password (NISN)</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={`${inputClass} ${tabMeta.ring} font-mono`}
                    placeholder="NISN kamu"
                  />
                  {copy.tip && <p className="text-[11px] text-gray-400 mt-1.5">{copy.tip}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className={`text-xs font-medium ${tabMeta.accent} hover:underline`}
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
                </button>
                <button
                  type="submit"
                  disabled={loading || loadingStudents || !selectedStudentId}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-emerald-400 disabled:to-teal-400 text-white font-semibold py-3.5 rounded-xl transition shadow-md shadow-emerald-200/50"
                >
                  {loading ? 'Memeriksa…' : copy.cta}
                </button>
              </form>
            )}

            {tab === 'ortu' && (
              <form onSubmit={handleParentSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    required
                    autoComplete="username"
                    className={`${inputClass} focus:ring-amber-500/30`}
                    placeholder="email@contoh.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={parentPassword}
                    onChange={(e) => setParentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={`${inputClass} focus:ring-amber-500/30`}
                    placeholder="••••••••"
                  />
                  {copy.tip && <p className="text-[11px] text-gray-400 mt-1.5">{copy.tip}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-xs font-medium text-amber-700 hover:underline"
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-amber-300 disabled:to-orange-300 text-white font-semibold py-3.5 rounded-xl transition shadow-md shadow-amber-200/50"
                >
                  {loading ? 'Memeriksa…' : copy.cta}
                </button>
                <p className="text-center text-xs text-gray-500 space-y-1">
                  <span className="block">
                    Belum punya akun?{' '}
                    <Link to="/ortu/daftar" className="text-amber-700 font-medium hover:underline">
                      Ajukan akun orang tua
                    </Link>
                  </span>
                  <span className="block">
                    <Link to="/ortu/lupa-password" className="text-amber-700 font-medium hover:underline">
                      Lupa password?
                    </Link>
                  </span>
                </p>
              </form>
            )}

            {tab === 'guru' && (
              <form onSubmit={handleStaffSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama</label>
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
                  className="text-xs font-medium text-sky-700 hover:underline"
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
                <Link to="/kerjakan" className="text-emerald-700 hover:underline font-medium">
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
