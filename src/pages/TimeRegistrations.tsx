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
      
      // Als de gebruiker een ZZP'er is, zet zijn eigen UID alvast vast
      if (profile.role !== 'admin') {
        setSelectedZzpUid(user.uid);
      }

      const isAdmin = profile.role === 'admin';
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', user.uid), orderBy('date', 'desc'));

      const [regSnap, assignSnap, usersSnap] = await Promise.all([
        getDocs(regQuery),
        getDocs(collection(db, 'assignments')),
        getDocs(collection(db, 'users')) // Altijd users ophalen voor namen in de lijst
      ]);

      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
      setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    } catch (err) {
      console.error("Fout bij laden:", err);
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Urenregistratie</h1>
          <p className="text-gray-500 font-medium text-lg mt-1">Beheer uren en keur ze goed voor facturatie.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {isAdmin && view === 'list' && hasPending && (
            <button 
              onClick={handleBulkApprove}
              className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl font-black text-sm hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 shadow-sm"
            >
              <CheckCircle2 size={18} />
              Alles Goedkeuren
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
      </div>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase tracking-widest">Gegevens ophalen...</div>
      ) : view === 'week' ? (
        <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* ZZP SELECTIE (Nu gevuld met alle ZZP'ers voor Admin) */}
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3 block ml-2">ZZP'er</label>
              <select 
                className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none transition-all appearance-none" 
                value={selectedZzpUid} 
                onChange={(e) => { setSelectedZzpUid(e.target.value); setSelectedAssignmentId(''); }}
                disabled={!isAdmin}
              >
                {!isAdmin ? (
                   <option value={userProfile?.uid}>{userProfile?.firstName} {userProfile?.lastName}</option>
                ) : (
                  <>
                    <option value="">Selecteer ZZP'er...</option>
                    {allUsers.filter(u => u.role === 'zzp').map(u => (
                      <option key={u.uid} value={u.uid}>{u.firstName} {u.lastName}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* OPDRACHT SELECTIE */}
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3 block ml-2">Actieve Opdracht</label>
              <select 
                className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none transition-all appearance-none disabled:opacity-50" 
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
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{format(dayDate, 'eeee', { locale: nl })}</div>
                  <div className="text-2xl font-black text-gray-900">{format(dayDate, 'd')}</div>
                  <input 
                    type="number" 
                    step="0.5" 
                    placeholder="0" 
                    className="w-full p-4 bg-white rounded-2xl text-center font-black focus:ring-2 focus:ring-pink-600 outline-none shadow-sm" 
                    value={weekHours[dayIndex]} 
                    onChange={(e) => setWeekHours({...weekHours, [dayIndex]: e.target.value})} 
                  />
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
                  const newRegRef = doc(collection(db, 'timeRegistrations'));
                  batch.set(newRegRef, {
                    uid: selectedZzpUid, 
                    assignmentId: selectedAssignmentId, 
                    date, 
                    duration: parseFloat(hours), 
                    status: 'pending', 
                    createdAt: new Date().toISOString()
                  });
                }
              });
              if (hasData) { 
                await batch.commit(); 
                alert("Weekoverzicht succesvol opgeslagen!"); 
                setWeekHours({'0':'','1':'','2':'','3':'','4':'','5':'','6':''}); 
                fetchInitialData(); 
              } else {
                alert("Vul tenminste één dag in met uren.");
              }
            }} 
            className="w-full bg-[#111827] text-white py-6 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl disabled:opacity-20"
          >
            <Save size={20} /> Weekoverzicht Opslaan
          </button>
        </div>
      ) : (
        /* LIJST WEERGAVE */
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
                  <tr key={reg.id} className="hover:bg-gray-50/30 transition-colors group">
                    <td className="px-8 py-5 font-bold text-gray-700">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    {isAdmin && (
                      <td className="px-8 py-5">
                        <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full text-[11px] font-black">
                          {zzp ? `${zzp.firstName} ${zzp.lastName}` : 'Onbekend'}
                        </span>
                      </td>
                    )}
                    <td className="px-8 py-5 text-right font-black text-gray-900">{reg.duration}u</td>
                    <td className="px-8 py-5">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${reg.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {reg.status === 'approved' ? 'Akkoord' : 'Wachtend'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-3">
                        {isAdmin && reg.status === 'pending' && (
                          <button onClick={() => handleApprove(reg.id)} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                            <CheckCircle size={18} />
                          </button>
                        )}
                        {reg.status !== 'approved' && (
                          <button onClick={() => handleDelete(reg.id)} className="p-2.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {registrations.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                    Geen registraties gevonden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;
