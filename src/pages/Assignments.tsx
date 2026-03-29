import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, Briefcase, Calendar, User, Euro, List, ArrowLeft, Trash2, Edit2 } from 'lucide-react';

const Assignments: React.FC = () => {
  const [view, setView] = useState<'list' | 'add'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [zzps, setZzps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    clientId: '',
    uid: '', 
    startDate: '',
    endDate: '',
    rate: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const clientsSnap = await getDocs(collection(db, 'clients'));
      setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const usersSnap = await getDocs(collection(db, 'users'));
      setZzps(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any)).filter(u => u.role === 'zzp' || !u.role));

      const assignmentsSnap = await getDocs(query(collection(db, 'assignments'), orderBy('createdAt', 'desc')));
      setAssignments(assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Fout bij ophalen data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (asg: any) => {
    setEditingId(asg.id);
    setForm({
      title: asg.title,
      clientId: asg.clientId,
      uid: asg.uid,
      startDate: asg.startDate,
      endDate: asg.endDate || '',
      rate: asg.rate.toString()
    });
    setView('add');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Weet je zeker dat je deze opdracht wilt verwijderen?")) {
      try {
        await deleteDoc(doc(db, 'assignments', id));
        setAssignments(assignments.filter(a => a.id !== id));
      } catch (err) {
        alert("Verwijderen mislukt.");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const data = {
        ...form,
        rate: parseFloat(form.rate) || 0,
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'assignments', editingId), data);
      } else {
        await addDoc(collection(db, 'assignments'), { ...data, createdAt: serverTimestamp(), status: 'active' });
      }
      
      await fetchData();
      setForm({ title: '', clientId: '', uid: '', startDate: '', endDate: '', rate: '' });
      setEditingId(null);
      setView('list');
    } catch (err) {
      alert("Fout bij opslaan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || clients.find(c => c.id === id)?.companyName || 'Onbekend';
  const getZzpName = (uid: string) => zzps.find(z => z.uid === uid)?.displayName || zzps.find(z => z.uid === uid)?.email || 'Onbekend';

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-pink-600 rounded-2xl text-white"><Briefcase size={32} /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tight">Opdrachten</h1>
            <p className="text-gray-500 font-medium">Beheer ZZP-koppelingen</p>
          </div>
        </div>
        <button 
          onClick={() => { setView(view === 'list' ? 'add' : 'list'); setEditingId(null); setForm({title:'',clientId:'',uid:'',startDate:'',endDate:'',rate:''}); }}
          className="bg-[#111827] text-white px-6 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-black transition-all shadow-lg uppercase text-sm"
        >
          {view === 'list' ? <><Plus size={20} /> Nieuwe Opdracht</> : <><ArrowLeft size={20} /> Terug</>}
        </button>
      </div>

      {loading ? (
        <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase">Laden...</div>
      ) : view === 'list' ? (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-6">Opdracht</th>
                <th className="px-8 py-6">Klant & ZZP-er</th>
                <th className="px-8 py-6 text-right">Tarief</th>
                <th className="px-8 py-6 text-center">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.map(asg => (
                <tr key={asg.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="font-bold text-gray-900">{asg.title}</div>
                    <div className="text-[10px] text-gray-400 font-medium">{asg.startDate} / {asg.endDate || '∞'}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-sm font-bold text-gray-700">{getClientName(asg.clientId)}</div>
                    <div className="text-xs text-pink-600 font-medium">{getZzpName(asg.uid)}</div>
                  </td>
                  <td className="px-8 py-5 text-right font-black text-gray-900">€{asg.rate}</td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleEdit(asg)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"><Edit2 size={18} /></button>
                      <button onClick={() => handleDelete(asg.id)} className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-gray-100 space-y-8 animate-in fade-in duration-500">
          <h2 className="text-xl font-black uppercase tracking-tight text-gray-800">{editingId ? 'Opdracht Aanpassen' : 'Nieuwe Opdracht'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Titel</label>
              <input type="text" required className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none
