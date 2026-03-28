import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Assignment, Client, UserProfile } from '../types';
import { Plus, Pencil, Trash2, X, Briefcase, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const Assignments: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<any[]>([]); // Gebruik any of UserProfile afhankelijk van je types
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    clientId: '',
    zzpId: '',
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    hourlyRate: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // We halen Assignments, Clients en de nieuwe Users collectie (gefilterd op rol zzp) op
      const [assignSnap, clientSnap, zzpSnap] = await Promise.all([
        getDocs(collection(db, 'assignments')),
        getDocs(collection(db, 'clients')),
        getDocs(query(collection(db, 'users'), where('role', '==', 'zzp')))
      ]);

      setAssignments(assignSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      setClients(clientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      
      // We mappen de users naar een formaat dat we kunnen gebruiken in de dropdown
      setZzps(zzpSnap.docs.map(doc => ({ 
        uid: doc.id, 
        ...doc.data() 
      })));
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
      setFormData({ clientId: '', zzpId: '', title: '', description: '', startDate: '', endDate: '', hourlyRate: 0 });
      fetchData();
    } catch (error) {
      console.error('Error saving assignment:', error);
    }
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setFormData({
      clientId: assignment.clientId,
      zzpId: assignment.zzpId,
      title: assignment.title,
      description: assignment.description || '',
      startDate: assignment.startDate,
      endDate: assignment.endDate || '',
      hourlyRate: assignment.hourlyRate || 0
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
  
  // Aangepaste helper om de naam van de ZZP'er te vinden in de nieuwe lijst
  const getZzpName = (id: string) => {
    const zzp = zzps.find(z => z.uid === id);
    if (!zzp) return 'Onbekend';
    // Gebruik displayName (zoals opgeslagen door AdminPanel) of combineer voornaam/achternaam
    return zzp.displayName || `${zzp.firstName || ''} ${zzp.lastName || ''}`.trim() || zzp.email;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Opdrachten</h1>
        <button
          onClick={() => {
            setEditingAssignment(null);
            setFormData({ clientId: '', zzpId: '', title: '', description: '', startDate: '', endDate: '', hourlyRate: 0 });
            setIsModalOpen(true);
          }}
          className="flex items-center space-x-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Nieuwe Opdracht</span>
        </button>
      </div>

      {loading ? (
        <div className="text-pink-600 font-medium">Data ophalen...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Titel</th>
                <th className="px-6 py-4 font-semibold">Opdrachtgever</th>
                <th className="px-6 py-4 font-semibold">ZZP'er</th>
                <th className="px-6 py-4 font-semibold">Periode</th>
                <th className="px-6 py-4 font-semibold">Tarief</th>
                <th className="px-6 py-4 font-semibold text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{assignment.title}</td>
                  <td className="px-6 py-4 text-gray-600">{getClientName(assignment.clientId)}</td>
                  <td className="px-6 py-4 text-gray-600">{getZzpName(assignment.zzpId)}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {assignment.startDate ? format(new Date(assignment.startDate), 'd MMM yyyy', { locale: nl }) : '??'}
                    {assignment.endDate && ` - ${format(new Date(assignment.endDate), 'd MMM yyyy', { locale: nl })}`}
                  </td>
                  <td className="px-6 py-4 text-gray-600">€{assignment.hourlyRate}/u</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => handleEdit(assignment)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(assignment.id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assignments.length === 0 && (
            <div className="p-8 text-center text-gray-400">Geen opdrachten gevonden.</div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingAssignment ? 'Opdracht Bewerken' : 'Nieuwe Opdracht'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Titel</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  placeholder="Bijv. Verpleegkundige Nachtdienst"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Opdrachtgever</label>
                <select
                  required
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 bg-white"
                >
                  <option value="">Selecteer...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">ZZP'er</label>
                <select
                  required
                  value={formData.zzpId}
                  onChange={(e) => setFormData({ ...formData, zzpId: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 bg-white"
                >
                  <option value="">Selecteer ZZP'er...</option>
                  {zzps.map(z => (
                    <option key={z.uid} value={z.uid}>
                      {z.displayName || `${z.firstName || ''} ${z.lastName || ''}`.trim() || z.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Startdatum</label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Einddatum (optioneel)</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Uurtarief (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Omschrijving</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  rows={3}
                />
              </div>
              <div className="flex space-x-3 pt-4 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 transition-colors shadow-lg shadow-pink-100"
                >
                  {editingAssignment ? 'Wijzigingen Opslaan' : 'Opdracht Opslaan'}
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
