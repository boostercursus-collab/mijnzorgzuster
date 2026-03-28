import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TimeRegistration, Assignment, UserProfile } from '../types';
import { Clock, Euro, Briefcase, TrendingUp, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
      const userDoc = await getDoc(doc(db, 'users', uid));
      const profile = userDoc.exists() ? { uid, ...userDoc.data() } as UserProfile : null;
      setUserProfile(profile);

      const isAdmin = profile?.role === 'admin';

      // Queries
      const regQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), orderBy('date', 'desc'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', uid), orderBy('date', 'desc'));

      const assignQuery = isAdmin
        ? collection(db, 'assignments')
        : query(collection(db, 'assignments'), where('uid', '==', uid));

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
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = userProfile?.role === 'admin';

  const displayFullName = userProfile 
    ? `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() 
    : 'Laden...';

  // VEILIGE BEREKENINGEN (Tegen NaN)
  const totalHours = registrations.reduce((acc, reg) => {
    const duration = parseFloat(String(reg.duration)) || 0;
    return acc + duration;
  }, 0);

  const totalRevenue = registrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const duration = parseFloat(String(reg.duration)) || 0;
    const rate = parseFloat(String(assignment?.hourlyRate)) || 0;
    return acc + (duration * rate);
  }, 0);

  const getZzpDisplayName = (uid: string) => {
    const found = allUsers.find(u => u.uid === uid);
    if (!found) return 'Onbekend';
    return `${found.firstName || ''} ${found.lastName || ''}`.trim() || 'Naamloze ZZP';
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-pink-100 border-t-pink-600 rounded-full animate-spin text-center"></div>
      <p className="font-black text-pink-600 uppercase tracking-widest text-xs">Gegevens verzamelen...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
            Welkom, <span className="text-pink-600">{displayFullName.split(' ')[0]}</span> 👋
          </h1>
          <p className="text-gray-500 font-medium text-lg mt-2">
            {isAdmin ? 'Real-time overzicht van je bemiddelingsbureau.' : 'Jouw actuele uren en verdiensten.'}
          </p>
        </div>
        <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-100 font-black text-xs uppercase tracking-widest text-pink-600 flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full animate-pulse ${isAdmin ? 'bg-pink-500' : 'bg-green-500'}`}></span>
          {userProfile?.role || 'ZZP'} Toegang
        </div>
      </div>

      {/* KPI Kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard icon={<Clock />} label="Geregistreerde Uren" value={`${totalHours.toFixed(1)}u`} color="bg-blue-600" />
        <StatCard icon={<Euro />} label="Verwachte Omzet" value={`€${totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} color="bg-emerald-600" />
        <StatCard icon={<Briefcase />} label="Actieve Opdrachten" value={assignments.length.toString()} color="bg-pink-600" />
      </div>

      {/* Tabel sectie */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
          <div>
            <h2 className="text-xl font-black text-gray-900">Recente Activiteiten</h2>
            <p className="text-sm text-gray-400 font-bold uppercase tracking-tighter">Laatste 10 registraties</p>
          </div>
          <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
            <TrendingUp className="text-pink-600" size={20} />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white text-[10px] font-black uppercase tracking-widest text-gray-400 border-b">
              <tr>
                <th className="px-8 py-5">Datum</th>
                {isAdmin && <th className="px-8 py-5">ZZP'er</th>}
                <th className="px-8 py-5">Opdracht</th>
                <th className="px-8 py-5 text-right">Uren</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {registrations.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center text-gray-300">
                       <Briefcase size={48} className="mb-2 opacity-20" />
                       <p className="font-bold">Nog geen data beschikbaar</p>
                    </div>
                  </td>
                </tr>
              ) : (
                registrations.slice(0, 10).map(reg => {
                  const assignment = assignments.find(a => a.id === reg.assignmentId);
                  return (
                    <tr key={reg.id} className="group hover:bg-gray-50/80 transition-all">
                      <td className="px-8 py-5 font-bold text-gray-700">
                        {reg.date ? format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl }) : '-'}
                      </td>
                      {isAdmin && (
                        <td className="px-8 py-5">
                          <span className="bg-pink-50 text-pink-700 px-4 py-1.5 rounded-xl text-xs font-black ring-1 ring-inset ring-pink-100">
                            {getZzpDisplayName(reg.uid)}
                          </span>
                        </td>
                      )}
                      <td className="px-8 py-5">
                        <div className="font-bold text-gray-900 group-hover:text-pink-600 transition-colors">
                          {assignment?.title || 'Onbekend'}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <span className="inline-flex items-center gap-1 font-black text-gray-900 bg-gray-100 px-3 py-1 rounded-lg">
                          {parseFloat(String(reg.duration)).toFixed(1)}u
                        </span>
                      </td>
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
  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center space-x-6 hover:shadow-
