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

// Google Provider setup
export const googleProvider = new GoogleAuthProvider();
// Voeg scopes toe voor betere Google Sign-In
googleProvider.addScope('profile');
googleProvider.addScope('email');
// Set custom parameters voor locale
googleProvider.setCustomParameters({
  'locale': 'nl'
});

// Hulpfuncties voor inloggen/uitloggen
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error: any) {
    console.error('Firebase Google Sign-In Error:', {
      code: error.code,
      message: error.message,
      email: error.email,
      credential: error.credential
    });
    throw error;
  }
};

export const logOut = () => signOut(auth);

export default app;
