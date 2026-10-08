import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  addDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import Layout from '../components/Layout'
import { createStudentAuthAccount } from '../lib/createStudentAuth'
import { isStaffEmail } from '../lib/loginAccounts'
import type { ParentRequest } from '../types/parent'

function statusMeta(status: string) {
  if (status === 'pending')
    return { label: 'Menunggu', className: 'bg-amber-50 text-amber-800 border-amber-200' }
  if (status === 'approved')
    return { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
  if (status === 'rejected')
    return { label: 'Ditolak', className: 'bg-gray-100 text-gray-600 border-gray-200' }
  return { label: status, className: 'bg-gray-100 text-gray-600 border-gray-200' }
}

/**
 * Admin: daftar pengajuan akun orang tua — setujui / tolak.
 * Saat setujui: buat Firebase Auth + dokumen parents, hapus tempPassword.
 * Sinkron parentEmail ke dokumen siswa agar email hasil kuis terkirim.
 */
export default function AdminPengajuanOrtu() {
  const [requests, setRequests] = useState<ParentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const snap = await getDocs(
        query(collection(db, 'parentRequests'), orderBy('createdAt', 'desc'))
      )
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ParentRequest)))
    } catch (err) {
      console.error(err)
      setError('Gagal memuat pengajuan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const pendingCount = requests.filter((r) => r.status === 'pending').length
  const filtered =
    filter === 'pending' ? requests.filter((r) => r.status === 'pending') : requests

  const approve = async (r: ParentRequest) => {
    if (!r.tempPassword) {
      setError('Password sementara tidak ada. Minta ortu daftar ulang.')
      return
    }
    if (
      !confirm(
        `Setujui akun untuk ${r.fullName}?\nEmail: ${r.email}\nAnak: ${(r.studentNames || []).join(', ')}`
      )
    )
      return

    setBusyId(r.id!)
    setError('')
    setMessage('')
    try {
      const em = r.email.toLowerCase()
      if (await isStaffEmail(em)) {
        setError(
          `Email ${em} adalah akun guru/admin. Tidak bisa disetujui sebagai ortu. Minta email lain.`
        )
        setBusyId(null)
        return
      }

      const existing = await getDocs(query(collection(db, 'parents'), where('email', '==', em)))
      if (!existing.empty) {
        setError('Email sudah terdaftar di parents. Tolak atau perbaiki manual.')
        setBusyId(null)
        return
      }

      const uid = await createStudentAuthAccount(r.email, r.tempPassword)

      await addDoc(collection(db, 'parents'), {
        fullName: r.fullName,
        whatsapp: r.whatsapp,
        email: r.email.toLowerCase(),
        authUid: uid,
        studentIds: r.studentIds || [],
        active: true,
        mustChangePassword: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      const parentEm = r.email.toLowerCase()
      for (const sid of r.studentIds || []) {
        try {
          await updateDoc(doc(db, 'students', sid), { parentEmail: parentEm })
        } catch (err) {
          console.warn('sync parentEmail siswa', sid, err)
        }
      }

      await updateDoc(doc(db, 'parentRequests', r.id!), {
        status: 'approved',
        tempPassword: null,
        reviewedAt: serverTimestamp(),
      })

      setMessage(`Disetujui: ${r.fullName} (${r.email}). Ortu bisa login sekarang.`)
      await load()
    } catch (err: unknown) {
      console.error(err)
      const anyErr = err as { code?: string; message?: string }
      if (anyErr?.code === 'auth/email-already-in-use') {
        setError(
          `Email ${r.email} sudah ada di Firebase Auth. Hapus user di Console atau minta email lain.`
        )
      } else {
        setError(`Gagal menyetujui: ${String(anyErr?.message || err).slice(0, 160)}`)
      }
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (r: ParentRequest) => {
    const note = prompt('Alasan penolakan (opsional):') ?? ''
    setBusyId(r.id!)
    setError('')
    try {
      await updateDoc(doc(db, 'parentRequests', r.id!), {
        status: 'rejected',
        note: note || null,
        tempPassword: null,
        reviewedAt: serverTimestamp(),
      })
      setMessage(`Ditolak: ${r.fullName}`)
      await load()
    } catch (err) {
      console.error(err)
      setError('Gagal menolak pengajuan')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Layout
      title="Pengajuan orang tua"
      subtitle="Setujui akun ortu. Email disalin ke parentEmail pada data siswa."
      actions={
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {f === 'pending' ? `Menunggu${pendingCount ? ` (${pendingCount})` : ''}` : 'Semua'}
            </button>
          ))}
        </div>
      }
    >
      <div className="max-w-3xl space-y-4">
        {(error || message) && (
          <div
            className={`rounded-xl border text-sm px-4 py-3 ${
              error
                ? 'bg-red-50 border-red-100 text-red-700'
                : 'bg-emerald-50 border-emerald-100 text-emerald-800'
            }`}
          >
            {error || message}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 text-center">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-gray-400">Memuat pengajuan…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">
              {filter === 'pending' ? 'Tidak ada pengajuan menunggu' : 'Belum ada pengajuan'}
            </p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
              Ortu mengajukan lewat{' '}
              <code className="bg-gray-50 px-1 rounded text-[11px]">/ortu/daftar</code>. Setelah
              disetujui, mereka bisa login di tab Orang Tua.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => {
              const st = statusMeta(r.status)
              return (
                <li
                  key={r.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{r.fullName}</p>
                      <p className="text-xs text-gray-500 mt-1 break-all">
                        {r.email}
                        {r.whatsapp ? ` · WA ${r.whatsapp}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${st.className}`}
                    >
                      {st.label}
                    </span>
                  </div>

                  <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                      Anak terhubung
                    </p>
                    <p className="text-sm text-gray-800 mt-0.5">
                      {(r.studentNames || []).join(', ') ||
                        (r.studentIds || []).join(', ') ||
                        '—'}
                    </p>
                  </div>

                  {r.note && r.status === 'rejected' && (
                    <p className="text-xs text-gray-500 mt-2">Catatan: {r.note}</p>
                  )}

                  {r.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => approve(r)}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition"
                      >
                        {busyId === r.id ? 'Memproses…' : 'Setujui'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => reject(r)}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-sm font-medium text-gray-700 transition"
                      >
                        Tolak
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed px-1">
          Password sementara disimpan di pengajuan sampai diproses, lalu dihapus. Email ortu yang
          disetujui tidak boleh sama dengan akun guru/admin.
        </p>
      </div>
    </Layout>
  )
}
