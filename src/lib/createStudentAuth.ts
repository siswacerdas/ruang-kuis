import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { firebaseConfig } from './firebase'

/**
 * Buat akun Firebase Auth tanpa mengubah session admin yang sedang login.
 * Memakai secondary Firebase app instance.
 */
export async function createStudentAuthAccount(
  email: string,
  password: string
): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`)
  try {
    const secondaryAuth = getAuth(secondary)
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email.trim().toLowerCase(),
      password
    )
    await signOut(secondaryAuth)
    return cred.user.uid
  } finally {
    await deleteApp(secondary)
  }
}
