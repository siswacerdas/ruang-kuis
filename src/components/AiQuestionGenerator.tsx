import { useMemo, useState } from 'react'
import {
  generateQuestionsWithOpenAI,
  isOpenAiConfigured,
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

export default function AiQuestionGenerator({ open, onClose, subject, topic, onAccept }: Props) {
  const [count, setCount] = useState(5)
  const [types, setTypes] = useState<QuestionType[]>(['single'])
  const [stimulusMode, setStimulusMode] = useState<StimulusMode>('none')
  const [kompleksitas, setKompleksitas] = useState<KompleksitasLevel>('campuran')
  const [generateImages, setGenerateImages] = useState(true)
  const [extra, setExtra] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<AiDraftQuestion[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const configured = useMemo(() => isOpenAiConfigured(), [])

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

  const run = async () => {
    setError('')
    setLoading(true)
    setDrafts([])
    setSelected(new Set())
    try {
      const { drafts: list, imageWarnings } = await generateQuestionsWithOpenAI({
        subjectName: subject.name,
        subjectKey: subject.key,
        topicName: topic.name || 'Materi',
        tpCodes: topic.tpCodes,
        count,
        types,
        stimulusMode,
        kompleksitas,
        generateImages: stimulusMode === 'image' && generateImages,
        extraContext: extra,
      })
      setDrafts(list)
      setSelected(new Set(list.map((_, i) => i)))
      if (imageWarnings.length > 0) {
        setError(
          'Soal berhasil dibuat, tetapi sebagian/semua gambar gagal:\n' +
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

  const toggleSel = (i: number) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  }

  const accept = async () => {
    const picked = drafts.filter((_, i) => selected.has(i))
    if (!picked.length) {
      setError('Pilih minimal satu soal.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onAccept(picked)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Generate soal AI</h2>
            <p className="text-xs text-gray-500">
              {subject.shortName} · {topic.name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm px-2">
            Tutup
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {!configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
              <p className="font-medium">API key belum dikonfigurasi</p>
              <p className="text-xs">
                Isi <code className="bg-amber-100 px-1 rounded">VITE_OPENAI_API_KEY</code> di file{' '}
                <code className="bg-amber-100 px-1 rounded">.env</code> lalu restart dev/build.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jumlah (max 15)</label>
              <input
                type="number"
                min={1}
                max={15}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(15, parseInt(e.target.value, 10) || 1)))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipe soal</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`text-[11px] px-2 py-1 rounded-full border font-medium ${
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
          </div>

          {/* Stimulus */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Stimulus / konteks</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STIMULUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStimulusMode(o.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border text-sm transition ${
                    stimulusMode === o.value
                      ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-medium text-gray-900 block">{o.label}</span>
                  <span className="text-[11px] text-gray-500">{o.hint}</span>
                </button>
              ))}
            </div>
            {stimulusMode === 'image' && (
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateImages}
                  onChange={(e) => setGenerateImages(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600"
                />
                Generate gambar otomatis (GPT Image) — memakai kuota image API
              </label>
            )}
          </div>

          {/* Kompleksitas */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Kompleksitas</label>
            <div className="flex flex-wrap gap-1.5">
              {KOMP_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setKompleksitas(o.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
                    kompleksitas === o.value
                      ? 'bg-slate-800 border-slate-800 text-white'
                      : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {topic.tpCodes && topic.tpCodes.length > 0 && (
            <p className="text-xs text-gray-500">
              TP materi: <span className="font-medium text-gray-700">{topic.tpCodes.join(', ')}</span>
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Konteks tambahan (opsional)</label>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={2}
              placeholder="Contoh: gunakan cerita pasar, hindari bilangan > 100"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
          )}

          <button
            type="button"
            onClick={run}
            disabled={loading || !configured}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl"
          >
            {loading
              ? stimulusMode === 'image' && generateImages
                ? 'Menghasilkan soal + gambar…'
                : 'Menghasilkan…'
              : 'Generate dengan OpenAI'}
          </button>

          {drafts.length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">{drafts.length} draft — centang yang disimpan</p>
                <button
                  type="button"
                  className="text-xs text-indigo-600"
                  onClick={() =>
                    setSelected(
                      selected.size === drafts.length ? new Set() : new Set(drafts.map((_, i) => i))
                    )
                  }
                >
                  {selected.size === drafts.length ? 'Kosongkan' : 'Pilih semua'}
                </button>
              </div>
              {drafts.map((d, i) => (
                <label
                  key={i}
                  className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${
                    selected.has(i) ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleSel(i)}
                    className="mt-1 rounded border-gray-300 text-indigo-600"
                  />
                  <div className="min-w-0 text-sm flex-1">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">
                        {QUESTION_TYPE_LABELS[d.type]}
                      </span>
                      {d.kompleksitas && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {d.kompleksitas}
                        </span>
                      )}
                      {d.stimulus && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800">
                          Stimulus
                        </span>
                      )}
                    </div>
                    {d.stimulusImage ? (
                      <img
                        src={d.stimulusImage}
                        alt=""
                        className="mb-2 max-h-28 rounded-lg border border-gray-100 object-contain bg-gray-50"
                      />
                    ) : d.imagePrompt ? (
                      <p className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                        Gambar belum tersedia. Prompt: {d.imagePrompt.slice(0, 120)}
                        {d.imagePrompt.length > 120 ? '…' : ''}
                      </p>
                    ) : null}
                    {d.stimulus && (
                      <div className="mb-2 text-xs text-gray-600 bg-amber-50/80 border border-amber-100 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                        {d.stimulus}
                      </div>
                    )}
                    <p className="text-gray-900 font-medium">{d.question}</p>
                    <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
                      {d.options.map((o, oi) => (
                        <li
                          key={oi}
                          className={d.correctAnswers.includes(oi) ? 'text-emerald-700 font-medium' : ''}
                        >
                          {String.fromCharCode(65 + oi)}. {o}
                          {d.type !== 'category' && d.correctAnswers.includes(oi) ? ' ✓' : ''}
                          {d.type === 'category'
                            ? ` → ${(d.categoryLabels || ['Benar', 'Salah'])[d.correctAnswers[oi] ?? 0]}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                    {d.explanation && (
                      <p className="text-[11px] text-gray-400 mt-1">Pembahasan: {d.explanation}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {drafts.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
            <button type="button" onClick={onClose} className="text-sm text-gray-600 px-4 py-2">
              Batal
            </button>
            <button
              type="button"
              onClick={accept}
              disabled={saving || selected.size === 0}
              className="text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl"
            >
              {saving ? 'Menyimpan…' : `Simpan ${selected.size} soal ke bank`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
