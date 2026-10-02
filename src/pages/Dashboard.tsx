import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await signOut(auth)
      navigate('/login')
    } catch (error) {
      console.error('Gagal logout:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">Ruang Kuis - Dashboard</h1>
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">
            Selamat datang, Admin!
          </h2>
          <p className="text-gray-500">
            Ini adalah halaman dashboard. Nanti di sini akan muncul fitur mengelola soal, melihat progress siswa, dll.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-lg p-5 text-center">
              <p className="text-3xl font-bold text-indigo-600">0</p>
              <p className="text-sm text-gray-500 mt-1">Total Soal</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5 text-center">
              <p className="text-3xl font-bold text-green-600">0</p>
              <p className="text-sm text-gray-500 mt-1">Siswa Aktif</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5 text-center">
              <p className="text-3xl font-bold text-orange-600">0</p>
              <p className="text-sm text-gray-500 mt-1">Latihan Selesai</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}