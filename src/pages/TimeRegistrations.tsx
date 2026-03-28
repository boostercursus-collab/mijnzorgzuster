import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment } from '../types';
import { Calendar, List, Save } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const [view, setView] = useState<'list' | 'week'>('list');
  const [currentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]); // Voor de admin dropdown
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Selectie states
  const [selectedZzpUid, setSelectedZzpUid] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [weekHours, setWeekHours] = useState<{ [key: string]: string }>({
    '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': ''
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchInitialData(user);
      }
    });
    return () => unsubscribe();
  }, []);

  // Effect om opdrachten te filteren zodra de geselecteerde ZZP'er wijzigt (voor Admin)
  useEffect(() => {
    if (selectedZzpUid) {
      updateAssignmentsFilter(selectedZzpUid);
    }
  }, [selectedZzpUid]);

  const fetchInitialData = async (currentUser: any) => {
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const userData = userDoc.data();
      const adminStatus = userData?.role === 'admin';
      
      setIsAdmin(adminStatus);
      setUserProfile({ uid: currentUser.uid, ...userData });

      if (adminStatus) {
        // Admin: Haal alle ZZP'ers op
        const usersSnap = await getDocs(collection(db, 'users'));
        setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
      } else {
        // ZZP'er: Zet eigen UID vast en haal opdrachten op
        setSelectedZzpUid(currentUser.uid);
      }

      await fetchRegistrations(currentUser.uid, adminStatus);
    } catch (err) {
      console.error("Data ophalen mislukt:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateAssignmentsFilter = async (targetUid: string) => {
    const assignSnap = await getDocs(collection(db, 'assignments'));
    const filtered = assignSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Assignment))
      .filter(a => String(a.uid) === String(targetUid));
    
    setAssignments(filtered);
    setSelectedAssignmentId(filtered.length > 0 ? filtered[0].id : '');
  };

  const fetchRegistrations = async (uid: string, adminStatus: boolean) => {
    const regQuery = adminStatus 
      ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
      : query(collection(db, 'timeRegistrations'), where('uid', '==', uid), orderBy('date', 'desc'));
    
    const regSnap = await getDocs(regQuery);
    setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));
  };

  const handleSaveWeek = async () => {
    if (!selectedAssignmentId || !selectedZzpUid) {
      alert("Selecteer een ZZP'er en opdracht.");
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
      await batch.commit();
      alert("Uren succesvol opgeslagen!");
      setWeekHours({'0':'','1':'','2':'','3':'','4':'','5':'','6':''});
      fetchRegistrations(userProfile.uid, isAdmin);
      setView('list');
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tight uppercase">Urenregistratie</h1>
          <p className="text-gray-500 font-medium">Welkom, {userProfile?.displayName || 'Gebruiker'}</p>
        </div>
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
          <button onClick={() => setView('list')} className={`px-5 py-2.5 rounded-xl ${view === 'list' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}><List size={20} /></button>
          <button onClick={() => setView('week')} className={`px-5 py-2.5 rounded-xl ${view === 'week' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}><Calendar size={20} /></button>
        </div>
      </header>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase tracking-widest">Laden...</div>
      ) : (
        <div className="animate-in fade-in duration-500">
          {view === 'week' ? (
            <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* ZZP VELD: Alleen voor Admin */}
                {isAdmin ? (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">ZZP'er</label>
                    <select 
                      className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none"
                      value={selectedZzpUid}
                      onChange={(e) => setSelectedZzpUid(e.target.value)}
                    >
                      <option value="">Selecteer ZZP'er...</option>
                      {allUsers.map(u => (
                        <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">ZZP'er</label>
                    <div className="w-full p-5 bg-gray-100 rounded-2xl font-bold text-gray-500">
                      {userProfile?.displayName}
                    </div>
                  </div>
                )}

                {/* OPDRACHT VELD */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Actieve Opdracht</label>
                  <select 
                    className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none" 
                    value={selectedAssignmentId} 
                    onChange={(e) => setSelectedAssignmentId(e.target.value)}
                  >
                    <option value="">{assignments.length > 0 ? 'Kies opdracht...' : 'Geen opdrachten gevonden'}</option>
                    {assignments.map(a => (
                      <option key={a.id} value={a.id}>{a.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Uren Grid */}
              <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
                {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map((day, idx) => (
                  <div key={day} className="space-y-3 text-center">
                    <span className="text-[10px] font-black text-gray-400 tracking-widest">{day}</span>
                    <input 
                      type="number" step="0.5" placeholder="0"
                      value={weekHours[idx]}
                      onChange={(e) => setWeekHours({...weekHours, [idx]: e.target.value})}
                      className="w-full p-5 bg-gray-50 rounded-2xl text-center font-black text-xl border-none focus:ring-2 focus:ring-pink-500 outline-none"
                    />
                  </div>
                ))}
              </div>

              <button 
                onClick={handleSaveWeek}
                className="w-full bg-[#111827] text-white py-6 rounded-3xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl uppercase tracking-widest"
              >
                <Save size={20} /> Weekoverzicht indienen
              </button>
            </div>
          ) : (
            /* Lijst weergave blijft gelijk aan jouw origineel */
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
               <table className="w-full text-left">
                <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-8 py-6">Datum</th>
                    <th className="px-8 py-6 text-right">Uren</th>
                    <th className="px-8 py-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {registrations.map(reg => (
                    <tr key={reg.id}>
                      <td className="px-8 py-5 font-bold">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                      <td className="px-8 py-5 text-right font-black">{reg.duration}u</td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${reg.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {reg.status === 'approved' ? 'Akkoord' : 'In afwachting'}
                        </span>
                      </td>
                    </tr>
                  ))}
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
