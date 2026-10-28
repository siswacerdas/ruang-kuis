/**
 * Klien bersama Google Gemini untuk semua fitur AI Ruang Kuis.
 *
 * Env (.env — jangan commit):
 *   VITE_GEMINI_API_KEY   (wajib)  API key dari Google AI Studio
 *   VITE_GEMINI_MODEL     (opsional, default: gemini-2.0-flash)
 *   VITE_GEMINI_IMAGE_MODEL (opsional, default: imagen-3.0-generate-002)
 *
 * Cara ganti key:
 *   1. Buka https://aistudio.google.com/apikey → Create API key
 *   2. Isi VITE_GEMINI_API_KEY di file .env (root proyek)
 *   3. Restart: hentikan npm run dev, lalu jalankan lagi
 */

export type GeminiJsonOptions = {
  /** Override model (default VITE_GEMINI_MODEL / gemini-2.0-flash) */
  model?: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

export function isGeminiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY?.trim())
}

/** Alias kompatibilitas UI lama yang cek isOpenAiConfigured */
export function isOpenAiConfigured(): boolean {
  return isGeminiConfigured()
}

export function resolveGeminiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_GEMINI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev. ' +
        'Dapatkan key di https://aistudio.google.com/apikey'
    )
  }
  return key
}

export function resolveGeminiModel(override?: string): string {
  return (
    override?.trim() ||
    import.meta.env.VITE_GEMINI_MODEL?.trim() ||
    'gemini-2.0-flash'
  )
}

export function resolveGeminiImageModel(): string {
  return (
    import.meta.env.VITE_GEMINI_IMAGE_MODEL?.trim() ||
    'imagen-3.0-generate-002'
  )
}

function parseJsonContent(content: string): any {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('Respons Gemini bukan JSON valid.')
  }
}

/**
 * Chat + minta JSON (responseMimeType application/json).
 * system → systemInstruction; user → contents.
 */
export async function callGeminiJson(
  system: string,
  user: string,
  opts: GeminiJsonOptions = {}
): Promise<any> {
  const apiKey = resolveGeminiKey()
  const model = resolveGeminiModel(opts.model)
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        topP: opts.topP ?? 0.9,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (res.status === 400 && /API[_ ]?key/i.test(errText)) {
      throw new Error('API key Gemini tidak valid (400). Periksa VITE_GEMINI_API_KEY.')
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'API key Gemini ditolak (401/403). Periksa VITE_GEMINI_API_KEY di Google AI Studio.'
      )
    }
    if (res.status === 429) {
      throw new Error('Batas kuota/rate Gemini (429). Coba lagi nanti.')
    }
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 240)}`)
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts
  let content = ''
  if (Array.isArray(parts)) {
    content = parts.map((p: any) => String(p?.text || '')).join('')
  }
  if (!content) {
    const block =
      data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason
    throw new Error(block ? `Respons Gemini kosong (${block}).` : 'Respons Gemini kosong.')
  }
  return parseJsonContent(content)
}

/**
 * Generate gambar via Imagen (Google AI).
 * Mengembalikan data-URL PNG atau error string.
 */
export async function generateGeminiImage(
  prompt: string
): Promise<{ url?: string; error?: string }> {
  const apiKey = resolveGeminiKey()
  const model = resolveGeminiImageModel()
  const fullPrompt = [
    prompt.trim(),
    "Children's educational illustration for Indonesian elementary school, simple, colorful, friendly.",
    'No text overlays, no watermarks, no circled answers, no labels with written answers.',
  ].join(' ')

  const attempts = [
    // predict (Imagen 3 klasik)
    async () => {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict` +
        `?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: fullPrompt.slice(0, 2000) }],
          parameters: { sampleCount: 1 },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`)
      }
      const b64 =
        data?.predictions?.[0]?.bytesBase64Encoded ||
        data?.predictions?.[0]?.image?.bytesBase64Encoded
      if (b64) return `data:image/png;base64,${b64}`
      throw new Error('respons tanpa gambar (predict)')
    },
    // generateImages (beberapa model baru)
    async () => {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateImages` +
        `?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt.slice(0, 2000),
          config: { numberOfImages: 1 },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`)
      }
      const b64 =
        data?.generatedImages?.[0]?.image?.imageBytes ||
        data?.generatedImages?.[0]?.bytesBase64Encoded
      if (b64) return `data:image/png;base64,${b64}`
      throw new Error('respons tanpa gambar (generateImages)')
    },
  ]

  const errors: string[] = []
  for (const run of attempts) {
    try {
      const url = await run()
      return { url }
    } catch (e: any) {
      errors.push(e?.message || 'error')
    }
  }
  return {
    error:
      errors.join(' | ') ||
      'Gagal generate gambar Imagen. Pastikan model gambar diaktifkan di Google AI Studio, atau unggah gambar manual.',
  }
}
