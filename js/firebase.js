import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, getCountFromServer, query, where, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";

export const configured = !String(firebaseConfig.apiKey).startsWith("ISI");
export let db = null;
export let auth = null;
if (configured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp,
  getCountFromServer, query, where, writeBatch, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
};

/** Ambil seluruh dokumen sebuah koleksi sebagai array [{id, ...data}] */
export async function listCol(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Buat akun Auth baru TANPA mengeluarkan admin yang sedang login (memakai instance Firebase kedua). */
export async function createStaffAccount(email, password) {
  const sec = initializeApp(firebaseConfig, "secondary-" + Date.now());
  const a = getAuth(sec);
  try {
    const cred = await createUserWithEmailAndPassword(a, email, password);
    return cred.user.uid;
  } finally {
    try { await signOut(a); } catch {}
    try { await deleteApp(sec); } catch {}
  }
}
