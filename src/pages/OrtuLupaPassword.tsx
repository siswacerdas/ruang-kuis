import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isValidWhatsapp, normalizeWhatsapp } from '../types/parent'

/**
 * Form publik: ortu meminta reset password.
 * Admin memproses di /akun-ortu (tab Reset password).
 */
export default function OrtuLupaPassword() {
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const em = email.trim().toLowerCase()
    if (!em.includes('@')) {
      setError('Masukkan email yang terdaftar')
      return
    }
    if (!isValidWhatsapp(whatsapp)) {
      setError('Nomor WhatsApp tidak valid (contoh: 081234567890)')
      return
    }

    setLoading(true)
    try {
      // Cek apakah email terdaftar sebagai ortu (opsional — jangan bocorkan terlalu detail)
      const parentSnap = await getDocs(
        query(collection(db, 'parents'), where('email', '==', em))
      )
      if (parentSnap.empty) {
        // Tetap tampilkan sukses generik agar tidak enumerasi email
        setDone(true)
        setLoading(false)
        return
      }

      const parent = parentSnap.docs[0]
      const data = parent.data()
      if (data.active === false) {
        setError('Akun ini dinonaktifkan. Hubungi guru/admin sekolah.')
        setLoading(false)
        return
      }

      // Cegah spam: jika sudah ada pending untuk email yang sama
      const existing = await getDocs(
        query(
          collection(db, 'parentPasswordResets'),
          where('email', '==', em),
          where('status', '==', 'pending')
        )
      )
      if (!existing.empty) {
        setDone(true)
        setLoading(false)
        return
      }

      const resetRef = await addDoc(collection(db, 'parentPasswordResets'), {
        parentId: parent.id,
        email: em,
        whatsapp: normalizeWhatsapp(whatsapp),
        status: 'pending',
        createdAt: serverTimestamp(),
      })

      await addDoc(collection(db, 'adminNotifications'), {
        type: 'parent_password_reset',
        title: 'Permintaan reset password ortu',
        body: `${em} · WA ${normalizeWhatsapp(whatsapp)}`,
        refCollection: 'parentPasswordResets',
        refId: resetRef.id,
        read: false,
        createdAt: serverTimestamp(),
      })

      setDone(true)
    } catch (err) {
      console.error(err)
      setError('Gagal mengirim permintaan. Coba lagi atau hubungi guru.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F4EF] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to="/login?tab=ortu" className="inline-flex items-center gap-2 text-amber-800">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold text-sm flex items-center justify-center shadow">
              RK
            </div>
            <span className="font-bold">Ruang Kuis</span>
          </Link>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100/80 p-6 sm:p-8">
          <h1 className="text-xl font-bold text-amber-800">Lupa password</h1>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
            Isi email dan WhatsApp yang terdaftar. Admin akan memproses dan mengirimkan password
            sementara lewat WhatsApp.
          </p>

          {done ? (
            <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-4 text-sm text-emerald-800">
              <p className="font-semibold">Permintaan terkirim</p>
              <p className="mt-1.5 text-emerald-700 leading-relaxed">
                Jika email terdaftar sebagai orang tua, admin akan meninjau dan menghubungi Anda.
                Biasanya diproses dalam 1×24 jam kerja sekolah.
              </p>
              <Link
                to="/login?tab=ortu"
                className="inline-block mt-4 text-amber-700 font-medium hover:underline text-sm"
              >
                Kembali ke login →
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/30 outline-none text-sm"
                  placeholder="email@contoh.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  WhatsApp terdaftar
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/30 outline-none text-sm"
                  placeholder="081234567890"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Harus sama dengan nomor saat mengajukan akun, agar admin bisa menghubungi.
                </p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-amber-300 disabled:to-orange-300 text-white font-semibold py-3.5 rounded-xl transition shadow-md shadow-amber-200/50"
              >
                {loading ? 'Mengirim…' : 'Kirim permintaan reset'}
              </button>
              <p className="text-center text-xs text-gray-500">
                <Link to="/login?tab=ortu" className="text-amber-700 font-medium hover:underline">
                  Kembali ke login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
