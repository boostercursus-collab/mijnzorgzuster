import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, RegistrationStatus } from '../types';
import { Plus, Pencil, Trash2, Check, Clock, Send, Calendar as CalendarIcon, ChevronLeft, ChevronRight, List, AlertTriangle } from 'lucide-react';
import { format, differenceInMinutes, parse, startOfWeek, addDays, isSameDay, endOfWeek } from 'date-fns';
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
      // 1. Haal opdrachten op
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

      // 2. Haal users op voor namen
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersMap: Record<string, string> = {};
      usersSnap.docs.forEach(doc => {
        const u = doc.data();
        usersMap[doc.id] = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
      });

      // 3. Haal registraties op - Let op de Index in Firestore!
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

  // Update timesheetData: Cruciale fix voor weergave eigen uren
  useEffect(() => {
    if (viewMode === 'timesheet') {
      const newTimesheetData: typeof timesheetData = {};
      const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
      
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        // Filter op datum, opdracht EN zzpId (behalve voor admin die alles mag zien)
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
    
    const confirmMsg = submit 
      ? "Weet je zeker dat je de uren van deze week wilt indienen? Je kunt ze daarna niet meer wijzigen." 
      : "Wil je de huidige uren opslaan als concept?";
      
    if (!window.confirm(confirmMsg)) return;

    setIsSaving(true);
    try {
      const currentAssignment = assignments.find(a => a.id === selectedAssignmentId);
      const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

      for (const day of weekDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const entry = timesheetData[dateStr];
        const hours = parseFloat(entry?.totalHours || '0');
        
        // Zoek bestaande registratie specifiek voor deze gebruiker
        const existing = registrations.find(r => 
          r.date === dateStr && 
          r.assignmentId === selectedAssignmentId &&
          (profile.role === 'admin' ? true : r.zzpId === profile.uid)
        );

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

        if (submit) payload.submittedAt = new Date().toISOString();

        if (existing) {
          if (existing.status === 'draft' || existing.status === 'rejected' || profile.role === 'admin') {
            await updateDoc(doc(db, 'timeRegistrations', existing.id), payload);
          }
        } else {
          await addDoc(collection(db, 'timeRegistrations'), { ...payload, createdAt: new Date().toISOString() });
        }
      }
      await fetchData();
      alert(submit ? 'Week succesvol ingediend!' : 'Concepten opgeslagen.');
    } catch (error) {
      console.error(error);
      alert('Er ging iets mis bij het opslaan.');
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

  // --- Rendering (ongewijzigd qua UI, functioneel gekoppeld aan nieuwe logica) ---
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Urenregistratie</h1>
          <p className="text-gray-500">Beheer je gewerkte uren en dien ze in voor facturatie.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-white border rounded-xl p-1 shadow-sm flex">
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-pink-100 text-pink-600" : "text-gray-400 hover:text-gray-600")}
            >
              <List className="h-5 w-5" />
            </button>
            <button 
              onClick={() => setViewMode('timesheet')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'timesheet' ? "bg-pink-100 text-pink-600" : "text-gray-400 hover:text-gray-600")}
            >
              <CalendarIcon className="h-5 w-5" />
            </button>
          </div>
          
          {viewMode === 'list' && (
            <button
              onClick={() => { setEditingReg(null); setIsModalOpen(true); }}
              className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-pink-200 transition-all active:scale-95"
            >
              <Plus className="h-5 w-5" />
              <span>Nieuwe Dag</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'timesheet' ? (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-50 rounded-lg p-1">
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} className="p-2 hover:bg-white rounded-md shadow-sm transition-all"><ChevronLeft className="h-4 w-4"/></button>
                <span className="px-4 font-bold text-sm min-w-[150px] text-center">Week {format(currentWeekStart, 'w')}</span>
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} className="p-2 hover:bg-white rounded-md shadow-sm transition-all"><ChevronRight className="h-4 w-4"/></button>
              </div>
              <select 
                value={selectedAssignmentId} 
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
                className="border-gray-200 rounded-xl text-sm focus:ring-pink-500 focus:border-pink-500"
              >
                {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => handleSaveTimesheet(false)}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Opslaan als concept
              </button>
              <button 
                onClick={() => handleSaveTimesheet(true)}
                disabled={isSaving}
                className="bg-pink-600 text-white px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-pink-700 disabled:bg-gray-300 transition-all"
              >
                <Send className="h-4 w-4" />
                Dien Week In
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDays.map(day => {
              const dStr = format(day, 'yyyy-MM-dd');
              const isToday = isSameDay(day, new Date());
              return (
                <div key={dStr} className={cn("bg-white p-4 rounded-2xl border transition-all", isToday ? "ring-2 ring-pink-500 ring-opacity-50" : "hover:border-pink-200")}>
                  <div className="mb-3">
                    <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest">{format(day, 'eeee', { locale: nl })}</p>
                    <p className={cn("text-lg font-bold", isToday ? "text-pink-600" : "text-gray-900")}>{format(day, 'd MMM')}</p>
                  </div>
                  <input 
                    type="number" 
                    placeholder="0.0"
                    value={timesheetData[dStr]?.totalHours || ''}
                    onChange={(e) => setTimesheetData({...timesheetData, [dStr]: {...timesheetData[dStr], totalHours: e.target.value}})}
                    className="w-full border-gray-100 bg-gray-50 rounded-xl focus:bg-white focus:ring-pink-500 mb-2 font-bold text-center"
                  />
                  <textarea 
                    placeholder="Beschrijving..."
                    value={timesheetData[dStr]?.description || ''}
                    onChange={(e) => setTimesheetData({...timesheetData, [dStr]: {...timesheetData[dStr], description: e.target.value}})}
                    className="w-full border-none bg-gray-50 rounded-xl text-xs focus:ring-pink-500"
                    rows={3}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 border-b">
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
                <tr key={reg.id} className="group hover:bg-pink-50/20 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{format(new Date(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-800">{assignments.find(a => a.id === reg.assignmentId)?.title || '...'}</p>
                    <p className="text-xs text-gray-500 truncate max-w-xs">{reg.description}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-gray-100 px-3 py-1 rounded-full font-black text-sm">{reg.totalHours}u</span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={reg.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
          {registrations.length === 0 && (
            <div className="p-20 text-center">
              <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="text-gray-300 h-8 w-8" />
              </div>
              <p className="text-gray-400 font-medium">Nog geen uren geregistreerd.</p>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-pink-600"></div>
             <h2 className="text-2xl font-black text-gray-900 mb-6">{editingReg ? 'Aanpassen' : 'Nieuwe Registratie'}</h2>
             
             <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Opdracht</label>
                  <select 
                    required 
                    value={formData.assignmentId} 
                    onChange={e => setFormData({...formData, assignmentId: e.target.value})}
                    className="w-full border-gray-200 rounded-xl focus:ring-pink-500 focus:border-pink-500"
                  >
                    <option value="">Kies een opdracht...</option>
                    {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Datum</label>
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500 focus:border-pink-500" />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Pauze (min)</label>
                    <input type="number" value={formData.breakMinutes} onChange={e => setFormData({...formData, breakMinutes: parseInt(e.target.value) || 0})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500 focus:border-pink-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Start</label>
                    <input type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-full border-gray-200 rounded-xl focus:ring-pink-500 focus:border-pink-500" />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Eind</label>
