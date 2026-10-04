# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Fixed (segera)
- **TopicQuestions.tsx**: file sempat terpotong saat push besar; UI bank soal perlu dipulihkan penuh dari salinan lokal (Fase B import tka2026).

### Planned — Fase C
- Penyajian kuis: stimulus + gambar terbingkai, lightbox, tabel kategori, gaya LMS.

---

## [0.2.1] — 2026-10-04

### Added (Fase B — skema)
- Field opsional pada `Question`: `stimulusImage`, `tipeMateri`, `kompleksitas`, `skor`.
- Helper `mapTkaType()` — mapping `pg`/`pgk`/`pgk-cat` → `single`/`multiple`/`category`.
- Helper `resolveCorrectAnswers()` — kunci **teks opsi** (pola tka2026) atau indeks/huruf A–D → `number[]` internal.
- Label kompleksitas L1/L2/L3.

### Tidak Berubah
- Format internal `correctAnswers: number[]` (kompatibel attempt & gradeAnswer lama).
- Collection `questions` / `topics` / `latihan`.

---

## [0.2.0] — 2026-10-04

### Added
- **CHANGELOG.md**, anti-regresi diperluas, rencana migrasi tka2026 (A→B→C).

### Changed
- `docs/ANTI_REGRESSION.md`, `PROGRESS.md`.

---

## [0.1.0] — 2026-10-03 / 2026-10-04

### Added
- React + Vite + Firebase; bank soal hierarkis; 3 tipe soal; import; paket latihan; alur siswa kerjakan.

---
