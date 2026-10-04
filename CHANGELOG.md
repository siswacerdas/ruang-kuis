# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added — Fase C (siap push manual)
- **`src/pages/KerjakanQuiz.tsx`**: tampilan stimulus gambar terbingkai + tombol perbesar; lightbox (zoom +/−, Tutup/Esc, **tidak** tutup saat klik backdrop); tabel kategori desktop + kartu mobile; badge skor soal.

### Fixed (manual push masih diperlukan)
- **`src/pages/TopicQuestions.tsx`** — UI bank soal + import tka2026 (file di GitHub masih stub).

---

## [0.2.2] — 2026-10-04

### Changed
- `docs/template_import_soal.csv`: kolom `stimulus`, `kompleksitas`, `skor`; contoh kunci teks opsi; tipe `pg`/`pgk`.

---

## [0.2.1] — 2026-10-04

### Added (Fase B — skema)
- Field opsional: `stimulusImage`, `tipeMateri`, `kompleksitas`, `skor`.
- `mapTkaType()`, `resolveCorrectAnswers()` (kunci teks opsi / indeks / A–D).

### Tidak Berubah
- `correctAnswers: number[]`, scoring, collection Firestore existing.

---

## [0.2.0] — 2026-10-04

### Added
- CHANGELOG, anti-regresi diperluas, rencana A→B→C.

---

## [0.1.0] — 2026-10-03 / 2026-10-04

### Added
- Setup app, bank soal, latihan, alur kerjakan.

---
