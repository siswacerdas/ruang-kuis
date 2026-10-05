import { useEffect, useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { ensureStudentSession, setStudentSession } from '../lib/studentSession'
import { STAFF_ACCOUNTS, roleLabel, type NamedAccount } from '../lib/loginAccounts'
import { isDummyStudent, type Student } from '../types/student'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'

type TabKey = 'siswa' | 'guru' | 'tes'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'siswa', label: 'Siswa' },
  { key: 'guru', label: 'Guru' },
  { key: 'tes', label: 'Tes Sistem' },
]

export default function Login() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as TabKey | null
  const [tab, setTab] = useState<TabKey>(
    tabParam === 'guru' || tabParam === 'tes' || tabParam === 'siswa' ? tabParam : 'siswa'
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

        const real = all
          .filter((s) => !isDummyStudent(s))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
        const dummy = all
          .filter((s) => isDummyStudent(s))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))

        setStudents(real)
        setDummyStudents(dummy)

        if (tab === 'siswa' && real.length === 0) {
          setError('Daftar siswa masih kosong. Minta guru mengimpor data di Daftar Siswa.')
        }
        if (tab === 'tes' && dummy.length === 0) {
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
        const snap = await getDocs(
          query(collection(db, 'staff'), where('active', '==', true))
        ).catch(() => null)
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
    <div className="min-h-screen bg-[#F5F6FA] flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-300 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-white max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-8">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-4 leading-tight">Ruang Kuis</h2>
          <p className="text-indigo-100 text-lg leading-relaxed">
            Pilih nama dari daftar. Siswa asli, guru, dan akun dummy (uji sistem) terpisah di tab
            masing-masing.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-6 justify-center">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-lg">Ruang Kuis</p>
              <p className="text-xs text-gray-400">Login</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
            <div className="mb-5">
              <h1 className="text-2xl font-bold text-gray-900">Masuk</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Pilih tab sesuai peran, lalu pilih nama dari daftar
              </p>
            </div>

            <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition ${
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
                    Hanya akun <strong>dummy / uji</strong>. Tidak tercampur dengan daftar siswa kelas.
                    Password = NISN.
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
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none font-mono"
                    placeholder="NISN"
                    required
                    autoComplete="current-password"
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">Password = nomor NISN (bukan email).</p>
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
                  {loading
                    ? 'Memeriksa...'
                    : tab === 'tes'
                      ? 'Masuk (akun dummy)'
                      : 'Masuk sebagai siswa'}
                </button>
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
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full px-4 py-2.5 pr-11 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
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
              Pintasan siswa:{' '}
              <Link to="/kerjakan" className="text-indigo-600 hover:underline">
                /kerjakan
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
