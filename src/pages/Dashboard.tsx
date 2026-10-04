import { Link } from 'react-router-dom'
import Layout from '../components/Layout'

export default function Dashboard() {
  return (
    <Layout
      title="Dashboard"
      subtitle="Ringkasan dan akses cepat ke fitur admin"
    >
      {/* Welcome card */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 md:p-8 text-white mb-8 shadow-sm">
        <h2 className="text-xl md:text-2xl font-semibold mb-1">
          Selamat datang, Admin!
        </h2>
        <p className="text-indigo-100 text-sm md:text-base">
          Kelola soal latihan, pantau data, dan siapkan materi untuk siswa dari sini.
        </p>
      </div>

      {/* Stats / quick cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
        <Link
          to="/bank-soal"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Bank Soal</h3>
          <p className="mt-1 text-sm text-gray-500">
            Kelola materi & soal per mata pelajaran (pool untuk ATS/AS)
          </p>
        </Link>

        <Link
          to="/latihan-soal"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Latihan Soal</h3>
          <p className="mt-1 text-sm text-gray-500">
            Paket latihan dengan jadwal, token, dan soal dari bank
          </p>
        </Link>

        <Link
          to="/laporan"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Laporan</h3>
          <p className="mt-1 text-sm text-gray-500">
            Rekap skor, capaian TP, dan progress siswa
          </p>
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm opacity-70">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-[11px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              Segera
            </span>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Keamanan</h3>
          <p className="mt-1 text-sm text-gray-500">
            Atur Firestore rules & role admin/siswa (belum tersedia)
          </p>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Tips cepat
        </h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2">
            <span className="text-indigo-500 font-medium">1.</span>
            Gunakan menu <strong>Bank Soal</strong> untuk menambah soal manual atau import dari file.
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-500 font-medium">2.</span>
            Format import yang didukung: JSON, CSV, dan Excel (.xlsx / .xls).
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-500 font-medium">3.</span>
            Fitur siswa mengerjakan soal dan laporan skor akan ditambahkan pada tahap berikutnya.
          </li>
        </ul>
      </div>
    </Layout>
  )
}
