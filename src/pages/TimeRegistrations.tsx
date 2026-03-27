import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, RegistrationStatus } from '../types';
import { Plus, Pencil, Trash2, X, Check, AlertCircle, Clock, Send, Calendar as CalendarIcon, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { format, differenceInMinutes, parse, startOfWeek, addDays, isSameDay, parseISO, endOfWeek } from 'date-fns';
import { nl } from 'date-fns/locale';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  const [formData, setFormData] = useState({
    assignmentId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    description: ''
  });
  const [isAutoSavingModal, setIsAutoSavingModal] = useState(false);
  const [lastAutoSaveModal, setLastAutoSaveModal] = useState<Date | null>(null);

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
        profile.role === 'admin' ? getDocs(collection(db, 'users')).catch(e => handleFirestoreError(e, OperationType.LIST, 'users')) : Promise.resolve(null)
      ]);

      const usersMap: { [key: string]: string } = {};
      if (usersSnap) {
        usersSnap.docs.forEach(doc => {
          const userData = doc.data();
          usersMap[doc.id] = `${userData.firstName} ${userData.lastName}`;
        });
      }

      const regs = regsSnap.docs.map(doc => {
        const data = doc.data() as TimeRegistration;
        return {
          id: doc.id,
          ...data,
          zzpName: usersMap[data.zzpId] || 'Onbekend'
        };
      });

      setRegistrations(regs);
      setAssignments(assignSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as any as Assignment)));
      
      if (assignSnap.docs.length > 0 && !selectedAssignmentId) {
        setSelectedAssignmentId(assignSnap.docs[0].id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalHours = (start: string, end: string, breakMin: number) => {
    const startTime = parse(start, 'HH:mm', new Date());
    const endTime = parse(end, 'HH:mm', new Date());
    const diff = differenceInMinutes(endTime, startTime);
    return Math.max(0, (diff - breakMin) / 60);
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
        status: 'draft' as RegistrationStatus,
      };

      if (editingReg) {
        await updateDoc(doc(db, 'timeRegistrations', editingReg.id), data).catch(e => handleFirestoreError(e, OperationType.UPDATE, `timeRegistrations/${editingReg.id}`));
      } else {
        await addDoc(collection(db, 'timeRegistrations'), data).catch(e => handleFirestoreError(e, OperationType.CREATE, 'timeRegistrations'));
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

      await updateDoc(doc(db, 'timeRegistrations', reg.id), updateData).catch(e => handleFirestoreError(e, OperationType.UPDATE, `timeRegistrations/${reg.id}`));
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Weet u zeker dat u deze registratie wilt verwijderen?')) {
      try {
        await deleteDoc(doc(db, 'timeRegistrations', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `timeRegistrations/${id}`));
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
      // Only set if data is actually different to avoid unnecessary re-renders/auto-saves
      setTimesheetData(prev => {
        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
    }
  }, [viewMode, currentWeekStart, selectedAssignmentId, registrations]);

  // Auto-save logic
  useEffect(() => {
    if (viewMode !== 'timesheet' || !selectedAssignmentId || Object.keys(timesheetData).length === 0) return;

    const timer = setTimeout(() => {
      // Check if there's actually something to save compared to registrations
      const hasChanges = weekDays.some(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const entry = timesheetData[dateStr];
        const existing = registrations.find(r => r.date === dateStr && r.assignmentId === selectedAssignmentId);
        
        const hours = parseFloat(entry.totalHours) || 0;
        const existingHours = existing?.totalHours || 0;
        const desc = entry.description || '';
        const existingDesc = existing?.description || '';

        return hours !== existingHours || desc !== existingDesc;
      });

      if (hasChanges) {
        autoSaveTimesheet();
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [timesheetData]);

  const autoSaveTimesheet = async () => {
    if (!profile || !selectedAssignmentId) return;
    setIsAutoSaving(true);
    try {
      const currentAssignment = assignments.find(a => a.id === selectedAssignmentId);
      if (!currentAssignment) return;

      for (const day of weekDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const entry = timesheetData[dateStr];
        const hours = parseFloat(entry.totalHours);
        const existing = registrations.find(r => r.date === dateStr && r.assignmentId === selectedAssignmentId);

        // Skip if no change for this specific day
        const currentHours = isNaN(hours) ? 0 : hours;
        const existingHours = existing?.totalHours || 0;
        const currentDesc = entry.description || '';
        const existingDesc = existing?.description || '';

        if (currentHours === existingHours && currentDesc === existingDesc) continue;

        if (isNaN(hours) || hours <= 0) {
          if (existing && existing.status === 'draft') {
            await deleteDoc(doc(db, 'timeRegistrations', existing.id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `timeRegistrations/${existing.id}`));
          }
          continue;
        }

        const start = existing?.startTime || '09:00';
        const startParsed = parse(start, 'HH:mm', new Date());
        const endTime = format(new Date(startParsed.getTime() + hours * 60 * 60000), 'HH:mm');

        const data: any = {
          assignmentId: selectedAssignmentId,
          zzpId: profile.role === 'admin' ? currentAssignment.zzpId : profile.uid,
          date: dateStr,
          totalHours: hours,
          description: entry.description,
          status: existing?.status || 'draft',
          startTime: start,
          endTime: endTime,
          breakMinutes: existing?.breakMinutes || 0
        };

        if (existing) {
          if (existing.status === 'draft' || existing.status === 'rejected') {
            await updateDoc(doc(db, 'timeRegistrations', existing.id), data).catch(e => handleFirestoreError(e, OperationType.UPDATE, `timeRegistrations/${existing.id}`));
          }
        } else {
          await addDoc(collection(db, 'timeRegistrations'), data).catch(e => handleFirestoreError(e, OperationType.CREATE, 'timeRegistrations'));
        }
      }
      setLastAutoSave(new Date());
      fetchData();
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setIsAutoSaving(false);
    }
  };

  // Modal auto-save logic
  useEffect(() => {
    if (!isModalOpen || !profile || !formData.assignmentId) return;

    const timer = setTimeout(() => {
      // Check if data is different from current editingReg or if it's a new entry worth saving as draft
      const totalHours = calculateTotalHours(formData.startTime, formData.endTime, formData.breakMinutes);
      
      const hasChanges = !editingReg || (
        formData.assignmentId !== editingReg.assignmentId ||
        formData.date !== editingReg.date ||
        formData.startTime !== editingReg.startTime ||
        formData.endTime !== editingReg.endTime ||
        formData.breakMinutes !== editingReg.breakMinutes ||
        formData.description !== (editingReg.description || '')
      );

      if (hasChanges && totalHours > 0) {
        autoSaveModal();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [formData, isModalOpen]);

  const autoSaveModal = async () => {
    if (!profile) return;
    setIsAutoSavingModal(true);
    try {
      const totalHours = calculateTotalHours(formData.startTime, formData.endTime, formData.breakMinutes);
      const currentAssignment = assignments.find(a => a.id === formData.assignmentId);
      
      const data = {
        ...formData,
        zzpId: profile.role === 'admin' ? (currentAssignment?.zzpId || '') : profile.uid,
        totalHours,
        status: editingReg?.status || 'draft' as RegistrationStatus,
      };

      if (editingReg) {
        await updateDoc(doc(db, 'timeRegistrations', editingReg.id), data).catch(e => handleFirestoreError(e, OperationType.UPDATE, `timeRegistrations/${editingReg.id}`));
      } else {
        const docRef = await addDoc(collection(db, 'timeRegistrations'), data).catch(e => handleFirestoreError(e, OperationType.CREATE, 'timeRegistrations'));
        if (docRef) {
          setEditingReg({ id: docRef.id, ...data } as TimeRegistration);
        }
      }
      setLastAutoSaveModal(new Date());
      fetchData();
    } catch (error) {
      console.error('Modal auto-save error:', error);
    } finally {
      setIsAutoSavingModal(false);
    }
  };

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
            await deleteDoc(doc(db, 'timeRegistrations', existing.id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `timeRegistrations/${existing.id}`));
          }
          continue;
        }

        const start = existing?.startTime || '09:00';
        const startParsed = parse(start, 'HH:mm', new Date());
        const endTime = format(new Date(startParsed.getTime() + hours * 60 * 60000), 'HH:mm');

        const data: any = {
          assignmentId: selectedAssignmentId,
          zzpId: profile.role === 'admin' ? currentAssignment.zzpId : profile.uid,
          date: dateStr,
          totalHours: hours,
          description: entry.description,
          status: submit ? 'submitted' : (existing?.status || 'draft'),
          startTime: start,
          endTime: endTime,
          breakMinutes: existing?.breakMinutes || 0
        };

        if (submit) {
          data.submittedAt = new Date().toISOString();
        }

        if (existing) {
          if (existing.status === 'draft' || existing.status === 'rejected') {
            await updateDoc(doc(db, 'timeRegistrations', existing.id), data).catch(e => handleFirestoreError(e, OperationType.UPDATE, `timeRegistrations/${existing.id}`));
          }
        } else {
          await addDoc(collection(db, 'timeRegistrations'), data).catch(e => handleFirestoreError(e, OperationType.CREATE, 'timeRegistrations'));
        }
      }
      fetchData();
      alert(submit ? 'Week opgeslagen!' : 'Concept opgeslagen!');
    } catch (error) {
      console.error('Error saving timesheet:', error);
      alert('Fout bij opslaan timesheet.');
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
              className={cn(
                "flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === 'list' ? "bg-pink-50 text-pink-600" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <List className="h-4 w-4" />
              <span>Lijst</span>
            </button>
            <button
              onClick={() => setViewMode('timesheet')}
              className={cn(
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
        <div className="flex h-64 items-center justify-center">
          <div className="text-gray-500">Laden...</div>
        </div>
      ) : viewMode === 'timesheet' ? (
        <div className="space-y-6">
            <div className="flex flex-col space-y-4 rounded-xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
                  className="rounded-full p-1 hover:bg-gray-100"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold">
                  Week {format(currentWeekStart, 'w')} ({format(currentWeekStart, 'd MMM')} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'd MMM yyyy')})
                </span>
                <button 
                  onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
                  className="rounded-full p-1 hover:bg-gray-100"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <select
                value={selectedAssignmentId}
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              >
                {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
            <div className="flex space-x-2">
              <div className="flex items-center px-3 text-xs text-gray-500 italic">
                {isAutoSaving ? (
                  <span className="flex items-center space-x-1">
                    <Clock className="h-3 w-3 animate-spin" />
                    <span>Auto-opslaan...</span>
                  </span>
                ) : lastAutoSave ? (
                  <span>Laatst opgeslagen: {format(lastAutoSave, 'HH:mm:ss')}</span>
                ) : null}
              </div>
              <button
                onClick={() => {
                  if (window.confirm('Weet u zeker dat u de uren voor deze week wilt indienen?')) {
                    handleSaveTimesheet(true);
                  }
                }}
                disabled={isSavingTimesheet || isAutoSaving}
                className="flex items-center justify-center space-x-2 rounded-lg bg-pink-600 px-6 py-2 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4" />
                <span>Week Indienen</span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="grid grid-cols-1 divide-y sm:grid-cols-7 sm:divide-x sm:divide-y-0">
              {weekDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isToday = isSameDay(day, new Date());
                const existing = registrations.find(r => r.date === dateStr && r.assignmentId === selectedAssignmentId);
                
                return (
                  <div key={dateStr} className={cn("p-4 space-y-3", isToday && "bg-pink-50/30")}>
                    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:space-y-1">
                      <span className="text-xs font-bold uppercase text-gray-500">{format(day, 'EEEE', { locale: nl })}</span>
                      <span className={cn("text-sm font-medium", isToday ? "text-pink-600" : "text-gray-900")}>
                        {format(day, 'd MMM')}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          placeholder="0"
                          disabled={existing && existing.status !== 'draft' && existing.status !== 'rejected'}
                          value={timesheetData[dateStr]?.totalHours || ''}
                          onChange={(e) => setTimesheetData({
                            ...timesheetData,
                            [dateStr]: { ...timesheetData[dateStr], totalHours: e.target.value }
                          })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-50"
                        />
                        <span className="absolute right-3 top-2 text-xs text-gray-400">u</span>
                      </div>
                      <textarea
                        placeholder="Omschrijving..."
                        disabled={existing && existing.status !== 'draft' && existing.status !== 'rejected'}
                        value={timesheetData[dateStr]?.description || ''}
                        onChange={(e) => setTimesheetData({
                          ...timesheetData,
                          [dateStr]: { ...timesheetData[dateStr], description: e.target.value }
                        })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-50"
                        rows={2}
                      />
                    </div>

                    {existing && (
                      <div className="flex items-center space-x-1">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                          existing.status === 'approved' ? "bg-green-100 text-green-800" :
                          existing.status === 'rejected' ? "bg-red-100 text-red-800" :
                          existing.status === 'submitted' ? "bg-blue-100 text-blue-800" :
                          "bg-gray-100 text-gray-800"
                        )}>
                          {existing.status}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center justify-between rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex items-center space-x-2 text-gray-600">
              <Clock className="h-5 w-5" />
              <span className="text-sm font-medium">Totaal voor deze week:</span>
            </div>
            <span className="text-2xl font-bold text-pink-600">
              {(Object.values(timesheetData).reduce((sum: number, entry: any) => sum + (parseFloat(entry.totalHours) || 0), 0) as number).toFixed(1)} u
            </span>
          </div>
          
          <div className="flex items-center space-x-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>Vul per dag het aantal gewerkte uren in. Klik op "Week Opslaan" om de wijzigingen te bewaren. Alleen uren met de status 'Concept' of 'Afgewezen' kunnen worden gewijzigd.</p>
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
                <th className="px-6 py-4 font-semibold">Pauze</th>
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
                  <td className="px-6 py-4 text-gray-600">{reg.breakMinutes} min</td>
                  <td className="px-6 py-4 font-semibold text-gray-900">{reg.totalHours.toFixed(1)} u</td>
                  <td className="px-6 py-4">
                    <span className={cn(
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
                          {reg.status === 'draft' && (
                            <button 
                              onClick={() => handleStatusChange(reg, 'submitted')}
                              className="rounded-md p-1 text-blue-400 hover:bg-blue-50 hover:text-blue-600"
                              title="Indienen"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => {
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
                            }}
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Bewerken"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(reg.id)} 
                            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Verwijderen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {profile?.role === 'admin' && reg.status === 'submitted' && (
                        <>
                          <button 
                            onClick={() => handleStatusChange(reg, 'approved')}
                            className="rounded-md p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
                            title="Goedkeuren"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => {
                              const reason = window.prompt('Reden voor afwijzing:');
                              if (reason) handleStatusChange(reg, 'rejected', reason);
                            }}
                            className="rounded-md p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                            title="Afwijzen"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingReg ? 'Uren Bewerken' : 'Uren Schrijven'}
                </h2>
                <div className="text-[10px] text-gray-500 italic">
                  {isAutoSavingModal ? (
                    <span className="flex items-center space-x-1">
                      <Clock className="h-2.5 w-2.5 animate-spin" />
                      <span>Auto-opslaan...</span>
                    </span>
                  ) : lastAutoSaveModal ? (
                    <span>Laatst opgeslagen: {format(lastAutoSaveModal, 'HH:mm:ss')}</span>
                  ) : null}
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Opdracht</label>
                <select
                  required
                  value={formData.assignmentId}
                  onChange={(e) => setFormData({ ...formData, assignmentId: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                >
                  <option value="">Selecteer opdracht...</option>
                  {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Datum</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Starttijd</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Eindtijd</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Pauze (minuten)</label>
                <input
                  type="number"
                  required
                  value={formData.breakMinutes}
                  onChange={(e) => setFormData({ ...formData, breakMinutes: parseInt(e.target.value) })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Omschrijving</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  rows={2}
                />
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Totaal uren:</span>
                  <span className="font-bold text-pink-600">
                    {calculateTotalHours(formData.startTime, formData.endTime, formData.breakMinutes).toFixed(1)} u
                  </span>
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 transition-colors"
                >
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

export default TimeRegistrations;
