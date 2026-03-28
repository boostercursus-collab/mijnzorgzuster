import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment } from '../types';
import { Plus, Calendar, Clock, FileText, Trash2, CheckCircle2, XCircle, AlertCircle, LayoutGrid, List } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';

const TimeRegistrations: React.FC = () => {
  const { profile } = useAuth();
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    assignmentId: '',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    description: ''
  });

  useEffect(() => {
    if (profile?.uid) {
      fetchData();
    }
  }, [profile]);

  const fetchData = async () => {
    try {
      const regsQuery = query(
        collection(db, 'timeRegistrations'),
        where('uid', '==', profile?.uid), // Gebruik UID voor security rules
        orderBy('date', 'desc')
      );
      
      const assignmentsQuery = query(
        collection(db, 'assignments'),
        where('status', '==', 'active')
      );

      const [regsSnap, assignmentsSnap] = await Promise.all([
        getDocs(regsQuery),
        getDocs(assignmentsQuery)
      ]);

      setRegistrations(regsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration)));
      setAssignments(assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
    } catch (error) {
      console.error('Fout bij ophalen data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateHours = (start: string, end: string, breakMin: number) => {
    const startTime = new Date(`2000-01-01T${start}`);
    const endTime = new Date(`2000-01-01T${end}`);
    const diffMs = endTime.getTime() - startTime.getTime();
    const totalMinutes = diffMs / (1000 * 60);
    return Math.max(0, (totalMinutes - breakMin) / 60);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const totalHours = calculateHours(formData.startTime, formData.endTime, formData.breakMinutes);

    try {
      await addDoc(collection(db, 'timeRegistrations'), {
        ...formData,
        uid: profile.uid,
        totalHours,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setShowAddModal(false);
      fetchData();
    } catch (error) {
      console.error('Fout bij opslaan:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <span className="flex items-center space-x-1 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full text-xs"><CheckCircle2 className="h-3 w-3" /><span>Goedgekeurd</span></span>;
      case 'rejected': return <span className="flex items-center space-x-1 text-red-600 font-bold bg-red-50 px-3 py-1 rounded-full text-xs"><XCircle className="h-3 w-3" /><span>Afgewezen</span></span>;
      default: return <span className="flex items-center space-x-1 text-orange-600 font-bold bg-orange-50 px-3 py-1 rounded-full text-xs"><AlertCircle className="h-3 w-3" /><span>In afwachting</span></span>;
    }
  };

  if (loading) return <div className="p-12 text-center text-pink-600 font-bold">Laden...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Urenregistratie</h1>
          <p className="text-gray-500 font-medium">Beheer je gewerkte uren en opdrachten.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="bg-gray-100 p-1 rounded-2xl flex">
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-pink-600' : 'text-gray-400'}`}
            >
              <List className="h-5 w-5" />
            </button>
            <button 
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-pink-600' : 'text-gray-400'}`}
            >
              <Calendar className="h-5 w-5" />
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 rounded-2xl bg-gray-900 px-6 py-3 text-white font-bold hover:bg-gray-800 transition-all shadow-lg"
          >
            <Plus className="h-5 w-5" />
            <span>Nieuwe Dag</span>
          </button>
        </div>
      </header>

      {/* Tabel sectie */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 border-b border-gray-50">
            <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              <th className="px-8 py-5">Datum</th>
              <th className="px-8 py-5">Opdracht</th>
              <th className="px-8 py-5">Totaal</th>
              <th className="px-8 py-5">Status</th>
              <th className="px-8 py-5">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {registrations.map((reg) => (
              <tr key={reg.id} className="hover:bg-pink-50/5 transition-colors group">
                <td className="px-8 py-5">
                  <div className="font-bold text-gray-900">{format(parseISO(reg.date), 'dd MMMM yyyy', { locale: nl })}</div>
                  <div className="text-xs text-gray-400 font-medium">{reg.startTime} - {reg.endTime}</div>
                </td>
                <td className="px-8 py-5">
                  <div className="font-bold text-gray-700">
                    {assignments.find(a => a.id === reg.assignmentId)?.title || 'Onbekende opdracht'}
                  </div>
                </td>
                <td className="px-8 py-5 font-black text-gray-900">{reg.totalHours.toFixed(1)}u</td>
                <td className="px-8 py-5">{getStatusBadge(reg.status)}</td>
                <td className="px-8 py-5">
                  <button 
                    disabled={reg.status === 'approved'}
                    className="p-2 text-gray-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center">
                   <div className="flex flex-col items-center">
                     <div className="bg-gray-50 p-6 rounded-full mb-4">
                        <Clock className="h-10 w-10 text-gray-200" />
                     </div>
                     <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">Geen uren gevonden</span>
                   </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal - Alleen getoond als showAddModal true is */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-[2.5rem] bg-white p-10 shadow-2xl">
            <h2 className="mb-6 text-2xl font-black text-gray-900">Uren Registreren</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Datum</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold focus:border-pink-500 focus:ring-pink-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Opdracht</label>
                  <select
                    required
                    value={formData.assignmentId}
                    onChange={(e) => setFormData({ ...formData, assignmentId: e.target.value })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold focus:border-pink-500 focus:ring-pink-500"
                  >
                    <option value="">Selecteer opdracht</option>
                    {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Start</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Eind</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Pauze (min)</label>
                  <input
                    type="number"
                    value={formData.breakMinutes}
                    onChange={(e) => setFormData({ ...formData, breakMinutes: parseInt(e.target.value) })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold"
                  />
                </div>
              </div>

              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-pink-600 py-4 font-bold text-white hover:bg-pink-700 transition-colors shadow-lg shadow-pink-100"
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

export default TimeRegistrations;
