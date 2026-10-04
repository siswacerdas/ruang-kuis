# Catatan Progress - Ruang Kuis

File ini digunakan untuk mencatat kemajuan proyek secara kronologis.
Update file ini setiap kali ada progress berarti.

---

## 2026-10-04 — Bank Soal hierarkis

### Yang sudah dilakukan
- [x] Mengubah "Kelola Soal" menjadi **Bank Soal**
- [x] Struktur hierarki: **Mata Pelajaran → Materi → Soal**
- [x] 8 mapel tetap (Bahasa Indonesia, Pendidikan Pancasila, IPAS, Seni Musik, Seni Rupa, Matematika, Al-Islam, Bahasa Inggris)
- [x] Guru dapat menambah/hapus **materi** sendiri tanpa ubah kode
- [x] Soal menyimpan `subjectKey` (denormalisasi) agar pool per mapel mudah di-query untuk ATS/AS
- [x] 3 tipe soal:
  - Pilihan Ganda (single)
  - Pilihan Ganda Kompleks (multiple correct)
  - Pilihan Ganda Kategori (benar-salah / sesuai-tidak sesuai, label bisa diubah)
- [x] Editor soal terinspirasi UI referensi (outline kiri + preview/editor)
- [x] Field pembahasan (explanation) opsional
- [x] Route: `/bank-soal`, `/bank-soal/:subjectKey`, `/bank-soal/:subjectKey/:topicId`
- [x] Redirect `/questions` → `/bank-soal`

### Model data Firestore
- Collection `topics`: `{ subjectKey, name, createdAt }`
- Collection `questions`: `{ topicId, subjectKey, type, question, options, correctAnswers, categoryLabels?, explanation?, createdAt }`

### Catatan teknis
- Query `where + orderBy` mungkin butuh composite index di Firebase Console (ada fallback tanpa orderBy).
- Soal lama (flat, tanpa topicId/subjectKey) tidak otomatis migrasi — buat materi baru lalu input ulang atau import nanti.

### Selanjutnya (Prioritas)
- [ ] Import soal ke materi tertentu (JSON/CSV/Excel disesuaikan schema baru)
- [ ] Halaman siswa mengerjakan latihan (dari pool mapel / materi)
- [ ] Generate kuis ATS/AS dari pool mapel
- [ ] Menampilkan skor / hasil latihan
- [ ] Sistem role (Admin vs Siswa) — opsional
- [ ] Kunci Firestore Security Rules
- [ ] Deploy ke Firebase Hosting

---

## 2026-10-03 (UI/UX refresh)

- [x] Layout sidebar, Login/Dashboard/Questions polished

## 2026-10-03 (awal)

- [x] Setup Vite + React + TS + Tailwind + Firebase
- [x] Login admin, CRUD soal flat, import file

---

*Update terakhir: 2026-10-04*
