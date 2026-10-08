import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Potong deskripsi TP agar ringkas untuk orang tua. */
function shortenStatement(text: string, max = TP_LABEL_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…'
}

async function resolveTpLabels(codes: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
  const labels: Record<string, string> = {}
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
  const title = data.latihanTitle || data.title || 'Latihan'
  const headerLabel = isPractice ? 'Hasil latihan mandiri' : 'Hasil latihan siswa'
  const badge = isPractice
    ? '<span style="background:#ccfbf1;color:#0f766e;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Mandiri / Ortu</span>'
    : '<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Kuis guru</span>'
  const pct = data.percent ?? 0
  const scoreColor = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <div style="background:${isPractice ? '#0d9488' : '#4f46e5'};color:#fff;padding:20px 24px;">
      <p style="margin:0 0 4px;font-size:12px;opacity:.9;">${headerLabel}</p>
      <h1 style="margin:0;font-size:20px;font-weight:700;">Ruang Kuis</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;">${badge}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Siswa</p>
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">${escapeHtml(data.studentName || 'Siswa')}${data.studentClass ? ` · ${escapeHtml(String(data.studentClass))}` : ''}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Latihan</p>
      <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(title)}</p>
      <div style="background:#f9fafb;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px;">
        <p style="margin:0;font-size:32px;font-weight:700;color:${scoreColor};">${pct}%</p>
        <p style="margin:6px 0 0;font-size:14px;color:#4b5563;">${data.score ?? 0} benar dari ${data.total ?? 0} soal</p>
      </div>
      ${tpRowsHtml}
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Email ini dikirim otomatis oleh sistem Ruang Kuis setelah siswa menyelesaikan latihan.
        Jika Anda tidak mengharapkan email ini, hubungi guru kelas.
      </p>
    </div>
  </div>
</body></html>`
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
  let parentEmail: unknown = student.parentEmail
  let emailSource = 'students.parentEmail'

  if (!isValidEmail(parentEmail)) {
    try {
      const parentsSnap = await db
        .collection('parents')
        .where('studentIds', 'array-contains', data.studentId)
        .where('active', '==', true)
        .limit(5)
        .get()
      for (const doc of parentsSnap.docs) {
        const em = doc.data()?.email
        if (isValidEmail(em)) {
          parentEmail = em
          emailSource = 'parents.email'
          break
        }
      }
      if (!isValidEmail(parentEmail) && parentsSnap.empty) {
        const anyParents = await db
          .collection('parents')
          .where('studentIds', 'array-contains', data.studentId)
          .limit(5)
          .get()
        for (const doc of anyParents.docs) {
          const em = doc.data()?.email
          if (isValidEmail(em)) {
            parentEmail = em
            emailSource = 'parents.email'
            break
          }
        }
      }
    } catch (err) {
      logger.warn('Gagal query parents untuk fallback email', {
        studentId: data.studentId,
        error: String(err),
      })
    }
  }

  if (!isValidEmail(parentEmail)) {
    logger.info('parentEmail kosong/tidak valid — lewati', {
      studentId: data.studentId,
      attemptId,
    })
    return
  }

  logger.info('Penerima email ortu', {
    attemptId,
    emailSource,
    to: String(parentEmail).toLowerCase(),
  })

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

/**
 * Samakan password Firebase Auth siswa dengan field `nisn` di Firestore.
 * Hanya untuk user yang sudah login (admin/guru). Dipanggil dari Daftar Siswa.
 */
export const syncStudentPasswordsToNisn = onCall(
  { region: 'asia-southeast2' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Harus login sebagai guru/admin')
    }

    const authAdmin = getAuth()
    const snap = await db.collection('students').where('active', '==', true).get()
    let updated = 0
    let skipped = 0
    let failed = 0
    const errors: string[] = []

    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      const nisn = String(data.nisn || '').replace(/\s/g, '')
      const email = String(data.email || '').trim().toLowerCase()
      const authUid = data.authUid ? String(data.authUid) : ''
      if (!nisn || nisn.length < 5) {
        skipped++
        continue
      }

      try {
        let uid = authUid
        if (!uid && email) {
          try {
            const user = await authAdmin.getUserByEmail(email)
            uid = user.uid
            await docSnap.ref.update({ authUid: uid })
          } catch {
            skipped++
            continue
          }
        }
        if (!uid) {
          skipped++
          continue
        }
        await authAdmin.updateUser(uid, { password: nisn })
        updated++
      } catch (err: unknown) {
        failed++
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${email || docSnap.id}: ${msg.slice(0, 80)}`)
        logger.error('sync password gagal', { email, error: msg })
      }
    }

    logger.info('syncStudentPasswordsToNisn', { updated, skipped, failed })
    return {
      updated,
      skipped,
      failed,
      errors: errors.slice(0, 8),
    }
  }
)
