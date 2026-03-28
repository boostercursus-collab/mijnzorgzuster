import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, RegistrationStatus } from '../types';
import { Plus, Pencil, Trash2, X, Check, AlertCircle, Clock, Send, Calendar as CalendarIcon, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { format, differenceInMinutes, parse, startOfWeek, addDays, isSameDay, endOfWeek } from 'date-fns';
import { nl } from 'date-fns/locale';

// Helper voor classNames
const classNames = (...classes: any[]) => classes.filter(Boolean).join(' ');

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  console.error(`Firestore Error [${operationType}] on ${path}:`, error);
  throw error;
};

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
  const [isSavingTimesheet, setIsSavingTimesheet] = useState(false);

  const [formData, setFormData] = useState({
    assignmentId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    description: ''
  });

  useEffect(() => {
    if (profile) {
      fetchData();
    }
  }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const regsRef = collection(db, 'timeRegistrations');
      let regsQuery;
      
      if (profile.role === 'admin') {
        regsQuery = query(regsRef, orderBy('date', 'desc'));
      } else {
        regsQuery = query(regsRef, where('zzpId', '==', profile.uid), orderBy('date', 'desc'));
      }

      const [regsSnap, assignSnap, usersSnap] = await Promise.all([
        getDocs(regsQuery).catch(e => handleFirestoreError(e, OperationType.LIST, 'timeRegistrations')),
        getDocs(profile.role === 'admin' 
          ? collection(db, 'assignments') 
          : query(collection(db, 'assignments'), where('zzpId', '==', profile.uid))
        ).catch(e => handleFirestoreError(e, OperationType.LIST, 'assignments')),
        getDocs(collection(db, 'users')).catch(e => handleFirestoreError(e, OperationType.LIST, 'users'))
      ]);

      const usersMap: { [key: string]: string } = {};
      usersSnap.docs.forEach(doc => {
        const u = doc.data();
        usersMap[doc.id] = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
      });

      const regs = regsSnap.docs.map(doc => {
        const data = doc.data() as TimeRegistration;
        return {
          id: doc.id,
          ...data,
          zzpName: usersMap[data.zzpId] || 'Onbekend'
        };
      });

      setRegistrations(regs);
      const fetchedAssignments = assignSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as any as Assignment));
      setAssignments(fetchedAssignments);
      
      if (fetchedAssignments.length > 0 && !selectedAssignmentId) {
        setSelectedAssignmentId(fetchedAssignments[0].id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalHours = (start: string, end: string, breakMin: number) => {
    try {
      const startTime = parse(start, 'HH:mm', new Date());
      const endTime = parse(end, 'HH:mm', new Date());
      const diff = differenceInMinutes(endTime, startTime);
      return Math.max(0, (diff - breakMin) / 60);
    } catch { return 0; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const totalHours = calculateTotalHours(formData.startTime, formData.endTime, formData.breakMinutes);
    const currentAssignment = assignments.find(a => a.id === formData.assignmentId);

    try {
      const data = {
        ...formData,
        zzpId: profile.role === 'admin' ? (currentAssignment?.zzpId || '') : profile.uid,
        totalHours,
        status: editingReg?.status || 'draft' as RegistrationStatus,
      };

      if (editingReg) {
        await updateDoc(doc(db, 'timeRegistrations', editingReg.id), data);
      } else {
        await addDoc(collection(db, 'timeRegistrations'), data);
      }
      
      setIsModalOpen(false);
      setEditingReg(null);
      fetchData();
    } catch (error) {
      console.error('Error saving registration:', error);
    }
  };

  const handleStatusChange = async (reg: TimeRegistration, newStatus: RegistrationStatus, reason?: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'submitted') updateData.submittedAt = new Date().toISOString();
      if (newStatus === 'approved') updateData.approvedAt = new Date().toISOString();
      if (newStatus === 'rejected' && reason) updateData.rejectionReason = reason;

      await updateDoc(doc(db, 'timeRegistrations', reg.id), updateData);
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Weet u zeker dat u deze registratie wilt verwijderen?')) {
      try {
        await deleteDoc(doc(db, 'timeRegistrations', id));
        fetchData();
      } catch (error) {
        console.error('Error deleting registration:', error);
      }
    }
  };

  const getAssignmentTitle = (id: string) => assignments.find(a => a.id === id)?.title || 'Onbekend';
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

  useEffect(() => {
    if (viewMode === 'timesheet' && selectedAssignmentId) {
      const data: { [key: string]: { totalHours: string, description: string } } = {};
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existing = registrations.find(r => r.date === dateStr && r.assignmentId === selectedAssignmentId);
        data[dateStr] = {
          totalHours: existing ? existing.totalHours.toString() : '',
          description: existing?.description || ''
        };
      });
      setTimesheetData(data);
    }
  }, [viewMode, currentWeekStart, selectedAssignmentId, registrations]);

  const handleSaveTimesheet = async (submit = false) => {
    if (!profile || !selectedAssignmentId) return;
    setIsSavingTimesheet(true);
    try {
      const currentAssignment = assignments.find(a => a.id === selectedAssignmentId);
      if (!currentAssignment) throw new Error('Opdracht niet gevonden');

      for (const day of weekDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const entry = timesheetData[dateStr];
        const hours = parseFloat(entry.totalHours);
        const existing = registrations.find(r => r.date === dateStr && r.assignmentId === selectedAssignmentId);

        if (isNaN(hours) || hours <= 0) {
          if (existing && existing.status === 'draft') {
            await deleteDoc(doc(db, 'timeRegistrations', existing.id));
          }
          continue;
        }

        const data: any = {
          assignmentId: selectedAssignmentId,
          zzpId: profile.role === 'admin' ? currentAssignment.zzpId : profile.uid,
          date: dateStr,
          totalHours: hours,
          description: entry.description,
          status: submit ? 'submitted' : (existing?.status || 'draft'),
          startTime: existing?.startTime || '09:00',
          endTime: existing?.endTime || '17:00',
          breakMinutes: existing?.breakMinutes || 0
        };

        if (submit) data.submittedAt = new Date().toISOString();

        if (existing) {
          if (existing.status === 'draft' || existing.status === 'rejected') {
            await updateDoc(doc(db, 'timeRegistrations', existing.id), data);
          }
        } else {
          await addDoc(collection(db, 'timeRegistrations'), data);
        }
      }
      fetchData();
      alert(submit ? 'Week succesvol ingediend!' : 'Concept opgeslagen!');
    } catch (error) {
      console.error('Error saving timesheet:', error);
    } finally {
      setIsSavingTimesheet(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <h1 className="text-2xl font-bold text-gray-900">Urenregistratie</h1>
        <div className="flex items-center space-x-2">
          <div className="flex rounded-lg border bg-white p-1 shadow-sm">
            <button
              onClick={() => setViewMode('list')}
              className={classNames(
                "flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === 'list' ? "bg-pink-50 text-pink-600" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <List className="h-4 w-4" />
              <span>Lijst</span>
            </button>
            <button
              onClick={() => setViewMode('timesheet')}
              className={classNames(
                "flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === 'timesheet' ? "bg-pink-50 text-pink-600" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              <span>Timesheet</span>
            </button>
          </div>
          {viewMode === 'list' && (
            <button
              onClick={() => {
                setEditingReg(null);
                setFormData({
                  assignmentId: assignments[0]?.id || '',
                  date: format(new Date(), 'yyyy-MM-dd'),
                  startTime: '09:00',
                  endTime: '17:00',
                  breakMinutes: 30,
                  description: ''
                });
                setIsModalOpen(true);
              }}
              className="flex items-center space-x-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Uren Schrijven</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-pink-600 font-medium">Laden...</div>
      ) : viewMode === 'timesheet' ? (
        <div className="space-y-6">
          <div className="flex flex-col space-y-4 rounded-xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} className="rounded-full p-1 hover:bg-gray-100">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold">
                  Week {format(currentWeekStart, 'w')} ({format(currentWeekStart, 'd MMM')} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'd MMM yyyy')})
                </span>
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} className="rounded-full p-1 hover:bg-gray-100">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <select
                value={selectedAssignmentId}
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 bg-white"
              >
                {assignments.length === 0 ? (
                  <option value="">Geen opdrachten...</option>
                ) : (
                  assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)
                )}
              </select>
            </div>
            <button
              onClick={() => handleSaveTimesheet(true)}
              disabled={isSavingTimesheet || assignments.length === 0}
              className="flex items-center justify-center space-x-2 rounded-lg bg-pink-600 px-6 py-2 text-sm font-medium text-white hover:bg-pink-700 transition-colors shadow-md disabled:bg-gray-400"
            >
              <Send className="h-4 w-4" />
              <span>Week Indienen</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="grid grid-cols-1 divide-y sm:grid-cols-7 sm:divide-x sm:divide-y-0">
              {weekDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isToday = isSameDay(day, new Date());
                const existing = registrations.find(r => r.date === dateStr && r.assignmentId === selectedAssignmentId);
                
                return (
                  <div key={dateStr} className={classNames("p-4 space-y-3", isToday && "bg-pink-50/30")}>
                    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:space-y-1">
                      <span className="text-xs font-bold uppercase text-gray-500">{format(day, 'EEEE', { locale: nl })}</span>
                      <span className={classNames("text-sm font-medium", isToday ? "text-pink-600" : "text-gray-900")}>
                        {format(day, 'd MMM')}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <input
                        type="number"
                        step="0.5"
                        placeholder="0"
                        disabled={!selectedAssignmentId || (existing && existing.status !== 'draft' && existing.status !== 'rejected')}
                        value={timesheetData[dateStr]?.totalHours || ''}
                        onChange={(e) => setTimesheetData({
                          ...timesheetData,
                          [dateStr]: { ...timesheetData[dateStr], totalHours: e.target.value }
                        })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-50"
                      />
                      <textarea
                        placeholder="Wat heb je gedaan?"
                        disabled={!selectedAssignmentId || (existing && existing.status !== 'draft' && existing.status !== 'rejected')}
                        value={timesheetData[dateStr]?.description || ''}
                        onChange={(e) => setTimesheetData({
                          ...timesheetData,
                          [dateStr]: { ...timesheetData[dateStr], description: e.target.value }
                        })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-50"
                        rows={2}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Datum</th>
                {profile?.role === 'admin' && <th className="px-6 py-4 font-semibold">ZZP'er</th>}
                <th className="px-6 py-4 font-semibold">Opdracht</th>
                <th className="px-6 py-4 font-semibold">Tijd</th>
                <th className="px-6 py-4 font-semibold">Totaal</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {registrations.map((reg) => (
                <tr key={reg.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {format(new Date(reg.date), 'd MMM yyyy', { locale: nl })}
                  </td>
                  {profile?.role === 'admin' && (
                    <td className="px-6 py-4 text-gray-600">{reg.zzpName}</td>
                  )}
                  <td className="px-6 py-4 text-gray-600">{getAssignmentTitle(reg.assignmentId)}</td>
                  <td className="px-6 py-4 text-gray-600">{reg.startTime} - {reg.endTime}</td>
                  <td className="px-6 py-4 font-semibold text-gray-900">{reg.totalHours.toFixed(1)} u</td>
                  <td className="px-6 py-4">
                    <span className={classNames(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      reg.status === 'approved' ? "bg-green-100 text-green-800" :
                      reg.status === 'rejected' ? "bg-red-100 text-red-800" :
                      reg.status === 'submitted' ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {reg.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      {(profile?.role === 'admin' || (profile?.role === 'zzp' && reg.status === 'draft')) && (
                        <>
                          <button onClick={() => {
                            setEditingReg(reg);
                            setFormData({
                              assignmentId: reg.assignmentId,
                              date: reg.date,
                              startTime: reg.startTime,
                              endTime: reg.endTime,
                              breakMinutes: reg.breakMinutes,
                              description: reg.description || ''
                            });
                            setIsModalOpen(true);
                          }} className="p-1 text-gray-400 hover:text-gray-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(reg.id)} className="p-1 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {profile?.role === 'admin' && reg.status === 'submitted' && (
                        <button onClick={() => handleStatusChange(reg, 'approved')} className="p-1 text-green-400 hover:text-green-600">
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">{editingReg ? 'Registratie Bewerken' : 'Uren Schrijven'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Opdracht</label>
                <select
                  required
                  value={formData.assignmentId}
                  onChange={(e) => setFormData({ ...formData, assignmentId: e.target.value })}
                  className={classNames(
                    "mt-1 block w-full rounded-lg border px-3 py-2 bg-white focus:ring-pink-500 focus:border-pink-500",
                    assignments.length === 0 ? "border-red-300" : "border-gray-300"
                  )}
                >
                  {assignments.length === 0 ? (
                    <option value="" disabled>Geen opdrachten aan u toegewezen...</option>
                  ) : (
                    <>
                      <option value="">Selecteer opdracht...</option>
                      {assignments.map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </>
                  )}
                </select>
                {assignments.length === 0 && (
                  <p className="mt-2 text-xs text-red-500 bg-red-50 p-2 rounded">
                    Er zijn geen opdrachten gevonden voor uw account ({profile?.uid}). Neem contact op met de beheerder.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Starttijd</label>
                  <input 
                    type="time" 
                    value={formData.startTime} 
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} 
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Eindtijd</label>
                  <input 
                    type="time" 
                    value={formData.endTime} 
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} 
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Omschrijving</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
                  rows={3}
                  placeholder="Wat heb je gedaan?"
                />
              </div>

              <button 
                type="submit" 
                disabled={assignments.length === 0}
                className="w-full bg-pink-600 text-white py-2 rounded-lg font-bold hover:bg-pink-700 transition-colors disabled:bg-gray-400"
              >
                Opslaan
              </button>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="w-full text-gray-500 text-sm mt-2"
              >
                Annuleren
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRegistrations;
