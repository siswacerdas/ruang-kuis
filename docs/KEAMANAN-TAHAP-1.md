# Keamanan Tahap 1 — urutan deploy, uji, dan rollback

Yang diperbaiki: (1) akun siswa/ortu dianggap admin di rules, (2) `students` (NISN = password) terbuka
publik, (3) fungsi reset password hanya mengecek "sudah login".

## Urutan deploy (JANGAN dibalik)
1. `cd functions && npm ci && npm run build && cd .. && firebase deploy --only functions`
2. Isi roster: `node scripts/backfill-student-roster.mjs` (dry run) lalu `--apply`.
   Cek di Console: koleksi `studentRoster` jumlahnya sama dengan `students`.
3. `npm run build && firebase deploy --only hosting`. Klien mencoba `studentRoster` dulu; bila ditolak (rules
   lama) atau kosong, otomatis memakai `students`. Jadi aman di rules lama maupun bila langkah 2 terlewat.
   Setelah langkah ini, login siswa/ortu harus tetap normal SEBELUM rules baru dipasang.
4. Uji (daftar di bawah) dengan rules LAMA.
5. `firebase deploy --only firestore:rules,storage` — lakukan di luar jam belajar.
6. Uji ulang daftar yang sama. Bila ada yang gagal → rollback (di bawah).

## Daftar uji
- Admin: login guru, buka Dashboard, Daftar Siswa, Bank Soal; tambah/ubah soal; upload gambar soal; buka bel notifikasi.
- Siswa: buka /kerjakan (daftar nama muncul, tanpa login) → login → kerjakan paket → kirim → lihat hasil, riwayat, peringkat; Latihan Mandiri.
- Orang tua: login → beranda menampilkan nama anak → riwayat/nilai/peringkat; buka formulir "Pengajuan akun ortu" (daftar siswa muncul tanpa login).
- Akun siswa mencoba menghapus soal lewat konsol browser → harus ditolak (permission-denied).
- Fungsi: akun siswa memanggil `resetParentPassword` → harus `permission-denied`; akun guru → berhasil.

## Rollback
- Rules: `git checkout <commit-sebelumnya> -- firestore.rules storage.rules && firebase deploy --only firestore:rules,storage`
- Klien/fungsi: `git revert` lalu deploy ulang. `studentRoster` boleh dibiarkan (tidak berbahaya).

## Menambah guru/admin lain
Tambahkan email ke: `firestore.rules`, `storage.rules`, `ADMIN_EMAILS` (functions) dan `STAFF_ACCOUNTS`
(src/lib/loginAccounts.ts) — atau beri custom claim `admin: true` lewat Admin SDK.

## Belum tercakup (tahap berikutnya)
- Password siswa masih NISN (data pribadi, mudah ditebak) — ganti skema.
- Skor dihitung di klien & kunci jawaban ikut terunduh; `attempts` masih bisa dibaca semua akun login.
- Halaman "Lupa password" ortu membaca `parents` saat belum login → ditolak rules (bug lama).
