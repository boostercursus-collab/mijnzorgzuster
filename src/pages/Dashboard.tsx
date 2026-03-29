import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Clock, Euro, Briefcase, TrendingUp } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({ totalHours: 0, totalRevenue: 0, activeAssignments: 0 });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        setLoading(true);

        // 1. Haal opdrachten op om het tarief te weten
        const assignmentsQuery = query(collection(db, 'assignments'), where('uid', '==', user.uid));
        const assignmentsSnap = await getDocs(assignmentsQuery);
        const assignmentsData = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 2. Haal urenregistraties op van deze ZZP'er
        const regsQuery = query(
          collection(db, 'timeRegistrations'), 
          where('uid', '==', user.uid),
          orderBy('date', 'desc')
        );
        const regsSnap = await getDocs(regsQuery);
        const regsData = regsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 3. Berekeningen
        let totalHours = 0;
        let totalRevenue = 0;

        regsData.forEach((reg: any) => {
          totalHours += reg.duration;
          // Zoek het bijbehorende tarief uit de opdrachten
          const assignment = assignmentsData.find(a => a.id === reg.assignmentId) as any;
          if (assignment && assignment.rate) {
            totalRevenue += (reg.duration * assignment.rate);
          }
        });

        setStats({
          totalHours,
          totalRevenue,
          activeAssignments: assignmentsData.length
        });

        // Pak de 5 meest recente activiteiten voor de lijst
        setRecentActivities(regsData.slice(0, 5).map(reg => {
            const assignment = assignmentsData.find(a => a.id === reg.assignmentId) as any;
            return { ...reg, assignmentTitle: assignment?.title || 'Onbekende opdracht' };
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
      <header>
        <h1 className="text-4xl font-black text-[#111827] tracking-tight uppercase">
          Welkom, 👋 <span className="text-pink-600">{auth.currentUser?.displayName || 'ZZP-er'}</span>
        </h1>
        <p className="text-gray-500 font-medium">Jouw persoonlijke uren en verdiensten</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-6">
          <div className="p-4 bg-blue-500 rounded-2xl text-white"><Clock size={32} /></div>
          <div>
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Totaal Uren</p>
            <p className="text-3xl font-black text-gray-900">{stats.totalHours.toFixed(1)}u</p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-6">
          <div className="p-4 bg-green-500 rounded-2xl text-white"><Euro size={32} /></div>
          <div>
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Totale Omzet</p>
            <p className="text-3xl font-black text-gray-900">€{stats.totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-6">
          <div className="p-4 bg-pink-600 rounded-2xl text-white"><Briefcase size={32} /></div>
          <div>
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Opdrachten</p>
            <p className="text-3xl font-black text-gray-900">{stats.activeAssignments}</p>
          </div>
        </div>
      </div>

      {/* Recente Activiteiten */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <h2 className="text-xl font-black uppercase tracking-tight text-gray-800">Recente Activiteiten</h2>
          <TrendingUp className="text-gray-300" />
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <tr>
              <th className="px-8 py-6">Datum</th>
              <th className="px-8 py-6">Opdracht</th>
              <th className="px-8 py-6 text-right">Uren</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {recentActivities.length > 0 ? recentActivities.map((act) => (
              <tr key={act.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-8 py-5 font-bold text-gray-700">{act.date}</td>
                <td className="px-8 py-5 font-medium text-pink-600">{act.assignmentTitle}</td>
                <td className="px-8 py-5 text-right font-black text-gray-900">{act.duration}u</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={3} className="px-8 py-10 text-center text-gray-400 font-bold uppercase">Nog geen activiteiten geregistreerd</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
