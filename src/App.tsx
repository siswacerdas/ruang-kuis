import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './lib/firebase'
import { isStaffEmail } from './lib/loginAccounts'
import { getRosterByEmail } from './lib/studentRoster'
import { queryParentDocs } from './lib/parentSession'
import Login from './pages/Login'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const BankSoal = lazy(() => import('./pages/BankSoal'))
const SubjectTopics = lazy(() => import('./pages/SubjectTopics'))
const TopicQuestions = lazy(() => import('./pages/TopicQuestions'))
const LatihanSoal = lazy(() => import('./pages/LatihanSoal'))
const LatihanForm = lazy(() => import('./pages/LatihanForm'))
const LatihanHasil = lazy(() => import('./pages/LatihanHasil'))
const Laporan = lazy(() => import('./pages/Laporan'))
const SiswaList = lazy(() => import('./pages/SiswaList'))
const TujuanPembelajaran = lazy(() => import('./pages/TujuanPembelajaran'))
const InputNilai = lazy(() => import('./pages/InputNilai'))
const RekapNilai = lazy(() => import('./pages/RekapNilai'))
import SiswaLogin from './pages/SiswaLogin'
import KerjakanEntry from './pages/KerjakanEntry'
const KerjakanQuiz = lazy(() => import('./pages/KerjakanQuiz'))
const KerjakanResult = lazy(() => import('./pages/KerjakanResult'))
const KerjakanRiwayat = lazy(() => import('./pages/KerjakanRiwayat'))
const Peringkat = lazy(() => import('./pages/Peringkat'))
const SiswaPeringkat = lazy(() => import('./pages/SiswaPeringkat'))
const Materi = lazy(() => import('./pages/Materi'))
const PracticeSetup = lazy(() => import('./pages/PracticeSetup'))
const PracticeQuiz = lazy(() => import('./pages/PracticeQuiz'))
const PracticeResult = lazy(() => import('./pages/PracticeResult'))
const OrtuDaftar = lazy(() => import('./pages/OrtuDaftar'))
const AdminPengajuanOrtu = lazy(() => import('./pages/AdminPengajuanOrtu'))
const AdminParents = lazy(() => import('./pages/AdminParents'))
const OrtuLupaPassword = lazy(() => import('./pages/OrtuLupaPassword'))
const OrtuHome = lazy(() => import('./pages/OrtuHome'))
const OrtuRiwayat = lazy(() => import('./pages/OrtuRiwayat'))
const OrtuNilai = lazy(() => import('./pages/OrtuNilai'))
const OrtuPeringkat = lazy(() => import('./pages/OrtuPeringkat'))
const OrtuBuatKuis = lazy(() => import('./pages/OrtuBuatKuis'))

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
      <p className="text-gray-500 text-sm">Memuat...</p>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<any>(null)
  const [isStaff, setIsStaff] = useState(false)
  const [isStudent, setIsStudent] = useState(false)
  const [isParent, setIsParent] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true)
      setUser(currentUser)
      if (currentUser?.email) {
        const email = currentUser.email.toLowerCase()
        try {
          const staff = await isStaffEmail(email)
          setIsStaff(staff)
          if (staff) {
            setIsStudent(false)
            setIsParent(false)
          } else {
            const [studentSnap, parentSnap] = await Promise.all([
              getRosterByEmail(email),
              queryParentDocs(currentUser.uid, email),
            ])
            setIsStudent(!studentSnap.empty)
            setIsParent(!parentSnap.empty)
          }
        } catch {
          setIsStaff(false)
          setIsStudent(false)
          setIsParent(false)
        }
      } else {
        setIsStaff(false)
        setIsStudent(false)
        setIsParent(false)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  // Admin hanya jika terdaftar sebagai staff — bukan sekadar "bukan siswa/ortu" (gagal baca ≠ admin).
  const isAdmin = !!user && isStaff && !isStudent && !isParent

  const loginRedirect = isAdmin ? <Navigate to="/dashboard" replace /> : <Login />

  const homeRedirect = (
    <Navigate
      to={isAdmin ? '/dashboard' : isStudent ? '/siswa' : isParent ? '/ortu' : '/login'}
      replace
    />
  )

  const parentGuard = (el: React.ReactNode) =>
    isParent ? el : <Navigate to="/login?tab=ortu" />

  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/kerjakan" element={<SiswaLogin />} />
        <Route path="/siswa" element={<KerjakanEntry />} />
        <Route
          path="/siswa/materi"
          element={isStudent || isAdmin ? <Materi audience="student" /> : <Navigate to="/login" />}
        />
        <Route path="/siswa/latihan-mandiri" element={<PracticeSetup />} />
        <Route path="/siswa/latihan-mandiri/hasil" element={<PracticeResult />} />
        <Route path="/siswa/latihan-mandiri/:sessionId" element={<PracticeQuiz />} />
        <Route path="/kerjakan/token" element={<Navigate to="/siswa" replace />} />
        <Route path="/kerjakan/hasil" element={<KerjakanResult />} />
        <Route path="/kerjakan/riwayat" element={<KerjakanRiwayat />} />
        <Route path="/siswa/peringkat" element={<SiswaPeringkat />} />
        <Route path="/kerjakan/:latihanId" element={<KerjakanQuiz />} />

        <Route path="/ortu/daftar" element={<OrtuDaftar />} />
        <Route path="/ortu/lupa-password" element={<OrtuLupaPassword />} />
        <Route path="/ortu" element={parentGuard(<OrtuHome />)} />
        <Route path="/ortu/riwayat" element={parentGuard(<OrtuRiwayat />)} />
        <Route path="/ortu/nilai" element={parentGuard(<OrtuNilai />)} />
        <Route path="/ortu/peringkat" element={parentGuard(<OrtuPeringkat />)} />
        <Route path="/ortu/buat-kuis" element={parentGuard(<OrtuBuatKuis />)} />

        <Route path="/login" element={loginRedirect} />

        <Route
          path="/dashboard"
          element={
            isAdmin ? <Dashboard /> : <Navigate to={isStudent ? '/siswa' : isParent ? '/ortu' : '/login'} />
          }
        />
        <Route path="/bank-soal" element={isAdmin ? <BankSoal /> : <Navigate to="/login" />} />
        <Route
          path="/bank-soal/:subjectKey"
          element={isAdmin ? <SubjectTopics /> : <Navigate to="/login" />}
        />
        <Route
          path="/bank-soal/:subjectKey/:topicId"
          element={isAdmin ? <TopicQuestions /> : <Navigate to="/login" />}
        />
        <Route path="/latihan-soal" element={isAdmin ? <LatihanSoal /> : <Navigate to="/login" />} />
        <Route path="/latihan-soal/baru" element={isAdmin ? <LatihanForm /> : <Navigate to="/login" />} />
        <Route
          path="/latihan-soal/:id/hasil"
          element={isAdmin ? <LatihanHasil /> : <Navigate to="/login" />}
        />
        <Route path="/latihan-soal/:id" element={isAdmin ? <LatihanForm /> : <Navigate to="/login" />} />
        <Route path="/laporan" element={isAdmin ? <Laporan /> : <Navigate to="/login" />} />
        <Route path="/peringkat" element={isAdmin ? <Peringkat /> : <Navigate to="/login" />} />
        <Route path="/daftar-siswa" element={isAdmin ? <SiswaList /> : <Navigate to="/login" />} />
        <Route
          path="/tujuan-pembelajaran"
          element={isAdmin ? <TujuanPembelajaran /> : <Navigate to="/login" />}
        />
        <Route path="/input-nilai" element={isAdmin ? <InputNilai /> : <Navigate to="/login" />}
        />
        <Route path="/rekap-nilai" element={isAdmin ? <RekapNilai /> : <Navigate to="/login" />} />
        <Route path="/materi" element={isAdmin ? <Materi audience="admin" /> : <Navigate to="/login" />} />
        <Route
          path="/pengajuan-ortu"
          element={isAdmin ? <AdminPengajuanOrtu /> : <Navigate to="/login" />}
        />
        <Route
          path="/akun-ortu"
          element={isAdmin ? <AdminParents /> : <Navigate to="/login" />}
        />

        <Route path="/questions" element={<Navigate to="/bank-soal" replace />} />
        <Route path="/" element={homeRedirect} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
