import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Calendar, List, Save, CheckCircle, Trash2, CheckCircle2 } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const [view, setView] = useState<'list' | 'week'>('list');
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedZzpUid, setSelectedZzpUid] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [weekHours, setWeekHours] = useState<{ [key: string]: string }>({
    '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': ''
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const profile = { uid: user.uid, ...userDoc.data() } as UserProfile;
      setUserProfile(profile);
      if (profile.role !== 'admin') setSelectedZzpUid(user.uid);

      const isAdmin = profile.role === 'admin';
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', user.uid), orderBy('date', 'desc'));

      const [regSnap, assignSnap, usersSnap] = await Promise.all([
        getDocs(regQuery),
        getDocs(collection(db, 'assignments')),
        isAdmin ? getDocs(collection(db, 'users')) : Promise.resolve({ docs: [] })
      ]);

      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
      if (isAdmin) setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    } catch (err) {
      console.error("Fout bij laden:", err);
    } finally {
      setLoading(false);
    }
  };

  // BULK GOEDKEUREN FUNCTIE
  const handleBulkApprove = async () => {
    const pendingRegs = registrations.filter(r => r.status === 'pending');
    if (pendingRegs.length === 0) return;
    
    if (!window.confirm(`Weet je zeker dat je alle ${pendingRegs.length} registraties in één keer wilt goedkeuren?`)) return;

    const batch = writeBatch(db);
    const now = new Date().toISOString();

    pendingRegs.forEach(reg => {
      const regRef = doc(db, 'timeRegistrations', reg.id);
      batch.update(regRef, {
        status: 'approved',
        approvedAt: now,
        approvedBy: auth.currentUser?.uid
      });
    });

    try {
      await batch.commit();
      setRegistrations(prev => prev.map(r => ({ ...r, status: 'approved' })));
      alert("Alle uren zijn goedgekeurd!");
    } catch (err) {
      alert("Bulk goedkeuren mislukt.");
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const regRef = doc(db, 'timeRegistrations', id);
      await updateDoc(regRef, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: auth.currentUser?.uid
      });
      setRegistrations(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));
    } catch (err) {
      alert("Goedkeuren mislukt.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Verwijderen?")) return;
    try {
      await deleteDoc(doc(db, 'timeRegistrations', id));
      setRegistrations(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert("Fout bij verwijderen.");
    }
  };

  const isAdmin = userProfile?.role === 'admin';
  const hasPending = registrations.some(r => r.status === 'pending');

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Urenregistratie</h1>
          <p className="text-gray-500 font-medium">Beheer uren en keur ze goed voor facturatie.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* BULK BUTTON */}
          {isAdmin && view === 'list' && hasPending && (
            <button 
              onClick={handleBulkApprove}
              className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl font-black text-sm hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 shadow-sm"
            >
              <CheckCircle2 size={18} />
              Alles Goedkeuren
            </button>
          )}

          <div className="flex bg-white p-1 rounded-2xl shadow-sm border">
            <button onClick={() => setView('list')} className={`px-4 py-2 rounded-xl transition-all ${view === 'list' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>
              <List size={20} />
            </button>
            <button onClick={() => setView('week')} className={`px-4 py-2 rounded-xl transition-all ${view === 'week' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>
              <Calendar size={20} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600">Gegevens ophalen...</div>
      ) : view === 'week' ? (
        <div className="bg-white rounded-[2.5rem] p-10 border shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
           {/* ... (Week-Grid code blijft hetzelfde als vorige versie) ... */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isAdmin && (
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block">ZZP'er</label>
                <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none" value={selectedZzpUid} onChange={(e) => { setSelectedZzpUid(e.target.value); setSelectedAssignmentId(''); }}>
                  <option value="">Selecteer ZZP'er...</option>
                  {allUsers.filter(u => u.role === 'zzp').map(u => (
                    <option key={u.uid} value={u.uid}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block">Actieve Opdracht</label>
              <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none" disabled={!selectedZzpUid} value={selectedAssignmentId} onChange={(e) => setSelectedAssignmentId(e.target.value)}>
                <option value="">{selectedZzpUid ? 'Kies opdracht...' : 'Selecteer eerst een ZZP\'er'}</option>
                {assignments.filter(a => a.uid === selectedZzpUid).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-4">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
              const dayDate = addDays(currentWeekStart, dayIndex);
              return (
                <div key={dayIndex} className="text-center space-y-2">
                  <div className="text-[10px] font-black text-gray-400 uppercase">{format(dayDate, 'eee', { locale: nl })}</div>
                  <div className="text-lg font-black">{format(dayDate, 'd')}</div>
                  <input type="number" step="0.5" placeholder="0" className="w-full p-4 bg-gray-50 rounded-2xl text-center font-black focus:ring-2 focus:ring-pink-600 outline-none transition-all" value={weekHours[dayIndex]} onChange={(e) => setWeekHours({...weekHours, [dayIndex]: e.target.value})} />
                </div>
              );
            })}
          </div>
          <button onClick={async () => {
             const batch = writeBatch(db);
             let hasData = false;
             Object.entries(weekHours).forEach(([index, hours]) => {
               if (Number(hours) > 0) {
                 hasData = true;
                 const date = format(addDays(currentWeekStart, parseInt(index)), 'yyyy-MM-dd');
                 batch.set(doc(collection(db, 'timeRegistrations')), {
                   uid: selectedZzpUid, assignmentId: selectedAssignmentId, date, duration: Number(hours), status: 'pending', createdAt: new Date().toISOString()
                 });
               }
             });
             if (hasData) { await batch.commit(); alert("Opgeslagen!"); setWeekHours({'0':'','1':'','2':'','3':'','4':'','5':'','6':''}); fetchInitialData(); }
          }} className="w-full bg-[#111827] text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all">
            <Save size={20} /> Weekoverzicht Opslaan
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-5">Datum</th>
                {isAdmin && <th className="px-8 py-5">ZZP'er</th>}
                <th className="px-8 py-5 text-right">Uren</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {registrations.map(reg => {
                const zzp = allUsers.find(u => u.uid === reg.uid);
                return (
                  <tr key={reg.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-8 py-5 font-medium">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    {isAdmin && <td className="px-8 py-5 font-bold text-pink-600">{zzp ? `${zzp.firstName} ${zzp.lastName}` : 'ZZP'}</td>}
                    <td className="px-8 py-5 text-right font-black">{reg.duration}u</td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${reg.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {reg.status === 'approved' ? 'Akkoord' : 'Wachtend'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right flex justify-end gap-2">
                      {isAdmin && reg.status === 'pending' && (
                        <button onClick={() => handleApprove(reg.id)} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all">
                          <CheckCircle size={18} />
                        </button>
                      )}
                      {reg.status !== 'approved' && (
                        <button onClick={() => handleDelete(reg.id)} className="p-2 text-gray-400 hover:text-red-600">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;
