import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import StudentNav from '../components/StudentNav'
import Layout from '../components/Layout'
import { getSubject, type SubjectKey } from '../types/question'
import {
  fetchLessonMaterials,
  seedLessonMaterialsFromStatic,
  type LessonPdf,
} from '../lib/lessonMaterials'
import MateriBody from './MateriBody'

export default function Materi({ audience = 'student' }: { audience?: 'admin' | 'student' }) {
  const [params, setParams] = useSearchParams()
  const selectedKey = params.get('mapel') || ''
  const [materials, setMaterials] = useState<LessonPdf[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await fetchLessonMaterials(audience)
      setMaterials(list)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat materi.')
      setMaterials([])
    } finally {
      setLoading(false)
    }
  }, [audience])

  useEffect(() => {
    load()
  }, [load])

  const onSelect = (key: string) => {
    if (!key) setParams({})
    else setParams({ mapel: key })
  }

  const onSeed = async () => {
    setSeeding(true)
    setError('')
    setNotice('')
    try {
      const n = await seedLessonMaterialsFromStatic()
      setNotice(`${n} materi seed berhasil disalin ke Firestore. Sekarang bisa diedit/dihapus.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal migrasi. Deploy firestore.rules dulu jika belum.')
    } finally {
      setSeeding(false)
    }
  }

  if (audience === 'admin') {
    const subject = selectedKey ? getSubject(selectedKey as SubjectKey) : undefined
    return (
      <Layout title="Materi" subtitle={subject ? subject.name : 'Materi belajar & PDF per mata pelajaran'}>
        <MateriBody
          selectedKey={selectedKey}
          onSelect={onSelect}
          audience="admin"
          materials={materials}
          loading={loading}
          notice={notice}
          error={error}
          onRefresh={load}
          onSeed={onSeed}
          seeding={seeding}
        />
      </Layout>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 tracking-tight">Materi pelajaran</p>
            <p className="text-[11px] text-slate-500">Pustaka Belajar</p>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
        <MateriBody
          selectedKey={selectedKey}
          onSelect={onSelect}
          audience="student"
          materials={materials}
          loading={loading}
          notice=""
          error={error}
          onRefresh={load}
          onSeed={() => {}}
          seeding={false}
        />
      </main>
      <StudentNav />
    </div>
  )
}
