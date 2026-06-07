import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc, writeBatch, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Calendar, List, Save, ChevronLeft, ChevronRight, CheckCircle, User, CheckCheck, Edit2, Trash2, X, Check } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO, subWeeks, addWeeks } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const [view, setView] = useState<'list' | 'week'>('list');
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // States voor bewerken
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempDuration, setTempDuration] = useState<string>('');

  const [selectedZzpUid, setSelectedZzpUid] = useState('');
  const [filterZzpUid, setFilterZzpUid] = useState('all');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [weekHours, setWeekHours] = useState<Record<string, string>>({
    '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': ''
  });

  const fetchRegistrations = useCallback(async (uid: string, adminStatus: boolean) => {
    try {
      const regRef = collection(db, 'timeRegistrations');
      let q;
      
      if (!adminStatus) {
        q = query(regRef, where('uid', '==', uid), orderBy('date', 'desc'));
      } else {
        q = query(regRef, orderBy('date', 'desc'));
      }
      
      const regSnap = await getDocs(q);
      const regs = regSnap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        duration: d.data().duration || 0,
        totalHours: d.data().totalHours || d.data().duration || 0
      } as TimeRegistration));
      setRegistrations(regs);
    } catch (err) {
      console.error("Fout bij ophalen registraties:", err);
    }
  }, []);

  const updateAssignmentsFilter = useCallback(async (targetUid: string, adminStatus: boolean) => {
    try {
      const assignmentsRef = collection(db, 'assignments');
      let q;
      
      if (adminStatus && !targetUid) {
        q = query(assignmentsRef);
      } else {
        q = query(assignmentsRef, where('uid', '==', targetUid));
      }

      const assignSnap = await getDocs(q);
      const filtered = assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      setAssignments(filtered);
      if (filtered.length > 0) {
        setSelectedAssignmentId(filtered[0].id);
      } else {
        setSelectedAssignmentId('');
      }
    } catch (err) {
      console.error("Fout bij ophalen opdrachten:", err);
    }
  }, []);

  const fetchInitialData = useCallback(async (currentUser: any) => {
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const userData = userDoc.data() as UserProfile | undefined;
      const adminStatus = userData?.role === 'admin';
      
      setIsAdmin(adminStatus);
      setUserProfile(userData || null);

      if (adminStatus) {
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersList = usersSnap.docs.map(d => ({ 
          uid: d.id, 
          ...d.data(),
          displayName: d.data().displayName || `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim() || d.data().email
        } as UserProfile));
        setAllUsers(usersList);
        await updateAssignmentsFilter('', true);
        setSelectedZzpUid('');
      } else {
        setSelectedZzpUid(currentUser.uid);
        await updateAssignmentsFilter(currentUser.uid, false);
        setFilterZzpUid(currentUser.uid);
      }

      await fetchRegistrations(currentUser.uid, adminStatus);
    } catch (err) {
      console.error("Data fetch mislukt:", err);
    } finally {
      setLoading(false);
    }
  }, [updateAssignmentsFilter, fetchRegistrations]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) fetchInitialData(user);
    });
    return () => unsubscribe();
  }, [fetchInitialData]);

  // LOGICA OM BESTAANDE UREN IN WEEKVIEW TE LADEN
  useEffect(() => {
    if (view === 'week' && selectedZzpUid && selectedAssignmentId) {
      const newWeekHours: Record<string, string> = { 
        '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': '' 
      };
      
      for (let i = 0; i < 7; i++) {
        const dateStr = format(addDays(currentWeekStart, i), 'yyyy-MM-dd');
        const existing = registrations.find(r => 
          r.uid === selectedZzpUid && 
          r.assignmentId === selectedAssignmentId && 
          r.date === dateStr
        );
        if (existing && existing.duration) {
          newWeekHours[i.toString()] = existing.duration.toString();
        }
      }
      setWeekHours({ ...newWeekHours });
    }
  }, [view, currentWeekStart, selectedZzpUid, selectedAssignmentId, registrations]);

  // ADMIN ACTIES
  const handleApprove = async (regId: string) => {
    try {
      await updateDoc(doc(db, 'timeRegistrations', regId), { 
        status: 'approved',
        approvedAt: new Date().toISOString()
      });
      setRegistrations(prev => prev.map(r => r.id === regId ? { ...r, status: 'approved' } : r));
    } catch (err) {
      alert("Goedkeuren mislukt.");
    }
  };

  const handleUpdateDuration = async (regId: string) => {
    const newDuration = parseFloat(tempDuration);
    if (isNaN(newDuration) || newDuration < 0) {
      alert("Voer een geldig getal in.");
      return;
    }

    try {
      await updateDoc(doc(db, 'timeRegistrations', regId), { 
        duration: newDuration,
        totalHours: newDuration,
        updatedAt: serverTimestamp() 
      });
      setRegistrations(prev => prev.map(r => r.id === regId ? { ...r, duration: newDuration, totalHours: newDuration } : r));
      setEditingId(null);
      setTempDuration('');
    } catch (err) {
      alert("Wijzigen mislukt.");
    }
  };

  const handleDeleteRegistration = async (regId: string) => {
    if (!window.confirm("Weet je zeker dat je deze urenregistratie wilt verwijderen?")) return;
    try {
      await deleteDoc(doc(db, 'timeRegistrations', regId));
      setRegistrations(prev => prev.filter(r => r.id !== regId));
    } catch (err) {
      alert("Verwijderen mislukt.");
    }
  };

  const handleApproveAll = async () => {
    const toApprove = filteredRegistrations.filter(r => r.status !== 'approved');
    if (toApprove.length === 0) return;

    if (!window.confirm(`Weet je zeker dat je alle ${toApprove.length} registraties wilt goedkeuren?`)) return;

    try {
      const batch = writeBatch(db);
      toApprove.forEach(reg => {
        const docRef = doc(db, 'timeRegistrations', reg.id);
        batch.update(docRef, { 
          status: 'approved',
          approvedAt: new Date().toISOString()
        });
      });

      await batch.commit();
      setRegistrations(prev => prev.map(r => {
        const wasFiltered = toApprove.find(ta => ta.id === r.id);
        return wasFiltered ? { ...r, status: 'approved' } : r;
      }));
      alert("Alle registraties zijn succesvol geaccordeerd!");
    } catch (err) {
      console.error(err);
      alert("Batch goedkeuring mislukt.");
    }
  };

  const handleSaveWeek = async () => {
    if (!selectedAssignmentId || !selectedZzpUid) {
      alert("Selecteer een ZZP'er en een opdracht.");
      return;
    }
    
    const batch = writeBatch(db);
    let hasChanges = false;

    for (const [index, hours] of Object.entries(weekHours)) {
      const numHours = parseFloat(hours);
      const dateStr = format(addDays(currentWeekStart, parseInt(index)), 'yyyy-MM-dd');
      
      const existing = registrations.find(r => 
        r.uid === selectedZzpUid && 
        r.assignmentId === selectedAssignmentId && 
        r.date === dateStr
      );

      if (!isNaN(numHours) && numHours > 0) {
        hasChanges = true;
        if (existing) {
          const docRef = doc(db, 'timeRegistrations', existing.id);
          batch.update(docRef, { 
            duration: numHours,
            totalHours: numHours,
            updatedAt: serverTimestamp()
          });
        } else {
          const newDocRef = doc(collection(db, 'timeRegistrations'));
          batch.set(newDocRef, {
            uid: selectedZzpUid,
            assignmentId: selectedAssignmentId,
            date: dateStr,
            duration: numHours,
            totalHours: numHours,
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } else if (existing && (hours === '' || hours === '0' || (isNaN(numHours) && hours !== ''))) {
        hasChanges = true;
        batch.delete(doc(db, 'timeRegistrations', existing.id));
      }
    }

    if (hasChanges) {
      try {
        await batch.commit();
        alert("Weekregistratie succesvol verwerkt!");
        if (userProfile) {
          await fetchRegistrations(userProfile.uid, isAdmin);
        }
        setView('list');
      } catch (err) {
        console.error(err);
        alert("Opslaan mislukt.");
      }
    } else {
      alert("Geen wijzigingen om op te slaan.");
    }
  };

  const filteredRegistrations = registrations.filter(r => filterZzpUid === 'all' || r.uid === filterZzpUid);
  const getZzpDisplayName = (uid: string) => {
    const user = allUsers.find(u => u.uid === uid);
    return user?.displayName || user?.email || 'ZZP-er';
  };
  const hasPendingItems = filteredRegistrations.some(r => r.status !== 'approved');

  if (loading) {
    return <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase tracking-widest text-sm">Registraties laden...</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tight uppercase">Urenregistratie</h1>
          <p className="text-gray-500 font-medium">{isAdmin ? 'Beheerderspaneel' : `Welkom, ${userProfile?.displayName || userProfile?.email}`}</p>
        </div>
        
        <div className="flex items-center gap-3">
          {view === 'week' && (
            <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 items-center gap-2">
              <button onClick={() => setCurrentWeekStart(s => subWeeks(s, 1))} className="p-2 text-pink-600"><ChevronLeft size={20}/></button>
              <span className="text-[10px] font-black uppercase tracking-widest">Week van {format(currentWeekStart, 'd MMM', { locale: nl })}</span>
              <button onClick={() => setCurrentWeekStart(s => addWeeks(s, 1))} className="p-2 text-pink-600"><ChevronRight size={20}/></button>
            </div>
          )}
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
            <button onClick={() => setView('list')} className={`px-5 py-2.5 rounded-xl ${view === 'list' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}><List size={20} /></button>
            <button onClick={() => setView('week')} className={`px-5 py-2.5 rounded-xl ${view === 'week' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}><Calendar size={20} /></button>
          </div>
        </div>
      </header>

      {view === 'list' ? (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm w-full md:w-auto">
                <User size={20} className="text-gray-400 ml-2" />
                <select 
                  className="bg-transparent font-bold text-sm outline-none cursor-pointer" 
                  value={filterZzpUid} 
                  onChange={(e) => setFilterZzpUid(e.target.value)}
                >
                  <option value="all">Alle ZZP-ers</option>
                  {allUsers.filter(u => u.role === 'zzp').map(u => (
                    <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
                  ))}
                </select>
              </div>

              {hasPendingItems && (
                <button 
                  onClick={handleApproveAll}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-transform hover:scale-105 active:scale-95"
                >
                  <CheckCheck size={18} />
                  Alles Accorderen
                </button>
              )}
            </div>
          )}

          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-8 py-6">Datum</th>
                    {isAdmin && <th className="px-8 py-6">ZZP-er</th>}
                    <th className="px-8 py-6 text-right">Uren</th>
                    <th className="px-8 py-6 text-center">Status</th>
                    {isAdmin && <th className="px-8 py-6 text-center">Acties</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRegistrations.map(reg => (
                    <tr key={reg.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-8 py-5 font-bold text-gray-700">{format(parseISO(reg.date), 'eee d MMM yyyy', { locale: nl })}</td>
                      {isAdmin && <td className="px-8 py-5 font-medium text-pink-600">{getZzpDisplayName(reg.uid)}</td>}
                      
                      <td className="px-8 py-5 text-right font-black text-gray-900">
                        {editingId === reg.id ? (
                          <input 
                            type="number" 
                            step="0.5"
                            className="w-20 p-2 bg-gray-100 rounded-lg text-right outline-none focus:ring-2 ring-pink-500"
                            value={tempDuration}
                            onChange={(e) => setTempDuration(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          `${reg.duration || reg.totalHours || 0}u`
                        )}
                      </td>

                      <td className="px-8 py-5 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${reg.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {reg.status === 'approved' ? 'Akkoord' : 'In afwachting'}
                        </span>
                      </td>

                      {isAdmin && (
                        <td className="px-8 py-5">
                          <div className="flex items-center justify-center gap-3">
                            {editingId === reg.id ? (
                              <>
                                <button onClick={() => handleUpdateDuration(reg.id)} className="text-green-600 hover:scale-110 transition-transform"><Check size={20}/></button>
                                <button onClick={() => { setEditingId(null); setTempDuration(''); }} className="text-gray-400 hover:scale-110 transition-transform"><X size={20}/></button>
                              </>
                            ) : (
                              <>
                                {reg.status !== 'approved' && (
                                  <button onClick={() => handleApprove(reg.id)} title="Accorderen" className="text-green-600 hover:scale-110 transition-transform"><CheckCircle size={20} /></button>
                                )}
                                <button 
                                  onClick={() => { setEditingId(reg.id); setTempDuration((reg.duration || reg.totalHours || 0).toString()); }} 
                                  title="Wijzigen"
                                  className="text-blue-500 hover:scale-110 transition-transform"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteRegistration(reg.id)} 
                                  title="Verwijderen"
                                  className="text-red-400 hover:scale-110 transition-transform"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* WEEK VIEW */
        <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">ZZP-er</label>
              {isAdmin ? (
                <select 
                  className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none" 
                  value={selectedZzpUid} 
                  onChange={(e) => {
                    setSelectedZzpUid(e.target.value);
                    if (e.target.value) updateAssignmentsFilter(e.target.value, true);
                  }}
                >
                  <option value="">Kies ZZP-er...</option>
                  {allUsers.filter(u => u.role === 'zzp').map(u => (
                    <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full p-5 bg-gray-100 rounded-2xl font-bold text-gray-500 cursor-not-allowed">
                  {userProfile?.displayName || userProfile?.email}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Opdracht</label>
              <select 
                className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none" 
                value={selectedAssignmentId} 
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
              >
                <option value="">Kies opdracht...</option>
                {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
            {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map((day, idx) => {
              const d = addDays(currentWeekStart, idx);
              return (
                <div key={day} className="space-y-3 text-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-pink-600">{day}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{format(d, 'd MMM', { locale: nl })}</span>
                  </div>
                  <input 
                    type="number" 
                    step="0.5" 
                    value={weekHours[idx.toString()]} 
                    onChange={(e) => setWeekHours({...weekHours, [idx.toString()]: e.target.value})} 
                    className="w-full p-5 bg-gray-50 rounded-2xl text-center font-black text-xl border-none outline-none focus:ring-2 ring-pink-500/20" 
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>
          <button 
            onClick={handleSaveWeek} 
            className="w-full bg-[#111827] text-white py-6 rounded-3xl font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-transform hover:scale-[1.01] active:scale-95"
          >
            <Save size={20} /> Opslaan / Bijwerken
          </button>
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;