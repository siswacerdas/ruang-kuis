# Catatan Progress — Ruang Kuis

---

## 2026-10-04 — Fase A: Dokumentasi (selaras tka2026)

- [x] `CHANGELOG.md` (Keep a Changelog)
- [x] `docs/ANTI_REGRESSION.md` diperluas (bank soal, import, paket, kuis, scoring)
- [x] Rencana migrasi: A (docs) → B (skema + import) → C (UI penyajian kuis)

### Selanjutnya (B → C)
- [ ] Skema soal kompatibel tka2026 (stimulus, skor, kompleksitas; kunci teks opsi opsional)
- [ ] Import Excel/JSON template selaras tka2026
- [ ] UI kuis: frame gambar stimulus, lightbox, tabel kategori, gaya LMS

---

## 2026-10-04 — Import + TP + Latihan Soal

### Import & Tujuan Pembelajaran
- [x] Field **TP** pada soal (editor + import + preview)
- [x] Import schema: type, correctAnswers[], categoryLabels, tp, explanation, stimulus
- [x] Import ke materi aktif / pool mapel

### Latihan Soal (paket)
- [x] Collection `latihan`
- [x] Field: judul, deskripsi, subjectKey, questionIds, jadwal, token, status, timeLimit, shuffle, showScore
- [x] Tab status + form buat/edit + generate acak
- [x] Alur siswa: token → kerjakan → hasil (+ tpSummary)

### Route
- `/latihan-soal`, `/latihan-soal/baru`, `/latihan-soal/:id`
- `/kerjakan`, `/kerjakan/:latihanId`, `/kerjakan/hasil`

---

## 2026-10-04 — Bank Soal hierarkis
- Mapel → Materi → Soal (3 tipe), subjectKey denormalized

## 2026-10-03 — UI refresh & setup awal
- Layout, login, CRUD, Firebase

*Update terakhir: 2026-10-04*
