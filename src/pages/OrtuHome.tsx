import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import type { LatihanAttempt } from '../types/question'
import OrtuLayout from '../components/OrtuLayout'

type ChildInfo = {
  id: string
  fullName: string
  className?: string
  nickname?: string
}

function toMillis(v: unknown): number | null {
  if (!v) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return isNaN(t) ? null : t
  }
  const any = v as { toDate?: () => Date; seconds?: number }
  if (any?.toDate) return any.toDate().getTime()
  if (any?.seconds) return any.seconds * 1000
  return null
}

function formatShort(ms: number) {
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s ? `${m} mnt ${s} dtk` : `${m} mnt`
  const h = Math.floor(m / 60)
  return `${h} jam ${m % 60} mnt`
}

export default function OrtuHome() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState<string>('')
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureParentSession()
      if (cancelled) return
      if (!s) {
        navigate('/login?tab=ortu', { replace: true })
        return
      }
      setSession(s)
      setShowGuide(!s.guideSeenAt)

      const kids: ChildInfo[] = []
      for (const id of s.studentIds || []) {
        try {
          const snap = await getDoc(doc(db, 'students', id))
          if (snap.exists()) {
            const d = snap.data()
            kids.push({
              id: snap.id,
              fullName: String(d.fullName || 'Siswa'),
              className: d.className ? String(d.className) : undefined,
              nickname: d.nickname ? String(d.nickname) : undefined,
            })
          } else {
            kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
          }
        } catch {
          kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
        }
      }
      if (!cancelled) {
        setChildren(kids)
        setSelectedChildId(kids[0]?.id || '')
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const selectedChild = children.find((c) => c.id === selectedChildId) || children[0]

  useEffect(() => {
    if (!selectedChild) return
    let cancelled = false
    ;(async () => {
      setLoadingAttempts(true)
      try {
        let list: LatihanAttempt[] = []
        try {
          const byId = await getDocs(
            query(collection(db, 'attempts'), where('studentId', '==', selectedChild.id))
          )
          list = byId.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
        } catch {
          /* index */
        }
        if (list.length === 0) {
          try {
            const all = await getDocs(collection(db, 'attempts'))
            const nameKey = selectedChild.fullName.trim().toLowerCase()
            list = all.docs
              .map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
              .filter((a) => {
                if (a.studentId && a.studentId === selectedChild.id) return true
                return (a.studentName || '').trim().toLowerCase() === nameKey
              })
          } catch (err) {
            console.warn(err)
          }
        }
        list.sort((a, b) => (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0))
        if (!cancelled) setAttempts(list)
      } finally {
        if (!cancelled) setLoadingAttempts(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedChild?.id, selectedChild?.fullName])

  const stats = useMemo(() => {
    const n = attempts.length
    const avg = n ? Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n) : null
    const last = attempts[0]
    return {
      count: n,
      avgPercent: avg,
      lastAt: last ? toMillis(last.finishedAt) : null,
      lastPercent: last?.percent ?? null,
    }
  }, [attempts])

  const dismissGuide = async () => {
    setShowGuide(false)
    if (!session?.parentId) return
    try {
      await updateDoc(doc(db, 'parents', session.parentId), {
        guideSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('guideSeenAt', err)
    }
  }

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const recent = attempts.slice(0, 5)

  return (
    <OrtuLayout parentName={session.fullName} title="Beranda" subtitle={session.fullName}>
      <div className="space-y-4">
        {showGuide && (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/90 p-4">
            <p className="text-sm font-semibold text-indigo-900">Selamat datang di Ruang Kuis</p>
            <ul className="mt-2 space-y-1.5 text-xs text-indigo-800/90 leading-relaxed">
              <li>• Pantau riwayat kuis dan latihan anak Anda (termasuk durasi).</li>
              <li>• Lihat ringkasan nilai dari kuis/latihan (bukan nilai proyek di sekolah).</li>
              <li>• Peringkat bersifat privasi: posisi anak + total peserta.</li>
              <li>• Fitur buat kuis latihan untuk anak menyusul.</li>
            </ul>
            <button
              type="button"
              onClick={dismissGuide}
              className="mt-3 text-xs font-medium text-indigo-700 hover:underline"
            >
              Mengerti, tutup panduan
            </button>
          </div>
        )}

        {children.length > 1 && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Anak
            </label>
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm"
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                  {c.className ? ` · ${c.className}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Anak</p>
          <h1 className="text-lg font-bold text-gray-900 mt-0.5">
            {selectedChild?.fullName || '—'}
            {selectedChild?.nickname ? (
              <span className="text-gray-400 font-normal text-sm"> ({selectedChild.nickname})</span>
            ) : null}
          </h1>
          {selectedChild?.className && (
            <p className="text-xs text-gray-500 mt-0.5">Kelas {selectedChild.className}</p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Pengerjaan</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">
                {loadingAttempts ? '…' : stats.count}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Rata skor</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">
                {loadingAttempts ? '…' : stats.avgPercent != null ? `${stats.avgPercent}%` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Terakhir</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">
                {loadingAttempts ? '…' : stats.lastPercent != null ? `${stats.lastPercent}%` : '—'}
              </p>
            </div>
          </div>
          {stats.lastAt && (
            <p className="text-[11px] text-gray-400 mt-2">
              Pengerjaan terakhir: {formatShort(stats.lastAt)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { to: '/ortu/riwayat', title: 'Riwayat', desc: 'Kuis & latihan + durasi', color: 'text-sky-700' },
            { to: '/ortu/nilai', title: 'Nilai', desc: 'Ringkasan per mapel', color: 'text-emerald-700' },
            { to: '/ortu/peringkat', title: 'Peringkat', desc: 'Posisi di kelas/paket', color: 'text-amber-800' },
            { to: '/ortu/buat-kuis', title: 'Buat kuis', desc: 'Latihan untuk anak', color: 'text-violet-700' },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-xl border border-gray-100 bg-white p-3.5 hover:border-gray-200 hover:shadow-sm transition"
            >
              <p className={`text-sm font-semibold ${item.color}`}>{item.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{item.desc}</p>
            </Link>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Pengerjaan terbaru</h2>
            <Link to="/ortu/riwayat" className="text-xs font-medium text-indigo-600 hover:underline">
              Semua
            </Link>
          </div>
          {loadingAttempts ? (
            <p className="p-6 text-center text-xs text-gray-400">Memuat…</p>
          ) : recent.length === 0 ? (
            <p className="p-6 text-center text-xs text-gray-400">Belum ada pengerjaan untuk anak ini.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recent.map((a) => {
                const fin = toMillis(a.finishedAt)
                const pct = a.percent ?? 0
                return (
                  <li key={a.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {a.latihanTitle || 'Latihan'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {fin ? formatShort(fin) : '—'}
                        {a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold tabular-nums shrink-0 ${
                        pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}
                    >
                      {pct}%
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 pt-1">
          Akun: {session.email}
          {session.whatsapp ? ` · WA ${session.whatsapp}` : ''}
        </p>
      </div>
    </OrtuLayout>
  )
}
