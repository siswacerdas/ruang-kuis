import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from './lib/firebase'
import { isStaffEmail } from './lib/loginAccounts'
import { areaForPath, pathNeedsMateri, preloadArea, preloadMateri, type AppArea } from './lib/prefetchArea'
import Login from './pages/Login'

const SiswaLogin = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.SiswaLogin })),
)
const KerjakanEntry = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.KerjakanEntry })),
)
const KerjakanQuiz = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.KerjakanQuiz })),
)
const KerjakanResult = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.KerjakanResult })),
)
const KerjakanRiwayat = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.KerjakanRiwayat })),
)
const SiswaPeringkat = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.SiswaPeringkat })),
)
const PracticeSetup = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.PracticeSetup })),
)
const PracticeQuiz = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.PracticeQuiz })),
)
const PracticeResult = lazy(() =>
  import('./areas/student').then((m) => ({ default: m.PracticeResult })),
)

const OrtuDaftar = lazy(() => import('./areas/parent').then((m) => ({ default: m.OrtuDaftar })))
const OrtuLupaPassword = lazy(() =>
  import('./areas/parent').then((m) => ({ default: m.OrtuLupaPassword })),
)
const OrtuHome = lazy(() => import('./areas/parent').then((m) => ({ default: m.OrtuHome })))
const OrtuRiwayat = lazy(() => import('./areas/parent').then((m) => ({ default: m.OrtuRiwayat })))
const OrtuNilai = lazy(() => import('./areas/parent').then((m) => ({ default: m.OrtuNilai })))
const OrtuPeringkat = lazy(() =>
  import('./areas/parent').then((m) => ({ default: m.OrtuPeringkat })),
)
const OrtuBuatKuis = lazy(() => import('./areas/parent').then((m) => ({ default: m.OrtuBuatKuis })))

const Dashboard = lazy(() => import('./areas/admin').then((m) => ({ default: m.Dashboard })))
const BankSoal = lazy(() => import('./areas/admin').then((m) => ({ default: m.BankSoal })))
const SubjectTopics = lazy(() =>
  import('./areas/admin').then((m) => ({ default: m.SubjectTopics })),
)
const TopicQuestions = lazy(() =>
  import('./areas/admin').then((m) => ({ default: m.TopicQuestions })),
)
const LatihanSoal = lazy(() => import('./areas/admin').then((m) => ({ default: m.LatihanSoal })))
const LatihanForm = lazy(() => import('./areas/admin').then((m) => ({ default: m.LatihanForm })))
const LatihanHasil = lazy(() => import('./areas/admin').then((m) => ({ default: m.LatihanHasil })))
const Laporan = lazy(() => import('./areas/admin').then((m) => ({ default: m.Laporan })))
const SiswaList = lazy(() => import('./areas/admin').then((m) => ({ default: m.SiswaList })))
const TujuanPembelajaran = lazy(() =>
  import('./areas/admin').then((m) => ({ default: m.TujuanPembelajaran })),
)
const InputNilai = lazy(() => import('./areas/admin').then((m) => ({ default: m.InputNilai })))
const RekapNilai = lazy(() => import('./areas/admin').then((m) => ({ default: m.RekapNilai })))
const Peringkat = lazy(() => import('./areas/admin').then((m) => ({ default: m.Peringkat })))
const AdminPengajuanOrtu = lazy(() =>
  import('./areas/admin').then((m) => ({ default: m.AdminPengajuanOrtu })),
)
const AdminParents = lazy(() => import('./areas/admin').then((m) => ({ default: m.AdminParents })))

const MateriStudent = lazy(() =>
  import('./pages/Materi').then((m) => ({
    default: function MateriStudentRoute() {
      return <m.default audience="student" />
    },
  })),
)
const MateriAdmin = lazy(() =>
  import('./pages/Materi').then((m) => ({
    default: function MateriAdminRoute() {
      return <m.default audience="admin" />
    },
  })),
)

function BootScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
      <p className="text-gray-500 text-sm">Memuat...</p>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<any>(null)
  const [isStudent, setIsStudent] = useState(false)
  const [isParent, setIsParent] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let initial = true
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const showBoot = initial
      if (showBoot) setLoading(true)
      setUser(currentUser)
      const pathArea = areaForPath(window.location.pathname)
      const early =
        pathArea === 'student' || pathArea === 'parent' ? [preloadArea(pathArea)] : []
      let student = false
      let parent = false
      let staff = false
      if (currentUser?.email) {
        const email = currentUser.email.toLowerCase()
        try {
          staff = await isStaffEmail(email)
          if (!staff) {
            const [studentSnap, parentSnap] = await Promise.all([
              getDocs(query(collection(db, 'students'), where('email', '==', email))),
              getDocs(query(collection(db, 'parents'), where('email', '==', email))),
            ])
            student = !studentSnap.empty
            parent = !parentSnap.empty
          }
        } catch {
          student = false
          parent = false
        }
      }
      setIsStudent(student)
      setIsParent(parent)

      const isAdminLike = !!currentUser && (staff || (!student && !parent))
      let roleArea: AppArea | null = null
      if (isAdminLike) roleArea = 'admin'
      else if (student) roleArea = 'student'
      else if (parent) roleArea = 'parent'

      const jobs: Promise<unknown>[] = [...early]
      if (roleArea && roleArea !== pathArea) jobs.push(preloadArea(roleArea))
      else if (!currentUser && (pathArea === 'student' || pathArea === 'parent')) {
        /* already in early */
      }
      if (pathNeedsMateri(window.location.pathname)) {
        const onStudentMateri = window.location.pathname.startsWith('/siswa')
        if ((onStudentMateri && (student || isAdminLike)) || (!onStudentMateri && isAdminLike)) {
          jobs.push(preloadMateri())
        }
      }
      try {
        const pending = Promise.all(jobs)
        if (showBoot) await pending
        else void pending.catch(() => {})
      } catch {
        // Jaringan putus: jangan kunci layar "Memuat". Route akan mencoba lagi.
      }
      if (showBoot) {
        initial = false
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  if (loading) return <BootScreen />

  const isAdmin = !!user && !isStudent && !isParent

  const loginRedirect = isAdmin ? <Navigate to="/dashboard" replace /> : <Login />

  const homeRedirect = (
    <Navigate
      to={isAdmin ? '/dashboard' : isStudent ? '/siswa' : isParent ? '/ortu' : '/login'}
      replace
    />
  )

  const parentGuard = (el: ReactNode) => (isParent ? el : <Navigate to="/login?tab=ortu" />)

  return (
    <BrowserRouter>
      <Suspense fallback={<BootScreen />}>
        <Routes>
          <Route path="/kerjakan" element={<SiswaLogin />} />
          <Route path="/siswa" element={<KerjakanEntry />} />
          <Route
            path="/siswa/materi"
            element={isStudent || isAdmin ? <MateriStudent /> : <Navigate to="/login" />}
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
              isAdmin ? (
                <Dashboard />
              ) : (
                <Navigate to={isStudent ? '/siswa' : isParent ? '/ortu' : '/login'} />
              )
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
          <Route path="/input-nilai" element={isAdmin ? <InputNilai /> : <Navigate to="/login" />} />
          <Route path="/rekap-nilai" element={isAdmin ? <RekapNilai /> : <Navigate to="/login" />} />
          <Route path="/materi" element={isAdmin ? <MateriAdmin /> : <Navigate to="/login" />} />
          <Route
            path="/pengajuan-ortu"
            element={isAdmin ? <AdminPengajuanOrtu /> : <Navigate to="/login" />}
          />
          <Route path="/akun-ortu" element={isAdmin ? <AdminParents /> : <Navigate to="/login" />} />

          <Route path="/questions" element={<Navigate to="/bank-soal" replace />} />
          <Route path="/" element={homeRedirect} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
