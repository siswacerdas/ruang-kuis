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
import type { ParentRequest } from '../types/parent'

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
      const existing = await getDocs(
        query(collection(db, 'parents'), where('email', '==', r.email.toLowerCase()))
      )
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
    if (!confirm(`Tolak pengajuan ${r.fullName}?`)) return
    setBusyId(r.id!)
    try {
      await updateDoc(doc(db, 'parentRequests', r.id!), {
        status: 'rejected',
        tempPassword: null,
        reviewedAt: serverTimestamp(),
      })
      setMessage(`Ditolak: ${r.fullName}`)
      await load()
    } catch (err) {
      console.error(err)
      setError('Gagal menolak')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pengajuan orang tua</h1>
            <p className="text-sm text-gray-500 mt-1">
              Setujui akun ortu. Email ortu disalin ke parentEmail pada data siswa.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilter('pending')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                filter === 'pending'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              Menunggu
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Semua
            </button>
          </div>
        </div>

        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Memuat…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
            Tidak ada pengajuan{filter === 'pending' ? ' menunggu' : ''}.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900">{r.fullName}</p>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      r.status === 'pending'
                        ? 'bg-amber-50 text-amber-700'
                        : r.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {r.email} · WA {r.whatsapp}
                </p>
                <p className="text-xs text-gray-600">
                  Anak: {(r.studentNames || []).join(', ') || (r.studentIds || []).join(', ')}
                </p>
                {r.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => approve(r)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => reject(r)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 disabled:opacity-50"
                    >
                      Tolak
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-gray-400">
          Password sementara disimpan di pengajuan sampai disetujui, lalu dihapus.
        </p>
      </div>
    </Layout>
  )
}
