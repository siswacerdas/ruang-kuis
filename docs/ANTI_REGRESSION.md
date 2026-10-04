# Anti-Regresi — Ruang Kuis

Checklist **wajib** sebelum dan sesudah perubahan kode.  
Tujuan: mencegah fitur yang sudah jalan tiba-tiba rusak (regresi).

Referensi pola pengemasan & kuis: proyek tka2026 (stimulus, tiga tipe soal, gate token/waktu).

---

## Checklist umum (selalu)

- [ ] `npm run dev` / build tanpa error
- [ ] Tidak ada error merah di Console browser
- [ ] Tampilan desktop + mobile tetap rapi
- [ ] CHANGELOG.md sudah diisi untuk perubahan ini

---

## Area sensitif (uji ulang jika disentuh)

| Area | File / koleksi utama |
|------|----------------------|
| Skema soal & kunci | `src/types/question.ts`, collection `questions` |
| Import bank soal | `TopicQuestions.tsx` (normalizeImportItem) |
| UI kuis siswa | `KerjakanQuiz.tsx`, `KerjakanEntry.tsx` |
| Paket latihan | `LatihanForm.tsx`, `LatihanSoal.tsx`, collection `latihan` |
| Penilaian & hasil | `gradeAnswer`, collection `attempts` |
| Auth & routing | `Login.tsx`, `App.tsx`, Firestore rules |

---

## 1. Login & dashboard admin

- [ ] `/login` form + validasi
- [ ] Login sukses → `/dashboard`; gagal → pesan jelas
- [ ] User login tidak bisa buka `/login` lagi
- [ ] Logout berfungsi
- [ ] Route admin dilindungi (belum login → `/login`)

---

## 2. Bank soal (mapel → materi → soal)

- [ ] Daftar mapel & materi muncul
- [ ] CRUD soal: tambah, edit, hapus (konfirmasi)
- [ ] Tiga tipe: **single** (radio), **multiple** (checkbox), **category** (per pernyataan)
- [ ] Field stimulus, explanation, TP / tpCodes tersimpan
- [ ] Preview / daftar soal menampilkan cuplikan benar

### Import

- [ ] Terima `.json`, `.csv`, `.xlsx`
- [ ] `correctAnswers` menerima indeks **atau** huruf A/B/C **atau** teks opsi (setelah migrasi)
- [ ] Soal masuk ke materi aktif / dibuat materi baru dari kolom materi
- [ ] Duplikat (importKey) tidak digandakan
- [ ] Import gagal menampilkan pesan yang jelas, tidak merusak data lama

---

## 3. Paket latihan (`latihan`)

- [ ] Buat / edit paket: judul, soal terpilih, token, jadwal, time limit
- [ ] Status: draft / scheduled / active / finished / archived (otomatis dari waktu)
- [ ] `questionIds` urutan = urutan tampil di kuis
- [ ] **Jangan** ubah `questionIds` paket yang sudah punya attempt tanpa konfirmasi
- [ ] Token 6 karakter generate & salin

---

## 4. Kuis siswa (`/kerjakan`)

- [ ] Masuk dengan token valid + nama siswa
- [ ] Satu soal per layar; navigasi nomor; timer jika `timeLimitMinutes` > 0
- [ ] **single** → pilih satu; **multiple** → multi; **category** → label per pernyataan
- [ ] Stimulus teks tampil (jika ada)
- [ ] Kirim jawaban → simpan `attempts` → halaman hasil
- [ ] Auto-submit saat waktu habis
- [ ] Skor & ringkasan TP benar (bandingkan `correctAnswers`)

### Setelah upgrade penyajian (Fase C)

- [ ] Gambar stimulus (jika ada) dalam frame terbatas + lightbox
- [ ] Lightbox tidak menutup saat klik backdrop (hanya Tutup / Esc)
- [ ] Tabel kategori (pgk-cat style) terbaca di mobile
- [ ] Ganti soal (prev/next) tidak merusak state jawaban / timer

---

## 5. Firebase

- [ ] Auth state konsisten di seluruh app
- [ ] Collection: `questions`, `topics`, `latihan`, `attempts`, `students` (jika dipakai)
- [ ] Rules: siswa tidak bisa baca kunci jawaban mentah / ubah attempt orang lain
- [ ] Query `documentId in` batch ≤ 30 per request

---

## 6. Definition of Done

- [ ] Skenario normal + edge case relevan lulus
- [ ] Tidak merusak fitur existing (checklist di atas)
- [ ] CHANGELOG diupdate
- [ ] Catatan anti-regresi ditambah jika pola baru muncul
- [ ] Hard-refresh / deploy diverifikasi jika menyentuh hosting

---

*Update terakhir: 2026-10-04 — selaras pola tka2026 (bank soal + kuis)*
