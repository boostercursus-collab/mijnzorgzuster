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

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
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

      {/* Content */}
      {viewMode === 'timesheet' ? (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-50 rounded-lg p-1">
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}><ChevronLeft className="h-4 w-4"/></button>
                <span className="px-4 font-bold text-sm">Week {format(currentWeekStart, 'w')}</span>
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}><ChevronRight className="h-4 w-4"/></button>
              </div>
              <select value={selectedAssignmentId} onChange={(e) => setSelectedAssignmentId(e.target.value)} className="border-gray-200 rounded-xl text-sm">
                {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
