'use client';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// We gebruiken nu de Vercel Environment Variables in plaats van het JSON bestand
const firebaseConfig = {
//  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
//  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
//  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
//  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, // Voeg deze toe in Vercel
//  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, // Voeg deze toe in Vercel
//  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
// Your web app's Firebase configuration
  apiKey: "AIzaSyA-WsMDV-l15Zsf2J0ePoWtzVbMBIJWb-g",
  authDomain: "gen-lang-client-0518871379.firebaseapp.com",
  projectId: "gen-lang-client-0518871379",
  storageBucket: "gen-lang-client-0518871379.firebasestorage.app",
  messagingSenderId: "604922738963",
  appId: "1:604922738963:web:ce12316d3494cd73fb82e6"  
};
console.log("Config Check:", firebaseConfig.apiKey ? "Sleutel aanwezig" : "Sleutel is LEEG");
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Voor Firestore gebruiken we de standaard database, tenzij je een specifieke ID hebt
export const db = getFirestore(app, "ai-studio-26fd128e-1b0d-4795-b48e-cd67f574941b");
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);
