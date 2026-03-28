import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Plus, Calendar, List, ChevronLeft, ChevronRight, X, Save } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const [view, setView] = useState<'list' | 'week'>('list');
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  // Grid State
  const [selectedZzpUid, setSelectedZzpUid] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [weekHours, setWeekHours] = useState<{ [key: string]: string }>({
    '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': ''
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Haal profiel op
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const profile = { uid: user.uid, ...userDoc.data() } as UserProfile;
    setUserProfile(profile);
    if (profile.role !== 'admin') setSelectedZzpUid(user.uid);

    // 2. Haal alle data op
    const [regSnap, assignSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, 'timeRegistrations')),
      getDocs(collection(db, 'assignments')),
      profile.role === 'admin' ? getDocs(collection(db, 'users')) : Promise.resolve({ docs: [] })
    ]);

    setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));
    setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
    if (profile.role === 'admin') {
      setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }
  };

  // VALIDATIE: Filter opdrachten op basis van geselecteerde ZZP
  const filteredAssignments = assignments.filter(a => a.uid === selectedZzpUid);

  const saveWeekGrid = async () => {
    if (!selectedZzpUid || !selectedAssignmentId) {
      alert("Selecteer eerst een ZZP'er en een opdracht.");
      return;
    }

    const batch = writeBatch(db);
    let hasData = false;

    Object.entries(weekHours).forEach(([index, hours]) => {
      const duration = Number(hours);
      if (duration > 0) {
        hasData = true;
        const date = format(addDays(currentWeekStart, parseInt(index)), 'yyyy-MM-dd');
        const newRegRef = doc(collection(db, 'timeRegistrations'));
        batch.set(newRegRef, {
          uid: selectedZzpUid,
          assignmentId: selectedAssignmentId,
          date,
          duration,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }
    });

    if (hasData) {
      await batch.commit();
      alert("Weekoverzicht opgeslagen!");
      setWeekHours({ '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': '' });
      fetchInitialData();
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black">Urenregistratie</h1>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border">
          <button onClick={() => setView('list')} className={`px-4 py-2 rounded-xl font-bold ${view === 'list' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>Lijst</button>
          <button onClick={() => setView('week')} className={`px-4 py-2 rounded-xl font-bold ${view === 'week' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>Week-Grid</button>
        </div>
      </div>

      {view === 'week' ? (
        <div className="bg-white rounded-[2.5rem] p-10 border shadow-sm space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ZZP Selectie (Admin only) */}
            {userProfile?.role === 'admin' && (
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block">ZZP'er</label>
                <select 
                  className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none"
                  value={selectedZzpUid}
                  onChange={(e) => { setSelectedZzpUid(e.target.value); setSelectedAssignmentId(''); }}
                >
                  <option value="">Selecteer ZZP'er...</option>
                  {allUsers.filter(u => u.role === 'zzp').map(u => (
                    <option key={u.uid} value={u.uid}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Gefilterde Opdrachten */}
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block">Actieve Opdracht</label>
              <select 
                className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none"
                disabled={!selectedZzpUid}
                value={selectedAssignmentId}
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
              >
                <option value="">{selectedZzpUid ? 'Kies opdracht...' : 'Selecteer eerst een ZZP\'er'}</option>
                {filteredAssignments.map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* De Week-Dagen Grid */}
          <div className="grid grid-cols-7 gap-4">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
              const dayDate = addDays(currentWeekStart, dayIndex);
              return (
                <div key={dayIndex} className="text-center space-y-2">
                  <div className="text-[10px] font-black text-gray-400 uppercase">{format(dayDate, 'eee', { locale: nl })}</div>
                  <div className="text-lg font-black">{format(dayDate, 'd')}</div>
                  <input 
                    type="number" 
                    placeholder="0"
                    className="w-full p-4 bg-gray-50 rounded-2xl text-center font-black focus:ring-2 focus:ring-pink-600 transition-all"
                    value={weekHours[dayIndex]}
                    onChange={(e) => setWeekHours({...weekHours, [dayIndex]: e.target.value})}
                  />
                </div>
              );
            })}
          </div>

          <button 
            onClick={saveWeekGrid}
            className="w-full bg-[#111827] text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all"
          >
            <Save size={20} /> Weekoverzicht Opslaan
          </button>
        </div>
      ) : (
        /* Je bestaande lijstweergave hier... */
        <div className="bg-white rounded-[2.5rem] border overflow-hidden">
           {/* ... bestaande tabel code ... */}
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;
