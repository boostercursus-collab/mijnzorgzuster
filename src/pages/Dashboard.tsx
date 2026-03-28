import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Clock, Euro, Briefcase, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any | null>(null);
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
      const userDoc = await getDoc(doc(db, 'users', uid));
      const profile = userDoc.exists() ? { uid, ...userDoc.data() } : null;
      setUserProfile(profile);

      const isAdmin = profile?.role === 'admin';

      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', uid), orderBy('date', 'desc'));

      const assignQuery = isAdmin
        ? collection(db, 'assignments')
        : query(collection(db, 'assignments'), where('uid', '==', uid));

      const [regSnap, assignSnap, allUsersSnap] = await Promise.all([
        getDocs(regQuery),
        getDocs(assignQuery),
        getDocs(collection(db, 'users')) // Altijd users ophalen voor namen in de lijst
      ]);

      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeRegistration)));
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
      setAllUsers(allUsersSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
      
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper om naam correct weer te geven uit jouw database velden
  const getUserDisplayName = (user: any) => {
    if (!user) return 'Onbekend';
    return user.displayName || user.email || 'Gebruiker';
  };

  const isAdmin = userProfile?.role === 'admin';
  const displayFullName = getUserDisplayName(userProfile);

  // BEREKENINGEN
  const totalHours = registrations.reduce((acc, reg) => acc + (parseFloat(String(reg.duration)) || 0), 0);
  const totalRevenue = registrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const duration = parseFloat(String(reg.duration)) || 0;
    const rate = parseFloat(String(assignment?.hourlyRate)) || 0;
    return acc + (duration * rate);
  }, 0);

  const getZzpDisplayNameById = (uid: string) => {
    const found = allUsers.find(u => u.uid === uid);
    return getUserDisplayName(found);
  };

  if (loading) return (
    <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase tracking-widest">
      Dashboard laden...
    </div>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">
            Welkom, 👋 <span className="text-pink-600">{displayFullName}</span>
          </h1>
          <p className="text-gray-500 font-medium text-lg mt-1">
            {isAdmin ? 'Bedrijfsoverzicht van alle ZZP-activiteiten' : 'Jouw persoonlijke uren en verdiensten'}
          </p>
        </div>
        <div className="bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-gray-100 font-black text-[10px] uppercase text-pink-600 flex items-center gap-2 tracking-widest">
          <div className={`h-2.5 w-2.5 rounded-full ${isAdmin ? 'bg-pink-500 animate-pulse' : 'bg-green-500'}`}></div>
          {userProfile?.role || 'ZZP'} ACCOUNT
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard icon={<Clock />} label="Totaal Uren" value={`${totalHours.toFixed(1)}u`} color="bg-blue-600" />
        <StatCard icon={<Euro />} label="Totale Omzet" value={`€${totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`} color="bg-emerald-600" />
        <StatCard icon={<Briefcase />} label="Opdrachten" value={assignments.length.toString()} color="bg-pink-600" />
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <h2 className="text-xl font-black text-gray-900">Recente Activiteiten</h2>
          <TrendingUp className="text-gray-300" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-6">Datum</th>
                {isAdmin && <th className="px-8 py-6">ZZP'er</th>}
                <th className="px-8 py-6">Opdracht</th>
                <th className="px-8 py-6 text-right">Uren</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {registrations.slice(0, 10).map(reg => {
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                return (
                  <tr key={reg.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-8 py-5 font-bold text-gray-700">
                      {reg.date ? format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl }) : '-'}
                    </td>
                    {isAdmin && (
                      <td className="px-8 py-5">
                        <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-tighter">
                          {getZzpDisplayNameById(reg.uid)}
                        </span>
                      </td>
                    )}
                    <td className="px-8 py-5 text-gray-500 font-medium">
                      {assignment?.title || 'Geen opdracht gevonden'}
                    </td>
                    <td className="px-8 py-5 font-black text-right text-gray-900">
                      {parseFloat(String(reg.duration)).toFixed(1)}u
                    </td>
                  </tr>
                );
              })}
              {registrations.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                    Nog geen activiteiten geregistreerd.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// StatCard component - Correct afgesloten voor Vercel build
const StatCard = ({ icon, label, value, color }: { icon: any, label: string, value: string, color: string }) => {
  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center space-x-6 hover:shadow-xl transition-all duration-300">
      <div className={`${color} p-4 rounded-2xl text-white shadow-lg`}>
        {React.cloneElement(icon, { size: 28 })}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-black text-gray-900">{value}</p>
      </div>
    </div>
  );
};

export default Dashboard;
