# Akun Orang Tua — Ruang Kuis

Desain fitur akun orang tua / wali. Status: **sedang dikerjakan** (2026-10-08).

Changelog root: `CHANGELOG.md`. Anti-regresi: `docs/ANTI_REGRESSION.md`.

---

## Tujuan

Orang tua dapat:

1. Mengajukan akun dengan memilih anak dari daftar siswa, mengisi WhatsApp + password.
2. Setelah disetujui admin, login dan melihat:
   - Panduan (pertama login) / pengumuman kuis baru + ringkasan belajar
   - Riwayat pengerjaan anaknya saja (kuis guru + latihan mandiri), termasuk **durasi**
   - Rangkuman nilai per mapel (hanya dari kuis/latihan, **bukan** Input Nilai admin)
   - Peringkat anak (privasi-aware: posisi + total, tanpa wajib menampilkan nama siswa lain)
3. Membuat kuis latihan untuk anaknya (generate soal, reuse generator yang ada).
4. Mengajukan reset password jika lupa.

Admin mendapat notifikasi: pengajuan akun baru, reset password, dan (opsional) siswa selesai kuis.

---

## Peran & autentikasi

| Peran | Deteksi | Entry |
|-------|---------|--------|
| Admin/guru | Firebase Auth + **bukan** di `students` / `parents` | `/login` tab Guru |
| Siswa | Firebase Auth + dokumen `students` (email match) | `/login` tab Siswa |
| Orang tua | Firebase Auth + dokumen `parents` (email match / authUid) | `/login` tab Orang Tua |

`App.tsx` membedakan `isAdmin` / `isStudent` / `isParent` setelah `onAuthStateChanged`.

---

## Koleksi Firestore

### `parentRequests` (pengajuan akun)

```ts
{
  fullName: string
  whatsapp: string
  email: string
  tempPassword?: string  // HANYA sampai approve; dihapus setelah diproses
  studentIds: string[]
  studentNames: string[]
  status: 'pending' | 'approved' | 'rejected'
  note?: string
  createdAt, reviewedAt?, reviewedBy?
}
```

**Alur password:** ortu isi di form → disimpan sementara di `tempPassword` → saat admin setujui, Auth dibuat + field dihapus.

### `parents`

```ts
{
  fullName: string
  whatsapp: string
  email: string
  authUid: string
  studentIds: string[]
  active: boolean
  mustChangePassword?: boolean
  guideSeenAt?: Timestamp
  createdAt, updatedAt
}
```

### `parentPasswordResets` / `adminNotifications`

Lihat `src/types/parent.ts`.

---

## Dummy uji live (SEMENTARA)

**WAJIB dibersihkan di akhir pekerjaan akun ortu.**

| Field | Nilai |
|-------|--------|
| fullName | `Siswa Uji Ortu` |
| nickname | `Uji Ortu` |
| email | `uji.ortu@ruang-kuis.test` |
| nisn | `9999000001` |
| className | `5A` |
| isDummy | `true` |
| active | `true` |

Login siswa dummy: tab **Tes Sistem** di `/login`.

Setelah fitur ortu selesai: hapus dokumen + Auth dummy, centang CHANGELOG.

---

## UI routes

| Path | Siapa | Fungsi |
|------|--------|--------|
| `/login` tab ortu | publik | Login + link ajukan akun |
| `/ortu/daftar` | publik | Form pengajuan |
| `/ortu` | parent | Beranda |
| `/ortu/riwayat` | parent | Riwayat + durasi |
| `/ortu/nilai` | parent | Rangkuman mapel |
| `/ortu/peringkat` | parent | Peringkat |
| `/ortu/buat-kuis` | parent | Generate latihan |
| `/ortu/panduan` | parent | Panduan |
| `/pengajuan-ortu` | admin | Approve/reject |

---

## Urutan implementasi

| Fase | Isi | Status |
|------|-----|--------|
| **A** | Types, form pengajuan, approve admin, login ortu, session, dummy uji | **Berjalan** |
| **B** | Layout ortu, beranda + panduan, riwayat + durasi | |
| **C** | Notifikasi admin | |
| **D** | Rangkuman nilai + peringkat | |
| **E** | Generate kuis ortu | |
| **F** | Reset password, polish, **bersihkan dummy** | |

*Update: 2026-10-08*
