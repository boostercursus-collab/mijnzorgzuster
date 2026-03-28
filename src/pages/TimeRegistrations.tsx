import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc, writeBatch, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment } from '../types';
import { Calendar, List, Save, Trash2, CheckCircle2 } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const [view, setView] = useState<'list' | 'week'>('list');
  const [currentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedZzpUid, setSelectedZzpUid] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [weekHours, setWeekHours] = useState<{ [key: string]: string }>({
    '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': ''
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchInitialData(user);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchInitialData = async (currentUser: any) => {
    setLoading(true);
    try {
      // 1. Parallel ophalen van alle data
      const [userDoc, usersSnap, assignSnap] = await Promise.all([
        getDoc(doc(db, 'users', currentUser.uid)),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'assignments'))
      ]);

      // 2. Gebruikersprofiel bepalen (met fallback op auth data)
      const profileData = userDoc.exists() 
        ? { uid: currentUser.uid, ...userDoc.data() } 
        : { uid: currentUser.uid, displayName: currentUser.displayName, email: currentUser.email, role: 'zzp' };
      
      setUserProfile(profileData);
      
      const usersList = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
      setAllUsers(usersList);
      
      const allAssignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      setAssignments(allAssignments);

      // 3. Cruciaal: Zet de UID en opdracht direct voor ZZP'ers
      const isAdminUser = profileData.role === 'admin';
      
      if (!isAdminUser) {
        // Forceer de UID van de ingelogde gebruiker
        setSelectedZzpUid(currentUser.uid);
        
        // Filter opdrachten die specifiek voor deze UID zijn
        const myAssignments = allAssignments.filter(a => a.uid === currentUser.uid);
        if (myAssignments.length > 0) {
          setSelectedAssignmentId(myAssignments[0].id);
        }
      }

      // 4. Haal registraties op
      const regQuery = isAdminUser 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', currentUser.uid), orderBy('date', 'desc'));

      const regSnap = await getDocs(regQuery);
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));

    } catch (err) {
      console.error("Data fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (user: any) => {
    if (!user) return 'Naam onbekend';
    return user.displayName || user.email || 'Gebruiker';
  };

  const handleSaveWeek = async () => {
    if (!selectedAssignmentId || !selectedZzpUid) {
      alert("Selecteer een opdracht.");
      return;
    }

    const batch = writeBatch(db);
    let hasData = false;

    Object.entries(weekHours).forEach(([index, hours]) => {
      const numHours = parseFloat(hours);
      if (numHours > 0) {
        hasData = true;
        const date = format(addDays(currentWeekStart, parseInt(index)), 'yyyy-MM-dd');
        const newRegRef = doc(collection(db, 'timeRegistrations'));
        batch.set(newRegRef, {
          uid: selectedZzpUid,
          assignmentId: selectedAssignmentId,
          date,
          duration: numHours,
          status: 'pending',
          createdAt: serverTimestamp()
        });
      }
    });

    if (hasData) {
      try {
        await batch.commit();
        alert("Uren succesvol ingediend!");
        setWeekHours({'0':'','1':'','2':'','3':'','4':'','5':'','6':''});
        fetchInitialData(auth.currentUser);
        setView('list');
      } catch (err) {
        console.error("Opslaan mislukt:", err);
      }
    }
  };

  // Helper om te checken of iemand admin is
  const isAdmin = userProfile?.role === 'admin';

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tight uppercase">Urenregistratie</h1>
          <p className="text-gray-500 font-medium">Registreer gewerkte uren per opdracht.</p>
        </div>
        
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
          <button onClick={() => setView('list')} className={`px-5 py-2.5 rounded-xl transition-all ${view === 'list' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-400'}`}>
            <List size={20} />
          </button>
          <button onClick={() => setView('week')} className={`px-5 py-2.5 rounded-xl transition-all ${view === 'week' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-400'}`}>
            <Calendar size={20} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase tracking-widest">Laden...</div>
      ) : (
        <div className="animate-in fade-in duration-500">
          {view === 'week' ? (
            <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ZZP SELECTIE / WEERGAVE */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">ZZP'er</label>
                  <div className="w-full p-5 bg-gray-50 rounded-2xl font-bold text-gray-900 border border-transparent">
                    {isAdmin ? (
                      <select 
                        className="w-full bg-transparent border-none outline-none focus:ring-0"
                        value={selectedZzpUid}
                        onChange={(e) => {
                          setSelectedZzpUid(e.target.value);
                          setSelectedAssignmentId('');
                        }}
                      >
                        <option value="">Kies ZZP'er...</option>
                        {allUsers.filter(u => u.role === 'zzp').map(u => (
                          <option key={u.uid} value={u.uid}>{getUserName(u)}</option>
                        ))}
                      </select>
                    ) : (
                      <span>{getUserName(userProfile)}</span>
                    )}
                  </div>
                </div>

                {/* OPDRACHT SELECTIE */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Actieve Opdracht</label>
                  <select 
                    className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none transition-all" 
                    value={selectedAssignmentId} 
                    onChange={(e) => setSelectedAssignmentId(e.target.value)}
                  >
                    <option value="">Selecteer de opdracht...</option>
                    {assignments
                      .filter(a => a.uid === selectedZzpUid)
                      .map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              {/* UREN INPUTS */}
              <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
                {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map((day, idx) => (
                  <div key={day} className="space-y-3 text-center">
                    <span className="text-[10px] font-black text-gray-400 tracking-widest">{day}</span>
                    <input 
                      type="number" 
                      step="0.5"
                      placeholder="0"
                      value={weekHours[idx]}
                      onChange={(e) => setWeekHours({...weekHours, [idx]: e.target.value})}
                      className="w-full p-5 bg-gray-50 rounded-2xl text-center font-black text-xl border-none focus:ring-2 focus:ring-pink-500 outline-none"
                    />
                  </div>
                ))}
              </div>

              <button 
                disabled={!selectedAssignmentId}
                onClick={handleSaveWeek} 
                className="w-full bg-[#111827] text-white py-6 rounded-3xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl disabled:opacity-20 uppercase tracking-widest"
              >
                <Save size={20} /> Weekoverzicht indienen
              </button>
            </div>
          ) : (
            /* LIJST WEERGAVE (onveranderd) */
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
                  {registrations.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="px-8 py-10 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">Geen uren gevonden</td>
                    </tr>
                  ) : (
                    registrations.map(reg => {
                      const zzp = allUsers.find(u => u.uid === reg.uid);
                      return (
                        <tr key={reg.id} className="hover:bg-gray-50/30 transition-colors group">
                          <td className="px-8 py-5 font-bold text-gray-700">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                          {isAdmin && <td className="px-8 py-5 font-bold">{getUserName(zzp)}</td>}
                          <td className="px-8 py-5 text-right font-black text-gray-900">{reg.duration}u</td>
                          <td className="px-8 py-5">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                              reg.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {reg.status === 'approved' ? 'Goedgekeurd' : 'Wacht op akkoord'}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right flex justify-end gap-2">
                            {isAdmin && reg.status === 'pending' && (
                              <button onClick={async () => {
                                await updateDoc(doc(db, 'timeRegistrations', reg.id), { status: 'approved' });
                                fetchInitialData(auth.currentUser);
                              }} className="p-2 text-gray-300 hover:text-green-600 transition-all">
                                <CheckCircle2 size={18} />
                              </button>
                            )}
                            <button onClick={async () => {
                               if(window.confirm("Verwijderen?")) {
                                 await deleteDoc(doc(db, 'timeRegistrations', reg.id));
                                 fetchInitialData(auth.currentUser);
                               }
                            }} className="p-2 text-gray-300 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;
