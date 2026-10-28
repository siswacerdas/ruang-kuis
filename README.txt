Ruang Kuis — paket migrasi AI OpenAI → Google Gemini
====================================================

Isi folder src/ meniru struktur repo. Salin file ke lokasi yang sama di proyek Anda.

1. src/lib/geminiClient.ts          → BARU (wajib)
2. src/lib/openaiAssessment.ts
3. src/lib/openaiLesson.ts
4. src/lib/openaiPresentation.ts
5. src/lib/openaiQuestions.ts
6. src/lib/openaiQuestionEditor.ts
7. src/types/assessment.ts          (skala predikat baru)
8. src/pages/InputNilai.tsx         (teks predikat)

Env .env (root proyek):
  VITE_GEMINI_API_KEY=...
  VITE_GEMINI_MODEL=gemini-2.0-flash          # opsional
  VITE_GEMINI_IMAGE_MODEL=imagen-3.0-generate-002  # opsional

Hapus / abaikan VITE_OPENAI_* — tidak dipakai lagi.
Setelah isi .env: restart npm run dev.

Panduan lengkap: CARA_INSTALL.md
