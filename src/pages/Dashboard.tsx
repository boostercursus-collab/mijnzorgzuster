import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client } from '../types';
import { Clock, CheckCircle2, Briefcase, TrendingUp } from 'lucide-react';
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

        // 1. Basisdata ophalen (Users & Clients)
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

        // 2. Registraties ophalen (Gefilterd op rol met UID)
        const regsRef = collection(db, 'timeRegistrations');
        let regsQuery;
        
        if (profile.role === 'admin') {
          // Voor admin: Sorteer op datum van de registratie zelf
          regsQuery = query(regsRef, orderBy('date', 'desc'), limit(10));
        } else {
          // AANGEPAST: zzpId -> uid
          regsQuery = query(regsRef, where('uid', '==', profile.uid), limit(10));
        }

        const regsSnapshot = await getDocs(regsQuery);
        const regs = regsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration));

        // Map namen aan de registraties
        const regsWithNames = regs.map(r => {
          const assignment = allAssignments.find(a => a.id === r.assignmentId);
          return {
            ...r,
            zzpName: usersMap[r.uid] || 'Onbekende ZZP\'er', // AANGEPAST: r.zzpId -> r.uid
            clientName: assignment ? (clientsMap[assignment.clientId] || 'Onbekende Klant') : 'Onbekende Klant',
            assignmentTitle: assignment?.title || 'Verwijderde Opdracht'
          };
        });
        setRecentRegistrations(regsWithNames);

        // 3. Bereken Statistieken
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        let statsRegs = regs; 
        if (profile.role === 'admin') {
            const allRegsSnap = await getDocs(collection(db, 'timeRegistrations'));
            statsRegs = allRegsSnap.docs.map(d => d.data() as TimeRegistration);
        } else {
            // AANGEPAST: zzpId -> uid
            const allMyRegsSnap = await getDocs(query(regsRef, where('uid', '==', profile.uid)));
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

        // 4. Filter Actieve Opdrachten
        const filteredAssignments = profile.role === 'admin'
          ? allAssignments
          : allAssignments.filter(a => a.uid === profile.uid); // AANGEPAST: a.zzpId -> a.uid

        const assignmentsWithNames = filteredAssignments.map(a => ({
          ...a,
          clientName: clientsMap[a.clientId] || 'Onbekende Klant',
          zzpName: usersMap[a.uid] || 'Niet toegewezen' // AANGEPAST: a.zzpId -> a.uid
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
      <p className="text-pink-600 font-bold">Laden...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Welkom, {profile?.firstName} 👋
          </h1>
          <p className="text-gray-500 mt-1">
            Overzicht voor <span className="font-bold text-pink-600">{format(new Date(), 'MMMM yyyy', { locale: nl })}</span>
          </p>
        </div>
        <div className="bg-white border rounded-2xl px-4 py-2 shadow-sm flex items-center space-x-3">
           <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
           <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{profile?.role} Account</span>
        </div>
      </header>

      {/* Statistieken */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Wachtend" value={`${stats.pendingHours.toFixed(1)}`} unit="uur" icon={Clock} color="text-amber-600" bgColor="bg-amber-50" />
        <StatCard title="Goedgekeurd" value={`${stats.approvedHours.toFixed(1)}`} unit="uur" icon={CheckCircle2} color="text-emerald-600" bgColor="bg-emerald-50" />
        <StatCard title="Deze maand" value={`${stats.totalHoursMonth.toFixed(1)}`} unit="uur" icon={TrendingUp} color="text-pink-600" bgColor="bg-pink-50" />
        <StatCard title="Opdrachten" value={stats.activeAssignmentsCount} unit="actief" icon={Briefcase} color="text-blue-600" bgColor="bg-blue-50" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Sectie: Actieve Opdrachten */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h2 className="font-black text-gray-900 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-pink-600" />
              Lopende Projecten
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {activeAssignments.length > 0 ? activeAssignments.map((a) => (
              <div key={a.id} className="p-6 hover:bg-pink-50/20 transition-colors">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-900">{a.title}</p>
                    <p className="text-sm text-gray-400 font-medium">{a.clientName}</p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-[10px] font-black uppercase rounded-full tracking-widest">Actief</span>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center text-gray-400 italic">Geen opdrachten gekoppeld.</div>
            )}
          </div>
        </div>

        {/* Sectie: Recente Urenregistraties */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50">
            <h2 className="font-black text-gray-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-pink-600" />
              Recente Activiteit
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentRegistrations.length > 0 ? recentRegistrations.map((reg) => (
              <div key={reg.id} className="p-6 flex justify-between items-center hover:bg-gray-50/50">
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-xl ${reg.status === 'approved' ? 'bg-green-100 text-green-600' : 'bg-pink-100 text-pink-600'}`}>
                    {reg.status === 'approved' ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{format(new Date(reg.date), 'd MMM', { locale: nl })}</p>
                    <p className="text-xs text-gray-400 font-medium">{reg.assignmentTitle} • {reg.totalHours}u</p>
                  </div>
                </div>
                <StatusLabel status={reg.status} />
              </div>
            )) : (
              <div className="p-12 text-center text-gray-400 italic">Nog geen uren geregistreerd.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusLabel = ({ status }: { status: string }) => {
  const styles: any = {
    approved: "bg-green-100 text-green-700",
    submitted: "bg-blue-100 text-blue-700",
    draft: "bg-gray-100 text-gray-600",
    rejected: "bg-red-100 text-red-700"
  };
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${styles[status] || styles.draft}`}>
      {status}
    </span>
  );
};

const StatCard = ({ title, value, unit, icon: Icon, color, bgColor }: any) => (
  <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-pink-500/5 transition-all group">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${bgColor} ${color}`}>
      <Icon className="h-6 w-6" />
    </div>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{title}</p>
    <div className="flex items-baseline space-x-1">
      <p className="text-3xl font-black text-gray-900 tracking-tight">{value}</p>
      <p className="text-sm font-bold text-gray-400">{unit}</p>
    </div>
  </div>
);

export default Dashboard;
