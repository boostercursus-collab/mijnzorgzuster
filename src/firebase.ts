'use client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// We exporteren de config ook los zodat het AdminPanel deze kan gebruiken voor de Secondary App
export const firebaseConfig = {
  apiKey: "AIzaSyA-WsMDV-l15Zsf2J0ePoWtzVbMBIJWb-g",
  authDomain: "gen-lang-client-0518871379.firebaseapp.com",
  projectId: "gen-lang-client-0518871379",
  storageBucket: "gen-lang-client-0518871379.firebasestorage.app",
  messagingSenderId: "604922738963",
  appId: "1:604922738963:web:ce12316d3494cd73fb82e6"  
};

// Initialiseer Firebase (voorkom dubbele initialisatie in Next.js/React)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Core exports
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-26fd128e-1b0d-4795-b48e-cd67f574941b");
export const googleProvider = new GoogleAuthProvider();

// Hulpfuncties voor inloggen/uitloggen
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);

export default app;
