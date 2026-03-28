import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Assignment, Client } from '../types'; // UserProfile verwijderd indien niet direct gebruikt
import { Plus, Pencil, Trash2, X, Briefcase, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const Assignments: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<any[]>([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    clientId: '',
    uid: '', // AANGEPAST: zzpId -> uid
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

      setAssignments(assignSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      setClients(clientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      setZzps(zzpSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
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
      uid: '', // AANGEPAST: zzpId -> uid
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
      uid: assignment.uid, // AANGEPAST: assignment.zzpId -> assignment.uid
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Opdrachten Beheer</h1>
          <p className="text-gray-500 text-sm">Koppel ZZP'ers aan projecten.</p>
        </div>
        <button
          onClick={() => {
            setEditingAssignment(null);
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center space-x-2 rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-700 transition-all shadow-lg shadow-pink-100"
        >
          <Plus className="h-4 w-4" />
          <span>Nieuwe Opdracht</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-pink-600 font-medium">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-pink-600 border-t-transparent mr-3"></div>
          <span>Laden...</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 text-[10px] uppercase tracking-widest text-gray-400 font-black">
              <tr>
                <th className="px-6 py-4">Titel</th>
                <th className="px-6 py-4">Opdrachtgever</th>
                <th className="px-6 py-4">ZZP'er</th>
                <th className="px-6 py-4">Periode</th>
                <th className="px-6 py-4">Tarief</th>
                <th className="px-6 py-4 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-pink-50/10 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{assignment.title}</td>
                  <td className="px-6 py-4 text-gray-600">{getClientName(assignment.clientId)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="h-7 w-7 rounded-full bg-pink-100 flex items-center justify-center text-pink-700 text-[10px] font-black">
                        {getZzpName(assignment.uid).substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-gray-600 font-medium">{getZzpName(assignment.uid)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <span className="flex items-center space-x-1 text-xs">
                      <Calendar className="h-3 w-3 text-pink-500" />
                      <span className="font-medium">
                        {assignment.startDate ? format(new Date(assignment.startDate), 'd MMM yy', { locale: nl }) : '??'}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-900 font-black">€{assignment.hourlyRate}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-1">
                      <button onClick={() => handleEdit(assignment)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(assignment.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assignments.length === 0 && (
            <div className="p-16 text-center">
              <Briefcase className="h-12 w-12 text-gray-100 mx-auto mb-4" />
              <p className="text-gray-400 font-medium">Geen actieve opdrachten.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-50 pb-6">
              <h2 className="text-2xl font-black text-gray-900">
                {editingAssignment ? 'Bewerken' : 'Nieuwe Opdracht'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-gray-100 transition-colors">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Titel van de opdracht</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="block w-full rounded-xl border-gray-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-pink-500"
                  placeholder="Bijv. Projectleider Bouw"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Klant</label>
                <select
                  required
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="block w-full rounded-xl border-gray-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-pink-500 bg-gray-50/50"
                >
                  <option value="">Kies klant...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">ZZP'er</label>
                <select
                  required
                  value={formData.uid} // AANGEPAST: formData.zzpId -> formData.uid
                  onChange={(e) => setFormData({ ...formData, uid: e.target.value })}
                  className="block w-full rounded-xl border-gray-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-pink-500 bg-gray-50/50"
                >
                  <option value="">Kies ZZP'er...</option>
                  {zzps.map(z => (
                    <option key={z.uid} value={z.uid}>
                      {z.displayName || `${z.firstName || ''} ${z.lastName || ''}`.trim() || z.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Startdatum</label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="block w-full rounded-xl border-gray-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Einddatum</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="block w-full rounded-xl border-gray-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Tarief per uur</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-gray-400">€</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) })}
                    className="block w-full rounded-xl border-gray-200 pl-8 pr-4 py-3 text-sm focus:border-pink-500 focus:ring-pink-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="block w-full rounded-xl border-gray-200 px-4 py-3 text-sm bg-gray-50/50"
                >
                  <option value="active">Actief</option>
                  <option value="completed">Afgerond</option>
                  <option value="cancelled">Geannuleerd</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Omschrijving</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="block w-full rounded-xl border-gray-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-pink-500"
                  rows={3}
                  placeholder="Details over de werkzaamheden..."
                />
              </div>
              <div className="flex space-x-3 pt-6 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-pink-600 px-4 py-3 text-sm font-bold text-white hover:bg-pink-700 shadow-lg shadow-pink-100 transition-all"
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
