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
import Layout from '../components/Layout'
import { createStudentAuthAccount } from '../lib/createStudentAuth'
import { DEFAULT_STUDENT_CLASS, type Student } from '../types/student'
import * as XLSX from 'xlsx'

export default function SiswaList() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Manual form
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
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

  const normalizeRow = (row: any): Omit<Student, 'id' | 'createdAt'> | null => {
    const fullName = String(
      row.fullName || row['Nama Lengkap'] || row.namaLengkap || row.Nama || row.nama || ''
    ).trim()
    const nickname = String(
      row.nickname || row['Nama Panggilan'] || row.namaPanggilan || row.Panggilan || ''
    ).trim()
    const email = String(row.email || row.Email || '')
      .trim()
      .toLowerCase()
    const nisn = String(row.nisn || row.NISN || row.password || '')
      .trim()
      .replace(/\s/g, '')
    if (!fullName || !email || !nisn) return null
    if (!email.includes('@')) return null
    return {
      fullName,
      nickname: nickname || undefined,
      email,
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
        // Support ; or , delimiter
        const workbook = XLSX.read(text, { type: 'string', FS: text.includes(';') ? ';' : ',' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      } else {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      }

      const existing = new Set(students.map((s) => s.email.toLowerCase()))
      let added = 0
      let skipped = 0
      for (const row of rows) {
        const s = normalizeRow(row)
        if (!s) {
          skipped++
          continue
        }
        if (existing.has(s.email)) {
          skipped++
          continue
        }
        await addDoc(collection(db, 'students'), {
          ...s,
          createdAt: serverTimestamp(),
        })
        existing.add(s.email)
        added++
      }
      setMessage(`Import selesai: ${added} ditambahkan, ${skipped} dilewati (duplikat/tidak valid).`)
      await load()
    } catch (err) {
      console.error(err)
      setError('Gagal membaca file. Pastikan format CSV/Excel benar.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim() || !email.trim() || !nisn.trim()) {
      setError('Nama, email, dan NISN wajib diisi')
      return
    }
    setSaving(true)
    try {
      const em = email.trim().toLowerCase()
      const dup = students.find((s) => s.email === em)
      if (dup) {
        setError('Email sudah terdaftar')
        return
      }
      await addDoc(collection(db, 'students'), {
        fullName: fullName.trim(),
        nickname: nickname.trim() || null,
        email: em,
        nisn: nisn.trim(),
        className: DEFAULT_STUDENT_CLASS,
        active: true,
        createdAt: serverTimestamp(),
      })
      setFullName('')
      setNickname('')
      setEmail('')
      setNisn('')
      setShowForm(false)
      setMessage('Siswa ditambahkan. Klik "Buat akun login" untuk membuat password Auth.')
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
          // Akun sudah ada di Auth tapi belum tercatat — tandai saja tanpa uid pasti
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

  const withAuth = students.filter((s) => s.authUid).length

  return (
    <Layout
      title="Daftar Siswa"
      subtitle={`Kelas ${DEFAULT_STUDENT_CLASS} · ${students.length} siswa · ${withAuth} punya akun login`}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-xl text-sm font-medium transition"
          >
            {importing ? 'Mengimpor...' : 'Import CSV/Excel'}
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
            onClick={syncAuthAccounts}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition"
          >
            {syncing ? 'Membuat akun...' : 'Buat akun login'}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition"
          >
            {showForm ? 'Tutup' : '+ Tambah'}
          </button>
        </div>
      }
    >
      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">
        <p className="font-medium mb-1">Alur siswa</p>
        <ol className="list-decimal list-inside text-indigo-700/90 space-y-0.5 text-xs">
          <li>Import / tambah data siswa (email fiktif + NISN)</li>
          <li>Klik <strong>Buat akun login</strong> (password = NISN)</li>
          <li>Siswa buka <code className="bg-white/80 px-1 rounded">/kerjakan</code> → login email + NISN → masukkan token latihan</li>
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
          onSubmit={handleAddManual}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
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
            placeholder="Email fiktif * (mis. nama@ruang-kuis.id)"
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
            required
          />
          <input
            value={nisn}
            onChange={(e) => setNisn(e.target.value)}
            placeholder="NISN * (jadi password)"
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="sm:col-span-2 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium"
          >
            {saving ? 'Menyimpan...' : 'Simpan siswa'}
          </button>
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
                  <th className="px-3 py-3 font-medium">Email</th>
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
                    <td className="px-3 py-3 text-right">
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
