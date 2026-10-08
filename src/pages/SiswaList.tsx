import { useEffect, useState, useRef } from 'react'
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Layout from '../components/Layout'
import { createStudentAuthAccount } from '../lib/createStudentAuth'
import {
  DEFAULT_STUDENT_CLASS,
  isValidEmail,
  type Student,
} from '../types/student'
import * as XLSX from 'xlsx'

export default function SiswaList() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingPw, setSyncingPw] = useState(false)
  const [syncingParent, setSyncingParent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const parentFileRef = useRef<HTMLInputElement>(null)

  // Form tambah / edit
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [nisn, setNisn] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      let snap
      try {
        snap = await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')))
      } catch {
        snap = await getDocs(collection(db, 'students'))
      }
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)))
    } catch (err) {
      console.error(err)
      setError('Gagal memuat daftar siswa')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setFullName('')
    setNickname('')
    setEmail('')
    setParentEmail('')
    setNisn('')
    setShowForm(false)
  }

  const openEdit = (s: Student) => {
    setEditingId(s.id || null)
    setFullName(s.fullName || '')
    setNickname(s.nickname || '')
    setEmail(s.email || '')
    setParentEmail(s.parentEmail || '')
    setNisn(s.nisn || '')
    setShowForm(true)
    setError('')
    setMessage('')
  }

  const normalizeRow = (row: any): Omit<Student, 'id' | 'createdAt'> | null => {
    const fullName = String(
      row.fullName || row['Nama Lengkap'] || row.namaLengkap || row.Nama || row.nama || row['Nama Siswa'] || ''
    ).trim()
    const nickname = String(
      row.nickname || row['Nama Panggilan'] || row.namaPanggilan || row.Panggilan || ''
    ).trim()
    const email = String(row.email || row.Email || '')
      .trim()
      .toLowerCase()
    const parentEmailRaw = String(
      row.parentEmail ||
        row['Email Orang Tua'] ||
        row['email orang tua'] ||
        row.emailOrangTua ||
        row.ParentEmail ||
        ''
    )
      .trim()
      .toLowerCase()
    const nisn = String(row.nisn || row.NISN || row.password || '')
      .trim()
      .replace(/\s/g, '')
    if (!fullName || !email || !nisn) return null
    if (!email.includes('@')) return null
    return {
      fullName,
      ...(nickname ? { nickname } : {}),
      email,
      ...(isValidEmail(parentEmailRaw) ? { parentEmail: parentEmailRaw } : {}),
      nisn,
      className: DEFAULT_STUDENT_CLASS,
      active: true,
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError('')
    setMessage('')
    try {
      const name = file.name.toLowerCase()
      let rows: any[] = []
      if (name.endsWith('.csv') || name.endsWith('.txt')) {
        const text = await file.text()
        const workbook = XLSX.read(text, { type: 'string', FS: text.includes(';') ? ';' : ',' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      } else {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      }

      const byEmail = new Map(
        students.filter((s) => s.id).map((s) => [s.email.toLowerCase(), s])
      )
      let added = 0
      let updated = 0
      let skipped = 0
      const failedRows: number[] = []
      let firstFailure = ''
      for (let i = 0; i < rows.length; i++) {
        const s = normalizeRow(rows[i])
        if (!s) {
          skipped++
          continue
        }
        const prev = byEmail.get(s.email)
        try {
          if (prev?.id) {
            // Update data (termasuk NISN) — password Auth tidak ikut berubah di sini
            const patch: Record<string, unknown> = {
              fullName: s.fullName,
              nisn: s.nisn,
              className: s.className || DEFAULT_STUDENT_CLASS,
              active: true,
            }
            if (s.nickname) patch.nickname = s.nickname
            if (s.parentEmail) patch.parentEmail = s.parentEmail
            await updateDoc(doc(db, 'students', prev.id), patch)
            updated++
          } else {
            await addDoc(collection(db, 'students'), {
              ...s,
              createdAt: serverTimestamp(),
            })
            byEmail.set(s.email, { ...s, id: 'new' } as Student)
            added++
          }
        } catch (rowErr: any) {
          console.error('Import baris gagal', i + 1, rowErr)
          failedRows.push(i + 1)
          if (!firstFailure) firstFailure = String(rowErr?.message || '').slice(0, 140)
        }
      }
      setMessage(
        `Import selesai: ${added} ditambahkan, ${updated} diperbarui (termasuk NISN), ${skipped} dilewati.` +
          (updated
            ? '\nJika password login masih salah: klik "Samakan password Auth = NISN" (perlu deploy Cloud Function) atau hapus user Auth di Console lalu "Buat akun login".'
            : '')
      )
      if (failedRows.length > 0) {
        const shown = failedRows.slice(0, 10).join(', ') + (failedRows.length > 10 ? ', …' : '')
        setError(
          `${failedRows.length} baris gagal disimpan (baris data ke-${shown}). ${firstFailure}`
        )
      }
      await load()
    } catch (err: any) {
      console.error(err)
      const detail = err?.message ? ` (${String(err.message).slice(0, 120)})` : ''
      setError(`Gagal membaca file. Pastikan format CSV/Excel benar.${detail}`)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /**
   * Sinkronkan / isi parentEmail dari file CSV yang berisi Nama/NISN + Email Orang Tua.
   * Cocokkan terutama lewat NISN, fallback nama lengkap (case-insensitive).
   */
  const handleSyncParentEmails = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSyncingParent(true)
    setError('')
    setMessage('')
    try {
      const name = file.name.toLowerCase()
      let rows: any[] = []
      if (name.endsWith('.csv') || name.endsWith('.txt')) {
        const text = await file.text()
        const workbook = XLSX.read(text, { type: 'string', FS: text.includes(';') ? ';' : ',' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      } else {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      }

      const byNisn = new Map(students.map((s) => [s.nisn.replace(/\s/g, ''), s]))
      const byName = new Map(
        students.map((s) => [s.fullName.trim().toLowerCase(), s])
      )

      let updated = 0
      let skipped = 0
      let noMatch = 0

      for (const row of rows) {
        const nisnKey = String(row.nisn || row.NISN || '')
          .trim()
          .replace(/\s/g, '')
        const nameKey = String(
          row.fullName ||
            row['Nama Lengkap'] ||
            row['Nama Siswa'] ||
            row.Nama ||
            row.nama ||
            ''
        )
          .trim()
          .toLowerCase()
        const pe = String(
          row.parentEmail ||
            row['Email Orang Tua'] ||
            row['email orang tua'] ||
            row.emailOrangTua ||
            row.ParentEmail ||
            row.Email ||
            ''
        )
          .trim()
          .toLowerCase()

        if (!isValidEmail(pe)) {
          skipped++
          continue
        }

        const target = (nisnKey && byNisn.get(nisnKey)) || (nameKey && byName.get(nameKey)) || null
        if (!target?.id) {
          noMatch++
          continue
        }
        if ((target.parentEmail || '').toLowerCase() === pe) {
          skipped++
          continue
        }
        await updateDoc(doc(db, 'students', target.id), { parentEmail: pe })
        updated++
        // update local map so duplicates in file don't re-write
        target.parentEmail = pe
      }

      setMessage(
        `Sinkron email orang tua: ${updated} diperbarui, ${skipped} dilewati (sudah sama/tidak valid), ${noMatch} tidak cocok NISN/nama.`
      )
      await load()
    } catch (err: any) {
      console.error(err)
      setError(`Gagal sinkron email orang tua: ${String(err?.message || err).slice(0, 120)}`)
    } finally {
      setSyncingParent(false)
      if (parentFileRef.current) parentFileRef.current.value = ''
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim() || !nisn.trim()) {
      setError('Nama dan NISN wajib diisi')
      return
    }
    if (!editingId && (!email.trim() || !email.includes('@'))) {
      setError('Email login wajib diisi dan valid')
      return
    }
    if (parentEmail.trim() && !isValidEmail(parentEmail)) {
      setError('Format email orang tua tidak valid')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          fullName: fullName.trim(),
          nisn: nisn.trim().replace(/\s/g, ''),
        }
        if (nickname.trim()) payload.nickname = nickname.trim()
        else payload.nickname = null

        if (parentEmail.trim()) payload.parentEmail = parentEmail.trim().toLowerCase()
        else payload.parentEmail = null

        // Email login tidak diubah lewat form edit (terikat Auth)
        await updateDoc(doc(db, 'students', editingId), payload)
        setMessage('Data siswa diperbarui.')
      } else {
        const em = email.trim().toLowerCase()
        const dup = students.find((s) => s.email === em)
        if (dup) {
          setError('Email login sudah terdaftar')
          setSaving(false)
          return
        }
        const data: Record<string, unknown> = {
          fullName: fullName.trim(),
          email: em,
          nisn: nisn.trim().replace(/\s/g, ''),
          className: DEFAULT_STUDENT_CLASS,
          active: true,
          createdAt: serverTimestamp(),
        }
        if (nickname.trim()) data.nickname = nickname.trim()
        if (isValidEmail(parentEmail)) data.parentEmail = parentEmail.trim().toLowerCase()
        await addDoc(collection(db, 'students'), data)
        setMessage('Siswa ditambahkan. Klik "Buat akun login" untuk membuat password Auth.')
      }
      resetForm()
      await load()
    } catch (err) {
      console.error(err)
      setError('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s: Student) => {
    if (!s.id) return
    if (!confirm(`Hapus ${s.fullName} dari daftar? (Akun Auth di Console tidak ikut terhapus otomatis)`)) return
    try {
      await deleteDoc(doc(db, 'students', s.id))
      await load()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus')
    }
  }

  /** Buat akun Firebase Auth untuk siswa yang belum punya authUid */
  const syncAuthAccounts = async () => {
    const pending = students.filter((s) => s.active && !s.authUid)
    if (pending.length === 0) {
      setMessage('Semua siswa aktif sudah punya akun login.')
      return
    }
    if (!confirm(`Buat akun login untuk ${pending.length} siswa?\nEmail = email fiktif, password = NISN.`)) return

    setSyncing(true)
    setError('')
    setMessage('')
    let ok = 0
    let fail = 0
    const errors: string[] = []

    for (const s of pending) {
      try {
        const uid = await createStudentAuthAccount(s.email, s.nisn)
        await updateDoc(doc(db, 'students', s.id!), { authUid: uid })
        ok++
      } catch (err: any) {
        fail++
        const code = err?.code || ''
        if (code === 'auth/email-already-in-use') {
          errors.push(`${s.email}: sudah ada di Auth (tandai manual / cek Console)`)
        } else {
          errors.push(`${s.email}: ${err?.message || code || 'gagal'}`)
        }
        console.error(s.email, err)
      }
    }

    setMessage(
      `Akun login: ${ok} berhasil, ${fail} gagal.` +
        (errors.length ? `\n${errors.slice(0, 5).join('\n')}` : '')
    )
    await load()
    setSyncing(false)
  }


  /** Samakan password Auth = NISN (Cloud Function Admin SDK) */
  const syncPasswordsToNisn = async () => {
    const withAuth = students.filter((s) => s.active && (s.authUid || s.email))
    if (withAuth.length === 0) {
      setMessage('Tidak ada siswa aktif untuk disamakan passwordnya.')
      return
    }
    if (
      !confirm(
        `Samakan password login ${withAuth.length} siswa dengan NISN di data?\n` +
          'Password lama (mis. NIS) diganti. Siswa login dengan NISN setelah ini.'
      )
    )
      return

    setSyncingPw(true)
    setError('')
    setMessage('')
    try {
      const fn = httpsCallable(getFunctions(undefined, 'asia-southeast2'), 'syncStudentPasswordsToNisn')
      const res = await fn({})
      const data = (res.data || {}) as {
        updated?: number
        skipped?: number
        failed?: number
        errors?: string[]
      }
      setMessage(
        `Password Auth = NISN: ${data.updated ?? 0} diperbarui, ${data.skipped ?? 0} dilewati, ${data.failed ?? 0} gagal.` +
          (data.errors?.length ? `\n${data.errors.join('\n')}` : '')
      )
    } catch (err: any) {
      console.error(err)
      const code = err?.code || ''
      if (String(code).includes('not-found') || String(err?.message || '').includes('not-found')) {
        setError(
          'Cloud Function syncStudentPasswordsToNisn belum di-deploy. Jalankan: firebase deploy --only functions:syncStudentPasswordsToNisn'
        )
      } else {
        setError(`Gagal menyamakan password: ${String(err?.message || err).slice(0, 160)}`)
      }
    } finally {
      setSyncingPw(false)
    }
  }


  const withAuth = students.filter((s) => s.authUid).length
  const withParent = students.filter((s) => isValidEmail(s.parentEmail)).length

  return (
    <Layout
      title="Daftar Siswa"
      subtitle={`Kelas ${DEFAULT_STUDENT_CLASS} · ${students.length} siswa · ${withAuth} akun login · ${withParent} email ortu`}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-xl text-sm font-medium transition"
          >
            {importing ? 'Mengimpor...' : 'Import siswa'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={handleImport}
          />
          <button
            type="button"
            onClick={() => parentFileRef.current?.click()}
            disabled={syncingParent}
            className="inline-flex items-center gap-1.5 bg-white border border-amber-200 hover:bg-amber-50 text-amber-800 px-3.5 py-2 rounded-xl text-sm font-medium transition"
            title="Isi/perbarui email orang tua dari CSV (cocokkan NISN atau nama)"
          >
            {syncingParent ? 'Menyinkron...' : 'Sinkron email ortu'}
          </button>
          <input
            ref={parentFileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={handleSyncParentEmails}
          />
          <button
            type="button"
            onClick={syncAuthAccounts}
            disabled={syncing || syncingPw}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition"
          >
            {syncing ? 'Membuat akun...' : 'Buat akun login'}
          </button>
          <button
            type="button"
            onClick={syncPasswordsToNisn}
            disabled={syncing || syncingPw}
            title="Set password Firebase Auth = field NISN di Firestore"
            className="inline-flex items-center gap-1.5 bg-white border border-amber-200 hover:bg-amber-50 text-amber-900 px-3.5 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
            {syncingPw ? 'Menyamakan password...' : 'Samakan password = NISN'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (showForm && !editingId) resetForm()
              else {
                resetForm()
                setShowForm(true)
              }
            }}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition"
          >
            {showForm && !editingId ? 'Tutup' : '+ Tambah'}
          </button>
        </div>
      }
    >
      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">
        <p className="font-medium mb-1">Alur siswa & notifikasi orang tua</p>
        <ol className="list-decimal list-inside text-indigo-700/90 space-y-0.5 text-xs">
          <li>Import / tambah data siswa (email fiktif + <strong>NISN</strong> = password). Import ulang memperbarui NISN yang sudah ada.</li>
          <li>Klik <strong>Buat akun login</strong> (password Auth = NISN). Akun yang sudah ada: samakan password lewat tombol khusus atau Console.</li>
          <li>
            Isi <strong>email orang tua</strong> (edit per siswa atau tombol <strong>Sinkron email ortu</strong> dari
            CSV)
          </li>
          <li>Siswa buka <code className="bg-white/80 px-1 rounded">/kerjakan</code> → login → kerjakan kuis</li>
          <li>Setelah kuis selesai, sistem mengirim ringkasan hasil ke email orang tua (jika terisi & Cloud Function aktif)</li>
        </ol>
      </div>

      {(message || error) && (
        <div
          className={`mb-4 text-sm px-4 py-3 rounded-xl whitespace-pre-wrap ${
            error ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
          }`}
        >
          {error || message}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSave}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <p className="sm:col-span-2 text-sm font-semibold text-gray-800">
            {editingId ? 'Edit data siswa' : 'Tambah siswa baru'}
          </p>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nama lengkap *"
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
            required
          />
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Nama panggilan"
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email login * (mis. nama@ruang-kuis.id)"
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm disabled:bg-gray-50 disabled:text-gray-500"
            required={!editingId}
            disabled={!!editingId}
            title={editingId ? 'Email login tidak diubah lewat form (terikat Firebase Auth)' : undefined}
          />
          <input
            value={nisn}
            onChange={(e) => setNisn(e.target.value)}
            placeholder="NISN * (jadi password)"
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
            required
          />
          <input
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            placeholder="Email orang tua (opsional)"
            className="px-3 py-2 border border-amber-200 rounded-xl text-sm sm:col-span-2"
          />
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-medium"
            >
              {saving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Simpan siswa'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
            )}
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Memuat...</div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-600 font-medium">Belum ada siswa</p>
            <p className="text-sm text-gray-400 mt-1">Import file CSV kelas 5A atau tambah manual.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-3 py-3 font-medium">Email login</th>
                  <th className="px-3 py-3 font-medium">Email ortu</th>
                  <th className="px-3 py-3 font-medium">NISN</th>
                  <th className="px-3 py-3 font-medium">Akun</th>
                  <th className="px-3 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{s.fullName}</p>
                      {s.nickname && (
                        <p className="text-[11px] text-gray-400">{s.nickname}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-600 font-mono text-xs">{s.email}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {isValidEmail(s.parentEmail) ? (
                        <span className="text-amber-800">{s.parentEmail}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-600">{s.nisn}</td>
                    <td className="px-3 py-3">
                      {s.authUid ? (
                        <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                          Siap login
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                          Belum akun
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="text-xs text-indigo-600 hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
