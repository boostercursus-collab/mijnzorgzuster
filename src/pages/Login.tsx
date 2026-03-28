import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, signInWithGoogle } from '../firebase'; // Zorg dat db hier ook is geïmporteerd
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../AuthProvider';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';

const Login: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Centraal systeem om te checken of de user in Firestore staat
  const checkUserExists = async (uid: string) => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists();
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoginLoading(true);

    try {
      // 1. Inloggen bij Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // 2. Direct checken of de gebruiker in onze database staat
      const exists = await checkUserExists(userCredential.user.uid);

      if (!exists) {
        // Gebruiker staat niet in Firestore -> Direct uitloggen!
        await signOut(auth);
        setError('Toegang geweigerd. Uw account is niet geactiveerd in dit systeem.');
      } else {
        // Alles OK, de useEffect zal de navigatie afhandelen
        navigate('/');
      }
    } catch (err: any) {
      console.error('Email login failed', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('E-mailadres of wachtwoord is onjuist.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Te veel mislukte pogingen. Probeer het later opnieuw.');
      } else {
        setError('Er is een fout opgetreden bij het inloggen.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      const userCredential = await signInWithGoogle();
      if (userCredential?.user) {
        const exists = await checkUserExists(userCredential.user.uid);
        if (!exists) {
          await signOut(auth);
          setError('Dit Google-account heeft geen toegang tot dit portaal.');
        }
      }
    } catch (error) {
      console.error('Google login failed', error);
      setError('Google login mislukt.');
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center font-medium text-pink-600">Laden...</div>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-md space-y-8 rounded-3xl bg-white p-10 shadow-2xl border border-gray-100">
        <div className="text-center">
          <img
            className="mx-auto h-20 w-auto rounded-xl"
            src="https://mijnzorgzuster.nl/wp-content/uploads/2026/03/cropped-MIJNZORGZUSTER-2.jpg"
            alt="Mijn Zorgzuster"
          />
          <h2 className="mt-6 text-3xl font-black text-gray-900 tracking-tight">
            Welkom terug
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Log in op het zorgportaal
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleEmailLogin}>
          <div className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-gray-200 py-3 pl-10 pr-3 text-gray-900 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 outline-none transition-all"
                placeholder="E-mailadres"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-gray-200 py-3 pl-10 pr-3 text-gray-900 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 outline-none transition-all"
                placeholder="Wachtwoord"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600 border border-red-100 animate-shake">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full rounded-xl bg-pink-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-pink-200 hover:bg-pink-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loginLoading ? 'Controleren...' : 'Inloggen'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-gray-400 font-bold tracking-widest">Of</span></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
        >
          <LogIn className="h-5 w-5 text-pink-600" />
          Google Inloggen
        </button>

        <p className="mt-10 text-center text-xs text-gray-400 font-medium">
          &copy; {new Date().getFullYear()} Mijn Zorgzuster Portaal
        </p>
      </div>
    </div>
  );
};

export default Login;
