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
      let snap
      try {
        snap = await getDocs(
          query(collection(db, 'parentRequests'), orderBy('createdAt', 'desc'))
        )
      } catch {
        snap = await getDocs(collection(db, 'parentRequests'))
      }
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ParentRequest))
      setRequests(list)
    } catch (err) {
      console.error(err)
      setError('Gagal memuat pengajuan. Pastikan rules Firestore mengizinkan admin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const visible =
    filter === 'pending' ? requests.filter((r) => r.status === 'pending') : requests

  const approve = async (r: ParentRequest) => {
    if (!r.id) return
    if (!r.tempPassword || r.tempPassword.length < 6) {
      setError('Pengajuan ini tidak punya password sementara. Minta ortu ajukan ulang.')
      return
    }
    if (
      !confirm(
        `Setujui akun untuk ${r.fullName}?\nEmail: ${r.email}\nAnak: ${r.studentNames?.join(', ')}`
      )
    ) {
      return
    }
    setBusyId(r.id)
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

      await updateDoc(doc(db, 'parentRequests', r.id), {
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
    if (!r.id) return
    const note = prompt('Alasan penolakan (opsional):') || ''
    setBusyId(r.id)
    setError('')
    try {
      await updateDoc(doc(db, 'parentRequests', r.id), {
        status: 'rejected',
        tempPassword: null,
        note: note.slice(0, 300),
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
      title="Pengajuan Orang Tua"
      subtitle={`${requests.filter((r) => r.status === 'pending').length} menunggu · ${requests.length} total`}
      actions={
        <button
          type="button"
          onClick={() => load()}
          className="text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
        >
          Muat ulang
        </button>
      }
    >
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`text-sm px-3 py-1.5 rounded-full border ${
            filter === 'pending'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          Menunggu
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`text-sm px-3 py-1.5 rounded-full border ${
            filter === 'all'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          Semua
        </button>
      </div>

      {(message || error) && (
        <div
          className={`mb-4 text-sm px-4 py-3 rounded-xl ${
            error
              ? 'bg-red-50 text-red-600 border border-red-100'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
          }`}
        >
          {error || message}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Memuat...</p>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
          {filter === 'pending' ? 'Tidak ada pengajuan menunggu.' : 'Belum ada pengajuan.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li
              key={r.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{r.fullName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.email} · WA {r.whatsapp}
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  Anak: <strong>{(r.studentNames || []).join(', ') || '—'}</strong>
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Status:{' '}
                  <span
                    className={
                      r.status === 'pending'
                        ? 'text-amber-700'
                        : r.status === 'approved'
                          ? 'text-emerald-700'
                          : 'text-red-600'
                    }
                  >
                    {r.status}
                  </span>
                  {r.note ? ` · ${r.note}` : ''}
                </p>
              </div>
              {r.status === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => approve(r)}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                  >
                    {busyId === r.id ? '...' : 'Setujui'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => reject(r)}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Tolak
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
        <p className="font-medium mb-1">Catatan keamanan</p>
        <p>
          Password sementara disimpan di pengajuan sampai disetujui, lalu dihapus. Jangan export
          koleksi <code className="bg-white/80 px-1 rounded">parentRequests</code> ke tempat publik.
        </p>
      </div>
    </Layout>
  )
}
