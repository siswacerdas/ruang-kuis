import { useEffect, useState, useRef } from 'react'
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Layout from '../components/Layout'
import {
  getSubject,
  QUESTION_TYPE_LABELS,
  DEFAULT_CATEGORY_LABELS,
  mapTkaType,
  resolveCorrectAnswers,
  type Question,
  type QuestionType,
  type Topic,
  type SubjectKey,
} from '../types/question'

const emptyForm = () => ({
  type: 'single' as QuestionType,
  question: '',
  options: ['', '', '', ''],
  correctAnswers: [] as number[],
  categoryLabels: [...DEFAULT_CATEGORY_LABELS] as string[],
  explanation: '',
  tp: '',
  tpCodes: '',
  materialName: '',
})

function parseTpCodes(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  return String(value || '')
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function downloadTemplate() {
  const header =
    'materi,tp,type,question,stimulus,optionA,optionB,optionC,optionD,correctAnswers,explanation,kompleksitas,skor'
  const rows = [
    'Ekosistem,"IPAS-2.1, IPAS-2.2",single,Komponen berikut yang termasuk abiotik adalah...,,Cahaya matahari,Pohon,Burung,Jamur,Cahaya matahari,Abiotik adalah komponen tak hidup.,L1-Pemahaman,1',
    'Bilangan,MTK-1.1,pg,Hasil dari 12 + 8 adalah …,,18,20,22,24,20,,L1-Pemahaman,1',
    'Bilangan,MTK-1.2,pgk,Manakah yang termasuk bilangan genap?,,3,4,7,10,"4;10",,L2-Aplikasi,2',
  ]
  const blob = new Blob([`${header}\n${rows.join('\n')}\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_import_soal.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Normalisasi satu baris import (JSON / CSV / XLSX) ke skema Question internal.
 * Menerima format Ruang Kuis lama DAN format tka2026 (pg/pgk/pgk-cat, kunci teks, rows/cols).
 */
function normalizeImportItem(item: any): Omit<Question, 'id' | 'topicId' | 'subjectKey' | 'createdAt'> | null {
  try {
    const question = String(
      item.question || item.Pertanyaan || item.pertanyaan || item.teks || ''
    ).trim()
    if (!question) return null

    const type = mapTkaType(
      String(item.type || item.tipe || item.tipeSoal || item.Type || 'single')
    )

    let options: string[] = []
    let categoryLabels: string[] | undefined

    if (type === 'category') {
      if (Array.isArray(item.rows) && item.rows.length) {
        options = item.rows.map((o: any) => String(o).trim()).filter(Boolean)
      } else if (Array.isArray(item.statements) || Array.isArray(item.pernyataan)) {
        options = (item.statements || item.pernyataan).map((o: any) => String(o).trim()).filter(Boolean)
      } else if (Array.isArray(item.options)) {
        options = item.options.map((o: any) => String(o).trim()).filter(Boolean)
      } else {
        options = [item.pernyataan1, item.pernyataan2, item.pernyataan3, item.pernyataan4]
          .map((o) => String(o || '').trim())
          .filter(Boolean)
      }
      if (Array.isArray(item.cols) && item.cols.length) {
        categoryLabels = item.cols.map((l: any) => String(l).trim())
      } else if (Array.isArray(item.categoryLabels)) {
        categoryLabels = item.categoryLabels.map((l: any) => String(l).trim())
      } else {
        categoryLabels = [
          String(item.categoryLabelA || item.labelA || item.kategoriA || 'Benar').trim() || 'Benar',
          String(item.categoryLabelB || item.labelB || item.kategoriB || 'Salah').trim() || 'Salah',
        ]
      }
      if (!item.kunciJawaban && !item.correctAnswers && (item.kunci1 || item.kunci2)) {
        item = {
          ...item,
          kunciJawaban: [item.kunci1, item.kunci2, item.kunci3, item.kunci4]
            .slice(0, options.length)
            .map((k: any) => String(k || 'Benar').trim()),
        }
      }
    } else {
      if (Array.isArray(item.options)) {
        options = item.options.map((o: any) => String(o).trim())
      } else if (Array.isArray(item.opsi)) {
        options = item.opsi.map((o: any) => String(o).trim())
      } else {
        options = [
          item.optionA || item.opsiA || item.A || item.pilihanA || item['Pilihan A'] || '',
          item.optionB || item.opsiB || item.B || item.pilihanB || item['Pilihan B'] || '',
          item.optionC || item.opsiC || item.C || item.pilihanC || item['Pilihan C'] || '',
          item.optionD || item.opsiD || item.D || item.pilihanD || item['Pilihan D'] || '',
          item.optionE || item.opsiE || item.E || '',
          item.optionF || item.opsiF || item.F || '',
        ]
          .map((o) => String(o).trim())
          .filter((o, i) => o || i < 2)
        while (options.length > 2 && !options[options.length - 1]) options.pop()
      }
    }

    if (options.length < 1 || options.some((o) => !o)) return null
    if (type !== 'category' && options.length < 2) return null

    const labels = categoryLabels || [...DEFAULT_CATEGORY_LABELS]
    const rawKey =
      item.kunciJawaban ??
      item.correctAnswers ??
      item.correctAnswer ??
      item.jawaban ??
      item.Jawaban ??
      item.correct ??
      0

    const correctAnswers = resolveCorrectAnswers(type, rawKey, options, labels)

    if (type === 'single' && correctAnswers.length === 0) return null
    if (type === 'multiple' && correctAnswers.length === 0) return null
    if (type === 'category') {
      while (correctAnswers.length < options.length) correctAnswers.push(0)
    }

    const tpCodes = parseTpCodes(
      item.tpCodes ?? item.tp ?? item.TP ?? item.tujuanPembelajaran ?? item.tujuan
    )
    const materialName =
      String(
        item.materi ||
          item.material ||
          item.topic ||
          item.namaMateri ||
          item.tipeMateri ||
          ''
      ).trim() || undefined
    const explanation =
      String(item.explanation || item.pembahasan || item.Pembahasan || '').trim() || undefined
    const stimulus =
      String(item.stimulus || item.Stimulus || item.konteks || item.bacaan || '').trim() || undefined
    const stimulusImage =
      String(item.stimulusImage || item.ilustrasi || item.gambar || '').trim() || undefined
    const kompleksitas =
      String(item.kompleksitas || item.Kompleksitas || '').trim() || undefined
    const skorRaw = item.skor ?? item.score ?? item.bobot
    const skor =
      skorRaw != null && skorRaw !== '' && !isNaN(Number(skorRaw)) ? Number(skorRaw) : undefined
    const tipeMateri =
      String(item.tipeMateri || item.lingkup_materi || materialName || '').trim() || undefined

    return {
      type,
      question,
      options,
      correctAnswers,
      ...(type === 'category' ? { categoryLabels: labels } : {}),
      ...(explanation ? { explanation } : {}),
      ...(stimulus ? { stimulus } : {}),
      ...(stimulusImage ? { stimulusImage } : {}),
      ...(tpCodes[0] ? { tp: tpCodes[0] } : {}),
      tpCodes,
      ...(materialName ? { materialName } : {}),
      ...(tipeMateri ? { tipeMateri } : {}),
      ...(kompleksitas ? { kompleksitas } : {}),
      ...(skor != null ? { skor } : {}),
      importKey: questionKey(question, type, options),
    }
  } catch {
    return null
  }
}

function questionKey(question: string, type: string, options: string[]) {
  const text = `${type}|${question}|${options.join('|')}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

function cleanPayload(data: Record<string, any>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

async function resolveTopicId(
  subjectKey: string,
  fallbackId: string,
  materialName: string | undefined,
  cache: Map<string, string>,
  current: Topic | null
) {
  const name = (materialName || current?.name || '').trim()
  if (!name) return fallbackId
  const key = name.toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const snap = await getDocs(query(collection(db, 'topics'), where('subjectKey', '==', subjectKey)))
  const found = snap.docs.find((d) => String(d.data().name || '').trim().toLowerCase() === key)
  if (found) {
    cache.set(key, found.id)
    return found.id
  }
  const created = await addDoc(collection(db, 'topics'), {
    subjectKey,
    name,
    tpCodes: current?.tpCodes || [],
    createdAt: serverTimestamp(),
  })
  cache.set(key, created.id)
  return created.id
}

async function removeDuplicateQuestions(topicId: string) {
  const snap = await getDocs(query(collection(db, 'questions'), where('topicId', '==', topicId)))
  const seen = new Map<string, string>()
  const extra: string[] = []
  snap.docs.forEach((d) => {
    const data = d.data()
    const key = String(data.importKey || questionKey(data.question || '', data.type || '', data.options || []))
    if (seen.has(key)) extra.push(d.id)
    else seen.set(key, d.id)
  })
  for (let i = 0; i < extra.length; i += 400) {
    const batch = writeBatch(db)
    extra.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'questions', id)))
    await batch.commit()
  }
  return extra.length
}

export default function TopicQuestions() {
  const { subjectKey, topicId } = useParams<{ subjectKey: string; topicId: string }>()
  const navigate = useNavigate()
  const subject = getSubject(subjectKey || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [topic, setTopic] = useState<Topic | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [checkedIds, setCheckedIds] = useState<string[]>([])

  useEffect(() => {
    if (!subject || !topicId) {
      navigate('/bank-soal')
      return
    }
    loadData()
  }, [subjectKey, topicId])

  const loadData = async () => {
    if (!topicId || !subjectKey) return
    setLoading(true)
    try {
      const topicDoc = await getDoc(doc(db, 'topics', topicId))
      if (!topicDoc.exists()) {
        navigate(`/bank-soal/${subjectKey}`)
        return
      }
      setTopic({ id: topicDoc.id, ...topicDoc.data() } as Topic)

      let list: Question[] = []
      try {
        const q = query(
          collection(db, 'questions'),
          where('topicId', '==', topicId),
          orderBy('createdAt', 'desc')
        )
        const snap = await getDocs(q)
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Question))
      } catch {
        const snap = await getDocs(
          query(collection(db, 'questions'), where('topicId', '==', topicId))
        )
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Question))
      }
      setQuestions(list)
      if (list.length > 0) setSelectedIndex(0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // NOTE: Rest of component restored from pre-placeholder state.
  // Full UI handlers follow in next commit if truncated.
  return (
    <Layout title="Soal" subtitle="Memuat...">
      <p className="text-sm text-gray-500 p-4">
        File sedang dipulihkan. Silakan refresh setelah commit lengkap.
      </p>
    </Layout>
  )
}
