/**
 * Isi / segarkan SEMUA ringkasan peringkat (`studentStats`) dari seluruh hasil kuis (`attempts`).
 * Jalankan SEKALI setelah deploy Cloud Functions, SEBELUM deploy hosting. Setelah itu fungsi
 * `syncStudentStats` menjaganya otomatis. Aman diulang kapan saja (mis. setelah koreksi data massal).
 *
 *   cd functions && npm run build && cd ..        # fungsi hitung dipakai ulang dari hasil build
 *   npm i --no-save firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/jalur/ke/serviceAccount.json
 *   node scripts/backfill-student-stats.mjs            # laporan saja (tidak menulis)
 *   node scripts/backfill-student-stats.mjs --apply    # tulis
 */
import { createRequire } from 'node:module'
import admin from 'firebase-admin'

const require = createRequire(import.meta.url)
let rebuildAll
try {
  ;({ rebuildAll } = require('../functions/lib/rebuildStats.js'))
} catch {
  console.error('Belum ada hasil build fungsi. Jalankan dulu: cd functions && npm run build')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
admin.initializeApp({ credential: admin.credential.applicationDefault() })
const result = await rebuildAll(admin.firestore(), APPLY)
console.log(
  `Hasil kuis: ${result.attempts} | siswa dengan ringkasan: ${result.students} | ` +
    `ringkasan usang dihapus: ${result.staleRemoved} | ditulis: ${result.written} | mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`
)
if (!APPLY) console.log('Dry run selesai. Tambahkan --apply untuk menulis.')
