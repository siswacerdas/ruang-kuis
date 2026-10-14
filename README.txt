Fix subjects dinamis v3 — termasuk dropdown Materi HTML

Masalah: dialog "Materi HTML" / presentasi AI masih pakai SUBJECTS statis,
jadi mapel baru dari master tidak bisa dipilih di select.

File (struktur repo):
  src/pages/MateriBody.tsx
  src/pages/TujuanPembelajaran.tsx
  src/pages/InputNilai.tsx
  src/pages/RekapNilai.tsx
  src/pages/LatihanForm.tsx
  src/components/AiLessonGenerator.tsx
  src/components/HtmlMaterialEditor.tsx   ← baru di v3 (dropdown Materi HTML)
  src/components/AiPresentationGenerator.tsx ← baru di v3

Windows (root repo):
  Expand-Archive -Force .\ruang-kuis-subjects-fix.zip -DestinationPath .
  npm run build

Cek setelah ekstrak:
  Select-String -Path src\components\HtmlMaterialEditor.tsx -Pattern "getCachedSubjects"
