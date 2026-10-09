import { useEffect, useState } from 'react'
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  getSubject,
  LATIHAN_STATUS_LABELS,
  resolveLatihanStatus,
  formatDateTime,
  type LatihanPaket,
  type LatihanStatus,
} from '../types/question'

type TabKey = 'all' | LatihanStatus

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draf' },
  { key: 'scheduled', label: 'Terjadwal' },
  { key: 'active', label: 'Aktif' },
  { key: 'finished', label: 'Selesai' },
  { key: 'archived', label: 'Arsip' },
]

const statusStyle: Record<LatihanStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700',
  finished: 'bg-blue-50 text-blue-700',
  archived: 'bg-gray-100 text-gray-400',
}

export default function LatihanSoal() {
  const [list, setList] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('all')

  const load = async () => {
    setLoading(true)
    try {
      let snap
      try {
        snap = await getDocs(query(collection(db, 'latihan'), orderBy('createdAt', 'desc')))
      } catch {
        snap = await getDocs(collection(db, 'latihan'))
      }
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanPaket))
      setList(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = list.filter((p) => {
    const resolved = resolveLatihanStatus(p)
    if (tab === 'all') return resolved !== 'archived'
    if (tab === 'archived') return p.status === 'archived' || resolved === 'archived'
    // For time-based tabs, use resolved status but respect explicit archived/draft
    if (p.status === 'archived') return false
    if (tab === 'draft') return p.status === 'draft'
    return resolved === tab
  })

  const handleArchive = async (paket: LatihanPaket) => {
    if (!paket.id) return
    if (!confirm(`Arsipkan "${paket.title}"?`)) return
    try {
      await updateDoc(doc(db, 'latihan', paket.id), {
        status: 'archived',
        updatedAt: serverTimestamp(),
      })
      await load()
    } catch (err) {
      console.error(err)
      alert('Gagal mengarsipkan')
    }
  }

  const handleDelete = async (paket: LatihanPaket) => {
    if (!paket.id) return
    if (!confirm(`Hapus permanen "${paket.title}"? Tindakan ini tidak bisa dibatalkan.`)) return
    try {
      await deleteDoc(doc(db, 'latihan', paket.id))
      await load()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus')
    }
  }

  const copyToken = (token: string) => {
    navigator.clipboard?.writeText(token)
  }

  const actions = (
    <div className="flex items-center gap-2">
      <Link
        to="/latihan-soal/baru?mode=auto"
        className="inline-flex flex-1 md:flex-none justify-center items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-xl text-sm font-medium transition shadow-sm"
      >
        <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Generate Otomatis
      </Link>
      <Link
        to="/latihan-soal/baru?mode=manual"
        className="inline-flex flex-1 md:flex-none justify-center items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition shadow-sm shadow-indigo-200"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Buat Manual
      </Link>
    </div>
  )

  return (
    <Layout
      title="Latihan Soal"
      subtitle="Paket latihan yang disusun guru — manual atau generate dari bank soal"
      actions={actions}
    >
      {/* Tabs */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto pb-1 mb-5">
        {TABS.map((t) => {
          const count =
            t.key === 'all'
              ? list.filter((p) => resolveLatihanStatus(p) !== 'archived' && p.status !== 'archived').length
              : list.filter((p) => {
                  if (t.key === 'draft') return p.status === 'draft'
                  if (t.key === 'archived') return p.status === 'archived'
                  return resolveLatihanStatus(p) === t.key && p.status !== 'archived' && p.status !== 'draft'
                }).length
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-medium transition ${
                tab === t.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-100 hover:bg-gray-50'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-indigo-200' : 'text-gray-400'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Memuat paket latihan...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <p className="text-gray-700 font-medium">Belum ada paket latihan</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">
            Buat paket baru, pilih soal dari bank, atur jadwal dan token akses.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to="/latihan-soal/baru?mode=manual"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
            >
              + Buat Manual
            </Link>
            <Link
              to="/latihan-soal/baru?mode=auto"
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition"
            >
              Generate Otomatis
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((paket) => {
            const resolved = resolveLatihanStatus(paket)
            const subject = paket.subjectKey ? getSubject(paket.subjectKey) : null
            return (
              <div
                key={paket.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition"
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="font-semibold text-gray-900 text-base">{paket.title}</h3>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[resolved]}`}>
                        {LATIHAN_STATUS_LABELS[resolved]}
                      </span>
                      {subject && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {subject.shortName}
                        </span>
                      )}
                    </div>
                    {paket.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">{paket.description}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>
                          <span className="text-gray-400">Mulai </span>
                          {formatDateTime(paket.startAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          <span className="text-gray-400">Selesai </span>
                          {formatDateTime(paket.endAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>{paket.questionCount || paket.questionIds?.length || 0} soal</span>
                        {paket.timeLimitMinutes ? (
                          <span className="text-gray-400">· {paket.timeLimitMinutes} mnt</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span className="font-mono font-semibold tracking-wider text-gray-800">{paket.token}</span>
                        <button
                          type="button"
                          onClick={() => copyToken(paket.token)}
                          className="text-indigo-500 hover:text-indigo-700 text-[11px] font-medium"
                          title="Salin token"
                        >
                          Salin
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      to={`/latihan-soal/${paket.id}/hasil`}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition"
                    >
                      Hasil
                    </Link>
                    <Link
                      to={`/latihan-soal/${paket.id}`}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition"
                    >
                      Kelola
                    </Link>
                    {paket.status !== 'archived' && (
                      <button
                        onClick={() => handleArchive(paket)}
                        className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition"
                      >
                        Arsip
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(paket)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Hapus"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
