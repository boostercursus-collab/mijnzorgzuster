import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, signInWithGoogle } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '../AuthProvider';
import { LogIn, Mail, Lock } from 'lucide-react';

const Login: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // States voor email/wachtwoord login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  React.useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Handmatige login met e-mail/wachtwoord
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoginLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error('Email login failed', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Ongeldig e-mailadres of wachtwoord.');
      } else {
        setError('Inloggen mislukt. Probeer het later opnieuw.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Google login failed', error);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Laden...</div>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-10 shadow-xl">
        <div className="text-center">
          <img
            className="mx-auto h-24 w-auto"
            src="https://mijnzorgzuster.nl/wp-content/uploads/2026/03/cropped-MIJNZORGZUSTER-2.jpg"
            alt="Mijn Zorgzuster"
          />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Mijn Zorgzuster
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Log in met uw accountgegevens
          </p>
        </div>

        {/* Formulier voor E-mail/Wachtwoord */}
        <form className="mt-8 space-y-6" onSubmit={handleEmailLogin}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 placeholder-gray-500 focus:border-pink-500 focus:outline-none focus:ring-pink-500 sm:text-sm"
                placeholder="E-mailadres"
              />
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 placeholder-gray-500 focus:border-pink-500 focus:outline-none focus:ring-pink-500 sm:text-sm"
                placeholder="Wachtwoord"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loginLoading}
              className="flex w-full justify-center rounded-lg bg-pink-600 px-4 py-3 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all disabled:opacity-50"
            >
              {loginLoading ? 'Bezig met inloggen...' : 'Inloggen'}
            </button>
          </div>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">Of ga verder met</span>
          </div>
        </div>

        <div>
          <button
            onClick={handleGoogleLogin}
            className="group relative flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <LogIn className="h-5 w-5 text-gray-400 group-hover:text-pink-500" />
            </span>
            Inloggen met Google
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Mijn Zorgzuster. Alle rechten voorbehouden.
        </div>
      </div>
    </div>
  );
};

export default Login;
