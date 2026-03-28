import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc, writeBatch, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment } from '../types';
import { Calendar, List, Save, Trash2, ClipboardList } from 'lucide-react';
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
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const [userDoc, usersSnap, assignSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'assignments'))
      ]);

      const profile = { uid: user.uid, ...userDoc.data() } as any;
      setUserProfile(profile);
      setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
      
      const allAssignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      setAssignments(allAssignments);

      const isAdmin = profile.role === 'admin';
      
      if (!isAdmin) {
        setSelectedZzpUid(user.uid);
        // Filter direct de opdrachten voor deze ZZP'er
        const myAssignments = allAssignments.filter(a => a.uid === user.uid);
        if (myAssignments.length === 1) {
          setSelectedAssignmentId(myAssignments[0].id);
        }
      }

      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', user.uid), orderBy('date', 'desc'));

      const regSnap = await getDocs(regQuery);
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));

    } catch (err) {
      console.error("Fout bij ophalen data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (user: any) => {
    if (!user) return 'Onbekend';
    return user.displayName || user.email || 'Gebruiker';
  };

  const isAdmin = userProfile?.role === 'admin';

  const handleSaveWeek = async () => {
    if (!selectedAssignmentId || !selectedZzpUid) {
      alert("Selecteer eerst een ZZP'er en een opdracht.");
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
        alert("Weekoverzicht succesvol opgeslagen!");
        setWeekHours({'0':'','1':'','2':'','3':'','4':'','5':'','6':''});
        fetchInitialData();
        setView('list');
      } catch (err) {
        console.error("Opslaan mislukt:", err);
      }
    } else {
      alert("Vul tenminste één dag in met uren.");
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase">Urenregistratie</h1>
          <p className="text-gray-500 font-medium text-lg">Registreer en beheer gewerkte uren.</p>
        </div>
        
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 w-fit">
          <button 
            onClick={() => setView('list')} 
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${view === 'list' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <List size={20} /> Lijst
          </button>
          <button 
            onClick={() => setView('week')} 
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${view === 'week' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <Calendar size={20} /> Week
          </button>
        </div>
      </header>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600 animate-pulse tracking-widest uppercase">Data wordt geladen...</div>
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
                    {allUsers.filter(u => u.role === 'zzp').map(u => (
                      <option key={u.uid} value={u.uid}>{getUserName(u)}</option>
                    ))}
                  </>
                ) : (
                  <option value={userProfile?.uid}>{getUserName(userProfile)}</option>
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
                <option value="">Kies opdracht...</option>
                {assignments.filter(a => a.uid === selectedZzpUid).map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
          </div>

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
                  className="w-full p-5 bg-gray-50 rounded-2xl text-center font-black text-xl border-none focus:ring-2 focus:ring-pink-500 transition-all outline-none"
                />
              </div>
            ))}
          </div>

          <button 
            disabled={!selectedAssignmentId}
            onClick={handleSaveWeek} 
            className="w-full bg-[#111827] text-white py-6 rounded-3xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl disabled:opacity-20 uppercase tracking-widest"
          >
            <Save size={20} /> Weekoverzicht Indienen
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden animate-in fade-in duration-500">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
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
                        <td className="px-8 py-5 font-bold text-gray-900">{getUserName(zzp)}</td>
                      )}
                      <td className="px-8 py-5 text-right font-black text-gray-900">{reg.duration.toFixed(1)}u</td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                          reg.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {reg.status === 'approved' ? 'Goedgekeurd' : 'In afwachting'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button onClick={async () => {
                           if(window.confirm("Deze registratie verwijderen?")) {
                             await deleteDoc(doc(db, 'timeRegistrations', reg.id));
                             fetchInitialData();
                           }
                        }} className="p-2 text-gray-300 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {registrations.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                      Geen urenregistraties gevonden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;
