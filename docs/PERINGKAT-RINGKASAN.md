# Peringkat berbasis ringkasan (`studentStats`)

Masalah: halaman Peringkat (siswa, orang tua, admin) membaca SEMUA hasil kuis semua siswa setiap dibuka —
makin banyak kuis, makin berat (bacaan Firestore & lag di HP lama).

Sekarang: tiap siswa punya satu dokumen ringkasan `studentStats` (jumlah & total skor per kelas × mapel).
Cloud Function `syncStudentStats` menghitung ulang ringkasan siswa terkait setiap hasil kuis dibuat/diubah/dihapus
(termasuk Reset oleh guru). Halaman peringkat membaca ±25 dokumen saja. Angka peringkat tetap SAMA
(diuji otomatis: ringkasan vs data mentah, semua kombinasi filter kelas × mapel).

## Pengaman (halaman tetap benar walau ringkasan bermasalah)
- Ringkasan kosong / ditolak rules / error → otomatis memakai cara lama (baca semua `attempts`).
- Jumlah hasil di ringkasan dibandingkan dengan jumlah dokumen `attempts` (dihitung di server).
  Bila beda (ringkasan belum sinkron), peringkat dihitung dari data asli.
- Peringkat per paket (Orang Tua) membaca hasil paket itu saja, bukan seluruh hasil.

## Urutan deploy (JANGAN dibalik)
1. `cd functions && npm ci && npm run build && cd ..` lalu `firebase deploy --only functions`
2. Isi ringkasan: `node scripts/backfill-student-stats.mjs` (laporan) lalu `--apply`.
   Cek di Console: koleksi `studentStats` ada, jumlah dokumen ≈ jumlah siswa yang pernah mengerjakan.
3. `npm run build && firebase deploy --only hosting`
   (dengan rules lama, halaman otomatis memakai cara lama — aman)
4. `firebase deploy --only firestore:rules` (menambah izin baca `studentStats`)
5. Uji: peringkat siswa/orang tua/admin menampilkan urutan & angka yang sama seperti sebelumnya;
   kerjakan 1 kuis uji → ringkasan siswa itu berubah (cek dokumennya di Console); Reset hasil → berubah lagi.

Indikator berjalan di ringkasan: buka Console browser (F12). Pesan "ringkasan peringkat belum sinkron" atau
"tidak bisa dipakai" berarti halaman memakai cara lama (lebih lambat tetapi benar) — jalankan ulang langkah 2.

## Rollback
`git revert` commit ini lalu deploy hosting. Fungsi & koleksi `studentStats` boleh dibiarkan (tidak mengganggu).

## Catatan
- Data lama tanpa `studentId` dikelompokkan per nama (huruf kecil), persis seperti peringkat lama.
- Bila ada koreksi data massal langsung di Firestore (tanpa lewat aplikasi), jalankan ulang langkah 2.
