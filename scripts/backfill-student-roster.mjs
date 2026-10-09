/**
 * Salin semua siswa ke `studentRoster` (data publik minimal: nama, kelas, email login).
 * Jalankan SEKALI setelah deploy Cloud Functions & SEBELUM deploy hosting/rules tahap 1.
 * Setelah itu fungsi `syncStudentRoster` menjaga salinan tetap sinkron otomatis.
 *
 *   npm i --no-save firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/jalur/ke/serviceAccount.json
 *   node scripts/backfill-student-roster.mjs          # laporan saja
 *   node scripts/backfill-student-roster.mjs --apply  # tulis
 */
import admin from 'firebase-admin'

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.applicationDefault() })
const db = admin.firestore()

const toRoster = (d) => ({
  fullName: String(d.fullName || ''),
  nickname: String(d.nickname || ''),
  email: String(d.email || '').trim().toLowerCase(),
  className: String(d.className || '5A'),
  active: d.active !== false,
  isDummy: d.isDummy === true,
})

const [students, roster] = await Promise.all([
  db.collection('students').get(),
  db.collection('studentRoster').get(),
])
console.log(`students: ${students.size} | roster sekarang: ${roster.size} | mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
if (!APPLY) process.exit(0)

const live = new Set(students.docs.map((d) => d.id))
let batch = db.batch()
let n = 0
for (const d of students.docs) {
  batch.set(db.collection('studentRoster').doc(d.id), toRoster(d.data()))
  if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
}
for (const d of roster.docs) {
  if (!live.has(d.id)) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = db.batch() } }
}
await batch.commit()
console.log('Selesai.')
