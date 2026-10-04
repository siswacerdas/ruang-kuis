# Deploy Ruang Kuis ke Firebase Hosting

Panduan ini untuk mempublikasikan aplikasi agar bisa dibuka online  
(contoh: `https://ruang-kuis.web.app` atau `https://ruang-kuis.firebaseapp.com`).

---

## Prasyarat

- Project Firebase **ruang-kuis** sudah ada (Authentication + Firestore aktif)
- Node.js terpasang di komputer (versi 18+ disarankan)
- Kode project sudah lengkap (semua archive fitur sudah diekstrak / di-push)

---

## Langkah 1 — Aktifkan Hosting di Firebase Console

1. Buka https://console.firebase.google.com
2. Pilih project **ruang-kuis**
3. Menu kiri: **Build** → **Hosting**
4. Jika belum pernah: klik **Get started** / **Mulai**
5. Ikuti layar pengantar sampai Hosting siap (boleh skip langkah CLI di console; kita pakai CLI di langkah berikutnya)

---

## Langkah 2 — Install Firebase CLI (sekali saja)

Buka terminal di komputer lokal:

```bash
npm install -g firebase-tools
```

Cek versi:

```bash
firebase --version
```

---

## Langkah 3 — Login Firebase

```bash
firebase login
```

Browser akan terbuka → login dengan **akun Google yang sama** pemilik project `ruang-kuis`.  
Jika sudah login sebelumnya dan ingin ganti akun:

```bash
firebase logout
firebase login
```

---

## Langkah 4 — Masuk ke folder project

```bash
cd path/ke/ruang-kuis
```

Pastikan file ini ada di root:

- `firebase.json`
- `.firebaserc` (project default: `ruang-kuis`)
- `firestore.rules`
- `firestore.indexes.json`
- `package.json`

Jika `.firebaserc` belum ada, buat dengan isi:

```json
{
  "projects": {
    "default": "ruang-kuis"
  }
}
```

Atau jalankan:

```bash
firebase use ruang-kuis
```

---

## Langkah 5 — Install dependency & build

```bash
npm install
npm run build
```

Berhasil jika:

- Tidak ada error TypeScript besar
- Folder **`dist/`** muncul berisi `index.html` dan folder `assets/`

Cek lokal hasil build (opsional):

```bash
npm run preview
```

Buka URL yang ditampilkan (biasanya http://localhost:4173).

---

## Langkah 6 — Deploy Hosting

**Hanya Hosting (frontend):**

```bash
firebase deploy --only hosting
```

**Atau Hosting + Rules + Index sekaligus:**

```bash
firebase deploy
```

**Atau pakai script npm:**

```bash
npm run deploy
# atau
npm run deploy:all
```

Tunggu sampai selesai. Di akhir output ada baris mirip:

```text
Hosting URL: https://ruang-kuis.web.app
```

Itu URL aplikasi kamu.

---

## Langkah 7 — Uji setelah deploy

| URL | Untuk |
|-----|--------|
| `https://ruang-kuis.web.app` | Akar (redirect ke `/kerjakan` jika belum login) |
| `https://ruang-kuis.web.app/login` | Login admin |
| `https://ruang-kuis.web.app/kerjakan` | Siswa masuk token |
| `https://ruang-kuis.web.app/dashboard` | Dashboard admin (setelah login) |

Domain alternatif Firebase:

`https://ruang-kuis.firebaseapp.com`

---

## Deploy ulang setelah ubah kode

Setiap kali ada perubahan kode:

```bash
cd path/ke/ruang-kuis
npm run build
firebase deploy --only hosting
```

Atau satu perintah:

```bash
npm run deploy
```

---

## Troubleshooting

### Error: "Permission denied" / project not found

```bash
firebase login
firebase projects:list
firebase use ruang-kuis
```

Pastikan akun login adalah **Owner/Editor** project tersebut.

### Error build (TypeScript)

- Baca pesan error di terminal
- Perbaiki file yang disebut, lalu `npm run build` lagi
- Sementara darurat (tidak disarankan jangka panjang): di `package.json` ubah script build menjadi `"build": "vite build"` (melewati `tsc -b`)

### Halaman putih / 404 saat refresh route

Pastikan `firebase.json` punya **rewrites** ke `/index.html` (sudah diset di repo).  
Deploy ulang hosting setelah memperbaiki `firebase.json`.

### Auth / Firestore error di production

1. Firebase Console → **Authentication** → pastikan **Email/Password** enabled  
2. **Firestore** → **Rules** sudah di-publish (bukan test mode kedaluwarsa)  
3. Di **Authentication** → **Settings** → **Authorized domains**: pastikan ada  
   - `ruang-kuis.web.app`  
   - `ruang-kuis.firebaseapp.com`  
   (biasanya otomatis; jika domain custom, tambahkan manual)

### "Firebase App Hosting" vs "Hosting"

Pilih **Hosting** klasik (bukan App Hosting / framework-aware kecuali kamu sengaja setup itu).  
Perintah `firebase deploy --only hosting` memakai konfigurasi di `firebase.json` → folder `dist`.

---

## Ringkasan perintah

```bash
# Setup sekali
npm install -g firebase-tools
firebase login
cd path/ke/ruang-kuis
firebase use ruang-kuis
npm install

# Setiap rilis
npm run build
firebase deploy --only hosting

# Opsional: rules + index juga
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Setelah live

1. Buat akun admin di Console → Authentication → Users (jika belum)
2. Login di `/login`
3. Isi Bank Soal → buat Latihan (status aktif / jadwal sekarang)
4. Bagikan ke siswa: URL `/kerjakan` + **token** paket
