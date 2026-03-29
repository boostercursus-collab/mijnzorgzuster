import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
// ... andere imports (lucide-react, etc.)

const Assignments: React.FC = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [zzps, setZzps] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  // Form state
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    clientId: '',
    uid: '', // Dit is de ZZP'er ID
    startDate: '',
    endDate: '',
    rate: 0
  });

  useEffect(() => {
    const fetchLists = async () => {
      setLoadingLists(true);
      try {
        // 1. Haal Klanten op
        const clientsSnap = await getDocs(collection(db, 'clients'));
        const clientsList = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setClients(clientsList);
        console.log("Klanten geladen:", clientsList.length);

        // 2. Haal ZZP'ers op (gebruikers met rol 'zzp')
        const usersSnap = await getDocs(collection(db, 'users'));
        const zzpsList = usersSnap.docs
          .map(d => ({ uid: d.id, ...d.data() } as any))
          .filter(u => u.role === 'zzp' || !u.role); // Toont zzp'ers of ongedefinieerde rollen als backup
        setZzps(zzpsList);
        console.log("ZZP'ers geladen:", zzpsList.length);

      } catch (err) {
        console.error("Fout bij ophalen lijsten:", err);
      } finally {
        setLoadingLists(false);
      }
    };

    fetchLists();
  }, []);

  // In je JSX (het formulier):
  // Zorg dat de select-velden er zo uitzien:

  /* <select 
    value={newAssignment.clientId}
    onChange={(e) => setNewAssignment({...newAssignment, clientId: e.target.value})}
    className="..."
  >
    <option value="">Kies Klant...</option>
    {clients.map(c => (
      <option key={c.id} value={c.id}>{c.name || c.companyName}</option>
    ))}
  </select>

  <select 
    value={newAssignment.uid}
    onChange={(e) => setNewAssignment({...newAssignment, uid: e.target.value})}
    className="..."
  >
    <option value="">Kies ZZP'er...</option>
    {zzps.map(z => (
      <option key={z.uid} value={z.uid}>{z.displayName || z.email}</option>
    ))}
  </select>
  */

  // ... rest van je component
};
