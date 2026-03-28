import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle } from '../firebase';
import { useAuth } from '../AuthProvider';
import { LogIn } from 'lucide-react';

const Login: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed', error);
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
            Welkom bij Mijn Zorgzuster
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Log in om uw uren te registreren of te beheren
          </p>
        </div>
        <div className="mt-8">
          <button
            onClick={handleLogin}
            className="group relative flex w-full justify-center rounded-lg border border-transparent bg-pink-600 px-4 py-3 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 transition-all"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <LogIn className="h-5 w-5 text-pink-500 group-hover:text-pink-400" />
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
