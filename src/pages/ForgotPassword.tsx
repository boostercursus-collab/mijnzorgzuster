import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import logo from '../pages/MIJNZORGZUSTER.jpg';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      // Controleer of het e-mailadres geldig is
      if (!email || !email.includes('@')) {
        setError('Voer een geldig e-mailadres in.');
        setLoading(false);
        return;
      }

      // Roep Cloud Function aan in plaats van direct Firestore te queryen
      // Dit is veiliger omdat de server de gebruiker verifieert
      const response = await fetch('/api/resetPassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase() })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Er is een fout opgetreden.');
        setLoading(false);
        return;
      }

      // Toon succesmelding
      setSuccess(true);
      setEmail('');

      // Stuur terug naar login na 5 seconden
      setTimeout(() => {
        navigate('/login');
      }, 5000);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError('Er is een fout opgetreden. Probeer het later opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-md space-y-8 rounded-3xl bg-white p-10 shadow-2xl border border-gray-100">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-pink-600 hover:text-pink-700 text-sm font-semibold mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar inloggen
        </button>

        <div className="text-center">
          <img
            className="mx-auto h-20 w-auto rounded-xl object-contain"
            src={logo}
            alt="Mijn Zorgzuster"
          />
          <h2 className="mt-6 text-3xl font-black text-gray-900 tracking-tight">
            Wachtwoord vergeten?
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Voer uw e-mailadres in om een resetlink te ontvangen
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-green-50 p-4 border border-green-200">
              <CheckCircle className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
              <div className="text-sm text-green-700">
                <p className="font-semibold mb-1">Verificatie-email verzonden!</p>
                <p>
                  Controleer uw inbox op een e-mail met instructies om uw wachtwoord opnieuw in te stellen.
                  U wordt in 5 seconden teruggestuurd naar het inlogscherm.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={handleForgotPassword}>
            <div className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-gray-200 py-3 pl-10 pr-3 text-gray-900 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 outline-none transition-all"
                  placeholder="uw@email.com"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600 border border-red-100">
                <AlertCircle className="h-5 w-5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-pink-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-pink-200 hover:bg-pink-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Verzenden...' : 'Resetlink verzenden'}
            </button>
          </form>
        )}

        <p className="mt-10 text-center text-xs text-gray-400 font-medium">
          &copy; {new Date().getFullYear()} Mijn Zorgzuster Portaal
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
