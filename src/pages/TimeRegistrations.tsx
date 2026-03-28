import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, RegistrationStatus } from '../types';
import { Plus, Pencil, Trash2, Check, Clock, List, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, differenceInMinutes, parse, startOfWeek, addDays, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

const TimeRegistrations: React.FC = () => {
  const { profile } = useAuth();
  const [registrations, setRegistrations] = useState<(TimeRegistration & { zzpName?: string })[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReg, setEditingReg] = useState<TimeRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'timesheet'>('list');
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [timesheetData, setTimesheetData] = useState<{ [key: string]: { totalHours: string, description: string } }>({});
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    assignmentId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    description: ''
  });

  const fetchData = useCallback(async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      // 1. Haal opdrachten op (gebruik uid ipv zzpId)
      const assignRef = collection(db, 'assignments');
      const assignQuery = profile.role === 'admin' 
        ? query(assignRef) 
        : query(assignRef, where('uid', '==', profile.uid));
      
      const assignSnap = await getDocs(assignQuery);
      const fetchedAssignments = assignSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment));
      setAssignments(fetchedAssignments);

      if (fetchedAssignments.length > 0 && !selectedAssignmentId) {
        setSelectedAssignmentId(fetchedAssignments[0].id);
      }

      // 2. Haal users op voor namen
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersMap: Record<string, string> = {};
      usersSnap.docs.forEach(doc => {
        const u = doc.data();
        usersMap[doc.id] = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
      });

      // 3. Haal registraties op (gebruik uid ipv zzpId)
      const regsRef = collection(db, 'timeRegistrations');
      const regsQuery = profile.role === 'admin'
        ? query(regsRef, orderBy('date', 'desc'))
        : query(regsRef, where('uid', '==', profile.uid), orderBy('date', 'desc'));

      const regsSnap = await getDocs(regsQuery);
      const regs = regsSnap.docs.map(doc => {
        const data = doc.data() as TimeRegistration;
        return {
          id: doc.id,
          ...data,
          zzpName: usersMap[data.uid] || 'Onbekend'
        };
      });

      setRegistrations(regs);
    } catch (error) {
      console.error('Fout bij ophalen data:', error);
    } finally {
      setLoading(false);
    }
  }, [profile, selectedAssignmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Timesheet data vullen wanneer week of opdracht wijzigt
  useEffect(() => {
    if (viewMode === 'timesheet') {
      const newTimesheetData: typeof timesheetData = {};
      const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
      
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existing = registrations.find(r => 
          r.date === dateStr && 
          r.assignmentId === selectedAssignmentId &&
          (profile?.role === 'admin' ? true : r.uid === profile?.uid)
        );
        newTimesheetData[dateStr] = {
          totalHours: existing ? existing.totalHours.toString() : '',
          description: existing?.description || ''
        };
      });
      setTimesheetData(newTimesheetData);
    }
  }, [currentWeekStart, selectedAssignmentId, registrations, viewMode, profile]);

  const calculateHours = (start: string, end: string, breakMin: number) => {
    try {
      const startTime = parse(start, 'HH:mm', new Date());
      const endTime = parse(end, 'HH:mm', new Date());
      const diff = differenceInMinutes(endTime, startTime);
      return Math.max(0, (diff - breakMin) / 60);
    } catch { return 0; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || isSaving) return;
    setIsSaving(true);

    try {
      const totalHours = calculateHours(formData.startTime, formData.endTime, formData.breakMinutes);
      const currentAssignment = assignments.find(a => a.id === formData.assignmentId);
      
      const data = {
        ...formData,
        uid: profile.role === 'admin' ? (currentAssignment?.uid || '') : profile.uid,
        totalHours,
        status: editingReg?.status || 'draft',
        updatedAt: new Date().toISOString()
      };

      if (editingReg) {
        await updateDoc(doc(db, 'timeRegistrations', editingReg.id), data);
      } else {
        await addDoc(collection(db, 'timeRegistrations'), { ...data, createdAt: new Date().toISOString() });
      }
      
      setIsModalOpen(false);
      setEditingReg(null);
      fetchData();
    } catch (error) {
      alert('Fout bij opslaan: ' + error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTimesheet = async (submit = false) => {
    if (!profile || !selectedAssignmentId || isSaving) return;
    if (!window.confirm(submit ? "Deze week indienen voor goedkeuring?" : "Concept opslaan?")) return;

    setIsSaving(true);
    try {
      const currentAssignment = assignments.find(a => a.id === selectedAssignmentId);
      const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

      for (const day of weekDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const entry = timesheetData[dateStr];
        const hours = parseFloat(entry?.totalHours || '0');
        const existing = registrations.find(r => r.date === dateStr && r.assignmentId === selectedAssignmentId);

        if (hours <= 0) {
          if (existing && existing.status === 'draft') await deleteDoc(doc(db, 'timeRegistrations', existing.id));
          continue;
        }

        const payload: any = {
          assignmentId: selectedAssignmentId,
          uid: profile.role === 'admin' ? currentAssignment?.uid : profile.uid,
          date: dateStr,
          totalHours: hours,
          description: entry.description || '',
          status: submit ? 'submitted' : (existing?.status || 'draft'),
          startTime: existing?.startTime || '09:00',
          endTime: existing?.endTime || '17:00',
          breakMinutes: existing?.breakMinutes || 0,
          updatedAt: new Date().toISOString()
        };

        if (existing) {
          await updateDoc(doc(db, 'timeRegistrations', existing.id), payload);
        } else {
          await addDoc(collection(db, 'timeRegistrations'), { ...payload, createdAt: new Date().toISOString() });
        }
      }
      fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'timeRegistrations', id), { 
        status: 'approved',
        approvedAt: new Date().toISOString()
      });
      fetchData();
    } catch (error) { console.error(error); }
  };

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

  if (loading) return (
    <div className="flex h-64 flex-col items-center justify-center space-y-4">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-600 border-t-transparent"></div>
      <p className="text-pink-600 font-bold uppercase tracking-widest text-xs">Uren laden...</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Urenregistratie</h1>
          <p className="text-gray-500 font-medium">Beheer je gewerkte uren en opdrachten.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-white border rounded-2xl p-1 shadow-sm flex">
            <button onClick={() => setViewMode('list')} className={cn("p-2 rounded-xl transition-all", viewMode === 'list' ? "bg-pink-600 text-white shadow-lg shadow-pink-200" : "text-gray-400 hover:text-gray-600")}><List className="h-5 w-5" /></button>
            <button onClick={() => setViewMode('timesheet')} className={cn("p-2 rounded-xl transition-all", viewMode === 'timesheet' ? "bg-pink-600 text-white shadow-lg shadow-pink-200" : "text-gray-400 hover:text-gray-600")}><CalendarIcon className="h-5 w-5" /></button>
          </div>
          {viewMode === 'list' && (
            <button onClick={() => { setEditingReg(null); setIsModalOpen(true); }} className="bg-gray-900 text-white px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-colors">
              <Plus className="h-5 w-5" /> Nieuwe Dag
            </button>
          )}
        </div>
      </div>

      {viewMode === 'timesheet' ? (
        <div className="space-y-4">
          {/* Timesheet Controls */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center bg-gray-100 rounded-xl p-1">
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronLeft className="h-4 w-4"/></button>
                <span className="px-4 font-black text-sm uppercase tracking-wider">Week {format(currentWeekStart, 'w')}</span>
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronRight className="h-4 w-4"/></button>
              </div>
              <select 
                value={selectedAssignmentId} 
                onChange={(e) => setSelectedAssignmentId(e.target.value)} 
                className="border-gray-200 rounded-xl text-sm font-bold focus:ring-pink-500 py-2.5"
              >
                {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleSaveTimesheet(false)} disabled={isSaving} className="px-6 py-2.5 text-sm font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors">Concept</button>
              <button onClick={() => handleSaveTimesheet(true)} disabled={isSaving} className="bg-pink-600 text-white px-8 py-2.5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-pink-200 hover:bg-pink-700 transition-all">Indienen</button>
            </div>
          </div>

          {/* Timesheet Grid */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDays.map(day => {
              const dStr = format(day, 'yyyy-MM-dd');
              return (
                <div key={dStr} className={cn("bg-white p-5 rounded-3xl border transition-all", isSameDay(day, new Date()) ? "border-pink-500 ring-4 ring-pink-50 shadow-xl" : "border-gray-100 shadow-sm")}>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{format(day, 'eeee', { locale: nl })}</p>
                  <p className="text-xl font-black text-gray-900 mb-4">{format(day, 'd MMM')}</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-black text-gray-300 uppercase block mb-1">Uren</label>
                      <input 
                        type="number" 
                        step="0.5"
                        value={timesheetData[dStr]?.totalHours || ''} 
                        onChange={(e) => setTimesheetData({...timesheetData, [dStr]: {...timesheetData[dStr], totalHours: e.target.value}})}
                        className="w-full bg-gray-50 border-none rounded-xl font-black text-lg text-center focus:ring-2 focus:ring-pink-500 py-3"
                        placeholder="0.0"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-300 uppercase block mb-1">Omschrijving</label>
                      <textarea 
                        value={timesheetData[dStr]?.description || ''} 
                        onChange={(e) => setTimesheetData({...timesheetData, [dStr]: {...timesheetData[dStr], description: e.target.value}})}
                        className="w-full bg-gray-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-pink-500 p-3"
                        rows={3}
                        placeholder="Wat heb je gedaan?"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Datum</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Opdracht</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Totaal</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {registrations.map(reg => (
                  <tr key={reg.id} className="hover:bg-pink-50/10 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{format(new Date(reg.date), 'dd MMM yyyy', { locale: nl })}</p>
                      {profile?.role === 'admin' && <p className="text-[10px] text-pink-600 font-bold uppercase">{reg.zzpName}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-800">{assignments.find(a => a.id === reg.assignmentId)?.title || '...'}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[250px] font-medium">{reg.description}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-gray-100 px-3 py-1.5 rounded-xl text-xs font-black text-gray-700">{reg.totalHours}u</span>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={reg.status} /></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {reg.status === 'submitted' && profile?.role === 'admin' && (
                          <button onClick={() => handleApprove(reg.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"><Check className="h-5 w-5"/></button>
                        )}
                        {(reg.status === 'draft' || profile?.role === 'admin') && (
                          <>
                            <button onClick={() => { setEditingReg(reg); setFormData({...reg}); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"><Pencil className="h-5 w-5"/></button>
                            <button onClick={() => { if(window.confirm('Deze registratie verwijderen?')) deleteDoc(doc(db, 'timeRegistrations', reg.id)).then(fetchData); }} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 className="h-5 w-5"/></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {registrations.length === 0 && (
            <div className="p-20 text-center">
              <div className="bg-gray-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Geen uren gevonden</p>
            </div>
          )}
        </div>
      )}

      {/* Modal voor nieuwe/bewerken */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl">
             <h2 className="text-3xl font-black mb-8 tracking-tight">{editingReg ? 'Uren aanpassen' : 'Nieuwe dag schrijven'}</h2>
             <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-2">Opdracht</label>
                  <select required value={formData.assignmentId} onChange={e => setFormData({...formData, assignmentId: e.target.value})} className="w-full border-gray-100 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-pink-500 py-3.5 font-bold">
                    <option value="">Selecteer opdracht...</option>
                    {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-2">Datum</label>
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border-gray-100 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-pink-500 py-3 font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-2">Pauze (min)</label>
                    <input type="number" value={formData.breakMinutes} onChange={e => setFormData({...formData, breakMinutes: parseInt(e.target.value) || 0})} className="w-full border-gray-100 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-pink-500 py-3 font-bold" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-2">Starttijd</label>
                    <input type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-full border-gray-100 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-pink-500 py-3 font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-2">Eindtijd</label>
                    <input type="time" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="w-full border-gray-100 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-pink-500 py-3 font-bold" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-2">Omschrijving</label>
                  <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border-gray-100 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-pink-500 p-4 font-medium" rows={3} placeholder="Wat heb je gedaan vandaag?" />
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-black text-[10px] uppercase tracking-widest text-gray-400 hover:text-gray-600 py-4 transition-colors">Annuleren</button>
                  <button type="submit" disabled={isSaving || assignments.length === 0} className="flex-1 bg-pink-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest disabled:bg-gray-200 shadow-xl shadow-pink-200 hover:bg-pink-700 transition-all">
                    {isSaving ? 'Bezig...' : 'Uren Opslaan'}
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }: { status: RegistrationStatus }) => {
  const config = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Concept' },
    submitted: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Ingeleverd' },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Akkoord' },
    rejected: { bg: 'bg-red-100', text: 'text-red-600', label: 'Geweigerd' }
  };
  const { bg, text, label } = config[status] || config.draft;
  return <span className={cn("px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest", bg, text)}>{label}</span>;
};

export default TimeRegistrations;
