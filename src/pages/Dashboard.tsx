import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useNavigate, Link } from 'react-router-dom'

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
          <p className="text-gray-500 mb-8">
            Pilih menu di bawah untuk mulai mengelola.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/questions"
              className="border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl p-6 transition"
            >
              <h3 className="text-lg font-semibold text-gray-800">Kelola Soal</h3>
              <p className="text-sm text-gray-500 mt-1">
                Tambah, lihat, dan hapus soal latihan
              </p>
            </Link>

            <div className="border border-gray-200 rounded-xl p-6 opacity-50 cursor-not-allowed">
              <h3 className="text-lg font-semibold text-gray-800">Progress Siswa</h3>
              <p className="text-sm text-gray-500 mt-1">
                Segera hadir
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
