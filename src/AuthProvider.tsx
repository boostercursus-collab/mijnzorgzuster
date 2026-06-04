import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, UserRole, AuthContextType } from './types';

// ALLEEN deze emails zijn hardcoded admin (boostercursus@gmail.com is verwijderd!)
const HARDCODED_ADMINS = [
  'abdelbouda@gmail.com',
  'imane-bouda@hotmail.com'
];

// Maak de context aan met default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  loading: true,
  isAuthReady: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[AuthProvider] Auth state changed:', firebaseUser?.email || 'Geen gebruiker');
      
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        const userEmail = firebaseUser.email || '';
        const isHardcodedAdmin = HARDCODED_ADMINS.includes(userEmail);

        // Bepaal de role (prioriteit: hardcoded admin > Firestore)
        let userRole: UserRole | null = null;
        let userProfile: UserProfile | null = null;

        // EERST checken of het een hardcoded admin is
        if (isHardcodedAdmin) {
          userRole = 'admin';
          console.log(`[AuthProvider] ${userEmail} is hardcoded admin`);
          
          // Haal of maak Firestore document
          if (userDoc.exists()) {
            userProfile = userDoc.data() as UserProfile;
            // Zorg dat role in Firestore ook admin is
            if (userProfile.role !== 'admin') {
              await setDoc(userRef, { ...userProfile, role: 'admin' }, { merge: true });
              userProfile.role = 'admin';
            }
          } else {
            // Maak nieuw admin profiel aan
            userProfile = {
              uid: firebaseUser.uid,
              firstName: 'Admin',
              lastName: 'Gebruiker',
              email: userEmail,
              role: 'admin',
              displayName: 'Admin Gebruiker',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await setDoc(userRef, userProfile);
          }
        } 
        // Geen hardcoded admin -> check Firestore
        else if (userDoc.exists()) {
          userProfile = userDoc.data() as UserProfile;
          userRole = userProfile.role === 'admin' ? 'admin' : 'zzp';
          console.log(`[AuthProvider] ${userEmail} heeft role: ${userRole} (uit Firestore)`);
        }
        
        // Toegang verlenen of weigeren
        if (userProfile !== null && userRole !== null) {
          setUser(firebaseUser);
          setProfile(userProfile);
          setRole(userRole);
          console.log(`[AuthProvider] ✅ Toegang verleend voor ${userEmail} als ${userRole}`);
        } else {
          // Geen profiel en geen hardcoded admin -> toegang weigeren
          console.warn(`[AuthProvider] ❌ Toegang geweigerd: ${userEmail} niet gevonden in Firestore users collectie`);
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setRole(null);
        }
      } else {
        // Geen ingelogde gebruiker
        console.log('[AuthProvider] Geen gebruiker ingelogd');
        setUser(null);
        setProfile(null);
        setRole(null);
      }
      
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;