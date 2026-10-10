/**
 * Mengembalikan gambar soal ke kondisi sebelum migrasi memakai cadangan
 * scripts/backup-stimulus-<idSoal>.json (dibuat otomatis oleh migrate-stimulus-images.mjs --apply).
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/jalur/ke/serviceAccount.json
 *   node scripts/restore-stimulus-images.mjs            # laporan saja
 *   node scripts/restore-stimulus-images.mjs --apply    # kembalikan
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const APPLY = process.argv.includes('--apply')
const dir = path.dirname(fileURLToPath(import.meta.url))
const files = fs.readdirSync(dir).filter((f) => /^backup-stimulus-.+\.json$/.test(f))

admin.initializeApp({ credential: admin.credential.applicationDefault() })
const db = admin.firestore()

console.log(`Cadangan ditemukan: ${files.length} | mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
let restored = 0
for (const f of files) {
  const { id, stimulusImage } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  if (!id || !String(stimulusImage || '').startsWith('data:image')) continue
  try {
    // Hanya kembalikan bila soal masih memakai gambar hasil migrasi (jangan menimpa suntingan guru)
    const ref = db.collection('questions').doc(id)
    const cur = await ref.get()
    const now = String(cur.exists ? cur.data().stimulusImage || '' : '')
    if (!now.includes(`stimulus%2Fmigrated%2F${id}`)) {
      console.log(`lewat ${id}: gambar sudah berubah / bukan hasil migrasi`)
      continue
    }
    if (!APPLY) { console.log(`akan dikembalikan: ${id}`); continue }
    await ref.update({ stimulusImage })
    restored++
  } catch (e) {
    console.warn(`LEWAT ${id}:`, e.message)
  }
}
console.log(APPLY ? `Dikembalikan: ${restored}` : 'Dry run selesai. Tambahkan --apply untuk mengembalikan.')
