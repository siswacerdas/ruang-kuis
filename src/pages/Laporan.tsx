import Layout from '../components/Layout'

/** Temporary: full Laporan restore in progress after panel refactor. */
export default function Laporan() {
  return (
    <Layout title="Laporan" subtitle="Progress siswa dari hasil kuis — skor, waktu, dan capaian TP">
      <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <p className="font-medium">Ringkasan laporan sedang diperbarui.</p>
        <p className="mt-1 text-amber-800/90">
          Panel Tren skor diganti dengan aktivitas 7 hari, rata skor per mapel, dan paket yang perlu perhatian.
          Silakan muat ulang setelah deploy berikutnya, atau buka menu Latihan / Rekap Nilai sementara.
        </p>
      </div>
    </Layout>
  )
}
