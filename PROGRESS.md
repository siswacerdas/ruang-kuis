# Catatan Progress — Ruang Kuis

Sumber kebenaran fitur: `CHANGELOG.md` di root (bukan `src/CHANGELOG.md`).

---

## 2026-10-07 — Beres-beres repo

- [x] `.firebase/` (cache hosting) di-gitignore dan file yang sudah terlacak dihapus
- [x] `ai-image-compress.patch` dihapus — kompres gambar sudah ada di `src/lib/imageCompress.ts`
- [x] Satu changelog: `CHANGELOG.md` di root
- [x] Impor format TKA **tidak dikerjakan**. Berkas tka2026 hanya referensi penyajian kuis (stimulus, tiga tipe soal, preview). Bukan sumber impor.

---

## Yang sudah jalan

- Admin: login, dashboard, bank soal hierarkis, paket latihan manual/otomatis, laporan, peringkat, daftar siswa, master TP, materi (draft/publish + editor HTML)
- Siswa: login, kerjakan paket, hasil, riwayat, peringkat, materi terbit, latihan mandiri
- AI: soal (stimulus, opsi, gambar), materi (simpan sebagai draft), presentasi
- Email orang tua lewat Cloud Function + Resend

## Bukan backlog

- Integrasi impor `tka2026` / template khusus TKA — ditutup 2026-10-07

*Update terakhir: 2026-10-07*
