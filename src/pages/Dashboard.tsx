import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Clock, Euro, Briefcase, TrendingUp, Users } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({ totalHours: 0, totalRevenue: 0, activeAssignments: 0, totalZzps: 0 });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        setLoading(true);
        
        // 1. Check de rol van de gebruiker
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        const adminStatus = userData?.role === 'admin';
        setIsAdmin(adminStatus);

        // 2. Definieer de queries op basis van de rol
        const assignmentsRef = collection(db, 'assignments');
        const registrationsRef = collection(db, 'timeRegistrations');

        // Admin ziet alles, ZZP ziet alleen eigen data
        const assignmentsQuery = adminStatus 
          ? query(assignmentsRef) 
          : query(assignmentsRef, where('uid', '==', user.uid));

        const regsQuery = adminStatus
          ? query(registrationsRef, orderBy('date', 'desc'))
          : query(registrationsRef, where('uid', '==', user.uid), orderBy('date', 'desc'));

        // 3. Haal data op
        const [assignmentsSnap, regsSnap] = await Promise.all([
          getDocs(assignmentsQuery),
          getDocs(regsQuery)
        ]);

        const assignmentsData = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const regsData = regsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 4. Bereken statistieken
        let totalHours = 0;
        let totalRevenue = 0;

        regsData.forEach((reg: any) => {
          totalHours += reg.duration;
          const assignment = assignmentsData.find(a => a.id === reg.assignmentId) as any;
          if (assignment && assignment.rate) {
            totalRevenue += (reg.duration * assignment.rate);
          }
        });

        // Voor Admin: tel ook het aantal unieke ZZP'ers met een opdracht
        const uniqueZzps = new Set(assignmentsData.map((a: any) => a.uid)).size;

        setStats({
          totalHours,
          totalRevenue,
          activeAssignments: assignmentsData.length,
          totalZzps: uniqueZzps
        });

        // 5. Activiteitenoverzicht (verrijk met opdrachtnaam)
        setRecentActivities(regsData.slice(0, 10).map(reg => {
          const assignment = assignmentsData.find(a => a.id === reg.assignmentId) as any;
          return { 
            ...reg, 
            assignmentTitle: assignment?.title || 'Onbekende opdracht',
            zzpName: assignment?.zzpName || 'ZZP-er' // Handig voor admin view
          };
        }));

      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) return <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase tracking-widest">Dashboard laden...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tight uppercase">
            Overzicht <span className="text-pink-600">{isAdmin ? 'Platform' : 'Persoonlijk'}</span>
          </h1>
          <p className="text-gray-500 font-medium">
            {isAdmin ? 'Totale statistieken over alle ZZP-ers en opdrachten' : `Welkom terug, ${auth.currentUser?.displayName}`}
          </p>
        </div>
        {isAdmin && (
          <span className="bg-pink-100 text-pink-700 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest">
            Admin Mode
          </span>
        )}
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<Clock size={28}/>} color="bg-blue-500" label="Totaal Uren" value={`${stats.totalHours.toFixed(1)}u`} />
        <StatCard icon={<Euro size={28}/>} color="bg-green-500" label="Totale Omzet" value={`€${stats.totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`} />
        <StatCard icon={<Briefcase size={28}/>} color="bg-purple-500" label="Opdrachten" value={stats.activeAssignments.toString()} />
        {isAdmin && <StatCard icon={<Users size={28}/>} color="bg-pink-600" label="Actieve ZZP'ers" value={stats.totalZzps.toString()} />}
      </div>

      {/* Recente Activiteiten */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <h2 className="text-xl font-black uppercase tracking-tight text-gray-800">
            {isAdmin ? 'Laatste Registraties (Systeem)' : 'Jouw Recente Activiteiten'}
          </h2>
          <TrendingUp className="text-gray-300" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-6">Datum</th>
                <th className="px-8 py-6">Opdracht</th>
                {isAdmin && <th className="px-8 py-6">ZZP-er</th>}
                <th className="px-8 py-6 text-right">Uren</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentActivities.length > 0 ? recentActivities.map((act) => (
                <tr key={act.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-8 py-5 font-bold text-gray-700">{act.date}</td>
                  <td className="px-8 py-5 font-medium text-pink-600">{act.assignmentTitle}</td>
                  {isAdmin && <td className="px-8 py-5 font-bold text-gray-400 text-xs uppercase">{act.zzpName || 'Ingepland'}</td>}
                  <td className="px-8 py-5 text-right font-black text-gray-900">{act.duration}u</td>
                </tr>
              )) : (
                <tr><td colSpan={isAdmin ? 4 : 3} className="px-8 py-10 text-center text-gray-400 font-bold uppercase">Geen data beschikbaar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Kleine sub-component voor de kaartjes
const StatCard = ({ icon, color, label, value }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-6">
    <div className={`p-4 ${color} rounded-2xl text-white shadow-lg`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
    </div>
  </div>
);

export default Dashboard;
