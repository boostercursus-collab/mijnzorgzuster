import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Clock, Euro, TrendingUp, Users, Target, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const [allActivities, setAllActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const monthOptions = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const date = subMonths(new Date(), i);
      return {
        label: format(date, 'MMMM yyyy', { locale: nl }),
        value: format(date, 'yyyy-MM')
      };
    });
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        const adminStatus = userData?.role === 'admin';
        setIsAdmin(adminStatus);

        const assignmentsRef = collection(db, 'assignments');
        const registrationsRef = collection(db, 'timeRegistrations');

        const assignmentsQuery = adminStatus 
          ? query(assignmentsRef) 
          : query(assignmentsRef, where('uid', '==', user.uid));

        const regsQuery = adminStatus
          ? query(registrationsRef, orderBy('date', 'desc'))
          : query(registrationsRef, where('uid', '==', user.uid), orderBy('date', 'desc'));

        const [assignmentsSnap, regsSnap] = await Promise.all([
          getDocs(assignmentsQuery),
          getDocs(regsQuery)
        ]);

        const assignmentsData = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const regsData = regsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const enriched = regsData.map(reg => {
          const assignment = assignmentsData.find(a => a.id === reg.assignmentId) as any;
          const lineTotal = (reg.duration || 0) * (assignment?.rate || 0);
          return { 
            ...reg, 
            assignmentTitle: assignment?.title || 'Onbekende opdracht',
            zzpName: assignment?.zzpName || 'ZZP-er',
            margin: lineTotal * 0.10,
            totalValue: lineTotal
          };
        });

        setAllActivities(enriched);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const filteredData = useMemo(() => {
    const start = startOfMonth(parseISO(`${selectedMonth}-01`));
    const end = endOfMonth(start);

    const filtered = allActivities.filter(act => {
      const actDate = parseISO(act.date);
      return isWithinInterval(actDate, { start, end });
    });

    let totalHours = 0;
    let totalRevenue = 0;
    filtered.forEach(act => {
      totalHours += act.duration;
      totalRevenue += isAdmin ? act.margin : act.totalValue;
    });

    const uniqueZzps = new Set(filtered.map(a => a.uid)).size;

    return { filtered, totalHours, totalRevenue, uniqueZzps };
  }, [allActivities, selectedMonth, isAdmin]);

  if (loading) return <div className="p-20 text-center font-black text-pink-600 animate-pulse uppercase tracking-widest text-sm">Dashboard laden...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tight uppercase">
            Dashboard <span className="text-pink-600">{isAdmin ? 'Admin' : 'ZZP'}</span>
          </h1>
          <p className="text-gray-500 font-medium">Overzicht van {monthOptions.find(m => m.value === selectedMonth)?.label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
            <Filter size={18} className="text-pink-600" />
            <select 
              className="bg-transparent font-black text-xs uppercase tracking-widest outline-none border-none cursor-pointer"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div className="bg-[#111827] text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Target size={16} className="text-pink-500" /> System Active
            </div>
          )}
        </div>
      </header>

      {/* Geoptimaliseerde Stats Grid (nu 2 of 3 kolommen afhankelijk van rol) */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-8`}>
        <StatCard icon={<Clock size={32}/>} color="bg-blue-500" label="Uren deze maand" value={`${filteredData.totalHours.toFixed(1)}u`} />
        <StatCard 
          icon={<Euro size={32}/>} 
          color="bg-green-500" 
          label={isAdmin ? "Commissie (10%)" : "Mijn Omzet"} 
          value={`€${filteredData.totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`} 
        />
        {isAdmin && <StatCard icon={<Users size={32}/>} color="bg-pink-600" label="Actieve ZZP-ers" value={filteredData.uniqueZzps.toString()} />}
      </div>

      {/* Tabel sectie blijft ongewijzigd */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
          <h2 className="text-xl font-black uppercase tracking-tight text-gray-800 flex items-center gap-3">
            <TrendingUp size={24} className="text-pink-600" />
            Activiteiten
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-6">Datum</th>
                <th className="px-8 py-6">Opdracht</th>
                {isAdmin && <th className="px-8 py-6">ZZP-er</th>}
                <th className="px-8 py-6 text-right">Uren</th>
                {isAdmin && <th className="px-8 py-6 text-right text-pink-600">Marge</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredData.filtered.length > 0 ? filteredData.filtered.map((act) => (
                <tr key={act.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-5 font-bold text-gray-700">{act.date}</td>
                  <td className="px-8 py-5 font-medium text-gray-900">{act.assignmentTitle}</td>
                  {isAdmin && <td className="px-8 py-5"><span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{act.zzpName}</span></td>}
                  <td className="px-8 py-5 text-right font-black text-gray-900">{act.duration}u</td>
                  {isAdmin && <td className="px-8 py-5 text-right font-black text-pink-600">€{act.margin.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>}
                </tr>
              )) : (
                <tr><td colSpan={isAdmin ? 5 : 3} className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-widest">Geen data voor deze maand</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, color, label, value }: any) => (
  <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-8 transition-all hover:shadow-md">
    <div className={`p-5 ${color} rounded-2xl text-white shadow-lg`}>{icon}</div>
    <div>
      <p className="text-xs font-black uppercase text-gray-400 tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-black text-gray-900 tracking-tight">{value}</p>
    </div>
  </div>
);

export default Dashboard;
