# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Fixed (manual push diperlukan)
- **`src/pages/TopicQuestions.tsx`** — file di GitHub masih stub; unduh patch zip / file tunggal lalu push manual (lihat pesan chat).

### Planned — Fase C
- Penyajian kuis: stimulus + gambar terbingkai, lightbox, tabel kategori, gaya LMS.

---

## [0.2.2] — 2026-10-04

### Changed
- `docs/template_import_soal.csv`: kolom `stimulus`, `kompleksitas`, `skor`; contoh kunci **teks opsi**; tipe `pg`/`pgk` didukung import.

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
