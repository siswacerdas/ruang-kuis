# Panduan Firestore Rules & Index — Ruang Kuis

## A. Deploy Security Rules (mengunci dari test mode)

### Opsi 1 — Lewat Firebase Console (paling mudah)

1. Buka https://console.firebase.google.com
2. Pilih project **ruang-kuis**
3. Di menu kiri: **Build** → **Firestore Database**
4. Tab **Rules** (di atas tabel data)
5. **Hapus** isi rules lama (yang biasanya `allow read, write: if true` / test mode)
6. **Tempel** seluruh isi file `firestore.rules` dari repo
7. Klik **Publish**
8. Tunggu sampai status "Rules published successfully"

### Opsi 2 — Lewat CLI

```bash
# sekali saja: login & pilih project
npm install -g firebase-tools
firebase login
firebase use ruang-kuis

# deploy rules + indexes
firebase deploy --only firestore:rules,firestore:indexes
```

### Apa yang diizinkan rules ini?

| Collection | Siswa (tanpa login) | Admin (login Firebase Auth) |
|------------|---------------------|-----------------------------|
| topics     | tidak               | baca + tulis                |
| questions  | baca saja           | baca + tulis                |
| latihan    | baca saja           | baca + tulis                |
| attempts   | **create** saja     | baca + ubah + hapus         |

---

## B. Composite Index (jika muncul error di browser)

Beberapa query memakai **dua field** sekaligus (`where` + `orderBy`). Firestore butuh **composite index**.

### Gejala

Di Console browser (F12 → Console) muncul error mirip:

```
FirebaseError: The query requires an index.
https://console.firebase.google.com/v1/r/project/ruang-kuis/firestore/indexes?create_composite=...
```

### Cara 1 — Klik link di error (paling cepat)

1. Buka link biru di pesan error (copy-paste ke tab baru jika perlu)
2. Halaman Firebase terbuka dengan form **Create composite index** sudah terisi
3. Klik **Create Index** / **Buat indeks**
4. Tunggu status **Enabled** (bisa 1–5 menit; jangan tutup project)
5. Refresh aplikasi, query akan jalan

### Cara 2 — Buat manual di Console

1. Firebase Console → project **ruang-kuis**
2. **Firestore Database** → tab **Indexes**
3. **Composite** → **Add index**
4. Isi sesuai kebutuhan, contoh untuk **attempts**:

   | Field        | Order      |
   |--------------|------------|
   | latihanId    | Ascending  |
   | finishedAt   | Descending |

   Collection ID: `attempts`  
   Query scopes: **Collection**

5. **Create** → tunggu **Enabled**

### Index yang dipakai aplikasi (sudah di `firestore.indexes.json`)

| Collection | Field 1     | Field 2    | Kegunaan                          |
|------------|-------------|------------|-----------------------------------|
| topics     | subjectKey  | createdAt ↓| Daftar materi per mapel           |
| questions  | topicId     | createdAt ↓| Soal per materi                   |
| questions  | subjectKey  | createdAt ↓| Pool soal per mapel               |
| latihan    | token       | createdAt ↓| (opsional) cari token             |
| attempts   | latihanId   | finishedAt ↓| Riwayat hasil satu paket          |

Deploy semua index sekaligus:

```bash
firebase deploy --only firestore:indexes
```

### Catatan

- Index **single-field** (satu field saja) biasanya otomatis; tidak perlu dibuat.
- Composite index **wajib** hanya jika query menggabungkan filter + sort pada field berbeda.
- Kode aplikasi punya **fallback** tanpa `orderBy` jika index belum siap, tetapi hasil bisa tidak terurut.

---

## C. Cek mode database

1. Firestore → tab **Rules**
2. Pastikan **bukan** lagi:

```
allow read, write: if request.time < timestamp.date(2026, 11, 1);
```

(itu test mode berbatas waktu)

3. Setelah publish rules production di atas, test mode tidak lagi berlaku.
