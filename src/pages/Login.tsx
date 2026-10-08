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

const TABS: { key: TabKey; label: string }[] = [
  { key: 'siswa', label: 'Siswa' },
  { key: 'ortu', label: 'Orang Tua' },
  { key: 'guru', label: 'Guru' },
  { key: 'tes', label: 'Tes' },
]

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

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            RK
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-lg">Ruang Kuis</p>
            <p className="text-xs text-gray-500">Tempat berlatih dan tumbuh</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
          <div className="mb-5">
            <h1 className="text-2xl font-bold text-gray-900">Selamat datang</h1>
            <p className="text-gray-500 mt-1 text-sm leading-relaxed">
              Pilih tab <span className="text-gray-700 font-medium">Siswa</span>,{' '}
              <span className="text-gray-700 font-medium">Orang Tua</span>, atau{' '}
              <span className="text-gray-700 font-medium">Guru</span>, lalu masuk.
            </p>
          </div>

          <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 text-xs sm:text-sm font-medium py-2 rounded-lg transition ${
                  tab === t.key
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
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
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Hanya akun <strong>dummy / uji</strong>. Password = NISN.
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
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  required
                >
                  <option value="">{loadingStudents ? 'Memuat daftar...' : '— Pilih nama —'}</option>
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
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none font-mono"
                  placeholder="NISN"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
              </button>
              <button
                type="submit"
                disabled={loading || loadingStudents || !selectedStudentId}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 rounded-xl transition"
              >
                {loading ? 'Memeriksa...' : tab === 'tes' ? 'Masuk (akun dummy)' : 'Masuk sebagai siswa'}
              </button>
            </form>
          )}

          {tab === 'ortu' && (
            <form onSubmit={handleParentSubmit} className="space-y-4">
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                Masuk dengan email pengajuan. Belum punya akun?{' '}
                <Link to="/ortu/daftar" className="font-semibold underline">
                  Ajukan akun
                </Link>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
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
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 rounded-xl transition"
              >
                {loading ? 'Memeriksa...' : 'Masuk sebagai orang tua'}
              </button>
              <p className="text-center text-xs text-gray-500">
                <Link to="/ortu/daftar" className="text-indigo-600 hover:underline font-medium">
                  Belum punya akun? Ajukan di sini
                </Link>
              </p>
            </form>
          )}

          {tab === 'guru' && (
            <form onSubmit={handleStaffSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama guru / admin</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  disabled={loadingStaff}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
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
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
              </button>
              <button
                type="submit"
                disabled={loading || !selectedAccountId}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 rounded-xl transition"
              >
                {loading ? 'Memeriksa...' : 'Masuk sebagai guru'}
              </button>
            </form>
          )}

          <p className="text-center text-xs text-gray-400 mt-6">
            Sudah siap belajar?{' '}
            <Link to="/kerjakan" className="text-indigo-600 hover:underline">
              Mulai dari sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
