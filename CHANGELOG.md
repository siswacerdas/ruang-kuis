# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini (satu-satunya changelog).

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added — Nonaktifkan ortu, lupa password, notifikasi & laporan
- **Notifikasi admin:** lonceng hanya menampilkan yang belum dibaca; setelah diklik, notifikasi dihapus otomatis. Tombol Bersihkan + badge real-time unread.
- **Laporan:** panel Export diperkecil menjadi dropdown compact agar ringkasan nilai tetap menonjol; tip filter mapel jika "Semua mapel".
- **Akun ortu (`/akun-ortu`):** daftar parents, nonaktifkan/aktifkan (`active`), proses reset password (password sementara + salin pesan WA).
- **Lupa password ortu (`/ortu/lupa-password`):** form publik → `parentPasswordResets` + notifikasi admin; alur admin-mediated (bukan self-service email Firebase).
- **Cloud Function `resetParentPassword`:** Admin SDK update password + `mustChangePassword`.
- Nav admin: item **Akun Ortu**. Login tab ortu: link Lupa password.


### Fixed — UI Pengajuan Ortu & password siswa = NISN
- `AdminPengajuanOrtu`: header lewat `Layout` (title/subtitle/actions), status bahasa Indonesia, empty state lebih jelas, kartu pengajuan dirapikan.
- Import siswa: baris dengan email yang sudah ada **memperbarui** data (termasuk **NISN**), bukan dilewati.
- Tombol **Samakan password = NISN** + Cloud Function `syncStudentPasswordsToNisn` (Admin SDK) agar Auth password = field `nisn` (bukan sisa NIS lama).
- Roster acuan: `docs/siswa-kelas5-nisn.csv`.

### Priority — teknis (belum dikerjakan)
- **Email staff ≠ email ortu:** deteksi peran di `App` sudah prioritaskan staff (`isStaffEmail`), dan form/approve ortu menolak email di `STAFF_ACCOUNTS`. Tetap perlu **data hygiene**: pastikan dokumen `parents` tidak memakai email guru/admin; audit berkala jika ada guru yang juga wali murid (gunakan email portal ortu terpisah). [ditunda — data sudah diperbaiki manual di Firestore 2026-10-08]

### Fixed — Login tidak lagi terseret ke akun dummy
- `ensureStudentSession` tidak lagi mengembalikan sesi `localStorage` tanpa Firebase Auth yang email-nya cocok. Sisa login akun uji `dummy` tidak mengalihkan halaman login.
- `/login` dan `/kerjakan` menunggu `onAuthStateChanged`. Logout membersihkan `rk_student`.
- Login guru/ortu membersihkan sesi siswa. Tab Tes disembunyikan di produksi (tetap ada di dev atau `?tab=tes`).

### Added — Akun orang tua (Fase A, sedang dikerjakan)
- Desain: `docs/PARENT_ACCOUNT.md` (skema, alur pengajuan → approve, multi-anak, notifikasi, dummy uji).
- Types: `src/types/parent.ts` (`ParentRequest`, `Parent`, notifikasi, session).
- Session: `src/lib/parentSession.ts`.
- Publik: form pengajuan `/ortu/daftar` (`OrtuDaftar.tsx`) — pilih anak, WA, email, password.
- Admin: `/pengajuan-ortu` (`AdminPengajuanOrtu.tsx`) — setujui (buat Auth + `parents`) / tolak; hapus `tempPassword` setelah diproses.
- Beranda placeholder: `OrtuHome.tsx` (`/ortu`).
- Wiring: `App.tsx` (isParent, routes `/ortu`, `/ortu/daftar`, `/pengajuan-ortu`), `Layout` nav Pengajuan Ortu, `firestore.rules` untuk parentRequests/parents/adminNotifications.
- Login tab Orang Tua: salin `Login.parent.tsx` (artifacts) → `src/pages/Login.tsx` jika belum ter-merge di mesin lokal, lalu commit.
- Koleksi baru: `parentRequests`, `parents`, `adminNotifications`.
- **Sementara — dummy uji live:** siswa `Siswa Uji Ortu` (`uji.ortu@ruang-kuis.test`, NISN `9999000001`, `isDummy: true`). Login siswa via tab **Tes**.
- **TODO wajib di akhir percakapan / sebelum production ortu:** hapus dummy uji ortu + Auth terkait, bersihkan request/parent uji, centang item ini.

### Added — Rekap Nilai (nilai akhir per TP / mapel)
- Halaman admin **Rekap Nilai** (`/rekap-nilai`): pilih mata pelajaran → matriks siswa × kode TP (nilai akhir %), filter kelas, rata kelas, export CSV.
- Panel kanan: deskripsi TP (kode, elemen, rumusan).

### Added — Input Nilai (admin)
- Aktivitas penilaian + skor 1–4 (step 0.25), AI assessment opsional.

---

## Catatan rilis

Lihat commit history GitHub untuk detail file-per-file.
