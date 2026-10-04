import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import Layout from '../components/Layout'
import { db } from '../lib/firebase'
import { SUBJECTS, getSubject } from '../types/question'
import type { BookMaterial, LearningObjective, TpSeedFile } from '../types/tp'

type Tab = 'tp' | 'materi'

export default function TujuanPembelajaran() {
  const [tab, setTab] = useState<Tab>('tp')
  const [items, setItems] = useState<LearningObjective[]>([])
  const [materials, setMaterials] = useState<BookMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [subjectFilter, setSubjectFilter] = useState<string>('semua')
  const [queryText, setQueryText] = useState('')
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tpSnap, matSnap] = await Promise.all([
        getDocs(query(collection(db, 'learningObjectives'))),
        getDocs(query(collection(db, 'bookMaterials'))),
      ])
      const tp = tpSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<LearningObjective, 'id'>) }))
        .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.order - b.order)
      const mats = matSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<BookMaterial, 'id'>) }))
        .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.title.localeCompare(b.title, 'id'))
      setItems(tp)
      setMaterials(mats)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data TP.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase()
    return items.filter((t) => {
      if (subjectFilter !== 'semua' && t.subjectKey !== subjectFilter) return false
      if (!q) return true
      return (
        t.code.toLowerCase().includes(q) ||
        t.statement.toLowerCase().includes(q) ||
        (t.element || '').toLowerCase().includes(q)
      )
    })
  }, [items, subjectFilter, queryText])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((t) => map.set(t.subjectKey, (map.get(t.subjectKey) || 0) + 1))
    return map
  }, [items])

  const saveTp = async (item: LearningObjective) => {
    if (!item.id) return
    setSavingCode(item.code)
    setError('')
    try {
      const batch = writeBatch(db)
      batch.set(
        doc(db, 'learningObjectives', item.id),
        {
          code: item.code,
          subjectKey: item.subjectKey,
          element: item.element,
          order: Number(item.order) || 0,
          statement: item.statement.trim(),
          jp: item.jp ?? null,
          weight: Number(item.weight) || 1,
          active: !!item.active,
          className: item.className || '5A',
          phase: item.phase || 'C',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      await batch.commit()
      setNotice(`TP ${item.code} disimpan.`)
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan.')
    } finally {
      setSavingCode(null)
    }
  }

  const importJson = async (file: File) => {
    setImporting(true)
    setError('')
    setNotice('')
    try {
      const text = await file.text()
      const data = JSON.parse(text) as TpSeedFile
      if (!Array.isArray(data.tp) || data.tp.length === 0) {
        throw new Error('File tidak berisi array tp.')
      }
      let tpCount = 0
      let matCount = 0
      const chunks: typeof data.tp[] = []
      for (let i = 0; i < data.tp.length; i += 400) chunks.push(data.tp.slice(i, i + 400))
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        chunk.forEach((raw) => {
          const code = String(raw.code || '').trim()
          if (!code || !raw.statement || !raw.subjectKey) return
          batch.set(
            doc(db, 'learningObjectives', code),
            {
              code,
              subjectKey: raw.subjectKey,
              element: raw.element || '',
              order: Number(raw.order) || 0,
              statement: String(raw.statement).trim(),
              jp: raw.jp ?? null,
              weight: Number(raw.weight) || 1,
              active: raw.active !== false,
              className: raw.className || data.className || '5A',
              phase: raw.phase || data.phase || 'C',
              source: raw.source || data.version || 'import',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
          tpCount += 1
        })
        await batch.commit()
      }
      const mats = data.materiBuku || []
      for (let i = 0; i < mats.length; i += 400) {
        const batch = writeBatch(db)
        mats.slice(i, i + 400).forEach((m) => {
          const id = `${m.subjectKey}__${slug(m.title)}`
          batch.set(
            doc(db, 'bookMaterials', id),
            {
              subjectKey: m.subjectKey,
              title: m.title,
              summary: m.summary || '',
              suggestedTpCodes: m.suggestedTpCodes || [],
              linkNote: m.linkNote || '',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
          matCount += 1
        })
        await batch.commit()
      }
      setNotice(`Impor selesai: ${tpCount} TP dan ${matCount} materi buku. Kode yang sama ditimpa, tidak diduplikasi.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal membaca JSON.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Layout
      title="Tujuan Pembelajaran"
      subtitle="Master TP Kelas 5. Kode tetap; rumusan boleh diubah."
      actions={
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {importing ? 'Mengimpor...' : 'Impor JSON'}
        </button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) importJson(file)
        }}
      />

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm px-4 py-3">{notice}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {SUBJECTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSubjectFilter(subjectFilter === s.key ? 'semua' : s.key)}
            className={`rounded-2xl border px-3 py-3 text-left ${
              subjectFilter === s.key ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white'
            }`}
          >
            <p className="text-xs text-gray-500">{s.shortName}</p>
            <p className="text-lg font-semibold text-gray-900">{counts.get(s.key) || 0}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('tp')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'tp' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          Daftar TP ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('materi')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'materi' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          Materi buku ({materials.length})
        </button>
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Cari kode atau rumusan"
          className="ml-auto w-full sm:w-64 rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Memuat...</p>
      ) : tab === 'tp' ? (
        filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            Belum ada TP. Impor file tp-kelas5-seed.json.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <article key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">{item.code}</span>
                  <span className="text-xs text-gray-500">{getSubject(item.subjectKey)?.name}</span>
                  <span className="text-xs text-gray-400">{item.element}</span>
                  <label className="ml-auto flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={item.active}
                      onChange={(e) =>
                        setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, active: e.target.checked } : p)))
                      }
                    />
                    Aktif
                  </label>
                </div>
                <textarea
                  value={item.statement}
                  onChange={(e) =>
                    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, statement: e.target.value } : p)))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-xs text-gray-500">
                    Bobot
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={item.weight}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p) => (p.id === item.id ? { ...p, weight: Number(e.target.value) } : p))
                        )
                      }
                      className="mt-1 block w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    JP
                    <input
                      type="number"
                      min={0}
                      value={item.jp ?? ''}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p) => (p.id === item.id ? { ...p, jp: Number(e.target.value) } : p))
                        )
                      }
                      className="mt-1 block w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => saveTp(item)}
                    disabled={savingCode === item.code}
                    className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm disabled:opacity-60"
                  >
                    {savingCode === item.code ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {materials.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              Belum ada materi buku. Ikut terimpor dari seed JSON.
            </div>
          ) : (
            materials
              .filter((m) => subjectFilter === 'semua' || m.subjectKey === subjectFilter)
              .filter((m) => {
                const q = queryText.trim().toLowerCase()
                if (!q) return true
                return m.title.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q)
              })
              .map((m) => (
                <article key={m.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500">{getSubject(m.subjectKey)?.name}</p>
                  <h3 className="font-semibold text-gray-900">{m.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{m.summary}</p>
                  <p className="text-xs text-indigo-700 mt-2">TP terkait: {(m.suggestedTpCodes || []).join(', ') || '—'}</p>
                </article>
              ))
          )}
        </div>
      )}
    </Layout>
  )
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}
