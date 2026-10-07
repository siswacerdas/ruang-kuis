import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from './lib/firebase'
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

function App() {
  const [user, setUser] = useState<any>(null)
  const [isStudent, setIsStudent] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser?.email) {
        try {
          const snap = await getDocs(
            query(collection(db, 'students'), where('email', '==', currentUser.email.toLowerCase()))
          )
          setIsStudent(!snap.empty)
        } catch {
          setIsStudent(false)
        }
      } else {
        setIsStudent(false)
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

  const isAdmin = !!user && !isStudent

  return (
    <BrowserRouter>
      <Routes>
        {/* Siswa */}
        <Route path="/kerjakan" element={<SiswaLogin />} />
        <Route path="/siswa" element={<KerjakanEntry />} />
        <Route path="/siswa/materi" element={isStudent || isAdmin ? <Materi audience="student" /> : <Navigate to="/login" />} />
        <Route path="/siswa/latihan-mandiri" element={<PracticeSetup />} />
        <Route path="/siswa/latihan-mandiri/hasil" element={<PracticeResult />} />
        <Route path="/siswa/latihan-mandiri/:sessionId" element={<PracticeQuiz />} />
        <Route path="/kerjakan/token" element={<Navigate to="/siswa" replace />} />
        <Route path="/kerjakan/hasil" element={<KerjakanResult />} />
        <Route path="/kerjakan/riwayat" element={<KerjakanRiwayat />} />
        <Route path="/siswa/peringkat" element={<SiswaPeringkat />} />
        <Route path="/kerjakan/:latihanId" element={<KerjakanQuiz />} />

        {/* Auth terpadu (Siswa / Guru / Tes) */}
        <Route
          path="/login"
          element={
            isAdmin ? <Navigate to="/dashboard" /> : isStudent ? <Navigate to="/siswa" /> : <Login />
          }
        />

        {/* Admin pages */}
        <Route
          path="/dashboard"
          element={isAdmin ? <Dashboard /> : <Navigate to={isStudent ? '/siswa' : '/login'} />}
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
        <Route
          path="/latihan-soal/baru"
          element={isAdmin ? <LatihanForm /> : <Navigate to="/login" />}
        />
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
        <Route path="/input-nilai" element={isAdmin ? <InputNilai /> : <Navigate to="/login" />} />
        <Route path="/rekap-nilai" element={isAdmin ? <RekapNilai /> : <Navigate to="/login" />} />
        <Route path="/materi" element={isAdmin ? <Materi audience="admin" /> : <Navigate to="/login" />} />

        <Route path="/questions" element={<Navigate to="/bank-soal" replace />} />
        <Route
          path="/"
          element={
            <Navigate to={isAdmin ? '/dashboard' : isStudent ? '/siswa' : '/login'} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
