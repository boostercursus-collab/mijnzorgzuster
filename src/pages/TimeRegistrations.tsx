import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Plus, Calendar, List, Trash2, Edit2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'list' | 'timesheet'>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    assignmentId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    duration: '',
    description: '',
    uid: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      // 1. Haal profiel en rol op
      const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
      const profile = userSnap.docs[0]?.data() as UserProfile;
      setUserProfile(profile);
      const isAdmin = profile?.role === 'admin';

      // 2. Queries op basis van rol
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', user.uid), orderBy('date', 'desc'));

      const assignQuery = isAdmin
        ? collection(db, 'assignments')
        : query(collection(db, 'assignments'), where('uid', '==', user.uid));

      const [regSnap, assignSnap, usersSnap] = await Promise.all([
        getDocs(regQuery),
        getDocs(assignQuery),
        isAdmin ? getDocs(collection(db, 'users')) : Promise.resolve({ docs: [] })
      ]);

      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
      
      if (isAdmin) {
        setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      }
    } catch (err) {
      console.error("Data fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      if (!user) return;

      const dataToSave = {
        ...formData,
        duration: Number(formData.duration),
        uid: userProfile?.role === 'admin' && formData.uid ? formData.uid : user.uid,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'timeRegistrations'), dataToSave);
      setIsModalOpen(false);
      setFormData({ assignmentId: '', date: format(new Date(), 'yyyy-MM-dd'), duration: '', description: '', uid: '' });
      fetchData();
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const isAdmin = userProfile?.role === 'admin';

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Urenregistratie</h1>
          <p className="text-gray-500 font-medium">Overzicht van gewerkte uren.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
            <button onClick={() => setView('list')} className={`p-2 rounded-lg transition-all ${view === 'list' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>
              <List size={20} />
            </button>
            <button onClick={() => setView('timesheet')} className={`p-2 rounded-lg transition-all ${view === 'timesheet' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>
              <Calendar size={20} />
            </button>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#111827] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-lg"
          >
            <Plus size={20} /> <span>Uren</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-20 text-center font-bold text-pink-600">Laden...</div>
      ) : view === 'list' ? (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-5">Datum</th>
                {isAdmin && <th className="px-8 py-5">ZZP'er</th>}
                <th className="px-8 py-5">Opdracht</th>
                <th className="px-8 py-5">Uren</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {registrations.map(reg => (
                <tr key={reg.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-8 py-5 font-medium">{format(new Date(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                  {isAdmin && (
                    <td className="px-8 py-5 font-bold text-pink-600">
                      {allUsers.find(u => u.uid === reg.uid)?.firstName || 'ZZP'}
                    </td>
                  )}
                  <td className="px-8 py-5 text-gray-600">{assignments.find(a => a.id === reg.assignmentId)?.title || 'Onbekend'}</td>
                  <td className="px-8 py-5 font-black">{reg.duration}u</td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${reg.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {reg.status === 'approved' ? 'Akkoord' : 'Wachtend'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right flex justify-end gap-2">
                    <button onClick={async () => { if(window.confirm('Verwijderen?')) { await deleteDoc(doc(db, 'timeRegistrations', reg.id)); fetchData(); } }} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Eenvoudige Timesheet weergave */
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 text-center">
          <Calendar className="mx-auto text-gray-200 mb-4" size={48} />
          <h3 className="text-xl font-black">Timesheet Modus</h3>
          <p className="text-gray-500">De wekelijkse invoer wordt geoptimaliseerd. Gebruik voor nu de Lijstweergave.</p>
        </div>
      )}

      {/* MODAL VOOR NIEUWE UREN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Uren Registreren</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-black"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isAdmin && (
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-1 block">ZZP'er (Admin optie)</label>
                  <select required className="w-full p-4 bg-gray-50 rounded-xl font-bold" value={formData.uid} onChange={e => setFormData({...formData, uid: e.target.value})}>
                    <option value="">Selecteer ZZP'er...</option>
                    {allUsers.filter(u => u.role === 'zzp').map(u => <option key={u.uid} value={u.uid}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Opdracht</label>
                <select required className="w-full p-4 bg-gray-50 rounded-xl font-bold" value={formData.assignmentId} onChange={e => setFormData({...formData, assignmentId: e.target.value})}>
                  <option value="">Kies opdracht...</option>
                  {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Datum</label>
                  <input type="date" required className="w-full p-4 bg-gray-50 rounded-xl font-bold" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Aantal Uren</label>
                  <input type="number" step="0.5" required className="w-full p-4 bg-gray-50 rounded-xl font-bold" placeholder="0.0" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} />
                </div>
              </div>
              <button type="submit" className="w-full bg-pink-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-pink-700 transition-all mt-4">
                Opslaan
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;
