# Anti-Regresi — Ruang Kuis

Checklist wajib sebelum dan sesudah perubahan kode.

Referensi: tka2026 (stimulus, tiga tipe soal, preview).

---

## Checklist umum

- [ ] npm run build tanpa error
- [ ] Tidak ada error Console
- [ ] Desktop + mobile rapi
- [ ] CHANGELOG.md diisi

---

## Area sensitif

| Area | File |
|------|------|
| Skema & kunci | question.ts, questions |
| Import | TopicQuestions normalizeImportItem |
| Editor stimulus | TopicQuestions HTML + gambar |
| Preview daftar | TopicQuestions detail + modal |
| Kuis siswa | KerjakanQuiz.tsx |
| Latihan / attempts | LatihanForm, gradeAnswer |

---

## Bank soal

- [ ] CRUD soal
- [ ] Saat Edit/Soal baru: form saja; daftar soal TIDAK di bawah form
- [ ] Stimulus: B/I/U, perataan, spasi baris, persamaan tersimpan
- [ ] Gambar: unggah besar → kompres otomatis; tampil di detail daftar
- [ ] Preview stimulus (edit) = bacaan + gambar saja
- [ ] Preview kuis (daftar) = stimulus + gambar + opsi tanpa kunci
- [ ] Import: indeks / A-D / teks opsi (termasuk yang ber-koma)

## Kuis siswa

- [ ] Stimulus HTML + gambar + lightbox
- [ ] single / multiple / category
- [ ] Submit, timer, TP summary

## Definition of Done

- [ ] Edge case lulus, tidak regresi, CHANGELOG, deploy diverifikasi

*Update: 2026-10-04 — stimulus rich text, preview, kompres, fix import koma, hide list saat edit*
