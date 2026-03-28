import React, { useState, useEffect } from 'react';
import { db, firebaseConfig } from '../firebase';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { UserPlus, Trash2, Mail, User, RefreshCw, ShieldCheck } from 'lucide-react';

// Initialiseer een 'Secondary App' voor Admin-acties
// Dit voorkomt dat de huidige Admin (jij) wordt uitgelogd bij het aanmaken van een nieuwe gebruiker
const adminApp = !getApps().find(a => a.name === 'AdminTool') 
  ? initializeApp(firebaseConfig, 'AdminTool') 
  : getApp('AdminTool');
const adminAuth = getAuth(adminApp);

const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'zzp' });
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  // 1. Haal de lijst met alle gebruikers op
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => d.data()));
    } catch (err) {
      console.error("Fout bij ophalen gebruikers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // 2. Nieuwe ZZP'er of Admin aanmaken
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ type: 'info', text: 'Bezig met aanmaken...' });

    try {
      // Stap A: Maak het account aan in Firebase Auth via de AdminTool instance
      const userCredential = await createUserWithEmailAndPassword(
        adminAuth, 
        form.email, 
        form.password
      );
      
      const uid = userCredential.user.uid;

      // Stap B: Maak het profiel aan in de 'users' collectie in Firestore
      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        email: form.email.toLowerCase(),
        displayName: form.name,
        role: form.role,
        status: 'active',
        createdAt: new Date().toISOString()
      });

      setStatusMsg({ type: 'success', text: `Account voor ${form.name} is succesvol aangemaakt!` });
      setForm({ email: '', password: '', name: '', role: 'zzp' });
      fetchUsers();
      
      // Optioneel: Log de secondary auth direct weer uit om schoon te blijven
      await adminAuth.signOut();
      
    } catch (err: any) {
      console.error(err);
      let errorText = "Er is iets misgegaan.";
      if (err.code === 'auth/email-already-in-use') errorText = "Dit e-mailadres is al in gebruik.";
      if (err.code === 'auth/weak-password') errorText = "Wachtwoord moet minimaal 6 tekens bevatten.";
      
      setStatusMsg({ type: 'error', text: errorText });
    }
  };

  // 3. Verwijder een profiel uit de database
  const handleDelete = async (uid: string, name: string) => {
    if (window.confirm(`Weet je zeker dat je het profiel van ${name} wilt verwijderen?`)) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        fetchUsers();
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
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <ShieldCheck className="text-pink-600 h-8 w-8" />
              Beheerpaneel
            </h1>
            <p className="text-gray-500 mt-1 text-sm">Beheer hier de toegang voor ZZP'ers en Admins</p>
          </div>
          <button 
            onClick={fetchUsers}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all shadow-sm"
          >
            <RefreshCw className={`h-5 w-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Formulier Sectie */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-pink-500" />
            Nieuwe Gebruiker Toevoegen
          </h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <input 
              className="p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none transition-all"
              placeholder="Volledige Naam"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              required
            />
            <input 
              className="p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none transition-all"
              placeholder="E-mailadres"
              type="email"
              value={form.email}
              onChange={e => setForm({...form, email: e.target.value})}
              required
            />
            <input 
              className="p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none transition-all"
              placeholder="Wachtwoord (min. 6)"
              type="password"
              value={form.password}
              onChange={e => setForm({...form, password: e.target.value})}
              required
            />
            <select 
              className="p-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-pink-500 outline-none transition-all"
              value={form.role}
              onChange={e => setForm({...form, role: e.target.value})}
            >
              <option value="zzp">Rol: ZZP</option>
              <option value="admin">Rol: Admin</option>
            </select>
            <button 
              type="submit"
              className="lg:col-span-4 bg-pink-600 text-white p-3 rounded-xl font-bold hover:bg-pink-700 transition-all shadow-lg shadow-pink-200 active:scale-95"
            >
              Gebruiker Registreren
            </button>
          </form>
          {statusMsg.text && (
            <div className={`mt-4 p-3 rounded-lg text-center text-sm font-medium ${
              statusMsg.type === 'success' ? 'bg-green-50 text-green-700' : 
              statusMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
            }`}>
              {statusMsg.text}
            </div>
          )}
        </div>

        {/* Gebruikers Lijst */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold">Geregistreerde Gebruikers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Naam</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Rol</th>
                  <th className="px-6 py-4 text-right">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.uid} className="hover:bg-pink-50/30 transition-colors group">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="h-8 w-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600">
                        <User className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-gray-700">{u.displayName}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(u.uid, u.displayName)}
                        className="text-gray-300 hover:text-red-600 transition-colors p-2"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && !loading && (
            <div className="p-10 text-center text-gray-400">Geen gebruikers gevonden.</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default AdminPanel;
