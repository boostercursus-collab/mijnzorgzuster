import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client, UserProfile } from '../types';
import { Clock, CheckCircle2, AlertCircle, Briefcase, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    pendingHours: 0,
    approvedHours: 0,
    totalHoursMonth: 0,
    activeAssignmentsCount: 0
  });
  const [recentRegistrations, setRecentRegistrations] = useState<(TimeRegistration & { zzpName?: string; clientName?: string; assignmentTitle?: string })[]>([]);
  const [activeAssignments, setActiveAssignments] = useState<(Assignment & { clientName?: string; zzpName?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!profile?.uid) return;

      try {
        setLoading(true);

        // 1. Haal alle basisdata op die we nodig hebben voor mapping (Users & Clients)
        const [usersSnap, clientsSnap, allAssignmentsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'clients')),
          getDocs(collection(db, 'assignments'))
        ]);

        const usersMap: { [key: string]: string } = {};
        usersSnap.docs.forEach(doc => {
          const data = doc.data();
          usersMap[doc.id] = data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email;
        });

        const clientsMap: { [key: string]: string } = {};
        clientsSnap.docs.forEach(doc => {
          clientsMap[doc.id] = (doc.data() as Client).name;
        });

        const allAssignments = allAssignmentsSnap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as Assignment));

        // 2. Haal urenregistraties op (Gefilterd op rol)
        const regsRef = collection(db, 'timeRegistrations');
        let regsQuery;
        
        if (profile.role === 'admin') {
          regsQuery = query(regsRef, orderBy('submittedAt', 'desc'), limit(10));
        } else {
          // De cruciale fix: filteren op de exacte UID van de ingelogde ZZP'er
          regsQuery = query(regsRef, where('zzpId', '==', profile.uid), limit(10));
        }

        const regsSnapshot = await getDocs(regsQuery);
        const regs = regsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration));

        // Map namen aan de registraties
        const regsWithNames = regs.map(r => {
          const assignment = allAssignments.find(a => a.id === r.assignmentId);
          return {
            ...r,
            zzpName: usersMap[r.zzpId] || 'Onbekende ZZP\'er',
            clientName: assignment ? (clientsMap[assignment.clientId] || 'Onbekende Klant') : 'Onbekende Klant',
            assignmentTitle: assignment?.title || 'Verwijderde Opdracht'
          };
        });
        setRecentRegistrations(regsWithNames);

        // 3. Bereken Statistieken
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        // Voor stats hebben we alle uren van deze user (of alles voor admin) nodig
        let statsRegs = regs; 
        if (profile.role === 'admin') {
            const allRegsSnap = await getDocs(collection(db, 'timeRegistrations'));
            statsRegs = allRegsSnap.docs.map(d => d.data() as TimeRegistration);
        } else {
            // Voor de zekerheid alle uren van deze ZZP'er ophalen voor de stats (niet alleen de laatste 10)
            const allMyRegsSnap = await getDocs(query(regsRef, where('zzpId', '==', profile.uid)));
            statsRegs = allMyRegsSnap.docs.map(d => d.data() as TimeRegistration);
        }

        const pendingHours = statsRegs.filter(r => r.status === 'submitted').reduce((acc, r) => acc + r.totalHours, 0);
        const approvedHours = statsRegs.filter(r => r.status === 'approved').reduce((acc, r) => acc + r.totalHours, 0);
        const totalHoursMonth = statsRegs
          .filter(r => {
            const regDate = new Date(r.date);
            return isWithinInterval(regDate, { start: monthStart, end: monthEnd });
          })
          .reduce((acc, r) => acc + r.totalHours, 0);

        // 4. Filter Actieve Opdrachten (Cruciaal voor de ZZP'er weergave)
        const filteredAssignments = profile.role === 'admin'
          ? allAssignments
          : allAssignments.filter(a => a.zzpId === profile.uid);

        const assignmentsWithNames = filteredAssignments.map(a => ({
          ...a,
          clientName: clientsMap[a.clientId] || 'Onbekende Klant',
          zzpName: usersMap[a.zzpId] || 'Niet toegewezen'
        }));

        setActiveAssignments(assignmentsWithNames);
        setStats({
          pendingHours,
          approvedHours,
          totalHoursMonth,
          activeAssignmentsCount: assignmentsWithNames.length
        });

      } catch (error) {
        console.error('Fout bij laden dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [profile]);

  if (loading) return (
    <div className="flex h-64 flex-col items-center justify-center space-y-4">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-600 border-t-transparent"></div>
      <p className="text-pink-600 font-medium">Dashboard wordt voorbereid...</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Welkom, {profile?.firstName} 👋
          </h1>
          <p className="text-gray-500 mt-1">
            Dit is je overzicht voor <span className="font-semibold text-gray-700">{format(new Date(), 'MMMM yyyy', { locale: nl })}</span>
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-lg border shadow-sm flex items-center space-x-2">
           <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
           <span className="text-sm font-medium text-gray-600 capitalize">{profile?.role} Account</span>
        </div>
      </header>

      {/* Statistieken kaarten */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Wachtend op goedkeuring" value={`${stats.pendingHours.toFixed(1)}`} unit="uur" icon={Clock} color="text-amber-600" bgColor="bg-amber-50" />
        <StatCard title="Totaal Goedgekeurd" value={`${stats.approvedHours.toFixed(1)}`} unit="uur" icon={CheckCircle2} color="text-emerald-600" bgColor="bg-emerald-50" />
        <StatCard title="Gewerkt deze maand" value={`${stats.totalHoursMonth.toFixed(1)}`} unit="uur" icon={TrendingUp} color="text-pink-600" bgColor="bg-pink-50" />
        <StatCard title="Lopende Opdrachten" value={stats.activeAssignmentsCount} unit="stuks" icon={Briefcase} color="text-blue-600" bgColor="bg-blue-50" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Sectie: Actieve Opdrachten */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-pink-600" />
              Mijn Opdrachten
            </h2>
          </div>
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {activeAssignments.length > 0 ? activeAssignments.map((a) => (
              <div key={a.id} className="p-5 hover:bg-pink-50/30 transition-colors group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900 group-hover:text-pink-700 transition-colors">{a.title}</p>
                    <p className="text-sm text-gray-500 flex items-center mt-1">
                      <span className="font-medium text-gray-700">{a.clientName}</span>
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded">Actief</span>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center">
                <p className="text-gray-400 italic">Geen actieve opdrachten gekoppeld aan jouw account.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sectie: Recente Urenregistraties */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-50 bg-gray-50/50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Clock className="h-5 w-5 text-pink-600" />
              Laatste Registraties
            </h2>
          </div>
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {recentRegistrations.length > 0 ? recentRegistrations.map((reg) => (
              <div key={reg.id} className="p-5 flex justify-between items-center hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-lg ${reg.status === 'approved' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                    {reg.status === 'approved' ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{format(new Date(reg.date), 'eeee d MMM', { locale: nl })}</p>
                    <p className="text-xs text-gray-500">{reg.assignmentTitle} • {reg.totalHours} uur</p>
                  </div>
                </div>
                <div className="text-right">
                   <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                     reg.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                   }`}>
                     {reg.status}
                   </span>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center text-gray-400 italic">Nog geen uren ingediend.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-component voor Stats
const StatCard = ({ title, value, unit, icon: Icon, color, bgColor }: any) => (
  <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className={`rounded-xl p-3 ${bgColor} ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
    <div className="mt-4">
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{title}</p>
      <div className="flex items-baseline space-x-1">
        <p className="text-3xl font-black text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-400">{unit}</p>
      </div>
    </div>
  </div>
);

export default Dashboard;
