import { useState } from 'react'
import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  DEFAULT_CATEGORY_LABELS,
  QUESTION_TYPE_LABELS,
  type Question,
  type QuestionType,
} from '../types/question'

export interface QuestionQuickEditProps {
  question: Question
  onClose: () => void
  onSaved: (updated: Question) => void
}

export default function QuestionQuickEdit({ question, onClose, onSaved }: QuestionQuickEditProps) {
  const [type, setType] = useState<QuestionType>(question.type || 'single')
  const [text, setText] = useState(question.question || '')
  const [options, setOptions] = useState<string[]>(
    question.options?.length ? [...question.options] : ['', '', '', '']
  )
  const [correctAnswers, setCorrectAnswers] = useState<number[]>([...(question.correctAnswers || [])])
  const [categoryLabels, setCategoryLabels] = useState<string[]>(
    question.categoryLabels?.length ? [...question.categoryLabels] : [...DEFAULT_CATEGORY_LABELS]
  )
  const [explanation, setExplanation] = useState(question.explanation || '')
  const [stimulus, setStimulus] = useState(question.stimulus || '')
  const [skor, setSkor] = useState(question.skor != null ? Number(question.skor) : 1)
  const [tpCodes, setTpCodes] = useState(
    (question.tpCodes || (question.tp ? [question.tp] : [])).join(', ')
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setError('')
    if (!text.trim()) {
      setError('Teks pertanyaan wajib diisi')
      return
    }
    const opts = options.map((o) => o.trim()).filter(Boolean)
    if (type !== 'category' && opts.length < 2) {
      setError('Minimal 2 pilihan jawaban')
      return
    }
    if (type === 'category' && opts.length < 1) {
      setError('Minimal 1 pernyataan')
      return
    }
    let correct = [...correctAnswers]
    if (type === 'single') {
      if (correct.length === 0) {
        setError('Pilih satu jawaban benar')
        return
      }
      correct = [correct[0]]
    }
    if (type === 'multiple' && correct.length === 0) {
      setError('Centang minimal satu jawaban benar')
      return
    }
    if (type === 'category') {
      while (correct.length < opts.length) correct.push(0)
      correct = correct.slice(0, opts.length)
    }
    const tps = tpCodes
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean)

    if (!question.id) {
      setError('ID soal tidak valid')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        type,
        question: text.trim(),
        options: opts,
        correctAnswers: correct,
        skor: Number(skor) || 1,
      }
      if (type === 'category') {
        payload.categoryLabels = categoryLabels.length ? categoryLabels : [...DEFAULT_CATEGORY_LABELS]
      }
      if (explanation.trim()) payload.explanation = explanation.trim()
      else payload.explanation = deleteField()
      if (stimulus.trim()) payload.stimulus = stimulus.trim()
      else payload.stimulus = deleteField()
      if (tps.length) {
        payload.tpCodes = tps
        payload.tp = tps[0]
      } else {
        payload.tpCodes = deleteField()
        payload.tp = deleteField()
      }
      await updateDoc(doc(db, 'questions', question.id), payload)
      onSaved({
        ...question,
        type,
        question: text.trim(),
        options: opts,
        correctAnswers: correct,
        categoryLabels: type === 'category' ? categoryLabels : question.categoryLabels,
        explanation: explanation.trim() || undefined,
        stimulus: stimulus.trim() || undefined,
        skor: Number(skor) || 1,
        tpCodes: tps.length ? tps : undefined,
        tp: tps[0],
      })
    } catch (err) {
      console.error(err)
      setError('Gagal menyimpan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3.5 flex items-center justify-between z-10">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Edit soal paket</h3>
            <p className="text-[11px] text-gray-400">
              Perubahan tersimpan ke bank soal (berlaku di semua paket yang memakai soal ini)
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm px-2 py-1">
            Tutup
          </button>
        </div>

        <form className="p-5 space-y-4" onSubmit={save}>
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2 rounded-xl">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipe soal</label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as QuestionType)
                  setCorrectAnswers([])
                }}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50"
              >
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((ty) => (
                  <option key={ty} value={ty}>
                    {QUESTION_TYPE_LABELS[ty]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Skor</label>
              <input
                type="number"
                min={1}
                value={skor}
                onChange={(e) => setSkor(Number(e.target.value) || 1)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pertanyaan</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stimulus / bacaan (opsional)</label>
            <textarea
              value={stimulus}
              onChange={(e) => setStimulus(e.target.value)}
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:bg-white outline-none"
              placeholder="Teks konteks jika ada"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {type === 'category' ? 'Pernyataan' : 'Pilihan jawaban'}
            </label>
            <div className="space-y-2">
              {options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  {type === 'single' && (
                    <input
                      type="radio"
                      name="pkg-edit-correct"
                      checked={correctAnswers[0] === oi}
                      onChange={() => setCorrectAnswers([oi])}
                      className="accent-indigo-600 shrink-0"
                      title="Jawaban benar"
                    />
                  )}
                  {type === 'multiple' && (
                    <input
                      type="checkbox"
                      checked={correctAnswers.includes(oi)}
                      onChange={() => {
                        const has = correctAnswers.includes(oi)
                        setCorrectAnswers(
                          has
                            ? correctAnswers.filter((x) => x !== oi)
                            : [...correctAnswers, oi].sort((a, b) => a - b)
                        )
                      }}
                      className="accent-indigo-600 shrink-0"
                      title="Termasuk jawaban benar"
                    />
                  )}
                  {type === 'category' && (
                    <select
                      value={correctAnswers[oi] ?? 0}
                      onChange={(e) => {
                        const cur = [...correctAnswers]
                        while (cur.length <= oi) cur.push(0)
                        cur[oi] = Number(e.target.value)
                        setCorrectAnswers(cur)
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white shrink-0"
                    >
                      {categoryLabels.map((lab, li) => (
                        <option key={lab} value={li}>
                          {lab}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-xs text-gray-400 w-5 shrink-0">{String.fromCharCode(65 + oi)}</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...options]
                      next[oi] = e.target.value
                      setOptions(next)
                    }}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50"
                    placeholder={type === 'category' ? `Pernyataan ${oi + 1}` : `Opsi ${oi + 1}`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOptions(options.filter((_, j) => j !== oi))
                        setCorrectAnswers(
                          correctAnswers.filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x))
                        )
                      }}
                      className="text-gray-400 hover:text-red-500 text-sm px-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptions([...options, ''])}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                + Tambah {type === 'category' ? 'pernyataan' : 'opsi'}
              </button>
            </div>
            {type !== 'category' && (
              <p className="text-[11px] text-gray-400 mt-1">
                {type === 'single'
                  ? 'Pilih radio di kiri untuk menandai jawaban benar.'
                  : 'Centang semua opsi yang benar.'}
              </p>
            )}
          </div>

          {type === 'category' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label kategori (pisah koma)</label>
              <input
                type="text"
                value={categoryLabels.join(', ')}
                onChange={(e) =>
                  setCategoryLabels(
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50"
                placeholder="Benar, Salah"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kode TP (opsional)</label>
              <input
                type="text"
                value={tpCodes}
                onChange={(e) => setTpCodes(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50"
                placeholder="3.1, 3.2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pembahasan (opsional)</label>
              <input
                type="text"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan…' : 'Simpan soal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
