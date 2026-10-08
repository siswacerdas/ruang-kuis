import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

/** Tulis notifikasi admin saat siswa selesai kuis (latihan guru). */
export async function notifyAdminStudentAttempt(opts: {
  studentName: string
  studentClass?: string
  latihanTitle: string
  percent: number
  score: number
  total: number
  attemptId: string
}): Promise<void> {
  try {
    const classLabel = opts.studentClass ? ` · ${opts.studentClass}` : ''
    await addDoc(collection(db, 'adminNotifications'), {
      type: 'student_attempt',
      title: `${opts.studentName} selesai kuis`,
      body: `${opts.latihanTitle}${classLabel} · skor ${opts.percent}% (${opts.score}/${opts.total})`,
      refCollection: 'attempts',
      refId: opts.attemptId,
      read: false,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.warn('notifyAdminStudentAttempt', err)
  }
}
