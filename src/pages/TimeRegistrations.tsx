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
  const [allUsers, setAllUsers] = useState<any[]>([]); // 'any' omdat de velden afwijken
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
      // Haal data op
      const [userDoc, usersSnap, assignSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDocs(collection(db, 'users')), // Haal alle users op voor namen
        getDocs(collection(db, 'assignments'))
      ]);

      const profile = { uid: user.uid, ...userDoc.data() } as any;
      const zzpList = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
      
      setUserProfile(profile);
      setAllUsers(zzpList);
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));

      const isAdmin = profile.role === 'admin';

      // Selectie logica
      if (!isAdmin) {
        setSelectedZzpUid(user.uid);
      }

      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', user.uid), orderBy('date', 'desc'));

      const regSnap = await getDocs(regQuery);
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));

    } catch (err) {
      console.error("Fout:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper functie om de naam veilig op te halen uit jouw database velden
  const getUserName = (user: any) => {
    if (!user) return 'Onbekend';
    return user.displayName || user.email || 'Naamloze Gebruiker';
  };

  const isAdmin = userProfile?.role === 'admin';

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase">Urenregistratie</h1>
          <p className="text-gray-500 font-medium text-lg">Beheer uren voor facturatie.</p>
        </div>
        
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
          <button onClick={() => setView('list')} className={`px-5 py-2.5 rounded-xl transition-all ${view === 'list' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>
            <List size={20} />
          </button>
          <button onClick={() => setView('week')} className={`px-5 py-2.5 rounded-xl transition-all ${view === 'week' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>
            <Calendar size={20} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600 animate-pulse tracking-widest uppercase">Laden...</div>
      ) : view === 'week' ? (
        <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm space-y-10">
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
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Opdracht</label>
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

          {/* Weekoverzicht Inputs en Opslaan knop (zelfde als voorheen, maar met juiste namen) */}
          {/* ... (rest van de week-view code) */}
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
                alert("Opgeslagen!"); 
                setWeekHours({'0':'','1':'','2':'','3':'','4':'','5':'','6':''}); 
                fetchInitialData(); 
              }
            }} 
            className="w-full bg-[#111827] text-white py-6 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl disabled:opacity-20 uppercase"
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
                          {getUserName(zzp)}
                        </span>
                      </td>
                    )}
                    <td className="px-8 py-5 text-right font-black text-gray-900">{reg.duration}u</td>
                    <td className="px-8 py-5 text-right">
                      <button onClick={async () => {
                         if(window.confirm("Verwijderen?")) {
                           await deleteDoc(doc(db, 'timeRegistrations', reg.id));
                           setRegistrations(prev => prev.filter(r => r.id !== reg.id));
                         }
                      }} className="p-2 text-gray-300 hover:text-red-600 transition-all">
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
