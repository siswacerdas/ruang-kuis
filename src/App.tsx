import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './lib/firebase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BankSoal from './pages/BankSoal'
import SubjectTopics from './pages/SubjectTopics'
import TopicQuestions from './pages/TopicQuestions'
import LatihanSoal from './pages/LatihanSoal'
import LatihanForm from './pages/LatihanForm'

function App() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/bank-soal" element={user ? <BankSoal /> : <Navigate to="/login" />} />
        <Route path="/bank-soal/:subjectKey" element={user ? <SubjectTopics /> : <Navigate to="/login" />} />
        <Route path="/bank-soal/:subjectKey/:topicId" element={user ? <TopicQuestions /> : <Navigate to="/login" />} />
        <Route path="/latihan-soal" element={user ? <LatihanSoal /> : <Navigate to="/login" />} />
        <Route path="/latihan-soal/baru" element={user ? <LatihanForm /> : <Navigate to="/login" />} />
        <Route path="/latihan-soal/:id" element={user ? <LatihanForm /> : <Navigate to="/login" />} />
        <Route path="/questions" element={<Navigate to="/bank-soal" replace />} />
        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
