import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Clock, Euro, Briefcase, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchInitialData(user.uid);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchInitialData = async (uid: string) => {
    setLoading(true);
    try {
      // 1. Haal direct het profiel op via het document ID (uid)
      const userDoc = await getDoc(doc(db, 'users', uid));
      const profile = userDoc.exists() ? { uid, ...userDoc.data() } as UserProfile : null;
      setUserProfile(profile);

      const isAdmin = profile?.role === 'admin';

      // 2. Stel queries samen
      // We gebruiken 'uid' voor ZZP'ers om hun eigen data te filteren
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', uid), orderBy('date', 'desc'));

      const assignQuery = isAdmin
        ? collection(db, 'assignments')
        : query(collection(db, 'assignments'), where('uid', '==', uid));

      // 3. Haal data op
      const [regSnap, assignSnap, allUsersSnap] = await Promise.all([
        getDocs(regQuery),
        getDocs(assignQuery),
        isAdmin ? getDocs(collection(db, 'users')) : Promise.resolve({ docs: [] })
      ]);

      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
      
      if (isAdmin) {
        setAllUsers(allUsersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      }
    } catch (error) {
      console.error('Fout bij laden dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = userProfile?.role === 'admin';

  // VEILIGE BEREKENINGEN
  const totalHours = registrations.reduce((acc, reg) => acc + (Number(reg.duration) || 0), 0);
  
  const totalRevenue = registrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const rate = Number(assignment?.hourlyRate) || 0;
    return acc + ((Number(reg.duration) || 0) * rate);
  }, 0);

  const getZzpDisplayName = (uid: string) => {
    if (!isAdmin) return userProfile?.firstName || 'Ik';
    const found = allUsers.find(u => u.uid === uid);
    return found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() : 'Laden...';
  };

  if (loading) return <div className="p-12 text-center font-bold text-pink-600">Gegevens ophalen...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-gray-900">
            Welkom, {userProfile?.firstName || 'Gebruiker'}
          </h1>
          <p className="text-gray-500 font-medium">
            {isAdmin ? 'Admin Overzicht' : 'Jouw persoonlijke urenoverzicht'}
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100 font-black text-[10px] uppercase tracking-widest text-pink-600">
          {userProfile?.role || 'ZZP'} ACCOUNT
        </div>
      </div>

      {/* KPI Kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<Clock />} label="Totaal Uren" value={`${totalHours.toFixed(1)}u`} color="bg-blue-600" />
        <StatCard icon={<Euro />} label="Totaal Omzet" value={`€${totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`} color="bg-emerald-600" />
        <StatCard icon={<Briefcase />} label="Opdrachten" value={assignments.length.toString()} color="bg-pink-600" />
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <h2 className="text-xl font-black text-gray-900">Recente Registraties</h2>
          <TrendingUp className="text-gray-300" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-4">Datum</th>
                {isAdmin && <th className="px-8 py-4">ZZP'er</th>}
                <th className="px-8 py-4">Opdracht</th>
                <th className="px-8 py-4">Uren</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {registrations.length === 0 ? (
                <tr><td colSpan={isAdmin ? 4 : 3} className="px-8 py-10 text-center text-gray-400 font-medium">Geen uren gevonden voor deze periode.</td></tr>
              ) : (
                registrations.slice(0, 10).map(reg => (
                  <tr key={reg.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-8 py-4 font-medium">{reg.date ? format(new Date(reg.date), 'dd MMM yyyy', { locale: nl }) : '-'}</td>
                    {isAdmin && <td className="px-8 py-4 font-bold text-pink-600">{getZzpDisplayName(reg.uid)}</td>}
                    <td className="px-8 py-4 text-gray-600 font-medium">{assignments.find(a => a.id === reg.assignmentId)?.title || 'Onbekend'}</td>
                    <td className="px-8 py-4 font-black">{reg.duration}u</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, color }: { icon: any, label: string, value: string, color: string }) => (
  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center space-x-6">
    <div className={`${color} p-4 rounded-2xl text-white shadow-lg`}>
      {React.cloneElement(icon, { size: 28 })}
    </div>
    <div>
      <p className="text-xs font-black uppercase text-gray-400 tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-black text-gray-900">{value}</p>
    </div>
  </div>
);

export default Dashboard;
