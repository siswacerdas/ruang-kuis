import { useEffect, useMemo, useState } from 'react'
import {
  generateQuestionsWithOpenAI,
  isOpenAiConfigured,
  resolveStimulusPlan,
  type AiDraftQuestion,
  type StimulusMode,
  type KompleksitasLevel,
} from '../lib/openaiQuestions'
import {
  QUESTION_TYPE_LABELS,
  type QuestionType,
  type Subject,
  type Topic,
} from '../types/question'

type Props = {
  open: boolean
  onClose: () => void
  subject: Subject
  topic: Topic
  onAccept: (drafts: AiDraftQuestion[]) => Promise<void> | void
}

const STIMULUS_OPTIONS: { value: StimulusMode; label: string; hint: string }[] = [
  { value: 'none', label: 'Tanpa stimulus', hint: 'Soal mandiri' },
  { value: 'text', label: 'Stimulus teks', hint: 'Bacaan / data / situasi' },
  { value: 'image', label: 'Stimulus gambar', hint: 'Ilustrasi + keterangan (GPT Image)' },
]

const KOMP_OPTIONS: { value: KompleksitasLevel; label: string }[] = [
  { value: 'campuran', label: 'Campuran L1–L3' },
  { value: 'L1-Pemahaman', label: 'L1 Pemahaman' },
  { value: 'L2-Aplikasi', label: 'L2 Aplikasi' },
  { value: 'L3-Penalaran', label: 'L3 Penalaran' },
]

function emptyCounts(): Record<StimulusMode, number> {
  return { none: 0, text: 0, image: 0 }
}

export default function AiQuestionGenerator({ open, onClose, subject, topic, onAccept }: Props) {
  const [count, setCount] = useState(5)
  const [types, setTypes] = useState<QuestionType[]>(['single'])
  /** Multi-pilih: default hanya tanpa stimulus (sama seperti dulu) */
  const [stimulusModes, setStimulusModes] = useState<StimulusMode[]>(['none'])
  const [stimulusCounts, setStimulusCounts] = useState<Record<StimulusMode, number>>(emptyCounts())
  const [kompleksitas, setKompleksitas] = useState<KompleksitasLevel>('campuran')
  const [generateImages, setGenerateImages] = useState(true)
  const [extra, setExtra] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<AiDraftQuestion[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const configured = useMemo(() => isOpenAiConfigured(), [])

  // Saat jumlah / mode berubah: bagikan kuota merata
  useEffect(() => {
    if (!open) return
    const plan = resolveStimulusPlan(count, stimulusModes)
    setStimulusCounts(plan)
  }, [open, count, stimulusModes])

  if (!open) return null

  const toggleType = (t: QuestionType) => {
    setTypes((prev) => {
      if (prev.includes(t)) {
        const next = prev.filter((x) => x !== t)
        return next.length ? next : prev
      }
      return [...prev, t]
    })
  }

  const toggleStimulusMode = (m: StimulusMode) => {
    setStimulusModes((prev) => {
      if (prev.includes(m)) {
        const next = prev.filter((x) => x !== m)
        return next.length ? next : prev // minimal 1
      }
      return [...prev, m]
    })
  }

  const setCountForMode = (m: StimulusMode, v: number) => {
    setStimulusCounts((prev) => ({ ...prev, [m]: Math.max(0, v) }))
  }

  const redistribute = () => {
    setStimulusCounts(resolveStimulusPlan(count, stimulusModes))
  }

  const plannedTotal = stimulusModes.reduce((s, m) => s + (stimulusCounts[m] || 0), 0)
  const countsMismatch = plannedTotal !== count

  const run = async () => {
    setError('')
    setLoading(true)
    setDrafts([])
    setSelected(new Set())
    try {
      const counts = resolveStimulusPlan(count, stimulusModes, undefined, stimulusCounts)
      const { drafts: list, imageWarnings } = await generateQuestionsWithOpenAI({
        subjectName: subject.name,
        subjectKey: subject.key,
        topicName: topic.name || 'Materi',
        tpCodes: topic.tpCodes,
        count,
        types,
        stimulusModes,
        stimulusCounts: counts,
        kompleksitas,
        extraContext: extra,
        generateImages: stimulusModes.includes('image') && generateImages,
      })
      setDrafts(list)
      setSelected(new Set(list.map((_, i) => i)))
      if (imageWarnings.length > 0) {
        setError(
          'Soal berhasil dibuat, tetapi sebagian gambar gagal:\n' +
            imageWarnings.slice(0, 5).join('\n') +
            (imageWarnings.length > 5 ? `\n… (+${imageWarnings.length - 5})` : '') +
            '\n\nCek: API key punya akses Images, atau nonaktifkan generate gambar lalu unggah manual.'
        )
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal generate')
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const accept = async () => {
    const chosen = drafts.filter((_, i) => selected.has(i))
    if (!chosen.length) {
      setError('Pilih minimal satu soal.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onAccept(chosen)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan soal.')
    } finally {
      setSaving(false)
    }
  }

  const stimLabel = (d: AiDraftQuestion) => {
    if (d.stimulusImage || d.imagePrompt) return 'Gambar'
    if (d.stimulus) return 'Teks'
    return 'Tanpa'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Generate soal dengan AI</h2>
            <p className="text-xs text-gray-500">
              {subject.name} · {topic.name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm px-2">
            Tutup
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {!configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">API key belum dikonfigurasi</p>
              <p className="text-xs mt-1">
                Isi <code className="bg-amber-100 px-1 rounded">VITE_OPENAI_API_KEY</code> di{' '}
                <code className="bg-amber-100 px-1 rounded">.env</code> lalu restart.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Jumlah soal</span>
              <input
                type="number"
                min={1}
                max={15}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Kompleksitas</span>
              <select
                value={kompleksitas}
                onChange={(e) => setKompleksitas(e.target.value as KompleksitasLevel)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                {KOMP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-600 block mb-1.5">Tipe soal</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                    types.includes(t)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >
                  {QUESTION_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-medium text-gray-600">Stimulus / konteks</label>
              <button
                type="button"
                onClick={redistribute}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
              >
                Bagi merata
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              Boleh pilih lebih dari satu. Contoh: 4 tanpa stimulus + 3 teks + 3 gambar dalam 10 soal.
            </p>
            <div className="space-y-2">
              {STIMULUS_OPTIONS.map((o) => {
                const on = stimulusModes.includes(o.value)
                return (
                  <div
                    key={o.value}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                      on ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleStimulusMode(o.value)}
                      className="accent-indigo-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{o.label}</p>
                      <p className="text-[11px] text-gray-500">{o.hint}</p>
                    </div>
                    {on && (
                      <input
                        type="number"
                        min={0}
                        max={count}
                        value={stimulusCounts[o.value] ?? 0}
                        onChange={(e) => setCountForMode(o.value, Number(e.target.value) || 0)}
                        className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center tabular-nums bg-white"
                        title="Jumlah soal untuk jenis ini"
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <p
              className={`text-[11px] mt-1.5 tabular-nums ${
                countsMismatch ? 'text-amber-700' : 'text-gray-400'
              }`}
            >
              Total kuota: {plannedTotal} / {count}
              {countsMismatch
                ? ' — akan disesuaikan otomatis saat generate (Bagi merata atau edit angka).'
                : ''}
            </p>
            {stimulusModes.includes('image') && (
              <label className="inline-flex items-center gap-2 text-xs text-gray-600 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateImages}
                  onChange={(e) => setGenerateImages(e.target.checked)}
                  className="accent-indigo-600"
                />
                Generate gambar otomatis (GPT Image) — memakai kuota image API
              </label>
            )}
          </div>

          <label className="block">
            <span className="text-xs text-gray-500">Catatan tambahan (opsional)</span>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={2}
              placeholder="Contoh: fokus pada contoh di lingkungan sekolah"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </label>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 whitespace-pre-wrap">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={run}
            disabled={loading || !configured}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl"
          >
            {loading
              ? stimulusModes.includes('image') && generateImages
                ? 'Generate soal + gambar…'
                : 'Generate…'
              : 'Generate soal'}
          </button>

          {drafts.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">
                  {selected.size}/{drafts.length} soal dipilih
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      selected.size === drafts.length
                        ? new Set()
                        : new Set(drafts.map((_, i) => i))
                    )
                  }
                  className="text-[11px] text-indigo-600 font-medium"
                >
                  {selected.size === drafts.length ? 'Kosongkan' : 'Pilih semua'}
                </button>
              </div>
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {drafts.map((d, i) => (
                  <li
                    key={i}
                    className={`rounded-xl border px-3 py-2.5 text-sm ${
                      selected.has(i) ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleSelect(i)}
                        className="mt-1 accent-indigo-600"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
                            {QUESTION_TYPE_LABELS[d.type]}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
                            {stimLabel(d)}
                          </span>
                          {d.kompleksitas && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500">
                              {d.kompleksitas}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-800 line-clamp-2">{d.question}</p>
                        {d.stimulusImage && (
                          <img
                            src={d.stimulusImage}
                            alt=""
                            className="mt-1 max-h-24 rounded-lg border border-gray-100 object-contain bg-white"
                          />
                        )}
                        {!d.stimulusImage && d.imagePrompt && (
                          <p className="text-[11px] text-amber-700">
                            Gambar belum tersedia. Prompt: {d.imagePrompt.slice(0, 100)}
                            {d.imagePrompt.length > 100 ? '…' : ''}
                          </p>
                        )}
                        {d.stimulus && (
                          <p className="text-[11px] text-gray-500 line-clamp-2">{d.stimulus}</p>
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap justify-end gap-2 shrink-0 bg-slate-50/80">
          <button type="button" onClick={onClose} className="text-sm text-gray-600 px-4 py-2">
            Batal
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={saving || selected.size === 0}
            className="text-sm font-medium disabled:opacity-50 text-white px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? 'Menyimpan…' : `Simpan ${selected.size} soal`}
          </button>
        </div>
      </div>
    </div>
  )
}
