import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Calendar, List, Save, CheckCircle, Trash2, CheckCircle2 } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const [view, setView] = useState<'list' | 'week'>('list');
  const [currentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
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
      // 1. Haal profiel en ZZP'ers tegelijk op voor snelheid
      const [userDoc, usersSnap, assignSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDocs(query(collection(db, 'users'), where('role', '==', 'zzp'))),
        getDocs(collection(db, 'assignments'))
      ]);

      const profile = { uid: user.uid, ...userDoc.data() } as UserProfile;
      const zzpList = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      
      setUserProfile(profile);
      setAllUsers(zzpList);
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));

      const isAdmin = profile.role === 'admin';

      // 2. Selectie logica voor dropdown
      if (!isAdmin) {
        setSelectedZzpUid(user.uid);
      }

      // 3. Haal registraties op
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', user.uid), orderBy('date', 'desc'));

      const regSnap = await getDocs(regQuery);
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));

    } catch (err) {
      console.error("Fout bij laden van data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    const pendingRegs = registrations.filter(r => r.status === 'pending');
    if (pendingRegs.length === 0) return;
    if (!window.confirm(`Alle ${pendingRegs.length} uren goedkeuren?`)) return;

    const batch = writeBatch(db);
    pendingRegs.forEach(reg => {
      batch.update(doc(db, 'timeRegistrations', reg.id), {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: auth.currentUser?.uid
      });
    });

    try {
      await batch.commit();
      setRegistrations(prev => prev.map(r => ({ ...r, status: 'approved' })));
    } catch (err) { alert("Bulk fout."); }
  };

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'timeRegistrations', id), {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: auth.currentUser?.uid
      });
      setRegistrations(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));
    } catch (err) { alert("Fout."); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Verwijderen?")) return;
    try {
      await deleteDoc(doc(db, 'timeRegistrations', id));
      setRegistrations(prev => prev.filter(r => r.id !== id));
    } catch (err) { alert("Fout."); }
  };

  const isAdmin = userProfile?.role === 'admin';
  const hasPending = registrations.some(r => r.status === 'pending');

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase">Urenregistratie</h1>
          <p className="text-gray-500 font-medium text-lg">Beheer en keur uren goed voor facturatie.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {isAdmin && view === 'list' && hasPending && (
            <button onClick={handleBulkApprove} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl font-black text-sm hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 shadow-sm">
              <CheckCircle2 size={18} /> Alles Goedkeuren
            </button>
          )}

          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
            <button onClick={() => setView('list')} className={`px-5 py-2.5 rounded-xl transition-all ${view === 'list' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>
              <List size={20} />
            </button>
            <button onClick={() => setView('week')} className={`px-5 py-2.5 rounded-xl transition-all ${view === 'week' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>
              <Calendar size={20} />
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600 animate-pulse tracking-widest uppercase">Data synchroniseren...</div>
      ) : view === 'week' ? (
        <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm space-y-10 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">ZZP'er</label>
              <select 
                className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none transition-all" 
                value={selectedZzpUid} 
                onChange={(e) => { setSelectedZzpUid(e.target.value); setSelectedAssignmentId(''); }}
                disabled={!isAdmin}
              >
                {isAdmin ? (
                  <>
                    <option value="">Selecteer ZZP'er...</option>
                    {allUsers.map(u => (
                      <option key={u.uid} value={u.uid}>{u.firstName} {u.lastName}</option>
                    ))}
                  </>
                ) : (
                  <option value={userProfile?.uid}>{userProfile?.firstName} {userProfile?.lastName}</option>
                )}
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Actieve Opdracht</label>
              <select 
                className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none transition-all disabled:opacity-50" 
                disabled={!selectedZzpUid} 
                value={selectedAssignmentId} 
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
              >
                <option value="">{selectedZzpUid ? 'Kies opdracht...' : 'Selecteer eerst een ZZP\'er'}</option>
                {assignments.filter(a => a.uid === selectedZzpUid).map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
              const dayDate = addDays(currentWeekStart, dayIndex);
              return (
                <div key={dayIndex} className="text-center space-y-3 bg-gray-50/50 p-4 rounded-[2rem] border border-transparent hover:border-pink-100 transition-all">
                  <div className="text-[10px] font-black text-gray-400 uppercase">{format(dayDate, 'eeee', { locale: nl })}</div>
                  <div className="text-2xl font-black text-gray-900">{format(dayDate, 'd')}</div>
                  <input type="number" step="0.5" placeholder="0" className="w-full p-4 bg-white rounded-2xl text-center font-black focus:ring-2 focus:ring-pink-600 outline-none shadow-sm" value={weekHours[dayIndex]} onChange={(e) => setWeekHours({...weekHours, [dayIndex]: e.target.value})} />
                </div>
              );
            })}
          </div>

          <button 
            disabled={!selectedAssignmentId}
            onClick={async () => {
              const batch = writeBatch(db);
              let hasData = false;
              Object.entries(weekHours).forEach(([index, hours]) => {
                if (parseFloat(hours) > 0) {
                  hasData = true;
                  const date = format(addDays(currentWeekStart, parseInt(index)), 'yyyy-MM-dd');
                  batch.set(doc(collection(db, 'timeRegistrations')), {
                    uid: selectedZzpUid, assignmentId: selectedAssignmentId, date, duration: parseFloat(hours), status: 'pending', createdAt: new Date().toISOString()
                  });
                }
              });
              if (hasData) { 
                await batch.commit(); 
                alert("Weekoverzicht opgeslagen!"); 
                setWeekHours({'0':'','1':'','2':'','3':'','4':'','5':'','6':''}); 
                fetchInitialData(); 
              }
            }} 
            className="w-full bg-[#111827] text-white py-6 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl disabled:opacity-20 uppercase tracking-widest"
          >
            <Save size={20} /> Weekoverzicht Opslaan
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-6">Datum</th>
                {isAdmin && <th className="px-8 py-6">ZZP'er</th>}
                <th className="px-8 py-6 text-right">Uren</th>
                <th className="px-8 py-6">Status</th>
                <th className="px-8 py-6 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {registrations.map(reg => {
                const zzp = allUsers.find(u => u.uid === reg.uid);
                return (
                  <tr key={reg.id} className="hover:bg-gray-50/30 transition-colors">
                    <td className="px-8 py-5 font-bold text-gray-700">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    {isAdmin && (
                      <td className="px-8 py-5">
                        <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full text-[11px] font-black">
                          {zzp ? `${zzp.firstName} ${zzp.lastName}` : 'Laden...'}
                        </span>
                      </td>
                    )}
                    <td className="px-8 py-5 text-right font-black text-gray-900">{reg.duration}u</td>
                    <td className="px-8 py-5 text-[10px] font-black uppercase tracking-wider">
                      <span className={reg.status === 'approved' ? 'text-emerald-600' : 'text-orange-600'}>
                        {reg.status === 'approved' ? 'Akkoord' : 'Wachtend'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right flex justify-end gap-3">
                      {isAdmin && reg.status === 'pending' && (
                        <button onClick={() => handleApprove(reg.id)} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 transition-all shadow-sm">
                          <CheckCircle size={18} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(reg.id)} className="p-2.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                        <Trash2 size={18} />
                      </button>
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
