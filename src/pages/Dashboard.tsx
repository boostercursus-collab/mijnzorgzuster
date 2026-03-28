import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client } from '../types';
import { Clock, CheckCircle2, AlertCircle, Briefcase } from 'lucide-react';
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
  const [clientMargins, setClientMargins] = useState<{ clientName: string; zzpName: string; totalMargin: number; zzpMargin: number; clientMargin: number; totalHours: number; hourlyRate: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!profile) return;

      try {
        const regsRef = collection(db, 'timeRegistrations');
        let regsQuery;

        // AANPASSING: Gebruik zzpId voor de filter
        if (profile.role === 'admin') {
          regsQuery = query(regsRef, orderBy('submittedAt', 'desc'), limit(5));
        } else {
          // Voor ZZP'ers: filter op zzpId om te voldoen aan de Security Rules
          regsQuery = query(regsRef, where('zzpId', '==', profile.uid), orderBy('date', 'desc'), limit(5));
        }

        const regsSnapshot = await getDocs(regsQuery);
        const regs = regsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as any as TimeRegistration));

        // Fetch all users to get names
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        const usersMap: { [key: string]: string } = {};
        usersSnapshot.docs.forEach(doc => {
          const userData = doc.data();
          usersMap[doc.id] = `${userData.firstName} ${userData.lastName}`;
        });

        // Fetch assignments & clients
        const assignmentsRef = collection(db, 'assignments');
        const assignmentsSnapshot = await getDocs(assignmentsRef);
        const allAssignmentsData = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as any as Assignment));

        const clientsRef = collection(db, 'clients');
        const clientsSnapshot = await getDocs(clientsRef);
        const clientsMap: { [key: string]: string } = {};
        clientsSnapshot.docs.forEach(doc => {
          clientsMap[doc.id] = (doc.data() as Client).name;
        });

        const regsWithNames = regs.map(r => {
          const assignment = allAssignmentsData.find(a => a.id === r.assignmentId);
          return {
            ...r,
            zzpName: usersMap[r.zzpId] || 'Onbekende ZZP\'er',
            clientName: assignment ? (clientsMap[assignment.clientId] || 'Onbekende Opdrachtgever') : 'Onbekende Opdrachtgever',
            assignmentTitle: assignment?.title || 'Onbekende Opdracht'
          };
        });
        setRecentRegistrations(regsWithNames);

        // AANPASSING: Statistieken ophalen met de juiste filter
        const allRegsQuery = profile.role === 'admin' 
          ? query(regsRef)
          : query(regsRef, where('zzpId', '==', profile.uid));
        
        const allRegsSnapshot = await getDocs(allRegsQuery);
        const allRegs = allRegsSnapshot.docs.map(doc => doc.data() as TimeRegistration);

        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        const pendingHours = allRegs.filter(r => r.status === 'submitted').reduce((acc, r) => acc + r.totalHours, 0);
        const approvedHours = allRegs.filter(r => r.status === 'approved').reduce((acc, r) => acc + r.totalHours, 0);
        
        const totalHoursMonth = allRegs
          .filter(r => {
            const regDate = new Date(r.date);
            return isWithinInterval(regDate, { start: monthStart, end: monthEnd });
          })
          .reduce((acc, r) => acc + r.totalHours, 0);

        // Filter actieve opdrachten
        const assignmentsData = profile.role === 'admin'
          ? allAssignmentsData
          : allAssignmentsData.filter(a => a.zzpId === profile.uid);

        const assignmentsWithNames = assignmentsData.map(a => ({
          ...a,
          clientName: clientsMap[a.clientId] || 'Onbekende Opdrachtgever',
          zzpName: usersMap[a.zzpId] || 'Onbekende ZZP\'er'
        }));

        setActiveAssignments(assignmentsWithNames);

        // Admin Marge berekening (alleen voor admin)
        if (profile.role === 'admin') {
          const marginsMap: { [key: string]: any } = {};
          allRegs.forEach(reg => {
            const assignment = allAssignmentsData.find(a => a.id === reg.assignmentId);
            if (assignment) {
              const clientName = clientsMap[assignment.clientId] || 'Onbekende';
              const zzpName = usersMap[reg.zzpId] || 'Onbekende';
              const totalRevenue = reg.totalHours * (assignment.hourlyRate || 0);
              const margin = totalRevenue * 0.10; // 10% totaal
              
              const key = `${assignment.clientId}_${reg.zzpId}`;
              if (!marginsMap[key]) {
                marginsMap[key] = { total: 0, zzp: 0, client: 0, clientName, zzpName, totalHours: 0, hourlyRate: assignment.hourlyRate };
              }
              marginsMap[key].total += margin;
              marginsMap[key].zzp += margin / 2;
              marginsMap[key].client += margin / 2;
              marginsMap[key].totalHours += reg.totalHours;
            }
          });
          setClientMargins(Object.values(marginsMap));
        }

        setStats({
          pendingHours,
          approvedHours,
          totalHoursMonth,
          activeAssignmentsCount: assignmentsWithNames.length
        });

      } catch (error) {
        console.error('Error dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [profile]);

  if (loading) return <div className="p-8 text-center text-pink-600 font-bold">Gegevens laden...</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Welkom terug, {profile?.firstName}!</h1>
        <p className="text-gray-600">Overzicht van uw {profile?.role === 'admin' ? 'beheer-omgeving' : 'urenregistratie'}.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Wachtend" value={`${stats.pendingHours.toFixed(1)} u`} icon={Clock} color="text-orange-600" bgColor="bg-orange-100" />
        <StatCard title="Goedgekeurd" value={`${stats.approvedHours.toFixed(1)} u`} icon={CheckCircle2} color="text-green-600" bgColor="bg-green-100" />
        <StatCard title="Deze maand" value={`${stats.totalHoursMonth.toFixed(1)} u`} icon={Clock} color="text-pink-600" bgColor="bg-pink-100" />
        <StatCard title="Opdrachten" value={stats.activeAssignmentsCount} icon={Briefcase} color="text-blue-600" bgColor="bg-blue-100" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Links: Opdrachten */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b p-4"><h2 className="font-semibold text-gray-900">Actieve Opdrachten</h2></div>
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {activeAssignments.length > 0 ? activeAssignments.map((a) => (
              <div key={a.id} className="p-4 hover:bg-gray-50 transition-colors">
                <p className="font-medium text-gray-900">{a.title}</p>
                <p className="text-sm text-gray-500">{a.clientName}</p>
              </div>
            )) : <div className="p-8 text-center text-gray-400">Geen opdrachten.</div>}
          </div>
        </div>

        {/* Rechts: Recente Activiteit */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b p-4"><h2 className="font-semibold text-gray-900">Recente uren</h2></div>
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {recentRegistrations.length > 0 ? recentRegistrations.map((reg) => (
              <div key={reg.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900">{format(new Date(reg.date), 'd MMM yyyy', { locale: nl })}</p>
                  <p className="text-sm text-gray-500">{reg.totalHours} uur - <span className="capitalize">{reg.status}</span></p>
                </div>
                <div className={cn("h-3 w-3 rounded-full", reg.status === 'approved' ? 'bg-green-500' : 'bg-orange-500')} />
              </div>
            )) : <div className="p-8 text-center text-gray-400">Geen registraties.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper components
const StatCard = ({ title, value, icon: Icon, color, bgColor }: any) => (
  <div className="rounded-xl border bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between">
      <div><p className="text-sm font-medium text-gray-600">{title}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>
      <div className={cn("rounded-lg p-3", bgColor, color)}><Icon className="h-6 w-6" /></div>
    </div>
  </div>
);

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(' '); }

export default Dashboard;
