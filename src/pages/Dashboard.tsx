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

        if (profile.role === 'admin') {
          regsQuery = query(regsRef, orderBy('submittedAt', 'desc'), limit(5));
        } else {
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

        // Fetch all assignments to get titles and client IDs for recent registrations
        const assignmentsRef = collection(db, 'assignments');
        const assignmentsSnapshot = await getDocs(assignmentsRef);
        const allAssignmentsData = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as any as Assignment));

        // Fetch all clients to get names
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

        // Simple stats (in a real app, you'd use aggregation or more queries)
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

        // Filter active assignments for the current user/admin
        const assignmentsData = profile.role === 'admin'
          ? allAssignmentsData
          : allAssignmentsData.filter(a => a.zzpId === profile.uid);

        const assignmentsWithNames = assignmentsData.map(a => ({
          ...a,
          clientName: clientsMap[a.clientId] || 'Onbekende Opdrachtgever',
          zzpName: usersMap[a.zzpId] || 'Onbekende ZZP\'er'
        }));

        setActiveAssignments(assignmentsWithNames);

        // Calculate margins for admin
        if (profile.role === 'admin') {
          const marginsMap: { [key: string]: { total: number; zzp: number; client: number; clientName: string; zzpName: string; totalHours: number; hourlyRate: number } } = {};
          
          allRegs.forEach(reg => {
            const assignment = allAssignmentsData.find(a => a.id === reg.assignmentId);
            if (assignment) {
              const clientName = clientsMap[assignment.clientId] || 'Onbekende Opdrachtgever';
              const zzpName = usersMap[reg.zzpId] || 'Onbekende ZZP\'er';
              const hourlyRate = assignment.hourlyRate || 0;
              const totalRevenue = reg.totalHours * hourlyRate;
              const zzpMargin = totalRevenue * 0.05;
              const clientMargin = totalRevenue * 0.05;
              const totalMargin = zzpMargin + clientMargin;
              
              const key = `${assignment.clientId}_${reg.zzpId}`;
              
              if (!marginsMap[key]) {
                marginsMap[key] = { total: 0, zzp: 0, client: 0, clientName, zzpName, totalHours: 0, hourlyRate };
              }
              
              marginsMap[key].total += totalMargin;
              marginsMap[key].zzp += zzpMargin;
              marginsMap[key].client += clientMargin;
              marginsMap[key].totalHours += reg.totalHours;
            }
          });

          const marginsArray = Object.values(marginsMap).map(data => ({
            clientName: data.clientName,
            zzpName: data.zzpName,
            totalMargin: data.total,
            zzpMargin: data.zzp,
            clientMargin: data.client,
            totalHours: data.totalHours,
            hourlyRate: data.hourlyRate
          }));
          
          setClientMargins(marginsArray);
        }

        setStats({
          pendingHours,
          approvedHours,
          totalHoursMonth,
          activeAssignmentsCount: assignmentsWithNames.length
        });

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [profile]);

  if (loading) return <div>Laden...</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          Welkom terug, {profile?.firstName}!
        </h1>
        <p className="text-gray-600">
          Hier is een overzicht van uw {profile?.role === 'admin' ? 'beheer' : 'uren'}.
        </p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Wachtend op goedkeuring" 
          value={`${stats.pendingHours.toFixed(1)} u`} 
          icon={Clock} 
          color="text-orange-600" 
          bgColor="bg-orange-100" 
        />
        <StatCard 
          title="Goedgekeurde uren" 
          value={`${stats.approvedHours.toFixed(1)} u`} 
          icon={CheckCircle2} 
          color="text-green-600" 
          bgColor="bg-green-100" 
        />
        <StatCard 
          title="Totaal uren (deze maand)" 
          value={`${stats.totalHoursMonth.toFixed(1)} u`} 
          icon={Clock} 
          color="text-pink-600" 
          bgColor="bg-pink-100" 
        />
        <StatCard 
          title="Actieve opdrachten" 
          value={stats.activeAssignmentsCount} 
          icon={Briefcase} 
          color="text-blue-600" 
          bgColor="bg-blue-100" 
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Active Assignments */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b p-4">
            <h2 className="font-semibold text-gray-900">Actieve Opdrachten</h2>
          </div>
          <div className="divide-y">
            {activeAssignments.length > 0 ? (
              activeAssignments.map((assignment) => (
                <div key={assignment.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{assignment.title}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 text-sm text-gray-500">
                        <span>{assignment.clientName}</span>
                        {profile?.role === 'admin' && (
                          <>
                            <span className="hidden sm:inline">•</span>
                            <span className="font-medium text-blue-600">{assignment.zzpName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Startdatum</p>
                      <p className="text-sm text-gray-600">{format(new Date(assignment.startDate), 'd MMM yyyy', { locale: nl })}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                Geen actieve opdrachten gevonden.
              </div>
            )}
          </div>
        </div>

        {/* Admin Margin Overview */}
        {profile?.role === 'admin' && (
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="border-b p-4">
              <h2 className="font-semibold text-gray-900">Bemiddelingsfee per ZZP & Opdrachtgever (10%)</h2>
            </div>
            <div className="divide-y">
              {clientMargins.length > 0 ? (
                clientMargins.map((item, idx) => (
                  <div key={idx} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{item.zzpName}</p>
                        <p className="text-sm text-gray-500">{item.clientName}</p>
                        <p className="text-xs font-medium text-blue-600 mt-0.5">Tarief: € {item.hourlyRate.toFixed(2)}/u</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-pink-600">
                          € {item.totalMargin.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm font-semibold text-gray-600">
                          {item.totalHours.toFixed(1)} uur
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="rounded-lg bg-gray-50 p-2">
                        <p className="text-gray-500 text-xs uppercase font-semibold">ZZP Deel (5%)</p>
                        <p className="font-medium text-gray-900">
                          € {item.zzpMargin.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2">
                        <p className="text-gray-500 text-xs uppercase font-semibold">Client Deel (5%)</p>
                        <p className="font-medium text-gray-900">
                          € {item.clientMargin.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">
                  Geen margegegevens beschikbaar.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b p-4">
            <h2 className="font-semibold text-gray-900">Recente urenregistraties</h2>
          </div>
          <div className="divide-y">
            {recentRegistrations.length > 0 ? (
              recentRegistrations.map((reg) => (
              <div key={reg.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className={cn(
                    "rounded-full p-2",
                    reg.status === 'approved' ? "bg-green-100 text-green-600" :
                    reg.status === 'rejected' ? "bg-red-100 text-red-600" :
                    reg.status === 'submitted' ? "bg-blue-100 text-blue-600" :
                    "bg-gray-100 text-gray-600"
                  )}>
                    {reg.status === 'approved' ? <CheckCircle2 className="h-5 w-5" /> :
                     reg.status === 'rejected' ? <AlertCircle className="h-5 w-5" /> :
                     <Clock className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {format(new Date(reg.date), 'EEEE d MMMM', { locale: nl })}
                    </p>
                    <div className="text-sm text-gray-500">
                      <p>{reg.startTime} - {reg.endTime} ({reg.totalHours} uur)</p>
                      {profile?.role === 'admin' && (
                        <p className="mt-0.5">
                          <span className="font-medium text-blue-600">{reg.zzpName}</span>
                          <span className="mx-1 text-gray-300">|</span>
                          <span className="text-gray-400 italic">{reg.clientName}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                    reg.status === 'approved' ? "bg-green-100 text-green-800" :
                    reg.status === 'rejected' ? "bg-red-100 text-red-800" :
                    reg.status === 'submitted' ? "bg-blue-100 text-blue-800" :
                    "bg-gray-100 text-gray-800"
                  )}>
                    {reg.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">
              Geen recente activiteit gevonden.
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
};

const StatCard = ({ title, value, icon: Icon, color, bgColor }: any) => (
  <div className="rounded-xl border bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <div className={cn("rounded-lg p-3", bgColor, color)}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

export default Dashboard;
