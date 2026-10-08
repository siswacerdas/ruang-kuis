import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { httpsCallable, getFunctions } from 'firebase/functions'
import { db, app } from '../lib/firebase'
import Layout from '../components/Layout'
import type { Parent, ParentPasswordReset } from '../types/parent'

type TabKey = 'akun' | 'reset'

function genTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * Admin: kelola akun orang tua (aktif/nonaktif) + proses reset password.
 */
export default function AdminParents() {
  const [tab, setTab] = useState<TabKey>('akun')
  const [parents, setParents] = useState<Parent[]>([])
  const [resets, setResets] = useState<ParentPasswordReset[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lastTempPw, setLastTempPw] = useState<{ email: string; pw: string } | null>(null)

  const loadParents = async () => {
    try {
      let snap
      try {
        snap = await getDocs(query(collection(db, 'parents'), orderBy('fullName', 'asc')))
      } catch {
        snap = await getDocs(collection(db, 'parents'))
      }
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parent))
      list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'id'))
      setParents(list)
    } catch (err) {
      console.error(err)
      setError('Gagal memuat daftar orang tua')
    }
  }

  const loadResets = async () => {
    try {
      let snap
      try {
        snap = await getDocs(
          query(collection(db, 'parentPasswordResets'), orderBy('createdAt', 'desc'))
        )
      } catch {
        snap = await getDocs(collection(db, 'parentPasswordResets'))
      }
      setResets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ParentPasswordReset)))
    } catch (err) {
      console.error(err)
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    await Promise.all([loadParents(), loadResets()])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const pendingResets = resets.filter((r) => r.status === 'pending')

  const toggleActive = async (p: Parent) => {
    if (!p.id) return
    const next = p.active === false
    const label = next ? 'aktifkan kembali' : 'nonaktifkan'
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} akun ${p.fullName}?`)) return
    setBusyId(p.id)
    setError('')
    setMessage('')
    try {
      await updateDoc(doc(db, 'parents', p.id), {
        active: next,
        updatedAt: serverTimestamp(),
      })
      setMessage(
        next
          ? `${p.fullName} diaktifkan kembali. Ortu bisa login.`
          : `${p.fullName} dinonaktifkan. Login ortu ditolak sampai diaktifkan lagi.`
      )
      await loadParents()
    } catch (err) {
      console.error(err)
      setError('Gagal mengubah status akun')
    } finally {
      setBusyId(null)
    }
  }

  const approveReset = async (r: ParentPasswordReset) => {
    if (!r.id || !r.email) return
    const tempPw = genTempPassword()
    if (
      !confirm(
        `Reset password untuk ${r.email}?\nPassword sementara akan dibuat. Sampaikan ke ortu via WA.`
      )
    )
      return

    setBusyId(r.id)
    setError('')
    setMessage('')
    setLastTempPw(null)
    try {
      const functions = getFunctions(app, 'asia-southeast2')
      const fn = httpsCallable<{ email: string; newPassword: string }, { ok: boolean }>(
        functions,
        'resetParentPassword'
      )
      await fn({ email: r.email.toLowerCase(), newPassword: tempPw })

      // Tandai mustChangePassword di parents
      const parentSnap = await getDocs(
        query(collection(db, 'parents'), where('email', '==', r.email.toLowerCase()))
      )
      for (const d of parentSnap.docs) {
        await updateDoc(d.ref, {
          mustChangePassword: true,
          updatedAt: serverTimestamp(),
        })
      }

      await updateDoc(doc(db, 'parentPasswordResets', r.id), {
        status: 'done',
        reviewedAt: serverTimestamp(),
      })

      setLastTempPw({ email: r.email, pw: tempPw })
      setMessage(`Password direset untuk ${r.email}. Salin password sementara di bawah.`)
      await loadResets()
    } catch (err: unknown) {
      console.error(err)
      const anyErr = err as { message?: string; code?: string }
      // Fallback tanpa Cloud Function: admin set manual via Console
      setError(
        `Gagal reset otomatis (${String(anyErr?.message || err).slice(0, 120)}). ` +
          'Pastikan Cloud Function resetParentPassword sudah di-deploy, atau set password manual di Firebase Console → Authentication.'
      )
    } finally {
      setBusyId(null)
    }
  }

  const rejectReset = async (r: ParentPasswordReset) => {
    if (!r.id) return
    setBusyId(r.id)
    try {
      await updateDoc(doc(db, 'parentPasswordResets', r.id), {
        status: 'rejected',
        reviewedAt: serverTimestamp(),
      })
      setMessage(`Permintaan reset ditolak: ${r.email}`)
      await loadResets()
    } catch (err) {
      console.error(err)
      setError('Gagal menolak permintaan')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Layout
      title="Akun orang tua"
      subtitle="Nonaktifkan akun · proses reset password"
      actions={
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {(
            [
              { key: 'akun' as const, label: 'Daftar akun' },
              {
                key: 'reset' as const,
                label: `Reset password${pendingResets.length ? ` (${pendingResets.length})` : ''}`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                tab === t.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {t.label}
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

        {lastTempPw && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
            <p className="font-semibold text-indigo-900">Password sementara (salin sekarang)</p>
            <p className="mt-1 text-indigo-800">
              Email: <code className="bg-white/80 px-1 rounded">{lastTempPw.email}</code>
            </p>
            <p className="mt-1 text-indigo-800">
              Password:{' '}
              <code className="bg-white px-2 py-0.5 rounded font-mono text-base tracking-wide">
                {lastTempPw.pw}
              </code>
            </p>
            <p className="text-[11px] text-indigo-600 mt-2">
              Kirim ke ortu via WhatsApp. Setelah login, mereka sebaiknya ganti password sendiri.
            </p>
            <button
              type="button"
              className="mt-2 text-xs text-indigo-700 hover:underline"
              onClick={() => {
                navigator.clipboard?.writeText(
                  `Login Ruang Kuis (ortu)\nEmail: ${lastTempPw.email}\nPassword sementara: ${lastTempPw.pw}\nSilakan ganti setelah masuk.`
                )
              }}
            >
              Salin pesan WA
            </button>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 text-center">
            <p className="text-sm text-gray-400">Memuat…</p>
          </div>
        ) : tab === 'akun' ? (
          parents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-14 text-center">
              <p className="text-sm font-medium text-gray-700">Belum ada akun orang tua</p>
              <p className="text-xs text-gray-400 mt-1.5">
                Akun muncul setelah pengajuan disetujui di Pengajuan Ortu.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {parents.map((p) => {
                const inactive = p.active === false
                return (
                  <li
                    key={p.id}
                    className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 ${
                      inactive ? 'border-gray-200 opacity-80' : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.fullName}</p>
                        <p className="text-xs text-gray-500 mt-1 break-all">
                          {p.email}
                          {p.whatsapp ? ` · WA ${p.whatsapp}` : ''}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {(p.studentIds || []).length} anak terhubung
                          {p.mustChangePassword ? ' · wajib ganti password' : ''}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
                          inactive
                            ? 'bg-gray-100 text-gray-600 border-gray-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {inactive ? 'Nonaktif' : 'Aktif'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => toggleActive(p)}
                        className={`inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                          inactive
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {busyId === p.id
                          ? '…'
                          : inactive
                            ? 'Aktifkan kembali'
                            : 'Nonaktifkan'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : pendingResets.length === 0 && resets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-14 text-center">
            <p className="text-sm font-medium text-gray-700">Tidak ada permintaan reset</p>
            <p className="text-xs text-gray-400 mt-1.5">
              Ortu mengajukan lewat link &quot;Lupa password&quot; di halaman login.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {(pendingResets.length ? pendingResets : resets).map((r) => (
              <li
                key={r.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 break-all">{r.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {r.whatsapp ? `WA ${r.whatsapp}` : '—'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
                      r.status === 'pending'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : r.status === 'done'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {r.status === 'pending'
                      ? 'Menunggu'
                      : r.status === 'done'
                        ? 'Selesai'
                        : 'Ditolak'}
                  </span>
                </div>
                {r.status === 'pending' && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => approveReset(r)}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition"
                    >
                      {busyId === r.id ? 'Memproses…' : 'Reset & buat password sementara'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => rejectReset(r)}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-sm font-medium text-gray-700 transition"
                    >
                      Tolak
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed px-1">
          Nonaktifkan akun ortu jika tidak lagi relevan (mis. pindah sekolah). Reset password
          memakai Cloud Function Admin SDK — deploy <code>resetParentPassword</code> jika belum.
        </p>
      </div>
    </Layout>
  )
}
