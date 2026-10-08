import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from './lib/firebase'
import { isStaffEmail } from './lib/loginAccounts'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BankSoal from './pages/BankSoal'
import SubjectTopics from './pages/SubjectTopics'
import TopicQuestions from './pages/TopicQuestions'
import LatihanSoal from './pages/LatihanSoal'
import LatihanForm from './pages/LatihanForm'
import LatihanHasil from './pages/LatihanHasil'
import Laporan from './pages/Laporan'
import SiswaList from './pages/SiswaList'
import TujuanPembelajaran from './pages/TujuanPembelajaran'
import InputNilai from './pages/InputNilai'
import RekapNilai from './pages/RekapNilai'
import SiswaLogin from './pages/SiswaLogin'
import KerjakanEntry from './pages/KerjakanEntry'
import KerjakanQuiz from './pages/KerjakanQuiz'
import KerjakanResult from './pages/KerjakanResult'
import KerjakanRiwayat from './pages/KerjakanRiwayat'
import Peringkat from './pages/Peringkat'
import SiswaPeringkat from './pages/SiswaPeringkat'
import Materi from './pages/Materi'
import PracticeSetup from './pages/PracticeSetup'
import PracticeQuiz from './pages/PracticeQuiz'
import PracticeResult from './pages/PracticeResult'
import OrtuDaftar from './pages/OrtuDaftar'
import AdminPengajuanOrtu from './pages/AdminPengajuanOrtu'
import OrtuHome from './pages/OrtuHome'
import OrtuRiwayat from './pages/OrtuRiwayat'
import OrtuNilai from './pages/OrtuNilai'
import OrtuPeringkat from './pages/OrtuPeringkat'
import OrtuBuatKuis from './pages/OrtuBuatKuis'

function App() {
  const [user, setUser] = useState<any>(null)
  const [isStudent, setIsStudent] = useState(false)
  const [isParent, setIsParent] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Tahan loading sampai role dari Firestore selesai, hindari redirect
      // ke /siswa pakai isStudent basi dari user sebelumnya (dummy).
      setLoading(true)
      setUser(currentUser)
      if (currentUser?.email) {
        const email = currentUser.email.toLowerCase()
        try {
          // Staff (guru/admin) menang atas parents/students jika email bentrok.
          const staff = await isStaffEmail(email)
          if (staff) {
            setIsStudent(false)
            setIsParent(false)
          } else {
            const studentSnap = await getDocs(
              query(collection(db, 'students'), where('email', '==', email))
            )
            const parentSnap = await getDocs(
              query(collection(db, 'parents'), where('email', '==', email))
            )
            setIsStudent(!studentSnap.empty)
            setIsParent(!parentSnap.empty)
          }
        } catch {
          setIsStudent(false)
          setIsParent(false)
        }
      } else {
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

  const isAdmin = !!user && !isStudent && !isParent

  // Selalu render Login di /login agar form bisa dipakai ganti akun.
  // Login.tsx sendiri yang me-redirect jika Auth cocok dengan siswa/ortu.
  // Jangan hard-redirect ke /siswa di sini — itu yang membuat sisa Auth dummy
  // mengunci user di "halaman akun dummy" tanpa bisa login ulang.
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

        <Route path="/questions" element={<Navigate to="/bank-soal" replace />} />
        <Route path="/" element={homeRedirect} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
