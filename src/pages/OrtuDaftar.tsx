import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  addDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isDummyStudent, type Student, isValidEmail } from '../types/student'
import {
  isValidWhatsapp,
  normalizeWhatsapp,
  type ParentRequest,
} from '../types/parent'

/**
 * Form pengajuan akun orang tua (publik, tanpa login).
 *
 * PENTING: jangan getDocs/query ke `parents` atau `parentRequests` di sini.
 * Rules hanya mengizinkan admin membaca koleksi itu — query dari user
 * belum login → FirebaseError Missing or insufficient permissions.
 * Duplikat dicek admin saat approve.
 */
export default function OrtuDaftar() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [studentId, setStudentId] = useState('')
  const [fullName, setFullName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingStudents(true)
      try {
        let snap
        try {
          snap = await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')))
        } catch {
          snap = await getDocs(collection(db, 'students'))
        }
        if (cancelled) return
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Student))
          .filter((s) => s.active !== false)
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
        setStudents(list)
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('Gagal memuat daftar siswa. Coba refresh.')
      } finally {
        if (!cancelled) setLoadingStudents(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selected = students.find((s) => s.id === studentId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!selected?.id) {
      setError('Pilih nama anak dari daftar')
      return
    }
    if (!fullName.trim() || fullName.trim().length < 3) {
      setError('Nama orang tua minimal 3 karakter')
      return
    }
    if (!isValidWhatsapp(whatsapp)) {
      setError('Nomor WhatsApp tidak valid. Contoh: 081234567890')
      return
    }
    const em = email.trim().toLowerCase()
    if (!isValidEmail(em)) {
      setError('Email login tidak valid')
      return
    }
    if (password.length < 8) {
      setError('Password minimal 8 karakter')
      return
    }
    if (password !== password2) {
      setError('Konfirmasi password tidak sama')
      return
    }

    setSubmitting(true)
    try {
      // Jangan query parents / parentRequests di sini (butuh admin auth).
      const payload: Omit<ParentRequest, 'id'> = {
        fullName: fullName.trim(),
        whatsapp: normalizeWhatsapp(whatsapp),
        email: em,
        tempPassword: password,
        studentIds: [selected.id!],
        studentNames: [selected.fullName],
        status: 'pending',
        createdAt: serverTimestamp(),
      }

      const ref = await addDoc(collection(db, 'parentRequests'), payload)

      try {
        await addDoc(collection(db, 'adminNotifications'), {
          type: 'parent_request',
          title: `Pengajuan akun ortu: ${payload.fullName}`,
          body: `Anak: ${selected.fullName} · WA: ${payload.whatsapp} · ${em}`,
          refCollection: 'parentRequests',
          refId: ref.id,
          read: false,
          createdAt: serverTimestamp(),
        })
      } catch (nErr) {
        console.warn('adminNotifications', nErr)
      }

      setMessage(
        'Pengajuan terkirim. Admin akan memeriksa dan menyetujui akun Anda. Setelah disetujui, silakan masuk di halaman login tab Orang Tua.'
      )
      setPassword('')
      setPassword2('')
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Gagal mengirim pengajuan: ${msg.slice(0, 160)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to="/login?tab=ortu" className="inline-flex items-center gap-2 text-indigo-600 text-sm font-medium">
            ← Kembali ke login
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Ajukan akun orang tua</h1>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Pilih nama anak, isi data Anda. Admin sekolah akan menyetujui sebelum akun aktif.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm px-4 py-3 rounded-xl">
              {message}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => navigate('/login?tab=ortu')}
                  className="text-indigo-600 font-medium text-sm hover:underline"
                >
                  Ke halaman login
                </button>
              </div>
            </div>
          )}

          {!message && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama anak *</label>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  disabled={loadingStudents}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                >
                  <option value="">{loadingStudents ? 'Memuat daftar...' : '— Pilih nama anak —'}</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                      {s.nickname ? ` (${s.nickname})` : ''}
                      {isDummyStudent(s) ? ' · uji' : ''}
                      {s.className ? ` · ${s.className}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Hanya anak yang sudah terdaftar di sekolah. Jika nama tidak ada, hubungi guru.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nama Anda (orang tua / wali) *
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  placeholder="Nama lengkap"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nomor WhatsApp *</label>
                <input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  required
                  inputMode="tel"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  placeholder="081234567890"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email untuk login *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  placeholder="email@anda.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password * (min. 8 karakter)
                </label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ulangi password *</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  autoComplete="new-password"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {showPw ? 'Sembunyikan' : 'Tampilkan'} password
              </button>

              <button
                type="submit"
                disabled={submitting || loadingStudents}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 rounded-xl transition"
              >
                {submitting ? 'Mengirim...' : 'Kirim pengajuan'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Dengan mengajukan, Anda menyatakan sebagai orang tua/wali siswa yang dipilih.
        </p>
      </div>
    </div>
  )
}
