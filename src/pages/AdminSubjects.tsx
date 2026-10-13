import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import {
  subscribeSubjects,
  saveSubject,
  setSubjectActive,
  removeSubject,
  normalizeSubjectKey,
  COLOR_OPTIONS,
  type SubjectDoc,
} from '../lib/subjects'

const EMPTY: Omit<SubjectDoc, 'createdAt' | 'updatedAt'> = {
  key: '',
  name: '',
  shortName: '',
  color: 'indigo',
  icon: '📚',
  order: 99,
  active: true,
}

const colorPreview: Record<string, string> = {
  rose: 'bg-rose-100 text-rose-700',
  red: 'bg-red-100 text-red-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  purple: 'bg-purple-100 text-purple-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  teal: 'bg-teal-100 text-teal-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  green: 'bg-green-100 text-green-700',
  orange: 'bg-orange-100 text-orange-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  pink: 'bg-pink-100 text-pink-700',
  lime: 'bg-lime-100 text-lime-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
}

export default function AdminSubjects() {
  const [list, setList] = useState<SubjectDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<Omit<SubjectDoc, 'createdAt' | 'updatedAt'> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeSubjects(
      (rows) => {
        setList(rows)
        setLoading(false)
      },
      () => {
        setError('Gagal memuat daftar mata pelajaran.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const openNew = () => {
    const nextOrder = list.reduce((m, s) => Math.max(m, s.order || 0), 0) + 1
    setEditor({ ...EMPTY, order: nextOrder })
    setIsNew(true)
    setError('')
    setNotice('')
  }

  const openEdit = (s: SubjectDoc) => {
    setEditor({
      key: s.key,
      name: s.name,
      shortName: s.shortName,
      color: s.color,
      icon: s.icon,
      order: s.order,
      active: s.active !== false,
    })
    setIsNew(false)
    setError('')
    setNotice('')
  }

  const handleSave = async () => {
    if (!editor) return
    setSaving(true)
    setError('')
    try {
      let key = editor.key.trim()
      if (isNew) {
        key = normalizeSubjectKey(key || editor.name)
        if (!key) throw new Error('Isi nama atau kunci mapel.')
        if (list.some((s) => s.key === key)) {
          throw new Error(`Kunci "${key}" sudah dipakai. Pilih kunci lain.`)
        }
      }
      await saveSubject({ ...editor, key }, isNew)
      setNotice(isNew ? `Mapel "${editor.name}" ditambahkan.` : `Mapel "${editor.name}" disimpan.`)
      setEditor(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (s: SubjectDoc) => {
    setBusyKey(s.key)
    setError('')
    try {
      const next = s.active === false
      await setSubjectActive(s.key, next)
      setNotice(next ? `"${s.name}" diaktifkan.` : `"${s.name}" dinonaktifkan (tersembunyi dari daftar baru).`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah status.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleDelete = async (s: SubjectDoc) => {
    if (
      !confirm(
        `Hapus mata pelajaran "${s.name}"?\n\nSoal dan materi yang sudah memakai kunci "${s.key}" tidak dihapus otomatis — hanya daftar master mapel.`,
      )
    ) {
      return
    }
    setBusyKey(s.key)
    setError('')
    try {
      await removeSubject(s.key)
      setNotice(`Mapel "${s.name}" dihapus dari master.`)
      if (editor?.key === s.key) setEditor(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <Layout
      title="Mata Pelajaran"
      subtitle="Tambah, ubah, atau nonaktifkan mapel yang dipakai bank soal & laporan"
      actions={
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium"
        >
          + Mapel baru
        </button>
      }
    >
      <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-sm text-indigo-800">
        <p className="font-medium mb-1">Master mata pelajaran</p>
        <p className="text-indigo-700/80">
          Mapel aktif muncul di Bank Soal, filter laporan, dan latihan mandiri. Nonaktifkan jika tidak ingin
          dipakai lagi tanpa menghapus data soal lama. Kunci (<code className="text-xs bg-white/80 px-1 rounded">key</code>)
          tidak bisa diubah setelah disimpan — dipakai di Firestore sebagai <code className="text-xs bg-white/80 px-1 rounded">subjectKey</code>.
        </p>
      </div>

      {notice && (
        <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm px-4 py-3 flex justify-between gap-3">
          <span>{notice}</span>
          <button type="button" className="text-emerald-600 text-xs font-medium" onClick={() => setNotice('')}>
            Tutup
          </button>
        </div>
      )}
      {error && <div className="mb-3 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Daftar mapel</span>
            <span className="text-xs text-gray-500">{list.filter((s) => s.active !== false).length} aktif · {list.length} total</span>
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-500">Memuat...</div>
          ) : list.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              Belum ada mapel.{' '}
              <button type="button" onClick={openNew} className="text-indigo-600 font-medium hover:underline">
                Tambah pertama
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {list.map((s) => {
                const inactive = s.active === false
                const swatch = colorPreview[s.color] || colorPreview.indigo
                return (
                  <li
                    key={s.key}
                    className={`px-4 py-3 flex items-center gap-3 ${inactive ? 'opacity-60 bg-gray-50/50' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${swatch}`}>
                      {s.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {s.name}
                        {inactive && (
                          <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            nonaktif
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {s.shortName} · <code className="text-[11px]">{s.key}</code> · urutan {s.order}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyKey === s.key}
                        onClick={() => openEdit(s)}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === s.key}
                        onClick={() => toggleActive(s)}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        {inactive ? 'Aktifkan' : 'Nonaktif'}
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === s.key}
                        onClick={() => handleDelete(s)}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-red-100 text-red-600 hover:bg-red-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="lg:col-span-5">
          {editor ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 sticky top-20">
              <h2 className="text-sm font-semibold text-gray-900">{isNew ? 'Mapel baru' : 'Edit mapel'}</h2>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-600">Nama lengkap</span>
                <input
                  type="text"
                  value={editor.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            name,
                            key: isNew && !prev.key ? normalizeSubjectKey(name) : prev.key,
                            shortName:
                              isNew && !prev.shortName
                                ? name
                                    .split(/\s+/)
                                    .map((w) => w[0] || '')
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 6)
                                : prev.shortName,
                          }
                        : prev,
                    )
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  placeholder="Contoh: Pendidikan Jasmani"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-600">
                  Kunci (subjectKey){!isNew && ' — tidak bisa diubah'}
                </span>
                <input
                  type="text"
                  value={editor.key}
                  disabled={!isNew}
                  onChange={(e) =>
                    setEditor((prev) => (prev ? { ...prev, key: normalizeSubjectKey(e.target.value) } : prev))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 outline-none disabled:bg-gray-50 disabled:text-gray-500 font-mono"
                  placeholder="pendidikan-jasmani"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-gray-600">Singkatan</span>
                  <input
                    type="text"
                    value={editor.shortName}
                    maxLength={12}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, shortName: e.target.value } : prev))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 outline-none"
                    placeholder="PJOK"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-gray-600">Ikon (emoji)</span>
                  <input
                    type="text"
                    value={editor.icon}
                    maxLength={8}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, icon: e.target.value } : prev))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 outline-none"
                    placeholder="🏃"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-gray-600">Urutan</span>
                  <input
                    type="number"
                    min={1}
                    value={editor.order}
                    onChange={(e) =>
                      setEditor((prev) => (prev ? { ...prev, order: Number(e.target.value) || 1 } : prev))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-gray-600">Warna</span>
                  <select
                    value={editor.color}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, color: e.target.value } : prev))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 outline-none bg-white"
                  >
                    {COLOR_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editor.active !== false}
                  onChange={(e) => setEditor((prev) => (prev ? { ...prev, active: e.target.checked } : prev))}
                  className="accent-indigo-600"
                />
                Aktif (tampil di daftar mapel)
              </label>

              <div className="flex items-center gap-3 pt-1">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                    colorPreview[editor.color] || colorPreview.indigo
                  }`}
                >
                  {editor.icon || '📚'}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-gray-900">{editor.name || 'Pratinjau'}</p>
                  <p className="text-xs text-gray-400">{editor.shortName || '—'}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl"
                >
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              Pilih <strong>Edit</strong> pada mapel, atau{' '}
              <button type="button" onClick={openNew} className="text-indigo-600 font-medium hover:underline">
                tambah mapel baru
              </button>
              .
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
