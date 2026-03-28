import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          // Gebruiker is bekend in Firestore, laat ze binnen
          setUser(firebaseUser);
          setProfile(userDoc.data() as UserProfile);
        } else if (firebaseUser.email === 'boostercursus@gmail.com') {
          // Uitzondering: Hoofd-admin mag altijd een profiel aanmaken als het ontbreekt
          const adminProfile: UserProfile = {
            uid: firebaseUser.uid,
            firstName: 'Hoofd',
            lastName: 'Admin',
            email: firebaseUser.email,
            role: 'admin',
          };
          await setDoc(userRef, adminProfile);
          setUser(firebaseUser);
          setProfile(adminProfile);
        } else {
          // GEBRUIKER BESTAAT NIET IN DATABASE -> Toegang weigeren
          console.warn("Toegang geweigerd: Gebruiker niet gevonden in Firestore.");
          await signOut(auth);
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};
