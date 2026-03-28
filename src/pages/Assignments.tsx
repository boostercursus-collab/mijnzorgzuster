import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Assignment, Client, UserProfile } from '../types';
import { Plus, Pencil, Trash2, X, Briefcase, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const Assignments: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<UserProfile[]>([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    clientId: '',
    uid: '', // Gekoppeld aan de ZZP'er
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    hourlyRate: 0,
    status: 'active'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [assignSnap, clientSnap, zzpSnap] = await Promise.all([
        getDocs(collection(db, 'assignments')),
        getDocs(collection(db, 'clients')),
        getDocs(query(collection(db, 'users'), where('role', '==', 'zzp')))
      ]);

      setAssignments(assignSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
      setClients(clientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      setZzps(zzpSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAssignment) {
        await updateDoc(doc(db, 'assignments', editingAssignment.id), formData);
      } else {
        await addDoc(collection(db, 'assignments'), formData);
      }
      setIsModalOpen(false);
      setEditingAssignment(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving assignment:', error);
    }
  };

  const resetForm = () => {
    setFormData({ 
      clientId: '', 
      uid: '', 
      title: '', 
      description: '', 
      startDate: '', 
      endDate: '', 
      hourlyRate: 0,
      status: 'active'
    });
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setFormData({
      clientId: assignment.clientId,
      uid: assignment.uid || '', 
      title: assignment.title,
      description: assignment.description || '',
      startDate: assignment.startDate,
      endDate: assignment.endDate || '',
      hourlyRate: assignment.hourlyRate || 0,
      status: (assignment as any).status || 'active'
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Weet u zeker dat u deze opdracht wilt verwijderen?')) {
      try {
        await deleteDoc(doc(db, 'assignments', id));
        fetchData();
      } catch (error) {
        console.error('Error deleting assignment:', error);
      }
    }
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Onbekend';
  
  const getZzpName = (id: string) => {
    const zzp = zzps.find(z => z.uid === id);
    if (!zzp) return 'Niet toegewezen';
    return zzp.displayName || `${zzp.firstName || ''} ${zzp.lastName || ''}`.trim() || zzp.email;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Opdrachten Beheer</h1>
          <p className="text-gray-500 font-medium">Koppel ZZP'ers aan projecten en stel tarieven in.</p>
        </div>
        <button
          onClick={() => {
            setEditingAssignment(null);
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center space-x-2 rounded-2xl bg-pink-600 px-6 py-3 text-white font-bold hover:bg-pink-700 transition-all shadow-lg shadow-pink-100"
        >
          <Plus className="h-5 w-5" />
          <span>Nieuwe Opdracht</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-pink-600 font-bold">Data ophalen...</div>
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 border-b border-gray-50">
              <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                <th className="px-8 py-5">Titel</th>
                <th className="px-8 py-5">Opdrachtgever</th>
                <th className="px-8 py-5">ZZP'er</th>
                <th className="px-8 py-5">Periode</th>
                <th className="px-8 py-5">Tarief</th>
                <th className="px-8 py-5 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-pink-50/5 transition-colors">
                  <td className="px-8 py-5 font-bold text-gray-900">{assignment.title}</td>
                  <td className="px-8 py-5 text-gray-600 font-medium">{getClientName(assignment.clientId)}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-700 text-[10px] font-black">
                        {getZzpName(assignment.uid).substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-gray-900 font-bold">{getZzpName(assignment.uid)}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-2 text-xs font-bold text-gray-500">
                      <Calendar className="h-3 w-3 text-pink-500" />
                      <span>
                        {assignment.startDate ? format(new Date(assignment.startDate), 'd MMM yy', { locale: nl }) : '??'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 font-black text-gray-900">€{assignment.hourlyRate.toFixed(2)}</td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => handleEdit(assignment)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button onClick={() => handleDelete(assignment.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assignments.length === 0 && (
            <div className="p-20 text-center">
              <Briefcase className="h-12 w-12 text-gray-100 mx-auto mb-4" />
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Geen actieve opdrachten.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2.5rem] bg-white p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-gray-900">
                {editingAssignment ? 'Opdracht Bewerken' : 'Nieuwe Opdracht'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-gray-100 transition-colors text-gray-400">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Titel van de opdracht</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold focus:border-pink-500 focus:ring-pink-500"
                  placeholder="Bijv. Projectleider Zorg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Klant</label>
                  <select
                    required
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold focus:border-pink-500 focus:ring-pink-500"
                  >
                    <option value="">Kies klant...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">ZZP'er</label>
                  <select
                    required
                    value={formData.uid}
                    onChange={(e) => setFormData({ ...formData, uid: e.target.value })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold focus:border-pink-500 focus:ring-pink-500"
                  >
                    <option value="">Kies ZZP'er...</option>
                    {zzps.map(z => (
                      <option key={z.uid} value={z.uid}>
                        {z.firstName} {z.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Startdatum</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold focus:border-pink-500 focus:ring-pink-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-gray-400 mb-2 block tracking-widest">Tarief (€/u)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) })}
                    className="w-full rounded-2xl border-gray-100 bg-gray-50 p-4 font-bold focus:border-pink-500 focus:ring-pink-500"
                  />
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-pink-600 py-4 font-bold text-white hover:bg-pink-700 shadow-lg shadow-pink-100 transition-all"
                >
                  {editingAssignment ? 'Opslaan' : 'Toevoegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assignments;
