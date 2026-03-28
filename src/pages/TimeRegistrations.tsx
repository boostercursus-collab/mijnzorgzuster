import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, RegistrationStatus } from '../types';
import { Plus, Pencil, Trash2, Check, Clock, Send, Calendar as CalendarIcon, ChevronLeft, ChevronRight, List } from 'lucide-react';
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
      const assignRef = collection(db, 'assignments');
      const assignQuery = profile.role === 'admin' 
        ? query(assignRef) 
        : query(assignRef, where('zzpId', '==', profile.uid));
      
      const assignSnap = await getDocs(assignQuery);
      const fetchedAssignments = assignSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment));
      setAssignments(fetchedAssignments);

      if (fetchedAssignments.length > 0 && !selectedAssignmentId) {
        setSelectedAssignmentId(fetchedAssignments[0].id);
      }

      const usersSnap = await getDocs(collection(db, 'users'));
      const usersMap: Record<string, string> = {};
      usersSnap.docs.forEach(doc => {
        const u = doc.data();
        usersMap[doc.id] = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
      });

      const regsRef = collection(db, 'timeRegistrations');
      const regsQuery = profile.role === 'admin'
        ? query(regsRef, orderBy('date', 'desc'))
        : query(regsRef, where('zzpId', '==', profile.uid), orderBy('date', 'desc'));

      const regsSnap = await getDocs(regsQuery);
      const regs = regsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        zzpName: usersMap[(doc.data() as TimeRegistration).zzpId] || 'Onbekend'
      } as any));

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

  useEffect(() => {
    if (viewMode === 'timesheet') {
      const newTimesheetData: typeof timesheetData = {};
      const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
      
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existing = registrations.find(r => 
          r.date === dateStr && 
          r.assignmentId === selectedAssignmentId &&
          (profile?.role === 'admin' ? true : r.zzpId === profile?.uid)
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
        zzpId: profile.role === 'admin' ? (currentAssignment?.zzpId || '') : profile.uid,
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
    if (!window.confirm(submit ? "Week indienen?" : "Concept opslaan?")) return;

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
          zzpId: profile.role === 'admin' ? currentAssignment?.zzpId : profile.uid,
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

  if (loading) return <div className="p-8 text-center text-gray-500">Laden...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Urenregistratie</h1>
          <p className="text-gray-500">Beheer je gewerkte uren.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-white border rounded-xl p-1 shadow-sm flex">
            <button onClick={() => setViewMode('list')} className={cn("p-2 rounded-lg", viewMode === 'list' ? "bg-pink-100 text-pink-600" : "text-gray-400")}><List className="h-5 w-5" /></button>
            <button onClick={() => setViewMode('timesheet')} className={cn("p-2 rounded-lg", viewMode === 'timesheet' ? "bg-pink-100 text-pink-600" : "text-gray-400")}><CalendarIcon className="h-5 w-5" /></button>
          </div>
          {viewMode === 'list' && (
            <button onClick={() => { setEditingReg(null); setIsModalOpen(true); }} className="bg-pink-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2">
              <Plus className="h-5 w-5" /> Nieuwe Dag
            </button>
          )}
        </div>
      </div>

      {viewMode === 'timesheet' ? (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-50 rounded-lg p-1">
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} className="p-1"><ChevronLeft className="h-4 w-4"/></button>
                <span className="px-4 font-bold text-sm">Week {format(currentWeekStart, 'w')}</span>
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} className="p-1"><ChevronRight className="h-4 w-4"/></button>
              </div>
              <select value={selectedAssignmentId} onChange={(e) => setSelectedAssignmentId(e.target.value)} className="border-gray-200 rounded-xl text-sm">
                {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleSaveTimesheet(false)} disabled={isSaving} className="px-4 py-2 text-sm font-semibold text-gray-600">Concept</button>
              <button onClick={() => handleSaveTimesheet(true)} disabled={isSaving} className="bg-pink-600 text-white px-6 py-2 rounded-xl font-bold text-sm">Indienen</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDays.map(day => {
              const dStr = format(day, 'yyyy-MM-dd');
              return (
                <div key={dStr} className={cn("bg-white p-4 rounded-2xl border", isSameDay(day, new Date()) && "ring-2 ring-pink-500")}>
                  <p className="text-[10px] font-black text-gray-400 uppercase">{format(day, 'eeee', { locale: nl })}</p>
                  <p className="text-lg font-bold">{format(day, 'd MMM')}</p>
                  <input 
                    type="number" 
                    value={timesheetData[dStr]?.totalHours || ''} 
                    onChange={(e) => setTimesheetData({...timesheetData, [dStr]: {...timesheetData[dStr], totalHours: e.target.value}})}
                    className="w-full bg-gray-50 border-none rounded-xl mt-2 font-bold text-center focus:ring-pink-500"
                    placeholder="0.0"
                  />
                  <textarea 
                    value={timesheetData[dStr]?.description || ''} 
                    onChange={(e) => setTimesheetData({...timesheetData, [dStr]: {...timesheetData[dStr], description: e.target.value}})}
                    className="w-full bg-gray-50 border-none rounded-xl text-xs mt-2 focus:ring-pink-500"
                    rows={2}
                    placeholder="Wat gedaan?"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase">Datum</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase">Opdracht</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase text-center">Uren</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registrations.map(reg => (
                <tr key={reg.id} className="hover:bg-pink-50/20 transition-colors">
                  <td className="px-6 py-4 font-bold">{format(new Date(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                  <td className="px-6 py-4">
                    <p className="font-semibold">{assignments.find(a => a.id === reg.assignmentId)?.title || '...'}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[200px]">{reg.description}</p>
                  </td>
                  <td className="px-6 py-4 text-center"><span className="bg-gray-100 px-3 py-1 rounded-full text-sm font-black">{reg.totalHours}u</span></td>
                  <td className="px-6 py-4"><StatusBadge status={reg.status} /></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {reg.status === 'submitted' && profile?.role === 'admin' && (
                        <button onClick={() => handleApprove(reg.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg"><Check className="h-4 w-4"/></button>
                      )}
                      {(reg.status === 'draft' || profile?.role === 'admin') && (
                        <>
                          <button onClick={() => { setEditingReg(reg); setFormData({...reg}); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil className="h-4 w-4"/></button>
                          <button onClick={() => { if(window.confirm('Verwijderen?')) deleteDoc(doc(db, 'timeRegistrations', reg.id)).then(fetchData); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4"/></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {registrations.length === 0 && <div className="p-10 text-center text-gray-400">Nog geen uren gevonden.</div>}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
             <h2 className="text-2xl font-black mb-6">{editingReg ? 'Aanpassen' : 'Nieuwe Registratie'}</h2>
             <form onSubmit={handleSubmit} className="space-y-4">
                {assignments.length === 0 ? (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                    Geen opdrachten gevonden voor uw account.
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 block mb-1">Opdracht</label>
                    <select required value={formData.assignmentId} onChange={e => setFormData({...formData, assignmentId: e.target.value})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500">
                      <option value="">Kies opdracht...</option>
                      {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 block mb-1">Datum</label>
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500" />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 block mb-1">Pauze (min)</label>
                    <input type="number" value={formData.breakMinutes} onChange={e => setFormData({...formData, breakMinutes: parseInt(e.target.value) || 0})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 block mb-1">Start</label>
                    <input type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500" />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 block mb-1">Eind</label>
                    <input type="time" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 block mb-1">Omschrijving</label>
                  <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500" rows={3} placeholder="Wat heb je gedaan?" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 font-bold text-gray-500 hover:bg-gray-50 rounded-xl py-3">Annuleren</button>
                  <button type="submit" disabled={isSaving || assignments.length === 0} className="flex-1 bg-pink-600 text-white py-3 rounded-xl font-bold disabled:bg-gray-300 shadow-lg shadow-pink-200">
                    {isSaving ? 'Opslaan...' : 'Opslaan'}
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
    draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Concept' },
    submitted: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Ingeleverd' },
    approved: { bg: 'bg-green-100', text: 'text-green-600', label: 'Akkoord' },
    rejected: { bg: 'bg-red-100', text: 'text-red-600', label: 'Geweigerd' }
  };
  const { bg, text, label } = config[status] || config.draft;
  return <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider", bg, text)}>{label}</span>;
};

export default TimeRegistrations;
