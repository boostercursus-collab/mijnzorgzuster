import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
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
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // 1. Haal profiel van de huidige gebruiker op
      const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid)));
      const profile = userSnap.docs[0]?.data() as UserProfile;
      setUserProfile(profile);

      const isAdmin = profile?.role === 'admin';

      // 2. Definieer de queries
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', currentUser.uid), orderBy('date', 'desc'));

      const assignQuery = isAdmin
        ? collection(db, 'assignments')
        : query(collection(db, 'assignments'), where('uid', '==', currentUser.uid));

      // 3. Haal data parallel op
      const [regSnap, assignSnap, allUsersSnap] = await Promise.all([
        getDocs(regQuery),
        getDocs(assignQuery),
        isAdmin ? getDocs(collection(db, 'users')) : Promise.resolve({ docs: [] })
      ]);

      setRegistrations(regSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration)));
      setAssignments(assignSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
      
      if (isAdmin) {
        setAllUsers(allUsersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  // VEILIGE BEREKENINGEN (Tegen NaN)
  const isAdmin = userProfile?.role === 'admin';
  
  const totalHours = registrations.reduce((acc, reg) => {
    const val = Number(reg.duration);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const totalRevenue = registrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const rate = Number(assignment?.hourlyRate) || 0;
    const hours = Number(reg.duration) || 0;
    return acc + (hours * rate);
  }, 0);

  // NAAM HELPER
  const getZzpName = (uid: string) => {
    if (!isAdmin) return userProfile?.firstName || 'Ik';
    const found = allUsers.find(u => u.uid === uid);
    if (!found) return 'Laden...';
    return `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.email || 'ZZP';
  };

  if (loading) return <div className="p-12 text-center font-bold text-pink-600">Dashboard wordt opgebouwd...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <div>
        <h1 className="text-4xl font-black text-gray-900">
          {isAdmin ? 'Admin Dashboard' : `Welkom, ${userProfile?.firstName}`}
        </h1>
        <p className="text-gray-500 font-medium">
          {isAdmin ? 'Overzicht van alle ZZP-activiteiten' : 'Jouw urenoverzicht'}
        </p>
      </div>

      {/* KPI Kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          icon={<Clock />} 
          label="Totaal Uren" 
          value={`${totalHours.toFixed(1)}u`} 
          color="bg-blue-600" 
        />
        <StatCard 
          icon={<Euro />} 
          label="Totale Omzet" 
          value={`€${totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`} 
          color="bg-emerald-600" 
        />
        <StatCard 
          icon={<Briefcase />} 
          label="Opdrachten" 
          value={assignments.length.toString()} 
          color="bg-pink-600" 
        />
      </div>

      {/* Tabel met uren */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <h2 className="text-xl font-black text-gray-900">Laatste Registraties</h2>
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
            <tbody className="divide-y divide-gray-50 text-gray-700">
              {registrations.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-8 text-center text-gray-400">Geen registraties gevonden</td></tr>
              ) : (
                registrations.slice(0, 10).map(reg => {
                  const assignment = assignments.find(a => a.id === reg.assignmentId);
                  return (
                    <tr key={reg.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-8 py-4 font-medium">
                        {reg.date ? format(new Date(reg.date), 'dd MMM yyyy', { locale: nl }) : '-'}
                      </td>
                      {isAdmin && (
                        <td className="px-8 py-4">
                          <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full text-xs font-bold">
                            {getZzpName(reg.uid)}
                          </span>
                        </td>
                      )}
                      <td className="px-8 py-4 font-medium">{assignment?.title || 'Geen opdracht'}</td>
                      <td className="px-8 py-4 font-black text-gray-900">{reg.duration}u</td>
                    </tr>
                  );
                })
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
