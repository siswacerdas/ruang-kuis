import { initializeApp } from "firebase/app";
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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
