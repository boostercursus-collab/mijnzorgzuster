import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Assignment, Client, UserProfile } from '../types';
import { Plus, Pencil, Trash2, X, Briefcase, Calendar, Info } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const Assignments: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<any[]>([]); // 'any' om flexibel te zijn met displayName
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    clientId: '',
    uid: '', 
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
      // We halen alle users op die de rol 'zzp' hebben
      const [assignSnap, clientSnap, zzpSnap] = await Promise.all([
        getDocs(collection(db, 'assignments')),
        getDocs(collection(db, 'clients')),
        getDocs(query(collection(db, 'users'), where('role', '==', 'zzp')))
      ]);

      setAssignments(assignSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
      setClients(clientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      setZzps(zzpSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper functie voor de naamweergave (kijkt naar displayName zoals in jouw screenshot)
  const formatZzpName = (zzp?: any) => {
    if (!zzp) return 'Onbekend';
    return zzp.displayName || zzp.email || 'Naamloze ZZP';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submissionData = {
      ...formData,
      title: String(formData.title),
      endDate: formData.endDate || null 
    };

    try {
      if (editingAssignment) {
        await updateDoc(doc(db, 'assignments', editingAssignment.id), submissionData);
      } else {
        await addDoc(collection(db, 'assignments'), submissionData);
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving assignment:', error);
    }
  };

  const resetForm = () => {
    setEditingAssignment(null);
    setFormData({ 
      clientId: '', uid: '', title: '', description: '', startDate: '', endDate: '', hourlyRate: 0, status: 'active' 
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Opdrachten Beheer</h1>
          <p className="text-gray-500 font-medium">Koppel ZZP'ers aan klanten en tarieven.</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center space-x-2 rounded-2xl bg-pink-600 px-6 py-3 text-white font-black hover:bg-pink-700 transition-all shadow-lg uppercase text-sm tracking-widest"
        >
          <Plus className="h-5 w-5" />
          <span>Nieuwe Opdracht</span>
        </button>
      </div>

      {loading ? (
        <div className="p-20 text-center text-pink-600 font-black animate-pulse tracking-widest uppercase">Data laden...</div>
      ) : (
        <div className="overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-sm animate-in fade-in duration-500">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 border-b border-gray-50">
              <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                <th className="px-8 py-6">Titel & Klant</th>
                <th className="px-8 py-6">ZZP'er</th>
                <th className="px-8 py-6">Periode</th>
                <th className="px-8 py-6 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-gray-50/30 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="font-bold text-gray-900">{assignment.title}</div>
                    <div className="text-[10px] font-black uppercase text-pink-500 tracking-tighter">
                      {clients.find(c => c.id === assignment.clientId)?.name || 'Geen klant'}
                    </div>
                  </td>
                  <td className="px-8 py-5 font-bold text-gray-700">
                    <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full text-[11px] font-black">
                      {formatZzpName(zzps.find(z => z.uid === assignment.uid))}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-sm text-gray-500 font-medium">
                    {assignment.startDate ? format(new Date(assignment.startDate), 'dd MMM yy', { locale: nl }) : '??'} 
                    {assignment.endDate ? ` t/m ${format(new Date(assignment.endDate), 'dd MMM yy', { locale: nl })}` : ' (doorlopend)'}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => {
                        setEditingAssignment(assignment);
                        setFormData({
                          clientId: assignment.clientId,
                          uid: assignment.uid || '',
                          title: assignment.title,
                          description: assignment.description || '',
                          startDate: assignment.startDate || '',
                          endDate: assignment.endDate || '',
                          hourlyRate: assignment.hourlyRate || 0,
                          status: (assignment as any).status || 'active'
                        });
                        setIsModalOpen(true);
                      }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button onClick={async () => {
                        if (window.confirm('Weet je zeker dat je deze opdracht wilt verwijderen?')) {
                          await deleteDoc(doc(db, 'assignments', assignment.id));
                          fetchData();
                        }
                      }} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                {editingAssignment ? 'Opdracht Bewerken' : 'Nieuwe Opdracht'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2"><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Titel Opdracht</label>
                <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full rounded-2xl bg-gray-50 p-5 font-bold border-none focus:ring-2 focus:ring-pink-500 outline-none" placeholder="Bijv. VIG Somatiek" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Opdrachtgever</label>
                  <select required value={formData.clientId} onChange={(e) => setFormData({ ...formData, clientId: e.target.value })} className="w-full rounded-2xl bg-gray-50 p-5 font-bold border-none focus:ring-2 focus:ring-pink-500 outline-none">
                    <option value="">Kies Klant...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">ZZP'er</label>
                  <select required value={formData.uid} onChange={(e) => setFormData({ ...formData, uid: e.target.value })} className="w-full rounded-2xl bg-gray-50 p-5 font-bold border-none focus:ring-2 focus:ring-pink-500 outline-none">
                    <option value="">Kies ZZP'er...</option>
                    {zzps.map(z => <option key={z.uid} value={z.uid}>{formatZzpName(z)}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Startdatum</label>
                  <input type="date" required value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="w-full rounded-2xl bg-gray-50 p-5 font-bold border-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Einddatum</label>
                  <input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="w-full rounded-2xl bg-gray-50 p-5 font-bold border-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Tarief (€)</label>
                  <input type="number" step="0.01" required value={formData.hourlyRate} onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) })} className="w-full rounded-2xl bg-gray-50 p-5 font-bold border-none" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Notities</label>
                <textarea 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                  className="w-full rounded-2xl bg-gray-50 p-5 font-bold h-28 border-none focus:ring-2 focus:ring-pink-500 outline-none"
                  placeholder="Afdelingsdetails of contactgegevens..."
                />
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-2xl bg-gray-100 py-5 font-black text-gray-500 hover:bg-gray-200 transition-colors uppercase tracking-widest text-xs">Annuleren</button>
                <button type="submit" className="flex-1 rounded-2xl bg-[#111827] py-5 font-black text-white shadow-xl hover:bg-black transition-all uppercase tracking-widest text-xs">Opslaan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assignments;
