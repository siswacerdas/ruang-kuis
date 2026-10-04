# Catatan Progress - Ruang Kuis

---

## 2026-10-04 — Import + TP + Latihan Soal

### Import & Tujuan Pembelajaran
- [x] Field **TP (Tujuan Pembelajaran)** pada soal (editor + import + preview)
- [x] Import soal disesuaikan schema baru (type, correctAnswers[], categoryLabels, tp, explanation)
- [x] Import masuk ke materi aktif (topic) dan pool mapel
- [x] Format JSON/CSV/Excel didokumentasikan di UI (details)

### Latihan Soal (paket)
- [x] Collection Firestore `latihan`
- [x] Field: judul, deskripsi, subjectKey, questionIds, jadwal start/end, token, status, timeLimit, shuffle, showScore
- [x] Halaman daftar dengan tab: Semua / Draf / Terjadwal / Aktif / Selesai / Arsip
- [x] Status otomatis berdasarkan waktu (scheduled → active → finished)
- [x] Form buat/edit: pilih soal dari pool mapel, filter materi, generate acak 10/20
- [x] Token 6 karakter + tombol acak & salin
- [x] Navigasi sidebar + kartu Dashboard

### Route baru
- `/latihan-soal` — daftar paket
- `/latihan-soal/baru` — buat
- `/latihan-soal/:id` — edit

### Selanjutnya
- [ ] Halaman siswa masuk dengan token + kerjakan soal
- [ ] Simpan jawaban & skor (per TP untuk capaian)
- [ ] Laporan progress guru
- [ ] Firestore Security Rules
- [ ] Deploy Firebase Hosting

---

## 2026-10-04 — Bank Soal hierarkis
- Mapel → Materi → Soal (3 tipe), subjectKey denormalized

## 2026-10-03 — UI refresh & setup awal
- Layout, login, CRUD flat, Firebase

*Update terakhir: 2026-10-04*
