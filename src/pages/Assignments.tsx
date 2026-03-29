import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, Briefcase, Calendar, User, Euro } from 'lucide-react';

const Assignments: React.FC = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [zzps, setZzps] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newAssignment, setNewAssignment] = useState({
    title: '',
    clientId: '',
    uid: '', 
    startDate: '',
    endDate: '',
    rate: ''
  });

  useEffect(() => {
    const fetchLists = async () => {
      setLoadingLists(true);
      try {
        const clientsSnap = await getDocs(collection(db, 'clients'));
        setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const usersSnap = await getDocs(collection(db, 'users'));
        const zzpsList = usersSnap.docs
          .map(d => ({ uid: d.id, ...d.data() } as any))
          .filter(u => u.role === 'zzp' || !u.role); 
        setZzps(zzpsList);
      } catch (err) {
        console.error("Fout bij ophalen lijsten:", err);
      } finally {
        setLoadingLists(false);
      }
    };
    fetchLists();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssignment.clientId || !newAssignment.uid) {
      alert("Selecteer een klant en een ZZP-er.");
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'assignments'), {
        ...newAssignment,
        rate: parseFloat(newAssignment.rate) || 0,
        createdAt: serverTimestamp(),
        status: 'active'
      });
      alert("Opdracht succesvol aangemaakt!");
      setNewAssignment({ title: '', clientId: '', uid: '', startDate: '', endDate: '', rate: '' });
    } catch (err) {
      alert("Opslaan mislukt.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-pink-600 rounded-2xl text-white"><Briefcase size={32} /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tight">Nieuwe Opdracht</h1>
          <p className="text-gray-500 font-medium">Koppel een ZZP-er aan een klant</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-gray-100 space-y-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Titel</label>
            <input 
              type="text" required className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none"
              value={newAssignment.title}
              onChange={(e) => setNewAssignment({...newAssignment, title: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Klant</label>
              <select 
                required className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none"
                value={newAssignment.clientId}
                onChange={(e) => setNewAssignment({...newAssignment, clientId: e.target.value})}
              >
                <option value="">{loadingLists ? 'Laden...' : 'Kies Klant...'}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name || c.companyName || 'Naamloos'}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">ZZP-er</label>
              <select 
                required className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none"
                value={newAssignment.uid}
                onChange={(e) => setNewAssignment({...newAssignment, uid: e.target.value})}
              >
                <option value="">{loadingLists ? 'Laden...' : 'Kies ZZP-er...'}</option>
                {zzps.map(z => <option key={z.uid} value={z.uid}>{z.displayName || z.email}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Start</label>
              <input type="date" className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none" value={newAssignment.startDate} onChange={(e) => setNewAssignment({...newAssignment, startDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Eind</label>
              <input type="date" className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none" value={newAssignment.endDate} onChange={(e) => setNewAssignment({...newAssignment, endDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Tarief</label>
              <input type="number" className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none outline-none" value={newAssignment.rate} onChange={(e) => setNewAssignment({...newAssignment, rate: e.target.value})} />
            </div>
          </div>
        </div>

        <button type="submit" disabled={isSubmitting} className="w-full bg-[#111827] text-white py-6 rounded-3xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl uppercase tracking-widest disabled:opacity-50">
          {isSubmitting ? 'Bezig...' : <><Plus size={20} /> Opdracht Opslaan</>}
        </button>
      </form>
    </div>
  );
};

export default Assignments;
