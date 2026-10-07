# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini (satu-satunya changelog).

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added — Rekap Nilai (nilai akhir per TP / mapel)
- Halaman admin **Rekap Nilai** (`/rekap-nilai`): pilih mata pelajaran → matriks siswa × kode TP (nilai akhir %), filter kelas, rata kelas, export CSV.
- Panel kanan: deskripsi TP (kode, elemen, rumusan), rata kelas, sumber aktivitas/komponen, sebaran capaian.
- Agregasi: skor komponen dari `assessmentScores` yang menautkan `tpCodes` → persen (level÷4×100) → rata-rata per TP per siswa.
- File: `src/pages/RekapNilai.tsx`; route/nav di `App.tsx` + `Layout.tsx`.

### Changed — Skala skor Input Nilai
- Skala observasi **1–4 dengan kelipatan 0,25** (1 / 1,25 / … / 4) agar capaian lebih representatif.
- `SCORE_OPTIONS`, `clampScore`, `formatScore` di `src/types/assessment.ts`; dropdown `InputNilai.tsx`.

### Added — Input Nilai (penilaian aktivitas/proyek + AI + TP)
- Halaman admin **Input Nilai** (`/input-nilai`): deskripsi aktivitas → pilih mapel → AI menautkan **hanya** TP mapel terpilih, merumuskan komponen penilaian terukur + rubrik 4 level.
- Tabel nilai siswa siap isi, total persen tertimbang, export CSV, simpan ke Firestore.
- Koleksi: `assessmentActivities`, `assessmentScores`.
- File: `src/types/assessment.ts`, `src/lib/openaiAssessment.ts`, `src/pages/InputNilai.tsx`; rules Firestore.

### Fixed — TypeScript ketat (`openaiAssessment`)
- Helper `pickAllowedCodes` menghindari `unknown[]` / implicit `any` pada filter agar `tsc -b` lulus.

### Added — Stimulus multi-mode di generate soal AI (bank soal)
- Guru bisa **memilih lebih dari satu** jenis stimulus dalam satu batch: tanpa stimulus, stimulus teks, dan/atau stimulus gambar.
- Kuota per jenis bisa diatur manual (angka) atau **Bagi merata** dari total jumlah soal.
- Prompt AI menerima kuota eksplisit (`stimulusKind` per soal); backend `resolveStimulusPlan` + `enforceStimulusPlan` memastikan hasil sesuai kuota (AI kadang menukar jenis).
- Generate gambar GPT Image hanya dijalankan untuk soal yang memang mode gambar.
- File: `src/lib/openaiQuestions.ts` (backend), `src/components/AiQuestionGenerator.tsx` (UI multi-checkbox + kuota).

### Added — Generate paket: jumlah & kompleksitas per materi
- Mode **Otomatis (Generate)** di form paket latihan: pilih satu/lebih materi (topik).
- Per materi: **jumlah soal** terpisah + filter **kompleksitas** (L1/L2/L3 / tanpa label).
- Tombol **Bagi merata** dari total acuan; statistik pool per level; tetap dukung generate seluruh pool tanpa pilih materi.
- File: `src/pages/LatihanForm.tsx`, `src/lib/latihanGenerate.ts`.

### Added — Judul materi HTML dari materi buku
- Form **Materi HTML**: sumber judul bisa **Ketik sendiri** atau **Dari materi buku**.
- Memilih materi buku mengisi judul otomatis dan menampilkan **ringkasan isi** + kode TP terkait.
- Pencarian materi buku jika daftar panjang; ringkasan disimpan sebagai `outline` sumber.
- File: `src/components/HtmlMaterialEditor.tsx`.

### Added — Urutan materi belajar (admin/guru)
- Field `sortOrder` pada `lessonMaterials` agar admin bisa mengurutkan materi per mapel.
- Tombol **↑ / ↓** di daftar materi admin: nomor 01 = dipelajari lebih dulu oleh siswa.
- Daftar siswa mengikuti urutan yang sama (bukan alfabet).
- Materi baru otomatis di akhir daftar; migrasi seed mendapat urutan sesuai urutan seed.
- File: `src/lib/lessonMaterials.ts`, `src/pages/MateriBody.tsx`.

### Changed — Beres-beres repo
- Cache Firebase CLI (`.firebase/`, termasuk `hosting.*.cache`) tidak lagi dilacak; folder di-gitignore.
- `ai-image-compress.patch` dihapus. Kompres gambar stimulus sudah ada di `src/lib/imageCompress.ts`.
- Changelog hanya di root. `src/CHANGELOG.md` dihapus (subset yang ketinggalan).
- Impor format tka2026 ditutup. Berkas itu hanya referensi penyajian kuis, bukan backlog impor.
