import { useEffect, useState, useMemo } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import Layout from '../components/Layout'
import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'
import {
  buildNilaiPerMapelCsv,
  buildRekapSiswaCsv,
  buildDetailAttemptCsv,
  buildNilaiPerMapelTable,
  buildRekapSiswaTable,
  buildDetailAttemptTable,
  downloadCsv,
  downloadPdfTable,
  stampFilename,
} from '../lib/exportGrades'
import LaporanNilaiTp, { SiswaTpBreakdown } from '../components/LaporanNilaiTp'

type TabKey = 'ringkasan' | 'siswa' | 'nilai-tp' | 'tp' | 'latihan'

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

const colors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
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

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s ? `${m} mnt ${s} dtk` : `${m} mnt`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} jam ${rm} mnt` : `${h} jam`
}

function formatShortDate(ms: number) {
  return new Date(ms).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function studentKey(a: { studentId?: string | null; studentName: string }) {
  const id = (a.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${a.studentName.trim().toLowerCase()}`
}

export default function Laporan() {
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('ringkasan')
  const [filterSubject, setFilterSubject] = useState<SubjectKey | ''>('')
  const [filterLatihan, setFilterLatihan] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterScore, setFilterScore] = useState<'all' | 'pass' | 'fail'>('all')
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      let aSnap, pSnap
      try {
        aSnap = await getDocs(query(collection(db, 'attempts'), orderBy('finishedAt', 'desc')))
      } catch {
        aSnap = await getDocs(collection(db, 'attempts'))
      }
      try {
        pSnap = await getDocs(query(collection(db, 'latihan'), orderBy('createdAt', 'desc')))
      } catch {
        pSnap = await getDocs(collection(db, 'latihan'))
      }
      setAttempts(aSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt)))
      setPakets(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanPaket)))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout title="Laporan" subtitle="Progress siswa dari hasil kuis">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 text-sm text-amber-900">
        Halaman Laporan sedang diselesaikan (panel ringkasan baru). Silakan muat ulang sebentar lagi,
        atau buka tab lain lewat menu setelah update berikutnya.
        {loading ? ' Memuat data…' : ` ${attempts.length} attempt · ${pakets.length} paket terdeteksi.`}
      </div>
    </Layout>
  )
}
