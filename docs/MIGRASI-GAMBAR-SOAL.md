# Migrasi gambar soal lama (base64 → Firebase Storage)

Tujuan: soal lama yang `stimulusImage`-nya masih `data:image...` (ratusan KB per soal, ikut terunduh tiap
kuis dibuka) dipindah ke Storage sebagai JPEG kecil (maks. 800 px). Soal baru sudah otomatis ke Storage.

## Persiapan (sekali)
1. Di folder repo: `npm i --no-save firebase-admin sharp`
2. Firebase Console → Project settings → Service accounts → **Generate new private key**.
   Simpan file JSON di luar folder repo (atau pastikan namanya `serviceAccount*.json`, sudah di-gitignore).
   File ini = kunci penuh ke proyek: jangan dibagikan; hapus dari komputer & cabut di Console setelah selesai.
3. Arahkan script ke kunci itu:
   - macOS/Linux: `export GOOGLE_APPLICATION_CREDENTIALS=/jalur/serviceAccount.json`
   - Windows PowerShell: `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\jalur\serviceAccount.json"`

## Langkah
1. **Laporan saja** (tidak mengubah apa pun): `node scripts/migrate-stimulus-images.mjs`
   Menampilkan jumlah soal bergambar base64, perkiraan penghematan, dan juga ukuran gambar base64 di
   `lessonMaterials`, `bookMaterials`, `topics` (hanya dilaporkan, tidak diubah).
2. **Coba 3 soal**: `node scripts/migrate-stimulus-images.mjs --apply --limit=3`
   Buka soal-soal itu di aplikasi (sebagai guru dan siswa): gambar harus tampil jelas.
3. **Semua**: `node scripts/migrate-stimulus-images.mjs --apply` (sebaiknya di luar jam belajar).
4. Cek kembali dengan langkah 1: "masih base64" harus 0 (atau tinggal yang dilewati).

## Pengaman
- Cadangan gambar asli per soal: `scripts/backup-stimulus-<id>.json` (dibuat SEBELUM dokumen diubah). Simpan sampai
  yakin semua gambar tampil normal.
- Soal yang sedang diedit guru saat migrasi otomatis dilewati (tidak ditimpa); jalankan ulang nanti.
- Aman diulang: soal yang sudah berupa URL tidak disentuh.
- Pemulihan: `node scripts/restore-stimulus-images.mjs` (laporan) lalu `--apply`. Hanya soal yang masih memakai
  gambar hasil migrasi yang dikembalikan.
- Tidak perlu deploy ulang aplikasi — ini perubahan data; aplikasi sudah bisa menampilkan gambar berupa URL.
