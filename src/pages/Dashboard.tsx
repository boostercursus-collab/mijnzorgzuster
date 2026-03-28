import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Clock, Euro, Briefcase, Users, TrendingUp } from 'lucide-react';
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

      // 1. Haal eerst het profiel van de huidige gebruiker op om de rol te checken
      const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid)));
      const profile = userSnap.docs[0]?.data() as UserProfile;
      setUserProfile(profile);

      const isAdmin = profile?.role === 'admin';

      // 2. Stel de queries in op basis van de rol
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', currentUser.uid), orderBy('date', 'desc'));

      const assignQuery = isAdmin
        ? collection(db, 'assignments')
        : query(collection(db, 'assignments'), where('uid', '==', currentUser.uid));

      // 3. Haal de data op
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
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Berekeningen
  const isAdmin = userProfile?.role === 'admin';
  const totalHours = registrations.reduce((acc, reg) => acc + reg.duration, 0);
  const totalRevenue = registrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    return acc + (reg.duration * (assignment?.hourlyRate || 0));
  }, 0);

  const getZzpName = (uid: string) => {
    if (!isAdmin) return 'Ik';
    const user = allUsers.find(u => u.uid === uid);
    return user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Onbekend';
  };

  if (loading) return <div className="p-12 text-center font-bold text-pink-600">Laden...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <div>
        <h1 className="text-4xl font-black text-gray-900">
          {isAdmin ? 'Admin Dashboard' : `Welkom, ${userProfile?.firstName}`}
        </h1>
        <p className="text-gray-500 font-medium">
          {isAdmin ? 'Overzicht van alle ZZP-activiteiten' : 'Jouw persoonlijke uren en verdiensten'}
        </p>
      </div>

      {/* KPI Kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard icon={<Clock />} label="Uren" value={`${totalHours.toFixed(1)}u`} color="bg-blue-500" />
        <StatCard icon={<Euro />} label="Omzet" value={`€${totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`} color="bg-green-500" />
        <StatCard icon={<Briefcase />} label="Opdrachten" value={assignments.length.toString()} color="bg-pink-500" />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <h2 className="text-xl font-black">Laatste Registraties</h2>
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
              {registrations.slice(0, 10).map(reg => {
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                return (
                  <tr key={reg.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-8 py-4 font-medium">{format(new Date(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    {isAdmin && <td className="px-8 py-4 font-bold text-pink-600">{getZzpName(reg.uid)}</td>}
                    <td className="px-8 py-4 text-gray-600">{assignment?.title || 'Onbekend'}</td>
                    <td className="px-8 py-4 font-black">{reg.duration}u</td>
                  </tr>
                );
              })}
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
      <p className="text-2xl font-black text-gray-900">{value}</p>
    </div>
  </div>
);

export default Dashboard;
