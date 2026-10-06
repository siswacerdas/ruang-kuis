import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { Resend } from 'resend'
import { logger } from 'firebase-functions'

initializeApp()
const db = getFirestore()

const resendApiKey = defineSecret('RESEND_API_KEY')
const FROM_EMAIL = process.env.FROM_EMAIL || 'Ruang Kuis <onboarding@resend.dev>'

/** Batas karakter deskripsi TP di email (agar tidak terlalu panjang). */
const TP_LABEL_MAX = 90

interface AttemptData {
  latihanId?: string
  latihanTitle?: string
  title?: string
  studentName?: string
  studentId?: string | null
  studentClass?: string
  score?: number
  total?: number
  percent?: number
  tpSummary?: Record<string, { correct: number; total: number }>
  kind?: string
}

function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const e = value.trim().toLowerCase()
  return e.includes('@') && e.includes('.') && e.length >= 5 && e.length <= 120 && !e.includes(' ')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
}

/** Potong deskripsi TP agar ringkas untuk orang tua. */
function shortenStatement(text: string, max = TP_LABEL_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…'
}

/**
 * Ambil label TP dari learningObjectives/{code}.
 * Format tampil: "kode — deskripsi singkat".
 * Jika tidak ada di master → tampilkan kode saja.
 */
async function resolveTpLabels(
  codes: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
  const labels: Record<string, string> = {}
  // Firestore getAll max ~100; TP per attempt biasanya sedikit
  const refs = unique.map((code) => db.doc(`learningObjectives/${code}`))
  if (refs.length === 0) return labels
  try {
    const snaps = await db.getAll(...refs)
    snaps.forEach((snap, i) => {
      const code = unique[i]
      if (!snap.exists) {
        labels[code] = code
        return
      }
      const statement = String(snap.data()?.statement || '').trim()
      if (!statement) {
        labels[code] = code
        return
      }
      labels[code] = `${code} — ${shortenStatement(statement)}`
    })
  } catch (err) {
    logger.warn('Gagal memuat deskripsi TP', { error: String(err) })
    unique.forEach((c) => {
      labels[c] = c
    })
  }
  return labels
}

function buildTpRows(
  tpSummary: Record<string, { correct: number; total: number }> | undefined,
  labels: Record<string, string>
): string {
  if (!tpSummary || Object.keys(tpSummary).length === 0) return ''
  const rows = Object.entries(tpSummary)
    .map(([tp, v]) => {
      const pct = v.total ? Math.round((v.correct / v.total) * 100) : 0
      const label = labels[tp] || tp
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;line-height:1.4;">${escapeHtml(label)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;white-space:nowrap;">${v.correct}/${v.total}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${pct}%</td>
      </tr>`
    })
    .join('')
  return `
    <h3 style="margin:20px 0 8px;font-size:14px;color:#374151;">Capaian per Tujuan Pembelajaran</h3>
    <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">Ringkasan kemampuan ananda pada tiap tujuan belajar.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f9fafb;text-align:left;">
          <th style="padding:8px 10px;">Tujuan pembelajaran</th>
          <th style="padding:8px 10px;text-align:center;">Benar</th>
          <th style="padding:8px 10px;text-align:right;">%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function buildEmailHtml(
  data: AttemptData,
  isPractice: boolean,
  tpRowsHtml: string
): string {
  const name = escapeHtml(data.studentName || 'Siswa')
  const title = escapeHtml(data.latihanTitle || data.title || 'Latihan')
  const score = data.score ?? 0
  const total = data.total ?? 0
  const percent = data.percent ?? 0
  const scoreColor = percent >= 70 ? '#047857' : percent >= 40 ? '#b45309' : '#b91c1c'
  const scoreBg = percent >= 70 ? '#ecfdf5' : percent >= 40 ? '#fffbeb' : '#fef2f2'
  const headerLabel = isPractice ? 'Hasil latihan mandiri' : 'Hasil latihan siswa'
  const badge = isPractice
    ? `<p style="margin:0 0 12px;"><span style="font-size:11px;font-weight:600;color:#0f766e;background:#ccfbf1;padding:4px 8px;border-radius:999px;">Latihan mandiri</span></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:${isPractice ? '#0d9488' : '#4f46e5'};color:#fff;padding:20px 24px;">
      <p style="margin:0;font-size:12px;opacity:.85;">Ruang Kuis</p>
      <h1 style="margin:4px 0 0;font-size:18px;">${headerLabel}</h1>
    </div>
    <div style="padding:24px;">
      ${badge}
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Ananda</p>
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">${name}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Paket latihan</p>
      <p style="margin:0 0 20px;font-size:15px;color:#111827;">${title}</p>
      <div style="background:${scoreBg};border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;">
        <p style="margin:0;font-size:32px;font-weight:700;color:${scoreColor};">${percent}%</p>
        <p style="margin:4px 0 0;font-size:13px;color:${scoreColor};">${score} benar dari ${total} soal</p>
      </div>
      ${tpRowsHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Email ini dikirim otomatis oleh sistem Ruang Kuis setelah siswa menyelesaikan latihan.
        Jika Anda tidak mengharapkan email ini, hubungi guru kelas.
      </p>
    </div>
  </div>
</body>
</html>`
}

async function sendParentEmail(
  snap: FirebaseFirestore.DocumentSnapshot,
  data: AttemptData,
  attemptId: string,
  isPractice: boolean
) {
  if (!data.studentId) {
    logger.info('Attempt tanpa studentId — lewati email', { attemptId })
    return
  }

  const studentSnap = await db.doc(`students/${data.studentId}`).get()
  if (!studentSnap.exists) {
    logger.warn('Student tidak ditemukan', { studentId: data.studentId, attemptId })
    return
  }

  const student = studentSnap.data() || {}
  const parentEmail = student.parentEmail

  if (!isValidEmail(parentEmail)) {
    logger.info('parentEmail kosong/tidak valid — lewati', {
      studentId: data.studentId,
      attemptId,
    })
    return
  }

  const apiKey = resendApiKey.value()
  if (!apiKey) {
    logger.warn('RESEND_API_KEY belum dikonfigurasi — lewati kirim email')
    return
  }

  const tpCodes = Object.keys(data.tpSummary || {})
  const labels = await resolveTpLabels(tpCodes)
  const tpRowsHtml = buildTpRows(data.tpSummary, labels)

  const title = data.latihanTitle || data.title || 'Latihan'
  const prefix = isPractice ? 'Latihan mandiri' : 'Hasil kuis'
  const resend = new Resend(apiKey)
  const subject = `${prefix}: ${data.studentName || 'Siswa'} — ${title} (${data.percent ?? 0}%)`
  const html = buildEmailHtml(data, isPractice, tpRowsHtml)

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [parentEmail.trim().toLowerCase()],
      subject,
      html,
    })

    if (result.error) {
      logger.error('Resend error', { error: result.error, attemptId })
      await snap.ref.update({
        parentEmailStatus: 'error',
        parentEmailError: String(result.error.message || result.error).slice(0, 200),
        parentEmailAt: FieldValue.serverTimestamp(),
      })
      return
    }

    logger.info('Email ortu terkirim', {
      attemptId,
      to: parentEmail,
      id: result.data?.id,
      isPractice,
    })

    await snap.ref.update({
      parentEmailStatus: 'sent',
      parentEmailTo: parentEmail.trim().toLowerCase(),
      parentEmailMessageId: result.data?.id || null,
      parentEmailAt: FieldValue.serverTimestamp(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('Gagal kirim email ortu', { attemptId, error: msg })
    try {
      await snap.ref.update({
        parentEmailStatus: 'error',
        parentEmailError: msg.slice(0, 200),
        parentEmailAt: FieldValue.serverTimestamp(),
      })
    } catch {
      /* ignore */
    }
  }
}

export const onAttemptCreated = onDocumentCreated(
  {
    document: 'attempts/{attemptId}',
    secrets: [resendApiKey],
    region: 'asia-southeast2',
  },
  async (event) => {
    const snap = event.data
    if (!snap) return
    await sendParentEmail(snap, snap.data() as AttemptData, event.params.attemptId, false)
  }
)

export const onPracticeAttemptCreated = onDocumentCreated(
  {
    document: 'practiceAttempts/{attemptId}',
    secrets: [resendApiKey],
    region: 'asia-southeast2',
  },
  async (event) => {
    const snap = event.data
    if (!snap) return
    await sendParentEmail(snap, snap.data() as AttemptData, event.params.attemptId, true)
  }
)
