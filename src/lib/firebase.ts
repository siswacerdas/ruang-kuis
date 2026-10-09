import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBkngPFqJxVPSg3ho6mUJPFAGOJRJH2iIw",
  authDomain: "ruang-kuis.firebaseapp.com",
  projectId: "ruang-kuis",
  storageBucket: "ruang-kuis.firebasestorage.app",
  messagingSenderId: "100863080781",
  appId: "1:100863080781:web:138755897edc0a8b755f04"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);
export { firebaseConfig };

/**
 * Storage SDK hanya diunduh saat guru mengunggah gambar stimulus.
 * Jangan impor `firebase/storage` di sini — itu menarik ~puluhan KB ke halaman siswa.
 */
let storagePromise: Promise<import("firebase/storage").FirebaseStorage> | null = null;

export function getAppStorage() {
  if (!storagePromise) {
    storagePromise = import("firebase/storage").then(({ getStorage }) => getStorage(app));
  }
  return storagePromise;
}
