import React, { useState, useEffect } from 'react';
import { db, firebaseConfig } from '../firebase';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { UserPlus, Trash2, Mail, User, RefreshCw, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

// Initialiseer een 'Secondary App' voor Admin-acties
// Dit voorkomt dat jij als huidige Admin wordt uitgelogd bij het aanmaken van een nieuwe user
const adminApp = !getApps().find(a => a.name === 'AdminTool') 
  ? initializeApp(firebaseConfig, 'AdminTool') 
  : getApp('AdminTool');
const adminAuth = getAuth(adminApp);

const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'zzp' });
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  // 1. Haal de lijst met geautoriseerde gebruikers op uit Firestore
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Fout bij ophalen gebruikers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // 2. Nieuwe gebruiker aanmaken in Auth én Firestore
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: 'info', text: 'Account configureren...' });

    try {
      // Stap A: Maak het account aan in Firebase Auth (via de AdminTool instance)
      const userCredential = await createUserWithEmailAndPassword(
        adminAuth, 
        form.email.trim(), 
        form.password
      );
      
      const uid = userCredential.user.uid;

      // Stap B: Maak het profiel aan in Firestore. 
      // Zonder dit document kan de gebruiker vanaf nu NIET inloggen.
      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        email: form.email.toLowerCase().trim(),
        displayName: form.name,
        role: form.role,
        status: 'active',
        createdAt: new Date().toISOString()
      });

      setStatusMsg({ type: 'success', text: `Succes! ${form.name} kan nu inloggen.` });
      setForm({ email: '', password: '', name: '', role: 'zzp' });
      fetchUsers();
      
      // Secondary auth direct uitloggen om conflicten te vermijden
      await adminAuth.signOut();
      
    } catch (err: any) {
      console.error(err);
      let errorText = "Aanmaken mislukt.";
      if (err.code === 'auth/email-already-in-use') errorText = "Dit e-mailadres heeft al een account.";
      if (err.code === 'auth/weak-password') errorText = "Wachtwoord moet minimaal 6 tekens zijn.";
      
      setStatusMsg({ type: 'error', text: errorText });
    }
  };

  // 3. Verwijder een profiel (hiermee blokkeer je direct hun toegang)
  const handleDelete = async (uid: string, name: string) => {
    if (window.confirm(`LET OP: Als je het profiel van ${name} verwijdert, heeft deze persoon direct GEEN toegang meer tot het portaal. Doorgaan?`)) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        fetchUsers();
        setStatusMsg({ type: 'success', text: 'Toegang voor gebruiker ingetrokken.' });
      } catch (err) {
        alert("Fout bij verwijderen.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
              <ShieldCheck className="text-pink-600 h-9 w-9" />
              User Management
            </h1>
            <p className="text-gray-500 mt-1 font-medium">Beheer wie toegang heeft tot Mijn Zorgzuster</p>
          </div>
          <button 
            onClick={fetchUsers}
            className="p-3 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all active:scale-95"
          >
            <RefreshCw className={`h-5 w-5 text-pink-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Formulier Sectie */}
        <div className="bg-white rounded-3xl shadow-xl shadow-pink-100/20 p-8 border border-gray-100">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800">
            <UserPlus className="h-6 w-6 text-pink-500" />
            Nieuwe ZZP'er Autoriseren
          </h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Naam</label>
              <input 
                className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white outline-none transition-all"
                placeholder="Jan Janssen"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">E-mail</label>
              <input 
                className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white outline-none transition-all"
                placeholder="voorbeeld@mail.com"
                type="email"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Wachtwoord</label>
              <input 
                className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white outline-none transition-all"
                placeholder="******"
                type="password"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Rechten</label>
              <select 
                className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white outline-none transition-all appearance-none"
                value={form.role}
                onChange={e => setForm({...form, role: e.target.value})}
              >
                <option value="zzp">ZZP (Beperkt)</option>
                <option value="admin">Admin (Volledig)</option>
              </select>
            </div>
            <button 
              type="submit"
              className="lg:col-span-4 bg-gray-900 text-white p-4 rounded-xl font-black hover:bg-pink-600 transition-all shadow-lg active:scale-[0.98] mt-2"
            >
              GEBRUIKER TOEGANG VERLENEN
            </button>
          </form>

          {statusMsg.text && (
            <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 border animate-in fade-in slide-in-from-top-2 ${
              statusMsg.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 
              statusMsg.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-blue-50 border-blue-100 text-blue-700'
            }`}>
              {statusMsg.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              <span className="font-bold text-sm">{statusMsg.text}</span>
            </div>
          )}
        </div>

        {/* Gebruikers Tabel */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-white">
            <h2 className="text-xl font-bold text-gray-800">Geautoriseerde Gebruikers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-[0.2em]">
                <tr>
                  <th className="px-8 py-4 font-black">Gebruiker</th>
                  <th className="px-8 py-4 font-black">E-mail</th>
                  <th className="px-8 py-4 font-black">Rol</th>
                  <th className="px-8 py-4 text-right font-black">Toegang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 font-bold">
                          {u.displayName?.charAt(0) || 'U'}
                        </div>
                        <span className="font-bold text-gray-800">{u.displayName}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-gray-500 font-medium">{u.email}</td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => handleDelete(u.uid, u.displayName)}
                        className="text-gray-300 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all"
                        title="Verwijder toegang"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
